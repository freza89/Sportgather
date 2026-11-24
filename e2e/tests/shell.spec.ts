import { expect, test } from '@playwright/test';

test.describe('kerangka aplikasi', () => {
  test('halaman awal untuk pengunjung', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Masuk' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Daftarkan klub' })).toBeVisible();
  });

  test('PWA manifest tersedia', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    expect((await res.json()).name).toBe('SportGather');
  });

  test('design system dapat dibuka', async ({ page }) => {
    await page.goto('/design');
    await expect(page.getByRole('heading', { name: 'SportGather Design System' })).toBeVisible();
  });
});
