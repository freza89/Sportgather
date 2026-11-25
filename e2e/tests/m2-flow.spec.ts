import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { e164, FAKE_JPEG, fillOtp, randomPhone, registerClub } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('M2: musim, tim, pendaftaran online, verifikasi, impor', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'Alur admin desktop; formulir wali diuji dengan konteks mobile di dalam tes.',
  );

  let ctx: BrowserContext;
  let page: Page;
  // Sesi wali dipakai ulang (login ulang < 30 detik ditolak oleh batas OTP).
  let waliCtx: BrowserContext;
  let slug = '';
  const ownerPhone = randomPhone();
  const waliPhone = randomPhone();

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1440, height: 1015 } });
    page = await ctx.newPage();
  });
  test.afterAll(async () => {
    await ctx?.close();
    await waliCtx?.close();
  });

  test('A-05: buat musim & kompetisi utama', async () => {
    slug = await registerClub(page, {
      ownerPhone,
      clubName: `Akademi M2 ${Date.now().toString().slice(-6)}`,
    });
    await page.goto(`/admin/${slug}/pengaturan/musim`);
    await page.getByLabel('Nama musim').fill('Musim 2027');
    await page.getByLabel('Mulai').fill('2027-01-01');
    await page.getByLabel('Selesai').fill('2027-12-31');
    await page.getByRole('button', { name: 'Buat musim' }).click();
    await page.getByRole('button', { name: 'Tambah kompetisi' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nama kompetisi').fill('Liga Basket Pelajar Bandung 2027');
    await dialog.getByLabel('Tanggal kompetisi (acuan KU)').fill('2027-06-14');
    await dialog.getByRole('button', { name: /^Simpan/ }).click();
    await expect(page.getByText('Tanggal acuan: 14 Juni 2027')).toBeVisible();
    await expect(page.getByText('Utama', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/a05-musim.png', fullPage: true });
  });

  test('A-09: buat tim KU10', async () => {
    await page.goto(`/admin/${slug}/tim`);
    await page.getByRole('button', { name: 'Buat tim' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Kelompok umur').selectOption('10');
    await dialog.getByLabel('Level').selectOption('Development');
    await dialog.getByRole('button', { name: 'Buat tim' }).click();
    await expect(page.getByRole('heading', { name: 'KU10 Development' })).toBeVisible();
    await page.screenshot({ path: 'test-results/a09-tim.png', fullPage: true });
  });

  test('O-01: wali mendaftarkan anak dari HP (tanpa install)', async ({ browser }) => {
    waliCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const m = await waliCtx.newPage();
    await m.goto(`/daftar/${slug}`);
    await m.getByLabel('Nama lengkap anak').fill('Alya Kusuma');
    await m.getByLabel('Tanggal lahir').fill('2016-09-09');
    await m.getByRole('button', { name: 'Perempuan' }).click();
    await m.getByLabel('Sekolah').fill('SDN Cihampelas 1');
    await expect(m.getByText('Perkiraan kelompok: KU10')).toBeVisible();
    await m
      .locator('input[type=file]')
      .setInputFiles({ name: 'akta_alya.jpg', mimeType: 'image/jpeg', buffer: FAKE_JPEG });
    await m.getByRole('checkbox').check();
    await m.screenshot({ path: 'test-results/o01-daftar.png', fullPage: true });
    await m.getByRole('button', { name: 'Lanjut: data wali' }).click();

    await m.getByLabel('Nama lengkap').fill('Sinta Kusuma');
    await m.getByLabel('Nomor WhatsApp').fill(waliPhone);
    await m.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
    await fillOtp(m, e164(waliPhone));
    await expect(m.getByText('Masuk sebagai Sinta Kusuma')).toBeVisible();
    await m.getByLabel('Kontak darurat (selain Anda)').fill('Agus Kusuma');
    await m.getByLabel('No. kontak darurat').fill('081299887766');
    await m.getByRole('button', { name: 'Lanjut: tinjau' }).click();
    await m.getByRole('button', { name: 'Kirim pendaftaran (1 anak)' }).click();
    await expect(m.getByRole('heading', { name: 'Pendaftaran terkirim' })).toBeVisible();
    await m.goto('/wali');
    await expect(m.getByText('Menunggu verifikasi')).toBeVisible();
  });

  test('A-08: admin memverifikasi dokumen & memasukkan ke tim', async () => {
    await page.goto(`/admin/${slug}/pemain/verifikasi`);
    await expect(page.getByRole('heading', { name: 'Alya Kusuma' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Akta kelahiran Alya Kusuma/ })).toBeVisible();
    const verify = page.getByRole('button', { name: /^Verifikasi/ });
    await expect(verify).toBeDisabled();
    await page.getByLabel('Nama sesuai dokumen').check();
    await page.getByLabel('Tanggal lahir sesuai dokumen').check();
    await page.getByLabel('Gender sesuai dokumen').check();
    await page
      .getByLabel('Masukkan ke tim (opsional)')
      .selectOption({ label: 'KU10 Development · KU sesuai' });
    await page.screenshot({ path: 'test-results/a08-verifikasi.png', fullPage: true });
    await page.getByRole('button', { name: 'Verifikasi & masukkan ke tim' }).click();
    await expect(page.getByText('Tidak ada pendaftar yang menunggu verifikasi.')).toBeVisible();

    // Sisi wali: anak aktif di tim.
    const m = await waliCtx.newPage();
    await m.goto('/wali');
    await expect(m.getByText('KU10 Development')).toBeVisible();
    await expect(m.getByText('Usia terverifikasi')).toBeVisible();
    await m.screenshot({ path: 'test-results/o03-wali.png', fullPage: true });
  });

  test('A-04: impor pemain dari CSV; baris error tidak ikut', async () => {
    await page.goto(`/admin/${slug}/pemain/impor`);
    const csv = [
      'Nama Anak,Tgl Lahir,JK,Nama Ortu,No HP Ortu,Kelas',
      'Zaki Pratama,12/03/2015,L,Rina Pratama,081322114455,6 SD',
      'Nadia Azzahra,04/01/2019,P,Rina Pratama,081322114455,2 SD',
      'Tanpa Tanggal,,L,Budi,081200000000,5 SD',
    ].join('\n');
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'data_pemain.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByText('data_pemain.csv')).toBeVisible();
    await page.getByRole('button', { name: 'Periksa data' }).click();
    await expect(page.getByText('Baris 4 · Tanggal lahir kosong')).toBeVisible();
    await page.screenshot({ path: 'test-results/a04-impor.png', fullPage: true });
    await page.getByRole('button', { name: 'Impor 2 pemain' }).click();
    await expect(page.getByRole('heading', { name: '2 pemain berhasil diimpor' })).toBeVisible();
  });

  test('A-06/A-07: daftar & profil pemain dengan KU', async () => {
    await page.goto(`/admin/${slug}/pemain`);
    await expect(page.getByText('3 pemain aktif')).toBeVisible();
    const zaki = page.getByRole('row', { name: /Zaki Pratama/ });
    await expect(zaki.getByText('KU12')).toBeVisible();
    await page.screenshot({ path: 'test-results/a06-pemain.png', fullPage: true });
    await zaki.getByRole('link').click();
    await expect(page.getByText('KU12 (12 th 3 bln)')).toBeVisible();
    await expect(page.getByText('Rina Pratama (Wali)')).toBeVisible();
    await page.screenshot({ path: 'test-results/a07-profil.png', fullPage: true });
  });
});
