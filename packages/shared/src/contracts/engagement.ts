import { z } from 'zod';
import { IsoDateSchema } from './players.js';

// ── A-16 / P-05 · Pengumuman ────────────────────────────────────────────────
export const AnnouncementTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('club') }),
  z.object({ kind: z.literal('branch'), ids: z.array(z.uuid()).min(1, 'Pilih cabang') }),
  z.object({
    kind: z.literal('ku'),
    kus: z.array(z.number().int().min(5).max(21)).min(1, 'Pilih KU'),
  }),
  z.object({ kind: z.literal('team'), ids: z.array(z.uuid()).min(1, 'Pilih tim') }),
]);
export type AnnouncementTarget = z.infer<typeof AnnouncementTargetSchema>;

export const AnnouncementInputSchema = z
  .object({
    title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(100),
    body: z.string().trim().min(5, 'Pesan terlalu pendek').max(1000),
    target: AnnouncementTargetSchema,
    viaWhatsapp: z.boolean().default(true),
    viaPush: z.boolean().default(true),
    /** ISO datetime; kosong = kirim sekarang. */
    scheduledAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => v.viaWhatsapp || v.viaPush, {
    message: 'Pilih minimal satu kanal',
    path: ['viaWhatsapp'],
  });
export type AnnouncementInput = z.input<typeof AnnouncementInputSchema>;

export interface AudiencePreview {
  players: number;
  guardians: number;
  multiChild: number;
  label: string;
}

export interface AnnouncementDto {
  id: string;
  title: string;
  body: string;
  targetLabel: string;
  source: 'manual' | 'schedule_change';
  authorName: string | null;
  status: 'scheduled' | 'sent' | 'cancelled';
  scheduledAt: string | null;
  sentAt: string | null;
  recipients: number;
  delivered: number;
  read: number;
}

/** Untuk wali: pengumuman yang diterima. */
export interface MyAnnouncement {
  id: string;
  orgName: string;
  title: string;
  body: string;
  authorName: string | null;
  sentAt: string;
  read: boolean;
}

// ── P-04 · Penilaian skill ──────────────────────────────────────────────────
export interface SkillDto {
  id: string;
  name: string;
  description: string | null;
  kuMin: number;
  kuMax: number;
  active: boolean;
}

export const SkillInputSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(200).optional(),
    kuMin: z.coerce.number().int().min(5).max(21),
    kuMax: z.coerce.number().int().min(5).max(21),
    active: z.boolean().default(true),
  })
  .refine((v) => v.kuMin <= v.kuMax, { message: 'KU awal harus ≤ KU akhir', path: ['kuMax'] });

export interface AssessmentSheet {
  team: { id: string; name: string; ku: number };
  season: { id: string; name: string };
  semester: 1 | 2;
  semesterRange: { from: string; to: string };
  published: boolean;
  skills: SkillDto[];
  players: {
    membershipId: string;
    fullName: string;
    jerseyNumber: number | null;
    scores: Record<string, number>;
    note: string | null;
    /** Boleh diubah oleh orang yang login (pembuat & ≤7 hari, atau belum dinilai). */
    editable: boolean;
    assessedByName: string | null;
    assessedAt: string | null;
  }[];
}

export const AssessmentInputSchema = z.object({
  teamId: z.uuid(),
  membershipId: z.uuid(),
  semester: z.union([z.literal(1), z.literal(2)]).optional(),
  scores: z
    .array(z.object({ skillId: z.uuid(), score: z.number().int().min(1).max(5) }))
    .min(1, 'Isi minimal satu skor'),
  note: z.string().trim().max(500).optional(),
});

// ── Rapor (DEV-03, O-07) ────────────────────────────────────────────────────
export const PublishReportSchema = z.object({
  seasonId: z.uuid(),
  semester: z.union([z.literal(1), z.literal(2)]),
});

export interface ReportStatus {
  season: { id: string; name: string };
  semester: 1 | 2;
  range: { from: string; to: string };
  players: number;
  assessed: number;
  published: { at: string; byName: string | null } | null;
  /** Semester lain di musim aktif. */
  other: { semester: 1 | 2; published: boolean }[];
}

export interface ReportCardDto {
  membershipId: string;
  childName: string;
  orgName: string;
  orgSlug: string;
  teamName: string | null;
  ku: number | null;
  season: { id: string; name: string };
  semester: 1 | 2;
  range: { from: string; to: string };
  attendance: { pct: number | null; attended: number; total: number };
  skills: { name: string; score: number | null }[];
  average: number | null;
  previousAverage: number | null;
  note: { text: string; coachName: string | null } | null;
  publishedAt: string;
}

// ── A-17 / A-18 · Dashboard & laporan ───────────────────────────────────────
export const ReportPeriodSchema = z
  .object({
    preset: z.enum(['month', '3months', 'season', 'custom']).default('month'),
    from: IsoDateSchema.optional(),
    to: IsoDateSchema.optional(),
  })
  .refine((v) => v.preset !== 'custom' || (v.from && v.to && v.from <= v.to), {
    message: 'Isi rentang tanggal',
    path: ['from'],
  });

export interface DashboardDto {
  period: { from: string; to: string; label: string };
  activePlayers: { total: number; newThisMonth: number };
  attendance30d: { pct: number | null; target: number };
  billing: { period: string; billed: number; paid: number; pct: number };
  overdue: { count: number; amount: number };
  playersPerKu: { ku: number | null; count: number }[];
  kuReference: string;
  actions: {
    kind: 'documents' | 'overdue' | 'attendance' | 'payout' | 'data_requests';
    count: number;
    amount?: number;
    text: string;
    sub: string;
    href: string;
  }[];
  today: {
    eventId: string;
    time: string;
    teamName: string;
    ku: number;
    playerCount: number;
    coaches: string[];
    location: string | null;
    rsvp: { hadir: number; izin: number; sakit: number };
    attendanceTaken: boolean;
    status: 'upcoming' | 'running' | 'done' | 'cancelled';
  }[];
  generatedAt: string;
}

export type ReportKind = 'receivables' | 'revenue' | 'attendance' | 'payouts';

export interface RevenueReport {
  months: string[];
  rows: { ku: number | null; perMonth: number[]; total: number }[];
  totals: number[];
  grandTotal: number;
}

// ── O-08 · Profil wali & hak data ───────────────────────────────────────────
export interface GuardianProfile {
  personId: string;
  fullName: string;
  phone: string | null;
  notifyWhatsapp: boolean;
  pushEnabled: boolean;
  children: {
    membershipId: string;
    fullName: string;
    orgName: string;
    ku: number | null;
    teamName: string | null;
    ageVerified: boolean;
    photoPublic: boolean;
    deletionRequested: boolean;
  }[];
}

export const ProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(3).max(100).optional(),
  notifyWhatsapp: z.boolean().optional(),
});

export const PhotoConsentSchema = z.object({ photoPublic: z.boolean() });

export const DeleteRequestSchema = z.object({ reason: z.string().trim().max(300).optional() });

export interface DataRequestDto {
  id: string;
  childName: string;
  requesterName: string;
  reason: string | null;
  status: 'pending' | 'done' | 'rejected';
  createdAt: string;
  handledAt: string | null;
  note: string | null;
}

export const HandleDataRequestSchema = z.object({
  status: z.enum(['done', 'rejected']),
  note: z.string().trim().max(300).optional(),
});

export const PushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(8) }),
});
