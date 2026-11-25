import { z } from 'zod';

const DEV_AUTH_SECRET = 'dev-only-secret-change-me-dev-only-secret';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('postgres://sg_app:sg_app_dev@localhost:55432/sportgather'),
  /** Rahasia HMAC untuk kode OTP & token. Wajib diganti di produksi (≥32 karakter). */
  AUTH_SECRET: z.string().min(32).default(DEV_AUTH_SECRET),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  PAYMENT_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  WHATSAPP_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  SMS_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  BANK_VERIFICATION_PROVIDER: z.enum(['mock', 'real']).default('mock'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validasi env saat start; aplikasi gagal cepat bila konfigurasi salah. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Konfigurasi env tidak valid:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    const mocks = (
      [
        'PAYMENT_PROVIDER',
        'WHATSAPP_PROVIDER',
        'SMS_PROVIDER',
        'BANK_VERIFICATION_PROVIDER',
      ] as const
    ).filter((k) => env[k] === 'mock');
    if (mocks.length)
      throw new Error(`Provider mock tidak boleh dipakai di production: ${mocks.join(', ')}`);
    if (env.AUTH_SECRET === DEV_AUTH_SECRET)
      throw new Error('AUTH_SECRET wajib diatur di production');
  }
  return env;
}

export const ENV = Symbol('ENV');
