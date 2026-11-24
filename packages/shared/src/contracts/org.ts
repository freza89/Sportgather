import { z } from 'zod';
import { isZonaWaktu } from '../format/zona-waktu.js';
import { BANKS } from '../org/org.js';
import { FullNameSchema, PhoneSchema } from './auth.js';
import { STAFF_ROLES } from '../auth/rbac.js';

export const BranchInputSchema = z.object({
  name: z.string().trim().min(2, 'Nama lokasi minimal 2 huruf').max(100),
  address: z.string().trim().min(5, 'Alamat terlalu pendek').max(300),
  timezone: z
    .string()
    .default('Asia/Jakarta')
    .refine(isZonaWaktu, 'Zona waktu harus WIB, WITA, atau WIT'),
  courts: z.coerce.number().int().min(1).max(50).default(1),
});
export type BranchInput = z.input<typeof BranchInputSchema>;

export const BankAccountInputSchema = z.object({
  bankCode: z.enum(Object.keys(BANKS) as [keyof typeof BANKS, ...(keyof typeof BANKS)[]], {
    message: 'Pilih bank',
  }),
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{6,20}$/, 'Nomor rekening 6–20 angka')),
  holderName: z.string().trim().min(2, 'Nama pemilik rekening wajib diisi').max(100),
});
export type BankAccountInput = z.input<typeof BankAccountInputSchema>;

export const OrgProfileSchema = z.object({
  name: z.string().trim().min(3, 'Nama klub minimal 3 huruf').max(100),
  sport: z.literal('basketball').default('basketball'),
  city: z.string().trim().min(2, 'Kota wajib diisi').max(60),
  whatsapp: PhoneSchema.optional(),
});

export const CreateOrgSchema = OrgProfileSchema.extend({
  branches: z.array(BranchInputSchema).min(1, 'Tambahkan minimal satu lokasi latihan').max(20),
  bankAccount: BankAccountInputSchema,
});
export type CreateOrgInput = z.input<typeof CreateOrgSchema>;

export const UpdateOrgSchema = OrgProfileSchema.partial();

export const InviteStaffSchema = z.object({
  fullName: FullNameSchema,
  phone: PhoneSchema,
  role: z.enum(STAFF_ROLES),
});
export type InviteStaffInput = z.input<typeof InviteStaffSchema>;

export const UpdateStaffSchema = z.object({ role: z.enum(STAFF_ROLES) });

export const AcceptInvitationSchema = z.object({ token: z.string().min(20).max(200) });

export interface OrgSummary {
  id: string;
  slug: string;
  name: string;
  sport: string;
  city: string;
  whatsapp: string | null;
  plan: string;
  role: string;
}

export interface BranchDto {
  id: string;
  name: string;
  address: string;
  timezone: string;
  courts: number;
}

export interface BankAccountDto {
  id: string;
  bankCode: string;
  maskedNumber: string;
  holderName: string;
  status: 'pending_verification' | 'verified' | 'rejected' | 'replaced';
  verificationNote: string | null;
  verifiedAt: string | null;
}

export interface StaffDto {
  id: string;
  personId: string;
  fullName: string;
  phone: string | null;
  role: string;
  status: string;
}

export interface InvitationPreview {
  orgName: string;
  orgSlug: string;
  role: string;
  invitedName: string;
  phoneMasked: string;
  expired: boolean;
  accepted: boolean;
}
