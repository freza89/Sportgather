import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  PAYMENT_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  WHATSAPP_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  SMS_PROVIDER: z.enum(['mock', 'real']).default('mock'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validasi env saat start; aplikasi gagal cepat bila konfigurasi salah. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Konfigurasi env tidak valid:\n${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.PAYMENT_PROVIDER === 'mock') {
    throw new Error('PAYMENT_PROVIDER=mock tidak boleh dipakai di production');
  }
  return parsed.data;
}
