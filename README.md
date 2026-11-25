# SportGather

SaaS manajemen klub olahraga usia muda (KU7–KU16) untuk Indonesia: pemain per kelompok umur, jadwal & absensi, iuran via Midtrans, komunikasi WhatsApp, dan rapor. Sport pertama: basket.

- Kebutuhan produk: [`docs/PRD.md`](docs/PRD.md)
- Rencana & milestone: [`docs/plan.md`](docs/plan.md)
- Keputusan teknis (ADR): [`docs/decisions.md`](docs/decisions.md)
- Desain: Figma `vwWLfX9ncQFJK9g94jlAdl`

## Struktur

| Path              | Isi                                                                    |
| ----------------- | ---------------------------------------------------------------------- |
| `apps/web`        | Next.js (App Router) PWA untuk admin, pelatih, dan wali                |
| `apps/api`        | NestJS (Fastify) REST API + OpenAPI di `/docs`                         |
| `packages/shared` | Tipe & util bersama (format Rupiah/tanggal/zona waktu; nanti mesin KU) |
| `packages/ui`     | Design tokens Figma (Tailwind v4), ikon, komponen dasar                |
| `packages/config` | tsconfig bersama                                                       |
| `e2e`             | Playwright smoke test                                                  |
| `infra`           | Docker Compose lokal: Postgres, Redis, S3 (SeaweedFS), Mailpit         |

## Menjalankan secara lokal

Prasyarat: Node 22.12+, pnpm 12, Docker.

```bash
cp .env.example .env
pnpm install
pnpm infra:up          # postgres :55432, redis :56379, S3 :59000, mailpit UI :58025
pnpm dev               # web http://localhost:3000 · api http://localhost:4000 (docs: /docs)
```

Halaman yang tersedia di M0:

- `/`: pilih peran
- `/design`: katalog design system
- `/admin/demo`: shell admin (sidebar)
- `/pelatih/demo`: shell pelatih (bottom nav)
- `/wali`: shell wali (bottom nav)

## Pemeriksaan

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @sportgather/e2e e2e:install   # sekali, unduh Chromium
pnpm --filter @sportgather/e2e e2e
```

CI (`.github/workflows/ci.yml`) menjalankan semua pemeriksaan di atas pada setiap PR dan push ke `main`.

## Aturan kerja

- Commit kecil dengan format Conventional Commits.
- Jangan commit secret; konfigurasi ada di `.env` (lihat `.env.example`).
- Uang disimpan sebagai integer rupiah, bukan float.
- Data di desain Figma adalah contoh fiktif dan tidak boleh dipakai sebagai seed produksi.
