import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  branch,
  competition,
  membership,
  person,
  season,
  staffRole,
  team,
  teamMember,
  teamStaff,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  ageOn,
  checkPlacement,
  classifyPlacement,
  kuFor,
  kuLabel,
  proposePromotions,
  type NewSeasonSchema,
  type Placement,
  type PromotionApplySchema,
  type PromotionPreview,
  type PromotionRow,
  type TeamCandidate,
  type TeamDetail,
  type TeamInputSchema,
  type TeamSummary,
} from '@sportgather/shared';
import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { loadKuContext } from '../seasons/ku-context.js';

type Meta = { ip: string; userAgent: string | null };
const GENDER_TEAM_LABEL = { male: 'Putra', female: 'Putri', mixed: 'Campuran' } as const;

@Injectable()
export class TeamsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** A-09: tim musim aktif (atau musim tertentu). */
  list(
    ctx: OrgContext,
    user: AuthUser,
    seasonId?: string,
  ): Promise<{
    season: { id: string; name: string; referenceDate: string; referenceSource: string } | null;
    teams: TeamSummary[];
  }> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const kc = await loadKuContext(tx, seasonId);
      if (!kc.season) return { season: null, teams: [] };
      const teams = await this.summaries(tx, kc.season.id);
      return {
        season: {
          id: kc.season.id,
          name: kc.season.name,
          referenceDate: kc.referenceDate,
          referenceSource: kc.referenceSource,
        },
        teams,
      };
    });
  }

  async create(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof TeamInputSchema>,
    meta: Meta,
  ): Promise<TeamSummary> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const kc = await loadKuContext(tx);
      if (!kc.season)
        throw new UnprocessableEntityException(
          'Buat musim aktif terlebih dahulu (Pengaturan › Musim & kompetisi)',
        );
      if (!kc.config.groups.includes(input.ku)) {
        throw new UnprocessableEntityException(
          `KU${input.ku} tidak ada di kelompok musim ini (${kc.config.groups.map((g) => `KU${g}`).join(', ')})`,
        );
      }
      const id = await this.insertTeam(tx, ctx.id, kc.season.id, input);
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'team.created',
        entityType: 'team',
        entityId: id,
        meta: { ku: input.ku, level: input.level },
        ...meta,
      });
      return (await this.summaries(tx, kc.season.id, id))[0]!;
    });
  }

  async update(
    ctx: OrgContext,
    user: AuthUser,
    teamId: string,
    input: z.output<typeof TeamInputSchema>,
    meta: Meta,
  ): Promise<TeamSummary> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.mustTeam(tx, teamId);
      if (input.ku !== t.ku) {
        const [members] = await tx
          .select({ n: count() })
          .from(teamMember)
          .where(and(eq(teamMember.teamId, teamId), isNull(teamMember.leftAt)));
        if ((members?.n ?? 0) > 0)
          throw new ConflictException('KU tim tidak bisa diubah selama masih ada pemain');
      }
      await tx
        .update(team)
        .set({
          ku: input.ku,
          level: input.level,
          gender: input.gender,
          branchId: input.branchId ?? null,
          name: input.name || defaultTeamName(input),
        })
        .where(eq(team.id, teamId));
      await this.setStaffTx(tx, ctx.id, teamId, input.staffRoleIds);
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'team.updated',
        entityType: 'team',
        entityId: teamId,
        ...meta,
      });
      return (await this.summaries(tx, t.seasonId, teamId))[0]!;
    });
  }

  async archive(ctx: OrgContext, user: AuthUser, teamId: string, meta: Meta): Promise<void> {
    await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      await this.mustTeam(tx, teamId);
      const [members] = await tx
        .select({ n: count() })
        .from(teamMember)
        .where(and(eq(teamMember.teamId, teamId), isNull(teamMember.leftAt)));
      if ((members?.n ?? 0) > 0)
        throw new ConflictException('Pindahkan semua pemain sebelum menghapus tim');
      await tx.update(team).set({ archivedAt: new Date() }).where(eq(team.id, teamId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'team.archived',
        entityType: 'team',
        entityId: teamId,
        ...meta,
      });
    });
  }

  /** A-10: anggota tim dengan usia pada tanggal acuan, KU asli, dan status penempatan. */
  detail(ctx: OrgContext, user: AuthUser, teamId: string): Promise<TeamDetail> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.mustTeam(tx, teamId);
      const kc = await loadKuContext(tx, t.seasonId);
      const [summary] = await this.summaries(tx, t.seasonId, teamId);
      const rows = await tx
        .select({
          id: teamMember.id,
          membershipId: teamMember.membershipId,
          fullName: person.fullName,
          birthDate: person.birthDate,
          jerseyNumber: teamMember.jerseyNumber,
          placement: teamMember.placement,
          placementReason: teamMember.placementReason,
          membershipStatus: membership.status,
          statusReason: membership.statusReason,
        })
        .from(teamMember)
        .innerJoin(membership, eq(membership.id, teamMember.membershipId))
        .innerJoin(person, eq(person.id, membership.personId))
        .where(and(eq(teamMember.teamId, teamId), isNull(teamMember.leftAt)))
        .orderBy(asc(teamMember.jerseyNumber), asc(person.fullName));
      return {
        ...summary!,
        seasonName: kc.season!.name,
        referenceDate: kc.referenceDate,
        members: rows.map((r) => {
          const actualKu = r.birthDate ? kuFor(r.birthDate, kc.referenceDate, kc.config) : null;
          return {
            id: r.id,
            membershipId: r.membershipId,
            fullName: r.fullName,
            jerseyNumber: r.jerseyNumber,
            age: r.birthDate ? ageOn(r.birthDate, kc.referenceDate) : null,
            actualKu,
            // Klasifikasi dihitung ulang dari acuan saat ini (tanggal acuan bisa berubah).
            placement: r.birthDate ? classifyPlacement(actualKu, t.ku) : r.placement,
            placementReason: r.placementReason,
            membershipStatus: r.membershipStatus,
            statusReason: r.statusReason,
          };
        }),
      };
    });
  }

  /** "Sistem hanya menawarkan pemain dengan KU sesuai" — KU sama di atas, play-up di bawahnya. */
  candidates(ctx: OrgContext, user: AuthUser, teamId: string): Promise<TeamCandidate[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.mustTeam(tx, teamId);
      const kc = await loadKuContext(tx, t.seasonId);
      const rows = await tx
        .select({
          membershipId: membership.id,
          fullName: person.fullName,
          birthDate: person.birthDate,
          gender: person.gender,
        })
        .from(membership)
        .innerJoin(person, eq(person.id, membership.personId))
        .where(inArray(membership.status, ['active', 'on_leave']));
      const current = await tx
        .select({
          membershipId: teamMember.membershipId,
          teamId: teamMember.teamId,
          teamName: team.name,
        })
        .from(teamMember)
        .innerJoin(team, eq(team.id, teamMember.teamId))
        .where(and(eq(teamMember.seasonId, t.seasonId), isNull(teamMember.leftAt)));
      const byMember = new Map(current.map((c) => [c.membershipId, c]));
      const order: Record<Placement, number> = { same: 0, play_up: 1, play_down: 2, over_age: 3 };
      return rows
        .filter((r) => r.birthDate && byMember.get(r.membershipId)?.teamId !== teamId)
        .filter((r) => t.gender === 'mixed' || !r.gender || r.gender === t.gender)
        .map((r) => {
          const ku = kuFor(r.birthDate!, kc.referenceDate, kc.config);
          return {
            membershipId: r.membershipId,
            fullName: r.fullName,
            ku,
            placement: classifyPlacement(ku, t.ku),
            currentTeam: byMember.get(r.membershipId)?.teamName ?? null,
          };
        })
        .sort(
          (a, b) => order[a.placement] - order[b.placement] || a.fullName.localeCompare(b.fullName),
        );
    });
  }

  async addMember(
    ctx: OrgContext,
    user: AuthUser,
    teamId: string,
    input: {
      membershipId: string;
      jerseyNumber?: number | null | undefined;
      reason?: string | undefined;
    },
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, (tx) =>
      this.place(tx, ctx, user, teamId, input, meta),
    );
  }

  /**
   * Penempatan pemain (US-06, KU-02). Dipakai juga saat menerima pendaftar (A-08) dan
   * kenaikan KU (A-11). Play-up wajib alasan; play-down & lewat usia hanya owner + alasan.
   */
  async place(
    tx: Tx,
    ctx: OrgContext,
    user: AuthUser,
    teamId: string,
    input: {
      membershipId: string;
      jerseyNumber?: number | null | undefined;
      reason?: string | undefined;
    },
    meta: Meta,
  ) {
    const t = await this.mustTeam(tx, teamId);
    const kc = await loadKuContext(tx, t.seasonId);
    const [m] = await tx
      .select({
        id: membership.id,
        status: membership.status,
        birthDate: person.birthDate,
        gender: person.gender,
        fullName: person.fullName,
      })
      .from(membership)
      .innerJoin(person, eq(person.id, membership.personId))
      .where(eq(membership.id, input.membershipId));
    if (!m) throw new NotFoundException('Pemain tidak ditemukan');
    if (m.status !== 'active' && m.status !== 'on_leave')
      throw new UnprocessableEntityException('Pemain belum aktif (masih menunggu verifikasi)');
    if (!m.birthDate) throw new UnprocessableEntityException('Tanggal lahir pemain belum diisi');
    if (t.gender !== 'mixed' && m.gender && m.gender !== t.gender) {
      throw new UnprocessableEntityException(
        `Tim ini khusus ${GENDER_TEAM_LABEL[t.gender].toLowerCase()}`,
      );
    }
    const actualKu = kuFor(m.birthDate, kc.referenceDate, kc.config);
    const placement = classifyPlacement(actualKu, t.ku);
    const check = checkPlacement(placement, { isOwner: ctx.role === 'owner' }, input.reason);
    if (!check.allowed) {
      const message = `${m.fullName} (${kuLabel(actualKu)}) → ${t.name}: ${check.message}`;
      throw check.ownerOnly && ctx.role !== 'owner'
        ? new ForbiddenException(message)
        : new UnprocessableEntityException(message);
    }
    if (input.jerseyNumber !== undefined && input.jerseyNumber !== null) {
      const [taken] = await tx
        .select({ id: teamMember.id })
        .from(teamMember)
        .where(
          and(
            eq(teamMember.teamId, teamId),
            eq(teamMember.jerseyNumber, input.jerseyNumber),
            isNull(teamMember.leftAt),
            ne(teamMember.membershipId, m.id),
          ),
        );
      if (taken)
        throw new ConflictException(
          `Nomor punggung ${input.jerseyNumber} sudah dipakai di tim ini`,
        );
    }
    // Satu tim aktif per musim: keluarkan dari tim lama di musim yang sama.
    const previous = await tx
      .update(teamMember)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(teamMember.membershipId, m.id),
          eq(teamMember.seasonId, t.seasonId),
          isNull(teamMember.leftAt),
        ),
      )
      .returning({ teamId: teamMember.teamId });
    const [row] = await tx
      .insert(teamMember)
      .values({
        orgId: ctx.id,
        teamId,
        seasonId: t.seasonId,
        membershipId: m.id,
        jerseyNumber: input.jerseyNumber ?? null,
        actualKu,
        placement,
        placementReason: placement === 'same' ? null : input.reason!.trim(),
        approvedBy: placement === 'same' ? null : user.personId,
      })
      .returning();
    await this.audit.log(tx, {
      orgId: ctx.id,
      actorPersonId: user.personId,
      action: placement === 'same' ? 'team.player_added' : `team.player_${placement}`,
      entityType: 'team_member',
      entityId: row!.id,
      meta: {
        teamId,
        membershipId: m.id,
        actualKu,
        teamKu: t.ku,
        reason: input.reason ?? null,
        previousTeamId: previous[0]?.teamId ?? null,
      },
      ...meta,
    });
    return { id: row!.id, placement };
  }

  async removeMember(
    ctx: OrgContext,
    user: AuthUser,
    teamId: string,
    memberId: string,
    meta: Meta,
  ) {
    await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [row] = await tx
        .update(teamMember)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(teamMember.id, memberId),
            eq(teamMember.teamId, teamId),
            isNull(teamMember.leftAt),
          ),
        )
        .returning();
      if (!row) throw new NotFoundException('Pemain tidak ada di tim ini');
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'team.player_removed',
        entityType: 'team_member',
        entityId: memberId,
        meta: { teamId },
        ...meta,
      });
    });
  }

  // ── Kenaikan KU (A-11) ──────────────────────────────────────────────────────

  /** Membuat musim berikutnya (draf) beserta kompetisi utamanya. */
  async createNextSeason(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof NewSeasonSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const kc = await loadKuContext(tx);
      if (!kc.season)
        throw new UnprocessableEntityException('Belum ada musim aktif untuk dinaikkan');
      const [existingDraft] = await tx
        .select({ id: season.id })
        .from(season)
        .where(eq(season.status, 'draft'));
      if (existingDraft)
        throw new ConflictException(
          'Sudah ada musim baru (draf). Lanjutkan atau hapus draf tersebut.',
        );
      if (input.startsOn <= kc.season.startsOn)
        throw new UnprocessableEntityException('Musim baru harus dimulai setelah musim aktif');
      const [s] = await tx
        .insert(season)
        .values({
          orgId: ctx.id,
          name: input.name,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          status: 'draft',
          kuRule: kc.season.kuRule,
          kuGroups: kc.season.kuGroups,
        })
        .returning();
      if (input.competition) {
        const [c] = await tx
          .insert(competition)
          .values({ orgId: ctx.id, seasonId: s!.id, ...input.competition })
          .returning();
        await tx.update(season).set({ primaryCompetitionId: c!.id }).where(eq(season.id, s!.id));
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'season.created',
        entityType: 'season',
        entityId: s!.id,
        meta: { status: 'draft', purpose: 'promotion' },
        ...meta,
      });
      return { id: s!.id };
    });
  }

  promotionPreview(ctx: OrgContext, user: AuthUser): Promise<PromotionPreview> {
    return withTenant(this.db, ctx.id, user.personId, (tx) => this.buildPreview(tx));
  }

  private async buildPreview(tx: Tx): Promise<PromotionPreview> {
    const from = await loadKuContext(tx);
    const [draft] = await tx.select().from(season).where(eq(season.status, 'draft'));
    if (!from.season || !draft) throw new NotFoundException('Buat musim baru terlebih dahulu');
    const to = await loadKuContext(tx, draft.id);
    const players = await tx
      .select({
        membershipId: membership.id,
        fullName: person.fullName,
        birthDate: person.birthDate,
      })
      .from(membership)
      .innerJoin(person, eq(person.id, membership.personId))
      .where(inArray(membership.status, ['active', 'on_leave']))
      .orderBy(asc(person.fullName));
    const current = await tx
      .select({
        membershipId: teamMember.membershipId,
        placement: teamMember.placement,
        teamKu: team.ku,
        teamName: team.name,
        level: team.level,
        gender: team.gender,
      })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .where(and(eq(teamMember.seasonId, from.season.id), isNull(teamMember.leftAt)));
    const currentBy = new Map(current.map((c) => [c.membershipId, c]));
    const newTeams = await tx
      .select()
      .from(team)
      .where(and(eq(team.seasonId, draft.id), isNull(team.archivedAt)));

    const withBirth = players.filter((p) => p.birthDate);
    const proposals = proposePromotions(
      withBirth.map((p) => {
        const c = currentBy.get(p.membershipId);
        const actual = kuFor(p.birthDate!, from.referenceDate, from.config);
        return {
          id: p.membershipId,
          birthDate: p.birthDate!,
          currentTeamKu: c?.teamKu ?? null,
          currentPlacement: c ? classifyPlacement(actual, c.teamKu) : null,
        };
      }),
      from.referenceDate,
      to.referenceDate,
      from.config,
      to.config,
    );
    const rows: PromotionRow[] = proposals.map((p) => {
      const player = withBirth.find((w) => w.membershipId === p.id)!;
      const c = currentBy.get(p.id);
      let suggestedTeam: PromotionRow['suggestedTeam'] = null;
      if (p.newKu !== null && c) {
        const match =
          newTeams.find((t) => t.ku === p.newKu && t.level === c.level && t.gender === c.gender) ??
          newTeams.find((t) => t.ku === p.newKu && t.gender === c.gender);
        suggestedTeam = match
          ? { id: match.id, name: match.name }
          : { id: null, name: `${defaultTeamName({ ku: p.newKu, level: c.level })} (dibuat)` };
      }
      return {
        membershipId: p.id,
        fullName: player.fullName,
        birthDate: player.birthDate!,
        oldKu: p.oldKu,
        newKu: p.newKu,
        status: p.status,
        currentTeam: c?.teamName ?? null,
        suggestedTeam,
      };
    });
    const tally = (s: PromotionRow['status']) => rows.filter((r) => r.status === s).length;
    return {
      fromSeason: { id: from.season.id, name: from.season.name, referenceDate: from.referenceDate },
      toSeason: { id: draft.id, name: draft.name, referenceDate: to.referenceDate },
      rows,
      summary: {
        total: rows.length,
        naik: tally('naik'),
        tetap: tally('tetap'),
        lulus: tally('lulus'),
        perluKeputusan: tally('perlu_keputusan'),
      },
      draft: draft.promotionDraft ?? null,
    };
  }

  /**
   * Terapkan kenaikan KU: tempatkan pemain di tim musim baru (tim dibuat bila belum ada,
   * pelatih disalin), keluarkan yang lulus bila dipilih, lalu aktifkan musim baru.
   */
  async applyPromotion(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof PromotionApplySchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const preview = await this.buildPreview(tx);
      const decisions = new Map(input.decisions.map((d) => [d.membershipId, d]));
      if (input.draft) {
        await tx
          .update(season)
          .set({
            promotionDraft: { decisions: input.decisions, savedAt: new Date().toISOString() },
          })
          .where(eq(season.id, preview.toSeason.id));
        return { applied: false, draftSaved: true };
      }
      // Perlu keputusan: wajib ada keputusan eksplisit. Lulus: 'auto' tidak bermakna (tidak ada KU baru).
      const undecided = preview.rows.filter((r) => {
        const d = decisions.get(r.membershipId);
        if (r.status === 'perlu_keputusan') return !d;
        if (r.status === 'lulus') return !d || d.action === 'auto';
        return false;
      });
      if (undecided.length) {
        throw new UnprocessableEntityException(
          `Putuskan dulu: ${undecided
            .slice(0, 5)
            .map((r) => r.fullName)
            .join(', ')}${undecided.length > 5 ? ` dan ${undecided.length - 5} lainnya` : ''}`,
        );
      }

      // Musim baru aktif dulu agar penempatan memakai acuan baru.
      await tx
        .update(season)
        .set({ status: 'archived' })
        .where(eq(season.id, preview.fromSeason.id));
      await tx
        .update(season)
        .set({ status: 'active', promotionDraft: null })
        .where(eq(season.id, preview.toSeason.id));

      const fromTeams = await tx
        .select({
          membershipId: teamMember.membershipId,
          teamId: team.id,
          level: team.level,
          gender: team.gender,
          branchId: team.branchId,
        })
        .from(teamMember)
        .innerJoin(team, eq(team.id, teamMember.teamId))
        .where(and(eq(teamMember.seasonId, preview.fromSeason.id), isNull(teamMember.leftAt)));
      const fromBy = new Map(fromTeams.map((f) => [f.membershipId, f]));
      const created = new Map<string, string>();
      let placed = 0;
      let left = 0;

      for (const row of preview.rows) {
        const d = decisions.get(row.membershipId) ?? {
          action: 'auto' as const,
          membershipId: row.membershipId,
        };
        if (d.action === 'skip') continue;
        if (d.action === 'leave') {
          await tx
            .update(membership)
            .set({
              status: 'left',
              statusReason: row.newKu === null ? 'Lulus KU tertua' : 'Keluar saat kenaikan musim',
            })
            .where(eq(membership.id, row.membershipId));
          left++;
          continue;
        }
        let teamId = d.action === 'team' ? d.teamId : (row.suggestedTeam?.id ?? undefined);
        if (!teamId && d.action === 'auto' && row.newKu !== null) {
          const src = fromBy.get(row.membershipId);
          if (!src) continue; // pemain tanpa tim di musim lama: tidak ditempatkan otomatis
          const key = `${row.newKu}|${src.level}|${src.gender}`;
          teamId = created.get(key);
          if (!teamId) {
            teamId = await this.insertTeam(tx, ctx.id, preview.toSeason.id, {
              ku: row.newKu,
              level: src.level,
              gender: src.gender,
              branchId: src.branchId,
              staffRoleIds: (
                await tx
                  .select({ id: teamStaff.staffRoleId })
                  .from(teamStaff)
                  .where(eq(teamStaff.teamId, src.teamId))
              ).map((s) => s.id),
            });
            created.set(key, teamId);
          }
        }
        if (!teamId) continue;
        await this.place(
          tx,
          ctx,
          user,
          teamId,
          { membershipId: row.membershipId, reason: d.reason },
          meta,
        );
        placed++;
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'season.promoted',
        entityType: 'season',
        entityId: preview.toSeason.id,
        meta: { from: preview.fromSeason.id, placed, left, teamsCreated: created.size },
        ...meta,
      });
      return { applied: true, placed, left, teamsCreated: created.size };
    });
  }

  // ── Bantuan ────────────────────────────────────────────────────────────────

  private async insertTeam(
    tx: Tx,
    orgId: string,
    seasonId: string,
    input: {
      ku: number;
      level: string;
      gender: 'male' | 'female' | 'mixed';
      name?: string | undefined;
      branchId?: string | null | undefined;
      staffRoleIds: string[];
    },
  ): Promise<string> {
    const [row] = await tx
      .insert(team)
      .values({
        orgId,
        seasonId,
        ku: input.ku,
        level: input.level,
        gender: input.gender,
        branchId: input.branchId ?? null,
        name: input.name || defaultTeamName(input),
      })
      .returning({ id: team.id });
    await this.setStaffTx(tx, orgId, row!.id, input.staffRoleIds);
    return row!.id;
  }

  private async setStaffTx(tx: Tx, orgId: string, teamId: string, staffRoleIds: string[]) {
    if (staffRoleIds.length) {
      const valid = await tx
        .select({ id: staffRole.id })
        .from(staffRole)
        .where(
          and(
            inArray(staffRole.id, staffRoleIds),
            inArray(staffRole.role, ['coach', 'team_manager', 'admin', 'owner']),
            ne(staffRole.status, 'removed'),
            eq(staffRole.orgId, orgId),
          ),
        );
      if (valid.length !== new Set(staffRoleIds).size)
        throw new UnprocessableEntityException('Pelatih tidak ditemukan di klub ini');
    }
    await tx.delete(teamStaff).where(eq(teamStaff.teamId, teamId));
    if (staffRoleIds.length) {
      await tx
        .insert(teamStaff)
        .values([...new Set(staffRoleIds)].map((staffRoleId) => ({ orgId, teamId, staffRoleId })));
    }
  }

  private async mustTeam(tx: Tx, teamId: string) {
    const [t] = await tx
      .select()
      .from(team)
      .where(and(eq(team.id, teamId), isNull(team.archivedAt)));
    if (!t) throw new NotFoundException('Tim tidak ditemukan');
    return t;
  }

  private async summaries(tx: Tx, seasonId: string, onlyTeamId?: string): Promise<TeamSummary[]> {
    const teams = await tx
      .select({ t: team, branchName: branch.name })
      .from(team)
      .leftJoin(branch, eq(branch.id, team.branchId))
      .where(
        and(
          eq(team.seasonId, seasonId),
          isNull(team.archivedAt),
          onlyTeamId ? eq(team.id, onlyTeamId) : undefined,
        ),
      )
      .orderBy(asc(team.ku), asc(team.level));
    if (!teams.length) return [];
    const ids = teams.map((r) => r.t.id);
    const staff = await tx
      .select({
        teamId: teamStaff.teamId,
        staffRoleId: staffRole.id,
        fullName: person.fullName,
        role: staffRole.role,
      })
      .from(teamStaff)
      .innerJoin(staffRole, eq(staffRole.id, teamStaff.staffRoleId))
      .innerJoin(person, eq(person.id, staffRole.personId))
      .where(inArray(teamStaff.teamId, ids));
    const counts = await tx
      .select({ teamId: teamMember.teamId, n: count() })
      .from(teamMember)
      .where(and(inArray(teamMember.teamId, ids), isNull(teamMember.leftAt)))
      .groupBy(teamMember.teamId);
    return teams.map(({ t, branchName }) => ({
      id: t.id,
      name: t.name,
      ku: t.ku,
      level: t.level,
      gender: t.gender,
      branchName,
      coaches: staff
        .filter((s) => s.teamId === t.id)
        .map((s) => ({ staffRoleId: s.staffRoleId, fullName: s.fullName, role: s.role })),
      playerCount: counts.find((c) => c.teamId === t.id)?.n ?? 0,
    }));
  }
}

export function defaultTeamName(input: { ku: number; level: string }): string {
  return `KU${input.ku} ${input.level}`;
}
