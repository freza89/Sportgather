# PRD — Platform Manajemen Klub Olahraga Usia Muda (KU7–KU16)

Nov 23, 2026 · @Reza

## 1. Ringkasan produk

**KlubKU** (nama kerja) adalah platform SaaS multi-klub untuk mengelola klub dan akademi olahraga usia muda KU7–KU16 di Indonesia. Fokusnya: data pemain per kelompok umur, jadwal dan absensi, iuran bulanan, komunikasi ke orang tua, serta rapor perkembangan pemain. Sport pertama adalah basket, tetapi model datanya dibuat sport-agnostic sejak awal.

**Problem statement.** Klub usia muda di Indonesia umumnya masih dikelola lewat grup WhatsApp, spreadsheet, dan transfer bank manual. Akibatnya iuran sering telat dan sulit direkonsiliasi, absensi tidak tercatat, orang tua tidak melihat perkembangan anak, dan verifikasi usia untuk turnamen KU memakan waktu.

**Tujuan (12 bulan pertama)**

- Admin klub bisa menjalankan operasional satu musim tanpa spreadsheet: pendaftaran, pembagian KU, jadwal, absensi, iuran.
- Penagihan iuran otomatis dengan pembayaran lokal (VA, QRIS, e-wallet) dan rekonsiliasi otomatis.
- Orang tua punya satu aplikasi untuk jadwal, RSVP, tagihan, dan rapor anak.
- Data pemain siap dipakai untuk pendaftaran kompetisi KU (dokumen usia terverifikasi).

**Non-goals (MVP)**

- Bukan sistem manajemen turnamen/liga penuh (bracket, live scoring) — masuk fase lanjut.
- Bukan marketplace pelatih atau booking lapangan publik.
- Bukan live streaming atau analitik video.
- Tidak menangani akuntansi lengkap klub (pajak, payroll pelatih) — hanya ekspor laporan.

## 2. Pengguna & persona

Pembeli adalah pemilik/admin klub; pengguna harian terbanyak adalah orang tua. Produk harus menang di sisi orang tua agar klub mau membayar.

| Persona | Siapa | Kebutuhan utama | Perangkat |
| --- | --- | --- | --- |
| Owner klub | Pendiri akademi, bisa punya 2–5 cabang/lokasi | Pendapatan iuran tertagih, jumlah pemain per KU, laporan keuangan per cabang | Web + mobile |
| Admin klub | Staf administrasi atau owner sendiri di klub kecil | Pendaftaran, pembagian KU, penagihan, jadwal, pengumuman | Web (utama) |
| Pelatih | Pelatih kepala & asisten per KU, sering paruh waktu | Absensi cepat di lapangan, rencana latihan, penilaian skill pemain | Mobile (utama) |
| Orang tua / wali | Pembayar iuran, sering punya 2+ anak di KU berbeda | Jadwal, RSVP, bayar iuran, rapor anak, info perubahan mendadak | Mobile |
| Pemain | Anak 7–16 tahun | Melihat jadwal & progres sendiri (KU13+ saja) | Mobile, akun terbatas |

Catatan desain: pemain di bawah 13 tahun tidak punya akun sendiri; semua akses lewat akun orang tua.

## 3. Lanskap kompetitor

Pemain global kuat di fitur tapi mahal dan tidak mendukung pembayaran lokal; pemain lokal sudah ada tetapi generalis (booking) atau berfokus turnamen. Celahnya: platform khusus klub usia muda dengan **pembinaan per KU + rapor pemain + iuran lokal + kesiapan kompetisi**.

