import { expect, type Page } from '@playwright/test';

export const API_BASE = 'http://localhost:4100';

/** Nomor WhatsApp unik per tes (0812 + 8 digit acak). */
export function randomPhone(): string {
  return `0812${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

export function e164(phone: string): string {
  return `+62${phone.replace(/\D/g, '').replace(/^0/, '')}`;
}

/** Ambil pesan WhatsApp/SMS mock terakhir dari API (hanya ada di non-produksi). */
export async function latestMessage(page: Page, phone: string, template: string) {
  let found: { params: Record<string, string> } | undefined;
  await expect
    .poll(async () => {
      const res = await page.request.get(
        `${API_BASE}/v1/dev/outbox?to=${encodeURIComponent(phone)}`,
      );
      const list = (await res.json()) as { template: string; params: Record<string, string> }[];
      found = list.find((m) => m.template === template);
      return Boolean(found);
    })
    .toBe(true);
  return found!;
}

export async function fillOtp(page: Page, phone: string) {
  const msg = await latestMessage(page, phone, 'kode_otp');
  await page.getByLabel('Digit 1').fill(msg.params.kode!);
}

/** JPEG minimal yang lolos deteksi magic bytes server. */
export const FAKE_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('akta-kelahiran-e2e'),
]);

/** Daftarkan klub baru lewat A-01; mengembalikan slug. Halaman berakhir di /admin/<slug>. */
export async function registerClub(
  page: Page,
  opts: { ownerPhone: string; clubName: string; ownerName?: string },
) {
  await page.goto('/daftar-klub');
  await page.getByLabel('Nama klub / akademi').fill(opts.clubName);
  await page.getByLabel('Kota').fill('Bandung');
  await page.getByLabel('Nama lengkap').fill(opts.ownerName ?? 'Rizky Ramadhan');
  await page.getByLabel('Nomor WhatsApp').fill(opts.ownerPhone);
  await page.getByRole('button', { name: 'Kirim kode lewat WhatsApp' }).click();
  await fillOtp(page, e164(opts.ownerPhone));
  await expect(page.getByText('Anda akan menjadi owner sebagai')).toBeVisible();
  await page.getByRole('button', { name: 'Lanjut ke lokasi latihan' }).click();
  await page.getByLabel('Nama lokasi').fill('GOR Pajajaran');
  await page.getByLabel('Alamat').fill('Jl. Pajajaran No. 1, Bandung');
  await page.getByRole('button', { name: 'Lanjut ke rekening' }).click();
  await page.getByLabel('Bank').selectOption('BCA');
  await page.getByLabel('Nomor rekening').fill('0123454821');
  await page.getByRole('button', { name: 'Daftarkan klub' }).click();
  await expect(page).toHaveURL(/\/admin\/[a-z0-9-]+$/);
  return page.url().split('/').pop()!;
}
