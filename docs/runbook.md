# Runbook operasional

Panduan untuk menangani masalah saat pilot berjalan. Setiap bagian berisi **gejala → cek → tindakan**. Semua query SQL dijalankan dengan koneksi admin (read-only bila memungkinkan) dan **selalu** dibatasi `org_id`.

## Kontak & eskalasi

| Hal                        | Pemilik                      | Kanal                             |
| -------------------------- | ---------------------------- | --------------------------------- |
| Aplikasi down / error 5xx  | Tim teknis on-call           | _isi: grup WhatsApp/PagerDuty_    |
| Pembayaran & penarikan     | Tim teknis + finance         | Midtrans support (dashboard › Help) |
| Pertanyaan admin akademi   | Customer success             | _isi_                             |
| Insiden data pribadi       | DPO + tim teknis             | lihat "Insiden data pribadi"      |

## Alert minimum

| Alert                                                   | Ambang                   |
| ------------------------------------------------------- | ------------------------ |
| `/health/ready` gagal di LB                             | 2 cek berturut-turut     |
| Rasio 5xx API                                           | > 2% selama 5 menit      |
| Log `Signature notifikasi Midtrans tidak cocok`         | ≥ 1 per jam              |
| Log `checkout.amount_mismatch` (audit)                  | ≥ 1                      |
| Job BullMQ `failed` (log worker)                        | ≥ 3 per jam              |
| CPU database                                            | > 80% selama 15 menit    |
| Penarikan berstatus `failed`                            | ≥ 1                      |

## Pembayaran

### Wali sudah bayar, tagihan masih "Menunggu"

1. **Cek** status di dashboard Midtrans berdasarkan `order_id` (format `SG-<checkoutId>-<percobaan>`).
2. Kalau di Midtrans `settlement`/`capture`: job rekonsiliasi (tiap 15 menit, butuh `JOBS_ENABLED=true` di satu instance) akan menandainya lunas otomatis. Wali juga bisa membuka ulang halaman status bayar, yang langsung mengecek Status API.
3. Kalau setelah 30 menit masih menunggu: cek log API untuk `Signature notifikasi Midtrans tidak cocok`. Penyebab paling umum adalah server key di env **tidak sama** dengan key aktif di dashboard (_Settings › Access Keys_). Perbaiki secret lalu restart API.
4. **Jangan** mencatat pembayaran manual untuk transaksi online. Itu membuat ledger ganda. Pembayaran manual (US-14) hanya untuk tunai/transfer langsung ke akademi.

### `checkout.amount_mismatch`

Nominal dari Midtrans tidak sama dengan checkout. Ini berarti ada kemungkinan manipulasi atau bug. Tagihan **tidak** ditandai lunas. Cocokkan dengan dashboard Midtrans, eskalasi ke tim teknis, dan jangan ubah data secara manual sebelum penyebabnya jelas.

### Webhook dikirim berkali-kali

Ini normal. Pemrosesan webhook idempoten (ADR-024), jadi tidak perlu tindakan.

## Penarikan dana (Iris)

- **`failed`**: saldo otomatis dikembalikan lewat entri ledger balik. Lihat `failure_reason` di tabel `withdrawal`. Penyebab umum: rekening tidak valid atau saldo Iris kurang. Owner bisa menarik ulang setelah penyebabnya diperbaiki.
- **Macet (bukan `completed`/`failed`) > 1 jam**: proses API mungkin mati di antara panggilan Iris dan penyimpanan hasil. Cek di dashboard Iris berdasarkan `reference` = id penarikan:
  - kalau sudah terkirim di Iris: tandai `completed` lewat SQL admin dan catat di audit/insiden;
  - kalau tidak ada di Iris: tandai `failed` dan tambahkan entri ledger balik yang sama seperti kode (`kind='withdrawal'`, `amount` = nilai penarikan). Lakukan berdua (four-eyes).

## Login / OTP

| Gejala                              | Tindakan                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Kode WhatsApp tidak sampai          | Setelah 30 detik pengguna bisa memilih "Kirim lewat SMS". Cek status BSP WhatsApp.                         |
| "Terlalu banyak permintaan kode"    | Batas 5 kode/jam per nomor. Tunggu 1 jam; jangan dihapus manual kecuali ada indikasi bug.                  |
| Banyak `otp_requested_unknown` dari satu IP | Indikasi enumerasi/spam. Rate limit per IP sudah aktif; blokir IP di LB/WAF bila berlanjut.         |
| Semua pengguna tiba-tiba logout     | Kemungkinan `AUTH_SECRET` berubah. Kembalikan nilai lama dari secret manager bila tidak disengaja.         |

