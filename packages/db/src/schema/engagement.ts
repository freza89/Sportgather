// Komunikasi, pembinaan, dan hak data (M5).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  announcementSourceEnum,
  announcementStatusEnum,
  announcementTargetEnum,
  dataRequestStatusEnum,
} from './enums.js';
import { person } from './identity.js';
import { event } from './schedule.js';
import { membership, organization, season } from './tenant.js';

const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' });
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** Pengumuman (A-16, P-05) dan notifikasi perubahan jadwal (COM-02) dengan status dibaca. */
export const announcement = pgTable(
  'announcement',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    authorPersonId: uuid().references(() => person.id),
    source: announcementSourceEnum().notNull().default('manual'),
    eventId: uuid().references(() => event.id, { onDelete: 'set null' }),
    title: text().notNull(),
    body: text().notNull(),
    targetKind: announcementTargetEnum().notNull(),
    /** id cabang/tim sesuai targetKind. */
    targetIds: uuid().array(),
    targetKus: integer().array(),
    /** Label target untuk tampilan ("KU12 · KU14", "KU12 Elite"). */
    targetLabel: text().notNull(),
    viaWhatsapp: boolean().notNull().default(true),
    viaPush: boolean().notNull().default(true),
    status: announcementStatusEnum().notNull().default('sent'),
    scheduledAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('announcement_org_idx').on(t.orgId, t.createdAt)],
);

export const announcementRecipient = pgTable(
  'announcement_recipient',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    announcementId: uuid()
      .notNull()
      .references(() => announcement.id, { onDelete: 'cascade' }),
    personId: uuid()
      .notNull()
      .references(() => person.id),
    /** Nama anak (untuk tampilan wali dengan beberapa anak). */
    childNames: text().array(),
    whatsappAt: timestamp({ withTimezone: true }),
    pushAt: timestamp({ withTimezone: true }),
    readAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('announcement_recipient_key').on(t.announcementId, t.personId),
    index('announcement_recipient_person_idx').on(t.personId),
  ],
);

/** Template skill per KU (DEV-01; basket bawaan, bisa diubah klub). */
export const skill = pgTable(
  'skill',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    sport: text().notNull().default('basketball'),
    name: text().notNull(),
    description: text(),
    kuMin: integer().notNull(),
    kuMax: integer().notNull(),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('skill_org_idx').on(t.orgId)],
);

/** Skor skill 1–5 per pemain per semester musim (DEV-02, US-15). */
export const assessment = pgTable(
  'assessment',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    membershipId: uuid()
      .notNull()
      .references(() => membership.id, { onDelete: 'cascade' }),
    seasonId: uuid()
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    semester: smallint().notNull(),
    skillId: uuid()
      .notNull()
      .references(() => skill.id),
    score: smallint().notNull(),
    assessedBy: uuid()
      .notNull()
      .references(() => person.id),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assessment_key').on(t.membershipId, t.seasonId, t.semester, t.skillId),
    check('assessment_score_range', sql`${t.score} between 1 and 5`),
    check('assessment_semester_range', sql`${t.semester} in (1, 2)`),
  ],
);

export const assessmentNote = pgTable(
  'assessment_note',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    membershipId: uuid()
      .notNull()
      .references(() => membership.id, { onDelete: 'cascade' }),
    seasonId: uuid()
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    semester: smallint().notNull(),
    note: text().notNull(),
    authorPersonId: uuid()
      .notNull()
      .references(() => person.id),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('assessment_note_key').on(t.membershipId, t.seasonId, t.semester)],
);

/** Rapor terbit per semester (US-16): wali baru melihat rapor setelah dipublikasikan. */
export const reportPublication = pgTable(
  'report_publication',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    seasonId: uuid()
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    semester: smallint().notNull(),
    publishedBy: uuid()
      .notNull()
      .references(() => person.id),
    publishedAt: createdAt(),
  },
  (t) => [uniqueIndex('report_publication_key').on(t.orgId, t.seasonId, t.semester)],
);

/** Permintaan hapus data anak oleh wali (O-08), diproses admin klub. */
export const dataRequest = pgTable(
  'data_request',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    requesterPersonId: uuid()
      .notNull()
      .references(() => person.id),
    membershipId: uuid()
      .notNull()
      .references(() => membership.id, { onDelete: 'cascade' }),
    reason: text(),
    status: dataRequestStatusEnum().notNull().default('pending'),
    handledBy: uuid().references(() => person.id),
    handledAt: timestamp({ withTimezone: true }),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [index('data_request_org_idx').on(t.orgId, t.status)],
);

/** Langganan Web Push (global per orang; tidak terikat klub). */
export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: uuid().primaryKey().defaultRandom(),
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text(),
    createdAt: createdAt(),
    lastSuccessAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('push_subscription_endpoint_key').on(t.endpoint),
    index('push_subscription_person_idx').on(t.personId),
  ],
);
