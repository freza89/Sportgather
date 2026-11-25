import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  consent,
  document,
  guardianLink,
  membership,
  person,
  season,
  team,
  teamMember,
  userAccount,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  ageOn,
  duplicateKey,
  kuFor,
  normalizePhone,
  parseImportDate,
  parseImportGender,
  type ImportReport,
  type ImportRow,
  type ManualPlayerSchema,
  type PlayerDetail,
  type PlayerListQuerySchema,
  type PlayerListResponse,
  type PlayerRow,
  type UpdatePlayerSchema,
} from '@sportgather/shared';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { loadKuContext } from '../seasons/ku-context.js';
import { DocumentVault } from '../storage/storage.js';
import { docStatusOf, toDocumentDto } from './documents.js';

type Meta = { ip: string; userAgent: string | null };

/** Cari akun wali dari nomor WhatsApp; buat orang + akun bila belum ada. */
export async function findOrCreateGuardian(
  tx: Tx,
  fullName: string,
  phone: string,
): Promise<string> {
  const [existing] = await tx
    .select({ personId: userAccount.personId })
    .from(userAccount)
    .where(eq(userAccount.phone, phone));
  if (existing) return existing.personId;
  const personId = crypto.randomUUID();
  await tx.insert(person).values({ id: personId, fullName });
  await tx.insert(userAccount).values({ personId, phone });
  return personId;
}

