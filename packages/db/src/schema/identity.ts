// Tabel identitas GLOBAL (tidak terikat tenant). Satu orang = satu akun lintas klub (PRD bagian 7).
import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { genderEnum, guardianRelationEnum, otpChannelEnum, otpPurposeEnum } from './enums.js';

export const person = pgTable('person', {
  id: uuid().primaryKey().defaultRandom(),
  fullName: text().notNull(),
  birthDate: date({ mode: 'string' }),
  gender: genderEnum(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const userAccount = pgTable(
  'user_account',
  {
    id: uuid().primaryKey().defaultRandom(),
    personId: uuid()
      .notNull()
      .references(() => person.id),
    /** Nomor WhatsApp E.164, mis. +6281234567890. */
    phone: text(),
    email: text(),
    /** scrypt; hanya untuk owner/admin yang memilih login email (opsional). */
    passwordHash: text(),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_account_phone_key').on(t.phone),
    uniqueIndex('user_account_email_key').on(sql`lower(${t.email})`),
    uniqueIndex('user_account_person_key').on(t.personId),
  ],
);

export const otpChallenge = pgTable(
  'otp_challenge',
  {
    id: uuid().primaryKey().defaultRandom(),
    phone: text().notNull(),
    purpose: otpPurposeEnum().notNull(),
    codeHash: text().notNull(),
    channel: otpChannelEnum().notNull().default('whatsapp'),
    attempts: integer().notNull().default(0),
    smsFallbackAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('otp_challenge_phone_created_idx').on(t.phone, t.createdAt)],
);

export const session = pgTable(
  'session',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** SHA-256 dari token cookie; token mentah tidak pernah disimpan. */
    tokenHash: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => userAccount.id),
    userAgent: text(),
    ip: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('session_token_hash_key').on(t.tokenHash),
    index('session_user_idx').on(t.userId),
  ],
);

/** Kejadian autentikasi (berhasil/gagal) — global karena belum ada konteks klub saat login. */
export const authEvent = pgTable(
  'auth_event',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => userAccount.id),
    phone: text(),
    email: text(),
    event: text().notNull(),
    ip: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_event_user_idx').on(t.userId, t.createdAt)],
);

export const guardianLink = pgTable(
  'guardian_link',
  {
    guardianPersonId: uuid()
      .notNull()
      .references(() => person.id),
    childPersonId: uuid()
      .notNull()
      .references(() => person.id),
    relation: guardianRelationEnum().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guardianPersonId, t.childPersonId] })],
);
