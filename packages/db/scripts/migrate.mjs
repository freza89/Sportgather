// Jalankan: pnpm --filter @sportgather/db db:migrate  (membaca .env di root repo)
import { runMigrations } from '../dist/migrate.js';

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error('DATABASE_ADMIN_URL belum diatur (lihat .env.example)');
  process.exit(1);
}
await runMigrations(adminUrl, { appPassword: process.env.DB_APP_PASSWORD });
console.log('Migrasi selesai.');
