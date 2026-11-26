import { addDays } from '@sportgather/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayIso } from '../seasons/ku-context.js';
import { CLUB, Client, createHarness, multipart, type Harness } from '../test/harness.js';
import { CoachingService } from './coaching.service.js';

const FAKE_PDF = Buffer.from('%PDF-1.7\nsertifikat lisensi pelatih');

/** M7: profil/CV & lisensi pelatih (ADR-034). */
describe('M7 · profil & lisensi pelatih', () => {
  let h: Harness;
  let owner: Client;
  let admin: Client;
  let coach: Client;
  let otherCoach: Client;
  let wali: Client;
  let slug: string;
  let coachId: string;
  let otherCoachId: string;
  let adminId: string;
  let childId: string;
  const today = todayIso();
  const base = () => `/v1/orgs/${slug}`;
  const prof = (id: string) => `${base()}/coach-profiles/${id}`;
  const COACH = '+6281800000003';
  const OWNER = '+6281800000001';

  beforeAll(async () => {
    h = await createHarness();
    owner = new Client(h);
    await owner.loginOtp('081800000001', { purpose: 'signup', fullName: 'Owner M7' });
    slug = (await owner.call('POST', '/v1/orgs', CLUB)).body.slug;
    await owner.call('POST', `${base()}/seasons`, {
      name: 'Musim M7',
      startsOn: addDays(today, -30),
      endsOn: addDays(today, 200),
    });
    const people = [
      ['081800000002', 'Admin Sari', 'admin'],
      ['081800000003', 'Coach Dimas', 'coach'],
      ['081800000004', 'Coach Ayu', 'coach'],
    ] as const;
    const clients: Client[] = [];
    for (const [phone, name, role] of people) {
      await owner.call('POST', `${base()}/staff`, { fullName: name, phone, role });
      const e164 = `+62${phone.slice(1)}`;
      const token = h.outbox.latest(e164, 'undangan_staf')!.params.link!.split('/').pop()!;
      const c = new Client(h);
      await c.loginOtp(phone);
      await c.call('POST', '/v1/invitations/accept', { token });
      clients.push(c);
    }
    [admin, coach, otherCoach] = clients as [Client, Client, Client];
    const staff = (await owner.call('GET', `${base()}/staff`)).body as {
      id: string;
      fullName: string;
    }[];
    const sid = (n: string) => staff.find((s) => s.fullName === n)!.id;
    coachId = sid('Coach Dimas');
    otherCoachId = sid('Coach Ayu');
    adminId = sid('Admin Sari');
    const team = (
      await owner.call('POST', `${base()}/teams`, {
        ku: 12,
        level: 'Kompetisi',
        staffRoleIds: [coachId],
      })
    ).body.id;
    const year = Number(today.slice(0, 4));
    await owner.call('POST', `${base()}/players/import`, {
      commit: true,
      rows: [
        {
          fullName: 'Raka Tujuh',
          birthDate: `${year - 11}-05-01`,
          gender: 'L',
          guardianName: 'Rina Tujuh',
          guardianPhone: '081800000009',
        },
      ],
    });
    childId = (await owner.call('GET', `${base()}/players`)).body.rows[0].membershipId;
    await owner.call('POST', `${base()}/teams/${team}/members`, { membershipId: childId });
    wali = new Client(h);
    await wali.loginOtp('081800000009');
  });
  afterAll(async () => {
    await h.close();
  });

  describe('profil & CV', () => {
    it('pelatih mengisi profil sendiri lewat /me; admin bisa melihat', async () => {
      const put = await coach.call('PUT', prof('me'), {
        headline: 'Pelatih kepala KU12',
        specialization: 'Pertahanan & fundamental',
        bio: 'Mantan pemain liga mahasiswa.',
        yearsCoaching: 6,
      });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      expect(put.body).toMatchObject({
        staffId: coachId,
        canEdit: true,
        canReview: false,
        teams: [{ name: expect.stringContaining('KU12') }],
      });
      const seen = await admin.call('GET', prof(coachId));
      expect(seen.body.profile).toMatchObject({
        headline: 'Pelatih kepala KU12',
        yearsCoaching: 6,
      });
      expect(seen.body).toMatchObject({ canEdit: true, canReview: true });
    });

    it('riwayat pengalaman: tambah, ubah, hapus; "sampai sekarang" di urutan atas', async () => {
      await coach.call('POST', `${prof('me')}/experiences`, {
        title: 'Asisten pelatih',
        organization: 'Klub Lama',
        startYear: 2018,
        endYear: 2021,
      });
      const r = await coach.call('POST', `${prof('me')}/experiences`, {
        title: 'Pelatih kepala',
        organization: 'Belajar Basket',
        startYear: 2021,
      });
      expect(r.body.experiences.map((e: { title: string }) => e.title)).toEqual([
        'Pelatih kepala',
        'Asisten pelatih',
      ]);
      const old = r.body.experiences[1].id;
      const bad = await coach.call('PUT', `${prof('me')}/experiences/${old}`, {
        title: 'Asisten pelatih',
        organization: 'Klub Lama',
        startYear: 2021,
        endYear: 2018,
      });
      expect(bad.status).toBe(400);
      const del = await coach.call('DELETE', `${prof('me')}/experiences/${old}`);
      expect(del.body.experiences).toHaveLength(1);
    });

    it('pelatih lain tidak bisa melihat atau mengubah profil rekannya', async () => {
      expect((await otherCoach.call('GET', prof(coachId))).status).toBe(404);
      expect((await otherCoach.call('PUT', prof(coachId), { headline: 'x' })).status).toBe(404);
    });

    it('admin tidak bisa mengubah profil owner; owner bisa mengubah profil admin', async () => {
      const ownerStaff = (await owner.call('GET', prof('me'))).body.staffId;
      expect((await admin.call('PUT', prof(ownerStaff), { headline: 'x' })).status).toBe(403);
      expect((await owner.call('PUT', prof(adminId), { headline: 'Admin klub' })).status).toBe(200);
    });

    it('foto profil: hanya JPG/PNG', async () => {
      const pdf = multipart({}, { file: { filename: 'foto.pdf', content: FAKE_PDF } });
      const bad = await h.app.inject({
        method: 'POST',
        url: `${prof('me')}/photo`,
        payload: pdf.payload,
        headers: { ...pdf.headers, cookie: coach.cookie! },
      });
      expect(bad.statusCode).toBe(422);
      const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('png'),
      ]);
      const mp = multipart({}, { file: { filename: 'foto.png', content: png } });
      const ok = await h.app.inject({
        method: 'POST',
        url: `${prof('me')}/photo`,
        payload: mp.payload,
        headers: { ...mp.headers, cookie: coach.cookie! },
      });
      expect(ok.statusCode, ok.body).toBe(200);
      expect(ok.json().profile.hasPhoto).toBe(true);
      const img = await admin.call('GET', `${prof(coachId)}/photo`);
      expect(img.headers['content-type']).toBe('image/png');
    });
  });

  describe('lisensi', () => {
    let pendingId: string;
    let inProgressId: string;

    it('lisensi yang masih proses: cukup nama, tanpa file', async () => {
      const r = await coach.call('POST', `${prof('me')}/licenses`, {
        name: 'Lisensi Pelatih Level B',
        issuer: 'PERBASI',
        inProgress: true,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const lic = r.body.licenses[0];
      inProgressId = lic.id;
      expect(lic).toMatchObject({
        status: 'in_progress',
        displayStatus: 'in_progress',
        file: null,
      });
    });

    it('lisensi dari pelatih + file → menunggu verifikasi, owner/admin dikabari', async () => {
      const mp = multipart(
        {
          name: 'Lisensi Pelatih Level C',
          issuer: 'PERBASI',
          level: 'C',
          licenseNumber: 'C-12345',
          issuedOn: addDays(today, -300),
          expiresOn: addDays(today, 400),
        },
        { file: { filename: 'lisensi c.pdf', content: FAKE_PDF } },
      );
      const res = await h.app.inject({
        method: 'POST',
        url: `${prof('me')}/licenses`,
        payload: mp.payload,
        headers: { ...mp.headers, cookie: coach.cookie! },
      });
      expect(res.statusCode, res.body).toBe(201);
      const lic = res
        .json()
        .licenses.find((l: { name: string }) => l.name === 'Lisensi Pelatih Level C');
      pendingId = lic.id;
      expect(lic).toMatchObject({
        status: 'pending',
        file: { name: 'lisensi c.pdf', mimeType: 'application/pdf' },
      });
      expect(h.outbox.latest(OWNER, 'lisensi_perlu_verifikasi')?.params).toMatchObject({
        pelatih: 'Coach Dimas',
        lisensi: 'Lisensi Pelatih Level C',
      });
    });

    it('daftar staf menandai lisensi yang perlu verifikasi', async () => {
      const staff = (await admin.call('GET', `${base()}/staff`)).body;
      expect(staff.find((s: { id: string }) => s.id === coachId).licenses).toMatchObject({
        total: 2,
        pending: 1,
      });
    });

    it('pelatih tidak bisa memverifikasi; lisensi yang masih proses tidak bisa diverifikasi', async () => {
      expect(
        (
          await coach.call('POST', `${prof('me')}/licenses/${pendingId}/review`, {
            decision: 'verified',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await admin.call('POST', `${prof(coachId)}/licenses/${inProgressId}/review`, {
            decision: 'verified',
          })
        ).status,
      ).toBe(422);
    });

    it('admin membuka file (tercatat di audit) lalu memverifikasi; pelatih dikabari', async () => {
      const file = await admin.call('GET', `${prof(coachId)}/licenses/${pendingId}/file`);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      const audit = await h.db.admin.db.execute<{ n: number }>(
        sql`select count(*)::int as n from audit_log where action = 'coach_license.file_viewed'`,
      );
      expect(audit[0]!.n).toBe(1);
      const r = await admin.call('POST', `${prof(coachId)}/licenses/${pendingId}/review`, {
        decision: 'verified',
      });
      expect(r.body.licenses.find((l: { id: string }) => l.id === pendingId).status).toBe(
        'verified',
      );
      expect(h.outbox.latest(COACH, 'lisensi_diperiksa')?.params.hasil).toBe('terverifikasi');
    });

    it('penolakan wajib alasan; pelatih mengubah lisensi terverifikasi → kembali menunggu', async () => {
      expect(
        (
          await admin.call('POST', `${prof(coachId)}/licenses/${pendingId}/review`, {
            decision: 'rejected',
          })
        ).status,
      ).toBe(400);
      const edit = await coach.call('POST', `${prof('me')}/licenses/${pendingId}`, {
        name: 'Lisensi Pelatih Level C',
        issuer: 'PERBASI',
        level: 'C',
        expiresOn: addDays(today, 400),
      });
      expect(edit.status, JSON.stringify(edit.body)).toBe(200);
      const lic = edit.body.licenses.find((l: { id: string }) => l.id === pendingId);
      expect(lic).toMatchObject({ status: 'pending', reviewedAt: null });
      // File lama tetap ada bila tidak diganti.
      expect(lic.file).not.toBeNull();
      await admin.call('POST', `${prof(coachId)}/licenses/${pendingId}/review`, {
        decision: 'verified',
      });
    });

    it('lisensi yang diinput admin untuk pelatih langsung terverifikasi; untuk dirinya sendiri tidak', async () => {
      const forCoach = await admin.call('POST', `${prof(otherCoachId)}/licenses`, {
        name: 'FIBA Level 1',
        issuer: 'FIBA',
      });
      expect(forCoach.body.licenses[0].status).toBe('verified');
      const own = await admin.call('POST', `${prof('me')}/licenses`, { name: 'Lisensi Admin' });
      const ownLic = own.body.licenses[0];
      expect(ownLic.status).toBe('pending');
      expect(
        (
          await admin.call('POST', `${prof('me')}/licenses/${ownLic.id}/review`, {
            decision: 'verified',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await owner.call('POST', `${prof(adminId)}/licenses/${ownLic.id}/review`, {
            decision: 'verified',
          })
        ).status,
      ).toBe(200);
    });

    it('klub lain tidak bisa membuka profil/lisensi', async () => {
      const stranger = new Client(h);
      await stranger.loginOtp('081800000099', { purpose: 'signup', fullName: 'Owner Lain' });
      await stranger.call('POST', '/v1/orgs', { ...CLUB, name: 'Klub Lain M7' });
      expect((await stranger.call('GET', prof(coachId))).status).toBe(404);
      expect(
        (await stranger.call('GET', `${prof(coachId)}/licenses/${pendingId}/file`)).status,
      ).toBe(404);
    });
  });

  describe('wali', () => {
    it('melihat ringkasan pelatih tim anak: hanya lisensi terverifikasi & berlaku', async () => {
      const r = await wali.call('GET', `/v1/me/children/${childId}/coaches`);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toHaveLength(1);
      expect(r.body[0]).toMatchObject({
        fullName: 'Coach Dimas',
        headline: 'Pelatih kepala KU12',
        hasPhoto: true,
        licenses: [{ name: 'Lisensi Pelatih Level C', issuer: 'PERBASI' }],
      });
      // Data internal tidak ikut.
      expect(JSON.stringify(r.body)).not.toContain('C-12345');
      expect(JSON.stringify(r.body)).not.toContain('Level B');
      const photo = await wali.call('GET', `/v1/me/children/${childId}/coaches/${coachId}/photo`);
      expect(photo.status).toBe(200);
      // Pelatih yang tidak memegang tim anak → 404.
      expect(
        (await wali.call('GET', `/v1/me/children/${childId}/coaches/${otherCoachId}/photo`)).status,
      ).toBe(404);
    });

    it('wali lain tidak bisa melihat pelatih anak orang lain', async () => {
      const other = new Client(h);
      await other.loginOtp('081800000098', { purpose: 'signup', fullName: 'Wali Lain' });
      expect((await other.call('GET', `/v1/me/children/${childId}/coaches`)).status).toBe(404);
    });
  });

  describe('pengingat masa berlaku', () => {
    it('H-30 lalu kedaluwarsa: sekali per tahap, ke pelatih + owner/admin', async () => {
      const svc = h.app.get(CoachingService);
      const at10 = new Date(`${today}T10:00:00+07:00`);
      await h.db.admin.db.execute(
        sql`update coach_license set expires_on = ${addDays(today, 10)}::date where name = 'Lisensi Pelatih Level C'`,
      );
      const first = await svc.runExpiryReminders(at10);
      expect(first.sent).toBeGreaterThanOrEqual(3); // pelatih, owner, admin
      expect(h.outbox.latest(COACH, 'lisensi_akan_habis')?.params.lisensi).toBe(
        'Lisensi Pelatih Level C',
      );
      expect((await svc.runExpiryReminders(at10)).sent).toBe(0);
      // Di luar jam 09.00–21.00 WIB tidak mengirim.
      expect((await svc.runExpiryReminders(new Date(`${today}T23:00:00+07:00`))).sent).toBe(0);

      await h.db.admin.db.execute(
        sql`update coach_license set expires_on = ${addDays(today, -1)}::date, issued_on = null where name = 'Lisensi Pelatih Level C'`,
      );
      expect((await svc.runExpiryReminders(at10)).sent).toBeGreaterThanOrEqual(3);
      expect(h.outbox.latest(OWNER, 'lisensi_kedaluwarsa')?.params.pelatih).toBe('Coach Dimas');
      expect((await svc.runExpiryReminders(at10)).sent).toBe(0);

      const staff = (await owner.call('GET', `${base()}/staff`)).body;
      expect(staff.find((s: { id: string }) => s.id === coachId).licenses.expired).toBe(1);
      // Wali tidak lagi melihat lisensi yang kedaluwarsa.
      const r = await wali.call('GET', `/v1/me/children/${childId}/coaches`);
      expect(r.body[0].licenses).toEqual([]);
    });
  });
});
