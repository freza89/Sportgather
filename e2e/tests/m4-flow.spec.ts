import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { e164, fillOtp, latestMessage, randomPhone, registerClub } from './helpers';

test.describe.configure({ mode: 'serial' });

const jakartaDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86_400_000));

test.describe('M4: iuran, bayar Midtrans (mock), penyaluran', () => {
  test.skip(({ isMobile }) => isMobile, 'Admin desktop; wali memakai konteks mobile di dalam tes.');

  let admin: BrowserContext;
  let page: Page;
  let slug = '';
  const ownerPhone = randomPhone();
  const waliPhone = randomPhone();

  test.beforeAll(async ({ browser }) => {
    admin = await browser.newContext({ viewport: { width: 1440, height: 1015 } });
    page = await admin.newPage();
    slug = await registerClub(page, {
      ownerPhone,
      clubName: `Akademi M4 ${Date.now().toString().slice(-6)}`,
    });
    const api = (path: string, data: object) =>
      page.request.post(`/api/orgs/${slug}${path}`, { data });
    await api('/seasons', {
      name: 'Musim E2E',
      startsOn: jakartaDate(-30),
      endsOn: jakartaDate(200),
    });
    const year = Number(jakartaDate().slice(0, 4));
    await api('/players/import', {
      commit: true,
      rows: [
        {
          fullName: 'Zaki Pratama',
          birthDate: `${year - 11}-01-15`,
          gender: 'L',
          guardianName: 'Rina Pratama',
          guardianPhone: waliPhone,
        },
        {
          fullName: 'Nadia Pratama',
          birthDate: `${year - 8}-02-20`,
          gender: 'P',
          guardianName: 'Rina Pratama',
          guardianPhone: waliPhone,
        },
      ],
    });
  });
  test.afterAll(async () => {
    await admin.close();
  });

  test('A-13: owner membuat paket iuran bulanan', async () => {
    await page.goto(`/admin/${slug}/iuran?tab=paket`);
    await page.getByLabel('Nama paket').fill('Iuran Bulanan');
    await page.getByLabel('Nominal (Rp)').fill('350000');
    await page.getByRole('button', { name: 'Simpan paket' }).click();
    await expect(page.getByRole('heading', { name: 'Iuran Bulanan' })).toBeVisible();
    await expect(page.getByText('2 pemain')).toBeVisible();
    await page.screenshot({ path: 'test-results/a13-paket.png', fullPage: true });
  });

  test('A-14: terbitkan tagihan periode berjalan', async () => {
    await page.goto(`/admin/${slug}/iuran`);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Terbitkan iuran/ }).click();
    await expect(page.getByText(/2 tagihan terbit/)).toBeVisible();
    await expect(page.getByRole('cell', { name: /INV-\d{4}-0001/ })).toBeVisible();
    await expect(page.getByText('Menunggu', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/a14-tagihan.png', fullPage: true });
  });

  test('O-05/O-06: wali bayar dua tagihan sekaligus lalu unduh kuitansi', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const m = await ctx.newPage();
    await m.goto('/masuk');
    await m.getByLabel('Nomor WhatsApp').fill(waliPhone);
    await m.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
    await fillOtp(m, e164(waliPhone));
    await expect(m).toHaveURL('/wali');
    await m.goto('/wali/tagihan');
    await expect(m.getByText('Aktif (2)')).toBeVisible();
    await m.getByRole('button', { name: 'Bayar Rp700.000' }).click();
    await expect(m).toHaveURL(/\/wali\/bayar\?ids=/);
    await m.getByRole('radio', { name: /Virtual Account BCA/ }).check();
    await expect(m.getByText('Biaya layanan Virtual Account BCA')).toBeVisible();
    await m.screenshot({ path: 'test-results/o05-bayar.png', fullPage: true });
    await m.getByRole('button', { name: 'Bayar Rp704.000 dengan Virtual Account BCA' }).click();
    await expect(m).toHaveURL(/\/dev\/midtrans\//);
    await m.getByRole('button', { name: 'Bayar (berhasil)' }).click();
    await expect(m).toHaveURL(/\/wali\/bayar\/[0-9a-f-]+$/);
    await expect(m.getByText('Pembayaran berhasil')).toBeVisible();
    await latestMessage(m, e164(waliPhone), 'pembayaran_berhasil');
    await m.getByRole('link', { name: 'Lihat riwayat & kuitansi' }).click();
    const receipt = m.getByRole('link', { name: 'Kuitansi', exact: true }).first();
    await expect(receipt).toBeVisible();
    const pdf = await m.request.get((await receipt.getAttribute('href'))!);
    expect(
      pdf.headers()['content-type'],
      `${pdf.url()} ${pdf.status()} ${(await pdf.text()).slice(0, 300)}`,
    ).toBe('application/pdf');
    await m.screenshot({ path: 'test-results/o06-riwayat.png', fullPage: true });
    await ctx.close();
  });

  test('A-15: owner melihat dana masuk dan menariknya', async () => {
    await page.goto(`/admin/${slug}/iuran?status=paid`);
    await expect(page.getByRole('cell').getByText('Lunas', { exact: true })).toHaveCount(2);
    await page.goto(`/admin/${slug}/penyaluran`);
    await expect(page.getByText('Bisa ditarik', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tarik dana' }).click();
    await page.getByRole('button', { name: 'Tarik semua' }).click();
    await page.getByRole('button', { name: /^Tarik Rp/ }).click();
    await expect(page.getByText('Tersalurkan', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/a15-penyaluran.png', fullPage: true });
  });
});
