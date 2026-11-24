import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../bootstrap.js';
import { loadEnv } from '../config/env.js';

describe('GET /health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp(loadEnv({ NODE_ENV: 'test' }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('mengembalikan status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('menyediakan dokumen OpenAPI', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs-json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().info.title).toBe('SportGather API');
  });
});

describe('loadEnv', () => {
  it('menolak provider mock di production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/mock/);
  });

  it('menolak port tidak valid', () => {
    expect(() => loadEnv({ API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
