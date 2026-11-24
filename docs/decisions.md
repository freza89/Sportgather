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
| D-5 | Penyaluran | Split = dibagi per transaksi | A-15: "Cair Jumat" (batch mingguan) | **Penarikan manual oleh owner** (ADR-016); A-15 menampilkan saldo dapat ditarik + tombol "Tarik dana" |
| D-6 | Login staf | Email + password + 2FA | Pelatih login OTP WhatsApp | OTP semua peran + email opsional owner/admin (plan Q6) |
| D-7 | Biaya gateway | Pilihan klub: dibebankan ke wali atau klub | O-05 tidak menampilkan biaya | **Wali bayar biaya transaksi + owner bayar biaya penarikan** (diputuskan); O-05 perlu baris "Biaya layanan" |
| D-8 | Diskon saudara | FEE-01, US-10: otomatis | A-13, O-03, O-05 menampilkan diskon saudara | **Ditunda, tidak ada di MVP** (diputuskan) |

Angka di desain (fee Midtrans 1%, fee platform Rp2.500, nama pemain dan wali) adalah contoh fiktif. Angka tersebut tidak dipakai sebagai konstanta maupun seed produksi.

---

## ADR-005 · SeaweedFS sebagai S3 lokal (pengganti MinIO)
**Status:** Diterima (M0, 24 Nov 2026)
**Konteks:** Image `minio/minio` dan `quay.io/minio/minio` tidak bisa lagi di-pull karena MinIO berhenti merilis image Docker komunitas.
**Keputusan:** Docker Compose lokal memakai `chrislusf/seaweedfs:4.55` dengan gateway S3 di port 59000; kredensial dev disimpan di `infra/seaweedfs-s3.json`.
**Konsekuensi:** Kode aplikasi hanya bicara lewat API S3 (interface storage), jadi produksi tetap bisa memakai object storage region Jakarta apa pun.

## ADR-006 · Versi tooling
**Status:** Diterima (M0)
**Keputusan:**
- TypeScript dipasang di `~6.0`, karena `typescript-eslint` 8.74 baru mendukung `<6.1`.
- ESLint dipasang di `^9`, karena plugin di `eslint-config-next` 16 belum mendukung ESLint 10.
**Konsekuensi:** Naikkan versi setelah peer dependency mendukung; `pnpm peers check` harus bersih.

## ADR-007 · Ikon dari Figma sebagai komponen React
**Status:** Diterima (M0)
**Keputusan:** 34 SVG ikon diekspor dari Figma ke `packages/ui/assets/icons/`, lalu `pnpm --filter @sportgather/ui icons` menghasilkan komponen React. Geometri path tidak diubah; hanya warna stroke tetap `#0F1B3D` yang diganti `currentColor` agar ikon mengikuti state (NavItem/TabItem aktif vs default). Tidak memakai pustaka ikon pihak ketiga.

## ADR-008 · Cara paket internal dikonsumsi
**Status:** Diterima (M0)
**Keputusan:**
- `@sportgather/shared` dikompilasi ke `dist/` (ESM), karena dipakai oleh API (Node) dan web.
- `@sportgather/ui` hanya berupa source dan dikompilasi oleh Next lewat `transpilePackages`. Import di dalam paket UI ditulis tanpa ekstensi, karena Turbopack tidak memetakan `.js` → `.ts`.
- Turbo menjalankan `^build` sebelum `dev`, `typecheck`, `lint`, dan `test`.

## ADR-009 · Struktur URL per peran
**Status:** Diterima (M0)
**Keputusan:**
- Admin/owner: `/admin/[org]/…`
- Pelatih: `/pelatih/[org]/…`
- Wali: `/wali/…`. Tanpa slug klub, karena satu akun wali bisa terhubung ke banyak klub (PAR-01); klub dipilih di dalam halaman.
- Halaman publik `/daftar/[org]` (O-01), `/masuk` (O-02), dan `/t/[token]` (link bertoken) dibuat di milestone masing-masing.

## ADR-010 · Bahasa UI
**Status:** Diterima (M0)
**Keputusan:** MVP hanya berbahasa Indonesia. Format Rupiah, tanggal, jam, dan zona waktu ada di `@sportgather/shared`. Bahasa Inggris (PRD: opsional) ditunda; teks UI belum diekstrak ke katalog i18n.

---

## ADR-011 · Autentikasi & sesi (M1)
**Status:** Diterima (M1, 24 Nov 2026)
**Keputusan:**
- **Login utama untuk semua peran: OTP WhatsApp.**
  - Kode 6 digit, berlaku 5 menit, maks. 5 percobaan.
  - Maks. 5 permintaan per nomor per jam; jeda 30 detik sebelum kirim ulang.
  - Cadangan SMS setelah 30 detik (PRD bagian 13).
  - Kode disimpan sebagai HMAC terikat id challenge.
- **Email + kata sandi (scrypt) adalah opsi tambahan khusus owner/admin** (keputusan plan Q6). 2FA TOTP untuk opsi ini belum dibuat (lihat "Sisa M1" di bawah).
- **Sesi:** token acak di cookie `sg_session` (httpOnly, SameSite=Lax, Secure di produksi), berlaku 30 hari. Di database hanya disimpan SHA-256-nya, dan sesi bisa dicabut lewat logout.
- **Anti-enumerasi:** permintaan OTP untuk nomor yang belum terdaftar mendapat respons yang sama, tetapi kodenya tidak dikirim (juga menghemat biaya WhatsApp).
- **Web ↔ API:** browser memanggil `/api/*` di domain web; route handler Next meneruskannya ke API saat runtime. Cookie tetap first-party tanpa CORS, dan satu build bisa dipakai di semua lingkungan (rewrite Next dihitung saat build, jadi tidak dipakai).

