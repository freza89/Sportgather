import { z } from 'zod';
import { isValidIsoDate, type AgeRule } from '../ku/ku.js';
import { FullNameSchema, PhoneSchema } from './auth.js';

export const IsoDateSchema = z
  .string()
  .refine(isValidIsoDate, 'Tanggal tidak valid (format YYYY-MM-DD)');
export const GenderSchema = z.enum(['male', 'female'], { message: 'Pilih gender' });
export const GENDER_LABEL = { male: 'Laki-laki', female: 'Perempuan' } as const;
export const RelationSchema = z.enum(['father', 'mother', 'guardian']);
export const RELATION_LABEL = { father: 'Ayah', mother: 'Ibu', guardian: 'Wali' } as const;
export const KuGroupsSchema = z
  .array(z.number().int().min(5).max(21))
  .min(1, 'Pilih minimal satu kelompok KU')
  .transform((g) => [...new Set(g)].sort((a, b) => a - b));
export const KuRuleSchema = z.enum(['MAX_N', 'UNDER_N']);

// ── Musim & kompetisi (A-05) ─────────────────────────────────────────────────
export const SeasonInputSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    startsOn: IsoDateSchema,
    endsOn: IsoDateSchema,
    kuRule: KuRuleSchema.default('MAX_N'),
    kuGroups: KuGroupsSchema.default([8, 10, 12, 14, 16]),
  })
  .refine((s) => s.endsOn > s.startsOn, {
    message: 'Tanggal selesai harus setelah tanggal mulai',
    path: ['endsOn'],
  });

export const CompetitionInputSchema = z.object({
  name: z.string().trim().min(3).max(100),
  organizer: z.string().trim().max(100).optional(),
  kind: z.string().trim().min(2).max(40).default('Liga'),
  referenceDate: IsoDateSchema,
  kuGroups: KuGroupsSchema,
  isPrimary: z.boolean().default(false),
});
export type CompetitionInput = z.input<typeof CompetitionInputSchema>;

export const ReferencePreviewSchema = z.object({ referenceDate: IsoDateSchema });

export interface CompetitionDto {
  id: string;
  name: string;
  organizer: string | null;
  kind: string;
  referenceDate: string;
  kuGroups: number[];
  isPrimary: boolean;
  teamCount: number;
}

export interface SeasonDto {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'draft' | 'active' | 'archived';
  kuRule: AgeRule;
  kuGroups: number[];
  referenceDate: string;
  referenceSource: string;
  primaryCompetitionId: string | null;
  competitions: CompetitionDto[];
  teamCount: number;
  playerCount: number;
}

export interface KuChangeDto {
  membershipId: string;
  fullName: string;
  from: number | null;
  to: number | null;
}

// ── Pemain (A-06, A-07) ──────────────────────────────────────────────────────
export const ChildInputSchema = z.object({
  fullName: FullNameSchema,
  birthDate: IsoDateSchema,
  gender: GenderSchema,
  school: z.string().trim().max(100).optional(),
});

export const GuardianInputSchema = z.object({
  fullName: FullNameSchema,
  phone: PhoneSchema,
  relation: RelationSchema.default('guardian'),
});

export const ManualPlayerSchema = ChildInputSchema.extend({
  guardian: GuardianInputSchema,
  emergencyContactName: z.string().trim().max(100).optional(),
  emergencyContactPhone: PhoneSchema.optional(),
});
export type ManualPlayerInput = z.input<typeof ManualPlayerSchema>;

export const UpdatePlayerSchema = z.object({
  fullName: FullNameSchema.optional(),
  birthDate: IsoDateSchema.optional(),
  gender: GenderSchema.optional(),
  school: z.string().trim().max(100).nullable().optional(),
  emergencyContactName: z.string().trim().max(100).nullable().optional(),
  emergencyContactPhone: PhoneSchema.nullable().optional(),
  status: z.enum(['active', 'on_leave', 'left']).optional(),
  statusReason: z.string().trim().max(200).nullable().optional(),
});

