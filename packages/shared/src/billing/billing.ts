/**
 * Iuran & pembayaran (FEE-01..09) — fungsi murni. Semua nominal integer rupiah (tanpa float
 * pada hasil akhir); pembulatan eksplisit dan alokasi memakai metode sisa terbesar sehingga
 * jumlah per tagihan selalu sama dengan total.
 */
import type { Rupiah } from '../format/rupiah.js';
import { parseIsoDate, type IsoDate } from '../ku/ku.js';
import { addDays } from '../schedule/schedule.js';

// ── Periode & nomor tagihan ────────────────────────────────────────────────

/** "2027-10-12" → "2027-10" */
export function periodOf(date: IsoDate): string {
  return date.slice(0, 7);
}

const BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** "2027-10" → "Oktober 2027" */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${BULAN[m! - 1]} ${y}`;
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, '0')}`;
}

/** Tanggal terbit di periode tsb; hari 29–31 dijepit ke akhir bulan (mis. Februari). */
export function issueDateFor(period: string, issueDay: number): IsoDate {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return `${period}-${String(Math.min(Math.max(issueDay, 1), last)).padStart(2, '0')}`;
}

export function dueDateFor(issueDate: IsoDate, dueDays: number): IsoDate {
  return addDays(issueDate, dueDays);
}

/** INV-2710-0142 (tahun & bulan periode + urutan per klub per bulan). */
export function invoiceNumber(period: string, seq: number): string {
  return `INV-${period.slice(2, 4)}${period.slice(5, 7)}-${String(seq).padStart(4, '0')}`;
}

/** Beasiswa 0–100% (FEE-01). Potongan dibulatkan ke rupiah terdekat. */
export function invoiceAmounts(
  amount: Rupiah,
  scholarshipPct = 0,
): { amount: Rupiah; discount: Rupiah; total: Rupiah } {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Nominal tidak valid');
  const pct = Math.min(100, Math.max(0, Math.round(scholarshipPct)));
  const discount = Math.round((amount * pct) / 100);
  return { amount, discount, total: amount - discount };
}

// ── Metode bayar & biaya ───────────────────────────────────────────────────

export type FeeRule = { pct: number } | { flat: Rupiah };

/**
 * Metode di Midtrans Snap (O-05). Tarif adalah CONTOH (lihat kontrak Midtrans); di server
 * dibaca dari konfigurasi platform, bukan dikodekan per klub.
 */
export const PAYMENT_METHODS = {
  qris: {
    label: 'QRIS',
    hint: 'Semua e-wallet & m-banking',
    fee: { pct: 0.7 } as FeeRule,
    snap: 'other_qris',
  },
  bca_va: {
    label: 'Virtual Account BCA',
    hint: null,
    fee: { flat: 4000 } as FeeRule,
    snap: 'bca_va',
  },
  mandiri_va: {
    label: 'Virtual Account Mandiri',
    hint: null,
    fee: { flat: 4000 } as FeeRule,
    snap: 'echannel',
  },
  bri_va: {
    label: 'Virtual Account BRI',
    hint: null,
    fee: { flat: 4000 } as FeeRule,
    snap: 'bri_va',
  },
  gopay: { label: 'GoPay', hint: null, fee: { pct: 2 } as FeeRule, snap: 'gopay' },
  shopeepay: { label: 'ShopeePay', hint: null, fee: { pct: 2 } as FeeRule, snap: 'shopeepay' },
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export const PAYMENT_METHOD_KEYS = Object.keys(PAYMENT_METHODS) as PaymentMethod[];

/** Biaya gateway untuk satu transaksi (dibulatkan ke atas ke rupiah). */
export function gatewayFee(method: PaymentMethod, base: Rupiah): Rupiah {
  const rule = PAYMENT_METHODS[method].fee;
  return 'flat' in rule ? rule.flat : Math.ceil((base * rule.pct) / 100);
}

export interface FeePolicy {
  /** Fee platform per pembayaran online (PRD bagian 9: ±Rp2.000–3.000). */
  platformFee: Rupiah;
  /**
   * Biaya layanan QRIS dibebankan ke wali? (ADR-016: bisa dimatikan sampai Midtrans
   * mengonfirmasi aturan BI; bila mati, biaya QRIS ditanggung SportGather, ADR-033.)
   */
  qrisSurchargeEnabled: boolean;
}

export const DEFAULT_FEE_POLICY: FeePolicy = { platformFee: 2500, qrisSurchargeEnabled: false };

/** Biaya layanan yang dibayar wali di checkout (keputusan Q5). */
export function serviceFee(
  method: PaymentMethod,
  base: Rupiah,
  policy: FeePolicy = DEFAULT_FEE_POLICY,
): Rupiah {
  if (method === 'qris' && !policy.qrisSurchargeEnabled) return 0;
  return gatewayFee(method, base);
}

/** Alokasi `total` ke bagian-bagian sebanding `weights` (sisa terbesar; jumlah selalu tepat). */
export function allocate(total: Rupiah, weights: Rupiah[]): Rupiah[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    const out = weights.map(() => 0);
    if (out.length) out[0] = total;
    return out;
  }
  const raw = weights.map((w) => (total * w) / sum);
  const base = raw.map(Math.floor);
  let rest = total - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    base[i]! += 1;
    rest -= 1;
  }
  return base;
}

