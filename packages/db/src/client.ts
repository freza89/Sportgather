import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DbHandle {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Koneksi aplikasi. URL HARUS memakai role `sg_app` (tanpa BYPASSRLS) agar RLS berlaku.
 */
export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => undefined });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, close: () => client.end({ timeout: 5 }) };
}

export interface RequestContext {
  /** Tenant aktif. Tanpa ini, tabel tenant hanya mengembalikan baris yang diizinkan policy lintas-klub. */
  orgId?: string | undefined;
  /** Orang yang sedang login (untuk policy "klub tempat saya menjadi staf"). */
  personId?: string | undefined;
}

/**
 * Menjalankan `fn` di dalam transaksi dengan konteks RLS (`app.org_id`, `app.person_id`).
 * `set_config(..., true)` bersifat lokal-transaksi, sehingga konteks tidak bocor ke
 * koneksi lain di pool.
 */
export async function withContext<T>(
  db: Database,
  ctx: RequestContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.org_id', ${ctx.orgId ?? ''}, true), set_config('app.person_id', ${ctx.personId ?? ''}, true)`,
    );
    return fn(tx);
  });
}

/** Shortcut untuk operasi di dalam satu klub. */
export function withTenant<T>(
  db: Database,
  orgId: string,
  personId: string | undefined,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withContext(db, { orgId, personId }, fn);
}
