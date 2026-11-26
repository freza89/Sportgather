import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  coachExperience,
  coachLicense,
  coachProfile,
  organization,
  person,
  staffRole,
  team,
  teamMember,
  teamStaff,
  userAccount,
  withContext,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  can,
  licenseDisplayStatus,
  LICENSE_REMINDER_DAYS,
  addDays,
  formatTanggalIso,
  type CoachExperienceInputSchema,
  type CoachLicenseDto,
  type CoachLicenseInputSchema,
  type CoachLicenseReviewSchema,
  type CoachProfileDto,
  type CoachProfileInputSchema,
  type CoachSummaryDto,
} from '@sportgather/shared';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { UploadedFile } from '../common/multipart.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { NotifierService } from '../notifications/notifier.js';
import { todayIso } from '../seasons/ku-context.js';
import { DocumentVault, MAX_DOCUMENT_BYTES, sniffMime } from '../storage/storage.js';

type Meta = { ip: string; userAgent: string | null };
type LicenseRow = typeof coachLicense.$inferSelect;

/** `me` = staf yang sedang login. */
export const SELF = 'me';

@Injectable()
export class CoachingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly vault: DocumentVault,
    private readonly audit: AuditService,
    private readonly notifier: NotifierService,
  ) {}

  // ── Akses ──────────────────────────────────────────────────────────────────

  /**
   * Owner/admin boleh semua staf; staf lain hanya profilnya sendiri. Staf yang dihapus
   * tidak bisa dibuka (404).
   */
  private async target(tx: Tx, ctx: OrgContext, user: AuthUser, staffId: string) {
    const [row] = await tx
      .select({
        id: staffRole.id,
        personId: staffRole.personId,
        role: staffRole.role,
        fullName: person.fullName,
        phone: userAccount.phone,
      })
      .from(staffRole)
      .innerJoin(person, eq(person.id, staffRole.personId))
      .leftJoin(userAccount, eq(userAccount.personId, staffRole.personId))
      .where(
        and(
          ne(staffRole.status, 'removed'),
          staffId === SELF ? eq(staffRole.personId, user.personId) : eq(staffRole.id, staffId),
        ),
      );
    if (!row) throw new NotFoundException('Staf tidak ditemukan');
    const isSelf = row.personId === user.personId;
    const manager = can(ctx.role, 'coach_profile.manage');
    if (!isSelf && !manager) throw new NotFoundException('Staf tidak ditemukan');
    /** Lisensi yang diinput pihak ini langsung terverifikasi (admin untuk dirinya sendiri: tidak). */
    const trusted = manager && (!isSelf || ctx.role === 'owner');
    return { ...row, isSelf, manager, trusted };
  }

  private async editable(tx: Tx, ctx: OrgContext, user: AuthUser, staffId: string) {
    const t = await this.target(tx, ctx, user, staffId);
    // Admin tidak boleh mengubah profil owner/admin lain (selaras aturan staf A-03).
    if (!t.isSelf && ctx.role === 'admin' && (t.role === 'owner' || t.role === 'admin'))
      throw new ForbiddenException('Hanya owner yang bisa mengubah profil owner/admin');
    return t;
  }

  // ── Profil ─────────────────────────────────────────────────────────────────

  get(ctx: OrgContext, user: AuthUser, staffId: string): Promise<CoachProfileDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.target(tx, ctx, user, staffId);
      return this.dto(tx, ctx, t);
    });
  }

  private async dto(
    tx: Tx,
    ctx: OrgContext,
    t: Awaited<ReturnType<CoachingService['target']>>,
  ): Promise<CoachProfileDto> {
    const [p] = await tx.select().from(coachProfile).where(eq(coachProfile.staffRoleId, t.id));
    const exps = await tx
      .select()
      .from(coachExperience)
      .where(eq(coachExperience.staffRoleId, t.id))
      .orderBy(
        sql`${coachExperience.endYear} is not null`,
        desc(coachExperience.endYear),
        desc(coachExperience.startYear),
      );
    const lics = await tx
      .select()
      .from(coachLicense)
      .where(eq(coachLicense.staffRoleId, t.id))
      .orderBy(desc(coachLicense.createdAt));
    const teams = await tx
      .select({ id: team.id, name: team.name })
      .from(teamStaff)
      .innerJoin(team, eq(team.id, teamStaff.teamId))
      .where(and(eq(teamStaff.staffRoleId, t.id), isNull(team.archivedAt)))
      .orderBy(asc(team.ku), asc(team.name));
    const today = todayIso();
    const editable =
      t.isSelf || (t.manager && !(ctx.role === 'admin' && ['owner', 'admin'].includes(t.role)));
    return {
      staffId: t.id,
      personId: t.personId,
      fullName: t.fullName,
      phone: t.phone,
      role: t.role,
      teams,
      profile: {
        headline: p?.headline ?? null,
        specialization: p?.specialization ?? null,
        bio: p?.bio ?? null,
        yearsCoaching: p?.yearsCoaching ?? null,
        playingBackground: p?.playingBackground ?? null,
        education: p?.education ?? null,
        city: p?.city ?? null,
        hasPhoto: Boolean(p?.photoStorageKey),
        updatedAt: p?.updatedAt.toISOString() ?? null,
      },
      experiences: exps.map((e) => ({
        id: e.id,
        title: e.title,
        organization: e.organization,
        startYear: e.startYear,
        endYear: e.endYear,
        description: e.description,
      })),
      licenses: lics.map((l) => licenseDto(l, today)),
      canEdit: editable,
      canReview: t.manager && (!t.isSelf || ctx.role === 'owner'),
    };
  }

  async update(
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
    input: z.output<typeof CoachProfileInputSchema>,
    meta: Meta,
  ): Promise<CoachProfileDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.editable(tx, ctx, user, staffId);
      await tx
        .insert(coachProfile)
        .values({ orgId: ctx.id, staffRoleId: t.id, ...input, updatedBy: user.personId })
        .onConflictDoUpdate({
          target: coachProfile.staffRoleId,
          set: { ...input, updatedBy: user.personId, updatedAt: new Date() },
        });
      await this.log(tx, ctx, user, 'coach_profile.updated', t.id, meta);
      return this.dto(tx, ctx, t);
    });
  }

  async setPhoto(
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
    file: UploadedFile | undefined,
    meta: Meta,
  ): Promise<CoachProfileDto> {
    if (!file) throw new UnprocessableEntityException('Pilih foto');
    const type = checkFile(file);
    if (type.mime === 'application/pdf')
      throw new UnprocessableEntityException('Foto harus JPG atau PNG');
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.editable(tx, ctx, user, staffId);
      const [old] = await tx
        .select({ key: coachProfile.photoStorageKey })
        .from(coachProfile)
        .where(eq(coachProfile.staffRoleId, t.id));
      const { storageKey } = await this.vault.save(ctx.id, file.buffer);
      await tx
        .insert(coachProfile)
        .values({
          orgId: ctx.id,
          staffRoleId: t.id,
          photoStorageKey: storageKey,
          photoMimeType: type.mime,
          updatedBy: user.personId,
        })
        .onConflictDoUpdate({
          target: coachProfile.staffRoleId,
          set: { photoStorageKey: storageKey, photoMimeType: type.mime, updatedAt: new Date() },
        });
      if (old?.key) await this.vault.remove(old.key).catch(() => undefined);
      await this.log(tx, ctx, user, 'coach_profile.photo', t.id, meta);
      return this.dto(tx, ctx, t);
    });
  }

  async photo(ctx: OrgContext, user: AuthUser, staffId: string) {
    const row = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.target(tx, ctx, user, staffId);
      const [p] = await tx
        .select({ key: coachProfile.photoStorageKey, mime: coachProfile.photoMimeType })
        .from(coachProfile)
        .where(eq(coachProfile.staffRoleId, t.id));
      return p;
    });
    if (!row?.key) throw new NotFoundException('Belum ada foto');
    return { buffer: await this.vault.read(row.key), mimeType: row.mime ?? 'image/jpeg' };
  }

  // ── Pengalaman ─────────────────────────────────────────────────────────────

  async addExperience(
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
    input: z.output<typeof CoachExperienceInputSchema>,
    meta: Meta,
  ): Promise<CoachProfileDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.editable(tx, ctx, user, staffId);
      await tx.insert(coachExperience).values({ orgId: ctx.id, staffRoleId: t.id, ...input });
      await this.log(tx, ctx, user, 'coach_experience.created', t.id, meta);
      return this.dto(tx, ctx, t);
    });
  }

  async updateExperience(
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
    id: string,
    input: z.output<typeof CoachExperienceInputSchema> | null,
    meta: Meta,
  ): Promise<CoachProfileDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.editable(tx, ctx, user, staffId);
      const where = and(eq(coachExperience.id, id), eq(coachExperience.staffRoleId, t.id));
      const rows = input
        ? await tx
            .update(coachExperience)
            .set(input)
            .where(where)
            .returning({ id: coachExperience.id })
        : await tx.delete(coachExperience).where(where).returning({ id: coachExperience.id });
      if (!rows.length) throw new NotFoundException('Pengalaman tidak ditemukan');
      await this.log(
        tx,
        ctx,
        user,
        input ? 'coach_experience.updated' : 'coach_experience.deleted',
        t.id,
        meta,
      );
      return this.dto(tx, ctx, t);
    });
  }

  // ── Lisensi ────────────────────────────────────────────────────────────────

  /**
   * Status awal: "sedang proses" bila ditandai begitu; selain itu lisensi dari owner/admin
   * langsung terverifikasi, sedangkan dari pelatih sendiri menunggu verifikasi admin.
   */
  async addLicense(
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
    input: z.output<typeof CoachLicenseInputSchema>,
    file: UploadedFile | undefined,
    meta: Meta,
  ): Promise<CoachProfileDto> {
    const type = file ? checkFile(file) : null;
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.editable(tx, ctx, user, staffId);
      const stored = file && type ? await this.storeFile(ctx.id, file, type) : null;
      const status = input.inProgress ? 'in_progress' : t.trusted ? 'verified' : 'pending';
      const fields = withoutInProgress(input);
      const [lic] = await tx
        .insert(coachLicense)
        .values({
          orgId: ctx.id,
          staffRoleId: t.id,
          ...fields,
          ...(stored ?? {}),
          status,
          createdBy: user.personId,
          ...(status === 'verified' ? { reviewedBy: user.personId, reviewedAt: new Date() } : {}),
        })
        .returning({ id: coachLicense.id });
      await this.log(tx, ctx, user, 'coach_license.created', t.id, meta, {
        licenseId: lic!.id,
        status,
      });
      if (status === 'pending') await this.notifyManagers(tx, ctx, t.fullName, input.name);
      return this.dto(tx, ctx, t);
    });
  }

  /**
   * Ubah data/file lisensi. Bila pelatih sendiri yang mengubah lisensi yang sudah
   * terverifikasi atau ditolak, statusnya kembali menunggu verifikasi.
   */
  async updateLicense(
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
    id: string,
    input: z.output<typeof CoachLicenseInputSchema>,
    file: UploadedFile | undefined,
    meta: Meta,
  ): Promise<CoachProfileDto> {
    const type = file ? checkFile(file) : null;
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.editable(tx, ctx, user, staffId);
      const old = await this.license(tx, t.id, id);
      const stored = file && type ? await this.storeFile(ctx.id, file, type) : null;
      const status = input.inProgress
        ? 'in_progress'
        : t.trusted
          ? old.status === 'in_progress' || old.status === 'rejected'
            ? 'verified'
            : old.status
          : 'pending';
      const fields = withoutInProgress(input);
      const expiryChanged = fields.expiresOn !== old.expiresOn;
      await tx
        .update(coachLicense)
        .set({
          ...fields,
          ...(stored ?? {}),
          status,
          updatedAt: new Date(),
          ...(expiryChanged ? { reminderStage: null } : {}),
          ...(status === 'pending' || status === 'in_progress'
            ? { reviewedBy: null, reviewedAt: null, reviewNote: null }
            : {}),
          ...(status === 'verified' && old.status !== 'verified'
            ? { reviewedBy: user.personId, reviewedAt: new Date(), reviewNote: null }
            : {}),
        })
        .where(eq(coachLicense.id, id));
      if (stored && old.fileStorageKey)
        await this.vault.remove(old.fileStorageKey).catch(() => undefined);
      await this.log(tx, ctx, user, 'coach_license.updated', t.id, meta, { licenseId: id, status });
      if (status === 'pending' && old.status !== 'pending')
        await this.notifyManagers(tx, ctx, t.fullName, input.name);
      return this.dto(tx, ctx, t);
    });
  }

  async deleteLicense(
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
    id: string,
    meta: Meta,
  ): Promise<CoachProfileDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.editable(tx, ctx, user, staffId);
      const old = await this.license(tx, t.id, id);
      await tx.delete(coachLicense).where(eq(coachLicense.id, id));
      if (old.fileStorageKey) await this.vault.remove(old.fileStorageKey).catch(() => undefined);
      await this.log(tx, ctx, user, 'coach_license.deleted', t.id, meta, {
        licenseId: id,
        name: old.name,
      });
      return this.dto(tx, ctx, t);
    });
  }

  /** Verifikasi/tolak oleh owner/admin. Lisensi yang masih proses tidak bisa diverifikasi. */
  async review(
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
    id: string,
    input: z.output<typeof CoachLicenseReviewSchema>,
    meta: Meta,
  ): Promise<CoachProfileDto> {
    if (!can(ctx.role, 'coach_profile.manage'))
      throw new ForbiddenException('Hanya owner/admin yang bisa memverifikasi lisensi');
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.target(tx, ctx, user, staffId);
      if (t.isSelf && ctx.role !== 'owner')
        throw new ForbiddenException('Lisensi sendiri diverifikasi oleh owner');
      const old = await this.license(tx, t.id, id);
      if (old.status === 'in_progress')
        throw new UnprocessableEntityException(
          'Lisensi masih dalam proses. Lengkapi datanya dulu sebelum diverifikasi.',
        );
      await tx
        .update(coachLicense)
        .set({
          status: input.decision,
          reviewNote: input.decision === 'rejected' ? input.note : null,
          reviewedBy: user.personId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(coachLicense.id, id));
      await this.log(tx, ctx, user, `coach_license.${input.decision}`, t.id, meta, {
        licenseId: id,
      });
      const [org] = await tx
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, ctx.id));
      const r = (await this.notifier.recipients(tx, [t.personId])).get(t.personId);
      if (r && !t.isSelf)
        await this.notifier.send([r], {
          whatsapp: {
            template: 'lisensi_diperiksa',
            params: () => ({
              klub: org!.name,
              lisensi: old.name,
              hasil: input.decision === 'verified' ? 'terverifikasi' : 'ditolak',
              catatan: input.note ?? '-',
            }),
          },
        });
      return this.dto(tx, ctx, t);
    });
  }

  async licenseFile(ctx: OrgContext, user: AuthUser, staffId: string, id: string, meta: Meta) {
    const row = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const t = await this.target(tx, ctx, user, staffId);
      const l = await this.license(tx, t.id, id);
      if (l.fileStorageKey)
        await this.log(tx, ctx, user, 'coach_license.file_viewed', t.id, meta, { licenseId: id });
      return l;
    });
    if (!row.fileStorageKey) throw new NotFoundException('Lisensi ini belum punya file');
    return {
      buffer: await this.vault.read(row.fileStorageKey),
      mimeType: row.fileMimeType ?? 'application/octet-stream',
      fileName: row.fileName ?? 'lisensi',
    };
  }

  // ── Wali: ringkasan pelatih tim anak ───────────────────────────────────────

  async forGuardian(user: AuthUser, membershipId: string): Promise<CoachSummaryDto[]> {
    const orgId = await this.childOrg(user, membershipId);
    return withTenant(this.db, orgId, user.personId, async (tx) => {
      const coaches = await this.childCoaches(tx, membershipId);
      if (!coaches.length) return [];
      const ids = coaches.map((c) => c.staffId);
      const profiles = await tx
        .select()
        .from(coachProfile)
        .where(inArray(coachProfile.staffRoleId, ids));
      const lics = await tx
        .select()
        .from(coachLicense)
        .where(and(inArray(coachLicense.staffRoleId, ids), eq(coachLicense.status, 'verified')))
        .orderBy(desc(coachLicense.issuedOn));
      const exps = await tx
        .select()
        .from(coachExperience)
        .where(inArray(coachExperience.staffRoleId, ids))
        .orderBy(desc(coachExperience.startYear));
      const today = todayIso();
      return coaches.map((c) => {
        const p = profiles.find((x) => x.staffRoleId === c.staffId);
        return {
          staffId: c.staffId,
          fullName: c.fullName,
          teamName: c.teamName,
          headline: p?.headline ?? null,
          specialization: p?.specialization ?? null,
          yearsCoaching: p?.yearsCoaching ?? null,
          bio: p?.bio ?? null,
          hasPhoto: Boolean(p?.photoStorageKey),
          licenses: lics
            .filter((l) => l.staffRoleId === c.staffId && (!l.expiresOn || l.expiresOn >= today))
            .map((l) => ({
              name: l.name,
              issuer: l.issuer,
              level: l.level,
              expiresOn: l.expiresOn,
            })),
          experiences: exps
            .filter((e) => e.staffRoleId === c.staffId)
            .slice(0, 5)
            .map((e) => ({
              title: e.title,
              organization: e.organization,
              startYear: e.startYear,
              endYear: e.endYear,
            })),
        };
      });
    });
  }

  async guardianPhoto(user: AuthUser, membershipId: string, staffId: string) {
    const orgId = await this.childOrg(user, membershipId);
    const row = await withTenant(this.db, orgId, user.personId, async (tx) => {
      const coaches = await this.childCoaches(tx, membershipId);
      if (!coaches.some((c) => c.staffId === staffId))
        throw new NotFoundException('Pelatih tidak ditemukan');
      const [p] = await tx
        .select({ key: coachProfile.photoStorageKey, mime: coachProfile.photoMimeType })
        .from(coachProfile)
        .where(eq(coachProfile.staffRoleId, staffId));
      return p;
    });
    if (!row?.key) throw new NotFoundException('Belum ada foto');
    return { buffer: await this.vault.read(row.key), mimeType: row.mime ?? 'image/jpeg' };
  }

  private async childOrg(user: AuthUser, membershipId: string): Promise<string> {
    const rows = await withContext(this.db, { personId: user.personId }, (tx) =>
      tx.execute<{ org_id: string; membership_id: string }>(
        sql`select * from sg_my_children_orgs(${user.personId})`,
      ),
    );
    const r = rows.find((x) => x.membership_id === membershipId);
    if (!r) throw new NotFoundException('Anak tidak ditemukan');
    return r.org_id;
  }

  /** Pelatih/team manager aktif di tim yang sedang diikuti anak. */
  private async childCoaches(tx: Tx, membershipId: string) {
    return tx
      .selectDistinctOn([staffRole.id], {
        staffId: staffRole.id,
        fullName: person.fullName,
        teamName: team.name,
      })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .innerJoin(teamStaff, eq(teamStaff.teamId, team.id))
      .innerJoin(staffRole, eq(staffRole.id, teamStaff.staffRoleId))
      .innerJoin(person, eq(person.id, staffRole.personId))
      .where(
        and(
          eq(teamMember.membershipId, membershipId),
          isNull(teamMember.leftAt),
          isNull(team.archivedAt),
          eq(staffRole.status, 'active'),
        ),
      )
      .orderBy(staffRole.id);
  }

  // ── Pengingat masa berlaku ─────────────────────────────────────────────────

  /**
   * H-30 dan saat kedaluwarsa: WhatsApp ke pelatih + owner/admin. Satu kali per tahap
   * (`reminder_stage`); mengubah tanggal kedaluwarsa mengulang tahapnya.
   */
  async runExpiryReminders(now = new Date()): Promise<{ sent: number }> {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        hour12: false,
      }).format(now),
    );
    if (hour < 9 || hour >= 21) return { sent: 0 };
    const today = todayIso(now);
    const soon = addDays(today, LICENSE_REMINDER_DAYS);
    const orgIds = (
      await withContext(this.db, {}, (tx) =>
        tx.execute<{ id: string }>(sql`select sg_all_org_ids() as id`),
      )
    ).map((r) => r.id);
    let sent = 0;
    for (const orgId of orgIds) {
      sent += await withTenant(this.db, orgId, undefined, async (tx) => {
        const due = await tx
          .select({
            lic: coachLicense,
            coachPersonId: staffRole.personId,
            coachName: person.fullName,
          })
          .from(coachLicense)
          .innerJoin(staffRole, eq(staffRole.id, coachLicense.staffRoleId))
          .innerJoin(person, eq(person.id, staffRole.personId))
          .where(
            and(
              eq(staffRole.status, 'active'),
              inArray(coachLicense.status, ['verified', 'pending']),
              sql`${coachLicense.expiresOn} is not null`,
              sql`${coachLicense.expiresOn} <= ${soon}::date`,
              sql`coalesce(${coachLicense.reminderStage}, '') <> 'expired'`,
            ),
          );
        if (!due.length) return 0;
        const [org] = await tx
          .select({ name: organization.name })
          .from(organization)
          .where(eq(organization.id, orgId));
        const managers = await tx
          .select({ personId: staffRole.personId })
          .from(staffRole)
          .where(and(inArray(staffRole.role, ['owner', 'admin']), eq(staffRole.status, 'active')));
        let n = 0;
        for (const d of due) {
          const stage = d.lic.expiresOn! < today ? 'expired' : 'h-30';
          if (d.lic.reminderStage === stage) continue;
          const people = [d.coachPersonId, ...managers.map((m) => m.personId)];
          const recips = [...(await this.notifier.recipients(tx, people)).values()];
          await this.notifier.send(recips, {
            essential: true,
            whatsapp: {
              template: stage === 'expired' ? 'lisensi_kedaluwarsa' : 'lisensi_akan_habis',
              params: () => ({
                klub: org!.name,
                pelatih: d.coachName,
                lisensi: d.lic.name,
                tanggal: formatTanggalIso(d.lic.expiresOn!),
              }),
            },
          });
          await tx
            .update(coachLicense)
            .set({ reminderStage: stage })
            .where(eq(coachLicense.id, d.lic.id));
          n += recips.length;
        }
        return n;
      });
    }
    return { sent };
  }

  // ── Util ───────────────────────────────────────────────────────────────────

  private async license(tx: Tx, staffRoleId: string, id: string): Promise<LicenseRow> {
    const [l] = await tx
      .select()
      .from(coachLicense)
      .where(and(eq(coachLicense.id, id), eq(coachLicense.staffRoleId, staffRoleId)));
    if (!l) throw new NotFoundException('Lisensi tidak ditemukan');
    return l;
  }

  private async storeFile(orgId: string, file: UploadedFile, type: { mime: string; ext: string }) {
    const { storageKey } = await this.vault.save(orgId, file.buffer);
    return {
      fileStorageKey: storageKey,
      fileName: safeFileName(file.filename, type.ext),
      fileMimeType: type.mime,
      fileSizeBytes: file.buffer.length,
    };
  }

  /** Lisensi baru dari pelatih → owner/admin diberi tahu untuk memverifikasi. */
  private async notifyManagers(tx: Tx, ctx: OrgContext, coachName: string, licenseName: string) {
    const managers = await tx
      .select({ personId: staffRole.personId })
      .from(staffRole)
      .where(and(inArray(staffRole.role, ['owner', 'admin']), eq(staffRole.status, 'active')));
    const recips = [
      ...(
        await this.notifier.recipients(
          tx,
          managers.map((m) => m.personId),
        )
      ).values(),
    ];
    await this.notifier.send(recips, {
      whatsapp: {
        template: 'lisensi_perlu_verifikasi',
        params: () => ({ pelatih: coachName, lisensi: licenseName }),
      },
    });
  }

  private log(
    tx: Tx,
    ctx: OrgContext,
    user: AuthUser,
    action: string,
    staffRoleId: string,
    meta: Meta,
    extra: Record<string, unknown> = {},
  ) {
    return this.audit.log(tx, {
      orgId: ctx.id,
      actorPersonId: user.personId,
      action,
      entityType: 'staff_role',
      entityId: staffRoleId,
      meta: extra,
      ...meta,
    });
  }
}

