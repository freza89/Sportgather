# Checklist keamanan (M6)

Ringkasan OWASP ASVS 4.0 **Level 2** untuk SportGather MVP. Kolom **Bukti** menunjuk ke kode atau tes yang menegakkannya. Checklist ini bukan pengganti **pentest eksternal**. Pentest tetap syarat DoD (PRD bagian 17 butir 2), begitu juga review legal UU PDP.

Status: ✅ terpenuhi · ⚠️ sebagian / perlu tindakan ops · ⏳ di luar kode (proses)

## V1 Arsitektur

| #   | Kontrol                                     | Status | Bukti / catatan                                                                                                       |
| --- | ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Isolasi tenant ditegakkan di database       | ✅     | RLS + `withTenant` per transaksi (ADR-002, ADR-018); `packages/db/src/rls.test.ts`; e2e `m6-pilot` isolasi tenant     |
| 1.2 | Aplikasi tidak berjalan sebagai superuser   | ✅     | API menolak start bila role DB bisa melewati RLS (ADR-013; `health.test.ts`)                                          |
| 1.3 | Konfigurasi tidak aman ditolak saat start   | ✅     | `config/env.ts`: production menolak provider mock, secret bawaan, storage memory, `WEB_ORIGIN` non-https, `TRUST_PROXY` kosong |
| 1.4 | Endpoint dev tidak ada di production        | ✅     | `DevModule` hanya dimuat bila `NODE_ENV≠production` dan WhatsApp mock (`app.module.ts`)                               |

## V2 Autentikasi

| #   | Kontrol                                  | Status | Bukti / catatan                                                                                         |
| --- | ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 2.1 | OTP: kedaluwarsa, batas coba, batas kirim | ✅     | Berlaku 5 menit, maks. 5 percobaan, kirim ulang ≥30 detik, maks. 5 kode/jam per nomor (`otp.service.ts`) |
| 2.2 | Kode OTP disimpan sebagai hash           | ✅     | HMAC dengan `AUTH_SECRET` + id challenge                                                                |
| 2.3 | Tidak membocorkan keberadaan akun        | ✅     | Respons login sama untuk nomor terdaftar/tidak; kode hanya dikirim ke nomor terdaftar                   |
| 2.4 | Password (opsional owner/admin) di-hash  | ✅     | scrypt + salt (`auth/crypto.ts`)                                                                        |
| 2.5 | Rate limit per IP                        | ✅     | `@fastify/rate-limit`, `RATE_LIMIT_PER_MIN` (default 300). IP diambil dari proxy tepercaya saja (`TRUST_PROXY`, ADR-030) |
| 2.6 | 2FA owner/admin                          | ⚠️     | Belum ada (pertanyaan terbuka #6 di plan). Disarankan sebelum rilis umum, bukan syarat pilot            |

## V3 Sesi

| #   | Kontrol                                   | Status | Bukti / catatan                                                                   |
| --- | ----------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| 3.1 | Token sesi acak & disimpan sebagai hash   | ✅     | `session.service.ts` (`randomToken`, `hashToken`)                                 |
| 3.2 | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` | ✅     | `Secure` aktif di production                                                     |
| 3.3 | Logout mencabut sesi di server            | ✅     | `POST /v1/auth/logout`                                                            |
| 3.4 | Masa berlaku sesi                         | ✅     | `SESSION_DAYS` (default 30)                                                       |

## V4 Kontrol akses

| #   | Kontrol                             | Status | Bukti / catatan                                                                       |
| --- | ----------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| 4.1 | RBAC per peran di setiap endpoint   | ✅     | `@RequirePermission` + `packages/shared/src/auth/rbac.ts`; tes 403 di m1–m5           |
| 4.2 | Pelatih hanya tim yang dipegang     | ✅     | `m3.test.ts`, `m5.test.ts`                                                            |
| 4.3 | Wali hanya data anaknya             | ✅     | `m4.test.ts` (checkout tagihan orang lain → 404), `m5.test.ts`                        |
| 4.4 | Perlindungan CSRF                   | ✅     | Cookie `SameSite=Lax` + body JSON; CORS hanya `WEB_ORIGIN` dengan credentials         |

## V5 Validasi input

| #   | Kontrol                        | Status | Bukti / catatan                                                 |
| --- | ------------------------------ | ------ | --------------------------------------------------------------- |
| 5.1 | Validasi skema di setiap body  | ✅     | Zod (`ZodPipe`) dengan kontrak di `packages/shared`             |
| 5.2 | Query SQL berparameter         | ✅     | Drizzle; template `sql` berparameter                            |
| 5.3 | Unggahan: ukuran & tipe        | ✅     | Maks. 5 MB/berkas, deteksi magic bytes (`storage/storage.ts`)  |

## V6–V9 Data & kriptografi

| #   | Kontrol                                  | Status | Bukti / catatan                                                                         |
| --- | ---------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| 6.1 | Dokumen anak dienkripsi saat disimpan    | ✅     | AES-256-GCM di aplikasi, dibuka lewat API (ADR-019)                                     |
| 6.2 | Secret dari env/secret manager, bukan repo | ✅   | `.env` di-ignore; CI menjalankan **gitleaks** atas seluruh riwayat                      |
| 8.1 | Data pribadi minimal di log              | ✅     | Nomor dimasking di log outbox                                                           |
| 8.2 | Hak data wali (unduh & hapus)            | ✅     | ADR-029; `m5.test.ts`                                                                   |
| 9.1 | TLS di semua koneksi publik              | ⚠️     | Ops: TLS di load balancer; HSTS dikirim web. Lihat `docs/deploy.md`                     |

## V10–V14 Konfigurasi & dependensi

| #    | Kontrol                                 | Status | Bukti / catatan                                                                                |
| ---- | --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| 10.1 | Audit dependensi otomatis               | ✅     | CI: `pnpm audit --prod --audit-level high`                                                     |
| 13.1 | Webhook pembayaran diverifikasi         | ✅     | Signature SHA-512 Midtrans + idempoten (ADR-024; `m4.test.ts`)                                 |
| 14.1 | Header keamanan web                     | ✅     | CSP, `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy, HSTS (`next.config.ts`; e2e `m6-pilot`) |
| 14.2 | Header keamanan API                     | ✅     | `@fastify/helmet` (CSP aktif di production)                                                    |
| 14.3 | Tidak membocorkan versi server          | ✅     | `poweredByHeader: false`; e2e memastikan tidak ada `x-powered-by`                              |
| 14.4 | Audit trail aksi sensitif               | ✅     | Tabel audit (`auditLog`): rekening, checkout/pembayaran, dokumen dilihat, ekspor Tabel `audit_log` (override play-down, beasiswa, penarikan dana, hapus data, dll.) hapus data, perubahan staf/pemain, dll.             |

## Sisa pekerjaan sebelum pilot dengan uang sungguhan

1. ⏳ **Pentest eksternal**, tanpa temuan kritis/tinggi.
2. ⏳ **Review legal UU PDP** (persetujuan wali, retensi, DPO).
3. ⚠️ Signature webhook Midtrans sandbox belum cocok dengan key di `.env`. Cocokkan dengan _Settings › Access Keys_ (job rekonsiliasi 15 menit sudah jadi jaring pengaman).
4. ✅ Biaya QRIS: ditanggung SportGather (ADR-033).
5. ⚠️ CSP masih memakai `'unsafe-inline'` untuk skrip (hidrasi Next tanpa nonce). Bisa diperketat dengan nonce lewat middleware setelah pilot.
