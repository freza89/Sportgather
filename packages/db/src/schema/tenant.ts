// Tabel TENANT: setiap baris milik satu organisasi (klub) dan dilindungi RLS
// (lihat migrations/*_rls.sql). Kolom org_id wajib, kecuali organization yang id-nya = tenant.
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  bankAccountStatusEnum,
  documentKindEnum,
  documentStatusEnum,
  kuRuleEnum,
  membershipStatusEnum,
  placementEnum,
  registrationSourceEnum,
  seasonStatusEnum,
  teamGenderEnum,
  sportEnum,
  staffRoleEnum,
  staffStatusEnum,
  subscriptionPlanEnum,
} from './enums.js';
import { person } from './identity.js';

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' });

export const organization = pgTable(
  'organization',
  {
    id: uuid().primaryKey(),
    slug: text().notNull(),
    name: text().notNull(),
    sport: sportEnum().notNull().default('basketball'),
    city: text().notNull(),
    whatsapp: text(),
    logoKey: text(),
    plan: subscriptionPlanEnum().notNull().default('starter'),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('organization_slug_key').on(t.slug)],
);

export const branch = pgTable(
  'branch',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    name: text().notNull(),
    address: text().notNull(),
    /** Asia/Jakarta | Asia/Makassar | Asia/Jayapura */
    timezone: text().notNull().default('Asia/Jakarta'),
    courts: integer().notNull().default(1),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('branch_org_idx').on(t.orgId)],
);

export const bankAccount = pgTable(
  'bank_account',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    bankCode: text().notNull(),
    accountNumber: text().notNull(),
    holderName: text().notNull(),
    status: bankAccountStatusEnum().notNull().default('pending_verification'),
    verificationNote: text(),
    verifiedAt: timestamp({ withTimezone: true }),
    submittedBy: uuid()
      .notNull()
      .references(() => person.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('bank_account_org_idx').on(t.orgId),
    // Hanya satu rekening aktif (belum diganti) per klub.
    uniqueIndex('bank_account_current_key')
      .on(t.orgId)
      .where(sql`${t.status} <> 'replaced'`),
  ],
);

export const staffRole = pgTable(
  'staff_role',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    personId: uuid()
      .notNull()
      .references(() => person.id),
    role: staffRoleEnum().notNull(),
    status: staffStatusEnum().notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('staff_role_org_person_key').on(t.orgId, t.personId),
    index('staff_role_person_idx').on(t.personId),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    staffRoleId: uuid()
      .notNull()
      .references(() => staffRole.id, { onDelete: 'cascade' }),
    phone: text().notNull(),
    tokenHash: text().notNull(),
    invitedBy: uuid()
      .notNull()
      .references(() => person.id),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('invitation_token_hash_key').on(t.tokenHash),
    index('invitation_org_idx').on(t.orgId),
  ],
);

/** Keanggotaan pemain di klub. Data yang melekat pada klub (sekolah, kontak darurat, status). */
export const membership = pgTable(
  'membership',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    personId: uuid()
      .notNull()
      .references(() => person.id),
    // Default 'active' (nilai enum baru tidak boleh dipakai di migrasi yang sama); pendaftar online/manual
    // selalu diisi eksplisit 'pending' oleh aplikasi.
    status: membershipStatusEnum().notNull().default('active'),
    statusReason: text(),
    source: registrationSourceEnum().notNull().default('manual'),
    school: text(),
    emergencyContactName: text(),
    emergencyContactPhone: text(),
    /** Izin publikasi foto (PRD bagian 8): default tidak. */
    photoPublic: boolean().notNull().default(false),
    registeredBy: uuid().references(() => person.id),
    reviewedBy: uuid().references(() => person.id),
    reviewedAt: timestamp({ withTimezone: true }),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('membership_org_person_key').on(t.orgId, t.personId),
    index('membership_org_status_idx').on(t.orgId, t.status),
  ],
);