## Job terjadwal

Job: penerbitan tagihan (tiap jam), pengingat tagihan (09.00–21.00 WIB), pengingat RSVP H-1 17.00, pengumuman terjadwal, dan rekonsiliasi pembayaran (15 menit).

- **Tidak ada pengingat terkirim**: pastikan tepat **satu** instance API punya `JOBS_ENABLED=true` dan Redis bisa dijangkau. Log `BillingJobs` (mis. `Tagihan terbit: …`) menandakan worker berjalan.
- **Pengingat terkirim dua kali**: lebih dari satu instance punya `JOBS_ENABLED=true`. Matikan di instance lain. Penerbitan tagihan sendiri aman dijalankan paralel (idempoten).
- **Tagihan bulan ini belum terbit**: admin bisa menekan **Terbitkan iuran** di A-14. Tombol ini aman diklik berulang.

## Database

### Backup & restore

- Backup otomatis harian + PITR (staging 7 hari, produksi 30 hari).
- **Uji restore** sebelum go-live, lalu tiap bulan: restore ke instance baru, jalankan `pnpm db:migrate` (harus no-op), arahkan staging ke sana, dan pastikan login + daftar pemain berjalan.
- Restore produksi: buat instance dari titik waktu sebelum insiden → hentikan API (`desired count 0`) → ganti `DATABASE_URL` → jalankan API → umumkan ke admin akademi bahwa data setelah titik itu perlu diinput ulang (cek pembayaran Midtrans di rentang itu, karena status checkout yang hilang akan diperbaiki oleh rekonsiliasi).

### Migrasi gagal di tengah rilis

Migrasi yang tertunda dijalankan dalam transaksi, jadi kegagalan tidak meninggalkan skema setengah jadi. Kalau gagal: **jangan** deploy API versi baru. Perbaiki migrasinya, lalu jalankan ulang. API versi lama tetap berjalan karena migrasi bersifat maju dan kompatibel.

## Rotasi secret

| Secret                    | Dampak rotasi                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`             | Kode OTP & link bertoken yang sedang berlaku menjadi tidak valid. Rotasi di luar jam sibuk.        |
| `MIDTRANS_SERVER_KEY`     | Ganti di dashboard dan env **bersamaan**; transaksi lama tetap bisa direkonsiliasi via Status API. |
| `DOCUMENT_ENCRYPTION_KEY` | **Tidak bisa dirotasi tanpa re-enkripsi semua dokumen.** Simpan kunci lama. Butuh skrip migrasi khusus (belum ada). |
| Password `sg_app`         | `alter role sg_app password …` lalu restart API dengan `DATABASE_URL` baru.                       |
| Kunci VAPID               | Semua langganan push harus didaftarkan ulang oleh wali (aktifkan lagi di Profil).                 |

## Permintaan hapus data (UU PDP)

Permintaan wali muncul di **Pengaturan › Data & privasi**. Owner menyetujui atau menolak di sana (ADR-029). Pantau supaya tidak ada permintaan yang menggantung lebih dari **3×24 jam**. Tagihan dan pembayaran yang sudah lunas tetap disimpan dalam bentuk de-identifikasi untuk kewajiban pembukuan.

## Insiden data pribadi

1. Batasi dampak: cabut sesi terkait (isi `revoked_at` pada baris `session`), rotasi secret yang bocor, blokir akses.
2. Kumpulkan bukti: `audit_log` dan `auth_event` (append-only), log LB.
3. Libatkan DPO. UU PDP mewajibkan pemberitahuan tertulis ke subjek data dan lembaga paling lambat **3×24 jam** setelah kegagalan pelindungan data diketahui.
4. Tulis post-mortem tanpa menyalahkan individu.

## Data demo

`pnpm --filter api seed:demo` mengisi klub fiktif "Belajar Basket Akademi" (owner `081299000001`, wali `081299100001`–`081299100024`). **Jangan** jalankan di database produksi. Skrip menolak jalan bila `NODE_ENV=production` atau klubnya sudah ada.
