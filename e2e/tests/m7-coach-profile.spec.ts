import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { e164, fillOtp, latestMessage, randomPhone, registerClub } from './helpers';

/** M7 · Profil/CV & lisensi pelatih: pelatih mengisi → owner memverifikasi → wali melihat. */
test.describe.configure({ mode: 'serial' });

const jakartaDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

const FAKE_PDF = Buffer.from('%PDF-1.7\nsertifikat lisensi e2e');

async function mobile(browser: Browser) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
}

async function login(page: Page, phone: string) {
  await page.goto('/masuk');
  await page.getByLabel('Nomor WhatsApp').fill(phone);
  await page.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
  await fillOtp(page, e164(phone));
  await expect(page).not.toHaveURL(/\/masuk/);
}

test.describe('M7: profil & lisensi pelatih', () => {
  test.skip(({ isMobile }) => isMobile, 'Admin desktop; pelatih & wali memakai konteks mobile.');

  let admin: BrowserContext;
  let page: Page;
  let slug = '';
  const ownerPhone = randomPhone();
  const coachPhone = randomPhone();
  const waliPhone = randomPhone();

  test.beforeAll(async ({ browser }) => {
    admin = await browser.newContext({ viewport: { width: 1440, height: 1015 } });
    page = await admin.newPage();
    slug = await registerClub(page, {
      ownerPhone,
      clubName: `Akademi M7 ${Date.now().toString().slice(-6)}`,
    });
    const api = (path: string, data: object) =>
      page.request.post(`/api/orgs/${slug}${path}`, { data });
    await api('/seasons', {
      name: 'Musim M7',
      startsOn: jakartaDate(-30),
      endsOn: jakartaDate(200),
    });
    await api('/staff', { fullName: 'Coach Bayu', phone: coachPhone, role: 'coach' });
    const staff = (await (await page.request.get(`/api/orgs/${slug}/staff`)).json()) as {
      id: string;
      fullName: string;
    }[];
    const coachId = staff.find((s) => s.fullName === 'Coach Bayu')!.id;
    const team = await (
      await api('/teams', { ku: 12, level: 'Kompetisi', staffRoleIds: [coachId] })
    ).json();
    const year = Number(jakartaDate().slice(0, 4));
    await api('/players/import', {
      commit: true,
      rows: [
        {
          fullName: 'Dafa Tujuh',
          birthDate: `${year - 11}-06-01`,
          gender: 'L',
          guardianName: 'Lina Tujuh',
          guardianPhone: waliPhone,
        },
      ],
    });
    const players = await (await page.request.get(`/api/orgs/${slug}/players`)).json();
    await api(`/teams/${team.id}/members`, { membershipId: players.rows[0].membershipId });
  });
  test.afterAll(async () => {
    await admin.close();
  });

  test('pelatih mengisi profil, mencatat lisensi yang masih proses, dan mengunggah lisensi', async ({
    browser,
  }) => {
    const ctx = await mobile(browser);
    const m = await ctx.newPage();
    const invite = await latestMessage(m, e164(coachPhone), 'undangan_staf');
    await login(m, coachPhone);
    const token = invite.params.link!.split('/').pop()!;
    expect((await m.request.post('/api/invitations/accept', { data: { token } })).ok()).toBe(true);

    await m.goto(`/pelatih/${slug}/tim`);
    await m.getByRole('link', { name: /Profil & lisensi saya/ }).click();
    await expect(m).toHaveURL(`/pelatih/${slug}/profil`);

    await m.getByRole('button', { name: 'Ubah' }).first().click();
    await m.getByLabel('Judul singkat').fill('Pelatih kepala KU12');
    await m.getByLabel('Lama melatih (tahun)').fill('5');
    await m.getByLabel('Tentang pelatih').fill('Fokus pada fundamental dan sportivitas.');
    await m.getByRole('button', { name: 'Simpan profil' }).click();
    await expect(m.getByText('Profil disimpan.')).toBeVisible();

    await m.getByRole('button', { name: 'Tambah', exact: true }).click();
    await m.getByLabel('Jabatan / peran').fill('Asisten pelatih');
    await m.getByLabel('Klub / organisasi').fill('Klub Basket Lama');
    await m.getByLabel('Tahun mulai').fill('2019');
    await m.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(m.getByText('Klub Basket Lama · 2019 – sekarang')).toBeVisible();

    // Lisensi yang masih proses: tanpa file.
    await m.getByRole('button', { name: 'Tambah lisensi' }).click();
    await m.getByLabel('Nama lisensi').fill('Lisensi Pelatih Level B');
    await m.getByText('Masih dalam proses mengambil lisensi').click();
    await m.getByRole('button', { name: 'Simpan lisensi' }).click();
    await expect(m.getByText('Sedang proses', { exact: true })).toBeVisible();

    // Lisensi dengan file → menunggu verifikasi.
    await m.getByRole('button', { name: 'Tambah lisensi' }).click();
    await m.getByLabel('Nama lisensi').fill('Lisensi Pelatih Level C');
    await m.getByLabel('Penerbit').fill('PERBASI');
    await m.getByLabel('Berlaku sampai').fill(jakartaDate(365));
    await m.locator('input[type=file][accept*="pdf"]').setInputFiles({
      name: 'lisensi-c.pdf',
      mimeType: 'application/pdf',
      buffer: FAKE_PDF,
    });
    await m.getByRole('button', { name: 'Simpan lisensi' }).click();
    await expect(m.getByText('Lisensi disimpan dan menunggu verifikasi admin.')).toBeVisible();
    await expect(m.getByText('Menunggu verifikasi', { exact: true })).toBeVisible();
    await m.screenshot({ path: 'test-results/m7-profil-pelatih.png', fullPage: true });
    await ctx.close();
  });

  test('owner melihat tanda di daftar staf, membuka file, lalu memverifikasi', async () => {
    await page.goto(`/admin/${slug}/pengaturan/staf`);
    await expect(page.getByText('1 perlu verifikasi')).toBeVisible();
    await page.getByRole('link', { name: 'Coach Bayu' }).click();
    await expect(page.getByRole('heading', { name: 'Profil & lisensi' })).toBeVisible();
    await expect(page.getByText('1 lisensi menunggu verifikasi')).toBeVisible();
    const fileLink = page.getByRole('link', { name: /Lihat file: lisensi-c\.pdf/ });
    const pdf = await page.request.get((await fileLink.getAttribute('href'))!);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    await page.getByRole('button', { name: 'Verifikasi' }).click();
    await expect(page.getByText('Lisensi terverifikasi.')).toBeVisible();
    await expect(page.getByText('Terverifikasi', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/m7-verifikasi.png', fullPage: true });
    await page.goto(`/admin/${slug}/pengaturan/staf`);
    await expect(page.getByText('2 lisensi')).toBeVisible();
  });

  test('wali melihat ringkasan pelatih tim anak (hanya lisensi terverifikasi)', async ({
    browser,
  }) => {
    const ctx = await mobile(browser);
    const m = await ctx.newPage();
    await login(m, waliPhone);
    await m.goto('/wali');
    await m.getByRole('link', { name: /Kenali pelatih/ }).click();
    await expect(m.getByText('Coach Bayu')).toBeVisible();
    await expect(m.getByText('Pelatih kepala KU12 · 5 tahun melatih')).toBeVisible();
    await expect(m.getByText('Lisensi Pelatih Level C · PERBASI')).toBeVisible();
    await expect(m.getByText('Lisensi Pelatih Level B')).toHaveCount(0);
    await m.screenshot({ path: 'test-results/m7-wali-pelatih.png', fullPage: true });
    await ctx.close();
  });
});
