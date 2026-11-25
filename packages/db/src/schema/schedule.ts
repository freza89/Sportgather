// Jadwal, RSVP, absensi (M3). Semua tabel tenant (org_id + RLS).
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { attendanceStatusEnum, eventKindEnum, eventStatusEnum, rsvpStatusEnum } from './enums.js';
import { person } from './identity.js';
import { branch, membership, organization, team } from './tenant.js';

const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' });
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** Pola latihan mingguan per tim (SCH-01). Satu baris per hari latihan. */
export const eventSeries = pgTable(
  'event_series',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    teamId: uuid()
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    weekday: integer().notNull(),
    startTime: time().notNull(),
    durationMin: integer().notNull(),
    branchId: uuid().references(() => branch.id),
    locationNote: text(),
    startsOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }).notNull(),
    createdBy: uuid().references(() => person.id),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('event_series_team_idx').on(t.teamId)],
);

/** Sesi/event konkret. Sesi dari pola punya series_id + occurrence_date (unik). */
export const event = pgTable(
  'event',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    teamId: uuid()
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    seriesId: uuid().references(() => eventSeries.id, { onDelete: 'set null' }),
    occurrenceDate: date({ mode: 'string' }),
    kind: eventKindEnum().notNull().default('training'),
    title: text(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    branchId: uuid().references(() => branch.id),
    locationNote: text(),
    status: eventStatusEnum().notNull().default('scheduled'),
    cancelReason: text(),
    /** Diubah satu-satu: tidak ikut diubah bila pola mingguan diganti (US-07). */
    isException: boolean().notNull().default(false),
    /** Ringkasan perubahan terakhir untuk badge "Jam berubah" (O-04). */
    changedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('event_org_starts_idx').on(t.orgId, t.startsAt),
    index('event_team_starts_idx').on(t.teamId, t.startsAt),
    uniqueIndex('event_series_occurrence_key')
      .on(t.seriesId, t.occurrenceDate)
      .where(sql`${t.seriesId} is not null`),
  ],
);

/** Hari libur klub/cabang: meniadakan sesi pada tanggal tsb. */
export const holiday = pgTable(
  'holiday',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    branchId: uuid().references(() => branch.id, { onDelete: 'cascade' }),
    date: date({ mode: 'string' }).notNull(),
    name: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('holiday_org_date_idx').on(t.orgId, t.date)],
);

/** RSVP wali per anak per sesi (SCH-03). */
export const rsvp = pgTable(
  'rsvp',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    membershipId: uuid()
      .notNull()
      .references(() => membership.id, { onDelete: 'cascade' }),
    status: rsvpStatusEnum().notNull(),
    note: text(),
    respondedBy: uuid().references(() => person.id),
    respondedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('rsvp_event_member_key').on(t.eventId, t.membershipId)],
);

/**
 * Absensi (ATT-01). `client_op_id` dari HP pelatih membuat sinkron offline idempoten;
 * `recorded_at` (waktu di HP) menentukan versi terbaru bila ada dua perubahan.
 */
export const attendance = pgTable(
  'attendance',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    membershipId: uuid()
      .notNull()
      .references(() => membership.id, { onDelete: 'cascade' }),
    status: attendanceStatusEnum().notNull(),
    recordedBy: uuid()
      .notNull()
      .references(() => person.id),
    recordedAt: timestamp({ withTimezone: true }).notNull(),
    clientOpId: uuid().notNull(),
    syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_event_member_key').on(t.eventId, t.membershipId),
    index('attendance_org_idx').on(t.orgId),
  ],
);

/** Operasi sinkron yang sudah diterima (dedupe ulang kirim dari HP). */
export const attendanceOp = pgTable(
  'attendance_op',
  {
    clientOpId: uuid().primaryKey(),
    orgId: orgRef(),
    receivedAt: createdAt(),
  },
  (t) => [index('attendance_op_org_idx').on(t.orgId)],
);

/** Link bertoken di pesan WhatsApp (48 jam, sekali pakai untuk aksi) — PRD bagian 13. */
export const accessToken = pgTable(
  'access_token',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    tokenHash: text().notNull(),
    personId: uuid()
      .notNull()
      .references(() => person.id),
    purpose: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('access_token_hash_key').on(t.tokenHash)],
);

/** Pesan otomatis yang sudah dikirim (kunci unik → tidak terkirim dua kali). */
export const notificationLog = pgTable(
  'notification_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    dedupeKey: text().notNull(),
    template: text().notNull(),
    recipientPersonId: uuid().references(() => person.id),
    sentAt: createdAt(),
  },
  (t) => [uniqueIndex('notification_log_key').on(t.orgId, t.dedupeKey)],
);
