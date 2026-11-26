/**
 * Seed demo FIKTIF "Belajar Basket Akademi" untuk lokal/staging (M6).
 *
 * Data dibuat lewat endpoint API sungguhan (di dalam proses, app.inject), jadi semua aturan
 * bisnis (KU, play-down, tagihan, ledger) ikut berlaku. Semua nama & nomor fiktif.
 *
 * Jalankan: pnpm --filter api seed:demo   (butuh Postgres + migrasi; membaca .env root)
 * Menolak jalan bila NODE_ENV=production atau klub demo sudah ada.
 */
import 'reflect-metadata';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';
import { MockOutbox } from '../dist/integrations/messaging.js';
import { MockMidtrans } from '../dist/integrations/midtrans.js';

if (process.env.NODE_ENV === 'production') {
  console.error('seed:demo tidak boleh dijalankan di production.');
  process.exit(1);
}

const CLUB_NAME = 'Belajar Basket Akademi';
const CLUB_SLUG = 'belajar-basket-akademi';
const OWNER = { phone: '081299000001', name: 'Hendra Wijaya (demo)' };
const ADMIN = { phone: '081299000002', name: 'Sari Kusuma (demo)' };
const COACHES = [
  { phone: '081299000011', name: 'Coach Dimas (demo)', kus: [8, 10] },
  { phone: '081299000012', name: 'Coach Ayu (demo)', kus: [12] },
  { phone: '081299000013', name: 'Coach Fajar (demo)', kus: [14, 16] },
];
const MONTHLY_FEE = 350_000;

// Semua provider dipaksa mock: OTP dibaca dari outbox, pembayaran disimulasikan.
const env = loadEnv({
  ...process.env,
  NODE_ENV: 'development',
  WHATSAPP_PROVIDER: 'mock',
  SMS_PROVIDER: 'mock',
  PAYMENT_PROVIDER: 'mock',
  PAYOUT_PROVIDER: 'mock',
  PUSH_PROVIDER: 'mock',
  BANK_VERIFICATION_PROVIDER: 'mock',
  JOBS_ENABLED: 'false',
  RATE_LIMIT_PER_MIN: '100000',
});
const app = await createApp(env);
await app.init();
await app.getHttpAdapter().getInstance().ready();
const outbox = app.get(MockOutbox);
const midtrans = app.get(MockMidtrans);

const e164 = (p) => `+62${p.replace(/^0/, '')}`;

class Client {
  cookie;
  async call(method, url, payload) {
    const res = await app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload }),
      headers: this.cookie ? { cookie: this.cookie } : {},
    });
    const raw = [res.headers['set-cookie']].flat()[0];
    if (raw?.startsWith('sg_session=')) this.cookie = raw.split(';')[0];
    const body = String(res.headers['content-type'] ?? '').includes('json') ? res.json() : null;
    if (res.statusCode >= 400)
      throw new Error(`${method} ${url} → ${res.statusCode}: ${JSON.stringify(body)}`);
    return body;
  }
  async login(phone, fullName) {
    const req = await this.call('POST', '/v1/auth/otp/request', {
      phone,
      purpose: fullName ? 'signup' : 'login',
    });
    const code = outbox.latest(e164(phone), 'kode_otp')?.params.kode;
    if (!code) throw new Error(`OTP untuk ${phone} tidak ditemukan`);
    await this.call('POST', '/v1/auth/otp/verify', {
      challengeId: req.challengeId,
      code,
      ...(fullName ? { fullName } : {}),
    });
    return this;
  }
}

/** Tanggal lokal Jakarta (YYYY-MM-DD) + offset hari. */
const jakarta = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
const today = jakarta();
const year = Number(today.slice(0, 4));

const onlyCoachProfiles = process.argv.includes('--coach-profiles');
/** Sesi staf yang sudah login (OTP baru dibatasi 30 detik per nomor). */
const sessions = new Map();