@Injectable()
export class PlayersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly vault: DocumentVault,
  ) {}

  /** A-06: daftar pemain dengan KU (dihitung dari acuan musim aktif), tim, wali, status dokumen. */
  list(
    ctx: OrgContext,
    user: AuthUser,
    query: z.output<typeof PlayerListQuerySchema>,
  ): Promise<PlayerListResponse> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const kc = await loadKuContext(tx);
      const rows = await tx
        .select({
          membershipId: membership.id,
          personId: person.id,
          fullName: person.fullName,
          birthDate: person.birthDate,
          gender: person.gender,
          status: membership.status,
        })
        .from(membership)
        .innerJoin(person, eq(person.id, membership.personId))
        .orderBy(asc(person.fullName));
      const personIds = rows.map((r) => r.personId);
      const guardians = personIds.length
        ? await tx
            .select({
              childId: guardianLink.childPersonId,
              fullName: person.fullName,
              isPrimary: guardianLink.isPrimary,
            })
            .from(guardianLink)
            .innerJoin(person, eq(person.id, guardianLink.guardianPersonId))
            .where(inArray(guardianLink.childPersonId, personIds))
        : [];
      const docs = await tx
        .select({ personId: document.personId, kind: document.kind, status: document.status })
        .from(document);
      const teams = kc.season
        ? await tx
            .select({ membershipId: teamMember.membershipId, id: team.id, name: team.name })
            .from(teamMember)
            .innerJoin(team, eq(team.id, teamMember.teamId))
            .where(and(eq(teamMember.seasonId, kc.season.id), isNull(teamMember.leftAt)))
        : [];

      const all: PlayerRow[] = rows.map((r) => {
        const g = guardians
          .filter((x) => x.childId === r.personId)
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
        const t = teams.find((x) => x.membershipId === r.membershipId);
        return {
          membershipId: r.membershipId,
          personId: r.personId,
          fullName: r.fullName,
          birthDate: r.birthDate,
          gender: r.gender,
          ku: r.birthDate ? kuFor(r.birthDate, kc.referenceDate, kc.config) : null,
          team: t ? { id: t.id, name: t.name } : null,
          guardianName: g?.fullName ?? null,
          docStatus: docStatusOf(docs.filter((d) => d.personId === r.personId)),
          status: r.status,
        };
      });

      const active = all.filter((r) => r.status === 'active' || r.status === 'on_leave');
      const byStatus =
        query.status === 'all'
          ? all
          : query.status === 'active'
            ? active
            : all.filter((r) => r.status === query.status);
      const q = query.q?.toLowerCase();
      const filtered = byStatus.filter(
        (r) =>
          (query.ku === undefined || r.ku === query.ku) &&
          (!query.teamId || r.team?.id === query.teamId) &&
          (!q || r.fullName.toLowerCase().includes(q) || r.guardianName?.toLowerCase().includes(q)),
      );
      const kuCounts = [...kc.config.groups, null]
        .map((ku) => ({ ku, count: active.filter((r) => r.ku === ku).length }))
        .filter((c) => c.ku !== null || c.count > 0);
      const start = (query.page - 1) * query.pageSize;
      return {
        rows: filtered.slice(start, start + query.pageSize),
        total: filtered.length,
        page: query.page,
        pageSize: query.pageSize,
        kuCounts,
        activeCount: active.length,
        pendingCount: all.filter((r) => r.status === 'pending').length,
        referenceDate: kc.referenceDate,
      };
    });
  }

  /** A-07: profil pemain. */
  detail(ctx: OrgContext, user: AuthUser, membershipId: string): Promise<PlayerDetail> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const kc = await loadKuContext(tx);
      const [m] = await tx
        .select({ m: membership, p: person })
        .from(membership)
        .innerJoin(person, eq(person.id, membership.personId))
        .where(eq(membership.id, membershipId));
      if (!m) throw new NotFoundException('Pemain tidak ditemukan');
      const guardians = await tx
        .select({
          personId: person.id,
          fullName: person.fullName,
          relation: guardianLink.relation,
          isPrimary: guardianLink.isPrimary,
          phone: userAccount.phone,
        })
        .from(guardianLink)
        .innerJoin(person, eq(person.id, guardianLink.guardianPersonId))
        .leftJoin(userAccount, eq(userAccount.personId, person.id))
        .where(eq(guardianLink.childPersonId, m.p.id));
      const docs = await tx
        .select()
        .from(document)
        .where(eq(document.personId, m.p.id))
        .orderBy(desc(document.createdAt));
      const history = await tx
        .select({
          teamName: team.name,
          seasonName: season.name,
          joinedAt: teamMember.joinedAt,
          leftAt: teamMember.leftAt,
          seasonId: teamMember.seasonId,
          jerseyNumber: teamMember.jerseyNumber,
          placement: teamMember.placement,
          teamId: team.id,
        })
        .from(teamMember)
        .innerJoin(team, eq(team.id, teamMember.teamId))
        .innerJoin(season, eq(season.id, teamMember.seasonId))
        .where(eq(teamMember.membershipId, membershipId))
        .orderBy(desc(teamMember.joinedAt));
      const current = history.find((h) => h.leftAt === null && h.seasonId === kc.season?.id);
      const [c] = await tx
        .select({ acceptedAt: consent.acceptedAt })
        .from(consent)
        .where(and(eq(consent.subjectPersonId, m.p.id), isNull(consent.withdrawnAt)))
        .orderBy(desc(consent.acceptedAt))
        .limit(1);
      return {
        membershipId: m.m.id,
        personId: m.p.id,
        fullName: m.p.fullName,
        birthDate: m.p.birthDate,
        gender: m.p.gender,
        school: m.m.school,
        status: m.m.status,
        statusReason: m.m.statusReason,
        source: m.m.source,
        joinedAt: m.m.joinedAt.toISOString(),
        ku: m.p.birthDate ? kuFor(m.p.birthDate, kc.referenceDate, kc.config) : null,
        age: m.p.birthDate ? ageOn(m.p.birthDate, kc.referenceDate) : null,
        referenceDate: kc.referenceDate,
        team: current
          ? {
              id: current.teamId,
              name: current.teamName,
              jerseyNumber: current.jerseyNumber,
              placement: current.placement,
            }
          : null,
        guardians: guardians.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
        emergencyContactName: m.m.emergencyContactName,
        emergencyContactPhone: m.m.emergencyContactPhone,
        consentAt: c?.acceptedAt.toISOString() ?? null,
        documents: docs.map(toDocumentDto),
        teamHistory: history.map((h) => ({
          teamName: h.teamName,
          seasonName: h.seasonName,
          joinedAt: h.joinedAt.toISOString(),
          leftAt: h.leftAt?.toISOString() ?? null,
        })),
      };
    });
  }

  async update(
    ctx: OrgContext,
    user: AuthUser,
    membershipId: string,
    input: z.output<typeof UpdatePlayerSchema>,
    meta: Meta,
  ) {
    await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [m] = await tx.select().from(membership).where(eq(membership.id, membershipId));
      if (!m) throw new NotFoundException('Pemain tidak ditemukan');
      const { fullName, birthDate, gender, status, statusReason, ...club } = input;
      if (fullName !== undefined || birthDate !== undefined || gender !== undefined) {
        await tx
          .update(person)
          .set({
            ...(fullName ? { fullName } : {}),
            ...(birthDate ? { birthDate } : {}),
            ...(gender ? { gender } : {}),
            updatedAt: new Date(),
          })
          .where(eq(person.id, m.personId));
      }
      if (status && (m.status === 'pending' || m.status === 'rejected')) {
        throw new ConflictException('Pendaftar diproses lewat antrean verifikasi');
      }
      await tx
        .update(membership)
        .set({
          ...club,
          ...(status ? { status } : {}),
          ...(statusReason !== undefined ? { statusReason } : {}),
        })
        .where(eq(membership.id, membershipId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'player.updated',
        entityType: 'membership',
        entityId: membershipId,
        meta: { fields: Object.keys(input), status: status ?? null },
        ...meta,
      });
    });
    return this.detail(ctx, user, membershipId);
  }

  /** "Tambah pemain" oleh admin (A-06). Dokumen usia diunggah kemudian. */
  async createManual(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof ManualPlayerSchema>,
    meta: Meta,
  ) {
    const membershipId = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      await this.assertNotDuplicate(tx, input.fullName, input.birthDate);
      const childId = crypto.randomUUID();
      await tx.insert(person).values({
        id: childId,
        fullName: input.fullName,
        birthDate: input.birthDate,
        gender: input.gender,
      });
      const [m] = await tx
        .insert(membership)
        .values({
          orgId: ctx.id,
          personId: childId,
          status: 'active',
          source: 'manual',
          school: input.school ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
          registeredBy: user.personId,
        })
        .returning({ id: membership.id });
      const guardianId = await findOrCreateGuardian(
        tx,
        input.guardian.fullName,
        input.guardian.phone,
      );
      await tx.insert(guardianLink).values({
        guardianPersonId: guardianId,
        childPersonId: childId,
        relation: input.guardian.relation,
        isPrimary: true,
      });
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'player.created',
        entityType: 'membership',
        entityId: m!.id,
        meta: { source: 'manual' },
        ...meta,
      });
      return m!.id;
    });
    return this.detail(ctx, user, membershipId);
  }

  /**
   * US-02: impor ≤2.000 baris. Baris error ditampilkan dengan alasannya dan tidak ikut
   * tersimpan; duplikat (nama + tanggal lahir) di file atau di klub ditandai & dilewati.
   */
  async import(
    ctx: OrgContext,
    user: AuthUser,
    rows: ImportRow[],
    commit: boolean,
    meta: Meta,
  ): Promise<ImportReport> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const existing = await tx
        .select({ fullName: person.fullName, birthDate: person.birthDate })
        .from(membership)
        .innerJoin(person, eq(person.id, membership.personId))
        .where(ne(membership.status, 'left'));
      const seen = new Map<string, string>(
        existing
          .filter((e) => e.birthDate)
          .map((e) => [duplicateKey(e.fullName, e.birthDate!), e.fullName]),
      );
      const report: ImportReport = {
        total: rows.length,
        ready: 0,
        errors: [],
        duplicates: [],
        imported: 0,
      };
      const valid: {
        fullName: string;
        birthDate: string;
        gender: 'male' | 'female';
        school: string | null;
        guardianName: string;
        guardianPhone: string;
      }[] = [];

      rows.forEach((r, i) => {
        const rowNo = i + 2; // baris 1 = judul kolom
        const fullName = r.fullName?.trim().replace(/\s+/g, ' ') ?? '';
        const errs: string[] = [];
        if (fullName.length < 2) errs.push('Nama kosong');
        const birthDate = parseImportDate(r.birthDate);
        if (!r.birthDate?.trim()) errs.push('Tanggal lahir kosong');
        else if (!birthDate) errs.push(`Tanggal lahir ${r.birthDate.trim()} tidak valid`);
        const gender = parseImportGender(r.gender);
        if (!gender) errs.push('Gender tidak dikenali (L/P)');
        const guardianName = r.guardianName?.trim() ?? '';
        if (guardianName.length < 2) errs.push('Nama wali kosong');
        const guardianPhone = r.guardianPhone ? normalizePhone(String(r.guardianPhone)) : null;
        if (!guardianPhone) errs.push('Nomor WhatsApp tidak valid');
        if (errs.length) {
          report.errors.push({ row: rowNo, message: errs.join(' · ') });
          return;
        }
        const key = duplicateKey(fullName, birthDate!);
        const dup = seen.get(key);
        if (dup) {
          report.duplicates.push({
            row: rowNo,
            message: `Sama dengan “${dup}” (nama + tgl lahir)`,
          });
          return;
        }
        seen.set(key, fullName);
        valid.push({
          fullName,
          birthDate: birthDate!,
          gender: gender!,
          school: r.school?.trim() || null,
          guardianName,
          guardianPhone: guardianPhone!,
        });
      });
      report.ready = valid.length;
      if (!commit || valid.length === 0) return report;

      // Wali dengan nomor sama (kakak-adik) hanya dibuat sekali.
      const phones = [...new Set(valid.map((v) => v.guardianPhone))];
      const accounts = await tx
        .select({ personId: userAccount.personId, phone: userAccount.phone })
        .from(userAccount)
        .where(inArray(userAccount.phone, phones));
      const guardianByPhone = new Map(accounts.map((a) => [a.phone!, a.personId]));
      const newGuardians = phones
        .filter((p) => !guardianByPhone.has(p))
        .map((phone) => ({
          id: crypto.randomUUID(),
          phone,
          fullName: valid.find((v) => v.guardianPhone === phone)!.guardianName,
        }));
      for (const g of newGuardians) guardianByPhone.set(g.phone, g.id);

      const children = valid.map((v) => ({ ...v, id: crypto.randomUUID() }));
      const CHUNK = 500;
      for (let i = 0; i < newGuardians.length; i += CHUNK) {
        const part = newGuardians.slice(i, i + CHUNK);
        await tx.insert(person).values(part.map((g) => ({ id: g.id, fullName: g.fullName })));
        await tx.insert(userAccount).values(part.map((g) => ({ personId: g.id, phone: g.phone })));
      }
      for (let i = 0; i < children.length; i += CHUNK) {
        const part = children.slice(i, i + CHUNK);
        await tx.insert(person).values(
          part.map((c) => ({
            id: c.id,
            fullName: c.fullName,
            birthDate: c.birthDate,
            gender: c.gender,
          })),
        );
        await tx.insert(membership).values(
          part.map((c) => ({
            orgId: ctx.id,
            personId: c.id,
            status: 'active' as const,
            source: 'import' as const,
            school: c.school,
            registeredBy: user.personId,
          })),
        );
        await tx.insert(guardianLink).values(
          part.map((c) => ({
            guardianPersonId: guardianByPhone.get(c.guardianPhone)!,
            childPersonId: c.id,
            relation: 'guardian' as const,
            isPrimary: true,
          })),
        );
      }
      report.imported = children.length;
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'players.imported',
        entityType: 'membership',
        meta: {
          imported: report.imported,
          errors: report.errors.length,
          duplicates: report.duplicates.length,
          newGuardians: newGuardians.length,
        },
        ...meta,
      });
      return report;
    });
  }

  /**
   * Membuka isi dokumen usia: hanya owner/admin (izin dicek di controller) dan SETIAP
   * pembukaan tercatat di audit log (US-04). Isi didekripsi di server, tidak ada URL publik.
   */
  async documentContent(ctx: OrgContext, user: AuthUser, documentId: string, meta: Meta) {
    const doc = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [d] = await tx.select().from(document).where(eq(document.id, documentId));
      if (!d) throw new NotFoundException('Dokumen tidak ditemukan');
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'document.viewed',
        entityType: 'document',
        entityId: d.id,
        meta: { personId: d.personId, kind: d.kind },
        ...meta,
      });
      return d;
    });
    return {
      buffer: await this.vault.read(doc.storageKey),
      mimeType: doc.mimeType,
      fileName: doc.fileName,
    };
  }

  private async assertNotDuplicate(tx: Tx, fullName: string, birthDate: string) {
    const rows = await tx
      .select({ fullName: person.fullName, birthDate: person.birthDate })
      .from(membership)
      .innerJoin(person, eq(person.id, membership.personId))
      .where(and(eq(person.birthDate, birthDate), ne(membership.status, 'left')));
    if (
      rows.some((r) => duplicateKey(r.fullName, r.birthDate!) === duplicateKey(fullName, birthDate))
    ) {
      throw new ConflictException(`${fullName} (lahir ${birthDate}) sudah terdaftar di klub ini`);
    }
  }
}
