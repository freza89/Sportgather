import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { API_BASE, e164, fillOtp, randomPhone, registerClub } from './helpers';

/**
 * M6 · DoD bagian 17 butir 4: satu siklus penuh
 * tagihan terbit → dibayar via Midtrans (mock) → lunas → dana tercatat siap disalurkan,
 * dengan angka ledger yang dicek persis. Ditambah header keamanan & isolasi tenant lewat web.
 */
test.describe.configure({ mode: 'serial' });

const jakartaDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

test.describe('M6: siklus penuh pilot', () => {
  test.skip(({ isMobile }) => isMobile, 'Admin desktop; wali memakai konteks mobile di dalam tes.');

  let admin: BrowserContext;
  let page: Page;
  let slug = '';
  const ownerPhone = randomPhone();
  const waliPhone = randomPhone();
  // BCA VA: biaya layanan Rp4.000 dibayar wali = biaya Midtrans → klub hanya menanggung fee platform.
  const FEE = 300_000;
  const PLATFORM_FEE = 2_500;

  test.beforeAll(async ({ browser }) => {
    admin = await browser.newContext({ viewport: { width: 1440, height: 1015 } });
    page = await admin.newPage();
    slug = await registerClub(page, {
      ownerPhone,
      clubName: `Akademi M6 ${Date.now().toString().slice(-6)}`,
    });
    const api = (path: string, data: object) =>
      page.request.post(`/api/orgs/${slug}${path}`, { data });
    await api('/seasons', {
      name: 'Musim Pilot',
      startsOn: jakartaDate(-30),
      endsOn: jakartaDate(200),
    });
    const year = Number(jakartaDate().slice(0, 4));
    await api('/players/import', {
      commit: true,
      rows: [
        {
          fullName: 'Bima Siklus',
          birthDate: `${year - 12}-04-10`,
          gender: 'L',
          guardianName: 'Lina Siklus',
          guardianPhone: waliPhone,
        },
      ],
    });
    const plan = await api('/billing/plans', {
      name: 'Iuran Pilot',
      kind: 'monthly',
      amount: FEE,
    });
    expect(plan.status()).toBe(201);
  });
  test.afterAll(async () => {
    await admin.close();
  });

  test('header keamanan web & API', async ({ request }) => {
    const web = await request.get('/masuk');
    const h = web.headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['content-security-policy']).not.toContain('unsafe-eval');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['x-powered-by']).toBeUndefined();
    const api = await request.get(`${API_BASE}/health`);
    expect(api.headers()['x-content-type-options']).toBe('nosniff');
    expect(api.headers()['x-powered-by']).toBeUndefined();
  });

  test('tagihan terbit → wali bayar → lunas → dana siap disalurkan (angka persis)', async ({
    browser,
  }) => {
    await page.goto(`/admin/${slug}/iuran`);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Terbitkan iuran/ }).click();
    await expect(page.getByText(/1 tagihan terbit/)).toBeVisible();

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
    await m.getByRole('button', { name: 'Bayar Rp300.000' }).click();
    await m.getByRole('radio', { name: /Virtual Account BCA/ }).check();
    await m.getByRole('button', { name: 'Bayar Rp304.000 dengan Virtual Account BCA' }).click();
    await m.getByRole('button', { name: 'Bayar (berhasil)' }).click();
    await expect(m.getByText('Pembayaran berhasil')).toBeVisible();
    // Wali tidak lagi punya tagihan aktif.
    const mine = await m.request.get('/api/me/invoices');
    expect(await mine.json()).toEqual([]);
    await ctx.close();

    await page.goto(`/admin/${slug}/iuran?status=paid`);
    await expect(page.getByRole('cell').getByText('Lunas', { exact: true })).toHaveCount(1);

    const ov = await (await page.request.get(`/api/orgs/${slug}/billing/payouts`)).json();
    expect(ov.transactions).toHaveLength(1);
    expect(ov.transactions[0]).toMatchObject({
      gross: FEE + 4_000,
      midtransFee: 4_000,
      platformFee: PLATFORM_FEE,
      clubNet: FEE - PLATFORM_FEE,
      available: true,
    });
    expect(ov.available).toBe(FEE - PLATFORM_FEE);

    await page.goto(`/admin/${slug}/penyaluran`);
    await expect(page.getByRole('cell', { name: 'Rp297.500' }).first()).toBeVisible();
    await expect(page.getByText('Bisa ditarik', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/m6-siklus.png', fullPage: true });
  });

  test('isolasi tenant: owner klub lain tidak bisa membaca klub ini', async ({ browser }) => {
    const other = await browser.newContext({ viewport: { width: 1440, height: 1015 } });
    const p = await other.newPage();
    await registerClub(p, {
      ownerPhone: randomPhone(),
      clubName: `Akademi Lain ${Date.now().toString().slice(-6)}`,
    });
    for (const path of ['/players', '/billing/invoices', '/billing/payouts', '/staff']) {
      const res = await p.request.get(`/api/orgs/${slug}${path}`);
      expect([403, 404], `${path} → ${res.status()}`).toContain(res.status());
    }
    await p.goto(`/admin/${slug}`);
    await expect(p.getByText('Bima Siklus')).toHaveCount(0);
    await other.close();
  });
});
