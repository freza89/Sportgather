import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditLog,
  bankAccount,
  branch,
  consent,
  invitation,
  membership,
  organization,
  person,
  staffRole,
  TENANT_TABLES,
  withContext,
  withTenant,
} from './index.js';
import { createTestDatabase, type TestDatabase } from './testing.js';

/**
 * Definisi selesai MVP no. 3: "data klub A tidak pernah terbaca dari klub B".
 * Setiap tabel tenant diisi untuk dua klub lewat koneksi admin, lalu dibaca/ditulis
 * sebagai sg_app dengan konteks klub A.
 */
/** Drizzle membungkus error Postgres; pesan aslinya ada di `cause`. */
async function expectPgError(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, 'seharusnya gagal').toBeInstanceOf(Error);
  const cause = (error as { cause?: { message?: string } }).cause;
  expect(cause?.message ?? (error as Error).message).toMatch(pattern);
}

describe('isolasi tenant (RLS)', () => {
  let t: TestDatabase;
  const A = randomUUID();
  const B = randomUUID();
  const ownerA = randomUUID();
  const ownerB = randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase();
    const db = t.admin.db;
    await db.insert(person).values([
      { id: ownerA, fullName: 'Owner A' },
      { id: ownerB, fullName: 'Owner B' },
    ]);
    for (const [org, owner, slug] of [
      [A, ownerA, 'klub-a'],
      [B, ownerB, 'klub-b'],
    ] as const) {
      await db.insert(organization).values({ id: org, slug, name: slug, city: 'Bandung' });
      await db.insert(branch).values({ orgId: org, name: 'GOR', address: 'Jl. X' });
      await db.insert(bankAccount).values({
        orgId: org,
        bankCode: 'BCA',
        accountNumber: '1234567890',
        holderName: slug,
        submittedBy: owner,
      });
      const [role] = await db
        .insert(staffRole)
        .values({ orgId: org, personId: owner, role: 'owner' })
        .returning();
      await db.insert(invitation).values({
        orgId: org,
        staffRoleId: role!.id,
        phone: '+6281200000000',
        tokenHash: `hash-${slug}`,
        invitedBy: owner,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      await db.insert(membership).values({ orgId: org, personId: owner });
      await db.insert(consent).values({
        orgId: org,
        guardianPersonId: owner,
        subjectPersonId: owner,
        kind: 'data_anak',
        version: 'v1',
      });
      await db.insert(auditLog).values({ orgId: org, action: 'test', entityType: 'test' });
    }
  });

  afterAll(async () => {
    await t?.drop();
  });

  it('daftar tabel tenant diturunkan dari skema', () => {
    expect(TENANT_TABLES).toEqual(
      expect.arrayContaining([
        'audit_log',
        'bank_account',
        'branch',
        'consent',
        'invitation',
        'membership',
        'staff_role',
      ]),
    );
  });

  it('setiap tabel tenant memakai FORCE RLS dan punya policy', async () => {
    const rows = await t.admin.db.execute<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      policies: number;
    }>(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
             (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
      from pg_class c where c.relname in ${[...TENANT_TABLES, 'organization']}`);
    expect(rows.length).toBe(TENANT_TABLES.length + 1);
    for (const r of rows) {
      expect(r, r.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
      expect(r.policies, r.relname).toBeGreaterThan(0);
    }
  });

  it('role sg_app tidak bisa melewati RLS', async () => {
    const [r] = await t.admin.db.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
      sql`select rolbypassrls, rolsuper from pg_roles where rolname = 'sg_app'`,
    );
    expect(r).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it.each(TENANT_TABLES)('%s: konteks klub A hanya melihat baris klub A', async (table) => {
    const rows = await withTenant(t.db, A, undefined, (tx) =>
      tx.execute<{ org_id: string }>(sql`select org_id from ${sql.identifier(table)}`),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.org_id))).toEqual(new Set([A]));
  });

  it.each(TENANT_TABLES)('%s: tanpa konteks tidak ada baris yang terbaca', async (table) => {
    const rows = await withContext(t.db, {}, (tx) =>
      tx.execute(sql`select 1 from ${sql.identifier(table)}`),
    );
    expect(rows.length).toBe(0);
  });

  it('organization: klub B tidak terbaca dari konteks klub A', async () => {
    const rows = await withTenant(t.db, A, undefined, (tx) => tx.select().from(organization));
    expect(rows.map((r) => r.id)).toEqual([A]);
  });

  it('organization: orang hanya melihat klub tempat ia menjadi staf', async () => {
    const rows = await withContext(t.db, { personId: ownerB }, (tx) =>
      tx.select().from(organization),
    );
    expect(rows.map((r) => r.id)).toEqual([B]);
  });

  it('tidak bisa menulis baris milik klub lain', async () => {
    await expectPgError(
      withTenant(t.db, A, undefined, (tx) =>
        tx.insert(branch).values({ orgId: B, name: 'Susupan', address: 'Jl. Y' }),
      ),
      /row-level security/,
    );
  });

  it('update/delete ke klub lain tidak berdampak', async () => {
    const updated = await withTenant(t.db, A, undefined, (tx) =>
      tx.update(branch).set({ name: 'Diubah' }).where(eq(branch.orgId, B)).returning(),
    );
    expect(updated).toEqual([]);
    const deleted = await withTenant(t.db, A, undefined, (tx) =>
      tx.delete(bankAccount).where(eq(bankAccount.orgId, B)).returning(),
    );
    expect(deleted).toEqual([]);
    const [still] = await t.admin.db.select().from(branch).where(eq(branch.orgId, B));
    expect(still?.name).toBe('GOR');
  });

  it('audit log append-only bagi aplikasi', async () => {
    await expectPgError(
      withTenant(t.db, A, undefined, (tx) => tx.update(auditLog).set({ action: 'diubah' })),
      /permission denied/,
    );
    await expectPgError(
      withTenant(t.db, A, undefined, (tx) => tx.delete(auditLog)),
      /permission denied/,
    );
  });

  it('konteks tidak bocor antar transaksi di pool', async () => {
    await withTenant(t.db, A, undefined, async () => undefined);
    const rows = await t.db.execute(sql`select current_setting('app.org_id', true) as org`);
    expect([undefined, null, '']).toContain((rows[0] as { org?: string } | undefined)?.org);
  });

  it('sg_find_invitation hanya mengembalikan id & org', async () => {
    const rows = await withContext(t.db, {}, (tx) =>
      tx.execute<{ invitation_id: string; org_id: string }>(
        sql`select * from sg_find_invitation('hash-klub-b')`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(['invitation_id', 'org_id']);
    expect(rows[0]!.org_id).toBe(B);
  });
});
