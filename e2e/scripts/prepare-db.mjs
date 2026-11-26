// Menyiapkan database e2e terpisah (sportgather_e2e) lalu menjalankan migrasi.
import postgres from 'postgres';
import { runMigrations } from '@sportgather/db/migrate';
import { appPasswordForTests } from '@sportgather/db/testing';

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
// Password sama dengan dev agar API dev lokal tidak ikut putus (role sg_app berlaku global).
await runMigrations(url.toString(), { appPassword: appPasswordForTests() });
console.log('Database e2e siap.');
