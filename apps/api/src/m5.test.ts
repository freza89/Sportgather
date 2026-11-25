import { addDays, periodOf } from '@sportgather/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnnouncementsService } from './announcements/announcements.service.js';
import { BillingNotifications } from './billing/billing-notifications.js';
import { MockPush } from './integrations/push.js';
import { todayIso } from './seasons/ku-context.js';
import { CLUB, Client, createHarness, type Harness } from './test/harness.js';

/** M5: pengumuman & status dibaca, penilaian & rapor, dashboard = laporan, hak data wali. */
describe('M5 · komunikasi, pembinaan, laporan', () => {
  let h: Harness;
  let owner: Client;
  let coach: Client;
  let otherCoach: Client;
  let rina: Client;
  let budi: Client;
  let slug: string;
  let team12: string;
  let team10: string;
  let players: { membershipId: string; fullName: string }[];
  const base = () => `/v1/orgs/${slug}`;
  const today = todayIso();
  const byName = (n: string) => players.find((p) => p.fullName === n)!.membershipId;
  const RINA = '+6281333000001';
  const BUDI = '+6281333000002';

  beforeAll(async () => {
    h = await createHarness();
    owner = new Client(h);
    await owner.loginOtp('081700000001', { purpose: 'signup', fullName: 'Owner M5' });
    slug = (await owner.call('POST', '/v1/orgs', CLUB)).body.slug;
    await owner.call('POST', `${base()}/seasons`, {
      name: 'Musim M5',
      startsOn: addDays(today, -60),
      endsOn: addDays(today, 120),
    });
    for (const [phone, name] of [
      ['081700000002', 'Coach Andi'],
      ['081700000003', 'Coach Bima'],
    ] as const)
      await owner.call('POST', `${base()}/staff`, { fullName: name, phone, role: 'coach' });
    coach = new Client(h);
    otherCoach = new Client(h);
    for (const [c, phone] of [
      [coach, '+6281700000002'],
      [otherCoach, '+6281700000003'],
    ] as const) {
      const token = h.outbox.latest(phone, 'undangan_staf')!.params.link!.split('/').pop()!;
      await c.loginOtp(phone.replace('+62', '0'));
      await c.call('POST', '/v1/invitations/accept', { token });
    }
    const staff = (await owner.call('GET', `${base()}/staff`)).body as {
      id: string;
      fullName: string;
    }[];
    const sid = (n: string) => staff.find((s) => s.fullName === n)!.id;
    team12 = (
      await owner.call('POST', `${base()}/teams`, {
        ku: 12,
        level: 'Elite',
        staffRoleIds: [sid('Coach Andi')],
      })
    ).body.id;
    team10 = (
      await owner.call('POST', `${base()}/teams`, {
        ku: 10,
        level: 'Development',
        staffRoleIds: [sid('Coach Bima')],
      })
    ).body.id;
    const year = Number(today.slice(0, 4));
    await owner.call('POST', `${base()}/players/import`, {
      commit: true,
      rows: [
        {
          fullName: 'Zaki Lima',
          birthDate: `${year - 12}-03-01`,
          gender: 'L',
          guardianName: 'Rina',
          guardianPhone: '081333000001',
        },
        {
          fullName: 'Nadia Lima',
          birthDate: `${year - 10}-03-01`,
          gender: 'P',
          guardianName: 'Rina',
          guardianPhone: '081333000001',
        },
        {
          fullName: 'Raka Lima',
          birthDate: `${year - 12}-05-01`,
          gender: 'L',
          guardianName: 'Budi',
          guardianPhone: '081333000002',
        },
      ],
    });
    players = (await owner.call('GET', `${base()}/players`)).body.rows;
    for (const [n, t] of [
      ['Zaki Lima', team12],
      ['Raka Lima', team12],
      ['Nadia Lima', team10],
    ] as const) {
      const r = await owner.call('POST', `${base()}/teams/${t}/members`, {
        membershipId: byName(n),
        reason: 'Tes',
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    }
    rina = new Client(h);
    await rina.loginOtp('081333000001');
    budi = new Client(h);
    await budi.loginOtp('081333000002');
  });
  afterAll(async () => {
    await h.close();
  });

  describe('pengumuman (A-16, P-05, COM-01)', () => {
    let annId: string;

    it('pratinjau audiens: KU12 = 2 pemain, 2 wali; seluruh klub = 3 pemain, 2 wali (1 punya 2 anak)', async () => {
      const ku = await owner.call('POST', `${base()}/announcements/preview`, {
        kind: 'ku',
        kus: [12],
      });
      expect(ku.body).toMatchObject({ players: 2, guardians: 2, multiChild: 0, label: 'KU12' });
      const club = await owner.call('POST', `${base()}/announcements/preview`, { kind: 'club' });
      expect(club.body).toMatchObject({ players: 3, guardians: 2, multiChild: 1 });
    });

    it('kirim: WhatsApp + push dengan link bertoken; riwayat menghitung terkirim', async () => {
      const sub = await rina.call('POST', '/v1/me/push-subscriptions', {
        endpoint: 'https://push.example.test/rina-1',
        keys: { p256dh: 'p256dh-key-rina', auth: 'auth-rina' },
      });
      expect(sub.status).toBe(204);
      const res = await owner.call('POST', `${base()}/announcements`, {
        title: 'Seleksi tim liga',
        body: 'Seleksi tim liga pelajar hari Sabtu pukul 08.00 di GOR.',
        target: { kind: 'club' },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      annId = res.body.id;
      const wa = h.outbox.latest(RINA, 'pengumuman')!;
      expect(wa.params.judul).toBe('Seleksi tim liga');
      expect(wa.params.link).toMatch(/\/i\/[\w-]{20,}$/);
      const push = h.app.get(MockPush).sent.filter((p) => p.endpoint.endsWith('rina-1'));
      expect(push.at(-1)).toMatchObject({ title: 'Seleksi tim liga' });
      const hist = (await owner.call('GET', `${base()}/announcements`)).body;
      expect(hist[0]).toMatchObject({ id: annId, recipients: 2, delivered: 2, read: 0 });
    });

    it('membuka link menandai dibaca; wali melihat di aplikasi', async () => {
      const token = h.outbox.latest(RINA, 'pengumuman')!.params.link!.split('/').pop()!;
      const open = await new Client(h).call('GET', `/v1/public/announcements/${token}`);
      expect(open.body).toMatchObject({ title: 'Seleksi tim liga', read: true });
      const mine = (await budi.call('GET', '/v1/me/announcements')).body;
      expect(mine[0]).toMatchObject({ id: annId, read: false });
      await budi.call('POST', `/v1/me/announcements/${annId}/read`);
      const hist = (await owner.call('GET', `${base()}/announcements`)).body;
      expect(hist[0]).toMatchObject({ read: 2 });
    });

    it('pelatih hanya ke tim yang dipegang; riwayatnya hanya tim itu', async () => {
      expect(
        (await coach.call('POST', `${base()}/announcements/preview`, { kind: 'club' })).status,
      ).toBe(403);
      expect(
        (
          await coach.call('POST', `${base()}/announcements/preview`, {
            kind: 'team',
            ids: [team10],
          })
        ).status,
      ).toBe(403);
      const ok = await coach.call('POST', `${base()}/announcements`, {
        title: 'Bawa air minum',
        body: 'Mohon bawa air minum dan handuk ya.',
        target: { kind: 'team', ids: [team12] },
      });
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      const hist = (await coach.call('GET', `${base()}/announcements`)).body;
      expect(hist.map((a: { title: string }) => a.title)).toEqual(['Bawa air minum']);
    });

    it('wali mematikan WhatsApp: pengumuman tidak lewat WA, perubahan jadwal tetap', async () => {
      await budi.call('PATCH', '/v1/me/profile', { notifyWhatsapp: false });
      const before = h.outbox.messages.filter(
        (m) => m.to === BUDI && m.template === 'pengumuman',
      ).length;
      await owner.call('POST', `${base()}/announcements`, {
        title: 'Info umum',
        body: 'Ini info umum untuk semua.',
        target: { kind: 'club' },
      });
      expect(
        h.outbox.messages.filter((m) => m.to === BUDI && m.template === 'pengumuman').length,
      ).toBe(before);
      await owner.call('POST', `${base()}/schedule/events`, {
        teamId: team12,
        kind: 'match',
        date: addDays(today, 3),
        startTime: '10:00',
        durationMin: 60,
      });
      const ev = (
        await owner.call(
          'GET',
          `${base()}/schedule?from=${addDays(today, 3)}&to=${addDays(today, 3)}`,
        )
      ).body.events[0];
      const upd = await owner.call('PATCH', `${base()}/schedule/events/${ev.id}`, {
        startTime: '11:00',
      });
      expect(upd.body.notified).toBeGreaterThanOrEqual(3);
      expect(h.outbox.latest(BUDI, 'perubahan_jadwal')).toBeDefined();
      const hist = (await owner.call('GET', `${base()}/announcements`)).body;
      expect(hist[0]).toMatchObject({ source: 'schedule_change', recipients: 3 });
      await budi.call('PATCH', '/v1/me/profile', { notifyWhatsapp: true });
    });

    it('terjadwal: jam tenang ditolak; dikirim job saat waktunya', async () => {
      const night = new Date(`${addDays(today, 1)}T22:30:00+07:00`).toISOString();
      expect(
        (
          await owner.call('POST', `${base()}/announcements`, {
            title: 'Malam',
            body: 'Pesan malam hari.',
            target: { kind: 'club' },
            scheduledAt: night,
          })
        ).status,
      ).toBe(400);
      const at = new Date(`${addDays(today, 1)}T10:00:00+07:00`).toISOString();
      const res = await owner.call('POST', `${base()}/announcements`, {
        title: 'Terjadwal',
        body: 'Pesan terjadwal besok.',
        target: { kind: 'ku', kus: [10] },
        scheduledAt: at,
      });
      expect(res.body).toMatchObject({ scheduled: true });
      const svc = h.app.get(AnnouncementsService);
      expect((await svc.runScheduled(new Date())).sent).toBe(0);
      expect((await svc.runScheduled(new Date(`${addDays(today, 1)}T10:05:00+07:00`))).sent).toBe(
        1,
      );
      expect(h.outbox.latest(RINA, 'pengumuman')!.params.judul).toBe('Terjadwal');
    });
  });

  describe('penilaian & rapor (P-04, US-15, US-16)', () => {
    it('lembar penilaian memuat skill template KU12', async () => {
      const sheet = (await coach.call('GET', `${base()}/coach/assessments?teamId=${team12}`)).body;
      const names = sheet.skills.map((s: { name: string }) => s.name);
      expect(names).toEqual(
        expect.arrayContaining(['Dribel', 'Passing', 'Shooting', 'Defense', 'Kerja sama tim']),
      );
      expect(names).not.toContain('Koordinasi gerak');
      expect(sheet.players).toHaveLength(2);
      expect((await coach.call('GET', `${base()}/coach/assessments/pending`)).body.pending).toBe(2);
    });

    it('pelatih menilai; pelatih lain & tim lain ditolak; lewat 7 hari terkunci', async () => {
      const sheet = (await coach.call('GET', `${base()}/coach/assessments?teamId=${team12}`)).body;
      const scores = sheet.skills.map((s: { id: string }, i: number) => ({
        skillId: s.id,
        score: [4, 4, 3, 4, 5][i] ?? 4,
      }));
      const zaki = byName('Zaki Lima');
      const ok = await coach.call('PUT', `${base()}/coach/assessments`, {
        teamId: team12,
        membershipId: zaki,
        scores,
        note: 'Kontrol bola makin stabil.',
      });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(
        (await otherCoach.call('GET', `${base()}/coach/assessments?teamId=${team12}`)).status,
      ).toBe(404);
      // Owner bisa membuka lembar, tapi tidak boleh mengubah penilaian pelatih lain.
      const byOwner = await owner.call('PUT', `${base()}/coach/assessments`, {
        teamId: team12,
        membershipId: zaki,
        scores,
      });
      expect(byOwner.status).toBe(403);
      await h.db.admin.db.execute(
        sql`update assessment set created_at = now() - interval '8 days' where membership_id = ${zaki}`,
      );
      const late = await coach.call('PUT', `${base()}/coach/assessments`, {
        teamId: team12,
        membershipId: zaki,
        scores,
      });
      expect(late.status).toBe(403);
      const after = (await coach.call('GET', `${base()}/coach/assessments?teamId=${team12}`)).body;
      expect(
        after.players.find((p: { membershipId: string }) => p.membershipId === zaki),
      ).toMatchObject({ editable: false, note: 'Kontrol bola makin stabil.' });
      expect((await coach.call('GET', `${base()}/coach/assessments/pending`)).body.pending).toBe(1);
    });

    it('rapor terbit → wali dikabari, melihat kehadiran & skor, unduh PDF; penilaian terkunci', async () => {
      const zaki = byName('Zaki Lima');
      // Dua sesi minggu lalu: hadir 1, izin 1.
      for (const [d, st] of [
        [-7, 'hadir'],
        [-5, 'izin'],
      ] as const) {
        await owner.call('POST', `${base()}/schedule/events`, {
          teamId: team12,
          kind: 'match',
          date: addDays(today, d),
          startTime: '16:00',
          durationMin: 60,
        });
        const ev = (
          await owner.call(
            'GET',
            `${base()}/schedule?from=${addDays(today, d)}&to=${addDays(today, d)}&teamId=${team12}`,
          )
        ).body.events[0];
        const sync = await coach.call('POST', `${base()}/coach/attendance/sync`, {
          ops: [
            {
              clientOpId: crypto.randomUUID(),
              eventId: ev.id,
              membershipId: zaki,
              status: st,
              recordedAt: new Date().toISOString(),
            },
          ],
        });
        expect(sync.status, JSON.stringify(sync.body)).toBe(200);
      }
      expect((await rina.call('GET', '/v1/me/report-cards')).body).toHaveLength(0);
      const status = (await owner.call('GET', `${base()}/report-cards/status`)).body;
      expect(status).toMatchObject({ players: 3, assessed: 1, published: null });
      const pub = await owner.call('POST', `${base()}/report-cards/publish`, {
        seasonId: status.season.id,
        semester: status.semester,
      });
      expect(pub.body).toMatchObject({ notified: 1 });
      expect(h.outbox.latest(RINA, 'rapor_terbit')!.params.anak).toBe('Zaki Lima');
      expect(
        (
          await owner.call('POST', `${base()}/report-cards/publish`, {
            seasonId: status.season.id,
            semester: status.semester,
          })
        ).status,
      ).toBe(422);
      const cards = (await rina.call('GET', '/v1/me/report-cards')).body;
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({
        childName: 'Zaki Lima',
        attendance: { attended: 1, total: 2, pct: 50 },
        average: 4,
        note: { text: 'Kontrol bola makin stabil.', coachName: 'Coach Andi' },
      });
      const pdf = await h.app.inject({
        method: 'GET',
        url: `/v1/me/report-cards/${zaki}/pdf`,
        headers: { cookie: rina.cookie! },
      });
      expect(pdf.statusCode).toBe(200);
      expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      expect((await budi.call('GET', `/v1/me/report-cards/${zaki}/pdf`)).status).toBe(404);
      const sheet = (await coach.call('GET', `${base()}/coach/assessments?teamId=${team12}`)).body;
      const raka = await coach.call('PUT', `${base()}/coach/assessments`, {
        teamId: team12,
        membershipId: byName('Raka Lima'),
        scores: [{ skillId: sheet.skills[0].id, score: 3 }],
      });
      expect(raka.status).toBe(422);
    });
  });

  describe('dashboard = laporan (A-17, A-18, US-18)', () => {
    it('angka dashboard sama dengan ringkasan laporan periode yang sama; ekspor xlsx & pdf', async () => {
      await owner.call('POST', `${base()}/billing/plans`, {
        name: 'Iuran',
        kind: 'monthly',
        amount: 300000,
      });
      await owner.call('POST', `${base()}/billing/invoices/issue`, { period: periodOf(today) });
      const inv = (await owner.call('GET', `${base()}/billing/invoices`)).body.invoices.find(
        (i: { playerName: string }) => i.playerName === 'Raka Lima',
      );
      await owner.call('POST', `${base()}/billing/invoices/${inv.id}/manual-payment`, {
        method: 'cash',
        paidAt: today,
      });
      const dash = (await owner.call('GET', `${base()}/dashboard`)).body;
      const rep = (await owner.call('GET', `${base()}/reports/revenue?preset=month`)).body;
      expect(dash.activePlayers.total).toBe(rep.summary.activePlayers);
      expect(dash.billing).toMatchObject({
        billed: rep.summary.billing.billed,
        paid: rep.summary.billing.paid,
        pct: rep.summary.billing.pct,
      });
      expect(dash.billing).toMatchObject({ billed: 900000, paid: 300000, pct: 33 });
      expect(dash.overdue).toEqual(rep.summary.overdue);
      expect(dash.attendance30d.pct).toBe(rep.summary.attendance.pct);
      expect(rep.data.grandTotal).toBe(300000);
      // KU per pemain sama dengan A-06 (dari tanggal lahir & acuan KU musim).
      const list = (await owner.call('GET', `${base()}/players`)).body;
      expect(dash.playersPerKu).toEqual(list.kuCounts);
      const xlsx = await h.app.inject({
        method: 'GET',
        url: `${base()}/reports/receivables/export?preset=month&format=xlsx`,
        headers: { cookie: owner.cookie! },
      });
      expect(xlsx.statusCode).toBe(200);
      expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
      const pdf = await h.app.inject({
        method: 'GET',
        url: `${base()}/reports/payouts/export?preset=3months&format=pdf`,
        headers: { cookie: owner.cookie! },
      });
      expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      const recv = (await owner.call('GET', `${base()}/reports/receivables?preset=month`)).body;
      expect(recv.data).toHaveLength(2);
      expect((await coach.call('GET', `${base()}/dashboard`)).status).toBe(403);
    });

    it('notifikasi tagihan terbit digabung per wali (09.00) dan sekali saja', async () => {
      const svc = h.app.get(BillingNotifications);
      const at = new Date(`${today}T09:30:00+07:00`);
      const a = await svc.invoicesIssued(at);
      expect(a.sent).toBe(1); // Rina (2 anak, satu pesan); tagihan Budi sudah lunas
      expect(h.outbox.latest(RINA, 'tagihan_terbit')!.params.rincian!.split('\n')).toHaveLength(2);
      expect((await svc.invoicesIssued(at)).sent).toBe(0);
    });
  });

  describe('profil wali & hak data (O-08)', () => {
    it('profil, izin foto, unduh data, minta hapus → admin memproses', async () => {
      const prof = (await rina.call('GET', '/v1/me/profile')).body;
      expect(prof).toMatchObject({ fullName: 'Rina', notifyWhatsapp: true, pushEnabled: true });
      expect(prof.children).toHaveLength(2);
      const nadia = byName('Nadia Lima');
      const photo = await rina.call('PATCH', `/v1/me/children/${nadia}/photo-consent`, {
        photoPublic: true,
      });
      expect(photo.body).toMatchObject({ photoPublic: true });
      expect(
        (await budi.call('PATCH', `/v1/me/children/${nadia}/photo-consent`, { photoPublic: false }))
          .status,
      ).toBe(404);
      const exp = await h.app.inject({
        method: 'GET',
        url: `/v1/me/children/${nadia}/export`,
        headers: { cookie: rina.cookie! },
      });
      expect(exp.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      const req = await rina.call('POST', `/v1/me/children/${nadia}/delete-request`, {
        reason: 'Pindah kota',
      });
      expect(req.status).toBe(201);
      expect((await rina.call('POST', `/v1/me/children/${nadia}/delete-request`, {})).status).toBe(
        422,
      );
      const list = (await owner.call('GET', `${base()}/data-requests`)).body;
      expect(list[0]).toMatchObject({
        childName: 'Nadia Lima',
        requesterName: 'Rina',
        status: 'pending',
      });
      const dash = (await owner.call('GET', `${base()}/dashboard`)).body;
      expect(dash.actions.map((a: { kind: string }) => a.kind)).toContain('data_requests');
      const done = await owner.call('PATCH', `${base()}/data-requests/${list[0].id}`, {
        status: 'done',
        note: 'Sesuai permintaan',
      });
      expect(done.body).toMatchObject({ status: 'done' });
      const p = (await owner.call('GET', `${base()}/players/${nadia}`)).body;
      expect(p.status).toBe('left');
      expect(
        (await owner.call('PATCH', `${base()}/data-requests/${list[0].id}`, { status: 'done' }))
          .status,
      ).toBe(422);
    });
  });
});
