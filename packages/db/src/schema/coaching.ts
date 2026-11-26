// Profil/CV pelatih & lisensi (M7).
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { coachLicenseStatusEnum } from './enums.js';
import { person } from './identity.js';
import { organization, staffRole } from './tenant.js';

const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' });
const staffRef = () =>
  uuid()
    .notNull()
    .references(() => staffRole.id, { onDelete: 'cascade' });
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** Biodata & ringkasan CV pelatih, satu per staf per klub. */
export const coachProfile = pgTable(
  'coach_profile',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    staffRoleId: staffRef(),
    /** Judul singkat, mis. "Pelatih kepala KU12". */
    headline: text(),
    specialization: text(),
    bio: text(),
    yearsCoaching: smallint(),
    playingBackground: text(),
    education: text(),
    city: text(),
    /** Foto profil terenkripsi di object storage (sama seperti dokumen anak). */
    photoStorageKey: text(),
    photoMimeType: text(),
    updatedBy: uuid().references(() => person.id),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('coach_profile_staff_key').on(t.staffRoleId),
    index('coach_profile_org_idx').on(t.orgId),
    check(
      'coach_profile_years_ck',
      sql`${t.yearsCoaching} is null or ${t.yearsCoaching} between 0 and 60`,
    ),
  ],
);

/** Riwayat pengalaman melatih/bermain (baris CV). */
export const coachExperience = pgTable(
  'coach_experience',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    staffRoleId: staffRef(),
    title: text().notNull(),
    organization: text().notNull(),
    startYear: smallint().notNull(),
    /** null = sampai sekarang. */
    endYear: smallint(),
    description: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('coach_experience_staff_idx').on(t.staffRoleId),
    check('coach_experience_years_ck', sql`${t.endYear} is null or ${t.endYear} >= ${t.startYear}`),
  ],
);

/** Lisensi/sertifikat pelatih. File opsional (lisensi bisa masih dalam proses). */
export const coachLicense = pgTable(
  'coach_license',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    staffRoleId: staffRef(),
    name: text().notNull(),
    issuer: text(),
    level: text(),
    licenseNumber: text(),
    issuedOn: date({ mode: 'string' }),
    expiresOn: date({ mode: 'string' }),
    status: coachLicenseStatusEnum().notNull(),
    fileStorageKey: text(),
    fileName: text(),
    fileMimeType: text(),
    fileSizeBytes: integer(),
    reviewNote: text(),
    reviewedBy: uuid().references(() => person.id),
    reviewedAt: timestamp({ withTimezone: true }),
    /** Pengingat masa berlaku yang sudah dikirim: 'h-30' | 'expired'. */
    reminderStage: text(),
    createdBy: uuid().references(() => person.id),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('coach_license_staff_idx').on(t.staffRoleId),
    index('coach_license_expiry_idx').on(t.orgId, t.expiresOn),
    check(
      'coach_license_dates_ck',
      sql`${t.expiresOn} is null or ${t.issuedOn} is null or ${t.expiresOn} >= ${t.issuedOn}`,
    ),
  ],
);
