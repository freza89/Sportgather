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
| D-14 | KU di desain | Campuran (Zaki 12 th → KU12, Raka 16 th → Lulus) | `MAX_N` (ADR-017): Raka 16 th tetap KU16 dan baru lulus pada usia 17 |
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

---

## ADR-017 · Aturan KU: "maksimal N tahun" (MAX_N)
**Status:** Diterima (25 Nov 2026)
**Konteks:** PRD bertentangan dengan dirinya sendiri. Teks bagian 4 menyebut "KU-N = di bawah N tahun", sedangkan tabel di bagian yang sama menyebut KU12 = 11–12 tahun, KU7 = 6–7 tahun. Desain pun campuran.
**Keputusan:**
- Default semua musim baru adalah `MAX_N`: KU-N berisi pemain berusia **maksimal N tahun** pada tanggal acuan. Dengan kelompok dua tahunan, KU12 = 11–12 tahun dan seterusnya.
- Pemain lebih tua dari kelompok tertua (17 tahun ke atas untuk KU16) berstatus "Lulus".
- `UNDER_N` tetap tersedia per musim/kompetisi bila penyelenggara memakai konvensi "di bawah N".
- Usia dihitung dalam tahun penuh pada tanggal acuan. Yang lahir 29 Februari bertambah usia pada 1 Maret di tahun bukan kabisat.

## ADR-018 · RLS untuk data orang (penutup ADR-015)
**Status:** Diterima (M2)
**Keputusan:**
- `person` hanya terbaca bila:
  - orang itu sendiri yang login;
  - ia anggota atau staf di klub aktif;
  - ia anak dari orang yang login; atau
  - ia wali dari anggota klub aktif.
- Aturan ini dievaluasi lewat fungsi `sg_person_visible` (SECURITY DEFINER, read-only).
- `guardian_link` hanya terbaca oleh walinya sendiri atau oleh klub tempat anaknya terdaftar.
- `person` boleh di-insert tanpa batas (pendaftaran/impor), tetapi id-nya wajib dibuat aplikasi karena `RETURNING` tunduk pada policy baca.
- `user_account` belum diberi RLS: tabel ini dipakai alur login sebelum ada konteks, dan hanya berisi nomor/email.

## ADR-019 · Dokumen usia: enkripsi aplikasi + dibuka lewat API
**Status:** Diterima (M2)
**Konteks:** PRD bagian 13 menyebut enkripsi server-side dan signed URL berumur pendek.
**Keputusan:**
- **Enkripsi:** file dienkripsi di aplikasi (AES-256-GCM, kunci `DOCUMENT_ENCRYPTION_KEY`) sebelum disimpan di object storage. Isi bucket tidak terbaca tanpa kunci aplikasi, siapa pun penyedia storage-nya.
- **Akses:** dokumen dibuka lewat endpoint API (`/documents/:id/content`, hanya owner/admin), yang mendekripsi isi dan mencatat `document.viewed` di audit log setiap kali dibuka. Tidak ada URL publik, termasuk signed URL. Respons diberi `Cache-Control: no-store`.
- **Validasi:** tipe file dideteksi dari isi (magic bytes JPG/PNG/PDF), bukan dari nama file; ukuran maks. 5 MB.
**Konsekuensi:** Rotasi kunci butuh re-enkripsi (dibuat sebelum produksi). Lalu lintas unduhan dokumen lewat API, tetapi volumenya kecil (hanya admin).

## ADR-020 · Alur pendaftaran online & verifikasi
**Status:** Diterima (M2)
**Keputusan:**
- Wali memverifikasi nomor WhatsApp lewat OTP di langkah 2 formulir. Akun dibuat otomatis, tanpa install aplikasi (US-03).
- Persetujuan pemrosesan data dicatat per anak: wali, waktu, IP, dan versi teks (`CONSENT_VERSION`).
- Pendaftar berstatus `pending`. Bila ditolak, statusnya menjadi `rejected` dengan alasan, dan wali mendapat WhatsApp. Wali bisa mengunggah ulang dari portal, lalu statusnya kembali `pending`.
- Anak yang sudah terhubung ke wali yang sama (mis. terdaftar di klub lain) dipakai ulang sebagai `person`, sehingga riwayat lintas klub terjaga (PRD bagian 7).
- Pemain hasil impor/tambah manual langsung `active` dengan status dokumen "Belum ada".

---

## Selisih desain (tambahan M2)

