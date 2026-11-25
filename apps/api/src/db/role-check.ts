import { sql } from 'drizzle-orm';
import type { Database } from '@sportgather/db';

/**
 * Pengaman: aplikasi tidak boleh terhubung sebagai superuser atau role BYPASSRLS,
 * karena isolasi tenant (RLS) tidak akan berlaku. Gagal cepat saat start.
 */
export async function assertRlsEnforced(db: Database): Promise<void> {
  const [row] = await db.execute<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
    sql`select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  if (!row || row.rolsuper || row.rolbypassrls) {
    throw new Error(
      `DATABASE_URL memakai role "${row?.rolname}" yang melewati RLS. Gunakan role sg_app (lihat .env.example).`,
    );
  }
}
