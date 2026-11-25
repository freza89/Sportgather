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

Halaman lain: `/masuk` (login OTP), `/pilih-klub`, `/wali` (area orang tua), `/design` (design system).

## Pemeriksaan

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # tes DB/API butuh Postgres dari infra:up
pnpm --filter @sportgather/e2e e2e:install   # sekali, unduh Chromium
pnpm --filter @sportgather/e2e e2e
```

CI (`.github/workflows/ci.yml`) menjalankan semua pemeriksaan di atas pada setiap PR dan push ke `main`.

## Aturan kerja

- Commit kecil dengan format Conventional Commits.
- Jangan commit secret; konfigurasi ada di `.env` (lihat `.env.example`).
- Uang disimpan sebagai integer rupiah, bukan float.
- Data di desain Figma adalah contoh fiktif dan tidak boleh dipakai sebagai seed produksi.
