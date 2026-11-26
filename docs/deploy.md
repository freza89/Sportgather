# Deploy (staging & produksi, region Jakarta)

Dokumen ini menjelaskan cara menjalankan SportGather di cloud untuk staging pilot dan produksi. Data pribadi anak dan wali disimpan **di Indonesia**: semua komponen yang menyimpan data berada di region Jakarta.

> **Keputusan yang masih perlu dikonfirmasi (plan Q12):** penyedia cloud. Usulan: **AWS `ap-southeast-3` (Jakarta)**, karena default `S3_REGION` sudah memakai region ini dan semua layanan terkelola yang dibutuhkan tersedia di sana. Alternatif yang setara: GCP `asia-southeast2` (Jakarta). Nama layanan di bawah memakai AWS, dengan padanan GCP di kurung.

## Topologi

```
Internet ──TLS──▶ Load balancer (ALB / Cloud LB)
                     │  menambahkan X-Forwarded-For
                     ▼
               web (Next.js, publik lewat LB)  ──/api/* proxy──▶  api (NestJS, subnet privat)
                                                                     │
                     Postgres 17 (RDS / Cloud SQL) ◀─────────────────┤
                     Redis 7 (ElastiCache / Memorystore) ◀───────────┤  job terjadwal (BullMQ)
                     Object storage (S3 / GCS, terenkripsi) ◀────────┘  dokumen anak (AES-256-GCM)
```

- Hanya **web** yang menerima trafik publik. **API tidak boleh punya IP/URL publik.** Webhook Midtrans juga masuk lewat web (`https://<domain>/api/webhooks/midtrans`) lalu diteruskan ke API.
- **`TRUST_PROXY`** di API = CIDR subnet tempat web berjalan (mis. `10.0.1.0/24`). API hanya memercayai `X-Forwarded-For` dari alamat itu, dan entri terakhir (yang ditambahkan load balancer) menjadi IP klien untuk rate limit dan log audit. Load balancer **wajib** menambahkan `X-Forwarded-For`. Kalau web dibuka langsung ke internet tanpa LB, IP klien bisa dipalsukan (ADR-030).
- **Job terjadwal** (`JOBS_ENABLED=true`) hanya dinyalakan di **satu** instance API. Instance lain `false`.

## Komponen & ukuran awal pilot

| Komponen       | Layanan                     | Ukuran awal                     | Catatan                                                   |
| -------------- | --------------------------- | ------------------------------- | --------------------------------------------------------- |
| web            | ECS Fargate (Cloud Run)     | 2 × 0,5 vCPU / 1 GB             | `next start`, port 3000                                   |
| api            | ECS Fargate (Cloud Run*)    | 2 × 0,5 vCPU / 1 GB             | port 4000; *Cloud Run: min-instances 1 untuk job terjadwal |
| Postgres 17    | RDS (Cloud SQL)             | db.t4g.small, 20 GB, Multi-AZ di produksi | backup otomatis + PITR 7 hari (produksi 30 hari) |
| Redis 7        | ElastiCache (Memorystore)   | cache.t4g.micro                 | hanya antrean job; boleh hilang (job dijadwal ulang)      |
| Object storage | S3 (GCS)                    | —                               | bucket privat, block public access, SSE aktif, versioning |
| Secret         | Secrets Manager (Secret Manager) | —                          | semua nilai di tabel env "rahasia" di bawah               |

## Build & rilis

Prasyarat: Node 22.12+ (lihat `.nvmrc`), pnpm 12.

```bash
pnpm install --frozen-lockfile
pnpm build                       # api → apps/api/dist, web → apps/web/.next
```

Urutan rilis setiap versi:

1. **Migrasi dulu**, dari job sekali jalan dengan koneksi admin: `pnpm db:migrate` (butuh `DATABASE_ADMIN_URL`). Migrasi bersifat maju saja. Perubahan yang merusak kompatibilitas dipecah ke dua rilis.
2. **API**: `node apps/api/dist/main.js`. Health check LB: `GET /health/ready` (cek database). `GET /health` hanya liveness.
3. **Web**: `pnpm --filter @sportgather/web exec next start --port 3000` dengan `API_URL=http://<api-internal>:4000`. Health check: `GET /masuk`.

API **menolak start** bila konfigurasi production tidak aman: provider mock, `AUTH_SECRET`/`DOCUMENT_ENCRYPTION_KEY`/`S3_SECRET_KEY` bawaan, `STORAGE_PROVIDER=memory`, `WEB_ORIGIN` bukan https, `TRUST_PROXY` kosong, server key Midtrans sandbox dengan `MIDTRANS_IS_PRODUCTION=true`, atau role DB yang bisa melewati RLS.

## Role database

Migrasi membuat role `sg_app` tanpa `BYPASSRLS`. Di cloud, **ops** memasang password-nya sekali:

```sql
alter role sg_app with login password '<dari secret manager>';
```

API memakai `DATABASE_URL` dengan user `sg_app`. `DATABASE_ADMIN_URL` (pemilik tabel) **hanya** untuk job migrasi dan tidak boleh ada di env API/web.