| # | Topik | Desain | Implementasi |
| --- | --- | --- | --- |
| D-15 | A-08 "Cocokkan data" | Kolom "Dokumen" terisi otomatis | Sistem tidak membaca isi akta (tanpa OCR). Admin mencentang kecocokan nama, tanggal lahir, dan gender, dan tombol verifikasi baru aktif setelah ketiganya dicentang |
| D-16 | Link/QR pendaftaran | QR disebut di PRD (REG-01) | Link + tombol salin di A-08. QR menyusul |
| D-17 | A-06 kolom "Iuran Okt" | Status iuran | Diganti kolom "Status" keanggotaan sampai modul iuran (M4) |
| D-18 | A-09/A-10 jadwal & kehadiran | Ditampilkan di kartu tim | Menyusul di M3 |
| D-19 | O-01 urutan langkah | Langkah 1 data anak + persetujuan, langkah 2 data wali | Sama, ditambah verifikasi OTP WhatsApp wali di langkah 2 dan langkah 3 "Tinjau & kirim" |

---

## ADR-021 · Waktu & jadwal berulang
**Status:** Diterima (M3)
**Keputusan:**
- **Waktu:** jam disimpan sebagai `timestamptz` (UTC). Tampilan dan perhitungan "hari ini/besok" memakai zona cabang. Zona Indonesia tanpa DST, sehingga offset tetap (WIB +7, WITA +8, WIT +9) dan tidak butuh pustaka zona waktu.
- **Pola mingguan:** disimpan per hari (`event_series`). Sesi konkret dibuat sampai akhir musim, dengan unique `(series_id, occurrence_date)` agar tidak ganda.
- **Ubah satu sesi:** menandai sesi itu `is_exception`, dan sesi lain tidak tersentuh (US-07). Menghentikan pola hanya menghapus sesi mendatang yang belum diubah dan belum diabsen.
- **Hari libur:** membatalkan sesi pada tanggal tersebut (alasan "Libur: …"). Menghapus hari libur menjadwalkan sesi itu kembali.

## ADR-022 · Absensi offline-first
**Status:** Diterima (M3)
**Keputusan:**
- **Di HP:** lembar sesi dan antrean perubahan disimpan di IndexedDB, lalu dikirim saat online (event `online`, juga saat halaman dibuka).
- **Di server:** setiap operasi punya `clientOpId`, dicatat di `attendance_op`, sehingga kirim ulang tidak menggandakan data. Bila ada dua perubahan untuk pemain yang sama, yang `recordedAt`-nya (waktu di HP) lebih baru yang menang (US-09).
- **Service worker:** halaman `/pelatih` dan `/wali` memakai strategi network-first dengan salinan terakhir untuk offline. Aset `/_next/static` cache-first. `/api` tidak pernah di-cache.
- **Jendela pengisian:** absensi bisa diisi mulai H-1 sesi (mis. izin yang sudah diketahui), tidak untuk sesi yang dibatalkan.

## ADR-023 · RSVP, link bertoken, dan pengingat
**Status:** Diterima (M3)
**Keputusan:**
- **Batas RSVP:** RSVP ditutup 2 jam sebelum sesi (US-08).
- **Link bertoken:** berlaku 48 jam dan sekali pakai (hanya hash yang disimpan). Pilihan untuk semua anak dikirim dalam satu permintaan.
- **Pengingat H-1:**
  - Dikirim pukul 17.00 waktu cabang, satu pesan gabungan per wali per hari.
  - Tidak dikirim di jam tenang 21.00–06.00.
  - Dedupe lewat `notification_log`.
  - Dijalankan BullMQ setiap 15 menit, hanya bila `JOBS_ENABLED=true` (nyalakan di satu instance).
- **Perubahan/pembatalan sesi oleh admin:** dikirim langsung ke wali dan pelatih tim (COM-02), termasuk di jam tenang, karena ini aksi manual yang mendesak. Status "dibaca" menyusul di M5.

---

## Selisih desain (tambahan M3)

| # | Topik | Desain | Implementasi |
| --- | --- | --- | --- |
| D-20 | A-12 tampilan "Bulan" & "Daftar" | Tiga tab | Tampilan minggu + navigasi minggu & filter tim. Tampilan bulan/daftar menyusul |
| D-21 | A-12 filter "Semua cabang" | Dropdown cabang | Filter tim (cabang bisa difilter lewat API, UI menyusul) |
| D-22 | A-09 kehadiran 30 hari di kartu tim | Ditampilkan | Tersedia di P-03 (pelatih). Kartu admin & dashboard menyusul (M5) |
| D-23 | P-02 chip ringkasan | Chip "Hadir" disorot | Sama, dihitung langsung dari isian layar |

---

