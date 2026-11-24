import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { e164, fillOtp, latestMessage, randomPhone } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('M1: daftar klub, pengaturan, undangan staf', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'Alur admin dirancang desktop-first; mobile diuji di tes terpisah.',
  );

  const ownerPhone = randomPhone();
  const coachPhone = randomPhone();
  const clubName = `Klub E2E ${Date.now().toString().slice(-6)}`;
  let slug = '';
  // Satu sesi owner dipakai bersama (login ulang < 30 detik ditolak oleh batas OTP).
  let ownerContext: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1015 } });
    page = await ownerContext.newPage();
  });
  test.afterAll(async () => {
    await ownerContext?.close();
  });

  test('owner mendaftarkan klub (A-01) lalu masuk ke admin', async () => {
    await page.goto('/daftar-klub');
    await page.getByLabel('Nama klub / akademi').fill(clubName);
    await page.getByLabel('Kota').fill('Bandung');
    await page.getByLabel('Nama lengkap').fill('Rizky Ramadhan');
    await page.getByLabel('Nomor WhatsApp').fill(ownerPhone);
    await page.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
    await fillOtp(page, e164(ownerPhone));
    await expect(page.getByText('Anda akan menjadi owner sebagai')).toBeVisible();
    await page.getByRole('button', { name: 'Lanjut ke lokasi latihan' }).click();

    await page.getByLabel('Nama lokasi').fill('GOR Pajajaran');
    await page.getByLabel('Alamat').fill('Jl. Pajajaran No. 1, Bandung');
    await page.getByRole('button', { name: 'Lanjut ke rekening' }).click();

    await page.getByLabel('Bank').selectOption('BCA');
    await page.getByLabel('Nomor rekening').fill('0123454821');
    await expect(page.getByLabel('Nama pemilik rekening')).toHaveValue(clubName);
    await page.getByRole('button', { name: 'Daftarkan klub' }).click();

    await expect(page).toHaveURL(/\/admin\/klub-e2e-\d+$/);
    slug = page.url().split('/').pop()!;
    await expect(page.getByRole('navigation', { name: 'Menu utama' })).toBeVisible();
    await expect(page.getByText(clubName).first()).toBeVisible();
  });

  test('pengaturan klub (A-02): rekening terverifikasi, ubah kota', async () => {
    await page.goto(`/admin/${slug}/pengaturan`);
    await expect(page.getByText('BCA •••• 4821')).toBeVisible();
    await expect(page.getByText('Terverifikasi', { exact: true })).toBeVisible();
    await page.getByLabel('Kota').fill('Cimahi');
    await page.getByRole('button', { name: 'Simpan perubahan' }).click();
    await expect(page.getByText('Perubahan disimpan.')).toBeVisible();
    await page.screenshot({ path: 'test-results/a02-pengaturan.png', fullPage: true });
  });

  test('undang pelatih (A-03); pelatih menerima lewat link WhatsApp', async ({ browser }) => {
    await page.goto(`/admin/${slug}/pengaturan/staf`);
    await page.getByRole('button', { name: 'Undang staf' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nama lengkap').fill('Coach Andi');
    await dialog.getByLabel('Nomor WhatsApp').fill(coachPhone);
    await dialog.getByLabel('Peran').selectOption('coach');
    await dialog.getByRole('button', { name: 'Kirim undangan' }).click();
    await expect(page.getByText('Undangan terkirim', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Coach Andi', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/a03-staf.png', fullPage: true });

    const invite = await latestMessage(page, e164(coachPhone), 'undangan_staf');
    const link = new URL(invite.params.link!);

    const coachContext = await browser.newContext();
    const coach = await coachContext.newPage();
    await coach.goto(link.pathname);
    await expect(coach.getByText('Anda diundang menjadi')).toContainText('Pelatih');
    await coach.getByLabel('Nomor WhatsApp').fill(coachPhone);
    await coach.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
    await fillOtp(coach, e164(coachPhone));
    await expect(coach).toHaveURL(`/pelatih/${slug}`);
    await expect(coach.getByRole('heading', { level: 1, name: 'Halo, Coach Andi' })).toBeVisible();

    // Pelatih tidak masuk tampilan admin.
    await coach.goto(`/admin/${slug}/pengaturan`);
    await expect(coach).toHaveURL(`/pelatih/${slug}`);
    await coachContext.close();
  });

  test('keluar, lalu halaman terlindungi mengarah ke /masuk', async () => {
    await page.goto(`/admin/${slug}`);
    await page.getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL('/masuk');
  });

  test('halaman terlindungi mengarah ke /masuk; nomor tak terdaftar ditolak', async ({ page }) => {
    await page.goto(`/admin/${slug}/pengaturan`);
    await expect(page).toHaveURL(/\/masuk\?next=/);
    await page.getByLabel('Nomor WhatsApp').fill(randomPhone());
    await page.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
    await page.getByLabel('Digit 1').fill('123456');
    await expect(page.getByText(/tidak berlaku|salah|belum terdaftar/)).toBeVisible();
  });

  test('klub lain tidak bisa diakses (404)', async ({ page }) => {
    const other = randomPhone();
    await page.goto('/daftar-klub');
    await page.getByLabel('Nama lengkap').fill('Orang Luar');
    await page.getByLabel('Nomor WhatsApp').fill(other);
    await page.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
    await fillOtp(page, e164(other));
    await expect(page.getByText('Anda akan menjadi owner sebagai')).toBeVisible();
    const res = await page.goto(`/admin/${slug}/pengaturan`);
    expect(res?.status()).toBe(404);
  });
});

test('mobile: halaman masuk (O-02)', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'khusus mobile');
  await page.goto('/masuk');
  await expect(page.getByRole('heading', { name: 'Masuk ke SportGather' })).toBeVisible();
  await page.screenshot({ path: 'test-results/o02-masuk.png' });
});
