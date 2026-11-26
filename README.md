# SportGather

SaaS manajemen klub olahraga usia muda (KU7–KU16) untuk Indonesia: pemain per kelompok umur, jadwal & absensi, iuran via Midtrans, komunikasi WhatsApp, dan rapor. Sport pertama: basket.

- Kebutuhan produk: [`docs/PRD.md`](docs/PRD.md)
- Rencana & milestone: [`docs/plan.md`](docs/plan.md)
- Keputusan teknis (ADR): [`docs/decisions.md`](docs/decisions.md)
- Desain: Figma `vwWLfX9ncQFJK9g94jlAdl`

## Struktur

| Path              | Isi                                                                         |
| ----------------- | --------------------------------------------------------------------------- |
| `apps/web`        | Next.js (App Router) PWA untuk admin, pelatih, dan wali                     |
| `apps/api`        | NestJS (Fastify) REST API + OpenAPI di `/docs`                              |
| `packages/shared` | Kontrak API (Zod), RBAC, util Rupiah/tanggal/nomor WA; nanti mesin KU       |
| `packages/db`     | Skema Drizzle, migrasi, policy RLS, helper `withTenant`, tes isolasi tenant |
| `packages/ui`     | Design tokens Figma (Tailwind v4), ikon, komponen dasar                     |
| `packages/config` | tsconfig bersama                                                            |
| `e2e`             | Playwright smoke test                                                       |
| `infra`           | Docker Compose lokal: Postgres, Redis, S3 (SeaweedFS), Mailpit              |

## Menjalankan secara lokal

Prasyarat: Node 22.12+, pnpm 12, Docker.

```bash
cp .env.example .env
pnpm install
pnpm infra:up          # postgres :55432, redis :56379, S3 :59000, mailpit UI :58025
pnpm db:migrate        # skema + RLS; mengaktifkan role sg_app untuk aplikasi
pnpm dev               # web http://localhost:3000 · api http://localhost:4000 (docs: /docs)
```

Mencoba aplikasi (M1):

1. Buka http://localhost:3000/daftar-klub dan daftarkan klub. WhatsApp masih mock: kode OTP bisa dilihat di http://localhost:3000/api/dev/outbox.
2. Klub baru langsung bisa dikelola di `/admin/<slug-klub>`. Menu **Pengaturan** berisi profil, lokasi, rekening, staf, dan langganan.
3. Undang staf di **Pengaturan › Staf & peran**. Link undangan muncul di outbox mock.
4. Rekening mock: nomor berakhiran `0000` ditolak, `9999` menunggu verifikasi, nomor lain lolos.

Mencoba M2 (pemain & KU):

1. **Pengaturan › Musim & kompetisi:** buat musim, lalu tambah kompetisi utama. Tanggal kompetisinya menjadi acuan KU (aturan default: KU-N = usia maksimal N tahun).
2. **Tim & KU › Buat tim:** buat tim, lalu tambahkan pemain. Play-up wajib alasan; play-down hanya oleh owner.
3. **Pemain › Impor Excel:** impor dari `.xlsx`/`.csv`, atau tambah pemain manual.
4. **Pendaftaran online:** buka `/daftar/<slug-klub>` (link bisa disalin di Pemain › Verifikasi), lalu verifikasi pendaftarnya di **Pemain › Verifikasi**.
5. **Kenaikan KU:** Tim & KU › Kenaikan KU musim baru.

Mencoba M3 (jadwal & absensi):

1. **Jadwal › Buat jadwal:** buat latihan rutin mingguan (sesi dibuat sampai akhir musim) atau event sekali. Klik sesi untuk mengubah atau membatalkan; wali & pelatih dikabari lewat WhatsApp (mock).
2. **Pelatih:** buka `/pelatih/<slug-klub>` → **Mulai absensi**. Absensi tetap bisa diisi tanpa internet dan tersinkron otomatis saat online.
3. **Wali:** buka **Jadwal** untuk mengisi RSVP (ditutup 2 jam sebelum sesi).
4. **Pengingat H-1 pukul 17.00:** setel `JOBS_ENABLED=true` di `.env` (butuh Redis dari `infra:up`). Link RSVP bertoken muncul di outbox mock.

Mencoba M4 (iuran & pembayaran):

1. **Iuran & Tagihan › Paket iuran:** buat paket bulanan (nominal, tanggal terbit, KU). Satu pemain hanya punya satu paket bulanan aktif.
2. **Tab Tagihan › Terbitkan iuran:** terbit untuk semua pemain aktif (yang cuti dilewati, aman diklik berulang). Dengan `JOBS_ENABLED=true`, tagihan terbit otomatis tiap jam saat tanggal terbit tiba dan pengingat H-3/H/H+3/H+7 dikirim pukul 09.00–21.00 WIB.
3. **Wali › Tagihan:** pilih tagihan → pilih metode → bayar. Dengan `PAYMENT_PROVIDER=mock`, halaman `/dev/midtrans/…` menggantikan Snap (tombol berhasil/tolak/kedaluwarsa).
4. **Penyaluran Dana:** saldo dari pembayaran online (setelah biaya Midtrans & fee platform). Owner menarik dana ke rekening terverifikasi (Iris mock).

