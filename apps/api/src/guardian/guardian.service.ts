import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  attendance,
  consent,
  dataRequest,
  document,
  event,
  invoice,
  membership,
  organization,
  person,
  pushSubscription,
  team,
  teamMember,
  userAccount,
  withContext,
  withTenant,
  type Database,
} from '@sportgather/db';
import {
  formatRupiah,
  type DataRequestDto,
  type GuardianProfile,
  type HandleDataRequestSchema,
  type ProfileUpdateSchema,
} from '@sportgather/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { RegistrationsService } from '../players/registrations.service.js';
import { DocumentVault } from '../storage/storage.js';
import { toPdf, type Table } from '../reports/export.js';

type Meta = { ip: string; userAgent: string | null };

@Injectable()
export class GuardianService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly registrations: RegistrationsService,
    private readonly vault: DocumentVault,
    private readonly audit: AuditService,
  ) {}

  private async ref(user: AuthUser, membershipId: string) {
    const rows = await withContext(this.db, { personId: user.personId }, (tx) =>
      tx.execute<{ org_id: string; membership_id: string; child_person_id: string }>(
        sql`select * from sg_my_children_orgs(${user.personId})`,
      ),
    );
    const r = rows.find((x) => x.membership_id === membershipId);
    if (!r) throw new NotFoundException('Anak tidak ditemukan');
    return { orgId: r.org_id, childPersonId: r.child_person_id };
  }

  // ── O-08 ───────────────────────────────────────────────────────────────────

  async profile(user: AuthUser): Promise<GuardianProfile> {
    const children = await this.registrations.myChildren(user);
    const me = await withContext(this.db, { personId: user.personId }, async (tx) => {
      const [p] = await tx
        .select({
          fullName: person.fullName,
          phone: userAccount.phone,
          notifyWhatsapp: userAccount.notifyWhatsapp,
        })
        .from(person)
        .innerJoin(userAccount, eq(userAccount.personId, person.id))
        .where(eq(person.id, user.personId));
      const [sub] = await tx.select({ id: pushSubscription.id }).from(pushSubscription).limit(1);
      return { ...p!, pushEnabled: Boolean(sub) };
    });
    const extra = new Map<string, { photoPublic: boolean; deletionRequested: boolean }>();
    for (const orgId of new Set(children.map((c) => c.orgSlug))) {
      const inOrg = children.filter((c) => c.orgSlug === orgId);
      const { orgId: id } = await this.ref(user, inOrg[0]!.membershipId);
      const rows = await withTenant(this.db, id, user.personId, async (tx) => {
        const ms = await tx
          .select({ id: membership.id, photoPublic: membership.photoPublic })
          .from(membership)
          .where(
            inArray(
              membership.id,
              inOrg.map((c) => c.membershipId),
            ),
          );
        const reqs = await tx
          .select({ membershipId: dataRequest.membershipId })
          .from(dataRequest)
          .where(
            and(
              inArray(
                dataRequest.membershipId,
                inOrg.map((c) => c.membershipId),
              ),
              eq(dataRequest.status, 'pending'),
            ),
          );
        return ms.map((m) => ({
          ...m,
          deletionRequested: reqs.some((r) => r.membershipId === m.id),
        }));
      });
      for (const r of rows)
        extra.set(r.id, { photoPublic: r.photoPublic, deletionRequested: r.deletionRequested });
    }
    return {
      personId: user.personId,
      fullName: me.fullName,
      phone: me.phone,
      notifyWhatsapp: me.notifyWhatsapp,
      pushEnabled: me.pushEnabled,
      children: children
        .filter((c) => c.status !== 'rejected')
        .map((c) => ({
          membershipId: c.membershipId,
          fullName: c.fullName,
          orgName: c.orgName,
          ku: c.ku,
          teamName: c.teamName,
          ageVerified: c.ageVerified,
          photoPublic: extra.get(c.membershipId)?.photoPublic ?? false,
          deletionRequested: extra.get(c.membershipId)?.deletionRequested ?? false,
        })),
    };
  }

  async updateProfile(user: AuthUser, input: z.output<typeof ProfileUpdateSchema>) {
    await withContext(this.db, { personId: user.personId }, async (tx) => {
      if (input.fullName)
        await tx
          .update(person)
          .set({ fullName: input.fullName, updatedAt: new Date() })
          .where(eq(person.id, user.personId));
      if (input.notifyWhatsapp !== undefined)
        await tx
          .update(userAccount)
          .set({ notifyWhatsapp: input.notifyWhatsapp })
          .where(eq(userAccount.personId, user.personId));
    });
    return this.profile(user);
  }

  /** Izin publikasi foto anak (PRD bagian 8; default tidak). */
  async setPhotoConsent(user: AuthUser, membershipId: string, photoPublic: boolean, meta: Meta) {
    const { orgId } = await this.ref(user, membershipId);
    await withTenant(this.db, orgId, user.personId, async (tx) => {
      await tx.update(membership).set({ photoPublic }).where(eq(membership.id, membershipId));
      await this.audit.log(tx, {
        orgId,
        actorPersonId: user.personId,
        action: 'consent.photo',
        entityType: 'membership',
        entityId: membershipId,
        meta: { photoPublic },
        ...meta,
      });
    });
    return { membershipId, photoPublic };
  }

  async requestDeletion(
    user: AuthUser,
    membershipId: string,
    reason: string | undefined,
    meta: Meta,
  ) {
    const { orgId } = await this.ref(user, membershipId);
    return withTenant(this.db, orgId, user.personId, async (tx) => {
      const [open] = await tx
        .select({ id: dataRequest.id })
        .from(dataRequest)
        .where(and(eq(dataRequest.membershipId, membershipId), eq(dataRequest.status, 'pending')));
      if (open)
        throw new UnprocessableEntityException(
          'Permintaan hapus data sudah dikirim dan sedang diproses',
        );
      const [r] = await tx
        .insert(dataRequest)
        .values({ orgId, requesterPersonId: user.personId, membershipId, reason: reason ?? null })
        .returning({ id: dataRequest.id });
      await this.audit.log(tx, {
        orgId,
        actorPersonId: user.personId,
        action: 'data_request.create',
        entityType: 'membership',
        entityId: membershipId,
        ...meta,
      });
      return { id: r!.id };
    });
  }

  /** Salinan data pribadi anak (PDF): profil, keanggotaan, kehadiran, tagihan, dokumen. */
  async exportChild(user: AuthUser, membershipId: string, meta: Meta) {
    const { orgId, childPersonId } = await this.ref(user, membershipId);
    return withTenant(this.db, orgId, user.personId, async (tx) => {
      const [m] = await tx
        .select({ m: membership, p: person, org: organization.name })
        .from(membership)
        .innerJoin(person, eq(person.id, membership.personId))
        .innerJoin(organization, eq(organization.id, membership.orgId))
        .where(eq(membership.id, membershipId));
      const teams = await tx
        .select({ name: team.name, joinedAt: teamMember.joinedAt, leftAt: teamMember.leftAt })
        .from(teamMember)
        .innerJoin(team, eq(team.id, teamMember.teamId))
        .where(eq(teamMember.membershipId, membershipId));
      const att = await tx
        .select({ status: attendance.status, n: sql<number>`count(*)::int` })
        .from(attendance)
        .innerJoin(event, eq(event.id, attendance.eventId))
        .where(eq(attendance.membershipId, membershipId))
        .groupBy(attendance.status);
      const invs = await tx
        .select()
        .from(invoice)
        .where(eq(invoice.membershipId, membershipId))
        .orderBy(desc(invoice.issueDate));
      const docs = await tx
        .select({
          kind: document.kind,
          fileName: document.fileName,
          status: document.status,
          createdAt: document.createdAt,
        })
        .from(document)
        .where(eq(document.personId, childPersonId));
      const consents = await tx
        .select()
        .from(consent)
        .where(eq(consent.subjectPersonId, childPersonId));
      await this.audit.log(tx, {
        orgId,
        actorPersonId: user.personId,
        action: 'data.export',
        entityType: 'membership',
        entityId: membershipId,
        ...meta,
      });
      const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : '-');
      const tables: Table[] = [
        {
          title: 'Data anak',
          columns: [
            { header: 'Data', width: 20 },
            { header: 'Isi', width: 60 },
          ],
          rows: [
            ['Nama', m!.p.fullName],
            ['Tanggal lahir', m!.p.birthDate ?? '-'],
            ['Jenis kelamin', m!.p.gender ?? '-'],
            ['Klub', m!.org],
            ['Status', m!.m.status],
            ['Sekolah', m!.m.school ?? '-'],
            [
              'Kontak darurat',
              [m!.m.emergencyContactName, m!.m.emergencyContactPhone].filter(Boolean).join(' · ') ||
                '-',
            ],
            ['Izin publikasi foto', m!.m.photoPublic ? 'Ya' : 'Tidak'],
            ['Bergabung', d(m!.m.joinedAt)],
          ],
        },
        {
          title: 'Riwayat tim',
          columns: [
            { header: 'Tim', width: 40 },
            { header: 'Masuk', width: 20 },
            { header: 'Keluar', width: 20 },
          ],
          rows: teams.map((t) => [t.name, d(t.joinedAt), d(t.leftAt)]),
        },
        {
          title: 'Rekap kehadiran',
          columns: [
            { header: 'Status', width: 40 },
            { header: 'Jumlah sesi', width: 40 },
          ],
          rows: att.map((a) => [a.status, Number(a.n)]),
        },
        {
          title: 'Tagihan',
          columns: [
            { header: 'No.', width: 16 },
            { header: 'Untuk', width: 30 },
            { header: 'Jumlah', width: 16 },
            { header: 'Status', width: 16 },
          ],
          rows: invs.map((i) => [i.number, i.description, formatRupiah(i.total), i.status]),
        },
        {
          title: 'Dokumen & persetujuan',
          columns: [
            { header: 'Jenis', width: 20 },
            { header: 'Keterangan', width: 40 },
            { header: 'Tanggal', width: 20 },
          ],
          rows: [
            ...docs.map(
              (x) => [x.kind, `${x.fileName} (${x.status})`, d(x.createdAt)] as (string | null)[],
            ),
            ...consents.map(
              (c) =>
                [`persetujuan ${c.kind}`, `versi ${c.version}`, d(c.acceptedAt)] as (
                  string | null
                )[],
            ),
          ],
        },
      ];
      const today = new Date().toISOString().slice(0, 10);
      const bytes = await toPdf(
        m!.org,
        `Salinan data ${m!.p.fullName}`,
        { from: today, to: today, label: 'per hari ini' },
        tables,
      );
      return { bytes, name: `data-${m!.p.fullName.replace(/[^\w]+/g, '-').toLowerCase()}` };
    });
  }

  // ── Admin: permintaan hapus data ───────────────────────────────────────────

  async listRequests(ctx: OrgContext, user: AuthUser): Promise<DataRequestDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const requester = person;
      const rows = await tx
        .select({
          r: dataRequest,
          requesterName: requester.fullName,
          childPersonId: membership.personId,
        })
        .from(dataRequest)
        .innerJoin(membership, eq(membership.id, dataRequest.membershipId))
        .innerJoin(requester, eq(requester.id, dataRequest.requesterPersonId))
        .orderBy(desc(dataRequest.createdAt))
        .limit(100);
      const names = rows.length
        ? await tx
            .select({ id: person.id, fullName: person.fullName })
            .from(person)
            .where(
              inArray(
                person.id,
                rows.map((r) => r.childPersonId),
              ),
            )
        : [];
      return rows.map(({ r, requesterName, childPersonId }) => ({
        id: r.id,
        childName: names.find((n) => n.id === childPersonId)?.fullName ?? '-',
        requesterName,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        handledAt: r.handledAt?.toISOString() ?? null,
        note: r.note,
      }));
    });
  }

  /**
   * Selesaikan permintaan. "done": keanggotaan dinonaktifkan, data kontak dihapus, dan dokumen
   * usia dihapus dari storage. Catatan keuangan & absensi disimpan untuk kewajiban pembukuan
   * (ADR-029).
   */
  async handleRequest(
    ctx: OrgContext,
    user: AuthUser,
    id: string,
    input: z.output<typeof HandleDataRequestSchema>,
    meta: Meta,
  ) {
    const keys = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [r] = await tx
        .select({ r: dataRequest, childPersonId: membership.personId })
        .from(dataRequest)
        .innerJoin(membership, eq(membership.id, dataRequest.membershipId))
        .where(eq(dataRequest.id, id))
        .for('update', { of: dataRequest });
      if (!r) throw new NotFoundException('Permintaan tidak ditemukan');
      if (r.r.status !== 'pending')
        throw new UnprocessableEntityException('Permintaan sudah diproses');
      let removed: string[] = [];
      if (input.status === 'done') {
        await tx
          .update(membership)
          .set({
            status: 'left',
            statusReason: 'Data dihapus atas permintaan wali',
            school: null,
            emergencyContactName: null,
            emergencyContactPhone: null,
            photoPublic: false,
          })
          .where(eq(membership.id, r.r.membershipId));
        await tx
          .update(teamMember)
          .set({ leftAt: new Date() })
          .where(
            and(eq(teamMember.membershipId, r.r.membershipId), sql`${teamMember.leftAt} is null`),
          );
        const docs = await tx
          .delete(document)
          // Bukti bayar tetap disimpan (terhubung ke pembayaran, kewajiban pembukuan).
          .where(
            and(
              eq(document.personId, r.childPersonId),
              inArray(document.kind, ['akta', 'kia', 'kk', 'foto']),
            ),
          )
          .returning({ key: document.storageKey });
        removed = docs.map((x) => x.key);
      }
      await tx
        .update(dataRequest)
        .set({
          status: input.status,
          note: input.note ?? null,
          handledBy: user.personId,
          handledAt: new Date(),
        })
        .where(eq(dataRequest.id, id));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: `data_request.${input.status}`,
        entityType: 'data_request',
        entityId: id,
        meta: { documentsRemoved: removed.length },
        ...meta,
      });
      return removed;
    });
    for (const k of keys) await this.vault.remove(k).catch(() => undefined);
    return { id, status: input.status, documentsRemoved: keys.length };
  }
}
