import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createDb, type DbHandle } from './client.js';
import { runMigrations } from './migrate.js';

const APP_PASSWORD = 'sg_app_test';
const MIGRATION_LOCK = 7_301_2026;

export interface TestDatabase extends DbHandle {
  /** URL koneksi sg_app (RLS berlaku). */
  appUrl: string;
  /** URL koneksi admin (melewati RLS) — hanya untuk menyiapkan/memeriksa data tes. */
  adminUrl: string;
  admin: DbHandle;
  drop: () => Promise<void>;
}

function withDatabase(url: string, database: string, user?: string, password?: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  if (user) u.username = user;
  if (password) u.password = password;
  return u.toString();
}

/**
 * Membuat database tes terisolasi (`sg_test_<acak>`), menjalankan semua migrasi, lalu
 * mengembalikan koneksi sebagai sg_app. Butuh `DATABASE_ADMIN_URL` (superuser) atau
 * default lokal dari infra/docker-compose.yml.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const base =
    process.env.DATABASE_ADMIN_URL ??
    'postgres://sportgather:sportgather@localhost:55432/sportgather';
  const name = `sg_test_${randomBytes(6).toString('hex')}`;
  const root = postgres(base, { max: 1, onnotice: () => undefined });
  const adminUrl = withDatabase(base, name);
  try {
    await root.unsafe(`create database ${name}`);
    // Role sg_app berlaku untuk seluruh server: migrasi paralel (beberapa paket tes
    // berjalan bersamaan) harus bergiliran. Advisory lock dipegang di database induk.
    await root`select pg_advisory_lock(${MIGRATION_LOCK})`;
    await runMigrations(adminUrl, { appPassword: APP_PASSWORD });
  } finally {
    await root`select pg_advisory_unlock(${MIGRATION_LOCK})`.catch(() => undefined);
    await root.end();
  }
  const appUrl = withDatabase(base, name, 'sg_app', APP_PASSWORD);

  const app = createDb(appUrl, { max: 5 });
  const admin = createDb(adminUrl, { max: 2 });

  return {
    ...app,
    appUrl,
    adminUrl,
    admin,
    drop: async () => {
      await app.close();
      await admin.close();
      const r = postgres(base, { max: 1, onnotice: () => undefined });
      await r.unsafe(`drop database if exists ${name} with (force)`);
      await r.end();
    },
  };
}
