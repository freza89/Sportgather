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

async function mobileLogin(browser: import('@playwright/test').Browser, phone: string) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const m = await ctx.newPage();
  await m.goto('/masuk');
  await m.getByLabel('Nomor WhatsApp').fill(phone);
  await m.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
  await fillOtp(m, e164(phone));
  return { ctx, m };
}

test.describe('M5: dashboard, pengumuman, penilaian & rapor, profil wali', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'Admin desktop; pelatih & wali memakai konteks mobile di dalam tes.',
  );

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
      clubName: `Akademi M5 ${Date.now().toString().slice(-6)}`,
    });
    const api = (path: string, data: object) =>
      page.request.post(`/api/orgs/${slug}${path}`, { data });
    await api('/seasons', {
      name: 'Musim E2E',
      startsOn: jakartaDate(-30),
      endsOn: jakartaDate(150),
    });
    const team = await (await api('/teams', { ku: 12, level: 'Elite', staffRoleIds: [] })).json();
    const year = Number(jakartaDate(150).slice(0, 4));
    await api('/players/import', {
      commit: true,
      rows: [
        {
          fullName: 'Zaki Pratama',
          birthDate: `${year - 12}-06-15`,
          gender: 'L',
          guardianName: 'Rina Pratama',
          guardianPhone: waliPhone,
        },
      ],
    });
    const players = await (await page.request.get(`/api/orgs/${slug}/players`)).json();
    await api(`/teams/${team.id}/members`, {
      membershipId: players.rows[0].membershipId,
      reason: 'E2E',
    });
  });
  test.afterAll(async () => {
    await admin.close();
  });

  test('A-17: dashboard owner', async () => {
    await page.goto(`/admin/${slug}`);
    await expect(
      page.getByRole('heading', { name: /Selamat (pagi|siang|sore|malam), Rizky/ }),
    ).toBeVisible();
    await expect(page.getByText('Pemain aktif', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pemain aktif per KU' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sesi hari ini' })).toBeVisible();
    await page.screenshot({ path: 'test-results/a17-dashboard.png', fullPage: true });
  });

  test('A-16: kirim pengumuman ke KU12', async () => {
    await page.goto(`/admin/${slug}/pengumuman`);
    await page.getByRole('button', { name: 'KU', exact: true }).click();
    await page.getByRole('button', { name: 'KU12', exact: true }).click();
    await expect(page.getByText(/KU12 · 1 pemain · 1 wali/)).toBeVisible();
    await page.getByLabel('Judul').fill('Perubahan jadwal latihan Kamis');
    await page
      .getByPlaceholder('Yth. Bapak/Ibu, …')
      .fill('Latihan Kamis dimajukan ke 15.30. Terima kasih.');
    await page.getByRole('button', { name: 'Kirim ke 1 wali' }).click();
    await expect(page.getByText('Terkirim ke 1 wali.')).toBeVisible();
    await expect(page.getByText(/1 terkirim · dibaca 0\/1/)).toBeVisible();
    const wa = await latestMessage(page, e164(waliPhone), 'pengumuman');
    expect(wa.params.link).toMatch(/\/i\//);
    await page.screenshot({ path: 'test-results/a16-pengumuman.png', fullPage: true });
  });

  test('O-03/link: wali membuka pengumuman lewat link WhatsApp → dibaca', async ({ browser }) => {
    const wa = await latestMessage(page, e164(waliPhone), 'pengumuman');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(new URL(wa.params.link!).pathname);
    await expect(p.getByRole('heading', { name: 'Perubahan jadwal latihan Kamis' })).toBeVisible();
    await ctx.close();
    await page.reload();
    await expect(page.getByText(/dibaca 1\/1/)).toBeVisible();
  });

  test('P-04: menilai skill pemain', async () => {
    await page.goto(`/pelatih/${slug}/penilaian`);
    await expect(page.getByText('Zaki Pratama')).toBeVisible();
    for (const skill of ['Dribel', 'Passing', 'Shooting', 'Defense', 'Kerja sama tim'])
      await page.getByRole('radio', { name: `${skill} 4` }).click();
    await page
      .getByPlaceholder('Perkembangan & saran latihan di rumah')
      .fill('Kontrol bola makin stabil.');
    await page.getByRole('button', { name: 'Simpan penilaian' }).click();
    await expect(page.getByText('Penilaian tersimpan')).toBeVisible();
    await page.screenshot({ path: 'test-results/p04-penilaian.png', fullPage: true });
  });

  test('A-18: ekspor & terbitkan rapor', async () => {
    await page.goto(`/admin/${slug}/laporan`);
    const xlsx = await page.request.get(
      (await page.getByRole('link', { name: 'Excel' }).first().getAttribute('href'))!,
    );
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Terbitkan rapor' }).click();
    await expect(page.getByText(/Terbit \d/)).toBeVisible();
    await latestMessage(page, e164(waliPhone), 'rapor_terbit');
    await page.screenshot({ path: 'test-results/a18-laporan.png', fullPage: true });
  });

  test('O-07/O-08: wali melihat rapor, mengatur izin foto, minta hapus data', async ({
    browser,
  }) => {
    const { ctx, m } = await mobileLogin(browser, waliPhone);
    await expect(m).toHaveURL('/wali');
    await expect(m.getByText('Perubahan jadwal latihan Kamis')).toBeVisible();
    await m.goto('/wali/rapor');
    await expect(m.getByText('Kontrol bola makin stabil.')).toBeVisible();
    await expect(m.getByText('4,0/5')).toBeVisible();
    const pdf = await m.request.get(
      (await m.getByRole('link', { name: 'Unduh rapor (PDF)' }).getAttribute('href'))!,
    );
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    await m.screenshot({ path: 'test-results/o07-rapor.png', fullPage: true });
    await m.goto('/wali/profil');
    await m.getByText('Izin publikasi foto Zaki').click();
    await expect(m.getByRole('switch', { name: 'Izin publikasi foto Zaki' })).toBeChecked();
    await m.getByRole('button', { name: /Minta hapus data Zaki/ }).click();
    await m.getByRole('button', { name: 'Kirim permintaan' }).click();
    await expect(m.getByText('Hapus diproses')).toBeVisible();
    await m.screenshot({ path: 'test-results/o08-profil.png', fullPage: true });
    await ctx.close();
    await page.goto(`/admin/${slug}/pengaturan/data`);
    await expect(page.getByText('Diminta Rina Pratama')).toBeVisible();
  });
});