export const PlayerListQuerySchema = z.object({
  ku: z.coerce.number().int().optional(),
  teamId: z.uuid().optional(),
  status: z.enum(['active', 'pending', 'rejected', 'on_leave', 'left', 'all']).default('active'),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type DocStatus = 'verified' | 'pending' | 'rejected' | 'missing';

export interface PlayerRow {
  membershipId: string;
  personId: string;
  fullName: string;
  birthDate: string | null;
  gender: 'male' | 'female' | null;
  ku: number | null;
  team: { id: string; name: string } | null;
  guardianName: string | null;
  docStatus: DocStatus;
  status: string;
}

export interface PlayerListResponse {
  rows: PlayerRow[];
  total: number;
  page: number;
  pageSize: number;
  kuCounts: { ku: number | null; count: number }[];
  activeCount: number;
  pendingCount: number;
  referenceDate: string;
}

export interface DocumentDto {
  id: string;
  kind: 'akta' | 'kia' | 'kk' | 'foto';
  fileName: string;
  mimeType: string;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason: string | null;
  createdAt: string;
}

export const DOCUMENT_KIND_LABEL = {
  akta: 'Akta kelahiran',
  kia: 'KIA',
  kk: 'Kartu keluarga',
  foto: 'Foto pemain',
} as const;

export interface PlayerDetail {
  membershipId: string;
  personId: string;
  fullName: string;
  birthDate: string | null;
  gender: 'male' | 'female' | null;
  school: string | null;
  status: string;
  statusReason: string | null;
  source: string;
  joinedAt: string;
  ku: number | null;
  age: { years: number; months: number } | null;
  referenceDate: string;
  team: { id: string; name: string; jerseyNumber: number | null; placement: string } | null;
  guardians: {
    personId: string;
    fullName: string;
    relation: string;
    phone: string | null;
    isPrimary: boolean;
  }[];
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  consentAt: string | null;
  documents: DocumentDto[];
  teamHistory: { teamName: string; seasonName: string; joinedAt: string; leftAt: string | null }[];
}

// ── Impor Excel (A-04, US-02) ────────────────────────────────────────────────
export const IMPORT_FIELDS = {
  fullName: 'Nama lengkap',
  birthDate: 'Tanggal lahir',
  gender: 'Gender',
  school: 'Sekolah',
  guardianName: 'Nama wali',
  guardianPhone: 'WhatsApp wali',
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;
export const MAX_IMPORT_ROWS = 2000;

export const ImportRowSchema = z.object({
  fullName: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.string().optional(),
  school: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
});
export type ImportRow = z.infer<typeof ImportRowSchema>;

export const ImportRequestSchema = z.object({
  rows: z
    .array(ImportRowSchema)
    .min(1, 'File tidak berisi data')
    .max(MAX_IMPORT_ROWS, `Maksimal ${MAX_IMPORT_ROWS} baris`),
  commit: z.boolean().default(false),
});

export interface ImportReport {
  total: number;
  ready: number;
  errors: { row: number; message: string }[];
  duplicates: { row: number; message: string }[];
  imported: number;
}

// ── Pendaftaran online (O-01) & verifikasi (A-08) ────────────────────────────
export const RegistrationChildSchema = ChildInputSchema.extend({
  documentKind: z.enum(['akta', 'kia', 'kk']).default('akta'),
});

export const RegistrationSchema = z.object({
  relation: RelationSchema,
  emergencyContactName: z.string().trim().min(2, 'Nama kontak darurat wajib diisi').max(100),
  emergencyContactPhone: PhoneSchema,
  children: z.array(RegistrationChildSchema).min(1, 'Tambahkan minimal satu anak').max(6),
  consent: z.literal(true, { message: 'Persetujuan pemrosesan data anak wajib dicentang' }),
  consentVersion: z.string().min(1),
});
export type RegistrationInput = z.input<typeof RegistrationSchema>;

export interface PublicOrgInfo {
  name: string;
  slug: string;
  city: string;
  referenceDate: string;
  kuRule: AgeRule;
  kuGroups: number[];
}

export interface RegistrationResult {
  children: { membershipId: string; fullName: string; ku: number | null }[];
}

export interface RegistrationQueueItem {
  membershipId: string;
  personId: string;
  fullName: string;
  birthDate: string | null;
  gender: 'male' | 'female' | null;
  school: string | null;
  ku: number | null;
  submittedAt: string;
  status: 'pending' | 'rejected';
  guardian: { fullName: string; relation: string; phone: string | null } | null;
  documents: DocumentDto[];
}

export const AcceptRegistrationSchema = z.object({
  teamId: z.uuid().optional(),
  jerseyNumber: z.number().int().min(0).max(99).optional(),
  placementReason: z.string().trim().max(200).optional(),
});

export const RejectRegistrationSchema = z.object({
  reason: z.string().trim().min(5, 'Tulis alasan penolakan (min. 5 huruf)').max(300),
});

export interface ChildSummary {
  membershipId: string;
  personId: string;
  fullName: string;
  birthDate: string | null;
  orgName: string;
  orgSlug: string;
  status: string;
  ku: number | null;
  teamName: string | null;
  ageVerified: boolean;
  rejectionReason: string | null;
}

// ── Tim & penempatan (A-09, A-10) ────────────────────────────────────────────
export const TEAM_LEVELS = ['Mini Basket', 'Development', 'Elite'] as const;

export const TeamInputSchema = z.object({
  ku: z.number().int().min(5).max(21),
  level: z.string().trim().min(2).max(40),
  gender: z.enum(['male', 'female', 'mixed']).default('mixed'),
  name: z.string().trim().max(60).optional(),
  branchId: z.uuid().nullable().optional(),
  staffRoleIds: z.array(z.uuid()).max(10).default([]),
});
export type TeamInput = z.input<typeof TeamInputSchema>;

export const AddTeamMemberSchema = z.object({
  membershipId: z.uuid(),
  jerseyNumber: z.number().int().min(0).max(99).nullable().optional(),
  reason: z.string().trim().max(200).optional(),
});

export interface TeamSummary {
  id: string;
  name: string;
  ku: number;
  level: string;
  gender: 'male' | 'female' | 'mixed';
  branchName: string | null;
  coaches: { staffRoleId: string; fullName: string; role: string }[];
  playerCount: number;
}

export interface TeamMemberDto {
  id: string;
  membershipId: string;
  fullName: string;
  jerseyNumber: number | null;
  age: { years: number; months: number } | null;
  actualKu: number | null;
  placement: 'same' | 'play_up' | 'play_down' | 'over_age';
  placementReason: string | null;
  membershipStatus: string;
  statusReason: string | null;
}

export interface TeamDetail extends TeamSummary {
  seasonName: string;
  referenceDate: string;
  members: TeamMemberDto[];
}

export interface TeamCandidate {
  membershipId: string;
  fullName: string;
  ku: number | null;
  placement: 'same' | 'play_up' | 'play_down' | 'over_age';
  currentTeam: string | null;
}

// ── Kenaikan KU musim baru (A-11) ────────────────────────────────────────────
export const NewSeasonSchema = z.object({
  name: z.string().trim().min(3).max(60),
  startsOn: IsoDateSchema,
  endsOn: IsoDateSchema,
  competition: CompetitionInputSchema.omit({ isPrimary: true }).optional(),
});

export const PromotionDecisionSchema = z.object({
  membershipId: z.uuid(),
  action: z.enum(['auto', 'team', 'leave', 'skip']),
  teamId: z.uuid().optional(),
  reason: z.string().trim().max(200).optional(),
});

export const PromotionApplySchema = z.object({
  decisions: z.array(PromotionDecisionSchema).max(5000),
  draft: z.boolean().default(false),
});

export interface PromotionRow {
  membershipId: string;
  fullName: string;
  birthDate: string;
  oldKu: number | null;
  newKu: number | null;
  status: 'naik' | 'tetap' | 'lulus' | 'perlu_keputusan';
  currentTeam: string | null;
  suggestedTeam: { id: string | null; name: string } | null;
}

export interface PromotionPreview {
  fromSeason: { id: string; name: string; referenceDate: string };
  toSeason: { id: string; name: string; referenceDate: string };
  rows: PromotionRow[];
  summary: { total: number; naik: number; tetap: number; lulus: number; perluKeputusan: number };
  draft: Record<string, unknown> | null;
}