## ADR-024 · Pembayaran Midtrans: checkout, webhook, dan ledger
**Status:** Diterima (M4)
**Keputusan:**
- **Checkout:** satu checkout = satu `order_id` Midtrans (`SG-<checkoutId>-<percobaan>`) untuk 1..n tagihan dari satu klub (ADR-003). Snap dibatasi ke metode yang dipilih wali, dan biaya layanannya masuk sebagai item terpisah.
- **Sumber kebenaran status:** status bayar tidak pernah diambil dari isi notifikasi. Webhook memverifikasi `signature_key`, menyimpan event mentah (`gateway_event`, dedupe per order+status), lalu mengecek ulang lewat Status API. Halaman "selesai bayar" juga mengecek ulang, sehingga pembayaran tercatat walau webhook tidak sampai (mis. lokal).
- **Idempoten:** penerapan settlement mengunci baris checkout (`FOR UPDATE`); notifikasi ganda atau bersamaan hanya diproses sekali. Nominal yang tidak cocok tidak diterapkan dan dicatat di audit.
- **Tagihan yang ternyata sudah lunas** (mis. dicatat manual saat wali sedang bayar online): dana tetap masuk ledger klub dan dicatat di audit (`doublePaid`) untuk dikembalikan manual.
- **Ledger** append-only per tagihan: `club_gross` +total, `platform_fee` −bagian fee, `midtrans_fee` −bagian biaya Midtrans yang ditanggung klub (QRIS saat biaya layanannya dimatikan). Pembagian memakai sisa terbesar, jadi setiap rupiah bisa ditelusuri ke tagihannya (US-13). Pembayaran manual tidak masuk ledger.
- **Penarikan:** dikunci per klub (advisory lock). Saldo dicadangkan dulu lewat entri ledger negatif, lalu Iris dipanggil. Bila gagal, dibuat entri balik. Rekening belum terverifikasi berarti dana ditahan (FEE-07).
- **Rekonsiliasi berkala:** job (tiap 15 menit, `JOBS_ENABLED`) mengecek ulang checkout pending berumur 5 menit s.d. 2 hari ke Status API. Jaring pengaman bila webhook tidak sampai/ditolak dan wali tidak kembali ke halaman status.
- **`PAYOUT_PROVIDER` terpisah dari `PAYMENT_PROVIDER`**, sehingga Snap sandbox bisa dipakai sebelum akses Iris tersedia.

## ADR-025 · Penerbitan tagihan
**Status:** Diterima (M4)
**Keputusan:**
- **Paket bulanan:** paket ber-KU spesifik didahulukan dari paket "semua KU". KU paket aktif tidak boleh tumpang-tindih, sehingga satu pemain punya satu paket.
- **KU pemain** = KU tim aktifnya musim ini. Tanpa tim, KU dihitung dari tanggal lahir.
- **Idempoten:** unique index (pemain, paket, periode). Proses yang berjalan bersamaan tidak menggandakan tagihan.
- **Terbit terlambat** (paket baru dibuat di tengah bulan, atau terbit manual setelah tanggal terbit): tanggal terbit = hari ini dan jatuh tempo dihitung dari situ, sehingga tagihan tidak langsung terlambat.
- **Pemain cuti dilewati.** Beasiswa 100% menghasilkan tagihan Rp0 berstatus "dibebaskan".
- **Nomor tagihan** `INV-YYMM-NNNN` per klub per bulan, dari counter atomik.

---

## Selisih desain (tambahan M4)

| # | Topik | Desain | Implementasi |
| --- | --- | --- | --- |
| D-24 | A-13 "Diskon Saudara" | Kartu diskon saudara 10% | Dihapus dari MVP (keputusan Q4). Tab "Diskon & beasiswa" menjadi "Beasiswa" |
| D-25 | A-14 "Kirim pengingat" | Tombol manual | Pengingat otomatis H-3/H/H+3/H+7. Tombol kepala diganti "Terbitkan iuran" dan "Biaya lain" |
| D-26 | A-15 skema | "Midtrans Transaction Split", jadwal cair otomatis | Penarikan manual oleh owner (ADR-016): kartu saldo + tombol "Tarik dana", riwayat penarikan, dan daftar pembayaran masuk yang bisa ditelusuri per tagihan |
| D-27 | A-15 "Unduh laporan" | Tombol ekspor | Menyusul bersama laporan (M5, A-18) |
| D-28 | O-05 rincian | Tanpa biaya layanan | Biaya layanan per metode ditampilkan (keputusan Q5); QRIS gratis selama ADR-016 |
| D-29 | Kuitansi | Tidak didesain | PDF A5 sederhana (logo klub menyusul) |
