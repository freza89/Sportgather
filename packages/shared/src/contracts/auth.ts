import { z } from 'zod';
import { normalizePhone } from '../auth/phone.js';

export const PhoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Nomor WhatsApp tidak valid' });
      return z.NEVER;
    }
    return phone;
  });

export const FullNameSchema = z.string().trim().min(2, 'Nama minimal 2 huruf').max(100);

export const OtpRequestSchema = z.object({
  phone: PhoneSchema,
  purpose: z.enum(['login', 'signup']).default('login'),
});
export type OtpRequestInput = z.input<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, 'Kode terdiri dari 6 angka'),
  /** Wajib untuk pendaftaran akun baru (purpose = signup). */
  fullName: FullNameSchema.optional(),
});
export type OtpVerifyInput = z.input<typeof OtpVerifySchema>;

export const OtpSmsFallbackSchema = z.object({ challengeId: z.uuid() });

export const PasswordLoginSchema = z.object({
  email: z.email('Email tidak valid').trim().toLowerCase(),
  password: z.string().min(1),
});

export const SetPasswordSchema = z.object({
  email: z.email('Email tidak valid').trim().toLowerCase(),
  password: z.string().min(10, 'Kata sandi minimal 10 karakter').max(200),
});

export interface OtpChallengeResponse {
  challengeId: string;
  /** Detik sampai boleh minta kirim ulang / kirim lewat SMS. */
  resendAfter: number;
  expiresIn: number;
}

export interface MeResponse {
  user: {
    id: string;
    personId: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  };
  clubs: { orgId: string; slug: string; name: string; role: string; status: string }[];
}
