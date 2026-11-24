import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema/index.js';

/**
 * Semua tabel yang punya kolom `org_id`, diturunkan otomatis dari skema.
 * Tes isolasi memakai daftar ini sehingga tabel tenant baru otomatis ikut diuji.
 */
export const TENANT_TABLES: string[] = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((t) => getTableConfig(t))
  // Nama kolom di sini masih kunci TS (camelCase); snake_case diterapkan saat query.
  .filter((c) => c.columns.some((col) => col.name === 'orgId' || col.name === 'org_id'))
  .map((c) => c.name)
  .sort();
