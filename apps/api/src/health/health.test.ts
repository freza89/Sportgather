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
      }),
    ).toThrow(/AUTH_SECRET/);
  });

  it('menolak port tidak valid', () => {
    expect(() => loadEnv({ API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