try {
  const existing = await app.inject({ method: 'GET', url: `/v1/public/orgs/${CLUB_SLUG}` });
  if (onlyCoachProfiles) {
    // Tambahkan profil & lisensi pelatih (M7) ke klub demo yang sudah ada.
    if (existing.statusCode !== 200)
      throw new Error('Klub demo belum ada. Jalankan seed:demo dulu.');
    await seedCoachProfiles(await new Client().login(OWNER.phone), `/v1/orgs/${CLUB_SLUG}`);
  } else if (existing.statusCode === 200) {
    console.error(
      `Klub "${CLUB_NAME}" (/${CLUB_SLUG}) sudah ada. Kosongkan database dulu bila ingin seed ulang.`,
    );
    process.exitCode = 1;
  } else {
    await seed(await new Client().login(OWNER.phone, OWNER.name));
  }
} finally {
  await app.close();
}

async function seed(owner) {
  const org = await owner.call('POST', '/v1/orgs', {
    name: CLUB_NAME,
    city: 'Bandung',
    branches: [
      {
        name: 'GOR Pajajaran',
        address: 'Jl. Pajajaran (alamat demo), Bandung',
        timezone: 'Asia/Jakarta',
        courts: 2,
      },
    ],
    bankAccount: { bankCode: 'BCA', accountNumber: '0123454821', holderName: CLUB_NAME },
  });
  const slug = org.slug;
  const base = `/v1/orgs/${slug}`;
  console.log(`Klub dibuat: ${slug}`);

  const branch2 = await owner.call('POST', `${base}/branches`, {
    name: 'Lapangan Antapani',
    address: 'Jl. Antapani (alamat demo), Bandung',
    timezone: 'Asia/Jakarta',
    courts: 1,
  });

  const season = await owner.call('POST', `${base}/seasons`, {
    name: `Musim ${year}/${year + 1}`,
    startsOn: jakarta(-30),
    endsOn: jakarta(300),
  });
  await owner.call('POST', `${base}/seasons/${season.id}/competitions`, {
    name: `Liga Basket Pelajar Bandung ${year + 1} (demo)`,
    organizer: 'Panitia liga (demo)',
    kind: 'Liga',
    referenceDate: jakarta(200),
    kuGroups: [8, 10, 12, 14, 16],
  });

  // Staf: admin + 3 pelatih menerima undangan lewat link di outbox.
  for (const s of [{ ...ADMIN, role: 'admin' }, ...COACHES.map((c) => ({ ...c, role: 'coach' }))]) {
    await owner.call('POST', `${base}/staff`, { fullName: s.name, phone: s.phone, role: s.role });
    const token = outbox.latest(e164(s.phone), 'undangan_staf').params.link.split('/').pop();
    const c = await new Client().login(s.phone);
    await c.call('POST', '/v1/invitations/accept', { token });
    sessions.set(s.phone, c);
  }
  const staff = await owner.call('GET', `${base}/staff`);
  const staffId = (name) => staff.find((s) => s.fullName === name).id;

  // 36 pemain (usia 7–15) dengan 24 wali; sebagian wali punya 2 anak.
  const first = [
    'Raka',
    'Nadia',
    'Zaki',
    'Alya',
    'Bima',
    'Citra',
    'Dafa',
    'Elsa',
    'Farel',
    'Gita',
    'Hafiz',
    'Intan',
    'Jovan',
    'Kirana',
    'Lutfi',
    'Maya',
    'Naufal',
    'Olivia',
    'Putra',
    'Qeela',
    'Rafi',
    'Salsa',
    'Tegar',
    'Umi',
    'Vino',
    'Wulan',
    'Yusuf',
    'Zahra',
    'Arka',
    'Bunga',
    'Cakra',
    'Dinda',
    'Evan',
    'Fira',
    'Galang',
    'Hana',
  ];
  const family = [
    'Pratama',
    'Saputra',
    'Hidayat',
    'Nugroho',
    'Wibowo',
    'Kurniawan',
    'Setiawan',
    'Lestari',
    'Permana',
    'Gunawan',
    'Santoso',
    'Rahman',
    'Siregar',
    'Halim',
    'Putri',
    'Firmansyah',
    'Utomo',
    'Sitompul',
    'Maulana',
    'Anggraini',
    'Susanto',
    'Hakim',
    'Prasetyo',
    'Wijaksono',
  ];
  const guardianFirst = ['Rina', 'Budi', 'Dewi', 'Agus', 'Lina', 'Yudi'];
  const rows = first.map((name, i) => {
    const g = i < 24 ? i : i - 24; // anak ke-25..36 = adik dari wali 1..12
    const age = 7 + (i % 9);
    const month = String((i % 12) + 1).padStart(2, '0');
    return {
      fullName: `${name} ${family[g]}`,
      birthDate: `${year - age}-${month}-${String((i % 27) + 1).padStart(2, '0')}`,
      gender: i % 2 === 0 ? 'L' : 'P',
      guardianName: `${guardianFirst[g % guardianFirst.length]} ${family[g]}`,
      guardianPhone: `0812991${String(g + 1).padStart(5, '0')}`,
    };
  });
  await owner.call('POST', `${base}/players/import`, { commit: true, rows });
  const players = (await owner.call('GET', `${base}/players?pageSize=100`)).rows;
  console.log(`${players.length} pemain diimpor`);

  // Tim per KU; pemain masuk tim sesuai KU-nya (tidak ada play-up/down di data demo).
  const weekdays = { 8: [2, 4], 10: [2, 4], 12: [1, 3], 14: [1, 5], 16: [3, 5] };
  for (const ku of [8, 10, 12, 14, 16]) {
    const coach = COACHES.find((c) => c.kus.includes(ku));
    const team = await owner.call('POST', `${base}/teams`, {
      ku,
      level: ku >= 12 ? 'Kompetisi' : 'Development',
      branchId: ku === 8 ? branch2.id : null,
      staffRoleIds: [staffId(coach.name)],
    });
    for (const p of players.filter((p) => p.ku === ku))
      await owner.call('POST', `${base}/teams/${team.id}/members`, {
        membershipId: p.membershipId,
        reason: 'Penempatan awal (demo)',
      });
    await owner.call('POST', `${base}/schedule/series`, {
      teamId: team.id,
      weekdays: weekdays[ku],
      startTime: ku <= 10 ? '15:30' : '16:30',
      durationMin: 90,
      ...(ku === 8 ? { branchId: branch2.id } : {}),
    });
  }
  console.log('5 tim + jadwal latihan rutin dibuat');

  await owner.call('POST', `${base}/billing/plans`, {
    name: 'Iuran Bulanan',
    kind: 'monthly',
    amount: MONTHLY_FEE,
    issueDay: 1,
    dueDays: 9,
  });
  const issued = await owner.call('POST', `${base}/billing/invoices/issue`, {
    period: today.slice(0, 7),
  });
  console.log(`${issued.created} tagihan terbit`);

  // Separuh wali sudah bayar lewat Midtrans (mock): checkout → notifikasi settlement.
  let paid = 0;
  for (let g = 0; g < 12; g++) {
    const phone = `0812991${String(g + 1).padStart(5, '0')}`;
    const wali = await new Client().login(phone);
    const invoices = await wali.call('GET', '/v1/me/invoices');
    if (!invoices.length) continue;
    const co = await wali.call('POST', '/v1/me/checkout', {
      invoiceIds: invoices.map((i) => i.id),
      method: g % 2 === 0 ? 'bca_va' : 'qris',
    });
    const n = midtrans.simulate(co.orderId, 'settlement', g % 2 === 0 ? 'bank_transfer' : 'qris');
    await new Client().call('POST', '/v1/webhooks/midtrans', n);
    paid += invoices.length;
  }
  console.log(`${paid} tagihan lunas lewat pembayaran online (mock)`);

  await seedCoachProfiles(owner, base);

  await owner.call('POST', `${base}/announcements`, {
    title: 'Selamat datang di SportGather',
    body: 'Jadwal latihan, tagihan iuran, dan rapor kini bisa dilihat di aplikasi. Hubungi admin bila ada pertanyaan.',
    target: { kind: 'club' },
  });

  console.log(`
Selesai. Login (OTP dari outbox mock: /api/dev/outbox):
  Owner   ${OWNER.phone}   → /admin/${slug}
  Admin   ${ADMIN.phone}
  Pelatih ${COACHES.map((c) => c.phone).join(', ')} → /pelatih/${slug}
  Wali    081299100001 … 081299100024 → /wali  (wali 1–12 sudah bayar, 13–24 belum)`);
}

