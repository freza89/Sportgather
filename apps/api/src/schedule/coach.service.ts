import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  attendance,
  attendanceOp,
  branch,
  event,
  eventSeries,
  guardianLink,
  membership,
  person,
  rsvp,
  season,
  staffRole,
  team,
  teamMember,
  teamStaff,
  userAccount,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  addDays,
  localToUtc,
  utcToLocalDate,
  WEEKDAY_SHORT,
  type AttendanceOp,
  type AttendanceSheet,
  type AttendanceSyncResult,
  type CoachTeamDto,
  type SessionSummary,
} from '@sportgather/shared';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { todayIso } from '../seasons/ku-context.js';
import { zoneOf } from './schedule.service.js';

type Meta = { ip: string; userAgent: string | null };

/**
 * Pelatih & team manager hanya melihat "tim sendiri" (PRD bagian 7). Owner/admin melihat
 * semua tim musim aktif.
 */
export async function scopedTeamIds(tx: Tx, ctx: OrgContext, user: AuthUser): Promise<string[]> {
  if (ctx.role === 'owner' || ctx.role === 'admin') {
    const rows = await tx
      .select({ id: team.id })
      .from(team)
      .innerJoin(season, eq(season.id, team.seasonId))
      .where(and(eq(season.status, 'active'), isNull(team.archivedAt)));
    return rows.map((r) => r.id);
  }
  const rows = await tx
    .select({ id: team.id })
    .from(teamStaff)
    .innerJoin(staffRole, eq(staffRole.id, teamStaff.staffRoleId))
    .innerJoin(team, eq(team.id, teamStaff.teamId))
    .innerJoin(season, eq(season.id, team.seasonId))
    .where(
      and(
        eq(staffRole.personId, user.personId),
        eq(staffRole.status, 'active'),
        eq(season.status, 'active'),
        isNull(team.archivedAt),
      ),
    );
  return rows.map((r) => r.id);
}

