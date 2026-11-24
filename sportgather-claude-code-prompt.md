# Prompt awal Claude Code — SportGather MVP

> Cara pakai:
> 1. Buat folder repo kosong, misalnya `sportgather/`.
> 2. Ekspor PRD (Docs → Download → Markdown) dan simpan sebagai `docs/PRD.md` di repo.
> 3. Kalau Figma MCP sudah tersambung di Claude Code, biarkan link Figma di bawah. Kalau belum, hapus bagian Figma atau tambahkan screenshot layar ke `docs/design/`.
> 4. Jalankan `claude` di folder repo, lalu tempel semua teks di bawah garis.

---

Kamu adalah tech lead yang memulai pengembangan **SportGather**, SaaS manajemen klub olahraga usia muda (KU7–KU16) untuk pasar Indonesia. Sport pertama: basket. Pilot: **Belajar Basket Akademi** (Bandung).

## Sumber kebenaran
- **PRD:** `docs/PRD.md`. Baca seluruhnya sebelum menulis kode. Bagian terpenting: 4 (konsep multi-klub & aturan KU), 5 (kebutuhan fungsional + prioritas), 7 (model data & RBAC), 8 (non-fungsional), 12 (keputusan), 13 (arsitektur), 14 (daftar layar), 15 (user story & kriteria penerimaan), 16 (notifikasi), 17 (lingkup pilot & definisi selesai).
- **Desain UI:** Figma `https://www.figma.com/design/vwWLfX9ncQFJK9g94jlAdl` (file key `vwWLfX9ncQFJK9g94jlAdl`).
  - Halaman `00 · Design System`: token warna, tipografi (Plus Jakarta Sans), ikon, komponen.
  - Halaman `01 · Admin (Desktop)`, `02 · Pelatih (Mobile)`, `03 · Orang Tua (Mobile)`: layar dengan kode A-xx / P-xx / O-xx yang sama dengan PRD bagian 14.
  - Halaman `04 · User Flow`: alur per peran.
  - Data di desain adalah contoh fiktif. Jangan jadikan seed produksi.

Kalau PRD dan desain bertentangan, ikuti PRD dan catat perbedaannya di `docs/decisions.md`.

## Keputusan yang sudah final (jangan diubah tanpa bertanya)
- **Platform:** satu web app PWA untuk tiga peran (admin/owner desktop-first, pelatih & orang tua mobile-first). Tidak ada aplikasi native di MVP.
- **Multi-tenant:** satu klub = satu tenant. Satu orang (wali/pelatih) bisa terhubung ke banyak klub dengan satu akun.
- **Pembayaran:** Midtrans. Satu akun Midtrans milik platform. Skema utama penyaluran dana: **Midtrans Transaction Split**. Cadangan: **Midtrans Iris**. Bangun di balik satu antarmuka `PayoutProvider` agar skema bisa diganti tanpa mengubah modul tagihan.
- **Tanggal acuan KU:** mengikuti tanggal kompetisi. Disimpan per kompetisi; tim latihan memakai kompetisi utama musim itu; cadangan 31 Desember bila belum ada kompetisi.
- **Tidak ada integrasi Pengprov/Pengcab Perbasi** di MVP. Ekspor daftar pemain cukup Excel/PDF generik.
- **Notifikasi utama:** WhatsApp Business API lewat BSP resmi (template disetujui Meta), push sebagai pelengkap. Login wali via OTP WhatsApp (cadangan SMS).

## Stack (rekomendasi PRD; boleh usulkan alternatif dengan alasan sebelum mulai)
- Monorepo **pnpm + Turborepo**, TypeScript strict di semua paket.
- `apps/web`: **Next.js (App Router) + TypeScript**, PWA (manifest + service worker), Tailwind dengan token dari Figma Design System, IndexedDB untuk antrean absensi offline.
- `apps/api`: **NestJS** (modular monolith), REST + OpenAPI.
- `packages/db`: **PostgreSQL** + **Drizzle ORM** + migrasi. Isolasi tenant dengan **Row-Level Security** (`current_setting('app.org_id')`) dan tes otomatis yang membuktikan data klub A tidak terbaca dari klub B.
- `packages/shared`: tipe, validasi (Zod), dan **mesin KU** (pure function, tanpa I/O).
- Redis + BullMQ untuk job (terbit tagihan, pengingat, penyaluran, retry webhook).
- Object storage kompatibel S3 untuk dokumen usia (enkripsi server-side, signed URL berumur pendek).
- Docker Compose untuk lokal (Postgres, Redis, MinIO). Vitest/Jest untuk unit, Playwright untuk e2e.

