import { auditLog } from '@sportgather/db';
import { CONSENT_VERSION } from '@sportgather/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLUB,
  Client,
  createHarness,
  FAKE_JPEG,
  multipart,
  type Harness,
} from '../test/harness.js';

/**
 * M2: musim & kompetisi, pemain & impor, pendaftaran online + verifikasi dokumen,
 * tim & penempatan KU, kenaikan KU. Contoh data mengikuti desain (acuan 14 Jun 2027).
 */
describe('M2 · pemain & KU', () => {
  let h: Harness;
  let owner: Client;
  let admin: Client;
  let coach: Client;
  let slug: string;
  let orgId: string;
  let seasonId: string;
  const base = () => `/v1/orgs/${slug}`;

  beforeAll(async () => {
    h = await createHarness();
    owner = new Client(h);
    await owner.loginOtp('081400000001', { purpose: 'signup', fullName: 'Rizky Ramadhan' });
    const org = await owner.call('POST', '/v1/orgs', CLUB);
    slug = org.body.slug;
    orgId = org.body.id;
    for (const [phone, role, name] of [
      ['081400000002', 'admin', 'Dewi Lestari'],
      ['081400000003', 'coach', 'Coach Andi'],
    ] as const) {
      await owner.call('POST', `${base()}/staff`, { fullName: name, phone, role });
    }
    admin = new Client(h);
    coach = new Client(h);
    for (const [c, phone] of [
      [admin, '+6281400000002'],
      [coach, '+6281400000003'],
    ] as const) {
      const token = h.outbox.latest(phone, 'undangan_staf')!.params.link!.split('/').pop()!;
      await c.loginOtp(phone.replace('+62', '0'));
      await c.call('POST', '/v1/invitations/accept', { token });
    }
  });
  afterAll(async () => {
    await h.close();
  });

  describe('musim & kompetisi (A-05)', () => {
    it('musim pertama langsung aktif; aturan default MAX_N', async () => {
      const res = await admin.call('POST', `${base()}/seasons`, {
        name: 'Musim 2027',
        startsOn: '2027-01-01',
        endsOn: '2027-12-31',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({
        status: 'active',
        kuRule: 'MAX_N',
        kuGroups: [8, 10, 12, 14, 16],
        referenceDate: '2027-12-31',
      });
      seasonId = res.body.id;
    });

    it('kompetisi pertama menjadi acuan KU latihan rutin', async () => {
      const res = await admin.call('POST', `${base()}/seasons/${seasonId}/competitions`, {
        name: 'Liga Basket Pelajar Bandung 2027',
        organizer: 'Panitia liga',
        kind: 'Liga',
        referenceDate: '2027-06-14',
        kuGroups: [16, 12, 14],
      });
      expect(res.body).toMatchObject({
        referenceDate: '2027-06-14',
        referenceSource: 'Liga Basket Pelajar Bandung 2027',
      });
      expect(res.body.competitions[0]).toMatchObject({ isPrimary: true, kuGroups: [12, 14, 16] });
    });

    it('pelatih tidak bisa mengubah musim', async () => {
      expect(
        (
          await coach.call('POST', `${base()}/seasons`, {
            name: 'X',
            startsOn: '2028-01-01',
            endsOn: '2028-12-31',
          })
        ).status,
      ).toBe(403);
    });
  });

  describe('pemain & impor (A-04, A-06, A-07)', () => {
    it('impor: baris error & duplikat ditandai, tidak ikut tersimpan (US-02)', async () => {
      const rows = [
        {
          fullName: 'Zaki Pratama',
          birthDate: '12/03/2015',
          gender: 'L',
          guardianName: 'Rina Pratama',
          guardianPhone: '081322114455',
        },
        {
          fullName: 'Nadia Azzahra',
          birthDate: '04/01/2019',
          gender: 'P',
          guardianName: 'Rina Pratama',
          guardianPhone: '081322114455',
        },
        {
          fullName: 'Kayla Maharani',
          birthDate: '2 Feb 2017',
          gender: 'P',
          guardianName: 'Dewi M.',
          guardianPhone: '0812-5566-1122',
        },
        {
          fullName: 'Tanpa Tanggal',
          birthDate: '',
          gender: 'L',
          guardianName: 'X',
          guardianPhone: '081200000000',
        },
        {
          fullName: 'Nomor Salah',
          birthDate: '01/01/2014',
          gender: 'L',
          guardianName: 'Y',
          guardianPhone: '12345',
        },
        {
          fullName: 'Tanggal Salah',
          birthDate: '31/02/2014',
          gender: 'L',
          guardianName: 'Z',
          guardianPhone: '081200000001',
        },
        {
          fullName: 'zaki  pratama',
          birthDate: '2015-03-12',
          gender: 'L',
          guardianName: 'Rina',
          guardianPhone: '081322114455',
        },
      ];
      const dry = await admin.call('POST', `${base()}/players/import`, { rows, commit: false });
      expect(dry.status).toBe(200);
      expect(dry.body).toMatchObject({ total: 7, ready: 3, imported: 0 });
      expect(dry.body.errors.map((e: { row: number }) => e.row)).toEqual([5, 6, 7]);
      expect(dry.body.errors[2].message).toContain('31/02/2014 tidak valid');
      expect(dry.body.duplicates).toEqual([
        { row: 8, message: 'Sama dengan “Zaki Pratama” (nama + tgl lahir)' },
      ]);

      const commit = await admin.call('POST', `${base()}/players/import`, { rows, commit: true });
      expect(commit.body.imported).toBe(3);
      // Impor ulang: semuanya duplikat dengan data klub.
      const again = await admin.call('POST', `${base()}/players/import`, {
        rows: rows.slice(0, 3),
        commit: false,
      });
      expect(again.body).toMatchObject({ ready: 0 });
      expect(again.body.duplicates).toHaveLength(3);
    });

    it('impor 2.000 baris selesai < 30 detik', async () => {
      const rows = Array.from({ length: 2000 }, (_, i) => ({
        fullName: `Pemain Massal ${i}`,
        birthDate: `0${(i % 9) + 1}/0${(i % 9) + 1}/2014`,
        gender: i % 2 ? 'L' : 'P',
        guardianName: `Wali ${i}`,
        guardianPhone: `0813${String(10_000_000 + i)}`,
      }));
      const started = Date.now();
      const res = await admin.call('POST', `${base()}/players/import`, { rows, commit: true });
      expect(res.body.imported).toBe(2000);
      expect(Date.now() - started).toBeLessThan(30_000);
    }, 60_000);

    it('daftar pemain: KU dari acuan kompetisi utama, filter & jumlah per KU', async () => {
      const res = await admin.call('GET', `${base()}/players?q=zaki`);
      expect(res.body.referenceDate).toBe('2027-06-14');
      expect(res.body.rows).toEqual([
        expect.objectContaining({
          fullName: 'Zaki Pratama',
          ku: 12,
          guardianName: 'Rina Pratama',
          docStatus: 'missing',
          team: null,
        }),
      ]);
      const ku8 = await admin.call('GET', `${base()}/players?ku=8`);
      expect(ku8.body.rows.map((r: { fullName: string }) => r.fullName)).toContain('Nadia Azzahra');
      expect(ku8.body.kuCounts.find((c: { ku: number }) => c.ku === 10).count).toBeGreaterThan(0);
    });

    it('kakak-adik berbagi satu akun wali', async () => {
      const list = await admin.call('GET', `${base()}/players?q=rina`);
      const byName = (n: string) =>
        list.body.rows.find((r: { fullName: string }) => r.fullName === n).membershipId;
      const zaki = await admin.call('GET', `${base()}/players/${byName('Zaki Pratama')}`);
      const nadia = await admin.call('GET', `${base()}/players/${byName('Nadia Azzahra')}`);
      expect(zaki.body.guardians[0].personId).toBe(nadia.body.guardians[0].personId);
      expect(zaki.body).toMatchObject({ ku: 12, age: { years: 12, months: 3 }, source: 'import' });
    });

    it('tambah pemain manual; duplikat ditolak', async () => {
      const body = {
        fullName: 'Salsa Nabila',
        birthDate: '2012-08-18',
        gender: 'female',
        guardian: { fullName: 'Yuni N.', phone: '081277778888', relation: 'mother' },
      };
      const res = await admin.call('POST', `${base()}/players`, body);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({ ku: 14, status: 'active' });
      expect((await admin.call('POST', `${base()}/players`, body)).status).toBe(409);
    });

    it('cuti dengan alasan', async () => {
      const list = await admin.call('GET', `${base()}/players?q=salsa`);
      const id = list.body.rows[0].membershipId;
      const res = await admin.call('PATCH', `${base()}/players/${id}`, {
        status: 'on_leave',
        statusReason: 'Cedera',
      });
      expect(res.body).toMatchObject({ status: 'on_leave', statusReason: 'Cedera' });
    });
  });

  describe('pendaftaran online (O-01) & verifikasi (A-08)', () => {
    let wali: Client;
    let alyaId: string;
    let rafiId: string;

    it('info klub publik untuk formulir', async () => {
      const res = await new Client(h).call('GET', `/v1/public/orgs/${slug}`);
      expect(res.body).toMatchObject({
        name: CLUB.name,
        referenceDate: '2027-06-14',
        kuRule: 'MAX_N',
      });
      expect((await new Client(h).call('GET', '/v1/public/orgs/tidak-ada')).status).toBe(404);
    });

    const form = (children: object[]) => ({
      relation: 'mother',
      emergencyContactName: 'Agus Kusuma',
      emergencyContactPhone: '081299887766',
      children,
      consent: true,
      consentVersion: CONSENT_VERSION,
    });

    it('wajib login, persetujuan, dan dokumen usia; file harus gambar/PDF', async () => {
      const anon = new Client(h);
      const mp = multipart(
        form([{ fullName: 'Alya Kusuma', birthDate: '2016-09-09', gender: 'female' }]),
        { document_0: { filename: 'akta.jpg', content: FAKE_JPEG } },
      );
      expect(
        (await anon.call('POST', `/v1/public/orgs/${slug}/registrations`, mp.payload, mp.headers))
          .status,
      ).toBe(401);

      wali = new Client(h);
      await wali.loginOtp('085711223344', { purpose: 'signup', fullName: 'Sinta Kusuma' });
      const noConsent = multipart(
        {
          ...form([{ fullName: 'Alya Kusuma', birthDate: '2016-09-09', gender: 'female' }]),
          consent: false,
        },
        { document_0: { filename: 'a.jpg', content: FAKE_JPEG } },
      );
      const r1 = await wali.call(
        'POST',
        `/v1/public/orgs/${slug}/registrations`,
        noConsent.payload,
        noConsent.headers,
      );
      expect(r1.status).toBe(422);
      expect(r1.body.message).toContain('Persetujuan');

      const noDoc = multipart(
        form([{ fullName: 'Alya Kusuma', birthDate: '2016-09-09', gender: 'female' }]),
        {},
      );
      expect(
        (
          await wali.call(
            'POST',
            `/v1/public/orgs/${slug}/registrations`,
            noDoc.payload,
            noDoc.headers,
          )
        ).body.message,
      ).toContain('Unggah akta');

      const html = multipart(
        form([{ fullName: 'Alya Kusuma', birthDate: '2016-09-09', gender: 'female' }]),
        { document_0: { filename: 'akta.jpg', content: Buffer.from('<html>bukan gambar</html>') } },
      );
      expect(
        (
          await wali.call(
            'POST',
            `/v1/public/orgs/${slug}/registrations`,
            html.payload,
            html.headers,
          )
        ).body.message,
      ).toContain('JPG, PNG, atau PDF');
    });

    it('satu wali mendaftarkan dua anak sekaligus (US-03) + WhatsApp konfirmasi', async () => {
      const mp = multipart(
        form([
          {
            fullName: 'Alya Kusuma',
            birthDate: '2016-09-09',
            gender: 'female',
            school: 'SDN Cihampelas 1',
          },
          {
            fullName: 'Muhammad Rafi',
            birthDate: '2017-05-05',
            gender: 'male',
            documentKind: 'kia',
          },
        ]),
        {
          document_0: { filename: 'akta_alya.jpg', content: FAKE_JPEG },
          document_1: { filename: 'kia_rafi.jpg', content: FAKE_JPEG },
        },
      );
      const res = await wali.call(
        'POST',
        `/v1/public/orgs/${slug}/registrations`,
        mp.payload,
        mp.headers,
      );
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.children).toEqual([
        expect.objectContaining({ fullName: 'Alya Kusuma', ku: 10 }), // MAX_N: 10 th → KU10
        expect.objectContaining({ fullName: 'Muhammad Rafi', ku: 10 }),
      ]);
      [alyaId, rafiId] = res.body.children.map((c: { membershipId: string }) => c.membershipId);
      expect(h.outbox.latest('+6285711223344', 'pendaftaran_diterima')?.params.anak).toBe(
        'Alya Kusuma, Muhammad Rafi',
      );
    });

    it('antrean verifikasi berisi pendaftar beserta dokumen & wali', async () => {
      const q = await admin.call('GET', `${base()}/registrations`);
      expect(q.body).toHaveLength(2);
      expect(q.body[0]).toMatchObject({
        fullName: 'Alya Kusuma',
        ku: 10,
        guardian: { fullName: 'Sinta Kusuma', relation: 'mother' },
      });
      expect(q.body[0].documents[0]).toMatchObject({
        kind: 'akta',
        status: 'pending',
        fileName: 'akta_alya.jpg',
      });
    });

    it('dokumen hanya bisa dibuka owner/admin dan setiap akses tercatat (US-04)', async () => {
      const q = await admin.call('GET', `${base()}/registrations`);
      const docId = q.body[0].documents[0].id;
      const res = await admin.call('GET', `${base()}/documents/${docId}/content`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toContain('no-store');
      expect(Buffer.from(res.raw).equals(FAKE_JPEG)).toBe(true);
      expect((await coach.call('GET', `${base()}/documents/${docId}/content`)).status).toBe(403);
      const logs = await h.db.admin.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, 'document.viewed')));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.entityId).toBe(docId);
    });

    it('dokumen di storage tersimpan terenkripsi', async () => {
      const { BLOB_STORE } = await import('../storage/storage.js');
      const store = h.app.get<import('../storage/storage.js').MemoryBlobStore>(BLOB_STORE);
      expect(store.objects.size).toBeGreaterThanOrEqual(2);
      for (const blob of store.objects.values()) expect(blob.includes(FAKE_JPEG)).toBe(false);
    });

    it('tolak wajib alasan → WhatsApp ke wali; wali unggah ulang → kembali ke antrean', async () => {
      expect(
        (await admin.call('POST', `${base()}/registrations/${rafiId}/reject`, { reason: '' }))
          .status,
      ).toBe(400);
      const rej = await admin.call('POST', `${base()}/registrations/${rafiId}/reject`, {
        reason: 'Foto KIA buram, nama tidak terbaca',
      });
      expect(rej.status).toBe(200);
      expect(h.outbox.latest('+6285711223344', 'dokumen_ditolak')?.params.alasan).toBe(
        'Foto KIA buram, nama tidak terbaca',
      );

      const kids = await wali.call('GET', '/v1/me/children');
      expect(
        kids.body.find((k: { fullName: string }) => k.fullName === 'Muhammad Rafi'),
      ).toMatchObject({
        status: 'rejected',
        rejectionReason: 'Foto KIA buram, nama tidak terbaca',
      });
      const mp = multipart(
        { kind: 'kia' },
        { document: { filename: 'kia_baru.jpg', content: FAKE_JPEG } },
      );
      expect(
        (await wali.call('POST', `/v1/me/children/${rafiId}/documents`, mp.payload, mp.headers))
          .status,
      ).toBe(201);
      const q = await admin.call('GET', `${base()}/registrations`);
      expect(q.body.map((r: { fullName: string }) => r.fullName).sort()).toEqual([
        'Alya Kusuma',
        'Muhammad Rafi',
      ]);
    });

    it('wali lain tidak bisa mengunggah untuk anak orang lain', async () => {
      const other = new Client(h);
      await other.loginOtp('085799990000', { purpose: 'signup', fullName: 'Orang Lain' });
      const mp = multipart(
        { kind: 'akta' },
        { document: { filename: 'x.jpg', content: FAKE_JPEG } },
      );
      expect(
        (await other.call('POST', `/v1/me/children/${alyaId}/documents`, mp.payload, mp.headers))
          .status,
      ).toBe(403);
      expect((await other.call('GET', '/v1/me/children')).body).toEqual([]);
    });

    describe('tim & penempatan (A-09, A-10, US-06)', () => {
      let ku12: string;
      let ku10: string;
      const idOf = async (q: string) =>
        (await admin.call('GET', `${base()}/players?q=${encodeURIComponent(q)}`)).body.rows[0]
          .membershipId as string;

      it('buat tim; KU harus ada di kelompok musim', async () => {
        const coachStaff = (await owner.call('GET', `${base()}/staff`)).body.find(
          (s: { role: string }) => s.role === 'coach',
        ).id;
        const res = await admin.call('POST', `${base()}/teams`, {
          ku: 12,
          level: 'Elite',
          staffRoleIds: [coachStaff],
        });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(res.body).toMatchObject({
          name: 'KU12 Elite',
          coaches: [{ fullName: 'Coach Andi' }],
        });
        ku12 = res.body.id;
        ku10 = (await admin.call('POST', `${base()}/teams`, { ku: 10, level: 'Development' })).body
          .id;
        expect(
          (await admin.call('POST', `${base()}/teams`, { ku: 11, level: 'Elite' })).status,
        ).toBe(422);
      });

      it('terima pendaftar langsung ke tim sesuai KU (A-08 → tim)', async () => {
        const res = await admin.call('POST', `${base()}/registrations/${alyaId}/accept`, {
          teamId: ku10,
          jerseyNumber: 7,
        });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(h.outbox.latest('+6285711223344', 'pendaftaran_disetujui')?.params).toMatchObject({
          anak: 'Alya Kusuma',
          tim: 'KU10 Development',
        });
        const kids = await wali.call('GET', '/v1/me/children');
        expect(
          kids.body.find((k: { fullName: string }) => k.fullName === 'Alya Kusuma'),
        ).toMatchObject({ status: 'active', teamName: 'KU10 Development', ageVerified: true });
      });

      it('kandidat: KU sesuai di atas, play-up di bawahnya', async () => {
        const res = await admin.call('GET', `${base()}/teams/${ku12}/candidates`);
        const zaki = res.body.find((c: { fullName: string }) => c.fullName === 'Zaki Pratama');
        const kayla = res.body.find((c: { fullName: string }) => c.fullName === 'Kayla Maharani');
        expect(zaki).toMatchObject({ ku: 12, placement: 'same' });
        expect(kayla).toMatchObject({ ku: 10, placement: 'play_up' });
        expect(res.body.indexOf(zaki)).toBeLessThan(res.body.indexOf(kayla));
      });

      it('KU sama: langsung masuk; nomor punggung tidak boleh ganda', async () => {
        const kayla = await idOf('Kayla Maharani');
        expect(
          (
            await admin.call('POST', `${base()}/teams/${ku10}/members`, {
              membershipId: kayla,
              jerseyNumber: 7,
            })
          ).status,
        ).toBe(409);
        expect(
          (
            await admin.call('POST', `${base()}/teams/${ku10}/members`, {
              membershipId: kayla,
              jerseyNumber: 10,
            })
          ).body,
        ).toMatchObject({ placement: 'same' });
        const zaki = await idOf('Zaki Pratama');
        expect(
          (
            await admin.call('POST', `${base()}/teams/${ku12}/members`, {
              membershipId: zaki,
              jerseyNumber: 7,
            })
          ).body,
        ).toMatchObject({ placement: 'same' });
      });

      it('play-up wajib alasan (admin boleh)', async () => {
        const kayla = await idOf('Kayla Maharani');
        const noReason = await admin.call('POST', `${base()}/teams/${ku12}/members`, {
          membershipId: kayla,
        });
        expect(noReason.status).toBe(422);
        expect(noReason.body.message).toContain('Play-up wajib disertai alasan');
        const ok = await admin.call('POST', `${base()}/teams/${ku12}/members`, {
          membershipId: kayla,
          reason: 'Skill di atas KU-nya',
        });
        expect(ok.body).toMatchObject({ placement: 'play_up' });
      });

      it('play-down diblokir untuk admin; owner boleh dengan alasan', async () => {
        const zaki = await idOf('Zaki Pratama');
        const byAdmin = await admin.call('POST', `${base()}/teams/${ku10}/members`, {
          membershipId: zaki,
          reason: 'Adaptasi setelah cedera',
        });
        expect(byAdmin.status).toBe(403);
        expect(byAdmin.body.message).toContain('butuh persetujuan owner');
        const noReason = await owner.call('POST', `${base()}/teams/${ku10}/members`, {
          membershipId: zaki,
        });
        expect(noReason.status).toBe(422);
        const ok = await owner.call('POST', `${base()}/teams/${ku10}/members`, {
          membershipId: zaki,
          reason: 'Adaptasi setelah cedera',
        });
        expect(ok.body).toMatchObject({ placement: 'play_down' });
        const logs = await h.db.admin.db
          .select()
          .from(auditLog)
          .where(eq(auditLog.action, 'team.player_play_down'));
        expect(logs).toHaveLength(1);
      });

      it('satu tim aktif per musim: pindah tim keluar dari tim lama', async () => {
        const detail12 = await admin.call('GET', `${base()}/teams/${ku12}`);
        // Kayla pindah dari KU10 (play-up); Zaki pindah ke KU10 (play-down).
        expect(detail12.body.members.map((m: { fullName: string }) => m.fullName)).toEqual([
          'Kayla Maharani',
        ]);
        const kayla = detail12.body.members.find(
          (m: { fullName: string }) => m.fullName === 'Kayla Maharani',
        );
        expect(kayla).toMatchObject({
          actualKu: 10,
          placement: 'play_up',
          placementReason: 'Skill di atas KU-nya',
          age: { years: 10, months: 4 },
        });
        const list = await admin.call('GET', `${base()}/teams`);
        expect(list.body.season).toMatchObject({ referenceDate: '2027-06-14' });
        expect(
          list.body.teams.map((t: { name: string; playerCount: number }) => [
            t.name,
            t.playerCount,
          ]),
        ).toEqual([
          ['KU10 Development', 2],
          ['KU12 Elite', 1],
        ]);
      });

      it('US-05: pratinjau perubahan KU saat tanggal acuan diganti', async () => {
        const res = await admin.call('POST', `${base()}/competitions/preview`, {
          competitionId: null,
          referenceDate: '2027-10-01',
        });
        expect(res.status).toBe(200);
        // Zaki (lahir 12 Mar 2015) tetap 12 th; Alya (9 Sep 2016) jadi 11 th → tetap KU12; Kayla tetap 10.
        const names = res.body.map((c: { fullName: string }) => c.fullName);
        // Alya (9 Sep 2016): 10 th → 11 th pada 1 Okt → KU10 → KU12.
        expect(
          res.body.find((c: { fullName: string }) => c.fullName === 'Alya Kusuma'),
        ).toMatchObject({ from: 10, to: 12 });
        expect(names).not.toContain('Zaki Pratama');
        expect(
          res.body.every((c: { from: number | null; to: number | null }) => c.from !== c.to),
        ).toBe(true);
      });
    });

    describe('kenaikan KU musim baru (A-11)', () => {
      it('buat musim 2028 (draf) dengan kompetisi utama baru', async () => {
        const res = await admin.call('POST', `${base()}/promotion/season`, {
          name: 'Musim 2028',
          startsOn: '2028-01-01',
          endsOn: '2028-12-31',
          competition: {
            name: 'Liga Basket Pelajar Bandung 2028',
            referenceDate: '2028-06-13',
            kuGroups: [12, 14, 16],
          },
        });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(
          (
            await admin.call('POST', `${base()}/promotion/season`, {
              name: 'Lagi',
              startsOn: '2028-02-01',
              endsOn: '2028-12-31',
            })
          ).status,
        ).toBe(409);
      });

      it('pratinjau: naik, tetap, perlu keputusan, tim usulan', async () => {
        const res = await admin.call('GET', `${base()}/promotion`);
        expect(res.body.toSeason.referenceDate).toBe('2028-06-13');
        const row = (n: string) =>
          res.body.rows.find((r: { fullName: string }) => r.fullName === n);
        expect(row('Alya Kusuma')).toMatchObject({
          oldKu: 10,
          newKu: 12,
          status: 'naik',
          suggestedTeam: { id: null, name: 'KU12 Development (dibuat)' },
        });
        expect(row('Kayla Maharani')).toMatchObject({
          oldKu: 10,
          newKu: 12,
          status: 'perlu_keputusan',
        });
        expect(row('Zaki Pratama')).toMatchObject({
          oldKu: 12,
          newKu: 14,
          status: 'perlu_keputusan',
        });
        expect(row('Nadia Azzahra')).toMatchObject({
          oldKu: 8,
          newKu: 10,
          status: 'naik',
          suggestedTeam: null,
        });
      });

      it('simpan draf, lalu terapkan; yang perlu keputusan wajib diputuskan', async () => {
        const preview = (await admin.call('GET', `${base()}/promotion`)).body;
        const pending = preview.rows.filter(
          (r: { status: string }) => r.status === 'perlu_keputusan' || r.status === 'lulus',
        );
        expect(
          (await admin.call('POST', `${base()}/promotion`, { decisions: [], draft: false })).status,
        ).toBe(422);
        const decisions = pending.map((r: { membershipId: string }) => ({
          membershipId: r.membershipId,
          action: 'skip',
        }));
        expect(
          (await admin.call('POST', `${base()}/promotion`, { decisions, draft: true })).body,
        ).toMatchObject({ draftSaved: true });
        expect((await admin.call('GET', `${base()}/promotion`)).body.draft.decisions).toHaveLength(
          decisions.length,
        );

        const res = await admin.call('POST', `${base()}/promotion`, { decisions, draft: false });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toMatchObject({ applied: true, placed: 1, teamsCreated: 1 });
        const active = await admin.call('GET', `${base()}/seasons/active`);
        expect(active.body).toMatchObject({ name: 'Musim 2028', referenceDate: '2028-06-13' });
        const teams = await admin.call('GET', `${base()}/teams`);
        expect(teams.body.teams).toEqual([
          expect.objectContaining({ name: 'KU12 Development', playerCount: 1 }),
        ]);
      });
    });
  });

  it('isolasi: klub lain tidak bisa membuka pemain, dokumen, atau tim', async () => {
    const other = new Client(h);
    await other.loginOtp('081499990000', { purpose: 'signup', fullName: 'Owner Lain' });
    await other.call('POST', '/v1/orgs', { ...CLUB, name: 'Klub Lain' });
    const anyPlayer = (await admin.call('GET', `${base()}/players?status=all`)).body.rows[0]
      .membershipId;
    for (const url of [
      `${base()}/players`,
      `${base()}/players/${anyPlayer}`,
      `${base()}/registrations`,
      `${base()}/teams`,
    ]) {
      expect((await other.call('GET', url)).status, url).toBe(404);
    }
    const otherSlug = (await other.call('GET', '/v1/me')).body.clubs[0].slug;
    expect((await other.call('GET', `/v1/orgs/${otherSlug}/players/${anyPlayer}`)).status).toBe(
      404,
    );
  });

  it('/auth/session membaca nama sendiri (RLS person)', async () => {
    expect((await owner.call('GET', '/v1/auth/session')).body).toMatchObject({
      fullName: 'Rizky Ramadhan',
    });
  });
});