| Produk | Fokus | Harga (publik) | Celah untuk KlubKU |
| --- | --- | --- | --- |
| [TeamSnap ONE](https://info.teamsnap.com/teamsnap-vs-sportsengine.html) (AS) | Registrasi, jadwal, chat, live streaming, drill dari Jr. NBA | Tim tunggal gratis–±US$150/tim/tahun + 3,25% + US$1,50 per transaksi ([sumber](https://www.thefuturesapp.com/news/youth-sports-software-pricing)) | Tidak ada QRIS/VA, harga dolar, bukan untuk pasar Indonesia |
| [SportsEngine HQ](https://www.sportsengine.com/) (AS) | Manajemen klub & liga | ±US$804–2.208/tahun + 3,2–3,5% per transaksi; diakuisisi PlayMetrics Mei 2026 ([sumber](https://www.thefuturesapp.com/news/youth-sports-software-pricing)) | Sama: mahal, tidak lokal |
| [Spond](https://go.secondslide.io/best-sports-team-management-apps/) (Norwegia) | Event, RSVP, pesan, permintaan bayar | Gratis; fee pembayaran 3,29% + US$1 (USD) | Tidak ada rapor/pembinaan per KU |
| [Bukujanji](https://www.bukujanji.com/id/sistem-booking/akademi-olahraga) (ID) | Software booking generalis dengan modul akademi olahraga: jadwal per KU (U-8 s.d. U-17), absensi per sesi, iuran online, pengingat WhatsApp | Mulai Rp249.000/bulan per outlet, tanpa biaya per murid | Bukan spesialis olahraga; lemah di rapor skill, kurikulum, kompetisi |
| [Sportkit](https://sportkit.id/) (ID) | Turnamen, jadwal pertandingan, tiket, plus administrasi klub (iuran, absensi, rapor, jadwal latihan) | Tidak dipublikasikan | Pesaing terdekat; perlu dibedah lebih dalam (lihat pertanyaan terbuka) |

**Positioning.** "Aplikasi resmi klub untuk orang tua": orang tua melihat anaknya berkembang dari KU ke KU, klub menagih iuran tanpa repot. Diferensiasi: (1) rapor & kurikulum per KU yang bisa dibagikan ke orang tua, (2) satu akun orang tua untuk banyak anak dan banyak klub, (3) paspor pemain digital untuk pendaftaran turnamen KU, (4) harga rupiah dan pembayaran lokal.

## 4. Konsep inti: multi-klub & kelompok umur

Setiap klub adalah tenant terpisah; satu orang (orang tua atau pelatih) bisa terhubung ke banyak klub dengan satu akun. KU dihitung otomatis dari tanggal lahir, bukan diisi manual.

**Hierarki tenant**

1. **Organisasi** (klub/akademi) — pemilik langganan, logo, rekening penerimaan.
2. **Cabang/lokasi** — opsional; untuk klub dengan beberapa lapangan atau kota.
3. **Musim** — periode berjalan (misal Jan–Des 2027), menjadi dasar perhitungan KU dan tagihan.
4. **Tim/kelompok** — kombinasi KU + level (misal KU12 Development, KU12 Elite) + gender.
5. **Anggota tim** — pemain, pelatih, team manager.

**Aturan perhitungan KU**

- KU = usia pemain pada **tanggal acuan**, yaitu **tanggal kompetisi** yang diikuti tim. KU-N berisi pemain yang berusia di bawah N tahun pada tanggal tersebut.
- Setiap kompetisi menyimpan tanggal acuan dan rentang usianya sendiri, sehingga satu pemain bisa masuk KU berbeda di dua kompetisi dengan tanggal berbeda.
- Untuk latihan rutin, tim memakai tanggal acuan dari kompetisi utama yang dipilih admin per musim.
- Pengelompokan default dua tahunan, tetap bisa diubah ke satu tahunan:

| Kelompok | Usia (per tanggal acuan) | Fokus pembinaan default |
| --- | --- | --- |
| KU7 | 6–7 tahun | Motorik dasar, bermain, mini-basket |
| KU8 / KU10 | 8–10 tahun | Fundamental (dribel, passing, shooting), aturan dasar |
| KU12 | 11–12 tahun | Teknik + konsep tim, mulai kompetisi lokal |
| KU14 | 13–14 tahun | Taktik dasar, kondisi fisik, kompetisi rutin |
| KU16 | 15–16 tahun | Taktik lanjut, seleksi tim inti, kompetisi provinsi |

- **Play-up:** pemain boleh dimasukkan ke KU di atasnya oleh admin, dengan alasan tercatat. **Play-down** ke KU lebih muda diblokir kecuali ada override admin dengan alasan.
- **Pergantian musim:** sistem mengusulkan kenaikan KU semua pemain; admin meninjau dan menyetujui massal.
- **Verifikasi usia:** akta kelahiran/KIA/KK diunggah sekali, diverifikasi admin, lalu berstatus *terverifikasi* — dasar untuk paspor pemain di kompetisi.

## 5. Kebutuhan fungsional

MVP = 10 modul inti yang cukup untuk menjalankan satu musim. P1 = 3–6 bulan setelah MVP; P2 = setelah product-market fit.

| ID | Modul | Kebutuhan | Prioritas |
| --- | --- | --- | --- |
| ORG-01 | Onboarding klub | Admin membuat klub, cabang, logo, rekening penerimaan, dan sport dalam <15 menit | MVP |
| ORG-02 | Onboarding klub | Import pemain massal dari Excel/Google Sheets dengan pemetaan kolom | MVP |
| ORG-03 | Onboarding klub | Undang staf dengan peran (owner, admin, pelatih, team manager) | MVP |
| REG-01 | Pendaftaran | Formulir pendaftaran online dengan link/QR yang bisa dibagikan klub | MVP |
| REG-02 | Pendaftaran | Data wajib: nama, tanggal lahir, gender, sekolah, wali, kontak darurat, persetujuan orang tua | MVP |
| REG-03 | Pendaftaran | Unggah dokumen usia & foto; status verifikasi oleh admin | MVP |
| REG-04 | Pendaftaran | Tryout: pendaftar masuk daftar tunggu, admin menilai lalu menerima ke tim | P1 |
| KU-01 | Kelompok umur | Penempatan KU otomatis dari tanggal lahir + aturan musim (bagian 4) | MVP |
| KU-02 | Kelompok umur | Play-up/override dengan alasan tercatat; kenaikan KU massal saat ganti musim | MVP |
| SCH-01 | Jadwal | Jadwal latihan berulang per tim (hari, jam, lapangan); pengecualian libur | MVP |
| SCH-02 | Jadwal | Event tunggal: pertandingan, turnamen, ujian kenaikan level | MVP |
| SCH-03 | Jadwal | RSVP orang tua (hadir/izin/sakit) + pengingat H-1 | MVP |
| SCH-04 | Jadwal | Deteksi bentrok lapangan dan pelatih | P1 |
| ATT-01 | Absensi | Pelatih mencatat absensi di HP dalam <1 menit per sesi, bisa offline lalu sinkron | MVP |
| ATT-02 | Absensi | Absensi pelatih (check-in di lokasi) untuk dasar honor | P1 |
| ATT-03 | Absensi | Peringatan otomatis jika pemain absen 3 sesi berturut-turut | P1 |
| FEE-01 | Iuran | Paket iuran per KU/tim: bulanan, per termin, per sesi; diskon saudara & beasiswa | MVP |
| FEE-02 | Iuran | Tagihan otomatis tiap periode + pengingat WhatsApp/push sebelum & sesudah jatuh tempo | MVP |
| FEE-03 | Iuran | Bayar via Midtrans (VA, QRIS, e-wallet) dengan rekonsiliasi otomatis | MVP |
| FEE-04 | Iuran | Pencatatan pembayaran manual (tunai/transfer) dengan bukti | MVP |
| FEE-05 | Iuran | Biaya lain: registrasi tahunan, jersey, turnamen, camp | MVP |
| FEE-06 | Iuran | Laporan piutang, pendapatan per cabang/KU, ekspor Excel | MVP |
| FEE-07 | Iuran | Utama: pembagian dana otomatis per transaksi via Midtrans Transaction Split (bagian klub ke rekening klub, fee platform ke platform). Cadangan: dana masuk ke platform lalu disalurkan terjadwal (misal mingguan) via Midtrans Iris. Lapisan penyaluran dibuat terpisah agar skema bisa diganti tanpa mengubah modul tagihan | MVP |
| FEE-08 | Iuran | Verifikasi rekening tujuan klub (nama pemilik cocok, lewat pendaftaran penerima Split atau validasi rekening Iris) dan persetujuan owner sebelum rekening bisa diubah; penyaluran ditahan selama rekening belum terverifikasi | MVP |
| FEE-09 | Iuran | Laporan penyaluran untuk klub: dana per transaksi, saldo tertahan (skema cadangan), jadwal cair, rincian potongan, bukti transfer; penanganan refund dan chargeback dipotong dari penyaluran berikutnya | MVP |
| COM-01 | Komunikasi | Pengumuman ke klub, cabang, KU, atau tim tertentu (push + WhatsApp) | MVP |
| COM-02 | Komunikasi | Notifikasi perubahan jadwal mendadak dengan konfirmasi baca | MVP |
| COM-03 | Komunikasi | Chat tim satu arah/dua arah yang bisa dimatikan admin; tidak ada DM pelatih–pemain di bawah umur | P1 |
| DEV-01 | Pembinaan | Kurikulum per KU: daftar skill target (template basket bawaan, bisa diedit klub) | P1 |
| DEV-02 | Pembinaan | Penilaian skill berkala (skala 1–5) oleh pelatih | MVP |
| DEV-03 | Pembinaan | Rapor PDF per semester untuk orang tua: kehadiran, skill, catatan pelatih | MVP |
| DEV-04 | Pembinaan | Rencana latihan per sesi + pustaka drill | P1 |
| DEV-05 | Pembinaan | Statistik pertandingan dasar per pemain | P2 |
| PAS-01 | Paspor pemain | Kartu pemain digital (foto, KU, status verifikasi usia, QR) | P1 |
| PAS-02 | Paspor pemain | Ekspor daftar pemain sesuai format pendaftaran turnamen/liga | P1 |
| PAR-01 | Aplikasi orang tua | Satu akun untuk banyak anak dan banyak klub; beranda: jadwal, tagihan, pengumuman | MVP |
| PAR-02 | Aplikasi orang tua | Riwayat pembayaran & kuitansi digital | MVP |
| RPT-01 | Dashboard owner | Jumlah pemain aktif per KU, retensi, tingkat kehadiran, iuran tertagih vs terbayar | MVP |
| RPT-02 | Dashboard owner | Perbandingan antar cabang | P1 |
| EXT-01 | Fase lanjut | Halaman profil klub publik + pendaftaran dari pencarian | P2 |
| EXT-02 | Fase lanjut | Modul turnamen/liga antar klub di platform | P2 |
| EXT-03 | Fase lanjut | Toko merchandise & sponsor klub | P2 |

## 6. Alur pengguna utama

&#91;embedded content: alur satu musim · 4 peran, 8 langkah\]

Langkah 1–4 terjadi sekali per pemain per musim; langkah 5–7 berulang setiap bulan dan setiap sesi latihan. Langkah 6 disorot karena di sinilah north star (iuran dibayar lewat platform) tercapai.

**Kriteria penerimaan kunci**

- Orang tua bisa menyelesaikan langkah 2 dari link WhatsApp tanpa install aplikasi, <5 menit.
- Pelatih menyelesaikan absensi 20 pemain di langkah 7 dalam <1 menit, termasuk saat offline.
- Pembayaran di langkah 6 langsung mengubah status tagihan menjadi lunas tanpa input admin.

## 7. Model data & hak akses

Data pemain melekat pada **orang** (Person) yang bisa pindah klub; keanggotaan klub, tim, dan tagihan melekat pada tenant. Ini memungkinkan satu akun orang tua untuk banyak klub dan riwayat pemain lintas klub (dengan izin orang tua).

**Entitas utama**

| Entitas | Atribut kunci | Relasi |
| --- | --- | --- |
| Organization | nama, sport, logo, rekening, paket langganan | punya banyak Branch, Season, Membership |
| Branch | nama, alamat, lapangan | milik Organization |
| Season | nama, tanggal mulai/selesai, kompetisi utama (acuan KU latihan) | milik Organization |
| Person | nama, tanggal lahir, gender, foto, status verifikasi usia | bisa jadi Player dan/atau Guardian dan/atau Staff |
| Guardian link | hubungan (ayah/ibu/wali), izin | menghubungkan Person wali ↔ Person pemain |
| Membership | status (aktif/cuti/keluar), tanggal masuk | Person ↔ Organization |
| Team | KU, level, gender, cabang, musim | punya banyak TeamMember |
| TeamMember | peran (pemain/pelatih/manager), nomor punggung, play-up flag | Membership ↔ Team |
| Event | tipe (latihan/pertandingan/turnamen), waktu, lokasi, aturan berulang | milik Team |
| Attendance | status (hadir/izin/sakit/alpa), dicatat oleh | Event ↔ TeamMember |
| FeePlan | nominal, siklus, berlaku untuk KU/tim, diskon | milik Organization |
| Invoice / Payment | periode, jumlah, jatuh tempo, status, metode, ref gateway | Membership ↔ FeePlan |
| SkillAssessment | skill, skor 1–5, catatan, tanggal | Player ↔ Staff |
| Document | jenis (akta/KIA/KK/foto), status verifikasi | milik Person |
| Competition | nama, penyelenggara, tanggal kompetisi (= tanggal acuan KU), rentang usia per KU | diikuti banyak Team; menentukan KU pemain di kompetisi itu |

**Peran & izin (RBAC per organisasi)**

| Kemampuan | Owner | Admin | Pelatih | Team manager | Orang tua |
| --- | --- | --- | --- | --- | --- |
| Atur klub, langganan, rekening | Ya | Tidak | Tidak | Tidak | Tidak |
| Kelola pemain, KU, tim | Ya | Ya | Tim sendiri (lihat) | Tim sendiri (lihat) | Anak sendiri |
| Lihat dokumen usia | Ya | Ya | Tidak | Tidak | Anak sendiri |
| Absensi & penilaian skill | Ya | Ya | Tim sendiri | Absensi tim sendiri | Lihat anak sendiri |
| Tagihan & laporan keuangan | Ya | Ya | Tidak | Tidak | Tagihan sendiri |
| Kirim pengumuman | Ya | Ya | Tim sendiri | Tim sendiri | Tidak |

Semua aksi sensitif (lihat dokumen, ubah tagihan, override KU) masuk audit log.

## 8. Kebutuhan non-fungsional

Semua pengguna inti produk ini adalah anak di bawah umur, jadi privasi dan keamanan adalah syarat rilis, bukan fitur tambahan.

**Privasi & perlindungan anak**

- Patuh UU No. 27/2022 tentang Pelindungan Data Pribadi: data anak hanya diproses dengan persetujuan orang tua/wali yang tercatat (siapa, kapan, versi persetujuan). Perlu review legal sebelum rilis.
- Dokumen identitas (akta, KIA, KK) dienkripsi at-rest, hanya terlihat owner/admin, akses tercatat di audit log; NIK disamarkan di tampilan.
- Foto pemain tidak tampil publik secara default; orang tua memilih izin publikasi.
- Tidak ada pesan privat pelatih → pemain di bawah 13 tahun; semua komunikasi ke anak melalui/terlihat oleh orang tua.
- Orang tua bisa mengunduh dan meminta penghapusan data anak; data pemain yang keluar diarsipkan lalu dihapus sesuai kebijakan retensi.

**Keamanan**

- Login dengan OTP WhatsApp/SMS untuk orang tua; email + password + 2FA opsional untuk admin/owner.
- Isolasi data antar tenant di level query (row-level security) dan diuji otomatis.
- Pembayaran sepenuhnya lewat Midtrans (payment gateway berlisensi BI); platform tidak menyimpan data kartu.

**Performa & keandalan**

- Web app berbasis PWA (bisa dipasang ke layar utama tanpa Play Store/App Store), nyaman di Android kelas menengah dan jaringan 3G/4G lemah; absensi bisa offline.
- Waktu muat beranda <2 detik di 4G; uptime 99,5% per bulan.
- Skala awal: 500 klub, 50.000 pemain, puncak tagihan serentak tanggal 1 tiap bulan.

**Lokalisasi**

- Bahasa Indonesia default, Inggris opsional; format Rupiah, zona waktu WIB/WITA/WIT per cabang.
- Kanal notifikasi utama WhatsApp (via WhatsApp Business API), push sebagai pelengkap.

## 9. Model bisnis & pricing

Langganan per klub berdasarkan jumlah pemain aktif, ditambah fee transaksi kecil di atas biaya gateway. Angka di bawah adalah **hipotesis awal** untuk diuji ke 10–20 klub; acuan pasar lokal: Bukujanji mulai Rp249.000/bulan per outlet.

| Paket | Pemain aktif | Harga/bulan (hipotesis) | Isi |
| --- | --- | --- | --- |
| Starter | s.d. 30 | Gratis | Data pemain, KU otomatis, jadwal, absensi, pengumuman; pembayaran manual saja |
| Klub | s.d. 120 | Rp299.000 | Semua MVP termasuk tagihan otomatis, rapor, dashboard |
| Akademi | s.d. 400, multi-cabang | Rp749.000 | + multi-cabang, paspor pemain, laporan per cabang, prioritas support |
| Federasi/Enterprise | Tak terbatas | Negosiasi | Banyak klub di bawah satu asosiasi/pengcab, integrasi kompetisi |

- **Fee transaksi:** biaya gateway diteruskan ke orang tua atau ditanggung klub (pilihan klub), ditambah fee platform ±Rp2.000–3.000 per pembayaran online.
- **Pendapatan tambahan (P2):** komisi merchandise/jersey, pendaftaran turnamen, paket sponsor klub.
- **Logika nilai untuk klub:** klub 100 pemain × iuran Rp300.000 = Rp30 juta/bulan; jika tingkat iuran tertagih naik 5 poin persen, klub mendapat Rp1,5 juta/bulan — 5× harga paket Klub.

## 10. Metrik keberhasilan

North star: **jumlah pemain aktif yang iurannya dibayar lewat platform setiap bulan** — mengukur adopsi klub, adopsi orang tua, dan nilai bisnis sekaligus. Target di bawah adalah usulan awal.

| Metrik | Definisi | Target 6 bulan setelah MVP |
| --- | --- | --- |
| Klub aktif berbayar | Klub dengan paket berbayar dan ≥1 tagihan terbit bulan ini | 50 klub |
| Pemain aktif | Pemain dengan ≥1 absensi tercatat dalam 30 hari | 4.000 pemain |
| Aktivasi orang tua | % pemain yang walinya login ke aplikasi | ≥70% |
| Iuran via platform | % tagihan dibayar online (bukan manual) | ≥60% |
| Ketepatan bayar | % tagihan lunas ≤7 hari setelah jatuh tempo | ≥80% |
| Penggunaan absensi | % sesi terjadwal yang absensinya diisi pelatih | ≥85% |
| Waktu onboarding | Dari daftar sampai tagihan pertama terbit | ≤7 hari |
| Churn klub | Klub berbayar yang berhenti per bulan | ≤3% |

## 11. Roadmap rilis

&#91;embedded content: roadmap rilis · 4 fase, 3 gate\]

Jadwal ini usulan, dengan asumsi tim dev 3–4 orang mulai Februari 2027. Gate terakhir paling menentukan: produk baru dibuka luas jika ≥60% iuran klub pilot dibayar lewat platform.

## 12. Risiko & pertanyaan terbuka

Risiko terbesar adalah adopsi, bukan teknologi: klub dan orang tua sudah nyaman dengan WhatsApp + transfer manual.

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Orang tua enggan unduh aplikasi baru | Tagihan & RSVP tidak terpakai | Link pembayaran & RSVP bisa dibuka dari WhatsApp tanpa install; PWA bisa dipasang ke layar utama tanpa toko aplikasi |
| Admin klub kecil tidak sempat migrasi data | Churn di minggu pertama | Import Excel + layanan onboarding gratis ("kami input datanya") untuk 50 klub pertama |
| Fee transaksi dianggap mahal | Klub kembali ke transfer manual | Opsi biaya ditanggung orang tua; tunjukkan kenaikan iuran tertagih di dashboard |
| Kebocoran data anak | Reputasi & sanksi UU PDP | Bagian 8 sebagai syarat rilis; pentest sebelum peluncuran |
| Aturan KU berbeda antar sport/kompetisi | Penempatan KU salah | Aturan KU dapat dikonfigurasi per musim & kompetisi |
| Kompetitor lokal (Sportkit, Bukujanji) menurunkan harga | Tekanan harga | Diferensiasi di rapor/pembinaan & jaringan orang tua multi-klub |
| Skema cadangan: platform menampung dana iuran milik klub | Risiko izin dari Bank Indonesia (BI) dan kepercayaan klub jika penyaluran telat | Transaction Split sebagai skema utama; jika terpaksa memakai cadangan (Iris), minta penilaian konsultan hukum soal izin BI (PBI No. 23/6/PBI/2021) sebelum dibuka ke banyak klub; dana klub dicatat terpisah, jadwal cair tetap |

**Keputusan (23 November 2026)**

| Topik | Keputusan | Dampak di PRD |
| --- | --- | --- |
| Olahraga awal | Basket | Template kurikulum dan skill basket bawaan (DEV-01); model data tetap sport-agnostic |
| Payment gateway | Midtrans | FEE-03: VA, QRIS, e-wallet lewat Midtrans; status lunas otomatis dari notifikasi (webhook) Midtrans |
| Federasi | Tidak bekerja sama dengan Pengprov/Pengcab Perbasi di MVP | PAS-02 cukup ekspor generik (Excel/PDF); integrasi federasi baru dipertimbangkan setelah MVP |
| Tanggal acuan KU | Mengikuti tanggal kompetisi | Aturan KU disimpan per kompetisi (bagian 4 dan 7) |
| Pilot | Belajar Basket Akademi | Satu akademi sebagai design partner utama (bagian 11) |
| Platform | Web app dengan PWA | Tanpa aplikasi native di MVP; satu basis kode untuk admin, pelatih, dan orang tua |
| Alur dana | Satu akun Midtrans milik platform. Utama: Midtrans Transaction Split (bagian klub langsung dibagi Midtrans). Cadangan: dana masuk ke platform lalu disalurkan via Midtrans Iris | FEE-07 s.d. FEE-09 mendukung kedua skema; skema cadangan hanya dipakai jika Midtrans tidak mendukung Split untuk model ini |

**Pertanyaan terbuka**

- [x] Bedah fitur dan harga Sportkit (demo akun) sebelum finalisasi pricing.
- [x] Tanggal acuan KU untuk latihan rutin saat tim belum terdaftar di kompetisi apa pun: pakai 31 Desember sebagai cadangan?
- [x] Selain Belajar Basket Akademi, perlukah 1–2 klub tambahan agar hasil pilot tidak bergantung pada satu akademi?
- [x] Konfirmasi ke Midtrans: apakah Transaction Split bisa dipakai untuk model SaaS multi-klub, berapa biayanya, dan bagaimana klub didaftarkan sebagai penerima?

## 13. Arsitektur teknis & integrasi

MVP dibangun sebagai satu PWA dan satu backend modular (modular monolith), bukan microservices, agar tim kecil bisa rilis cepat; modul dipisah rapi supaya bisa dipecah nanti.

&#91;embedded content: arsitektur MVP · PWA, backend, data, layanan eksternal\]

Bagian 13–18 adalah spesifikasi untuk tim dev. Stack di bawah adalah rekomendasi; tim dev boleh mengusulkan alternatif selama memenuhi bagian 8.

**Stack yang direkomendasikan**

| Lapisan | Rekomendasi | Alasan |
| --- | --- | --- |
| Frontend | Next.js + TypeScript sebagai PWA (service worker, manifest) | Satu basis kode untuk 3 peran; bisa dipasang tanpa toko aplikasi |
| Offline | IndexedDB + antrean sinkron untuk absensi | Pelatih di lapangan dengan sinyal lemah (US-09) |
| Backend | Node.js + TypeScript (mis. NestJS), REST API | Satu bahasa dengan frontend, ekosistem SDK Midtrans tersedia |
| Database | PostgreSQL dengan row-level security per tenant | Isolasi data antar klub di level database |
| Antrean & jadwal | Redis + job queue (mis. BullMQ) | Tagihan bulanan, pengingat, penyaluran, retry webhook |
| File | Object storage kompatibel S3, enkripsi server-side, URL bertanda tangan berumur pendek | Dokumen usia anak |
| Hosting | Cloud region Jakarta | Latensi rendah; memudahkan kepatuhan UU PDP |
| Monitoring | Error tracking + uptime monitor + log terpusat | Target uptime 99,5% |

**Integrasi Midtrans**

- Checkout memakai Midtrans Snap; `order_id` = ID tagihan internal, satu tagihan bisa punya beberapa percobaan bayar.
- Status bayar hanya dipercaya dari HTTP notification (webhook) Midtrans yang tanda tangannya (`signature_key`) diverifikasi, lalu dicek ulang lewat API status; pemrosesan idempoten.
- Skema penyaluran mengikuti keputusan bagian 12: Transaction Split (utama) atau Iris (cadangan), di balik satu antarmuka internal `PayoutProvider`.
- Staging memakai Midtrans sandbox; kunci produksi hanya di secret manager.

**Integrasi WhatsApp**

- WhatsApp Business API lewat BSP resmi; semua pesan otomatis memakai template yang disetujui Meta (daftar di bagian 16).
- Link di pesan berupa link bertoken (berlaku 48 jam, sekali pakai untuk aksi bayar/RSVP).
- OTP via WhatsApp, cadangan SMS bila gagal terkirim dalam 30 detik.

## 14. Daftar layar MVP

MVP terdiri dari 31 layar dalam satu PWA; menu yang tampil ditentukan peran pengguna. Admin dirancang desktop-first, pelatih dan orang tua mobile-first.

| Kode | Layar | Peran | Isi utama | Kebutuhan |
| --- | --- | --- | --- | --- |
| A-01 | Daftar & buat klub | Owner | Nama klub, sport (basket), logo, cabang, data rekening | ORG-01 |
| A-02 | Pengaturan klub | Owner | Profil, cabang, rekening & status verifikasi, paket langganan | ORG-01, FEE-08 |
| A-03 | Staf & peran | Owner, admin | Undang via WhatsApp/email, atur peran | ORG-03 |
| A-04 | Import pemain | Admin | Unggah Excel/CSV, pemetaan kolom, pratinjau error | ORG-02 |
| A-05 | Musim & kompetisi | Admin | Musim aktif, kompetisi utama, tanggal acuan KU, rentang usia | KU-01 |
| A-06 | Daftar pemain | Admin | Filter KU/tim/status, status dokumen & iuran | REG, KU |
| A-07 | Profil pemain | Admin | Data diri, wali, dokumen, riwayat tim, absensi, tagihan, penilaian | REG-02/03 |
| A-08 | Antrean verifikasi | Admin | Pendaftar baru & dokumen menunggu verifikasi | REG-03 |
| A-09 | Tim & KU | Admin | Daftar tim per KU/level, pelatih, jumlah pemain | KU-01/02 |
| A-10 | Detail tim | Admin | Anggota, play-up, jadwal tim | KU-02 |
| A-11 | Kenaikan KU musim baru | Admin | Usulan penempatan massal, setujui/ubah | KU-02 |
| A-12 | Kalender & jadwal | Admin | Jadwal berulang, event, libur | SCH-01/02 |
| A-13 | Paket iuran | Admin | Nominal, siklus, berlaku untuk KU/tim, diskon saudara & beasiswa | FEE-01 |
| A-14 | Tagihan | Admin | Daftar tagihan, filter status, catat bayar manual | FEE-02/04/05 |
| A-15 | Penyaluran dana | Owner, admin | Dana per transaksi, jadwal cair, potongan, bukti transfer | FEE-07/09 |
| A-16 | Pengumuman | Admin | Tulis, pilih target (klub/cabang/KU/tim), status terkirim & dibaca | COM-01/02 |
| A-17 | Dashboard owner | Owner | Pemain aktif per KU, kehadiran, iuran tertagih vs terbayar | RPT-01 |
| A-18 | Laporan & ekspor | Owner, admin | Piutang, pendapatan, absensi; ekspor Excel/PDF | FEE-06 |
| P-01 | Beranda pelatih | Pelatih | Sesi hari ini, tim yang dipegang | SCH |
| P-02 | Absensi sesi | Pelatih | Daftar pemain + RSVP, tap hadir/izin/sakit/alpa, offline | ATT-01 |
| P-03 | Tim saya | Pelatih | Pemain, kontak darurat (tanpa dokumen) | KU |
| P-04 | Penilaian skill | Pelatih | Daftar skill KU, skor 1–5, catatan per pemain | DEV-02 |
| P-05 | Pengumuman tim | Pelatih | Kirim info ke orang tua di tim sendiri | COM-01 |
| O-01 | Formulir pendaftaran | Calon orang tua | Data anak & wali, unggah akta/KIA, persetujuan data | REG-01/02/03 |
| O-02 | Login OTP | Orang tua | Nomor WhatsApp + OTP | NFR |
| O-03 | Beranda orang tua | Orang tua | Kartu per anak: jadwal terdekat, tagihan, pengumuman | PAR-01 |
| O-04 | Jadwal & RSVP | Orang tua | Kalender anak, tombol hadir/izin/sakit | SCH-03 |
| O-05 | Tagihan & bayar | Orang tua | Tagihan aktif, bayar via Midtrans Snap (VA/QRIS/e-wallet) | FEE-03 |
| O-06 | Riwayat & kuitansi | Orang tua | Pembayaran lunas, unduh kuitansi PDF | PAR-02 |
| O-07 | Rapor anak | Orang tua | Kehadiran, skor skill, catatan pelatih, unduh PDF | DEV-03 |
| O-08 | Profil & data anak | Orang tua | Ubah kontak, lihat data, minta hapus data | NFR |

## 15. User story & kriteria penerimaan MVP

Setiap story dianggap selesai hanya jika semua kriterianya lolos uji di staging dengan data contoh Belajar Basket Akademi.

| ID | Story | Kriteria penerimaan |
| --- | --- | --- |
| US-01 | Sebagai owner, saya mendaftarkan klub agar bisa mulai memakai platform | Klub aktif <15 menit; rekening berstatus "menunggu verifikasi" sampai lolos FEE-08; owner otomatis jadi admin |
| US-02 | Sebagai admin, saya mengimpor pemain dari Excel | File ≤2.000 baris diproses <30 detik; baris error ditampilkan dengan alasannya dan tidak ikut tersimpan; duplikat (nama + tanggal lahir) ditandai |
| US-03 | Sebagai orang tua, saya mendaftarkan anak lewat link dari klub | Bisa selesai tanpa install, <5 menit; persetujuan data wajib dicentang; satu wali bisa mendaftarkan lebih dari satu anak dalam satu sesi |
| US-04 | Sebagai admin, saya memverifikasi dokumen usia | Dokumen hanya terlihat admin/owner; setiap pembukaan dokumen tercatat di audit log; penolakan wajib alasan dan mengirim notifikasi ke wali |
| US-05 | Sebagai admin, saya mengatur kompetisi utama dan tanggal acuan KU | Mengubah tanggal acuan menghitung ulang KU semua pemain aktif dan menampilkan daftar pemain yang KU-nya berubah sebelum disimpan |
| US-06 | Sebagai admin, saya menempatkan pemain ke tim | Sistem hanya menawarkan tim dengan KU sesuai; play-up wajib alasan; play-down diblokir tanpa override owner |
| US-07 | Sebagai admin, saya membuat jadwal latihan berulang | Pola mingguan menghasilkan sesi sampai akhir musim; mengubah satu sesi tidak mengubah sesi lain; tanggal libur meniadakan sesi |
| US-08 | Sebagai orang tua, saya mengisi RSVP | Bisa dari tombol di pesan WhatsApp tanpa login ulang (link bertoken, berlaku 48 jam); RSVP terkunci 2 jam sebelum sesi |
| US-09 | Sebagai pelatih, saya mencatat absensi | 20 pemain selesai <1 menit; default diisi dari RSVP; bisa offline dan tersinkron otomatis saat online tanpa data ganda |
| US-10 | Sebagai admin, saya membuat paket iuran | Satu pemain hanya punya satu paket aktif; diskon saudara dihitung otomatis dari data wali; beasiswa bisa 0–100% |
| US-11 | Sebagai sistem, saya menerbitkan tagihan bulanan | Tagihan terbit otomatis pada tanggal yang diatur klub; tidak ada tagihan ganda untuk periode yang sama; pemain berstatus cuti tidak ditagih |
| US-12 | Sebagai orang tua, saya membayar iuran | Pembayaran via Midtrans Snap; status lunas dari webhook Midtrans <1 menit; webhook yang sama datang dua kali tidak mencatat bayar dua kali (idempoten) |
| US-13 | Sebagai owner, saya menerima dana iuran | Bagian klub dihitung = jumlah bayar − biaya Midtrans − fee platform; setiap rupiah bisa ditelusuri ke tagihan asalnya; penyaluran ditahan jika rekening belum terverifikasi |
| US-14 | Sebagai admin, saya mencatat pembayaran tunai/transfer manual | Wajib bukti foto; tercatat siapa yang mencatat; tidak masuk perhitungan fee platform |
| US-15 | Sebagai pelatih, saya menilai skill pemain | Daftar skill sesuai template KU basket; skor 1–5; penilaian hanya bisa diubah pembuatnya dalam 7 hari |
| US-16 | Sebagai orang tua, saya melihat dan mengunduh rapor | Rapor terbit setelah admin mempublikasikan per semester; PDF memuat logo klub, kehadiran %, skor skill, catatan pelatih |
| US-17 | Sebagai admin, saya mengirim pengumuman perubahan jadwal | Terkirim ke semua wali di target lewat WhatsApp + push; admin melihat jumlah terkirim dan dibaca |
| US-18 | Sebagai owner, saya melihat dashboard | Angka dashboard sama dengan laporan ekspor untuk periode yang sama; data diperbarui ≤15 menit |

## 16. Matriks notifikasi

WhatsApp adalah kanal utama karena orang tua belum tentu memasang PWA; push hanya untuk yang sudah memasang dan mengizinkan. Setiap pesan WhatsApp memakai template yang disetujui Meta dan berisi link bertoken ke layar terkait.

| Pemicu | Penerima | Kanal | Waktu |
| --- | --- | --- | --- |
| Pendaftaran berhasil dikirim | Wali | WhatsApp | Langsung |
| Dokumen ditolak / pemain diterima ke tim | Wali | WhatsApp + push | Langsung |
| OTP login | Wali, staf | WhatsApp (cadangan SMS) | Langsung |
| Undangan staf | Staf baru | WhatsApp / email | Langsung |
| Pengingat sesi + minta RSVP | Wali | WhatsApp + push | H-1, 17.00 waktu cabang |
| Perubahan / pembatalan jadwal | Wali + pelatih tim | WhatsApp + push | Langsung, dengan status dibaca |
| Tagihan terbit | Wali | WhatsApp + push | Tanggal terbit, 09.00 |
| Pengingat jatuh tempo | Wali | WhatsApp | H-3 dan hari H |
| Tagihan terlambat | Wali; ringkasan ke admin | WhatsApp | H+3 dan H+7; admin tiap Senin |
| Pembayaran lunas + kuitansi | Wali | WhatsApp + push | Langsung setelah webhook |
| Pemain absen 3 sesi berturut-turut (P1) | Admin + pelatih | Push | Setelah absensi ke-3 |
| Dana tersalurkan / penyaluran ditahan | Owner | WhatsApp + email | Saat terjadi |
| Rapor terbit | Wali | WhatsApp + push | Saat dipublikasikan admin |
| Pengumuman manual | Target yang dipilih | WhatsApp + push | Langsung / terjadwal |

Aturan umum: tidak ada notifikasi otomatis antara 21.00–06.00 (kecuali OTP); satu wali dengan beberapa anak menerima satu pesan gabungan untuk tagihan dan pengingat di hari yang sama.

## 17. Lingkup pilot & definisi selesai MVP

Pilot di Belajar Basket Akademi memakai semua fitur berlabel MVP, dengan konfigurasi satu klub; yang diuji adalah alur nyata satu musim pendek, bukan skala.

**Lingkup pilot**

- Satu organisasi (Belajar Basket Akademi), cabang sesuai kondisi akademi, sport basket.
- Semua pemain aktif akademi diimpor (A-04); pendaftar baru selama pilot masuk lewat formulir online (O-01).
- Iuran bulanan ditagih lewat platform dengan skema Midtrans yang sudah dikonfirmasi (Split atau cadangan Iris).
- Minimal satu siklus rapor diterbitkan sebelum pilot berakhir.
- Di luar lingkup pilot: multi-klub, paket langganan berbayar, fitur P1/P2.

**Data yang perlu disiapkan akademi**

- [ ] Daftar pemain (nama, tanggal lahir, gender, nama & nomor WhatsApp wali) dalam Excel
- [ ] Daftar pelatih dan tim yang dipegang
- [ ] Jadwal latihan rutin per kelompok dan lokasi lapangan
- [ ] Struktur iuran saat ini (nominal, diskon, beasiswa)
- [ ] Kompetisi utama musim ini dan tanggal acuan KU-nya
- [ ] Rekening penerimaan atas nama akademi

**MVP dianggap selesai jika**

1. Semua user story US-01 s.d. US-18 lolos kriteria penerimaannya.
2. Pentest eksternal tidak menyisakan temuan kritis atau tinggi; review legal UU PDP selesai.
3. Uji isolasi tenant otomatis lolos (data klub A tidak pernah terbaca dari klub B).
4. Satu siklus penuh di staging berhasil: tagihan terbit → dibayar via Midtrans sandbox → status lunas → dana tercatat untuk disalurkan.
5. Admin akademi bisa menjalankan operasional satu bulan tanpa spreadsheet pendamping.

**Pilot dianggap berhasil jika** (gate menuju rilis, bagian 11): ≥60% iuran dibayar lewat platform, ≥70% wali aktif di aplikasi, dan ≥85% sesi terisi absensinya.

## 18. Glosarium

| Istilah | Arti di PRD ini |
| --- | --- |
| KU (kelompok umur) | Kelompok pemain berdasarkan usia pada tanggal acuan; KU-N = di bawah N tahun |
| Tanggal acuan | Tanggal kompetisi yang dipakai untuk menghitung KU |
| Kompetisi utama | Kompetisi yang dipilih admin per musim sebagai acuan KU untuk latihan rutin |
| Play-up / play-down | Pemain ditempatkan di KU lebih tua / lebih muda dari usianya |
| Tenant / organisasi | Satu klub atau akademi beserta seluruh datanya, terisolasi dari klub lain |
| Wali | Orang tua atau wali yang bertanggung jawab atas pemain dan pembayaran |
| Musim | Periode operasional klub yang menjadi dasar tim, jadwal, dan tagihan |
| Paket iuran | Aturan tagihan: nominal, siklus, berlaku untuk KU/tim, diskon |
| Transaction Split | Fitur Midtrans yang membagi satu pembayaran ke beberapa penerima saat settlement (skema utama) |
| Midtrans Iris | API penyaluran dana (payout) Midtrans (skema cadangan) |
| Penyaluran dana | Proses dana iuran sampai ke rekening klub setelah dipotong biaya Midtrans dan fee platform |
| PWA | Progressive Web App: web app yang bisa dipasang ke layar utama dan bekerja offline terbatas |
| Link bertoken | Link unik berbatas waktu di pesan WhatsApp yang membuka layar tertentu tanpa login ulang |
| Rapor | Laporan perkembangan pemain per semester: kehadiran, skor skill, catatan pelatih |
