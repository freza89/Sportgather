import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accessToken,
  checkout,
  checkoutInvoice,
  feePlan,
  gatewayEvent,
  invoice,
  invoiceCounter,
  ledgerEntry,
  payment,
  paymentAttempt,
  withdrawal,
  announcement,
  announcementRecipient,
  assessment,
  assessmentNote,
  dataRequest,
  reportPublication,
  skill,
  attendance,
  attendanceOp,
  auditLog,
  bankAccount,
  branch,
  competition,
  consent,
  document,
  event,
  eventSeries,
  guardianLink,
  holiday,
  invitation,
  membership,
  notificationLog,
  organization,
  person,
  rsvp,
  season,
  staffRole,
  team,
  teamCompetition,
  teamMember,
  teamStaff,
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
  const childA = randomUUID();
  const childB = randomUUID();
  const guardianA = randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase();
    const db = t.admin.db;
    await db.insert(person).values([
      { id: ownerA, fullName: 'Owner A' },
      { id: ownerB, fullName: 'Owner B' },
      { id: childA, fullName: 'Anak A', birthDate: '2015-03-12', gender: 'male' },
      { id: childB, fullName: 'Anak B', birthDate: '2016-01-01', gender: 'female' },
      { id: guardianA, fullName: 'Wali A' },
    ]);
    await db
      .insert(guardianLink)
      .values({ guardianPersonId: guardianA, childPersonId: childA, relation: 'mother' });
    for (const [org, owner, slug, child] of [
      [A, ownerA, 'klub-a', childA],
      [B, ownerB, 'klub-b', childB],
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

      // Tabel M2: musim, kompetisi, tim, anggota, staf tim, dokumen.
      const [m] = await db
        .insert(membership)
        .values({ orgId: org, personId: child, status: 'active' })
        .returning();
      const [s1] = await db
        .insert(season)
        .values({
          orgId: org,
          name: 'Musim 2027',
          startsOn: '2027-01-01',
          endsOn: '2027-12-31',
          status: 'active',
        })
        .returning();
      const [c] = await db
        .insert(competition)
        .values({
          orgId: org,
          seasonId: s1!.id,
          name: 'Liga',
          referenceDate: '2027-06-14',
          kuGroups: [12, 14],
        })
        .returning();
      const [tm] = await db
        .insert(team)
        .values({ orgId: org, seasonId: s1!.id, name: 'KU12 Elite', ku: 12, level: 'Elite' })
        .returning();
      await db.insert(teamMember).values({
        orgId: org,
        teamId: tm!.id,
        seasonId: s1!.id,
        membershipId: m!.id,
        actualKu: 12,
      });
      await db.insert(teamStaff).values({ orgId: org, teamId: tm!.id, staffRoleId: role!.id });
      await db.insert(teamCompetition).values({ orgId: org, teamId: tm!.id, competitionId: c!.id });
      // Tabel M3: jadwal, RSVP, absensi, token, log notifikasi.
      const [ser] = await db
        .insert(eventSeries)
        .values({
          orgId: org,
          teamId: tm!.id,
          weekday: 2,
          startTime: '16:00',
          durationMin: 90,
          startsOn: '2027-01-01',
          endsOn: '2027-12-31',
        })
        .returning();
      const [ev] = await db
        .insert(event)
        .values({
          orgId: org,
          teamId: tm!.id,
          seriesId: ser!.id,
          occurrenceDate: '2027-10-12',
          startsAt: new Date('2027-10-12T09:00:00Z'),
          endsAt: new Date('2027-10-12T10:30:00Z'),
        })
        .returning();
      await db.insert(holiday).values({ orgId: org, date: '2027-10-15', name: 'Libur' });
      await db
        .insert(rsvp)
        .values({ orgId: org, eventId: ev!.id, membershipId: m!.id, status: 'hadir' });
      const op = randomUUID();
      await db.insert(attendance).values({
        orgId: org,
        eventId: ev!.id,
        membershipId: m!.id,
        status: 'hadir',
        recordedBy: owner,
        recordedAt: new Date(),
        clientOpId: op,
      });
      await db.insert(attendanceOp).values({ orgId: org, clientOpId: op });
      await db.insert(accessToken).values({
        orgId: org,
        tokenHash: `tok-${slug}`,
        personId: owner,
        purpose: 'rsvp',
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      await db
        .insert(notificationLog)
        .values({ orgId: org, dedupeKey: `k-${slug}`, template: 'pengingat_sesi' });
      // Tabel M4: iuran, checkout, pembayaran, ledger, penarikan.
      const [plan] = await db
        .insert(feePlan)
        .values({ orgId: org, name: 'Iuran', kind: 'monthly', amount: 350_000 })
        .returning();
      await db.insert(invoiceCounter).values({ orgId: org, period: '2027-10', last: 1 });
      const [inv] = await db
        .insert(invoice)
        .values({
          orgId: org,
          number: 'INV-2710-0001',
          membershipId: m!.id,
          planId: plan!.id,
          kind: 'recurring',
          period: '2027-10',
          description: 'Iuran',
          amount: 350_000,
          total: 350_000,
          issueDate: '2027-10-01',
          dueDate: '2027-10-10',
        })
        .returning();
      const [co] = await db
        .insert(checkout)
        .values({
          orgId: org,
          guardianPersonId: owner,
          method: 'qris',
          base: 350_000,
          serviceFee: 0,
          gross: 350_000,
          platformFee: 2_500,
        })
        .returning();
      await db
        .insert(checkoutInvoice)
        .values({ orgId: org, checkoutId: co!.id, invoiceId: inv!.id });
      await db.insert(paymentAttempt).values({
        orgId: org,
        checkoutId: co!.id,
        orderId: `order-${slug}`,
        method: 'qris',
        gross: 350_000,
      });
      await db.insert(gatewayEvent).values({
        orgId: org,
        orderId: `order-${slug}`,
        transactionStatus: 'settlement',
        statusCode: '200',
        grossAmount: '350000.00',
        payload: {},
      });
      const [pay] = await db
        .insert(payment)
        .values({
          orgId: org,
          invoiceId: inv!.id,
          checkoutId: co!.id,
          method: 'qris',
          amount: 350_000,
          paidAt: new Date(),
        })
        .returning();
      const [bank] = await db.select().from(bankAccount).where(eq(bankAccount.orgId, org));
      const [wd] = await db
        .insert(withdrawal)
        .values({
          orgId: org,
          amount: 100_000,
          fee: 2_500,
          net: 97_500,
          bankAccountId: bank!.id,
          requestedBy: owner,
        })
        .returning();
      await db.insert(ledgerEntry).values([
        {
          orgId: org,
          kind: 'club_gross',
          amount: 350_000,
          invoiceId: inv!.id,
          paymentId: pay!.id,
          availableAt: new Date(),
        },
        {
          orgId: org,
          kind: 'withdrawal',
          amount: -100_000,
          withdrawalId: wd!.id,
          availableAt: new Date(),
        },
      ]);
      await db.insert(document).values({
        orgId: org,
        personId: child,
        kind: 'akta',
        storageKey: `docs/${slug}`,
        fileName: 'akta.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        sha256: 'x',
        uploadedBy: owner,
      });
      // Tabel M5: pengumuman, penilaian, rapor, permintaan data.
      const [ann] = await db
        .insert(announcement)
        .values({
          orgId: org,
          authorPersonId: owner,
          title: 'Info',
          body: 'Isi',
          targetKind: 'club',
          targetLabel: 'Seluruh klub',
          eventId: ev!.id,
        })
        .returning();
      await db
        .insert(announcementRecipient)
        .values({ orgId: org, announcementId: ann!.id, personId: owner });
      const [sk] = await db
        .insert(skill)
        .values({ orgId: org, name: 'Dribel', kuMin: 8, kuMax: 16 })
        .returning();
      await db.insert(assessment).values({
        orgId: org,
        membershipId: m!.id,
        seasonId: s1!.id,
        semester: 1,
        skillId: sk!.id,
        score: 4,
        assessedBy: owner,
      });
      await db.insert(assessmentNote).values({
        orgId: org,
        membershipId: m!.id,
        seasonId: s1!.id,
        semester: 1,
        note: 'Bagus',
        authorPersonId: owner,
      });
      await db
        .insert(reportPublication)
        .values({ orgId: org, seasonId: s1!.id, semester: 1, publishedBy: owner });
      await db
        .insert(dataRequest)
        .values({ orgId: org, requesterPersonId: owner, membershipId: m!.id });
    }
  });

  afterAll(async () => {
    await t?.drop();
  });

  it('daftar tabel tenant diturunkan dari skema', () => {
    expect(TENANT_TABLES).toEqual(
      expect.arrayContaining([
        'access_token',
        'attendance',
        'attendance_op',
        'audit_log',
        'bank_account',
        'branch',
        'competition',
        'consent',
        'document',
        'event',
        'event_series',
        'holiday',
        'invitation',
        'membership',
        'notification_log',
        'rsvp',
        'season',
        'team',
        'team_competition',
        'team_member',
        'team_staff',
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

  describe('data orang (person, guardian_link)', () => {
    const visible = (ctx: { orgId?: string; personId?: string }) =>
      withContext(t.db, ctx, async (tx) =>
        (await tx.select({ id: person.id }).from(person)).map((r) => r.id).sort(),
      );

    it('klub A hanya melihat anggota, staf, dan wali klub A', async () => {
      const ids = await visible({ orgId: A });
      expect(ids).toEqual([childA, ownerA, guardianA].sort());
      expect(ids).not.toContain(childB);
    });

    it('tanpa konteks tidak ada orang yang terbaca', async () => {
      expect(await visible({})).toEqual([]);
    });

    it('wali melihat dirinya dan anaknya saja', async () => {
      expect(await visible({ personId: guardianA })).toEqual([childA, guardianA].sort());
    });

    it('relasi wali klub lain tidak terbaca', async () => {
      const links = await withContext(t.db, { orgId: B }, (tx) => tx.select().from(guardianLink));
      expect(links).toEqual([]);
    });

    it('membuat orang baru boleh (pendaftaran), tapi tidak bisa membaca balik tanpa relasi', async () => {
      const id = randomUUID();
      await withTenant(t.db, A, undefined, (tx) =>
        tx.insert(person).values({ id, fullName: 'Pendaftar' }),
      );
      expect(await visible({ orgId: A })).not.toContain(id);
    });
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

  it('ledger dana klub append-only bagi aplikasi', async () => {
    await expectPgError(
      withTenant(t.db, A, undefined, (tx) => tx.update(ledgerEntry).set({ amount: 1 })),
      /permission denied/,
    );
    await expectPgError(
      withTenant(t.db, A, undefined, (tx) => tx.delete(ledgerEntry)),
      /permission denied/,
    );
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