## Variabel lingkungan

### API

| Variabel                     | Staging                                  | Produksi                       | Rahasia |
| ---------------------------- | ---------------------------------------- | ------------------------------ | ------- |
| `NODE_ENV`                   | `production`                             | `production`                   |         |
| `WEB_ORIGIN`                 | `https://staging.sportgather.id`         | `https://app.sportgather.id`   |         |
| `TRUST_PROXY`                | CIDR subnet web                          | CIDR subnet web                |         |
| `DATABASE_URL`               | `postgres://sg_app:…@…/sportgather`      | sama                           | ✅      |
| `REDIS_URL`                  | `rediss://…`                             | sama                           | ✅      |
| `AUTH_SECRET`                | acak ≥ 48 karakter                       | acak, **beda** dari staging    | ✅      |
| `DOCUMENT_ENCRYPTION_KEY`    | `openssl rand -base64 32`                | beda dari staging; **jangan hilang** (dokumen tak bisa dibuka) | ✅ |
| `STORAGE_PROVIDER`           | `s3`                                     | `s3`                           |         |
| `S3_ENDPOINT` / `S3_REGION`  | endpoint S3 `ap-southeast-3`             | sama                           |         |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | IAM user/role khusus bucket         | sama                           | ✅      |
| `S3_BUCKET`                  | `sportgather-staging-documents`          | `sportgather-documents`        |         |
| `PAYMENT_PROVIDER`           | `real` (sandbox)                         | `real`                         |         |
| `MIDTRANS_SERVER_KEY`        | `SB-Mid-server-…`                        | `Mid-server-…`                 | ✅      |
| `MIDTRANS_IS_PRODUCTION`     | `false`                                  | `true`                         |         |
| `PAYOUT_PROVIDER`            | `real` setelah Iris aktif                | `real`                         |         |
| `WHATSAPP_PROVIDER` / `SMS_PROVIDER` | `real` setelah BSP dipilih (plan #10) | `real`                 |         |
| `BANK_VERIFICATION_PROVIDER` | `real`                                   | `real`                         |         |
| `PUSH_PROVIDER` + `VAPID_*`  | `real` + kunci dari `vapid:generate`     | kunci **beda** dari staging    | ✅ (private) |
| `JOBS_ENABLED`               | `true` di satu instance                  | sama                           |         |
| `RATE_LIMIT_PER_MIN`         | `300`                                    | `300`                          |         |
| `PLATFORM_FEE`, `WITHDRAWAL_*`, `QRIS_SERVICE_FEE_ENABLED`, `SETTLEMENT_DELAY_HOURS` | sesuai kebijakan (ADR-016) | sama | |

> **Staging selama vendor belum siap:** production mode tidak mengizinkan provider mock. Selama WhatsApp/SMS/Iris belum ada, staging dijalankan dengan `NODE_ENV=development` **dan** tetap di belakang LB + TLS. Konsekuensinya endpoint `/v1/dev/*` (outbox OTP) aktif, jadi batasi akses staging (allowlist IP kantor/VPN di LB) dan jangan isi data asli.

### Web

| Variabel  | Nilai                                       |
| --------- | ------------------------------------------- |
| `API_URL` | URL internal API, mis. `http://api.internal:4000` |

## Midtrans

1. Dashboard (sandbox/produksi) › _Settings › Payment › Notification URL_: `https://<domain>/api/webhooks/midtrans`.
2. _Finish/Unfinish/Error redirect_ tidak perlu diisi (API mengirim `finishUrl` per transaksi).
3. Setelah deploy, cek dengan `pnpm --filter api midtrans:check` (sandbox saja) lalu satu pembayaran simulator. Status harus lunas lewat **webhook** (lihat log `checkout.paid`), bukan hanya lewat rekonsiliasi 15 menit.

## Data demo di staging

Staging boleh diisi data **fiktif** dengan `pnpm --filter api seed:demo` (butuh mode non-production, lihat catatan di atas). Data asli akademi diimpor lewat A-04 di produksi, **bukan** lewat seed.

## Checklist go-live pilot

- [ ] Penyedia cloud & region Jakarta dikonfirmasi; domain + TLS aktif
- [ ] Secret dibuat di secret manager (tidak ada nilai bawaan); `DOCUMENT_ENCRYPTION_KEY` dibackup terpisah
- [ ] `pnpm db:migrate` sukses; password `sg_app` dipasang
- [ ] `/health/ready` hijau di LB; hanya satu instance dengan `JOBS_ENABLED=true`
- [ ] Bucket dokumen privat, SSE, versioning, block public access
- [ ] Backup Postgres + PITR aktif dan **restore pernah diuji** (lihat runbook)
- [ ] Webhook Midtrans terverifikasi (signature cocok); `QRIS_SERVICE_FEE_ENABLED=false` (biaya QRIS ditanggung SportGather, ADR-033)
- [ ] Iris & BSP WhatsApp aktif → semua provider `real`, `NODE_ENV=production`
- [ ] Pentest eksternal & review UU PDP selesai (`docs/security-checklist.md`)
- [ ] Alert minimum aktif (lihat runbook)
