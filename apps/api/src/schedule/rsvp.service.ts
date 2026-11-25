import {
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  accessToken,
  branch,
  event,
  membership,
  notificationLog,
  organization,
  person,
  rsvp,
  season,
  team,
  teamMember,
  withContext,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  addDays,
  formatHariTanggal,
  formatTimeRange,
  localToUtc,
  REMINDER_LOCAL_TIME,
  rsvpOpen,
  utcToLocalDate,
  utcToLocalTime,
  withinQuietHours,
  type ChildEventDto,
  type TokenRsvpView,
} from '@sportgather/shared';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { hashToken, randomToken } from '../auth/crypto.js';
import type { AuthUser } from '../common/request.js';
import { ENV, type Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import {
  WHATSAPP_SENDER,
  type MessageSender,
  type OutboundMessage,
} from '../integrations/messaging.js';
import { guardiansOfTeams } from '../notifications/recipients.js';
import { zoneOf } from './schedule.service.js';

type Meta = { ip: string; userAgent: string | null };
const TOKEN_HOURS = 48;

interface ChildRef {
  orgId: string;
  membershipId: string;
}

@Injectable()
export class RsvpService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: MessageSender,
    private readonly audit: AuditService,
  ) {}

  private async myChildren(user: AuthUser): Promise<ChildRef[]> {
    const rows = await withContext(this.db, { personId: user.personId }, (tx) =>
      tx.execute<{ org_id: string; membership_id: string }>(
        sql`select org_id, membership_id from sg_my_children_orgs(${user.personId})`,
      ),
    );
    return rows.map((r) => ({ orgId: r.org_id, membershipId: r.membership_id }));
  }

  /** O-04: jadwal semua anak saya (lintas klub) + status RSVP. */
  async mySchedule(
    user: AuthUser,
    from: string,
    to: string,
    now = new Date(),
  ): Promise<ChildEventDto[]> {
    const refs = await this.myChildren(user);
    const out: ChildEventDto[] = [];
    for (const orgId of [...new Set(refs.map((r) => r.orgId))]) {
      const ids = refs.filter((r) => r.orgId === orgId).map((r) => r.membershipId);
      out.push(
        ...(await withTenant(this.db, orgId, user.personId, (tx) =>
          this.childEvents(tx, ids, from, to, now),
        )),
      );
    }
    return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async childEvents(
    tx: Tx,
    membershipIds: string[],
    from: string,
    to: string,
    now: Date,
    onlyEventIds?: string[],
  ): Promise<ChildEventDto[]> {
    if (!membershipIds.length) return [];
    const [org] = await tx.select({ name: organization.name }).from(organization);
    const rows = await tx
      .select({
        e: event,
        membershipId: membership.id,
        childName: person.fullName,
        teamName: team.name,
        branchName: branch.name,
        tz: branch.timezone,
        rsvpStatus: rsvp.status,
        rsvpNote: rsvp.note,
      })
      .from(teamMember)
      .innerJoin(membership, eq(membership.id, teamMember.membershipId))
      .innerJoin(person, eq(person.id, membership.personId))
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .innerJoin(season, and(eq(season.id, team.seasonId), eq(season.status, 'active')))
      .innerJoin(event, eq(event.teamId, team.id))
      .leftJoin(branch, eq(branch.id, sql`coalesce(${event.branchId}, ${team.branchId})`))
      .leftJoin(rsvp, and(eq(rsvp.eventId, event.id), eq(rsvp.membershipId, membership.id)))
      .where(
        and(
          inArray(membership.id, membershipIds),
          eq(membership.status, 'active'),
          isNull(teamMember.leftAt),
          onlyEventIds
            ? inArray(event.id, onlyEventIds)
            : and(
                gte(event.startsAt, localToUtc(addDays(from, -1), '00:00', 'Asia/Jakarta')),
                lte(event.startsAt, localToUtc(addDays(to, 1), '23:59', 'Asia/Jakarta')),
              ),
        ),
      )
      .orderBy(asc(event.startsAt));
    return rows
      .filter(
        (r) =>
          onlyEventIds || ((d) => d >= from && d <= to)(utcToLocalDate(r.e.startsAt, zoneOf(r.tz))),
      )
      .map((r) => ({
        eventId: r.e.id,
        membershipId: r.membershipId,
        childName: r.childName,
        orgName: org?.name ?? '',
        teamName: r.teamName,
        kind: r.e.kind,
        title: r.e.title,
        startsAt: r.e.startsAt.toISOString(),
        endsAt: r.e.endsAt.toISOString(),
        timezone: zoneOf(r.tz),
        location: [r.branchName, r.e.locationNote].filter(Boolean).join(', ') || null,
        status: r.e.status,
        cancelReason: r.e.cancelReason,
        changed: r.e.isException && r.e.changedAt !== null && r.e.status === 'scheduled',
        rsvp: r.rsvpStatus,
        rsvpNote: r.rsvpNote,
        rsvpOpen: r.e.status === 'scheduled' && rsvpOpen(r.e.startsAt, now),
      }));
  }

  /** RSVP dari aplikasi (wali login). */
  async submit(
    user: AuthUser,
    input: {
      eventId: string;
      membershipId: string;
      status: 'hadir' | 'izin' | 'sakit';
      note?: string | undefined;
    },
    meta: Meta,
    now = new Date(),
  ) {
    const ref = (await this.myChildren(user)).find((r) => r.membershipId === input.membershipId);
    if (!ref) throw new ForbiddenException('Anak ini tidak terhubung dengan akun Anda');
    return withTenant(this.db, ref.orgId, user.personId, (tx) =>
      this.write(tx, ref.orgId, user.personId, input, meta, now),
    );
  }

  private async write(
    tx: Tx,
    orgId: string,
    personId: string,
    input: {
      eventId: string;
      membershipId: string;
      status: 'hadir' | 'izin' | 'sakit';
      note?: string | undefined;
    },
    meta: Meta,
    now: Date,
  ) {
    const [item] = await this.childEvents(tx, [input.membershipId], '', '', now, [input.eventId]);
    if (!item) throw new NotFoundException('Sesi tidak ditemukan untuk anak ini');
    if (item.status === 'cancelled') throw new UnprocessableEntityException('Sesi ini dibatalkan');
    if (!item.rsvpOpen)
      throw new UnprocessableEntityException(
        'RSVP ditutup 2 jam sebelum sesi. Hubungi pelatih untuk perubahan mendadak.',
      );
    await tx
      .insert(rsvp)
      .values({
        orgId,
        eventId: input.eventId,
        membershipId: input.membershipId,
        status: input.status,
        note: input.note ?? null,
        respondedBy: personId,
        respondedAt: now,
      })
      .onConflictDoUpdate({
        target: [rsvp.eventId, rsvp.membershipId],
        set: {
          status: input.status,
          note: input.note ?? null,
          respondedBy: personId,
          respondedAt: now,
        },
      });
    await this.audit.log(tx, {
      orgId,
      actorPersonId: personId,
      action: 'rsvp.submitted',
      entityType: 'event',
      entityId: input.eventId,
      meta: { membershipId: input.membershipId, status: input.status },
      ...meta,
    });
    return { ...item, rsvp: input.status, rsvpNote: input.note ?? null };
  }

  // ── Link bertoken (dari WhatsApp, tanpa login ulang) ─────────────────────────

  async createToken(
    tx: Tx,
    orgId: string,
    guardianId: string,
    eventIds: string[],
    membershipIds: string[],
    now = new Date(),
  ): Promise<string> {
    const token = randomToken();
    await tx.insert(accessToken).values({
      orgId,
      tokenHash: hashToken(token),
      personId: guardianId,
      purpose: 'rsvp',
      payload: { eventIds, membershipIds },
      expiresAt: new Date(now.getTime() + TOKEN_HOURS * 3_600_000),
    });
    return token;
  }

  private async findToken(token: string) {
    const [found] = await withContext(this.db, {}, (tx) =>
      tx.execute<{ token_id: string; org_id: string }>(
        sql`select * from sg_find_access_token(${hashToken(token)})`,
      ),
    );
    if (!found) throw new NotFoundException('Link tidak ditemukan');
    return found;
  }

  async tokenView(token: string, now = new Date()): Promise<TokenRsvpView> {
    const found = await this.findToken(token);
    return withTenant(this.db, found.org_id, undefined, async (tx) => {
      const [t] = await tx.select().from(accessToken).where(eq(accessToken.id, found.token_id));
      const p = t!.payload as { eventIds: string[]; membershipIds: string[] };
      const [g] = await tx
        .select({ fullName: person.fullName })
        .from(person)
        .where(eq(person.id, t!.personId));
      const items = await this.childEvents(tx, p.membershipIds, '', '', now, p.eventIds);
      return {
        guardianName: g?.fullName ?? 'Wali',
        expired: t!.expiresAt.getTime() < now.getTime(),
        used: t!.usedAt !== null,
        items,
      };
    });
  }

  /** Simpan RSVP dari link bertoken — sekali pakai, berlaku 48 jam. */
  async tokenSubmit(
    token: string,
    responses: {
      eventId: string;
      membershipId: string;
      status: 'hadir' | 'izin' | 'sakit';
      note?: string | undefined;
    }[],
    meta: Meta,
    now = new Date(),
  ) {
    const found = await this.findToken(token);
    return withTenant(this.db, found.org_id, undefined, async (tx) => {
      const [t] = await tx
        .select()
        .from(accessToken)
        .where(eq(accessToken.id, found.token_id))
        .for('update');
      if (t!.usedAt) throw new GoneException('Link ini sudah dipakai. Ubah RSVP lewat aplikasi.');
      if (t!.expiresAt.getTime() < now.getTime())
        throw new GoneException('Link sudah kedaluwarsa (48 jam). Buka aplikasi untuk RSVP.');
      const p = t!.payload as { eventIds: string[]; membershipIds: string[] };
      for (const r of responses) {
        if (!p.eventIds.includes(r.eventId) || !p.membershipIds.includes(r.membershipId)) {
          throw new ForbiddenException('Link ini tidak berlaku untuk sesi/anak tersebut');
        }
      }
      // Konteks orang = pemilik token (wali), untuk catatan "dijawab oleh".
      await tx.execute(sql`select set_config('app.person_id', ${t!.personId}, true)`);
      const saved = [];
      for (const r of responses)
        saved.push(await this.write(tx, found.org_id, t!.personId, r, meta, now));
      await tx.update(accessToken).set({ usedAt: now }).where(eq(accessToken.id, t!.id));
      return saved;
    });
  }

  // ── Pengingat H-1 (PRD bagian 16) ───────────────────────────────────────────

  /**
   * Kirim pengingat sesi besok + link RSVP bertoken, pukul 17.00 waktu cabang, satu pesan
   * gabungan per wali per hari (beberapa anak). Aman dipanggil berulang (dedupe log).
   */
  async runReminders(now = new Date()): Promise<{ sent: number }> {
    const orgIds = (
      await withContext(this.db, {}, (tx) =>
        tx.execute<{ id: string }>(sql`select sg_all_org_ids() as id`),
      )
    ).map((r) => r.id);
    let sent = 0;
    for (const orgId of orgIds) {
      const messages = await withTenant(this.db, orgId, undefined, (tx) =>
        this.remindersForOrg(tx, orgId, now),
      );
      for (const m of messages) await this.whatsapp.send(m);
      sent += messages.length;
    }
    return { sent };
  }

  private async remindersForOrg(tx: Tx, orgId: string, now: Date): Promise<OutboundMessage[]> {
    const window = await tx
      .select({ e: event, teamName: team.name, tz: branch.timezone })
      .from(event)
      .innerJoin(team, eq(team.id, event.teamId))
      .innerJoin(season, and(eq(season.id, team.seasonId), eq(season.status, 'active')))
      .leftJoin(branch, eq(branch.id, sql`coalesce(${event.branchId}, ${team.branchId})`))
      .where(
        and(
          eq(event.status, 'scheduled'),
          gte(event.startsAt, now),
          lte(event.startsAt, new Date(now.getTime() + 2 * 86_400_000)),
        ),
      );
    // Sesi "besok" menurut zona cabang, dan sekarang sudah ≥ 17.00 (belum jam tenang).
    const due = window.filter(({ e, tz }) => {
      const zone = zoneOf(tz);
      return (
        utcToLocalDate(e.startsAt, zone) === addDays(utcToLocalDate(now, zone), 1) &&
        utcToLocalTime(now, zone) >= REMINDER_LOCAL_TIME &&
        !withinQuietHours(now, zone)
      );
    });
    if (!due.length) return [];
    const recipients = await guardiansOfTeams(tx, [...new Set(due.map((d) => d.e.teamId))]);
    const byGuardian = new Map<string, typeof recipients>();
    for (const r of recipients)
      byGuardian.set(r.guardianPersonId, [...(byGuardian.get(r.guardianPersonId) ?? []), r]);

    const messages: OutboundMessage[] = [];
    for (const [guardianId, kids] of byGuardian) {
      const items = kids.flatMap((k) =>
        due.filter((d) => d.e.teamId === k.teamId).map((d) => ({ kid: k, ...d })),
      );
      if (!items.length) continue;
      const day = utcToLocalDate(items[0]!.e.startsAt, zoneOf(items[0]!.tz));
      const logged = await tx
        .insert(notificationLog)
        .values({
          orgId,
          dedupeKey: `rsvp-reminder:${guardianId}:${day}`,
          template: 'pengingat_sesi',
          recipientPersonId: guardianId,
        })
        .onConflictDoNothing()
        .returning();
      if (!logged.length) continue;
      const token = await this.createToken(
        tx,
        orgId,
        guardianId,
        [...new Set(items.map((i) => i.e.id))],
        [...new Set(items.map((i) => i.kid.membershipId))],
        now,
      );
      const sesi = items
        .map((i) => {
          const zone = zoneOf(i.tz);
          return `${i.kid.childName} · ${i.teamName} · ${formatHariTanggal(i.e.startsAt, zone)} ${formatTimeRange(i.e.startsAt, i.e.endsAt, zone)}`;
        })
        .join('\n');
      messages.push({
        channel: 'whatsapp',
        to: kids[0]!.phone,
        template: 'pengingat_sesi',
        params: { sesi, link: `${this.env.WEB_ORIGIN}/t/${token}` },
      });
    }
    return messages;
  }
}
