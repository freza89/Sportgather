import { event } from '@sportgather/db';
import { addDays, localToUtc, utcToLocalDate, weekdayOf } from '@sportgather/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayIso } from '../seasons/ku-context.js';
import { CLUB, Client, createHarness, type Harness } from '../test/harness.js';
import { RsvpService } from './rsvp.service.js';

/** M3: jadwal berulang & libur (A-12), RSVP + link bertoken (O-04), absensi offline (P-02). */
describe('M3 · jadwal & absensi', () => {
  let h: Harness;
  let owner: Client;
  let coach: Client;
  let otherCoach: Client;
  let wali: Client;
  let slug: string;
  let teamId: string;
  let otherTeamId: string;
  const base = () => `/v1/orgs/${slug}`;
  const today = todayIso();
  const tomorrow = addDays(today, 1);

  beforeAll(async () => {
    h = await createHarness();
    owner = new Client(h);
    await owner.loginOtp('081500000001', { purpose: 'signup', fullName: 'Owner Jadwal' });
    slug = (await owner.call('POST', '/v1/orgs', CLUB)).body.slug;
    await owner.call('POST', `${base()}/seasons`, {
      name: 'Musim Uji',
      startsOn: addDays(today, -30),
      endsOn: addDays(today, 60),
    });
    for (const [phone, name] of [
      ['081500000002', 'Coach Andi'],
      ['081500000003', 'Coach Lain'],
    ] as const) {
      await owner.call('POST', `${base()}/staff`, { fullName: name, phone, role: 'coach' });
    }
    coach = new Client(h);
    otherCoach = new Client(h);
    for (const [c, phone] of [
      [coach, '+6281500000002'],
      [otherCoach, '+6281500000003'],
    ] as const) {
      const token = h.outbox.latest(phone, 'undangan_staf')!.params.link!.split('/').pop()!;
      await c.loginOtp(phone.replace('+62', '0'));
      await c.call('POST', '/v1/invitations/accept', { token });
    }
    const staff = (await owner.call('GET', `${base()}/staff`)).body as {
      id: string;
      fullName: string;
    }[];
    const andi = staff.find((s) => s.fullName === 'Coach Andi')!.id;
    const lain = staff.find((s) => s.fullName === 'Coach Lain')!.id;
    teamId = (
      await owner.call('POST', `${base()}/teams`, {
        ku: 10,
        level: 'Development',
        staffRoleIds: [andi],
      })
    ).body.id;
    otherTeamId = (
      await owner.call('POST', `${base()}/teams`, { ku: 12, level: 'Elite', staffRoleIds: [lain] })
    ).body.id;
    // Kakak-adik dengan satu wali (pengingat digabung) + satu anak lain.
    const year = Number(today.slice(0, 4));
    await owner.call('POST', `${base()}/players/import`, {
      commit: true,
      rows: [
        {
          fullName: 'Kakak Uji',
          birthDate: `${year - 10}-03-01`,
          gender: 'L',
          guardianName: 'Rina',
          guardianPhone: '081322110001',
        },
        {
          fullName: 'Adik Uji',
          birthDate: `${year - 9}-03-01`,
          gender: 'P',
          guardianName: 'Rina',
          guardianPhone: '081322110001',
        },
        {
          fullName: 'Teman Uji',
          birthDate: `${year - 10}-05-01`,
          gender: 'L',
          guardianName: 'Budi',
          guardianPhone: '081322110002',
        },
      ],
    });
    const players = (await owner.call('GET', `${base()}/players`)).body.rows as {
      membershipId: string;
      fullName: string;
    }[];
    for (const p of players) {
      const r = await owner.call('POST', `${base()}/teams/${teamId}/members`, {
        membershipId: p.membershipId,
        reason: 'Satu tim latihan',
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    }
    wali = new Client(h);
    await wali.loginOtp('081322110001');
  });
  afterAll(async () => {
    await h.close();
  });

  let tomorrowEventId: string;

  describe('jadwal berulang & libur (A-12, US-07)', () => {
    it('pola mingguan menghasilkan sesi sampai akhir musim', async () => {
      const res = await owner.call('POST', `${base()}/schedule/series`, {
        teamId,
        weekdays: [weekdayOf(tomorrow), weekdayOf(addDays(tomorrow, 3))],
        startTime: '16:00',
        durationMin: 90,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toHaveLength(2);
      const list = await owner.call(
        'GET',
        `${base()}/schedule?from=${today}&to=${addDays(today, 60)}&teamId=${teamId}`,
      );
      const dates = list.body.events.map((e: { startsAt: string }) =>
        utcToLocalDate(new Date(e.startsAt), 'Asia/Jakarta'),
      );
      expect(dates[0]).toBe(tomorrow);
      expect(dates.at(-1) <= addDays(today, 60)).toBe(true);
      expect(dates.length).toBeGreaterThanOrEqual(16);
      expect(list.body.events[0].startsAt).toBe(
        localToUtc(tomorrow, '16:00', 'Asia/Jakarta').toISOString(),
      );
      tomorrowEventId = list.body.events[0].id;
    });

    it('mengubah satu sesi tidak mengubah sesi lain; wali & pelatih dikabari', async () => {
      const list = await owner.call(
        'GET',
        `${base()}/schedule?from=${today}&to=${addDays(today, 60)}&teamId=${teamId}`,
      );
      const [, second, third] = list.body.events;
      const before = h.outbox.messages.length;
      const res = await owner.call('PATCH', `${base()}/schedule/events/${second.id}`, {
        startTime: '15:30',
      });
      expect(res.body).toMatchObject({ isException: true, notified: 3 }); // 2 wali + 1 pelatih
      expect(h.outbox.messages.slice(before).every((m) => m.template === 'perubahan_jadwal')).toBe(
        true,
      );
      expect(h.outbox.latest('+6281322110001', 'perubahan_jadwal')?.params.perubahan).toContain(
        '16.00 – 17.30 →',
      );
      const after = await owner.call(
        'GET',
        `${base()}/schedule?from=${today}&to=${addDays(today, 60)}&teamId=${teamId}`,
      );
      expect(after.body.events.find((e: { id: string }) => e.id === third.id).startsAt).toBe(
        third.startsAt,
      );
    });

    it('hari libur meniadakan sesi; dihapus → sesi kembali', async () => {
      const list = await owner.call(
        'GET',
        `${base()}/schedule?from=${today}&to=${addDays(today, 60)}&teamId=${teamId}`,
      );
      const target = list.body.events[3];
      const date = utcToLocalDate(new Date(target.startsAt), 'Asia/Jakarta');
      const res = await owner.call('POST', `${base()}/schedule/holidays`, {
        date,
        name: 'Libur akademi',
      });
      expect(res.body.cancelled).toBeGreaterThan(0);
      const day = await owner.call('GET', `${base()}/schedule?from=${date}&to=${date}`);
      expect(day.body.events[0]).toMatchObject({
        status: 'cancelled',
        cancelReason: 'Libur: Libur akademi',
      });
      expect(day.body.holidays[0]).toMatchObject({ name: 'Libur akademi', date });
      await owner.call('DELETE', `${base()}/schedule/holidays/${day.body.holidays[0].id}`);
      expect(
        (await owner.call('GET', `${base()}/schedule?from=${date}&to=${date}`)).body.events[0]
          .status,
      ).toBe('scheduled');
    });

    it('pelatih tidak bisa mengubah jadwal klub', async () => {
      expect(
        (
          await coach.call('POST', `${base()}/schedule/series`, {
            teamId,
            weekdays: [1],
            startTime: '08:00',
          })
        ).status,
      ).toBe(403);
    });
  });

  describe('RSVP wali (O-04, US-08)', () => {
    it('jadwal semua anak saya + RSVP', async () => {
      const res = await wali.call('GET', `/v1/me/schedule?from=${today}&to=${addDays(today, 7)}`);
      expect(res.status).toBe(200);
      const first = res.body.filter((e: { eventId: string }) => e.eventId === tomorrowEventId);
      expect(first.map((e: { childName: string }) => e.childName).sort()).toEqual([
        'Adik Uji',
        'Kakak Uji',
      ]);
      expect(first[0]).toMatchObject({ rsvp: null, rsvpOpen: true, status: 'scheduled' });
      const r = await wali.call('POST', '/v1/me/rsvp', {
        eventId: tomorrowEventId,
        membershipId: first[0].membershipId,
        status: 'izin',
        note: 'les',
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({ rsvp: 'izin', rsvpNote: 'les' });
    });

    it('tidak bisa RSVP untuk anak orang lain', async () => {
      const other = (await owner.call('GET', `${base()}/players?q=teman`)).body.rows[0]
        .membershipId;
      expect(
        (
          await wali.call('POST', '/v1/me/rsvp', {
            eventId: tomorrowEventId,
            membershipId: other,
            status: 'hadir',
          })
        ).status,
      ).toBe(403);
    });

    it('RSVP terkunci 2 jam sebelum sesi', async () => {
      const soon = new Date(Date.now() + 60 * 60_000);
      const date = utcToLocalDate(soon, 'Asia/Jakarta');
      const time = new Date(soon.getTime() + 7 * 3_600_000).toISOString().slice(11, 16);
      const ev = await owner.call('POST', `${base()}/schedule/events`, {
        teamId,
        kind: 'match',
        title: 'Uji coba',
        date,
        startTime: time,
        durationMin: 60,
      });
      const kids = (await wali.call('GET', `/v1/me/schedule?from=${date}&to=${date}`)).body.filter(
        (e: { eventId: string }) => e.eventId === ev.body.id,
      );
      expect(kids[0].rsvpOpen).toBe(false);
      const r = await wali.call('POST', '/v1/me/rsvp', {
        eventId: ev.body.id,
        membershipId: kids[0].membershipId,
        status: 'hadir',
      });
      expect(r.status).toBe(422);
      expect(r.body.message).toContain('2 jam');
    });
  });

  describe('pengingat H-1 + link bertoken (PRD bagian 16)', () => {
    const at = (time: string) => localToUtc(today, time, 'Asia/Jakarta');

    it('belum 17.00 → belum dikirim; 17.30 → satu pesan gabungan per wali; diulang → tidak ganda', async () => {
      const rsvp = h.app.get(RsvpService);
      expect((await rsvp.runReminders(at('16:30'))).sent).toBe(0);
      const before = h.outbox.messages.length;
      const first = await rsvp.runReminders(at('17:30'));
      expect(first.sent).toBe(2); // Rina (2 anak) + Budi
      const rina = h.outbox.messages.slice(before).find((m) => m.to === '+6281322110001')!;
      expect(rina.template).toBe('pengingat_sesi');
      expect(rina.params.sesi!.split('\n')).toHaveLength(2);
      expect(rina.params.link).toMatch(/\/t\/[\w-]{20,}$/);
      expect((await rsvp.runReminders(at('17:45'))).sent).toBe(0);
      expect((await rsvp.runReminders(at('21:30'))).sent).toBe(0);
    });

    it('link bertoken: RSVP tanpa login, sekali pakai', async () => {
      const link = h.outbox.latest('+6281322110002', 'pengingat_sesi')!.params.link!;
      const token = link.split('/').pop()!;
      const anon = new Client(h);
      const view = await anon.call('GET', `/v1/public/rsvp/${token}`);
      expect(view.body).toMatchObject({ guardianName: 'Budi', used: false, expired: false });
      expect(view.body.items).toHaveLength(1);
      const item = view.body.items[0];
      const ok = await anon.call('POST', `/v1/public/rsvp/${token}`, {
        responses: [{ eventId: item.eventId, membershipId: item.membershipId, status: 'hadir' }],
      });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(
        (
          await anon.call('POST', `/v1/public/rsvp/${token}`, {
            responses: [
              { eventId: item.eventId, membershipId: item.membershipId, status: 'sakit' },
            ],
          })
        ).status,
      ).toBe(410);
      expect((await anon.call('GET', `/v1/public/rsvp/${token}`)).body.used).toBe(true);
    });

    it('link tidak berlaku untuk anak lain & kedaluwarsa setelah 48 jam', async () => {
      const link = h.outbox.latest('+6281322110001', 'pengingat_sesi')!.params.link!;
      const token = link.split('/').pop()!;
      const other = (await owner.call('GET', `${base()}/players?q=teman`)).body.rows[0]
        .membershipId;
      const anon = new Client(h);
      expect(
        (
          await anon.call('POST', `/v1/public/rsvp/${token}`, {
            responses: [{ eventId: tomorrowEventId, membershipId: other, status: 'hadir' }],
          })
        ).status,
      ).toBe(403);
      const rsvp = h.app.get(RsvpService);
      const view = await rsvp.tokenView(token, new Date(at('17:30').getTime() + 49 * 3_600_000));
      expect(view.expired).toBe(true);
    });
  });

  describe('absensi pelatih (P-01, P-02, ATT-01, US-09)', () => {
    let sheet: { players: { membershipId: string; fullName: string; rsvp: string | null }[] };

    it('pelatih hanya melihat sesi tim sendiri', async () => {
      const mine = await coach.call('GET', `${base()}/coach/sessions?date=${tomorrow}`);
      expect(mine.body.map((s: { teamId: string }) => s.teamId)).toEqual(
        expect.arrayContaining([teamId]),
      );
      expect(mine.body.every((s: { teamId: string }) => s.teamId === teamId)).toBe(true);
      expect(
        (await otherCoach.call('GET', `${base()}/coach/sessions/${tomorrowEventId}`)).status,
      ).toBe(404);
      expect(
        (await otherCoach.call('GET', `${base()}/coach/sessions?date=${tomorrow}`)).body,
      ).toEqual([]);
      expect(otherTeamId).toBeTruthy();
    });

    it('lembar absensi berisi RSVP sebagai isian awal', async () => {
      const res = await coach.call('GET', `${base()}/coach/sessions/${tomorrowEventId}`);
      sheet = res.body;
      expect(res.body.event).toMatchObject({
        playerCount: 3,
        rsvp: { izin: 1, hadir: 1, belum: 1 },
      });
      const kakak = res.body.players.find(
        (p: { fullName: string }) =>
          p.fullName.startsWith('Adik') || p.fullName.startsWith('Kakak'),
      );
      expect(kakak).toHaveProperty('rsvp');
    });

    it('sinkron offline idempoten; versi terbaru menang (US-09: tanpa data ganda)', async () => {
      const [a, b] = sheet.players;
      const op1 = {
        clientOpId: crypto.randomUUID(),
        eventId: tomorrowEventId,
        membershipId: a!.membershipId,
        status: 'hadir',
        recordedAt: new Date(Date.now() - 60_000).toISOString(),
      };
      const op2 = {
        clientOpId: crypto.randomUUID(),
        eventId: tomorrowEventId,
        membershipId: b!.membershipId,
        status: 'alpa',
        recordedAt: new Date(Date.now() - 60_000).toISOString(),
      };
      const first = await coach.call('POST', `${base()}/coach/attendance/sync`, {
        ops: [op1, op2],
      });
      expect(first.body).toMatchObject({ accepted: 2, duplicates: 0 });
      // HP mengirim ulang batch yang sama (koneksi putus sebelum respons diterima).
      expect(
        (await coach.call('POST', `${base()}/coach/attendance/sync`, { ops: [op1, op2] })).body,
      ).toMatchObject({ accepted: 0, duplicates: 2 });
      // Perubahan yang lebih lama dari yang tersimpan diabaikan; yang lebih baru menang.
      const older = {
        ...op1,
        clientOpId: crypto.randomUUID(),
        status: 'sakit',
        recordedAt: new Date(Date.now() - 120_000).toISOString(),
      };
      const newer = {
        ...op2,
        clientOpId: crypto.randomUUID(),
        status: 'hadir',
        recordedAt: new Date().toISOString(),
      };
      expect(
        (await coach.call('POST', `${base()}/coach/attendance/sync`, { ops: [older, newer] })).body,
      ).toMatchObject({ accepted: 1, superseded: 1 });
      const after = await coach.call('GET', `${base()}/coach/sessions/${tomorrowEventId}`);
      const status = Object.fromEntries(
        after.body.players.map((p: { membershipId: string; attendance: string }) => [
          p.membershipId,
          p.attendance,
        ]),
      );
      expect(status[a!.membershipId]).toBe('hadir');
      expect(status[b!.membershipId]).toBe('hadir');
      expect(after.body.event.attendanceRecorded).toBe(2);
    });

    it('menolak pemain bukan anggota, sesi batal, dan sesi > 24 jam lagi', async () => {
      const far = (
        await owner.call(
          'GET',
          `${base()}/schedule?from=${addDays(today, 10)}&to=${addDays(today, 20)}&teamId=${teamId}`,
        )
      ).body.events[0];
      const res = await coach.call('POST', `${base()}/coach/attendance/sync`, {
        ops: [
          {
            clientOpId: crypto.randomUUID(),
            eventId: tomorrowEventId,
            membershipId: crypto.randomUUID(),
            status: 'hadir',
            recordedAt: new Date().toISOString(),
          },
          {
            clientOpId: crypto.randomUUID(),
            eventId: far.id,
            membershipId: sheet.players[0]!.membershipId,
            status: 'hadir',
            recordedAt: new Date().toISOString(),
          },
        ],
      });
      expect(res.body.rejected.map((r: { message: string }) => r.message)).toEqual([
        'Pemain bukan anggota tim ini',
        'Absensi baru bisa diisi mulai H-1 sesi',
      ]);
      await h.db.admin.db
        .update(event)
        .set({ status: 'cancelled' })
        .where(eq(event.id, tomorrowEventId));
      const cancelled = await coach.call('POST', `${base()}/coach/attendance/sync`, {
        ops: [
          {
            clientOpId: crypto.randomUUID(),
            eventId: tomorrowEventId,
            membershipId: sheet.players[0]!.membershipId,
            status: 'izin',
            recordedAt: new Date().toISOString(),
          },
        ],
      });
      expect(cancelled.body.rejected[0].message).toBe('Sesi dibatalkan');
      await h.db.admin.db
        .update(event)
        .set({ status: 'scheduled' })
        .where(eq(event.id, tomorrowEventId));
    });

    it('Tim saya (P-03): kontak wali & darurat, tanpa dokumen', async () => {
      const res = await coach.call('GET', `${base()}/coach/teams`);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ name: 'KU10 Development', attendanceRate30d: 100 });
      expect(res.body[0].schedule).toMatch(/\d{2}\.\d{2}/);
      const rina = res.body[0].members.find(
        (m: { guardianName: string }) => m.guardianName === 'Rina',
      );
      expect(rina.guardianPhone).toBe('+6281322110001');
      expect(JSON.stringify(res.body)).not.toMatch(/document|akta/i);
    });
  });
});