/** M7: CV & lisensi pelatih demo (fiktif). Satu lisensi menunggu verifikasi, satu segera habis. */
async function seedCoachProfiles(owner, base) {
  const staff = await owner.call('GET', `${base}/staff`);
  const id = (name) => staff.find((s) => s.fullName === name).id;
  const profiles = [
    {
      name: COACHES[0].name,
      profile: {
        headline: 'Pelatih KU8 & KU10',
        specialization: 'Fundamental & motorik anak',
        yearsCoaching: 4,
        city: 'Bandung',
        bio: 'Membina pemain usia dini dengan pendekatan bermain sambil belajar.',
        education: 'S1 Pendidikan Jasmani (demo)',
      },
      experiences: [
        { title: 'Pelatih kepala KU10', organization: CLUB_NAME, startYear: year - 2 },
        {
          title: 'Asisten pelatih',
          organization: 'Klub Basket Contoh',
          startYear: year - 4,
          endYear: year - 2,
        },
      ],
      licenses: [
        {
          name: 'Lisensi Pelatih Bola Basket Level C',
          issuer: 'PERBASI',
          level: 'C',
          issuedOn: jakarta(-700),
          expiresOn: jakarta(400),
        },
        {
          name: 'Lisensi Pelatih Bola Basket Level B',
          issuer: 'PERBASI',
          level: 'B',
          inProgress: true,
        },
      ],
    },
    {
      name: COACHES[1].name,
      profile: {
        headline: 'Pelatih kepala KU12',
        specialization: 'Pertahanan & transisi',
        yearsCoaching: 6,
        city: 'Bandung',
        bio: 'Mantan pemain liga mahasiswa; fokus pada disiplin dan kerja sama tim.',
        playingBackground: 'Pemain tim universitas (demo)',
      },
      experiences: [{ title: 'Pelatih kepala KU12', organization: CLUB_NAME, startYear: year - 3 }],
      licenses: [
        {
          name: 'FIBA Coaching Level 1',
          issuer: 'FIBA',
          level: '1',
          issuedOn: jakarta(-1000),
          expiresOn: jakarta(20),
        },
      ],
    },
    {
      name: COACHES[2].name,
      profile: {
        headline: 'Pelatih KU14 & KU16',
        specialization: 'Taktik & persiapan kompetisi',
        yearsCoaching: 9,
        city: 'Bandung',
      },
      experiences: [
        {
          title: 'Pelatih tim pelajar',
          organization: 'SMA Contoh Bandung',
          startYear: year - 9,
          endYear: year - 1,
        },
      ],
      licenses: [
        {
          name: 'Lisensi Pelatih Bola Basket Level C',
          issuer: 'PERBASI',
          level: 'C',
          issuedOn: jakarta(-1200),
          expiresOn: jakarta(500),
        },
      ],
    },
  ];
  for (const p of profiles) {
    const url = `${base}/coach-profiles/${id(p.name)}`;
    const current = await owner.call('GET', url);
    if (current.licenses.length || current.experiences.length) {
      console.log(`Profil ${p.name} sudah terisi, dilewati.`);
      continue;
    }
    await owner.call('PUT', url, p.profile);
    for (const e of p.experiences) await owner.call('POST', `${url}/experiences`, e);
    for (const l of p.licenses) await owner.call('POST', `${url}/licenses`, l);
  }
  // Lisensi dari pelatih sendiri → menunggu verifikasi admin.
  const fajar = sessions.get(COACHES[2].phone) ?? (await new Client().login(COACHES[2].phone));
  const mine = await fajar.call('GET', `${base}/coach-profiles/me`);
  if (mine.licenses.some((l) => l.name === 'Lisensi Wasit Bola Basket')) return;
  await fajar.call('POST', `${base}/coach-profiles/me/licenses`, {
    name: 'Lisensi Wasit Bola Basket',
    issuer: 'PERBASI',
    issuedOn: jakarta(-90),
  });
  console.log('Profil & lisensi 3 pelatih dibuat (1 menunggu verifikasi, 1 segera habis)');
}