## ADR-012 · Model akun & undangan staf
**Status:** Diterima (M1)
**Keputusan:**
- `person` + `user_account` (nomor WhatsApp unik) bersifat global; `staff_role` adalah tabel tenant.
- Mengundang staf dengan nomor baru langsung membuat person + akun. Undangan (token 7 hari, hanya SHA-256 yang disimpan) dikirim lewat WhatsApp. Penerimaan wajib login dengan nomor yang diundang.
- Pencarian undangan dari token dan cek ketersediaan slug memakai fungsi `SECURITY DEFINER` (`sg_find_invitation`, `sg_slug_taken`) dengan keluaran minimal, sehingga RLS tidak perlu dilonggarkan.
- Aturan peran:
  - Admin hanya bisa mengundang dan mengubah pelatih/team manager.
  - Tidak ada yang bisa mengubah atau menghapus perannya sendiri.
  - Klub selalu punya minimal satu owner.

## ADR-013 · Pengaman RLS saat start
**Status:** Diterima (M1)
**Keputusan:** API menolak start bila `DATABASE_URL` terhubung sebagai superuser atau role ber-BYPASSRLS. Migrasi memakai `DATABASE_ADMIN_URL` terpisah. Tes membuat database sementara `sg_test_*` per file tes; migrasinya digilir dengan advisory lock karena role `sg_app` berlaku untuk seluruh server.

## ADR-014 · Verifikasi rekening (FEE-08) di M1
**Status:** Diterima (M1)
**Keputusan:**
- Rekening diverifikasi lewat interface `BankVerifier`. Mock-nya: nomor berakhiran `0000` ditolak, berakhiran `9999` menunggu, sisanya lolos. Implementasi nyata (validasi rekening Iris/penerima Split) menyusul di M4.
- Hanya owner yang boleh mengganti rekening. Rekening lama ditandai `replaced`, sehingga hanya ada satu rekening aktif per klub (dijaga unique index).
- Perubahan rekening masuk audit log tanpa nomor lengkap.

## ADR-015 · Data `person` belum dilindungi RLS
**Status:** Diterima sementara (M1) — ditinjau di M2
**Konteks:** Di M1, `person`/`user_account` hanya berisi data staf dan wali (nama, nomor), dan semua akses lewat API dengan pengecekan peran.
**Keputusan:** Policy RLS untuk `person` (terlihat bila ada `membership` di klub aktif atau `guardian_link` dengan orang yang login) ditambahkan di M2, bersamaan dengan masuknya data anak.

---

## Selisih desain (tambahan M1)

| # | Topik | Desain | Implementasi |
| --- | --- | --- | --- |
| D-9 | A-01 data owner | Hanya "Nomor WhatsApp owner" | Ditambah "Nama lengkap" + verifikasi OTP di langkah 1, karena akun owner butuh nama dan nomor terverifikasi |
| D-10 | A-01/A-02 logo | Unggah logo | Ditampilkan nonaktif; unggah file dibuat bersama penyimpanan dokumen (M2) |
| D-11 | A-03 tombol "Undang staf" | Di kanan judul halaman | Di atas tabel staf (fungsi sama) |
| D-12 | A-03 kolom "Tim" | Nama tim pelatih | "—" sampai modul tim (M2) |
| D-13 | A-02 paket | Akademi Rp749.000 | Klub baru mulai di paket Starter (gratis); perubahan paket manual oleh tim SportGather selama pilot |

---

## ADR-016 · Penarikan dana manual & biaya layanan per metode
**Status:** Diterima (24 Nov 2026), menjadi acuan M4
**Konteks:** Keputusan Q5/Q13: wali menanggung biaya transaksi saat membayar, owner menanggung biaya transfer saat menarik dana. Owner memilih penarikan manual kapan saja.
**Keputusan:**
- **Saldo klub.** Bagian klub dari setiap pembayaran online masuk ke saldo klub di ledger. Saldo baru bisa ditarik setelah transaksinya settle di Midtrans.
- **Penarikan.** Owner menekan "Tarik dana" kapan saja; ada minimal penarikan yang bisa dikonfigurasi. Dana dikirim lewat Iris, dan biaya transfer dipotong dari jumlah yang ditarik. Penarikan ditolak bila rekening belum terverifikasi.
- **Biaya layanan wali.** Tarifnya dikonfigurasi per metode bayar (QRIS, VA, e-wallet). Biaya untuk QRIS bisa dimatikan lewat konfigurasi sambil menunggu konfirmasi Midtrans soal aturan Bank Indonesia. Bila dimatikan, biaya QRIS ditanggung klub dan dipotong dari saldo.
**Konsekuensi:**
- Skema ini adalah skema cadangan PRD (dana ditampung platform), sehingga risiko izin BI (PRD bagian 12, PBI No. 23/6/PBI/2021) harus dinilai konsultan hukum sebelum dibuka ke banyak klub.
- Dana klub dicatat terpisah per klub dan setiap rupiah bisa ditelusuri ke tagihannya (US-13).
- Antarmuka `PayoutProvider` tetap dipertahankan, sehingga Split masih bisa dipakai bila Midtrans mengonfirmasinya.
