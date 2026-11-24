// Tabel TENANT: setiap baris milik satu organisasi (klub) dan dilindungi RLS
// (lihat migrations/*_rls.sql). Kolom org_id wajib, kecuali organization yang id-nya = tenant.
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  bankAccountStatusEnum,
  membershipStatusEnum,
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

export const membership = pgTable(
  'membership',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    personId: uuid()
      .notNull()
      .references(() => person.id),
    status: membershipStatusEnum().notNull().default('active'),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('membership_org_person_key').on(t.orgId, t.personId)],
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
