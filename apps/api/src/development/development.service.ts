import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  assessment,
  assessmentNote,
  attendance,
  event,
  guardianLink,
  membership,
  organization,
  person,
  reportPublication,
  season,
  skill,
  team,
  teamMember,
  withContext,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  DEFAULT_BASKETBALL_SKILLS,
  attendancePct,
  averageScore,
  canEditAssessment,
  semesterOf,
  semesterRange,
  type AssessmentInputSchema,
  type AssessmentSheet,
  type ReportCardDto,
  type ReportStatus,
  type Semester,
  type SkillDto,
  type SkillInputSchema,
} from '@sportgather/shared';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { ENV, type Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import { NotifierService } from '../notifications/notifier.js';
import { scopedTeamIds } from '../schedule/coach.service.js';
import { todayIso } from '../seasons/ku-context.js';

type Meta = { ip: string; userAgent: string | null };
type SeasonRow = typeof season.$inferSelect;

const toSkillDto = (s: typeof skill.$inferSelect): SkillDto => ({
  id: s.id,
  name: s.name,
  description: s.description,
  kuMin: s.kuMin,
  kuMax: s.kuMax,
  active: s.active,
});

@Injectable()
export class DevelopmentService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly notifier: NotifierService,
    private readonly audit: AuditService,
  ) {}

  // ── Skill (DEV-01) ─────────────────────────────────────────────────────────

  /** Template basket bawaan ditanam saat klub pertama kali membuka penilaian. */
  async ensureSkills(tx: Tx, orgId: string) {
    const [has] = await tx.select({ id: skill.id }).from(skill).limit(1);
    if (has) return;
    await tx
      .insert(skill)
      .values(DEFAULT_BASKETBALL_SKILLS.map((s, i) => ({ orgId, ...s, sortOrder: i })));
  }

  async listSkills(ctx: OrgContext, user: AuthUser): Promise<SkillDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      await this.ensureSkills(tx, ctx.id);
      return (await tx.select().from(skill).orderBy(asc(skill.sortOrder), asc(skill.name))).map(
        toSkillDto,
      );
    });
  }

  async saveSkill(
    ctx: OrgContext,
    user: AuthUser,
    id: string | null,
    input: z.output<typeof SkillInputSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      await this.ensureSkills(tx, ctx.id);
      let row;
      if (id) {
        [row] = await tx
          .update(skill)
          .set({ ...input, description: input.description ?? null })
          .where(eq(skill.id, id))
          .returning();
        if (!row) throw new NotFoundException('Skill tidak ditemukan');
      } else {
        const [{ max } = { max: 0 }] = await tx
          .select({ max: sql<number>`coalesce(max(${skill.sortOrder}), 0)` })
          .from(skill);
        [row] = await tx
          .insert(skill)
          .values({
            orgId: ctx.id,
            ...input,
            description: input.description ?? null,
            sortOrder: Number(max) + 1,
          })
          .returning();
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: id ? 'skill.update' : 'skill.create',
        entityType: 'skill',
        entityId: row!.id,
        meta: { name: input.name, active: input.active },
        ...meta,
      });
      return toSkillDto(row!);
    });
  }

  // ── P-04 · Penilaian ───────────────────────────────────────────────────────

  private async activeSeason(tx: Tx): Promise<SeasonRow> {
    const [s] = await tx.select().from(season).where(eq(season.status, 'active')).limit(1);
    if (!s) throw new UnprocessableEntityException('Belum ada musim aktif');
    return s;
  }

  private currentSemester(s: SeasonRow): Semester {
    const today = todayIso();
    const clamped = today < s.startsOn ? s.startsOn : today > s.endsOn ? s.endsOn : today;
    return semesterOf(s, clamped);
  }

  private async teamInScope(tx: Tx, ctx: OrgContext, user: AuthUser, teamId: string) {
    const ids = await scopedTeamIds(tx, ctx, user);
    if (!ids.includes(teamId)) throw new NotFoundException('Tim tidak ditemukan');
    const [t] = await tx.select().from(team).where(eq(team.id, teamId));
    return t!;
  }

  private skillsForKu(all: (typeof skill.$inferSelect)[], ku: number) {
    return all.filter((s) => s.active && s.kuMin <= ku && ku <= s.kuMax);
  }

  async sheet(
    ctx: OrgContext,
    user: AuthUser,
    teamId: string,
    semesterParam?: Semester,
  ): Promise<AssessmentSheet> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.teamInScope(tx, ctx, user, teamId);
      const s = await this.activeSeason(tx);
      const semester = semesterParam ?? this.currentSemester(s);
      await this.ensureSkills(tx, ctx.id);
      const skills = this.skillsForKu(
        await tx.select().from(skill).orderBy(asc(skill.sortOrder)),
        t.ku,
      );
      const members = await tx
        .select({
          membershipId: membership.id,
          fullName: person.fullName,
          jerseyNumber: teamMember.jerseyNumber,
        })
        .from(teamMember)
        .innerJoin(membership, eq(membership.id, teamMember.membershipId))
        .innerJoin(person, eq(person.id, membership.personId))
        .where(
          and(
            eq(teamMember.teamId, teamId),
            isNull(teamMember.leftAt),
            inArray(membership.status, ['active', 'on_leave']),
          ),
        )
        .orderBy(asc(teamMember.jerseyNumber), asc(person.fullName));
      const ids = members.map((m) => m.membershipId);
      const scores = ids.length
        ? await tx
            .select({ a: assessment, by: person.fullName })
            .from(assessment)
            .innerJoin(person, eq(person.id, assessment.assessedBy))
            .where(
              and(
                inArray(assessment.membershipId, ids),
                eq(assessment.seasonId, s.id),
                eq(assessment.semester, semester),
              ),
            )
        : [];
      const notes = ids.length
        ? await tx
            .select()
            .from(assessmentNote)
            .where(
              and(
                inArray(assessmentNote.membershipId, ids),
                eq(assessmentNote.seasonId, s.id),
                eq(assessmentNote.semester, semester),
              ),
            )
        : [];
      const [pub] = await tx
        .select({ id: reportPublication.id })
        .from(reportPublication)
        .where(and(eq(reportPublication.seasonId, s.id), eq(reportPublication.semester, semester)));
      const now = new Date();
      return {
        team: { id: t.id, name: t.name, ku: t.ku },
        season: { id: s.id, name: s.name },
        semester,
        semesterRange: semesterRange(s, semester),
        published: Boolean(pub),
        skills: skills.map(toSkillDto),
        players: members.map((m) => {
          const mine = scores.filter((x) => x.a.membershipId === m.membershipId);
          const first = mine.reduce<(typeof mine)[number] | null>(
            (acc, x) => (!acc || x.a.createdAt < acc.a.createdAt ? x : acc),
            null,
          );
          return {
            membershipId: m.membershipId,
            fullName: m.fullName,
            jerseyNumber: m.jerseyNumber,
            scores: Object.fromEntries(mine.map((x) => [x.a.skillId, x.a.score])),
            note: notes.find((n) => n.membershipId === m.membershipId)?.note ?? null,
            editable:
              !pub &&
              (!mine.length || mine.every((x) => canEditAssessment(x.a, user.personId, now))),
            assessedByName: first?.by ?? null,
            assessedAt: first?.a.createdAt.toISOString() ?? null,
          };
        }),
      };
    });
  }

  /** US-15: simpan skor 1–5 + catatan; ubah hanya oleh pembuat ≤7 hari, terkunci setelah rapor terbit. */
  async save(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof AssessmentInputSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.teamInScope(tx, ctx, user, input.teamId);
      const s = await this.activeSeason(tx);
      const semester = input.semester ?? this.currentSemester(s);
      const [member] = await tx
        .select({ id: teamMember.id })
        .from(teamMember)
        .where(
          and(
            eq(teamMember.teamId, t.id),
            eq(teamMember.membershipId, input.membershipId),
            isNull(teamMember.leftAt),
          ),
        );
      if (!member) throw new NotFoundException('Pemain tidak ada di tim ini');
      const [pub] = await tx
        .select({ id: reportPublication.id })
        .from(reportPublication)
        .where(and(eq(reportPublication.seasonId, s.id), eq(reportPublication.semester, semester)));
      if (pub)
        throw new UnprocessableEntityException(
          'Rapor semester ini sudah terbit; penilaian terkunci',
        );
      const allowed = new Set(
        this.skillsForKu(await tx.select().from(skill), t.ku).map((x) => x.id),
      );
      if (input.scores.some((x) => !allowed.has(x.skillId)))
        throw new UnprocessableEntityException('Skill tidak berlaku untuk KU tim ini');
      const existing = await tx
        .select()
        .from(assessment)
        .where(
          and(
            eq(assessment.membershipId, input.membershipId),
            eq(assessment.seasonId, s.id),
            eq(assessment.semester, semester),
          ),
        )
        .for('update');
      const now = new Date();
      if (existing.some((a) => !canEditAssessment(a, user.personId, now)))
        throw new ForbiddenException(
          'Penilaian hanya bisa diubah oleh pelatih yang menilai, paling lama 7 hari setelah disimpan',
        );
      for (const x of input.scores) {
        await tx
          .insert(assessment)
          .values({
            orgId: ctx.id,
            membershipId: input.membershipId,
            seasonId: s.id,
            semester,
            skillId: x.skillId,
            score: x.score,
            assessedBy: user.personId,
            // Jendela 7 hari dihitung dari penilaian pertama pemain ini di semester tsb.
            createdAt: existing[0]?.createdAt ?? now,
          })
          .onConflictDoUpdate({
            target: [
              assessment.membershipId,
              assessment.seasonId,
              assessment.semester,
              assessment.skillId,
            ],
            set: { score: x.score, updatedAt: now },
          });
      }
      if (input.note !== undefined) {
        const [n] = await tx
          .select()
          .from(assessmentNote)
          .where(
            and(
              eq(assessmentNote.membershipId, input.membershipId),
              eq(assessmentNote.seasonId, s.id),
              eq(assessmentNote.semester, semester),
            ),
          );
        if (n && n.authorPersonId !== user.personId)
          throw new ForbiddenException('Catatan ditulis pelatih lain');
        if (input.note)
          await tx
            .insert(assessmentNote)
            .values({
              orgId: ctx.id,
              membershipId: input.membershipId,
              seasonId: s.id,
              semester,
              note: input.note,
              authorPersonId: user.personId,
            })
            .onConflictDoUpdate({
              target: [
                assessmentNote.membershipId,
                assessmentNote.seasonId,
                assessmentNote.semester,
              ],
              set: { note: input.note, updatedAt: now },
            });
        else if (n) await tx.delete(assessmentNote).where(eq(assessmentNote.id, n.id));
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: existing.length ? 'assessment.update' : 'assessment.create',
        entityType: 'membership',
        entityId: input.membershipId,
        meta: { semester, skills: input.scores.length },
        ...meta,
      });
      return { saved: input.scores.length, semester };
    });
  }

  /** P-01: jumlah pemain di tim saya yang belum dinilai semester berjalan. */
  async pending(ctx: OrgContext, user: AuthUser) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [s] = await tx.select().from(season).where(eq(season.status, 'active')).limit(1);
      if (!s) return { pending: 0, semester: null, closesOn: null };
      const semester = this.currentSemester(s);
      const teamIds = await scopedTeamIds(tx, ctx, user);
      if (!teamIds.length) return { pending: 0, semester, closesOn: semesterRange(s, semester).to };
      const rows = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from team_member tm
        join membership m on m.id = tm.membership_id
        where tm.team_id in (${sql.join(
          teamIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          and tm.left_at is null and m.status = 'active'
          and not exists (select 1 from assessment a where a.membership_id = m.id
            and a.season_id = ${s.id}::uuid and a.semester = ${semester})`);
      return {
        pending: Number(rows[0]?.n ?? 0),
        semester,
        closesOn: semesterRange(s, semester).to,
      };
    });
  }

  // ── Rapor (DEV-03, US-16) ──────────────────────────────────────────────────

  async reportStatus(
    ctx: OrgContext,
    user: AuthUser,
    semesterParam?: Semester,
  ): Promise<ReportStatus> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const s = await this.activeSeason(tx);
      const semester = semesterParam ?? this.currentSemester(s);
      const [counts] = await tx.execute<{ players: number; assessed: number }>(sql`
        select count(distinct tm.membership_id)::int as players,
          count(distinct a.membership_id)::int as assessed
        from team_member tm
        join team t on t.id = tm.team_id and t.season_id = ${s.id}::uuid
        join membership m on m.id = tm.membership_id and m.status = 'active'
        left join assessment a on a.membership_id = tm.membership_id
          and a.season_id = ${s.id}::uuid and a.semester = ${semester}
        where tm.left_at is null`);
      const pubs = await tx
        .select({ p: reportPublication, by: person.fullName })
        .from(reportPublication)
        .leftJoin(person, eq(person.id, reportPublication.publishedBy))
        .where(eq(reportPublication.seasonId, s.id));
      const mine = pubs.find((p) => p.p.semester === semester);
      return {
        season: { id: s.id, name: s.name },
        semester,
        range: semesterRange(s, semester),
        players: Number(counts?.players ?? 0),
        assessed: Number(counts?.assessed ?? 0),
        published: mine ? { at: mine.p.publishedAt.toISOString(), byName: mine.by } : null,
        other: ([1, 2] as const)
          .filter((x) => x !== semester)
          .map((x) => ({ semester: x, published: pubs.some((p) => p.p.semester === x) })),
      };
    });
  }

  /** Admin mempublikasikan rapor semester → wali dikabari (WhatsApp + push). */
  async publish(ctx: OrgContext, user: AuthUser, seasonId: string, semester: Semester, meta: Meta) {
    const guardians = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [s] = await tx.select().from(season).where(eq(season.id, seasonId));
      if (!s) throw new NotFoundException('Musim tidak ditemukan');
      const inserted = await tx
        .insert(reportPublication)
        .values({ orgId: ctx.id, seasonId, semester, publishedBy: user.personId })
        .onConflictDoNothing()
        .returning({ id: reportPublication.id });
      if (!inserted.length)
        throw new UnprocessableEntityException('Rapor semester ini sudah terbit');
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'report.publish',
        entityType: 'season',
        entityId: seasonId,
        meta: { semester },
        ...meta,
      });
      // Wali dari pemain yang punya penilaian di semester itu.
      const rows = await tx
        .selectDistinct({ guardianId: guardianLink.guardianPersonId, childName: person.fullName })
        .from(assessment)
        .innerJoin(membership, eq(membership.id, assessment.membershipId))
        .innerJoin(person, eq(person.id, membership.personId))
        .innerJoin(
          guardianLink,
          and(
            eq(guardianLink.childPersonId, membership.personId),
            eq(guardianLink.isPrimary, true),
          ),
        )
        .where(and(eq(assessment.seasonId, seasonId), eq(assessment.semester, semester)));
      const [org] = await tx
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, ctx.id));
      const info = await this.notifier.recipients(
        tx,
        rows.map((r) => r.guardianId),
      );
      const byGuardian = new Map<string, string[]>();
      for (const r of rows)
        byGuardian.set(r.guardianId, [...(byGuardian.get(r.guardianId) ?? []), r.childName]);
      return {
        org: org!.name,
        season: s.name,
        list: [...byGuardian].map(([personId, children]) => ({
          personId,
          phone: info.get(personId)?.phone ?? null,
          notifyWhatsapp: info.get(personId)?.notifyWhatsapp ?? true,
          children,
        })),
      };
    });
    const link = `${this.env.WEB_ORIGIN}/wali/rapor`;
    await this.notifier.send(guardians.list, {
      whatsapp: {
        template: 'rapor_terbit',
        params: (r) => ({
          klub: guardians.org,
          anak: r.children.join(', '),
          semester: `Semester ${semester} · ${guardians.season}`,
          link,
        }),
      },
      push: (r) => ({
        title: 'Rapor terbit',
        body: `Rapor ${r.children.join(', ')} semester ${semester} sudah bisa dilihat`,
        url: '/wali/rapor',
        tag: `rapor-${seasonId}-${semester}`,
      }),
    });
    return { notified: guardians.list.length };
  }

  /** Data rapor satu pemain (dipakai wali, PDF, dan admin). */
  async reportCard(
    tx: Tx,
    membershipId: string,
    seasonId: string,
    semester: Semester,
  ): Promise<ReportCardDto | null> {
    const [pub] = await tx
      .select()
      .from(reportPublication)
      .where(
        and(eq(reportPublication.seasonId, seasonId), eq(reportPublication.semester, semester)),
      );
    if (!pub) return null;
    const [s] = await tx.select().from(season).where(eq(season.id, seasonId));
    const [m] = await tx
      .select({
        id: membership.id,
        childName: person.fullName,
        orgName: organization.name,
        orgSlug: organization.slug,
      })
      .from(membership)
      .innerJoin(person, eq(person.id, membership.personId))
      .innerJoin(organization, eq(organization.id, membership.orgId))
      .where(eq(membership.id, membershipId));
    if (!s || !m) return null;
    const range = semesterRange(s, semester);
    const [tm] = await tx
      .select({ name: team.name, ku: team.ku })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .where(and(eq(teamMember.membershipId, membershipId), eq(teamMember.seasonId, seasonId)))
      .orderBy(sql`${teamMember.leftAt} is null desc`, sql`${teamMember.joinedAt} desc`)
      .limit(1);
    const [att] = await tx
      .select({
        attended: sql<number>`count(*) filter (where ${attendance.status} = 'hadir')`,
        total: sql<number>`count(*)`,
      })
      .from(attendance)
      .innerJoin(event, eq(event.id, attendance.eventId))
      .where(
        and(
          eq(attendance.membershipId, membershipId),
          eq(event.status, 'scheduled'),
          gte(event.startsAt, new Date(`${range.from}T00:00:00+07:00`)),
          lte(event.startsAt, new Date(`${range.to}T23:59:59+07:00`)),
        ),
      );
    const scores = await tx
      .select({
        name: skill.name,
        score: assessment.score,
        order: skill.sortOrder,
        semester: assessment.semester,
      })
      .from(assessment)
      .innerJoin(skill, eq(skill.id, assessment.skillId))
      .where(and(eq(assessment.membershipId, membershipId), eq(assessment.seasonId, seasonId)))
      .orderBy(asc(skill.sortOrder));
    const current = scores.filter((x) => x.semester === semester);
    const previous = semester === 2 ? scores.filter((x) => x.semester === 1) : [];
    const [note] = await tx
      .select({ text: assessmentNote.note, coachName: person.fullName })
      .from(assessmentNote)
      .leftJoin(person, eq(person.id, assessmentNote.authorPersonId))
      .where(
        and(
          eq(assessmentNote.membershipId, membershipId),
          eq(assessmentNote.seasonId, seasonId),
          eq(assessmentNote.semester, semester),
        ),
      );
    const attended = Number(att?.attended ?? 0);
    const total = Number(att?.total ?? 0);
    return {
      membershipId,
      childName: m.childName,
      orgName: m.orgName,
      orgSlug: m.orgSlug,
      teamName: tm?.name ?? null,
      ku: tm?.ku ?? null,
      season: { id: s.id, name: s.name },
      semester,
      range,
      attendance: { pct: attendancePct(attended, total), attended, total },
      skills: current.map((x) => ({ name: x.name, score: x.score })),
      average: averageScore(current.map((x) => x.score)),
      previousAverage: averageScore(previous.map((x) => x.score)),
      note: note ? { text: note.text, coachName: note.coachName } : null,
      publishedAt: pub.publishedAt.toISOString(),
    };
  }

  /** O-07: rapor terbaru yang sudah terbit untuk setiap anak (lintas klub). */
  async myReportCards(user: AuthUser): Promise<ReportCardDto[]> {
    const refs = await withContext(this.db, { personId: user.personId }, (tx) =>
      tx.execute<{ org_id: string; membership_id: string }>(
        sql`select org_id, membership_id from sg_my_children_orgs(${user.personId})`,
      ),
    );
    const out: ReportCardDto[] = [];
    for (const r of refs) {
      const card = await withTenant(this.db, r.org_id, user.personId, async (tx) => {
        const pubs = await tx
          .select({ seasonId: reportPublication.seasonId, semester: reportPublication.semester })
          .from(reportPublication)
          .innerJoin(season, eq(season.id, reportPublication.seasonId))
          .orderBy(sql`${season.startsOn} desc`, sql`${reportPublication.semester} desc`);
        for (const p of pubs) {
          const c = await this.reportCard(tx, r.membership_id, p.seasonId, p.semester as Semester);
          if (c && (c.skills.length || c.attendance.total)) return c;
        }
        return null;
      });
      if (card) out.push(card);
    }
    return out;
  }

  async myReportCard(user: AuthUser, membershipId: string): Promise<ReportCardDto> {
    const card = (await this.myReportCards(user)).find((c) => c.membershipId === membershipId);
    if (!card) throw new NotFoundException('Rapor belum terbit');
    return card;
  }
}