## Aturan bisnis yang wajib benar
- **KU:** KU-N berisi pemain yang berusia **di bawah N tahun** pada tanggal acuan (PRD bagian 4). Kelompok default dua tahunan: KU8, KU10, KU12, KU14, KU16 (KU7 untuk 6–7 th), dapat dikonfigurasi per klub/kompetisi. Buat aturan usia **dapat dikonfigurasi** (`UNDER_N` default, `MAX_N` opsional) karena konvensi kompetisi bisa berbeda. Tulis unit test untuk batas tanggal (ulang tahun tepat di tanggal acuan, 29 Februari, play-up, play-down diblokir tanpa override owner).
- **Tagihan:** satu pemain satu paket iuran aktif; diskon saudara otomatis dari data wali (anak ke-2 dst); beasiswa 0–100%; tidak ada tagihan ganda per periode; pemain cuti tidak ditagih.
- **Pembayaran:** status lunas hanya dari webhook Midtrans yang `signature_key`-nya terverifikasi lalu dicek ulang via API status; pemrosesan **idempoten**. `order_id` = ID tagihan internal (+ suffix percobaan).
- **Uang:** simpan nominal sebagai integer rupiah (bigint), bukan float. Setiap rupiah penyaluran harus bisa ditelusuri ke tagihan asalnya.
- **Privasi anak (UU PDP):** persetujuan wali tercatat (siapa, kapan, versi); dokumen usia hanya bisa dibuka owner/admin; setiap akses dokumen dan aksi sensitif masuk audit log; tidak ada DM pelatih → pemain di bawah 13 tahun.
- **RBAC:** owner, admin, pelatih, team manager, wali (PRD bagian 7). Pelatih hanya melihat tim sendiri.

## Cara kerja yang saya minta
1. **Jangan langsung coding.** Baca PRD dan desain, lalu tulis `docs/plan.md` berisi: arsitektur folder, skema database awal (ERD dalam Mermaid), daftar milestone dengan mapping ke ID kebutuhan (ORG-01, FEE-03, dst.) dan user story (US-01 s.d. US-18), serta pertanyaan/ambiguitas yang kamu temukan. **Berhenti dan tunggu persetujuan saya.**
2. Setelah disetujui, kerjakan **per milestone**. Di akhir tiap milestone: semua tes lulus, lint & typecheck bersih, ringkasan perubahan, cara menjalankan, dan daftar hal yang belum. Lalu berhenti untuk review.
3. Commit kecil dan deskriptif (Conventional Commits). Jangan commit secret; pakai `.env.example`.
4. Kalau ragu soal aturan bisnis, **tanya**, jangan mengarang. Catat semua keputusan teknis di `docs/decisions.md` (format ADR singkat).
5. Bahasa UI: Bahasa Indonesia, format Rupiah `Rp350.000`, tanggal `12 Okt 2027`, zona waktu per cabang (WIB/WITA/WIT).

## Urutan milestone yang saya harapkan (sesuaikan di plan)
- **M0 — Fondasi:** monorepo, Docker Compose, CI (lint, typecheck, test), design tokens dari Figma ke Tailwind, komponen dasar (Button, Badge, Input, Avatar, NavItem, TabItem, Logo), layout admin (sidebar) dan mobile (bottom nav).
- **M1 — Tenant, auth, RBAC:** organisasi, cabang, staf & undangan (A-01, A-02, A-03), login OTP (O-02) dengan provider WhatsApp yang di-mock, RLS + tes isolasi tenant, audit log.
- **M2 — Pemain & KU:** musim & kompetisi (A-05), mesin KU + tes, impor Excel (A-04), pendaftaran online wali (O-01), verifikasi dokumen (A-08), tim & penempatan (A-09, A-10), kenaikan KU (A-11).
- **M3 — Jadwal & absensi:** jadwal berulang & libur (A-12), RSVP via link bertoken (O-04), absensi pelatih offline-first (P-01, P-02).
- **M4 — Iuran & pembayaran:** paket iuran (A-13), terbit tagihan otomatis (A-14), Midtrans Snap sandbox + webhook idempoten (O-05, O-06), `PayoutProvider` (Split + Iris stub) dan laporan penyaluran (A-15).
- **M5 — Komunikasi, pembinaan, laporan:** pengumuman & matriks notifikasi (A-16, P-05, PRD bagian 16), penilaian skill & rapor PDF (P-04, O-07), dashboard owner & ekspor (A-17, A-18), profil & hak data wali (O-08).
- **M6 — Siap pilot:** seed data uji Belajar Basket Akademi (fiktif), e2e satu siklus penuh di staging (tagihan terbit → bayar Midtrans sandbox → lunas → dana tercatat untuk disalurkan), checklist keamanan, dokumentasi deploy.

## Integrasi eksternal
- Semua integrasi (Midtrans, WhatsApp BSP, SMS, storage) di balik interface + implementasi **mock** untuk lokal/tes, dan implementasi nyata yang aktif lewat env var.
- Midtrans: pakai sandbox. Fitur Transaction Split belum dikonfirmasi tersedia untuk model kita; buat implementasinya terisolasi dan tandai TODO sampai konfirmasi dari Midtrans keluar.
- Jangan pernah menaruh server key produksi di repo.

Mulai sekarang dengan langkah 1: baca `docs/PRD.md` dan file Figma, lalu buat `docs/plan.md`.
