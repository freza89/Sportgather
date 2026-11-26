import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../bootstrap.js';
import { loadEnv } from '../config/env.js';
import { createHarness, type Harness } from '../test/harness.js';

describe('GET /health', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it('mengembalikan status ok', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('menyediakan dokumen OpenAPI', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/docs-json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().info.title).toBe('SportGather API');
  });

  it('menolak start bila terhubung sebagai superuser (RLS tidak berlaku)', async () => {
    const app = await createApp(
      loadEnv({ NODE_ENV: 'test', DATABASE_URL: h.db.adminUrl, STORAGE_PROVIDER: 'memory' }),
    );
    await expect(app.init()).rejects.toThrow(/melewati RLS/);
    await app.close().catch(() => undefined);
  });
});

describe('IP klien di balik proxy', () => {
  async function ipFor(trust: string, xff: string) {
    const app = await createApp(
      loadEnv({ NODE_ENV: 'test', TRUST_PROXY: trust, STORAGE_PROVIDER: 'memory' }),
    );
    const f = app.getHttpAdapter().getInstance();
    f.get('/__ip', (req) => ({ ip: req.ip }));
    await f.ready();
    const res = await f.inject({
      method: 'GET',
      url: '/__ip',
      remoteAddress: '10.0.0.5',
      headers: { 'x-forwarded-for': xff },
    });
    await f.close();
    return (res.json() as { ip: string }).ip;
  }

  it('hanya hop tepercaya yang dipakai; entri palsu dari klien diabaikan', async () => {
    // Klien memalsukan 1.1.1.1; load balancer menambahkan IP aslinya (203.0.113.9).
    expect(await ipFor('10.0.0.0/8', '1.1.1.1, 203.0.113.9')).toBe('203.0.113.9');
    // Peer tidak tepercaya → X-Forwarded-For diabaikan seluruhnya.
    expect(await ipFor('', '1.1.1.1, 203.0.113.9')).toBe('10.0.0.5');
    expect(await ipFor('192.168.0.0/16', '1.1.1.1, 203.0.113.9')).toBe('10.0.0.5');
  });
});

describe('loadEnv', () => {
  it('menolak provider mock di production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(40) })).toThrow(/mock/);
  });

  it('menolak AUTH_SECRET bawaan di production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'real',
        WHATSAPP_PROVIDER: 'real',
        SMS_PROVIDER: 'real',
        BANK_VERIFICATION_PROVIDER: 'real',
        PAYOUT_PROVIDER: 'real',
        PUSH_PROVIDER: 'real',
        VAPID_PUBLIC_KEY: 'x',
        VAPID_PRIVATE_KEY: 'y',
      }),
    ).toThrow(/AUTH_SECRET/);
  });

  const PROD_OK = {
    NODE_ENV: 'production',
    AUTH_SECRET: 'p'.repeat(48),
    PAYMENT_PROVIDER: 'real',
    MIDTRANS_SERVER_KEY: 'Mid-server-REALKEY123',
    MIDTRANS_IS_PRODUCTION: 'true',
    WHATSAPP_PROVIDER: 'real',
    SMS_PROVIDER: 'real',
    BANK_VERIFICATION_PROVIDER: 'real',
    PAYOUT_PROVIDER: 'real',
    PUSH_PROVIDER: 'real',
    VAPID_PUBLIC_KEY: 'x',
    VAPID_PRIVATE_KEY: 'y',
    DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    S3_SECRET_KEY: 'prod-s3-secret',
    WEB_ORIGIN: 'https://app.sportgather.id',
    TRUST_PROXY: '10.0.0.0/8',
  };

  it('menerima konfigurasi production lengkap', () => {
    expect(loadEnv(PROD_OK)).toMatchObject({ NODE_ENV: 'production', TRUST_PROXY: '10.0.0.0/8' });
  });

  it.each([
    ['DOCUMENT_ENCRYPTION_KEY', undefined, /DOCUMENT_ENCRYPTION_KEY/],
    ['S3_SECRET_KEY', undefined, /S3_SECRET_KEY/],
    ['STORAGE_PROVIDER', 'memory', /STORAGE_PROVIDER/],
    ['WEB_ORIGIN', 'http://app.sportgather.id', /https/],
    ['TRUST_PROXY', undefined, /TRUST_PROXY/],
  ])('production menolak %s bawaan/tidak aman', (key, value, err) => {
    const env = Object.fromEntries(
      Object.entries({ ...PROD_OK, [key]: value }).filter(([, v]) => v !== undefined),
    );
    expect(() => loadEnv(env)).toThrow(err);
  });

  it('menolak port tidak valid', () => {
    expect(() => loadEnv({ API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
