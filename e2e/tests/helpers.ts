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
