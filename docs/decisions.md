# Keputusan teknis (ADR singkat)

Format: **ADR-NNN · Judul** — Status · Konteks · Keputusan · Konsekuensi.

---

## ADR-001 · Stack mengikuti rekomendasi PRD
**Status:** Diusulkan (menunggu persetujuan `docs/plan.md`)
**Konteks:** PRD bagian 13 dan prompt awal merekomendasikan pnpm + Turborepo, Next.js PWA, NestJS, PostgreSQL + Drizzle, Redis/BullMQ, dan storage S3.
**Keputusan:** Pakai stack ini tanpa perubahan.
**Konsekuensi:** Tim memakai satu bahasa (TypeScript) dari ujung ke ujung, dan skema Zod dipakai bersama oleh web dan API.

## ADR-002 · Isolasi tenant dengan RLS + konteks per transaksi
**Status:** Diusulkan
**Keputusan:** Role runtime `sg_app` tidak punya BYPASSRLS, dan semua tabel tenant memakai `FORCE ROW LEVEL SECURITY`. Konteks dipasang dengan `set_config('app.org_id', …, true)` di dalam transaksi per request. `person` bersifat lintas tenant, dan visibilitasnya diatur lewat `membership` / `guardian_link`.
**Konsekuensi:** Setiap akses DB harus lewat `withTenant()`. Tes isolasi membaca daftar tabel tenant langsung dari skema.

## ADR-003 · Pembayaran gabungan lewat checkout
**Status:** Diterima (24 Nov 2026)
**Keputusan:** `order_id` Midtrans adalah ID checkout ditambah suffix percobaan. Satu checkout memuat 1..n tagihan, dan biaya layanan wali menjadi baris terpisah di checkout, bukan bagian dari tagihan.
**Konsekuensi:** Pendapatan klub per tagihan tidak terpengaruh oleh biaya layanan. Ledger mencatat biaya layanan, biaya Midtrans, dan bagian klub secara terpisah.

## ADR-004 · Diskon saudara ditunda
**Status:** Diterima (24 Nov 2026)
**Keputusan:** Diskon saudara tidak dibuat di MVP; potongan yang tersedia hanya beasiswa 0–100%.

---

## Selisih PRD ↔ desain Figma

Aturan: bila ada selisih, yang diikuti adalah PRD.

| # | Topik | PRD | Desain | Diikuti |
| --- | --- | --- | --- | --- |
| D-1 | Nama produk | "KlubKU (nama kerja)" | SportGather | SportGather (prompt awal juga memakai nama ini) |
| D-2 | Override play-down | Bagian 4: admin · US-06: owner | A-10: owner | **Owner** (diputuskan 24 Nov 2026) |
| D-3 | Kelompok KU | KU7 (6–7 th), KU8/KU10, … | Hanya KU8–KU16 | Default KU8–KU16; **KU7 opsional** (diputuskan) |
| D-4 | `order_id` Midtrans | ID tagihan + suffix | O-05: satu bayar untuk 2 anak | **Checkout multi-tagihan** (diputuskan) |
| D-5 | Penyaluran | Split = dibagi per transaksi | A-15: "Cair Jumat" (batch mingguan) | Ledger per tanggal settlement (plan Q7) |
| D-6 | Login staf | Email + password + 2FA | Pelatih login OTP WhatsApp | OTP semua peran + email opsional owner/admin (plan Q6) |
| D-7 | Biaya gateway | Pilihan klub: dibebankan ke wali atau klub | O-05 tidak menampilkan biaya | **Wali bayar biaya transaksi + owner bayar biaya penarikan** (diputuskan); O-05 perlu baris "Biaya layanan" |
| D-8 | Diskon saudara | FEE-01, US-10: otomatis | A-13, O-03, O-05 menampilkan diskon saudara | **Ditunda, tidak ada di MVP** (diputuskan) |

Angka di desain (fee Midtrans 1%, fee platform Rp2.500, nama pemain dan wali) adalah contoh fiktif. Angka tersebut tidak dipakai sebagai konstanta maupun seed produksi.
