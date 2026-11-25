import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  competition,
  season,
  team,
  teamCompetition,
  teamMember,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  kuChanges,
  type CompetitionDto,
  type CompetitionInputSchema,
  type KuChangeDto,
  type SeasonDto,
  type SeasonInputSchema,
} from '@sportgather/shared';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { activePlayers, loadKuContext } from './ku-context.js';

type Meta = { ip: string; userAgent: string | null };

@Injectable()
export class SeasonsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  list(ctx: OrgContext, user: AuthUser) {
    return withTenant(this.db, ctx.id, user.personId, (tx) =>
      tx
        .select({
          id: season.id,
          name: season.name,
          status: season.status,
          startsOn: season.startsOn,
          endsOn: season.endsOn,
        })
        .from(season)
        .orderBy(desc(season.startsOn)),
    );
  }

  async active(ctx: OrgContext, user: AuthUser): Promise<SeasonDto | null> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [s] = await tx
        .select({ id: season.id })
        .from(season)
        .where(eq(season.status, 'active'));
      return s ? this.dto(tx, s.id) : null;
    });
  }

  get(ctx: OrgContext, user: AuthUser, seasonId: string): Promise<SeasonDto> {
    return withTenant(this.db, ctx.id, user.personId, (tx) => this.dto(tx, seasonId));
  }

  /** Musim pertama klub langsung aktif; berikutnya draf (diaktifkan lewat kenaikan KU, A-11). */
  async create(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof SeasonInputSchema>,
    meta: Meta,
  ): Promise<SeasonDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [hasActive] = await tx
        .select({ n: count() })
        .from(season)
        .where(eq(season.status, 'active'));
      const [row] = await tx
        .insert(season)
        .values({ orgId: ctx.id, ...input, status: (hasActive?.n ?? 0) > 0 ? 'draft' : 'active' })
        .returning();
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'season.created',
        entityType: 'season',
        entityId: row!.id,
        meta: { status: row!.status },
        ...meta,
      });
      return this.dto(tx, row!.id);
    });
  }

  async update(
    ctx: OrgContext,
    user: AuthUser,
    seasonId: string,
    input: z.output<typeof SeasonInputSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [row] = await tx.update(season).set(input).where(eq(season.id, seasonId)).returning();
      if (!row) throw new NotFoundException('Musim tidak ditemukan');
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'season.updated',
        entityType: 'season',
        entityId: seasonId,
        meta: { kuRule: input.kuRule, kuGroups: input.kuGroups },
        ...meta,
      });
      return this.dto(tx, seasonId);
    });
  }

  async addCompetition(
    ctx: OrgContext,
    user: AuthUser,
    seasonId: string,
    input: z.output<typeof CompetitionInputSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const s = await this.mustSeason(tx, seasonId);
      const { isPrimary, ...data } = input;
      const [row] = await tx
        .insert(competition)
        .values({ orgId: ctx.id, seasonId, ...data })
        .returning();
      if (isPrimary || !s.primaryCompetitionId) {
        await tx
          .update(season)
          .set({ primaryCompetitionId: row!.id })
          .where(eq(season.id, seasonId));
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'competition.created',
        entityType: 'competition',
        entityId: row!.id,
        meta: { referenceDate: row!.referenceDate },
        ...meta,
      });
      return this.dto(tx, seasonId);
    });
  }

  /** US-05: mengubah tanggal acuan menghitung ulang KU; perubahan dipratinjau dulu lewat preview(). */
  async updateCompetition(
    ctx: OrgContext,
    user: AuthUser,
    competitionId: string,
    input: z.output<typeof CompetitionInputSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [before] = await tx.select().from(competition).where(eq(competition.id, competitionId));
      if (!before) throw new NotFoundException('Kompetisi tidak ditemukan');
      const { isPrimary, ...data } = input;
      await tx.update(competition).set(data).where(eq(competition.id, competitionId));
      if (isPrimary)
        await tx
          .update(season)
          .set({ primaryCompetitionId: competitionId })
          .where(eq(season.id, before.seasonId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'competition.updated',
        entityType: 'competition',
        entityId: competitionId,
        meta: { referenceDate: { from: before.referenceDate, to: data.referenceDate } },
        ...meta,
      });
      return this.dto(tx, before.seasonId);
    });
  }

  async deleteCompetition(ctx: OrgContext, user: AuthUser, competitionId: string, meta: Meta) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [row] = await tx
        .delete(competition)
        .where(eq(competition.id, competitionId))
        .returning();
      if (!row) throw new NotFoundException('Kompetisi tidak ditemukan');
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'competition.deleted',
        entityType: 'competition',
        entityId: competitionId,
        ...meta,
      });
      return this.dto(tx, row.seasonId);
    });
  }

  async setPrimary(
    ctx: OrgContext,
    user: AuthUser,
    seasonId: string,
    competitionId: string,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [c] = await tx
        .select()
        .from(competition)
        .where(and(eq(competition.id, competitionId), eq(competition.seasonId, seasonId)));
      if (!c) throw new NotFoundException('Kompetisi tidak ditemukan di musim ini');
      await tx
        .update(season)
        .set({ primaryCompetitionId: competitionId })
        .where(eq(season.id, seasonId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'season.primary_competition_changed',
        entityType: 'season',
        entityId: seasonId,
        meta: { competitionId },
        ...meta,
      });
      return this.dto(tx, seasonId);
    });
  }

  /**
   * Pratinjau US-05: pemain aktif yang KU-nya berubah bila tanggal acuan kompetisi diganti.
   * Untuk kompetisi baru (belum tersimpan) kirim competitionId = null dan bandingkan dengan acuan musim.
   */
  async preview(
    ctx: OrgContext,
    user: AuthUser,
    competitionId: string | null,
    referenceDate: string,
  ): Promise<KuChangeDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const kc = await loadKuContext(tx);
      let oldRef = kc.referenceDate;
      if (competitionId) {
        const [c] = await tx.select().from(competition).where(eq(competition.id, competitionId));
        if (!c) throw new NotFoundException('Kompetisi tidak ditemukan');
        oldRef = c.referenceDate;
      }
      const players = (await activePlayers(tx)).map((p) => ({
        id: p.membershipId,
        birthDate: p.birthDate!,
        fullName: p.fullName,
      }));
      const names = new Map(players.map((p) => [p.id, p.fullName]));
      return kuChanges(players, oldRef, referenceDate, kc.config).map((c) => ({
        membershipId: c.id,
        fullName: names.get(c.id)!,
        from: c.from,
        to: c.to,
      }));
    });
  }

  private async mustSeason(tx: Tx, seasonId: string) {
    const [s] = await tx.select().from(season).where(eq(season.id, seasonId));
    if (!s) throw new NotFoundException('Musim tidak ditemukan');
    if (s.status === 'archived') throw new BadRequestException('Musim sudah diarsipkan');
    return s;
  }

  async dto(tx: Tx, seasonId: string): Promise<SeasonDto> {
    const [s] = await tx.select().from(season).where(eq(season.id, seasonId));
    if (!s) throw new NotFoundException('Musim tidak ditemukan');
    const kc = await loadKuContext(tx, seasonId);
    const comps = await tx
      .select()
      .from(competition)
      .where(eq(competition.seasonId, seasonId))
      .orderBy(asc(competition.referenceDate));
    const teamCounts = await tx
      .select({ competitionId: teamCompetition.competitionId, n: count() })
      .from(teamCompetition)
      .groupBy(teamCompetition.competitionId);
    const [teams] = await tx
      .select({ n: count() })
      .from(team)
      .where(and(eq(team.seasonId, seasonId), isNull(team.archivedAt)));
    const [players] = await tx
      .select({ n: count() })
      .from(teamMember)
      .where(and(eq(teamMember.seasonId, seasonId), isNull(teamMember.leftAt)));
    return {
      id: s.id,
      name: s.name,
      startsOn: s.startsOn,
      endsOn: s.endsOn,
      status: s.status,
      kuRule: s.kuRule,
      kuGroups: s.kuGroups,
      referenceDate: kc.referenceDate,
      referenceSource: kc.referenceSource,
      primaryCompetitionId: s.primaryCompetitionId,
      competitions: comps.map((c): CompetitionDto => ({
        id: c.id,
        name: c.name,
        organizer: c.organizer,
        kind: c.kind,
        referenceDate: c.referenceDate,
        kuGroups: c.kuGroups,
        isPrimary: c.id === s.primaryCompetitionId,
        teamCount: teamCounts.find((t) => t.competitionId === c.id)?.n ?? 0,
      })),
      teamCount: teams?.n ?? 0,
      playerCount: players?.n ?? 0,
    };
  }
}
