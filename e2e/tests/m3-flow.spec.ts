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
const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

test.describe('M3: jadwal, RSVP, absensi offline', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'Admin desktop; pelatih & wali memakai konteks mobile di dalam tes.',
  );

  let admin: BrowserContext;
  let page: Page;
  let slug = '';
  const tomorrow = jakartaDate(1);
  const tomorrowWeekday = WEEKDAYS[new Date(`${tomorrow}T00:00:00Z`).getUTCDay()]!;
  const ownerPhone = randomPhone();
  const coachPhone = randomPhone();
  const waliPhone = randomPhone();

  test.beforeAll(async ({ browser }) => {
    admin = await browser.newContext({ viewport: { width: 1440, height: 1015 } });
    page = await admin.newPage();
    slug = await registerClub(page, {
      ownerPhone,
      clubName: `Akademi M3 ${Date.now().toString().slice(-6)}`,
    });
    const api = (path: string, data?: object) =>
      data
        ? page.request.post(`/api/orgs/${slug}${path}`, { data })
        : page.request.get(`/api/orgs/${slug}${path}`);
    await api('/seasons', {
      name: 'Musim E2E',
      startsOn: jakartaDate(-30),
      endsOn: jakartaDate(60),
    });
    await api('/staff', { fullName: 'Coach Andi', phone: coachPhone, role: 'coach' });
    const staff = (await (await api('/staff')).json()) as { id: string; role: string }[];
    const team = await (
      await api('/teams', {
        ku: 12,
        level: 'Elite',
        staffRoleIds: [staff.find((s) => s.role === 'coach')!.id],
      })
    ).json();
    // Tanpa kompetisi, acuan KU = 31 Desember tahun akhir musim → lahir (tahun acuan − 12) = KU12.
    const year = Number(jakartaDate(60).slice(0, 4));
    await api('/players/import', {
      commit: true,
      rows: [
        {
          fullName: 'Zaki Pratama',
          birthDate: `${year - 12}-01-15`,
          gender: 'L',
          guardianName: 'Rina Pratama',
          guardianPhone: waliPhone,
        },
        {
          fullName: 'Rafa Aditya',
          birthDate: `${year - 12}-02-20`,
          gender: 'L',
          guardianName: 'Dina',
          guardianPhone: randomPhone(),
        },
      ],
    });
    const players = (await (await api('/players')).json()).rows as { membershipId: string }[];
    for (const p of players)
      expect(
        (await api(`/teams/${team.id}/members`, { membershipId: p.membershipId })).status(),
      ).toBe(201);
  });
  test.afterAll(async () => {
    await admin?.close();
  });

  test('A-12: buat jadwal latihan rutin & batalkan satu sesi', async () => {
    await page.goto(`/admin/${slug}/jadwal?minggu=${tomorrow}`);
    await page.getByRole('button', { name: 'Buat jadwal' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(tomorrowWeekday, { exact: true }).check();
    await dialog.getByLabel('Jam mulai').fill('16:00');
    await dialog.getByRole('button', { name: 'Buat jadwal rutin' }).click();
    const day = page.getByRole('region', { name: tomorrow });
    await expect(day.getByText('KU12 Elite')).toBeVisible();
    await page.screenshot({ path: 'test-results/a12-jadwal.png', fullPage: true });

    // Batalkan sesi minggu depannya saja (sesi besok tetap).
    await page.goto(`/admin/${slug}/jadwal?minggu=${jakartaDate(8)}`);
    const nextWeek = page.getByRole('region', { name: jakartaDate(8) });
    await nextWeek.getByRole('button', { name: /KU12 Elite/ }).click();
    const edit = page.getByRole('dialog');
    await edit.getByRole('button', { name: 'Batalkan sesi' }).click();
    await edit.getByLabel('Alasan pembatalan').fill('GOR dipakai acara');
    await edit.getByRole('button', { name: 'Batalkan & kabari' }).click();
    await expect(nextWeek.getByText('GOR dipakai acara')).toBeVisible();
    await expect(await latestMessage(page, e164(waliPhone), 'perubahan_jadwal')).toBeTruthy();
    await page.goto(`/admin/${slug}/jadwal?minggu=${tomorrow}`);
    await expect(
      page.getByRole('region', { name: tomorrow }).getByText('GOR dipakai acara'),
    ).toHaveCount(0);
  });

  test('O-04: wali mengisi RSVP dari HP', async ({ browser }) => {
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
    await m.goto('/wali/jadwal');
    const card = m.getByRole('radiogroup', { name: 'Kehadiran Zaki Pratama' }).first();
    await card.getByRole('radio', { name: 'Izin' }).click();
    await expect(card.getByRole('radio', { name: 'Izin' })).toHaveAttribute('aria-checked', 'true');
    await m.screenshot({ path: 'test-results/o04-jadwal.png', fullPage: true });
    await ctx.close();
  });

  test('P-01/P-02: pelatih mengabsen saat offline, tersinkron saat online (US-09)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const m = await ctx.newPage();
    const invite = await latestMessage(m, e164(coachPhone), 'undangan_staf');
    await m.goto(new URL(invite.params.link!).pathname);
    await m.getByLabel('Nomor WhatsApp').fill(coachPhone);
    await m.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
    await fillOtp(m, e164(coachPhone));
    await expect(m).toHaveURL(`/pelatih/${slug}`);
    await m.screenshot({ path: 'test-results/p01-beranda.png', fullPage: true });
    await m.getByRole('link', { name: 'Mulai absensi' }).click();
    await expect(m.getByText('RSVP: Izin')).toBeVisible();

    await ctx.setOffline(true);
    await expect(m.getByText('Sedang offline')).toBeVisible();
    await m.getByRole('radio', { name: 'Hadir — Rafa Aditya' }).click();
    await m.getByRole('button', { name: 'Simpan absensi · 2/2' }).click();
    await expect(m.getByText('Tersimpan di HP')).toBeVisible();
    await m.screenshot({ path: 'test-results/p02-absensi-offline.png', fullPage: true });

    await ctx.setOffline(false);
    await expect(m.getByText('Sedang offline')).toHaveCount(0);
    await expect
      .poll(async () => {
        const sessions = (await (
          await m.request.get(`/api/orgs/${slug}/coach/sessions?date=${tomorrow}`)
        ).json()) as { attendanceRecorded: number }[];
        return sessions[0]?.attendanceRecorded ?? 0;
      })
      .toBe(2);
    await ctx.close();
  });
});
