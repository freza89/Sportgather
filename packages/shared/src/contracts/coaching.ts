import { z } from 'zod';
import { addDays } from '../schedule/schedule.js';
import { IsoDateSchema } from './players.js';

// M7 · Profil/CV & lisensi pelatih (ADR-034)

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter`)
    .nullish()
    .transform((v) => (v ? v : null));

const thisYear = () => new Date().getFullYear();
const YearSchema = z.coerce
  .number({ message: 'Tahun tidak valid' })
  .int('Tahun tidak valid')
  .min(1950, 'Tahun tidak valid')
  .refine((y) => y <= thisYear() + 1, 'Tahun tidak valid');

export const CoachProfileInputSchema = z.object({
  headline: optText(80),
  specialization: optText(120),
  bio: optText(1500),
  yearsCoaching: z.coerce
    .number()
    .int()
    .min(0, 'Tidak valid')
    .max(60, 'Tidak valid')
    .nullish()
    .transform((v) => v ?? null),
  playingBackground: optText(500),
  education: optText(300),
  city: optText(60),
});
export type CoachProfileInput = z.input<typeof CoachProfileInputSchema>;

export const CoachExperienceInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Isi jabatan/peran').max(80),
    organization: z.string().trim().min(2, 'Isi nama klub/organisasi').max(120),
    startYear: YearSchema,
    endYear: YearSchema.nullish().transform((v) => v ?? null),
    description: optText(500),
  })
  .refine((v) => v.endYear === null || v.endYear >= v.startYear, {
    message: 'Tahun selesai tidak boleh sebelum tahun mulai',
    path: ['endYear'],
  });
export type CoachExperienceInput = z.input<typeof CoachExperienceInputSchema>;

export const CoachLicenseInputSchema = z
  .object({
    name: z.string().trim().min(3, 'Isi nama lisensi').max(120),
    issuer: optText(120),
    level: optText(60),
    licenseNumber: optText(60),
    issuedOn: IsoDateSchema.nullish().transform((v) => v ?? null),
    expiresOn: IsoDateSchema.nullish().transform((v) => v ?? null),
    /** Masih proses mengambil lisensi: file & tanggal tidak wajib. */
    inProgress: z.boolean().default(false),
  })
  .refine((v) => !v.expiresOn || !v.issuedOn || v.expiresOn >= v.issuedOn, {
    message: 'Masa berlaku harus setelah tanggal terbit',
    path: ['expiresOn'],
  });
export type CoachLicenseInput = z.input<typeof CoachLicenseInputSchema>;

export const CoachLicenseReviewSchema = z
  .object({
    decision: z.enum(['verified', 'rejected']),
    note: optText(300),
  })
  .refine((v) => v.decision === 'verified' || Boolean(v.note), {
    message: 'Tulis alasan penolakan',
    path: ['note'],
  });

export type CoachLicenseStatus = 'in_progress' | 'pending' | 'verified' | 'rejected';
/** Status yang ditampilkan: status tersimpan + masa berlaku. */
export type CoachLicenseDisplayStatus = CoachLicenseStatus | 'expired' | 'expiring';

export const LICENSE_REMINDER_DAYS = 30;

export const LICENSE_STATUS_LABEL: Record<CoachLicenseDisplayStatus, string> = {
  in_progress: 'Sedang proses',
  pending: 'Menunggu verifikasi',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
  expired: 'Kedaluwarsa',
  expiring: 'Segera habis',
};

/** Kedaluwarsa/segera habis mengalahkan status lain, kecuali lisensi yang masih proses/ditolak. */
export function licenseDisplayStatus(
  status: CoachLicenseStatus,
  expiresOn: string | null,
  today: string,
): CoachLicenseDisplayStatus {
  if (status === 'in_progress' || status === 'rejected' || !expiresOn) return status;
  if (expiresOn < today) return 'expired';
  if (status === 'verified' && expiresOn <= addDays(today, LICENSE_REMINDER_DAYS))
    return 'expiring';
  return status;
}

export interface CoachLicenseDto {
  id: string;
  name: string;
  issuer: string | null;
  level: string | null;
  licenseNumber: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  status: CoachLicenseStatus;
  displayStatus: CoachLicenseDisplayStatus;
  file: { name: string; mimeType: string; sizeBytes: number } | null;
  reviewNote: string | null;
  reviewedAt: string | null;
}

export interface CoachExperienceDto {
  id: string;
  title: string;
  organization: string;
  startYear: number;
  endYear: number | null;
  description: string | null;
}

export interface CoachProfileDto {
  staffId: string;
  personId: string;
  fullName: string;
  phone: string | null;
  role: string;
  teams: { id: string; name: string }[];
  profile: {
    headline: string | null;
    specialization: string | null;
    bio: string | null;
    yearsCoaching: number | null;
    playingBackground: string | null;
    education: string | null;
    city: string | null;
    hasPhoto: boolean;
    updatedAt: string | null;
  };
  experiences: CoachExperienceDto[];
  licenses: CoachLicenseDto[];
  /** Boleh mengubah (owner/admin, atau pelatih itu sendiri). */
  canEdit: boolean;
  /** Boleh memverifikasi lisensi (owner/admin). */
  canReview: boolean;
}

/** Ringkasan untuk daftar staf (A-03). */
export interface CoachLicenseSummary {
  total: number;
  pending: number;
  expired: number;
  expiring: number;
}

/** Ringkasan pelatih untuk wali (hanya lisensi terverifikasi & masih berlaku). */
export interface CoachSummaryDto {
  staffId: string;
  fullName: string;
  teamName: string;
  headline: string | null;
  specialization: string | null;
  yearsCoaching: number | null;
  bio: string | null;
  hasPhoto: boolean;
  licenses: {
    name: string;
    issuer: string | null;
    level: string | null;
    expiresOn: string | null;
  }[];
  experiences: { title: string; organization: string; startYear: number; endYear: number | null }[];
}
