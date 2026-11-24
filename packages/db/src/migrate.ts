import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Jalankan migrasi memakai koneksi admin (pemilik tabel). Bila `appPassword` diberikan,
 * role `sg_app` diaktifkan untuk login (dipakai di lokal/tes; di produksi diatur ops).
 */
export async function runMigrations(
  adminUrl: string,
  options: { appPassword?: string | undefined } = {},
) {
  const client = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
    if (options.appPassword) {
      await client.unsafe(
        `alter role sg_app with login password '${options.appPassword.replace(/'/g, "''")}'`,
      );
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
