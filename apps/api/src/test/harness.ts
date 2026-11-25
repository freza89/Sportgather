import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestDatabase, type TestDatabase } from '@sportgather/db/testing';
import { normalizePhone } from '@sportgather/shared';
import { expect } from 'vitest';
import { createApp } from '../bootstrap.js';
import { loadEnv } from '../config/env.js';
import { MockOutbox } from '../integrations/messaging.js';

export interface Harness {
  app: NestFastifyApplication;
  db: TestDatabase;
  outbox: MockOutbox;
  close: () => Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const db = await createTestDatabase();
  const app = await createApp(
    loadEnv({ NODE_ENV: 'test', DATABASE_URL: db.appUrl, STORAGE_PROVIDER: 'memory' }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return {
    app,
    db,
    outbox: app.get(MockOutbox),
    close: async () => {
      await app.close();
      await db.drop();
    },
  };
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class Client {
  cookie: string | undefined;
  constructor(private readonly h: Harness) {}

  async call(
    method: Method,
    url: string,
    payload?: unknown,
    extraHeaders: Record<string, string> = {},
  ) {
    const res = await this.h.app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...extraHeaders },
    });
    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (raw?.startsWith('sg_session=')) {
      const value = raw.split(';')[0]!;
      this.cookie = value === 'sg_session=' ? undefined : value;
    }
    const isJson = String(res.headers['content-type'] ?? '').includes('json');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- respons JSON bebas bentuk di tes
    const body: any = res.body && isJson ? res.json() : null;
    return { status: res.statusCode, body, raw: res.rawPayload, headers: res.headers };
  }

  /** Alur OTP lengkap memakai outbox mock. */
  async loginOtp(phone: string, opts: { purpose?: 'login' | 'signup'; fullName?: string } = {}) {
    const req = await this.call('POST', '/v1/auth/otp/request', {
      phone,
      purpose: opts.purpose ?? 'login',
    });
    expect(req.status, JSON.stringify(req.body)).toBe(200);
    const msg = this.h.outbox.latest(normalizePhone(phone)!, 'kode_otp');
    expect(msg, 'kode OTP terkirim').toBeDefined();
    const verify = await this.call('POST', '/v1/auth/otp/verify', {
      challengeId: (req.body as { challengeId: string }).challengeId,
      code: msg!.params.kode,
      ...(opts.fullName ? { fullName: opts.fullName } : {}),
    });
    expect(verify.status, JSON.stringify(verify.body)).toBe(200);
    return verify;
  }
}

/** Mundurkan waktu pembuatan OTP agar batas 30 detik terlewati tanpa menunggu. */
export async function ageOtpChallenges(h: Harness, phone: string, seconds: number) {
  const { sql } = await import('drizzle-orm');
  await h.db.admin.db.execute(
    sql`update otp_challenge set created_at = created_at - make_interval(secs => ${seconds}) where phone = ${normalizePhone(phone)}`,
  );
}

export const CLUB = {
  name: 'Klub Uji Basket',
  city: 'Bandung',
  branches: [
    {
      name: 'GOR Uji',
      address: 'Jl. Pajajaran No. 1, Bandung',
      timezone: 'Asia/Jakarta',
      courts: 2,
    },
  ],
  bankAccount: { bankCode: 'BCA', accountNumber: '0123454821', holderName: 'Klub Uji Basket' },
};

/** Body multipart/form-data untuk app.inject (field `data` berisi JSON + berkas). */
export function multipart(
  data: unknown,
  files: Record<string, { filename: string; content: Buffer }>,
) {
  const boundary = `----sg${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  const push = (s: string) => chunks.push(Buffer.from(s));
  push(
    `--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(data)}\r\n`,
  );
  for (const [field, f] of Object.entries(files)) {
    push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${f.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    chunks.push(f.content);
    push('\r\n');
  }
  push(`--${boundary}--\r\n`);
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** JPEG minimal yang lolos deteksi magic bytes. */
export const FAKE_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('akta-kelahiran-palsu-untuk-tes'),
]);