function withoutInProgress(input: z.output<typeof CoachLicenseInputSchema>) {
  return {
    name: input.name,
    issuer: input.issuer,
    level: input.level,
    licenseNumber: input.licenseNumber,
    issuedOn: input.issuedOn,
    expiresOn: input.expiresOn,
  };
}

function checkFile(file: UploadedFile) {
  if (file.buffer.length === 0) throw new UnprocessableEntityException('File kosong');
  if (file.buffer.length > MAX_DOCUMENT_BYTES)
    throw new PayloadTooLargeException('Ukuran file maksimal 5 MB');
  const type = sniffMime(file.buffer);
  if (!type) throw new UnprocessableEntityException('Format file harus JPG, PNG, atau PDF');
  return type;
}

function safeFileName(name: string, ext: string): string {
  const base =
    (name || 'lisensi')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .slice(0, 60) || 'lisensi';
  return `${base}.${ext}`;
}

function licenseDto(l: LicenseRow, today: string): CoachLicenseDto {
  return {
    id: l.id,
    name: l.name,
    issuer: l.issuer,
    level: l.level,
    licenseNumber: l.licenseNumber,
    issuedOn: l.issuedOn,
    expiresOn: l.expiresOn,
    status: l.status,
    displayStatus: licenseDisplayStatus(l.status, l.expiresOn, today),
    file:
      l.fileStorageKey && l.fileName && l.fileMimeType
        ? { name: l.fileName, mimeType: l.fileMimeType, sizeBytes: l.fileSizeBytes ?? 0 }
        : null,
    reviewNote: l.reviewNote,
    reviewedAt: l.reviewedAt?.toISOString() ?? null,
  };
}
