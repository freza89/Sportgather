import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  attendance,
  branch,
  event,
  eventSeries,
  holiday,
  season,
  team,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  addDays,
  formatHariTanggal,
  formatTimeRange,
  isZonaWaktu,
  localToUtc,
  utcToLocalDate,
  utcToLocalTime,
  weeklyOccurrences,
  type EventInputSchema,
  type EventUpdateSchema,
  type HolidayDto,
  type HolidayInputSchema,
  type ScheduleEventDto,
  type ScheduleQuerySchema,
  type SeriesDto,
  type SeriesInputSchema,
  type ZonaWaktu,
} from '@sportgather/shared';
import { and, asc, count, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AnnouncementsService } from '../announcements/announcements.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { coachesOfTeams, guardiansOfTeams } from '../notifications/recipients.js';
import { todayIso } from '../seasons/ku-context.js';

type Meta = { ip: string; userAgent: string | null };
type EventRow = typeof event.$inferSelect;

export function zoneOf(tz: string | null | undefined): ZonaWaktu {
  return tz && isZonaWaktu(tz) ? tz : 'Asia/Jakarta';
}

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly announcements: AnnouncementsService,
  ) {}

  /** A-12: sesi dalam rentang tanggal (+ hari libur). */
  list(ctx: OrgContext, user: AuthUser, q: z.output<typeof ScheduleQuerySchema>) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const events = await this.eventsInRange(
        tx,
        q.from,
        q.to,
        q.teamId ? [q.teamId] : undefined,
        q.branchId,
      );
      const holidays = await this.holidaysInRange(tx, q.from, q.to);
      return { events, holidays };
    });
  }

  async eventsInRange(
    tx: Tx,
    from: string,
    to: string,
    teamIds?: string[],
    branchId?: string,
  ): Promise<ScheduleEventDto[]> {
    // Rentang lokal dibuka ±1 hari agar WITA/WIT tidak terpotong, lalu disaring per zona.
    const start = localToUtc(addDays(from, -1), '00:00', 'Asia/Jakarta');
    const end = localToUtc(addDays(to, 1), '23:59', 'Asia/Jakarta');
    const rows = await tx
      .select({
        e: event,
        teamName: team.name,
        ku: team.ku,
        branchName: branch.name,
        tz: branch.timezone,
      })
      .from(event)
      .innerJoin(team, eq(team.id, event.teamId))
      .leftJoin(branch, eq(branch.id, sql`coalesce(${event.branchId}, ${team.branchId})`))
      .where(
        and(
          gte(event.startsAt, start),
          lte(event.startsAt, end),
          teamIds ? inArray(event.teamId, teamIds) : undefined,
          branchId ? sql`coalesce(${event.branchId}, ${team.branchId}) = ${branchId}` : undefined,
        ),
      )
      .orderBy(asc(event.startsAt));
    return rows
      .map((r) => toDto(r.e, r.teamName, r.ku, r.branchName, zoneOf(r.tz)))
      .filter((e) => {
        const local = utcToLocalDate(new Date(e.startsAt), zoneOf(e.timezone));
        return local >= from && local <= to;
      });
  }

  /** US-07: pola mingguan → sesi sampai akhir musim, melewati hari libur. */
  async createSeries(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof SeriesInputSchema>,
    meta: Meta,
  ): Promise<SeriesDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const { t, s } = await this.teamInActiveSeason(tx, input.teamId);
      const branchId = input.branchId ?? t.branchId ?? null;
      const zone = await this.zoneForBranch(tx, branchId);
      const from = todayIso() > s.startsOn ? todayIso() : s.startsOn;
      const holidays = await this.holidayDates(tx, branchId, from, s.endsOn);
      let created = 0;
      for (const weekday of [...new Set(input.weekdays)]) {
        const [series] = await tx
          .insert(eventSeries)
          .values({
            orgId: ctx.id,
            teamId: t.id,
            weekday,
            startTime: input.startTime,
            durationMin: input.durationMin,
            branchId,
            locationNote: input.locationNote ?? null,
            startsOn: from,
            endsOn: s.endsOn,
            createdBy: user.personId,
          })
          .returning();
        const occ = weeklyOccurrences(
          { weekday, startTime: input.startTime, durationMin: input.durationMin, zone },
          from,
          s.endsOn,
          holidays,
        );
        if (occ.length) {
          const inserted = await tx
            .insert(event)
            .values(
              occ.map((o) => ({
                orgId: ctx.id,
                teamId: t.id,
                seriesId: series!.id,
                occurrenceDate: o.occurrenceDate,
                kind: 'training' as const,
                startsAt: o.startsAt,
                endsAt: o.endsAt,
                branchId,
                locationNote: input.locationNote ?? null,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: event.id });
          created += inserted.length;
        }
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'schedule.series_created',
        entityType: 'team',
        entityId: t.id,
        meta: { weekdays: input.weekdays, startTime: input.startTime, sessions: created },
        ...meta,
      });
      return this.seriesOf(tx, t.id);
    });
  }

  listSeries(ctx: OrgContext, user: AuthUser, teamId: string) {
    return withTenant(this.db, ctx.id, user.personId, (tx) => this.seriesOf(tx, teamId));
  }

  /** Hentikan pola: sesi mendatang (yang belum diubah satu-satu & belum diabsen) dihapus. */
  async deleteSeries(ctx: OrgContext, user: AuthUser, seriesId: string, meta: Meta) {
    await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [series] = await tx
        .update(eventSeries)
        .set({ archivedAt: new Date() })
        .where(eq(eventSeries.id, seriesId))
        .returning();
      if (!series) throw new NotFoundException('Pola jadwal tidak ditemukan');
      const future = await tx
        .select({ id: event.id })
        .from(event)
        .leftJoin(attendance, eq(attendance.eventId, event.id))
        .where(
          and(
            eq(event.seriesId, seriesId),
            eq(event.isException, false),
            gte(event.startsAt, new Date()),
            isNull(attendance.id),
          ),
        );
      if (future.length)
        await tx.delete(event).where(
          inArray(
            event.id,
            future.map((f) => f.id),
          ),
        );
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'schedule.series_deleted',
        entityType: 'event_series',
        entityId: seriesId,
        meta: { removed: future.length },
        ...meta,
      });
    });
  }

  /** SCH-02: pertandingan, turnamen, ujian kenaikan level. */
  async createEvent(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof EventInputSchema>,
    meta: Meta,
  ): Promise<ScheduleEventDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const { t } = await this.teamInActiveSeason(tx, input.teamId);
      const branchId = input.branchId ?? t.branchId ?? null;
      const zone = await this.zoneForBranch(tx, branchId);
      const startsAt = localToUtc(input.date, input.startTime, zone);
      const [row] = await tx
        .insert(event)
        .values({
          orgId: ctx.id,
          teamId: t.id,
          kind: input.kind,
          title: input.title ?? null,
          startsAt,
          endsAt: new Date(startsAt.getTime() + input.durationMin * 60_000),
          branchId,
          locationNote: input.locationNote ?? null,
        })
        .returning();
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'schedule.event_created',
        entityType: 'event',
        entityId: row!.id,
        meta: { kind: input.kind },
        ...meta,
      });
      return (await this.dtoById(tx, row!.id))!;
    });
  }

  /**
   * Ubah/batalkan SATU sesi (US-07: tidak mengubah sesi lain). Perubahan dikirim ke wali &
   * pelatih tim lewat WhatsApp (COM-02).
   */
  async updateEvent(
    ctx: OrgContext,
    user: AuthUser,
    eventId: string,
    input: z.output<typeof EventUpdateSchema>,
    meta: Meta,
  ) {
    const { dto, annId } = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const before = await this.dtoById(tx, eventId);
      if (!before) throw new NotFoundException('Sesi tidak ditemukan');
      const [current] = await tx.select().from(event).where(eq(event.id, eventId));
      const branchId = input.branchId !== undefined ? input.branchId : current!.branchId;
      const zone = branchId ? await this.zoneForBranch(tx, branchId) : zoneOf(before.timezone);
      const oldStart = new Date(before.startsAt);
      const durationMin =
        input.durationMin ??
        Math.round((current!.endsAt.getTime() - current!.startsAt.getTime()) / 60_000);
      const date = input.date ?? utcToLocalDate(oldStart, zone);
      const time = input.startTime ?? utcToLocalTime(oldStart, zone);
      const startsAt = localToUtc(date, time, zone);
      const cancelled = Boolean(input.cancelReason);
      await tx
        .update(event)
        .set({
          startsAt,
          endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
          branchId,
          ...(input.locationNote !== undefined ? { locationNote: input.locationNote } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(cancelled ? { status: 'cancelled' as const, cancelReason: input.cancelReason! } : {}),
          isException: true,
          changedAt: new Date(),
        })
        .where(eq(event.id, eventId));
      const after = (await this.dtoById(tx, eventId))!;
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: cancelled ? 'schedule.event_cancelled' : 'schedule.event_changed',
        entityType: 'event',
        entityId: eventId,
        meta: { from: before.startsAt, to: after.startsAt, reason: input.cancelReason ?? null },
        ...meta,
      });
      const annId =
        input.notify && startsAt.getTime() > Date.now() - 3_600_000
          ? await this.changeAnnouncement(tx, ctx.id, user.personId, before, after)
          : null;
      return { dto: after, annId };
    });
    const sent = annId ? await this.announcements.deliver(ctx.id, annId) : null;
    return { ...dto, notified: sent?.whatsapp ?? 0 };
  }

  /** "Atur hari libur": meniadakan sesi pada tanggal itu + kabari wali/pelatih. */
  async addHoliday(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof HolidayInputSchema>,
    meta: Meta,
  ) {
    const messages = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [h] = await tx
        .insert(holiday)
        .values({
          orgId: ctx.id,
          date: input.date,
          name: input.name,
          branchId: input.branchId ?? null,
        })
        .returning();
      const affected = (
        await this.eventsInRange(tx, input.date, input.date, undefined, input.branchId ?? undefined)
      ).filter((e) => e.status === 'scheduled');
      const out: string[] = [];
      for (const e of affected) {
        await tx
          .update(event)
          .set({ status: 'cancelled', cancelReason: `Libur: ${input.name}`, changedAt: new Date() })
          .where(eq(event.id, e.id));
        if (new Date(e.startsAt).getTime() > Date.now()) {
          const id = await this.changeAnnouncement(tx, ctx.id, user.personId, e, {
            ...e,
            status: 'cancelled',
            cancelReason: `Libur: ${input.name}`,
          });
          if (id) out.push(id);
        }
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'schedule.holiday_added',
        entityType: 'holiday',
        entityId: h!.id,
        meta: { date: input.date, cancelled: affected.length },
        ...meta,
      });
      return out;
    });
    for (const id of messages) await this.announcements.deliver(ctx.id, id);
    return { cancelled: messages.length };
  }

  async removeHoliday(ctx: OrgContext, user: AuthUser, holidayId: string, meta: Meta) {
    await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [h] = await tx.delete(holiday).where(eq(holiday.id, holidayId)).returning();
      if (!h) throw new NotFoundException('Hari libur tidak ditemukan');
      // Sesi yang dibatalkan karena libur ini dijadwalkan kembali.
      await tx
        .update(event)
        .set({ status: 'scheduled', cancelReason: null })
        .where(
          and(
            eq(event.cancelReason, `Libur: ${h.name}`),
            gte(event.startsAt, localToUtc(addDays(h.date, -1), '00:00', 'Asia/Jakarta')),
            lte(event.startsAt, localToUtc(addDays(h.date, 1), '23:59', 'Asia/Jakarta')),
          ),
        );
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'schedule.holiday_removed',
        entityType: 'holiday',
        entityId: holidayId,
        ...meta,
      });
    });
  }

  listHolidays(ctx: OrgContext, user: AuthUser): Promise<HolidayDto[]> {
    return withTenant(this.db, ctx.id, user.personId, (tx) =>
      this.holidaysInRange(tx, todayIso(), '9999-12-31'),
    );
  }

  // ── Bantuan ────────────────────────────────────────────────────────────────

  /** COM-02: perubahan/pembatalan sesi → pengumuman sistem dengan status dibaca per penerima. */
  private async changeAnnouncement(
    tx: Tx,
    orgId: string,
    actorId: string,
    before: ScheduleEventDto,
    after: ScheduleEventDto,
  ): Promise<string | null> {
    const zone = zoneOf(after.timezone);
    const fmt = (e: ScheduleEventDto) =>
      `${formatHariTanggal(new Date(e.startsAt), zone)} · ${formatTimeRange(new Date(e.startsAt), new Date(e.endsAt), zone)}`;
    const perubahan =
      after.status === 'cancelled'
        ? `Dibatalkan (${after.cancelReason})`
        : `${fmt(before)} → ${fmt(after)}${after.branchName ? ` · ${after.branchName}` : ''}`;
    const recipients = new Map<string, string[]>();
    for (const g of await guardiansOfTeams(tx, [after.teamId]))
      recipients.set(g.guardianPersonId, [
        ...(recipients.get(g.guardianPersonId) ?? []),
        g.childName,
      ]);
    for (const c of await coachesOfTeams(tx, [after.teamId]))
      if (!recipients.has(c.personId)) recipients.set(c.personId, []);
    return this.announcements.createSystem(tx, orgId, {
      eventId: after.id,
      title: `${after.status === 'cancelled' ? 'Sesi dibatalkan' : 'Jadwal berubah'} · ${after.teamName}`,
      body: perubahan,
      teamName: after.teamName,
      recipients,
      authorPersonId: actorId,
    });
  }

  private async teamInActiveSeason(tx: Tx, teamId: string) {
    const [row] = await tx
      .select({ t: team, s: season })
      .from(team)
      .innerJoin(season, eq(season.id, team.seasonId))
      .where(and(eq(team.id, teamId), isNull(team.archivedAt)));
    if (!row) throw new NotFoundException('Tim tidak ditemukan');
    if (row.s.status !== 'active')
      throw new UnprocessableEntityException('Jadwal hanya bisa dibuat untuk tim di musim aktif');
    return row;
  }

  private async zoneForBranch(tx: Tx, branchId: string | null): Promise<ZonaWaktu> {
    if (!branchId) return 'Asia/Jakarta';
    const [b] = await tx
      .select({ tz: branch.timezone })
      .from(branch)
      .where(eq(branch.id, branchId));
    return zoneOf(b?.tz);
  }

  private async holidayDates(
    tx: Tx,
    branchId: string | null,
    from: string,
    to: string,
  ): Promise<Set<string>> {
    const rows = await tx
      .select({ date: holiday.date })
      .from(holiday)
      .where(
        and(
          gte(holiday.date, from),
          lte(holiday.date, to),
          branchId
            ? or(isNull(holiday.branchId), eq(holiday.branchId, branchId))
            : isNull(holiday.branchId),
        ),
      );
    return new Set(rows.map((r) => r.date));
  }

  private async holidaysInRange(tx: Tx, from: string, to: string): Promise<HolidayDto[]> {
    const rows = await tx
      .select({ id: holiday.id, date: holiday.date, name: holiday.name, branchName: branch.name })
      .from(holiday)
      .leftJoin(branch, eq(branch.id, holiday.branchId))
      .where(and(gte(holiday.date, from), lte(holiday.date, to)))
      .orderBy(asc(holiday.date));
    return rows;
  }

  private async seriesOf(tx: Tx, teamId: string): Promise<SeriesDto[]> {
    const rows = await tx
      .select({ s: eventSeries, teamName: team.name, branchName: branch.name })
      .from(eventSeries)
      .innerJoin(team, eq(team.id, eventSeries.teamId))
      .leftJoin(branch, eq(branch.id, eventSeries.branchId))
      .where(and(eq(eventSeries.teamId, teamId), isNull(eventSeries.archivedAt)))
      .orderBy(asc(eventSeries.weekday), asc(eventSeries.startTime));
    const upcoming = rows.length
      ? await tx
          .select({ seriesId: event.seriesId, n: count() })
          .from(event)
          .where(
            and(
              inArray(
                event.seriesId,
                rows.map((r) => r.s.id),
              ),
              gte(event.startsAt, new Date()),
              eq(event.status, 'scheduled'),
            ),
          )
          .groupBy(event.seriesId)
      : [];
    return rows.map((r) => ({
      id: r.s.id,
      teamId: r.s.teamId,
      teamName: r.teamName,
      weekday: r.s.weekday,
      startTime: r.s.startTime.slice(0, 5),
      durationMin: r.s.durationMin,
      branchName: r.branchName,
      locationNote: r.s.locationNote,
      upcoming: upcoming.find((u) => u.seriesId === r.s.id)?.n ?? 0,
    }));
  }

  async dtoById(tx: Tx, eventId: string): Promise<ScheduleEventDto | null> {
    const [r] = await tx
      .select({
        e: event,
        teamName: team.name,
        ku: team.ku,
        branchName: branch.name,
        tz: branch.timezone,
      })
      .from(event)
      .innerJoin(team, eq(team.id, event.teamId))
      .leftJoin(branch, eq(branch.id, sql`coalesce(${event.branchId}, ${team.branchId})`))
      .where(eq(event.id, eventId));
    return r ? toDto(r.e, r.teamName, r.ku, r.branchName, zoneOf(r.tz)) : null;
  }
}

function toDto(
  e: EventRow,
  teamName: string,
  ku: number,
  branchName: string | null,
  zone: ZonaWaktu,
): ScheduleEventDto {
  return {
    id: e.id,
    teamId: e.teamId,
    teamName,
    ku,
    kind: e.kind,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    timezone: zone,
    branchName,
    locationNote: e.locationNote,
    status: e.status,
    cancelReason: e.cancelReason,
    isException: e.isException,
    changedAt: e.changedAt?.toISOString() ?? null,
    seriesId: e.seriesId,
  };
}