export interface CheckoutBreakdown {
  /** Jumlah tagihan (bagian klub sebelum potongan). */
  base: Rupiah;
  serviceFee: Rupiah;
  /** Dibayar wali ke Midtrans. */
  gross: Rupiah;
  /** Biaya Midtrans sesungguhnya atas `gross`. */
  midtransFee: Rupiah;
  platformFee: Rupiah;
  /** Biaya Midtrans yang ditanggung SportGather (QRIS tanpa biaya layanan, ADR-033). Tidak masuk ledger klub. */
  midtransFeeBorneByPlatform: Rupiah;
  /** Per tagihan: diterima klub = total − bagian fee platform − bagian biaya Midtrans yang ditanggung klub. */
  perInvoice: {
    invoiceId: string;
    total: Rupiah;
    platformFee: Rupiah;
    midtransFeeBorneByClub: Rupiah;
    clubNet: Rupiah;
  }[];
  clubNet: Rupiah;
}

/**
 * US-13: bagian klub = jumlah bayar − biaya Midtrans − fee platform, dan setiap rupiah bisa
 * ditelusuri ke tagihan asalnya. Biaya Midtrans ditanggung wali lewat biaya layanan, kecuali
 * QRIS saat biaya layanannya dimatikan: ditanggung SportGather (ADR-033), klub tidak dipotong.
 */
export function checkoutBreakdown(
  invoices: { id: string; total: Rupiah }[],
  method: PaymentMethod,
  policy: FeePolicy = DEFAULT_FEE_POLICY,
): CheckoutBreakdown {
  const base = invoices.reduce((a, i) => a + i.total, 0);
  const fee = serviceFee(method, base, policy);
  const gross = base + fee;
  const midtransFee = gatewayFee(method, gross);
  // Selisih biaya Midtrans di atas biaya layanan: QRIS tanpa biaya layanan → SportGather
  // (ADR-033); selisih pembulatan persen atas gross (mis. e-wallet) → klub.
  const shortfall = Math.max(0, midtransFee - fee);
  const borneByPlatform = method === 'qris' && fee === 0 ? shortfall : 0;
  const borneByClub = shortfall - borneByPlatform;
  const weights = invoices.map((i) => i.total);
  const platformParts = allocate(policy.platformFee, weights);
  const midtransParts = allocate(borneByClub, weights);
  const perInvoice = invoices.map((inv, k) => ({
    invoiceId: inv.id,
    total: inv.total,
    platformFee: platformParts[k]!,
    midtransFeeBorneByClub: midtransParts[k]!,
    clubNet: inv.total - platformParts[k]! - midtransParts[k]!,
  }));
  return {
    base,
    serviceFee: fee,
    gross,
    midtransFee,
    platformFee: policy.platformFee,
    midtransFeeBorneByPlatform: borneByPlatform,
    perInvoice,
    clubNet: perInvoice.reduce((a, p) => a + p.clubNet, 0),
  };
}

// ── Penarikan dana (ADR-016) ────────────────────────────────────────────────

export interface WithdrawalPolicy {
  minAmount: Rupiah;
  /** Biaya transfer Iris per penarikan, ditanggung klub (keputusan Q5). */
  transferFee: Rupiah;
}

export const DEFAULT_WITHDRAWAL_POLICY: WithdrawalPolicy = {
  minAmount: 50_000,
  transferFee: 2_500,
};

export function withdrawalCheck(
  amount: Rupiah,
  available: Rupiah,
  policy: WithdrawalPolicy = DEFAULT_WITHDRAWAL_POLICY,
): { ok: true; net: Rupiah } | { ok: false; message: string } {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return { ok: false, message: 'Nominal tidak valid' };
  if (amount < policy.minAmount)
    return {
      ok: false,
      message: `Minimal penarikan ${policy.minAmount.toLocaleString('id-ID')} rupiah`,
    };
  if (amount > available) return { ok: false, message: 'Melebihi saldo yang bisa ditarik' };
  if (amount <= policy.transferFee)
    return { ok: false, message: 'Nominal harus lebih besar dari biaya transfer' };
  return { ok: true, net: amount - policy.transferFee };
}

// ── Pengingat tagihan (PRD bagian 16) ───────────────────────────────────────

export type ReminderStage = 'h-3' | 'h' | 'h+3' | 'h+7';

/** Tahap pengingat untuk tagihan belum lunas pada `today` (null bila tidak ada). */
export function reminderStage(dueDate: IsoDate, today: IsoDate): ReminderStage | null {
  if (today === addDays(dueDate, -3)) return 'h-3';
  if (today === dueDate) return 'h';
  if (today === addDays(dueDate, 3)) return 'h+3';
  if (today === addDays(dueDate, 7)) return 'h+7';
  return null;
}

/** Hari keterlambatan (0 bila belum lewat jatuh tempo). */
export function daysOverdue(dueDate: IsoDate, today: IsoDate): number {
  const a = parseIsoDate(dueDate);
  const b = parseIsoDate(today);
  const diff = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
  return Math.max(0, diff);
}

export const INVOICE_KIND_LABEL = {
  recurring: 'Iuran',
  registration: 'Registrasi',
  one_time: 'Biaya lain',
} as const;
