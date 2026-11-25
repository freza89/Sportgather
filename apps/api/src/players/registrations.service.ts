import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  consent,
  document,
  guardianLink,
  membership,
  organization,
  person,
  team,
  teamMember,
  userAccount,
  withContext,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  CONSENT_VERSION,
  duplicateKey,
  kuFor,
  RegistrationSchema,
  type AcceptRegistrationSchema,
  type ChildSummary,
  type PublicOrgInfo,
  type RegistrationQueueItem,
  type RegistrationResult,
} from '@sportgather/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { UploadedFile } from '../common/multipart.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { ENV, type Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import { WHATSAPP_SENDER, type MessageSender } from '../integrations/messaging.js';
import { loadKuContext } from '../seasons/ku-context.js';
import { DocumentVault } from '../storage/storage.js';
import { TeamsService } from '../teams/teams.service.js';
import { docStatusOf, storeDocument, toDocumentDto } from './documents.js';

type Meta = { ip: string; userAgent: string | null };

@Injectable()
export class RegistrationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: MessageSender,
    private readonly audit: AuditService,
    private readonly vault: DocumentVault,
    private readonly teams: TeamsService,
  ) {}

  private async orgIdBySlug(slug: string): Promise<string> {
    const [row] = await withContext(this.db, {}, (tx) =>
      tx.execute<{ id: string | null }>(sql`select sg_org_id_by_slug(${slug}) as id`),
    );
    if (!row?.id) throw new NotFoundException('Klub tidak ditemukan');
    return row.id;
  }

  /** Data publik minimal untuk formulir O-01 (nama klub & aturan perkiraan KU). */
  async publicInfo(slug: string): Promise<PublicOrgInfo> {
    const orgId = await this.orgIdBySlug(slug);
    return withTenant(this.db, orgId, undefined, async (tx) => {
      const [org] = await tx.select().from(organization).where(eq(organization.id, orgId));
      const kc = await loadKuContext(tx);
      return {
        name: org!.name,
        slug: org!.slug,
        city: org!.city,
        referenceDate: kc.referenceDate,
        kuRule: kc.config.rule,
        kuGroups: [...kc.config.groups],
      };
    });
  }

  /**
   * O-01 / US-03: wali (sudah login lewat OTP) mendaftarkan satu atau beberapa anak.
   * Persetujuan data wajib dan dicatat (siapa, kapan, versi). Dokumen usia dienkripsi.
   */
  async submit(
    slug: string,
    user: AuthUser,
    raw: unknown,
    files: Map<string, UploadedFile>,
    meta: Meta,
  ): Promise<RegistrationResult> {
    const parsed = RegistrationSchema.safeParse(raw);
    if (!parsed.success)
      throw new UnprocessableEntityException(
        parsed.error.issues[0]?.message ?? 'Data pendaftaran tidak valid',
      );
    const input = parsed.data;
    if (input.consentVersion !== CONSENT_VERSION)
      throw new UnprocessableEntityException(
        'Teks persetujuan sudah diperbarui. Muat ulang halaman.',
      );
    input.children.forEach((c, i) => {
      if (!files.get(`document_${i}`))
        throw new UnprocessableEntityException(`Unggah akta kelahiran / KIA untuk ${c.fullName}`);
    });
    const orgId = await this.orgIdBySlug(slug);

    const result = await withTenant(this.db, orgId, user.personId, async (tx) => {
      const kc = await loadKuContext(tx);
      const [org] = await tx
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, orgId));
      const [guardianAccount] = await tx
        .select({ phone: userAccount.phone })
        .from(userAccount)
        .where(eq(userAccount.id, user.userId));
      // Anak yang sudah terhubung ke wali ini (mis. terdaftar di klub lain) dipakai ulang.
      const linked = await tx
        .select({ id: person.id, fullName: person.fullName, birthDate: person.birthDate })
        .from(guardianLink)
        .innerJoin(person, eq(person.id, guardianLink.childPersonId))
        .where(eq(guardianLink.guardianPersonId, user.personId));
      const existingMembers = await tx
        .select({
          personId: membership.personId,
          fullName: person.fullName,
          birthDate: person.birthDate,
        })
        .from(membership)
        .innerJoin(person, eq(person.id, membership.personId));

      const out: RegistrationResult['children'] = [];
      for (const [i, child] of input.children.entries()) {
        const key = duplicateKey(child.fullName, child.birthDate);
        if (
          existingMembers.some((m) => m.birthDate && duplicateKey(m.fullName, m.birthDate) === key)
        ) {
          throw new ConflictException(`${child.fullName} sudah terdaftar di klub ini`);
        }
        let childId = linked.find(
          (l) => l.birthDate && duplicateKey(l.fullName, l.birthDate) === key,
        )?.id;
        if (!childId) {
          childId = crypto.randomUUID();
          await tx.insert(person).values({
            id: childId,
            fullName: child.fullName,
            birthDate: child.birthDate,
            gender: child.gender,
          });
        }
        const [m] = await tx
          .insert(membership)
          .values({
            orgId,
            personId: childId,
            status: 'pending',
            source: 'online',
            school: child.school ?? null,
            emergencyContactName: input.emergencyContactName,
            emergencyContactPhone: input.emergencyContactPhone,
            registeredBy: user.personId,
          })
          .returning({ id: membership.id });
        if (!linked.some((l) => l.id === childId)) {
          await tx.insert(guardianLink).values({
            guardianPersonId: user.personId,
            childPersonId: childId,
            relation: input.relation,
            isPrimary: true,
          });
        }
        await tx.insert(consent).values({
          orgId,
          guardianPersonId: user.personId,
          subjectPersonId: childId,
          kind: 'data_anak',
          version: input.consentVersion,
          ip: meta.ip,
        });
        await storeDocument(tx, this.vault, {
          orgId,
          personId: childId,
          uploadedBy: user.personId,
          kind: child.documentKind,
          file: files.get(`document_${i}`)!,
        });
        await this.audit.log(tx, {
          orgId,
          actorPersonId: user.personId,
          action: 'registration.submitted',
          entityType: 'membership',
          entityId: m!.id,
          meta: { consentVersion: input.consentVersion },
          ...meta,
        });
        out.push({
          membershipId: m!.id,
          fullName: child.fullName,
          ku: kuFor(child.birthDate, kc.referenceDate, kc.config),
        });
      }
      return { orgName: org!.name, phone: guardianAccount?.phone ?? null, children: out };
    });

    if (result.phone) {
      await this.whatsapp.send({
        channel: 'whatsapp',
        to: result.phone,
        template: 'pendaftaran_diterima',
        params: { klub: result.orgName, anak: result.children.map((c) => c.fullName).join(', ') },
      });
    }
    return { children: result.children };
  }

  /** A-08: pendaftar menunggu verifikasi. */
  queue(ctx: OrgContext, user: AuthUser): Promise<RegistrationQueueItem[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const kc = await loadKuContext(tx);
      const rows = await tx
        .select({ m: membership, p: person })
        .from(membership)
        .innerJoin(person, eq(person.id, membership.personId))
        .where(eq(membership.status, 'pending'))
        .orderBy(asc(membership.createdAt));
      if (!rows.length) return [];
      const ids = rows.map((r) => r.p.id);
      const docs = await tx
        .select()
        .from(document)
        .where(inArray(document.personId, ids))
        .orderBy(desc(document.createdAt));
      const guardians = await tx
        .select({
          childId: guardianLink.childPersonId,
          fullName: person.fullName,
          relation: guardianLink.relation,
          phone: userAccount.phone,
          isPrimary: guardianLink.isPrimary,
        })
        .from(guardianLink)
        .innerJoin(person, eq(person.id, guardianLink.guardianPersonId))
        .leftJoin(userAccount, eq(userAccount.personId, person.id))
        .where(inArray(guardianLink.childPersonId, ids));
      return rows.map(({ m, p }) => {
        const g = guardians
          .filter((x) => x.childId === p.id)
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
        return {
          membershipId: m.id,
          personId: p.id,
          fullName: p.fullName,
          birthDate: p.birthDate,
          gender: p.gender,
          school: m.school,
          ku: p.birthDate ? kuFor(p.birthDate, kc.referenceDate, kc.config) : null,
          submittedAt: m.createdAt.toISOString(),
          status: 'pending' as const,
          guardian: g ? { fullName: g.fullName, relation: g.relation, phone: g.phone } : null,
          documents: docs.filter((d) => d.personId === p.id).map(toDocumentDto),
        };
      });
    });
  }

  /** US-04 terima: dokumen terverifikasi, pemain aktif, opsional langsung masuk tim (A-08 → A-10). */
  async accept(
    ctx: OrgContext,
    user: AuthUser,
    membershipId: string,
    input: z.output<typeof AcceptRegistrationSchema>,
    meta: Meta,
  ) {
    const res = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const m = await this.mustPending(tx, membershipId);
      const docs = await tx
        .select()
        .from(document)
        .where(and(eq(document.personId, m.personId), eq(document.status, 'pending')));
      if (!docs.some((d) => d.kind !== 'foto'))
        throw new UnprocessableEntityException('Belum ada dokumen usia untuk diverifikasi');
      await tx
        .update(document)
        .set({ status: 'verified', reviewedBy: user.personId, reviewedAt: new Date() })
        .where(and(eq(document.personId, m.personId), eq(document.status, 'pending')));
      await tx
        .update(membership)
        .set({
          status: 'active',
          statusReason: null,
          reviewedBy: user.personId,
          reviewedAt: new Date(),
          joinedAt: new Date(),
        })
        .where(eq(membership.id, membershipId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'registration.accepted',
        entityType: 'membership',
        entityId: membershipId,
        ...meta,
      });
      let teamName: string | null = null;
      if (input.teamId) {
        await this.teams.place(
          tx,
          ctx,
          user,
          input.teamId,
          { membershipId, jerseyNumber: input.jerseyNumber ?? null, reason: input.placementReason },
          meta,
        );
        const [t] = await tx
          .select({ name: team.name })
          .from(team)
          .where(eq(team.id, input.teamId));
        teamName = t?.name ?? null;
      }
      return { ...(await this.notifyTarget(tx, ctx.id, m.personId)), teamName };
    });
    if (res.phone) {
      await this.whatsapp.send({
        channel: 'whatsapp',
        to: res.phone,
        template: 'pendaftaran_disetujui',
        params: { anak: res.childName, klub: res.orgName, tim: res.teamName ?? '-' },
      });
    }
    return { ok: true };
  }

  /** US-04 tolak: wajib alasan, wali mendapat WhatsApp untuk memperbaiki dokumen. */
  async reject(ctx: OrgContext, user: AuthUser, membershipId: string, reason: string, meta: Meta) {
    const res = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const m = await this.mustPending(tx, membershipId);
      await tx
        .update(document)
        .set({
          status: 'rejected',
          rejectionReason: reason,
          reviewedBy: user.personId,
          reviewedAt: new Date(),
        })
        .where(and(eq(document.personId, m.personId), eq(document.status, 'pending')));
      await tx
        .update(membership)
        .set({
          status: 'rejected',
          statusReason: reason,
          reviewedBy: user.personId,
          reviewedAt: new Date(),
        })
        .where(eq(membership.id, membershipId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'registration.rejected',
        entityType: 'membership',
        entityId: membershipId,
        meta: { reason },
        ...meta,
      });
      return this.notifyTarget(tx, ctx.id, m.personId);
    });
    if (res.phone) {
      await this.whatsapp.send({
        channel: 'whatsapp',
        to: res.phone,
        template: 'dokumen_ditolak',
        params: {
          anak: res.childName,
          klub: res.orgName,
          alasan: reason,
          link: `${this.env.WEB_ORIGIN}/wali`,
        },
      });
    }
    return { ok: true };
  }

  /** Portal wali: anak-anak saya di semua klub (PAR-01). */
  async myChildren(user: AuthUser): Promise<ChildSummary[]> {
    const refs = await withContext(this.db, { personId: user.personId }, (tx) =>
      tx.execute<{ org_id: string; membership_id: string; child_person_id: string }>(
        sql`select * from sg_my_children_orgs(${user.personId})`,
      ),
    );
    const out: ChildSummary[] = [];
    for (const orgId of [...new Set(refs.map((r) => r.org_id))]) {
      const ids = refs.filter((r) => r.org_id === orgId).map((r) => r.membership_id);
      const rows = await withTenant(this.db, orgId, user.personId, async (tx) => {
        const kc = await loadKuContext(tx);
        const [org] = await tx
          .select({ name: organization.name, slug: organization.slug })
          .from(organization)
          .where(eq(organization.id, orgId));
        const members = await tx
          .select({ m: membership, p: person })
          .from(membership)
          .innerJoin(person, eq(person.id, membership.personId))
          .where(inArray(membership.id, ids));
        const docs = await tx
          .select({ personId: document.personId, kind: document.kind, status: document.status })
          .from(document)
          .where(
            inArray(
              document.personId,
              members.map((x) => x.p.id),
            ),
          );
        const teams = kc.season
          ? await tx
              .select({ membershipId: teamMember.membershipId, name: team.name })
              .from(teamMember)
              .innerJoin(team, eq(team.id, teamMember.teamId))
              .where(
                and(
                  eq(teamMember.seasonId, kc.season.id),
                  isNull(teamMember.leftAt),
                  inArray(teamMember.membershipId, ids),
                ),
              )
          : [];
        return members.map(({ m, p }): ChildSummary => ({
          membershipId: m.id,
          personId: p.id,
          fullName: p.fullName,
          birthDate: p.birthDate,
          orgName: org!.name,
          orgSlug: org!.slug,
          status: m.status,
          ku: p.birthDate ? kuFor(p.birthDate, kc.referenceDate, kc.config) : null,
          teamName: teams.find((t) => t.membershipId === m.id)?.name ?? null,
          ageVerified: docStatusOf(docs.filter((d) => d.personId === p.id)) === 'verified',
          rejectionReason: m.status === 'rejected' ? m.statusReason : null,
        }));
      });
      out.push(...rows);
    }
    return out.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /** "Perbaiki & kirim ulang": wali mengunggah dokumen baru, pendaftar kembali ke antrean. */
  async reupload(
    user: AuthUser,
    membershipId: string,
    kind: 'akta' | 'kia' | 'kk',
    file: UploadedFile | undefined,
    meta: Meta,
  ) {
    if (!file) throw new UnprocessableEntityException('Pilih file akta kelahiran / KIA');
    const refs = await withContext(this.db, { personId: user.personId }, (tx) =>
      tx.execute<{ org_id: string; membership_id: string; child_person_id: string }>(
        sql`select * from sg_my_children_orgs(${user.personId})`,
      ),
    );
    const ref = refs.find((r) => r.membership_id === membershipId);
    if (!ref) throw new ForbiddenException('Anak ini tidak terhubung dengan akun Anda');
    await withTenant(this.db, ref.org_id, user.personId, async (tx) => {
      const [m] = await tx.select().from(membership).where(eq(membership.id, membershipId));
      if (!m || (m.status !== 'rejected' && m.status !== 'pending')) {
        throw new ConflictException(
          'Dokumen hanya bisa dikirim ulang saat pendaftaran ditolak atau menunggu verifikasi',
        );
      }
      await storeDocument(tx, this.vault, {
        orgId: ref.org_id,
        personId: m.personId,
        uploadedBy: user.personId,
        kind,
        file,
      });
      await tx
        .update(membership)
        .set({ status: 'pending', statusReason: null })
        .where(eq(membership.id, membershipId));
      await this.audit.log(tx, {
        orgId: ref.org_id,
        actorPersonId: user.personId,
        action: 'document.resubmitted',
        entityType: 'membership',
        entityId: membershipId,
        ...meta,
      });
    });
    return { ok: true };
  }

  private async mustPending(tx: Tx, membershipId: string) {
    const [m] = await tx.select().from(membership).where(eq(membership.id, membershipId));
    if (!m) throw new NotFoundException('Pendaftar tidak ditemukan');
    if (m.status !== 'pending') throw new ConflictException('Pendaftar ini sudah diproses');
    return m;
  }

  private async notifyTarget(tx: Tx, orgId: string, childId: string) {
    const [org] = await tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId));
    const [child] = await tx
      .select({ fullName: person.fullName })
      .from(person)
      .where(eq(person.id, childId));
    const [g] = await tx
      .select({ phone: userAccount.phone })
      .from(guardianLink)
      .innerJoin(userAccount, eq(userAccount.personId, guardianLink.guardianPersonId))
      .where(and(eq(guardianLink.childPersonId, childId), eq(guardianLink.isPrimary, true)))
      .limit(1);
    return { orgName: org!.name, childName: child!.fullName, phone: g?.phone ?? null };
  }
}
