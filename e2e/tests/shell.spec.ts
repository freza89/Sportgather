import { expect, test } from '@playwright/test';

test.describe('kerangka aplikasi (M0)', () => {
  test('admin: sidebar & navigasi', async ({ page, isMobile }) => {
    await page.goto('/admin/demo');
    if (isMobile) await page.getByRole('button', { name: 'Buka menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Menu utama' });
    await expect(nav.getByRole('link', { name: 'Beranda' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await nav.getByRole('link', { name: 'Pemain' }).click();
    await expect(page).toHaveURL(/\/admin\/demo\/pemain$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Pemain' })).toBeVisible();
    await page.screenshot({
      path: `test-results/admin-${isMobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
  });

  test('pelatih: bottom nav 5 tab', async ({ page }) => {
    await page.goto('/pelatih/demo');
    const nav = page.getByRole('navigation', { name: 'Menu utama' });
    await expect(nav.getByRole('link')).toHaveCount(5);
    await nav.getByRole('link', { name: 'Absensi' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Absensi' })).toBeVisible();
    await page.screenshot({ path: 'test-results/pelatih.png' });
  });

  test('wali: beranda', async ({ page }) => {
    await page.goto('/wali');
    await expect(page.getByRole('heading', { level: 1, name: /Halo/ })).toBeVisible();
    await page.screenshot({ path: 'test-results/wali.png' });
  });

  test('PWA manifest tersedia', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    expect((await res.json()).name).toBe('SportGather');
  });

  test('halaman tidak dikenal → 404', async ({ page }) => {
    const res = await page.goto('/admin/demo/tidak-ada');
    expect(res?.status()).toBe(404);
  });
});
