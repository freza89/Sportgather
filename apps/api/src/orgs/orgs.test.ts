import { auditLog } from '@sportgather/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLUB, Client, createHarness, type Harness } from '../test/harness.js';

describe('klub, staf, dan hak akses (A-01, A-02, A-03)', () => {
  let h: Harness;
  let owner: Client;
  let slug: string;
  let orgId: string;

  beforeAll(async () => {
    h = await createHarness();
    owner = new Client(h);
    await owner.loginOtp('081300000001', { purpose: 'signup', fullName: 'Rizky Ramadhan' });
    const res = await owner.call('POST', '/v1/orgs', CLUB);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    slug = (res.body as { slug: string }).slug;
    orgId = (res.body as { id: string }).id;
  });
  afterAll(async () => {
    await h.close();
  });

  it('US-01: pembuat klub otomatis owner, slug dari nama, rekening terverifikasi', async () => {
    expect(slug).toBe('klub-uji-basket');
    const me = await owner.call('GET', '/v1/me');
    expect(me.body).toMatchObject({ clubs: [{ slug, role: 'owner', status: 'active' }] });
    const bank = await owner.call('GET', `/v1/orgs/${slug}/bank-account`);
    expect(bank.body).toMatchObject({ maskedNumber: 'BCA •••• 4821', status: 'verified' });
    expect(JSON.stringify(bank.body)).not.toContain('0123454821');
  });

  it('pembuatan klub tercatat di audit log tanpa nomor rekening lengkap', async () => {
    const rows = await h.db.admin.db.select().from(auditLog).where(eq(auditLog.orgId, orgId));
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['org.created', 'bank_account.submitted']),
    );
    expect(JSON.stringify(rows)).not.toContain('0123454821');
  });

  it('nama klub sama → slug berbeda', async () => {
    const other = new Client(h);
    await other.loginOtp('081300000099', { purpose: 'signup', fullName: 'Owner Lain' });
    const res = await other.call('POST', '/v1/orgs', CLUB);
    expect((res.body as { slug: string }).slug).toBe('klub-uji-basket-2');
  });

  it('validasi: minimal satu lokasi, rekening valid', async () => {
    const res = await owner.call('POST', '/v1/orgs', { ...CLUB, branches: [] });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Tambahkan minimal satu lokasi latihan' });
  });

  it('isolasi: orang dari klub lain mendapat 404 untuk semua endpoint klub ini', async () => {
    const outsider = new Client(h);
    await outsider.loginOtp('081300000002', { purpose: 'signup', fullName: 'Orang Luar' });
    for (const url of [
      `/v1/orgs/${slug}`,
      `/v1/orgs/${slug}/staff`,
      `/v1/orgs/${slug}/branches`,
      `/v1/orgs/${slug}/bank-account`,
    ]) {
      expect((await outsider.call('GET', url)).status, url).toBe(404);
    }
    expect((await outsider.call('PATCH', `/v1/orgs/${slug}`, { name: 'Dibajak' })).status).toBe(
      404,
    );
  });

  it('mengubah profil & mengelola lokasi latihan', async () => {
    const upd = await owner.call('PATCH', `/v1/orgs/${slug}`, {
      city: 'Cimahi',
      whatsapp: '0812-3456-7890',
    });
    expect(upd.body).toMatchObject({ city: 'Cimahi', whatsapp: '+6281234567890' });
    const add = await owner.call('POST', `/v1/orgs/${slug}/branches`, {
      name: 'Lapangan Saparua',
      address: 'Jl. Banda, Bandung',
      timezone: 'Asia/Jakarta',
      courts: 1,
    });
    expect(add.status).toBe(201);
    const list = await owner.call('GET', `/v1/orgs/${slug}/branches`);
    expect((list.body as unknown[]).length).toBe(2);
    expect(
      (await owner.call('DELETE', `/v1/orgs/${slug}/branches/${(add.body as { id: string }).id}`))
        .status,
    ).toBe(204);
    const [only] = (await owner.call('GET', `/v1/orgs/${slug}/branches`)).body as { id: string }[];
    expect((await owner.call('DELETE', `/v1/orgs/${slug}/branches/${only!.id}`)).status).toBe(409);
  });

  describe('undangan staf & peran', () => {
    let coach: Client;
    let coachStaffId: string;

    it('owner mengundang pelatih lewat WhatsApp', async () => {
      const res = await owner.call('POST', `/v1/orgs/${slug}/staff`, {
        fullName: 'Coach Andi',
        phone: '0857-3333-4444',
        role: 'coach',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({ role: 'coach', status: 'invited' });
      coachStaffId = (res.body as { id: string }).id;
      const wa = h.outbox.latest('+6285733334444', 'undangan_staf');
      expect(wa?.params).toMatchObject({ klub: CLUB.name, peran: 'Pelatih' });
      expect(wa?.params.link).toMatch(/\/undangan\/[\w-]{20,}$/);
    });

    it('undangan ganda ditolak', async () => {
      const res = await owner.call('POST', `/v1/orgs/${slug}/staff`, {
        fullName: 'Coach Andi',
        phone: '085733334444',
        role: 'coach',
      });
      expect(res.status).toBe(409);
    });

    it('pelatih membuka link, login OTP, lalu menerima undangan', async () => {
      const token = h.outbox
        .latest('+6285733334444', 'undangan_staf')!
        .params.link!.split('/')
        .pop()!;
      const preview = await new Client(h).call('GET', `/v1/invitations/${token}`);
      expect(preview.body).toMatchObject({
        orgName: CLUB.name,
        role: 'coach',
        invitedName: 'Coach Andi',
        phoneMasked: '0857-****-4444',
        accepted: false,
      });

      coach = new Client(h);
      await coach.loginOtp('085733334444');
      // Sebelum menerima, pelatih belum bisa membuka klub.
      expect((await coach.call('GET', `/v1/orgs/${slug}`)).status).toBe(404);
      const accept = await coach.call('POST', '/v1/invitations/accept', { token });
      expect(accept.body).toEqual({ slug, role: 'coach' });
      expect((await coach.call('POST', '/v1/invitations/accept', { token })).status).toBe(410);
    });

    it('undangan hanya bisa diterima nomor yang diundang', async () => {
      await owner.call('POST', `/v1/orgs/${slug}/staff`, {
        fullName: 'Fajar Akbar',
        phone: '085699990001',
        role: 'team_manager',
      });
      const token = h.outbox
        .latest('+6285699990001', 'undangan_staf')!
        .params.link!.split('/')
        .pop()!;
      expect((await coach.call('POST', '/v1/invitations/accept', { token })).status).toBe(403);
    });

    it('RBAC pelatih: boleh lihat klub, tidak boleh mengubah, lihat staf, atau rekening', async () => {
      expect((await coach.call('GET', `/v1/orgs/${slug}`)).status).toBe(200);
      expect((await coach.call('PATCH', `/v1/orgs/${slug}`, { city: 'X' })).status).toBe(403);
      expect((await coach.call('GET', `/v1/orgs/${slug}/staff`)).status).toBe(403);
      expect((await coach.call('GET', `/v1/orgs/${slug}/bank-account`)).status).toBe(403);
      expect(
        (await coach.call('PUT', `/v1/orgs/${slug}/bank-account`, CLUB.bankAccount)).status,
      ).toBe(403);
    });

    it('admin: bisa undang pelatih, tidak bisa undang admin, mengubah owner, atau ganti rekening', async () => {
      await owner.call('POST', `/v1/orgs/${slug}/staff`, {
        fullName: 'Dewi Lestari',
        phone: '081311112222',
        role: 'admin',
      });
      const token = h.outbox
        .latest('+6281311112222', 'undangan_staf')!
        .params.link!.split('/')
        .pop()!;
      const admin = new Client(h);
      await admin.loginOtp('081311112222');
      await admin.call('POST', '/v1/invitations/accept', { token });

      expect((await admin.call('GET', `/v1/orgs/${slug}/staff`)).status).toBe(200);
      expect(
        (
          await admin.call('POST', `/v1/orgs/${slug}/staff`, {
            fullName: 'Coach Bima',
            phone: '081255556666',
            role: 'coach',
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await admin.call('POST', `/v1/orgs/${slug}/staff`, {
            fullName: 'Admin Lain',
            phone: '081255557777',
            role: 'admin',
          })
        ).status,
      ).toBe(403);
      const staff = (await admin.call('GET', `/v1/orgs/${slug}/staff`)).body as {
        id: string;
        role: string;
      }[];
      const ownerRow = staff.find((s) => s.role === 'owner')!;
      expect(
        (await admin.call('PATCH', `/v1/orgs/${slug}/staff/${ownerRow.id}`, { role: 'coach' }))
          .status,
      ).toBe(403);
      expect(
        (await admin.call('PUT', `/v1/orgs/${slug}/bank-account`, CLUB.bankAccount)).status,
      ).toBe(403);
      // Admin boleh mengubah peran pelatih.
      expect(
        (
          await admin.call('PATCH', `/v1/orgs/${slug}/staff/${coachStaffId}`, {
            role: 'team_manager',
          })
        ).status,
      ).toBe(200);
    });

    it('owner tidak bisa mengubah/menghapus dirinya; klub harus punya owner', async () => {
      const staff = (await owner.call('GET', `/v1/orgs/${slug}/staff`)).body as {
        id: string;
        role: string;
      }[];
      const self = staff.find((s) => s.role === 'owner')!;
      expect((await owner.call('DELETE', `/v1/orgs/${slug}/staff/${self.id}`)).status).toBe(403);
    });

    it('staf yang dihapus kehilangan akses', async () => {
      expect((await owner.call('DELETE', `/v1/orgs/${slug}/staff/${coachStaffId}`)).status).toBe(
        204,
      );
      expect((await coach.call('GET', `/v1/orgs/${slug}`)).status).toBe(404);
    });
  });

  describe('rekening penerimaan (FEE-08)', () => {
    it('owner mengganti rekening → rekening lama diganti, yang baru diverifikasi ulang', async () => {
      const res = await owner.call('PUT', `/v1/orgs/${slug}/bank-account`, {
        bankCode: 'MANDIRI',
        accountNumber: '1300099999999',
        holderName: 'Klub Uji Basket',
      });
      expect(res.body).toMatchObject({
        maskedNumber: 'Mandiri •••• 9999',
        status: 'pending_verification',
      });
      const rows = await h.db.admin.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'bank_account.replaced'));
      expect(rows).toHaveLength(1);
    });

    it('nama pemilik tidak cocok → ditolak dengan catatan', async () => {
      const res = await owner.call('PUT', `/v1/orgs/${slug}/bank-account`, {
        bankCode: 'BCA',
        accountNumber: '1234560000',
        holderName: 'Nama Lain',
      });
      expect(res.body).toMatchObject({
        status: 'rejected',
        verificationNote: 'Nama pemilik rekening tidak cocok',
      });
    });
  });

  describe('login email + kata sandi (opsional owner/admin)', () => {
    it('owner mengatur kata sandi lalu bisa login dengannya', async () => {
      const set = await owner.call('POST', '/v1/auth/password', {
        email: 'Owner@Klub.id',
        password: 'rahasia-panjang-sekali',
      });
      expect(set.status).toBe(200);
      const fresh = new Client(h);
      expect(
        (
          await fresh.call('POST', '/v1/auth/password/login', {
            email: 'owner@klub.id',
            password: 'salah-salah-salah',
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fresh.call('POST', '/v1/auth/password/login', {
            email: 'owner@klub.id',
            password: 'rahasia-panjang-sekali',
          })
        ).status,
      ).toBe(200);
      expect((await fresh.call('GET', '/v1/me')).body).toMatchObject({
        user: { email: 'owner@klub.id' },
      });
    });

    it('wali/pelatih tidak bisa mengatur kata sandi', async () => {
      const parent = new Client(h);
      await parent.loginOtp('081377778888', { purpose: 'signup', fullName: 'Wali' });
      expect(
        (
          await parent.call('POST', '/v1/auth/password', {
            email: 'wali@x.id',
            password: 'rahasia-panjang-sekali',
          })
        ).status,
      ).toBe(401);
    });
  });
});