export const season = pgTable(
  'season',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    name: text().notNull(),
    startsOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }).notNull(),
    status: seasonStatusEnum().notNull().default('draft'),
    /** Aturan & kelompok KU musim ini (dipakai bila kompetisi tidak menentukan lain). */
    kuRule: kuRuleEnum().notNull().default('MAX_N'),
    kuGroups: integer()
      .array()
      .notNull()
      .default(sql`'{8,10,12,14,16}'::integer[]`),
    primaryCompetitionId: uuid().references((): AnyPgColumn => competition.id, {
      onDelete: 'set null',
    }),
    /** Keputusan kenaikan KU yang disimpan sebagai draf (A-11). */
    promotionDraft: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('season_org_idx').on(t.orgId),
    uniqueIndex('season_active_key')
      .on(t.orgId)
      .where(sql`${t.status} = 'active'`),
  ],
);

export const competition = pgTable(
  'competition',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    seasonId: uuid()
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    organizer: text(),
    kind: text().notNull().default('Liga'),
    /** Tanggal kompetisi = tanggal acuan KU (keputusan PRD bagian 12). */
    referenceDate: date({ mode: 'string' }).notNull(),
    kuRule: kuRuleEnum(),
    /** KU yang diikuti, mis. {12,14,16}. */
    kuGroups: integer().array().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('competition_season_idx').on(t.seasonId)],
);

export const team = pgTable(
  'team',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    seasonId: uuid()
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    branchId: uuid().references(() => branch.id),
    name: text().notNull(),
    ku: integer().notNull(),
    level: text().notNull(),
    gender: teamGenderEnum().notNull().default('mixed'),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('team_season_idx').on(t.seasonId)],
);

export const teamMember = pgTable(
  'team_member',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    teamId: uuid()
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    seasonId: uuid()
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    membershipId: uuid()
      .notNull()
      .references(() => membership.id, { onDelete: 'cascade' }),
    jerseyNumber: integer(),
    /** KU asli saat ditempatkan & klasifikasi penempatan (KU-02). */
    actualKu: integer(),
    placement: placementEnum().notNull().default('same'),
    placementReason: text(),
    approvedBy: uuid().references(() => person.id),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('team_member_team_idx').on(t.teamId),
    // Satu pemain hanya di satu tim aktif per musim.
    uniqueIndex('team_member_active_key')
      .on(t.membershipId, t.seasonId)
      .where(sql`${t.leftAt} is null`),
  ],
);

/** Pelatih / team manager yang ditugaskan ke tim ("tim sendiri" di RBAC). */
export const teamStaff = pgTable(
  'team_staff',
  {
    orgId: orgRef(),
    teamId: uuid()
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    staffRoleId: uuid()
      .notNull()
      .references(() => staffRole.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.staffRoleId] })],
);

/** Tim yang terdaftar di kompetisi. */
export const teamCompetition = pgTable(
  'team_competition',
  {
    orgId: orgRef(),
    teamId: uuid()
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    competitionId: uuid()
      .notNull()
      .references(() => competition.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.competitionId] })],
);

/**
 * Dokumen usia & foto (REG-03). Isi file dienkripsi aplikasi (AES-256-GCM) sebelum
 * disimpan di object storage; hanya owner/admin yang bisa membuka, dan setiap akses
 * tercatat di audit log.
 */
export const document = pgTable(
  'document',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    personId: uuid()
      .notNull()
      .references(() => person.id),
    kind: documentKindEnum().notNull(),
    storageKey: text().notNull(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    status: documentStatusEnum().notNull().default('pending'),
    rejectionReason: text(),
    uploadedBy: uuid()
      .notNull()
      .references(() => person.id),
    reviewedBy: uuid().references(() => person.id),
    reviewedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('document_person_idx').on(t.orgId, t.personId)],
);

/** Persetujuan wali atas pemrosesan data anak (UU PDP): siapa, kapan, versi teks. */
export const consent = pgTable(
  'consent',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    guardianPersonId: uuid()
      .notNull()
      .references(() => person.id),
    subjectPersonId: uuid()
      .notNull()
      .references(() => person.id),
    kind: text().notNull(),
    version: text().notNull(),
    acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ip: text(),
    withdrawnAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('consent_subject_idx').on(t.orgId, t.subjectPersonId)],
);

/** Audit log append-only (UPDATE/DELETE dicabut di migrasi). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    actorPersonId: uuid().references(() => person.id),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    meta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_org_created_idx').on(t.orgId, t.createdAt)],
);