### Midtrans sandbox

1. Di dashboard Midtrans **sandbox**: _Settings › Access Keys_, salin **Server Key** (`SB-Mid-server-…`).
2. Isi di `.env` (jangan di-commit): `PAYMENT_PROVIDER=real`, `MIDTRANS_SERVER_KEY=…`, `MIDTRANS_IS_PRODUCTION=false`. `PAYOUT_PROVIDER` tetap `mock` sampai Iris aktif.
3. Cek kredensial: `pnpm --filter api midtrans:check` (membuat transaksi Snap Rp10.000 dan mencetak URL bayarnya).
4. Jalankan ulang `pnpm dev`. Tombol bayar wali kini membuka Snap sandbox; bayar dengan [simulator sandbox](https://simulator.sandbox.midtrans.com/).
5. **Webhook (opsional di lokal):** setelah kembali dari Snap, halaman status mengecek ulang ke Status API Midtrans, jadi pembayaran tetap tercatat tanpa webhook. Untuk menguji webhook, buka tunnel ke web (mis. `cloudflared tunnel --url http://localhost:3000`) lalu isi _Settings › Payment › Notification URL_ dengan `https://<tunnel>/api/webhooks/midtrans`.

Mencoba M5 (komunikasi, pembinaan, laporan):

1. **Beranda (A-17):** ringkasan klub, pemain per KU, daftar "Perlu tindakan", dan sesi hari ini.
2. **Pengumuman (A-16):** pilih target (klub/cabang/KU/tim), lihat jumlah wali, lalu kirim atau jadwalkan. WhatsApp mock berisi link `/i/<token>`. Membukanya menandai dibaca di riwayat.
3. **Pelatih:** `/pelatih/<slug>/penilaian` untuk skor 1–5 dan catatan (bisa diubah 7 hari), dan `/pelatih/<slug>/info` untuk kirim info ke wali tim sendiri.
4. **Laporan (A-18):** pilih periode, unduh Excel/PDF (angka "Ringkasan" sama dengan dashboard), lalu **Terbitkan rapor** semester.
5. **Wali:** Beranda (tagihan & pengumuman), **Rapor** (unduh PDF), **Profil** (izin foto, notifikasi WhatsApp/aplikasi, unduh data, minta hapus data). Permintaan hapus muncul di **Pengaturan › Data & privasi**.
6. **Notifikasi aplikasi (Web Push):** `pnpm --filter api vapid:generate`, salin hasilnya ke `.env`, jalankan ulang API, lalu aktifkan dari Profil wali (butuh HTTPS atau `localhost`).

M6 (siap pilot):

1. **Data demo fiktif:** `pnpm --filter api seed:demo` (database kosong; menolak jalan di production). Klub `belajar-basket-akademi` berisi 36 pemain, 5 tim + jadwal, tagihan bulan berjalan (wali 1–12 sudah bayar). Owner `081299000001`, admin `081299000002`, pelatih `081299000011`–`13`, wali `081299100001`–`024`. OTP dibaca di `/api/dev/outbox`.
2. **Deploy & operasional:** [`docs/deploy.md`](docs/deploy.md) (region Jakarta), [`docs/runbook.md`](docs/runbook.md), [`docs/security-checklist.md`](docs/security-checklist.md).

M7 (profil & lisensi pelatih):

1. **Admin:** Pengaturan › Staf & peran → klik nama staf untuk membuka profil (biodata, foto, pengalaman, lisensi). Kolom **Lisensi** menandai yang perlu verifikasi atau hampir habis. Buka file sertifikat lalu **Verifikasi** atau **Tolak**.
2. **Pelatih:** `/pelatih/<slug>/tim` › **Profil & lisensi saya**. Lisensi yang masih proses bisa dicatat tanpa file; lisensi baru dari pelatih menunggu verifikasi admin.
3. **Wali:** Beranda › **Kenali pelatih** di kartu anak (hanya lisensi terverifikasi & masih berlaku).
4. **Data demo:** `pnpm --filter api seed:demo:coaches` menambahkan profil pelatih ke klub demo yang sudah ada (`seed:demo` baru sudah menyertakannya).

Halaman lain: `/masuk` (login OTP), `/pilih-klub`, `/wali` (area orang tua), `/design` (design system).

## Pemeriksaan

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # tes DB/API butuh Postgres dari infra:up
pnpm --filter @sportgather/e2e e2e:install   # sekali, unduh Chromium
pnpm --filter @sportgather/e2e e2e
```

Tes & e2e memakai password `sg_app` yang sama dengan dev (`DB_APP_PASSWORD` di `.env`), jadi aman dijalankan saat `pnpm dev` hidup.

CI (`.github/workflows/ci.yml`) menjalankan semua pemeriksaan di atas pada setiap PR dan push ke `main`, ditambah secret scan (gitleaks, seluruh riwayat) dan `pnpm audit --prod --audit-level high`.

## Aturan kerja

- Commit kecil dengan format Conventional Commits.
- Jangan commit secret; konfigurasi ada di `.env` (lihat `.env.example`).
- Uang disimpan sebagai integer rupiah, bukan float.
- Data di desain Figma adalah contoh fiktif dan tidak boleh dipakai sebagai seed produksi.
