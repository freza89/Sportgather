/** Slug URL klub: "Belajar Basket Akademi" → "belajar-basket-akademi". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

export const SPORTS = { basketball: 'Basket' } as const;
export type Sport = keyof typeof SPORTS;

/** Paket langganan (PRD bagian 9 — harga hipotesis, belum ada penagihan langganan di MVP). */
export const PLANS = {
  starter: {
    label: 'Starter',
    priceMonthly: 0,
    maxPlayers: 30,
    summary: 'Data pemain, KU otomatis, jadwal, absensi, pengumuman',
  },
  klub: {
    label: 'Klub',
    priceMonthly: 299_000,
    maxPlayers: 120,
    summary: 'Semua fitur MVP termasuk tagihan otomatis, rapor, dashboard',
  },
  akademi: {
    label: 'Akademi',
    priceMonthly: 749_000,
    maxPlayers: 400,
    summary: 'Multi-cabang · paspor pemain · laporan per cabang',
  },
  enterprise: {
    label: 'Federasi/Enterprise',
    priceMonthly: null,
    maxPlayers: null,
    summary: 'Banyak klub di bawah satu asosiasi',
  },
} as const;
export type Plan = keyof typeof PLANS;

/** Bank tujuan penyaluran yang didukung awal (kode mengikuti penamaan umum). */
export const BANKS = {
  BCA: 'BCA',
  BRI: 'BRI',
  BNI: 'BNI',
  MANDIRI: 'Mandiri',
  BSI: 'BSI',
  CIMB: 'CIMB Niaga',
  PERMATA: 'Permata',
  DANAMON: 'Danamon',
  BTN: 'BTN',
  OCBC: 'OCBC',
} as const;
export type BankCode = keyof typeof BANKS;

/** BCA •••• 4821 */
export function maskAccountNumber(bank: string, accountNumber: string): string {
  return `${BANKS[bank as BankCode] ?? bank} •••• ${accountNumber.slice(-4)}`;
}

/** Versi teks persetujuan pemrosesan data anak (UU PDP). Naikkan bila teks berubah. */
export const CONSENT_VERSION = '2026-11-v1';