@Injectable()
export class CoachService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** P-01: sesi hari ini & besok untuk tim yang dipegang (default hari ini WIB). */
  today(ctx: OrgContext, user: AuthUser, date = todayIso()): Promise<SessionSummary[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const teamIds = await scopedTeamIds(tx, ctx, user);
      if (!teamIds.length) return [];
      const rows = await tx
        .select({ id: event.id })
        .from(event)
        .where(
          and(
            inArray(event.teamId, teamIds),
            gte(event.startsAt, localToUtc(date, '00:00', 'Asia/Jakarta')),
            lte(event.startsAt, localToUtc(addDays(date, 1), '23:59', 'Asia/Jakarta')),
          ),
        )
        .orderBy(asc(event.startsAt));
      return this.summaries(
        tx,
        rows.map((r) => r.id),
      );
    });
  }

  /** P-02: daftar pemain + RSVP + absensi tersimpan. */
  sheet(ctx: OrgContext, user: AuthUser, eventId: string): Promise<AttendanceSheet> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [e] = await tx.select().from(event).where(eq(event.id, eventId));
      if (!e || !(await scopedTeamIds(tx, ctx, user)).includes(e.teamId))
        throw new NotFoundException('Sesi tidak ditemukan');
      const [summary] = await this.summaries(tx, [eventId]);
      const players = await tx
        .select({
          membershipId: membership.id,
          fullName: person.fullName,
          jerseyNumber: teamMember.jerseyNumber,
          rsvp: rsvp.status,
          rsvpNote: rsvp.note,
          attendance: attendance.status,
          recordedAt: attendance.recordedAt,
        })
        .from(teamMember)
        .innerJoin(membership, eq(membership.id, teamMember.membershipId))
        .innerJoin(person, eq(person.id, membership.personId))
        .leftJoin(rsvp, and(eq(rsvp.membershipId, membership.id), eq(rsvp.eventId, eventId)))
        .leftJoin(
          attendance,
          and(eq(attendance.membershipId, membership.id), eq(attendance.eventId, eventId)),
        )
        .where(
          and(
            eq(teamMember.teamId, e.teamId),
            isNull(teamMember.leftAt),
            eq(membership.status, 'active'),
          ),
        )
        .orderBy(asc(person.fullName));
      return {
        event: summary!,
        players: players.map((p) => ({ ...p, recordedAt: p.recordedAt?.toISOString() ?? null })),
      };
    });
  }

  /**
   * ATT-01 / US-09: sinkron absensi dari HP. Idempoten per `clientOpId` (kirim ulang tidak
   * menggandakan data); bila dua perubahan untuk pemain yang sama, yang `recordedAt`-nya lebih
   * baru yang berlaku.
   */
  sync(
    ctx: OrgContext,
    user: AuthUser,
    ops: AttendanceOp[],
    meta: Meta,
  ): Promise<AttendanceSyncResult> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const result: AttendanceSyncResult = {
        accepted: 0,
        duplicates: 0,
        superseded: 0,
        rejected: [],
      };
      const teamIds = new Set(await scopedTeamIds(tx, ctx, user));
      const eventIds = [...new Set(ops.map((o) => o.eventId))];
      const events = new Map(
        (await tx.select().from(event).where(inArray(event.id, eventIds))).map((e) => [e.id, e]),
      );
      const members = await tx
        .select({ teamId: teamMember.teamId, membershipId: teamMember.membershipId })
        .from(teamMember)
        .where(
          and(
            inArray(teamMember.teamId, [...new Set([...events.values()].map((e) => e.teamId))]),
            isNull(teamMember.leftAt),
          ),
        );
      const inTeam = new Set(members.map((m) => `${m.teamId}:${m.membershipId}`));
      const now = Date.now();

      for (const op of [...ops].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
        const e = events.get(op.eventId);
        if (!e || !teamIds.has(e.teamId)) {
          result.rejected.push({ clientOpId: op.clientOpId, message: 'Sesi tidak ditemukan' });
          continue;
        }
        if (e.status === 'cancelled') {
          result.rejected.push({ clientOpId: op.clientOpId, message: 'Sesi dibatalkan' });
          continue;
        }
        // Absensi bisa diisi mulai H-1 (mis. izin yang sudah diketahui) menurut tanggal kalender WIB.
        if (
          utcToLocalDate(e.startsAt, 'Asia/Jakarta') >
          addDays(utcToLocalDate(new Date(now), 'Asia/Jakarta'), 1)
        ) {
          result.rejected.push({
            clientOpId: op.clientOpId,
            message: 'Absensi baru bisa diisi mulai H-1 sesi',
          });
          continue;
        }
        if (!inTeam.has(`${e.teamId}:${op.membershipId}`)) {
          result.rejected.push({
            clientOpId: op.clientOpId,
            message: 'Pemain bukan anggota tim ini',
          });
          continue;
        }
        const fresh = await tx
          .insert(attendanceOp)
          .values({ clientOpId: op.clientOpId, orgId: ctx.id })
          .onConflictDoNothing()
          .returning();
        if (!fresh.length) {
          result.duplicates++;
          continue;
        }
        const recordedAt = new Date(op.recordedAt);
        const written = await tx
          .insert(attendance)
          .values({
            orgId: ctx.id,
            eventId: op.eventId,
            membershipId: op.membershipId,
            status: op.status,
            recordedBy: user.personId,
            recordedAt,
            clientOpId: op.clientOpId,
          })
          .onConflictDoUpdate({
            target: [attendance.eventId, attendance.membershipId],
            set: {
              status: op.status,
              recordedBy: user.personId,
              recordedAt,
              clientOpId: op.clientOpId,
              syncedAt: new Date(),
            },
            // Date di template sql mentah tidak dikonversi driver: kirim ISO + cast.
            setWhere: sql`${attendance.recordedAt} < ${recordedAt.toISOString()}::timestamptz`,
          })
          .returning({ id: attendance.id });
        if (written.length) result.accepted++;
        else result.superseded++;
      }
      if (result.accepted) {
        await this.audit.log(tx, {
          orgId: ctx.id,
          actorPersonId: user.personId,
          action: 'attendance.synced',
          entityType: 'event',
          entityId: eventIds.length === 1 ? eventIds[0]! : null,
          meta: { ...result, rejected: result.rejected.length },
          ...meta,
        });
      }
      return result;
    });
  }

  /** P-03: pemain tim sendiri + kontak darurat (tanpa dokumen). */
  myTeams(ctx: OrgContext, user: AuthUser): Promise<CoachTeamDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const teamIds = await scopedTeamIds(tx, ctx, user);
      if (!teamIds.length) return [];
      const teams = await tx
        .select({ t: team, branchName: branch.name })
        .from(team)
        .leftJoin(branch, eq(branch.id, team.branchId))
        .where(inArray(team.id, teamIds))
        .orderBy(asc(team.ku), asc(team.name));
      const series = await tx
        .select()
        .from(eventSeries)
        .where(and(inArray(eventSeries.teamId, teamIds), isNull(eventSeries.archivedAt)));
      const members = await tx
        .select({
          teamId: teamMember.teamId,
          membershipId: membership.id,
          personId: membership.personId,
          fullName: person.fullName,
          jerseyNumber: teamMember.jerseyNumber,
          status: membership.status,
          statusReason: membership.statusReason,
          placement: teamMember.placement,
          actualKu: teamMember.actualKu,
          emergencyContactName: membership.emergencyContactName,
          emergencyContactPhone: membership.emergencyContactPhone,
        })
        .from(teamMember)
        .innerJoin(membership, eq(membership.id, teamMember.membershipId))
        .innerJoin(person, eq(person.id, membership.personId))
        .where(and(inArray(teamMember.teamId, teamIds), isNull(teamMember.leftAt)))
        .orderBy(asc(teamMember.jerseyNumber), asc(person.fullName));
      const guardians = members.length
        ? await tx
            .select({
              childId: guardianLink.childPersonId,
              fullName: person.fullName,
              phone: userAccount.phone,
            })
            .from(guardianLink)
            .innerJoin(person, eq(person.id, guardianLink.guardianPersonId))
            .leftJoin(userAccount, eq(userAccount.personId, guardianLink.guardianPersonId))
            .where(
              and(
                inArray(
                  guardianLink.childPersonId,
                  members.map((m) => m.personId),
                ),
                eq(guardianLink.isPrimary, true),
              ),
            )
        : [];
      const rates = await this.attendanceRates(tx, teamIds);
      return teams.map(({ t, branchName }) => {
        const pattern = series
          .filter((s) => s.teamId === t.id)
          .sort((a, b) => a.weekday - b.weekday)
          .map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.startTime.slice(0, 5).replace(':', '.')}`);
        return {
          id: t.id,
          name: t.name,
          ku: t.ku,
          schedule: pattern.join(' · ') || 'Belum ada jadwal',
          branchName,
          attendanceRate30d: rates.get(t.id) ?? null,
          members: members
            .filter((m) => m.teamId === t.id)
            .map(({ teamId: _t, personId, ...m }) => {
              const g = guardians.find((x) => x.childId === personId);
              return { ...m, guardianName: g?.fullName ?? null, guardianPhone: g?.phone ?? null };
            }),
        };
      });
    });
  }

  /** Persentase hadir 30 hari terakhir per tim (dari absensi yang diisi). */
  private async attendanceRates(tx: Tx, teamIds: string[]): Promise<Map<string, number>> {
    const rows = await tx
      .select({
        teamId: event.teamId,
        total: sql<number>`count(*)::int`,
        hadir: sql<number>`count(*) filter (where ${attendance.status} = 'hadir')::int`,
      })
      .from(attendance)
      .innerJoin(event, eq(event.id, attendance.eventId))
      .where(
        and(
          inArray(event.teamId, teamIds),
          gte(event.startsAt, new Date(Date.now() - 30 * 86_400_000)),
        ),
      )
      .groupBy(event.teamId);
    return new Map(
      rows.filter((r) => r.total > 0).map((r) => [r.teamId, Math.round((r.hadir / r.total) * 100)]),
    );
  }

  async summaries(tx: Tx, eventIds: string[]): Promise<SessionSummary[]> {
    if (!eventIds.length) return [];
    const rows = await tx
      .select({ e: event, teamName: team.name, branchName: branch.name, tz: branch.timezone })
      .from(event)
      .innerJoin(team, eq(team.id, event.teamId))
      .leftJoin(branch, eq(branch.id, sql`coalesce(${event.branchId}, ${team.branchId})`))
      .where(inArray(event.id, eventIds))
      .orderBy(asc(event.startsAt));
    const teamIds = [...new Set(rows.map((r) => r.e.teamId))];
    const roster = await tx
      .select({ teamId: teamMember.teamId, membershipId: teamMember.membershipId })
      .from(teamMember)
      .innerJoin(membership, eq(membership.id, teamMember.membershipId))
      .where(
        and(
          inArray(teamMember.teamId, teamIds),
          isNull(teamMember.leftAt),
          eq(membership.status, 'active'),
        ),
      );
    const rsvps = await tx
      .select({ eventId: rsvp.eventId, membershipId: rsvp.membershipId, status: rsvp.status })
      .from(rsvp)
      .where(inArray(rsvp.eventId, eventIds));
    const recorded = await tx
      .select({ eventId: attendance.eventId })
      .from(attendance)
      .where(inArray(attendance.eventId, eventIds));
    return rows.map(({ e, teamName, branchName, tz }) => {
      const players = roster.filter((r) => r.teamId === e.teamId).map((r) => r.membershipId);
      const mine = rsvps.filter((r) => r.eventId === e.id && players.includes(r.membershipId));
      const tally = (s: string) => mine.filter((r) => r.status === s).length;
      return {
        eventId: e.id,
        teamId: e.teamId,
        teamName,
        kind: e.kind,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        timezone: zoneOf(tz),
        location: [branchName, e.locationNote].filter(Boolean).join(', ') || null,
        status: e.status,
        playerCount: players.length,
        rsvp: {
          hadir: tally('hadir'),
          izin: tally('izin'),
          sakit: tally('sakit'),
          belum: players.length - mine.length,
        },
        attendanceRecorded: recorded.filter((r) => r.eventId === e.id).length,
      };
    });
  }
}
