// Menyiapkan database e2e terpisah (sportgather_e2e) lalu menjalankan migrasi.
import postgres from 'postgres';
import { runMigrations } from '@sportgather/db/migrate';

const admin =
  process.env.DATABASE_ADMIN_URL ??
  'postgres://sportgather:sportgather@localhost:55432/sportgather';
const name = 'sportgather_e2e';
const root = postgres(admin, { max: 1, onnotice: () => undefined });
const [exists] = await root`select 1 from pg_database where datname = ${name}`;
if (!exists) await root.unsafe(`create database ${name}`);
await root.end();
const url = new URL(admin);
url.pathname = `/${name}`;
await runMigrations(url.toString(), { appPassword: 'sg_app_e2e' });
console.log('Database e2e siap.');
