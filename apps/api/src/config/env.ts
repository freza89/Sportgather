import { z } from 'zod';

const DEV_AUTH_SECRET = 'dev-only-secret-change-me-dev-only-secret';
// 32 byte (base64) — HANYA untuk lokal/tes.
const DEV_DOCUMENT_KEY = 'ZGV2LW9ubHktZG9jdW1lbnQta2V5LTMyLWJ5dGVzISE=';

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
  /** Penyaluran dana (Iris). Terpisah dari PAYMENT_PROVIDER: Snap sandbox bisa dipakai sebelum Iris aktif. */
  PAYOUT_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  REDIS_URL: z.string().default('redis://localhost:56379'),
  /** Server key Midtrans (sandbox/produksi). Default hanya untuk mock lokal. */
  MIDTRANS_SERVER_KEY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(8).default('SB-Mid-server-MOCK-sportgather'),
  ),
  MIDTRANS_IS_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Fee platform per pembayaran online (rupiah). */
  PLATFORM_FEE: z.coerce.number().int().min(0).default(2500),
  /** ADR-016: biaya layanan QRIS ke wali dimatikan sampai dikonfirmasi Midtrans. */
  QRIS_SERVICE_FEE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WITHDRAWAL_MIN: z.coerce.number().int().min(0).default(50_000),
  WITHDRAWAL_FEE: z.coerce.number().int().min(0).default(2_500),
  /** Jeda dana settle sebelum bisa ditarik (jam). Mock: 0. */
  SETTLEMENT_DELAY_HOURS: z.coerce.number().int().min(0).default(0),
  /** Job terjadwal (pengingat H-1, dst.) lewat BullMQ. Mati di tes; nyalakan di satu instance. */
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** memory (tes) | s3 (lokal: SeaweedFS, produksi: object storage region Jakarta). */
  STORAGE_PROVIDER: z.enum(['memory', 's3']).default('s3'),
  S3_ENDPOINT: z.string().default('http://localhost:59000'),
  S3_REGION: z.string().default('ap-southeast-3'),
  S3_ACCESS_KEY: z.string().default('sportgather'),
  S3_SECRET_KEY: z.string().default('sportgather-dev-secret'),
  S3_BUCKET: z.string().default('sportgather-documents'),
  /** Kunci AES-256 (base64, 32 byte) untuk enkripsi dokumen anak sebelum disimpan. */
  DOCUMENT_ENCRYPTION_KEY: z
    .string()
    .default(DEV_DOCUMENT_KEY)
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'DOCUMENT_ENCRYPTION_KEY harus 32 byte (base64)',
    ),
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
        'PAYOUT_PROVIDER',
      ] as const
    ).filter((k) => env[k] === 'mock');
    if (mocks.length)
      throw new Error(`Provider mock tidak boleh dipakai di production: ${mocks.join(', ')}`);
    if (env.AUTH_SECRET === DEV_AUTH_SECRET)
      throw new Error('AUTH_SECRET wajib diatur di production');
  }
  if (env.PAYMENT_PROVIDER === 'real' && env.MIDTRANS_SERVER_KEY.includes('MOCK'))
    throw new Error(
      'PAYMENT_PROVIDER=real butuh MIDTRANS_SERVER_KEY asli (sandbox: SB-Mid-server-…)',
    );
  if (env.MIDTRANS_IS_PRODUCTION && env.MIDTRANS_SERVER_KEY.startsWith('SB-'))
    throw new Error('MIDTRANS_IS_PRODUCTION=true tapi server key masih sandbox');
  return env;
}

export const ENV = Symbol('ENV');
