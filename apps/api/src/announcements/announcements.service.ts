import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  accessToken,
  announcement,
  announcementRecipient,
  branch,
  guardianLink,
  membership,
  organization,
  person,
  season,
  staffRole,
  team,
  teamMember,
  teamStaff,
  withContext,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  can,
  kuLabel,
  type AnnouncementDto,
  type AnnouncementInputSchema,
  type AnnouncementTarget,
  type AudiencePreview,
  type MyAnnouncement,
} from '@sportgather/shared';
import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { hashToken, randomToken } from '../auth/crypto.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { ENV, type Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import { NotifierService } from '../notifications/notifier.js';

type Meta = { ip: string; userAgent: string | null };
const TOKEN_DAYS = 30;

/** Jam tenang 21.00–06.00 WIB (PRD bagian 16). */
export function inQuietHours(d: Date): boolean {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(d),
  );
  return h >= 21 || h < 6;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger('Announcements');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly notifier: NotifierService,
    private readonly audit: AuditService,
  ) {}

  // ── Audiens ────────────────────────────────────────────────────────────────

  /** Tim yang boleh dijangkau pengirim: semua (owner/admin) atau tim yang dipegang (pelatih). */
  async allowedTeamIds(tx: Tx, ctx: OrgContext, user: AuthUser): Promise<string[] | null> {
    if (can(ctx.role, 'announcement.send_club')) return null;
    const rows = await tx
      .select({ id: teamStaff.teamId })
      .from(teamStaff)
      .innerJoin(staffRole, eq(staffRole.id, teamStaff.staffRoleId))
      .where(and(eq(staffRole.personId, user.personId), eq(staffRole.status, 'active')));
    return rows.map((r) => r.id);
  }

  /** Wali utama dari pemain aktif dalam target (tim di musim aktif) + nama anak. */
  async audience(
    tx: Tx,
    target: AnnouncementTarget,
  ): Promise<{ recipients: Map<string, string[]>; players: number; label: string }> {
    const [active] = await tx.select().from(season).where(eq(season.status, 'active')).limit(1);
    let label = 'Seluruh klub';
    let membershipIds: string[];
    if (target.kind === 'club') {
      membershipIds = (
        await tx
          .select({ id: membership.id })
          .from(membership)
          .where(eq(membership.status, 'active'))
      ).map((r) => r.id);
    } else {
      if (!active) return { recipients: new Map(), players: 0, label: '—' };
      const teams = await tx
        .select({ id: team.id, name: team.name, ku: team.ku, branchId: team.branchId })
        .from(team)
        .where(and(eq(team.seasonId, active.id), isNull(team.archivedAt)));
      let chosen = teams;
      if (target.kind === 'team') {
        chosen = teams.filter((t) => target.ids.includes(t.id));
        label = chosen.map((t) => t.name).join(' · ');
      } else if (target.kind === 'ku') {
        chosen = teams.filter((t) => target.kus.includes(t.ku));
        label = [...target.kus]
          .sort((a, b) => a - b)
          .map((k) => kuLabel(k))
          .join(' · ');
      } else {
        chosen = teams.filter((t) => t.branchId && target.ids.includes(t.branchId));
        const names = await tx
          .select({ name: branch.name })
          .from(branch)
          .where(inArray(branch.id, target.ids));
        label = names.map((n) => n.name).join(' · ');
      }
      if (!chosen.length) return { recipients: new Map(), players: 0, label: label || '—' };
      membershipIds = (
        await tx
          .select({ id: membership.id })
          .from(teamMember)
          .innerJoin(membership, eq(membership.id, teamMember.membershipId))
          .where(
            and(
              inArray(
                teamMember.teamId,
                chosen.map((t) => t.id),
              ),
              isNull(teamMember.leftAt),
              eq(membership.status, 'active'),
            ),
          )
      ).map((r) => r.id);
    }
    membershipIds = [...new Set(membershipIds)];
    if (!membershipIds.length) return { recipients: new Map(), players: 0, label };
    const child = person;
    const rows = await tx
      .select({ guardianId: guardianLink.guardianPersonId, childName: child.fullName })
      .from(membership)
      .innerJoin(child, eq(child.id, membership.personId))
      .innerJoin(
        guardianLink,
        and(eq(guardianLink.childPersonId, membership.personId), eq(guardianLink.isPrimary, true)),
      )
      .where(inArray(membership.id, membershipIds));
    const recipients = new Map<string, string[]>();
    for (const r of rows)
      recipients.set(r.guardianId, [...(recipients.get(r.guardianId) ?? []), r.childName]);
    return { recipients, players: membershipIds.length, label };
  }

  private async checkTarget(tx: Tx, ctx: OrgContext, user: AuthUser, target: AnnouncementTarget) {
    const allowed = await this.allowedTeamIds(tx, ctx, user);
    if (allowed === null) return;
    if (target.kind !== 'team' || target.ids.some((id) => !allowed.includes(id)))
      throw new ForbiddenException('Pelatih hanya bisa mengirim info ke tim yang dipegang');
  }

  async preview(
    ctx: OrgContext,
    user: AuthUser,
    target: AnnouncementTarget,
  ): Promise<AudiencePreview> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      await this.checkTarget(tx, ctx, user, target);
      const a = await this.audience(tx, target);
      return {
        players: a.players,
        guardians: a.recipients.size,
        multiChild: [...a.recipients.values()].filter((c) => c.length > 1).length,
        label: a.label,
      };
    });
  }

  // ── Buat & kirim ───────────────────────────────────────────────────────────

  async create(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof AnnouncementInputSchema>,
    meta: Meta,
  ) {
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt) {
      if (scheduledAt.getTime() < Date.now() + 5 * 60_000)
        throw new BadRequestException('Jadwal kirim minimal 5 menit dari sekarang');
      if (inQuietHours(scheduledAt))
        throw new BadRequestException('Jadwalkan di luar jam tenang 21.00–06.00');
    }
    const id = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      await this.checkTarget(tx, ctx, user, input.target);
      const a = await this.audience(tx, input.target);
      if (!a.recipients.size) throw new BadRequestException('Tidak ada wali di target ini');
      const [row] = await tx
        .insert(announcement)
        .values({
          orgId: ctx.id,
          authorPersonId: user.personId,
          title: input.title,
          body: input.body,
          targetKind: input.target.kind,
          targetIds: 'ids' in input.target ? input.target.ids : null,
          targetKus: 'kus' in input.target ? input.target.kus : null,
          targetLabel: a.label,
          viaWhatsapp: input.viaWhatsapp,
          viaPush: input.viaPush,
          status: scheduledAt ? 'scheduled' : 'sent',
          scheduledAt,
        })
        .returning({ id: announcement.id });
      if (!scheduledAt) await this.insertRecipients(tx, ctx.id, row!.id, a.recipients);
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: scheduledAt ? 'announcement.scheduled' : 'announcement.sent',
        entityType: 'announcement',
        entityId: row!.id,
        meta: { target: a.label, recipients: a.recipients.size },
        ...meta,
      });
      return row!.id;
    });
    const delivered = scheduledAt ? null : await this.deliver(ctx.id, id);
    return { id, scheduled: Boolean(scheduledAt), recipients: delivered?.recipients ?? 0 };
  }

  private async insertRecipients(
    tx: Tx,
    orgId: string,
    id: string,
    recipients: Map<string, string[]>,
  ) {
    if (!recipients.size) return;
    await tx.insert(announcementRecipient).values(
      [...recipients].map(([personId, childNames]) => ({
        orgId,
        announcementId: id,
        personId,
        childNames,
      })),
    );
  }

  /** Pengumuman sistem (perubahan jadwal, COM-02) dibuat di transaksi pemanggil. */
  async createSystem(
    tx: Tx,
    orgId: string,
    a: {
      eventId: string;
      title: string;
      body: string;
      teamName: string;
      recipients: Map<string, string[]>;
      authorPersonId: string | null;
    },
  ): Promise<string | null> {
    if (!a.recipients.size) return null;
    const [row] = await tx
      .insert(announcement)
      .values({
        orgId,
        authorPersonId: a.authorPersonId,
        source: 'schedule_change',
        eventId: a.eventId,
        title: a.title,
        body: a.body,
        targetKind: 'team',
        targetLabel: a.teamName,
        status: 'sent',
      })
      .returning({ id: announcement.id });
    await this.insertRecipients(tx, orgId, row!.id, a.recipients);
    return row!.id;
  }

  /** Kirim ke semua penerima yang belum dikirimi (aman diulang). */
  async deliver(
    orgId: string,
    id: string,
  ): Promise<{ recipients: number; whatsapp: number; push: number }> {
    const prepared = await withTenant(this.db, orgId, undefined, async (tx) => {
      const [a] = await tx
        .select({ a: announcement, orgName: organization.name })
        .from(announcement)
        .innerJoin(organization, eq(organization.id, announcement.orgId))
        .where(eq(announcement.id, id));
      if (!a) return null;
      const rows = await tx
        .select()
        .from(announcementRecipient)
        .where(
          and(
            eq(announcementRecipient.announcementId, id),
            isNull(announcementRecipient.whatsappAt),
            isNull(announcementRecipient.pushAt),
          ),
        );
      const info = await this.notifier.recipients(
        tx,
        rows.map((r) => r.personId),
      );
      const now = new Date();
      const list = [];
      for (const r of rows) {
        const token = randomToken();
        await tx.insert(accessToken).values({
          orgId,
          tokenHash: hashToken(token),
          personId: r.personId,
          purpose: 'announcement',
          payload: { announcementId: id },
          expiresAt: new Date(now.getTime() + TOKEN_DAYS * 86_400_000),
        });
        list.push({
          personId: r.personId,
          phone: info.get(r.personId)?.phone ?? null,
          notifyWhatsapp: info.get(r.personId)?.notifyWhatsapp ?? true,
          link: `${this.env.WEB_ORIGIN}/i/${token}`,
        });
      }
      return { a: a.a, orgName: a.orgName, list };
    });
    if (!prepared) throw new NotFoundException('Pengumuman tidak ditemukan');
    const { a, orgName, list } = prepared;
    const schedule = a.source === 'schedule_change';
    const result = await this.notifier.send(list, {
      essential: schedule,
      ...(a.viaWhatsapp
        ? {
            whatsapp: schedule
              ? {
                  template: 'perubahan_jadwal',
                  params: (r) => ({ tim: a.targetLabel, perubahan: a.body, link: r.link }),
                }
              : {
                  template: 'pengumuman',
                  params: (r) => ({
                    klub: orgName,
                    judul: a.title,
                    pesan: a.body.slice(0, 600),
                    link: r.link,
                  }),
                },
          }
        : {}),
      ...(a.viaPush
        ? {
            push: (r) => ({
              title: a.title,
              body: a.body.slice(0, 140),
              url: r.link,
              tag: `ann-${a.id}`,
            }),
          }
        : {}),
    });
    const now = new Date();
    await withTenant(this.db, orgId, undefined, async (tx) => {
      for (const [personId, res] of result) {
        if (!res.whatsapp && !res.push) continue;
        await tx
          .update(announcementRecipient)
          .set({
            ...(res.whatsapp ? { whatsappAt: now } : {}),
            ...(res.push ? { pushAt: now } : {}),
          })
          .where(
            and(
              eq(announcementRecipient.announcementId, id),
              eq(announcementRecipient.personId, personId),
            ),
          );
      }
      await tx
        .update(announcement)
        .set({ status: 'sent', sentAt: now })
        .where(eq(announcement.id, id));
    });
    const vals = [...result.values()];
    return {
      recipients: list.length,
      whatsapp: vals.filter((v) => v.whatsapp).length,
      push: vals.filter((v) => v.push).length,
    };
  }

  /** Job: kirim pengumuman terjadwal yang sudah jatuh waktunya. */
  async runScheduled(now = new Date()): Promise<{ sent: number }> {
    const orgIds = (
      await withContext(this.db, {}, (tx) =>
        tx.execute<{ id: string }>(sql`select sg_all_org_ids() as id`),
      )
    ).map((r) => r.id);
    let sent = 0;
    for (const orgId of orgIds) {
      const due = await withTenant(this.db, orgId, undefined, async (tx) => {
        const rows = await tx
          .select()
          .from(announcement)
          .where(
            and(
              eq(announcement.status, 'scheduled'),
              sql`${announcement.scheduledAt} <= ${now.toISOString()}::timestamptz`,
            ),
          )
          .for('update', { skipLocked: true });
        for (const a of rows) {
          const target: AnnouncementTarget =
            a.targetKind === 'club'
              ? { kind: 'club' }
              : a.targetKind === 'ku'
                ? { kind: 'ku', kus: a.targetKus ?? [] }
                : { kind: a.targetKind, ids: a.targetIds ?? [] };
          const aud = await this.audience(tx, target);
          await this.insertRecipients(tx, orgId, a.id, aud.recipients);
          await tx
            .update(announcement)
            .set({ status: 'sent', sentAt: now })
            .where(eq(announcement.id, a.id));
        }
        return rows.map((r) => r.id);
      });
      for (const id of due) {
        await this.deliver(orgId, id);
        sent++;
      }
    }
    return { sent };
  }

  async cancel(ctx: OrgContext, user: AuthUser, id: string, meta: Meta) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [a] = await tx.select().from(announcement).where(eq(announcement.id, id)).for('update');
      if (!a) throw new NotFoundException('Pengumuman tidak ditemukan');
      if (a.status !== 'scheduled')
        throw new BadRequestException('Hanya pengumuman terjadwal yang bisa dibatalkan');
      if (a.authorPersonId !== user.personId && !can(ctx.role, 'announcement.send_club'))
        throw new ForbiddenException('Bukan pengumuman Anda');
      await tx.update(announcement).set({ status: 'cancelled' }).where(eq(announcement.id, id));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'announcement.cancelled',
        entityType: 'announcement',
        entityId: id,
        ...meta,
      });
    });
  }

  // ── Riwayat & status dibaca ─────────────────────────────────────────────────

  async history(ctx: OrgContext, user: AuthUser): Promise<AnnouncementDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const allowed = await this.allowedTeamIds(tx, ctx, user);
      const rows = await tx
        .select({ a: announcement, authorName: person.fullName })
        .from(announcement)
        .leftJoin(person, eq(person.id, announcement.authorPersonId))
        .where(
          allowed === null
            ? undefined
            : allowed.length
              ? and(
                  eq(announcement.targetKind, 'team'),
                  sql`${announcement.targetIds} && ARRAY[${sql.join(
                    allowed.map((id) => sql`${id}`),
                    sql`, `,
                  )}]::uuid[]`,
                )
              : sql`false`,
        )
        .orderBy(desc(announcement.createdAt))
        .limit(50);
      if (!rows.length) return [];
      const stats = await tx
        .select({
          id: announcementRecipient.announcementId,
          total: count(),
          delivered: sql<number>`count(*) filter (where ${announcementRecipient.whatsappAt} is not null or ${announcementRecipient.pushAt} is not null)`,
          read: sql<number>`count(*) filter (where ${announcementRecipient.readAt} is not null)`,
        })
        .from(announcementRecipient)
        .where(
          inArray(
            announcementRecipient.announcementId,
            rows.map((r) => r.a.id),
          ),
        )
        .groupBy(announcementRecipient.announcementId);
      const byId = new Map(stats.map((s) => [s.id, s]));
      return rows.map(({ a, authorName }) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        targetLabel: a.targetLabel,
        source: a.source,
        authorName,
        status: a.status,
        scheduledAt: a.scheduledAt?.toISOString() ?? null,
        sentAt: a.sentAt?.toISOString() ?? null,
        recipients: Number(byId.get(a.id)?.total ?? 0),
        delivered: Number(byId.get(a.id)?.delivered ?? 0),
        read: Number(byId.get(a.id)?.read ?? 0),
      }));
    });
  }

  private async myOrgIds(user: AuthUser): Promise<string[]> {
    const rows = await withContext(this.db, { personId: user.personId }, (tx) =>
      tx.execute<{ org_id: string }>(
        sql`select distinct org_id from sg_my_children_orgs(${user.personId})`,
      ),
    );
    return rows.map((r) => r.org_id);
  }

  /** Untuk wali: pengumuman yang diterima di semua klub anak. */
  async mine(user: AuthUser, limit = 30): Promise<MyAnnouncement[]> {
    const out: MyAnnouncement[] = [];
    for (const orgId of await this.myOrgIds(user)) {
      const rows = await withTenant(this.db, orgId, user.personId, (tx) =>
        tx
          .select({
            a: announcement,
            r: announcementRecipient,
            orgName: organization.name,
            authorName: person.fullName,
          })
          .from(announcementRecipient)
          .innerJoin(announcement, eq(announcement.id, announcementRecipient.announcementId))
          .innerJoin(organization, eq(organization.id, announcement.orgId))
          .leftJoin(person, eq(person.id, announcement.authorPersonId))
          .where(
            and(eq(announcementRecipient.personId, user.personId), isNotNull(announcement.sentAt)),
          )
          .orderBy(desc(announcement.sentAt))
          .limit(limit),
      );
      out.push(
        ...rows.map((x) => ({
          id: x.a.id,
          orgName: x.orgName,
          title: x.a.title,
          body: x.a.body,
          authorName: x.authorName,
          sentAt: x.a.sentAt!.toISOString(),
          read: Boolean(x.r.readAt),
        })),
      );
    }
    return out.sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, limit);
  }

  async markRead(user: AuthUser, id: string): Promise<void> {
    for (const orgId of await this.myOrgIds(user)) {
      const n = await withTenant(this.db, orgId, user.personId, (tx) =>
        tx
          .update(announcementRecipient)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(announcementRecipient.announcementId, id),
              eq(announcementRecipient.personId, user.personId),
              isNull(announcementRecipient.readAt),
            ),
          )
          .returning({ id: announcementRecipient.id }),
      );
      if (n.length) return;
    }
  }

  /** Link bertoken dari WhatsApp/push: tampilkan pengumuman & tandai dibaca (tanpa login). */
  async openByToken(token: string): Promise<MyAnnouncement> {
    const [found] = await withContext(this.db, {}, (tx) =>
      tx.execute<{ token_id: string; org_id: string }>(
        sql`select * from sg_find_access_token(${hashToken(token)})`,
      ),
    );
    if (!found) throw new NotFoundException('Link tidak ditemukan');
    return withTenant(this.db, found.org_id, undefined, async (tx) => {
      const [t] = await tx.select().from(accessToken).where(eq(accessToken.id, found.token_id));
      if (!t || t.purpose !== 'announcement' || t.expiresAt < new Date())
        throw new NotFoundException('Link sudah tidak berlaku');
      const annId = (t.payload as { announcementId: string }).announcementId;
      const [x] = await tx
        .select({ a: announcement, orgName: organization.name, authorName: person.fullName })
        .from(announcement)
        .innerJoin(organization, eq(organization.id, announcement.orgId))
        .leftJoin(person, eq(person.id, announcement.authorPersonId))
        .where(eq(announcement.id, annId));
      if (!x) throw new NotFoundException('Pengumuman tidak ditemukan');
      await tx
        .update(announcementRecipient)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(announcementRecipient.announcementId, annId),
            eq(announcementRecipient.personId, t.personId),
            isNull(announcementRecipient.readAt),
          ),
        );
      return {
        id: x.a.id,
        orgName: x.orgName,
        title: x.a.title,
        body: x.a.body,
        authorName: x.authorName,
        sentAt: (x.a.sentAt ?? x.a.createdAt).toISOString(),
        read: true,
      };
    });
  }
}
