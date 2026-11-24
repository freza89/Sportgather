/**
 * Nominal uang selalu integer rupiah (tanpa sen). Di database disimpan sebagai bigint;
 * di batas API dikirim sebagai number (aman sampai Number.MAX_SAFE_INTEGER ≈ 9 kuadriliun).
 */
export type Rupiah = number;

export function assertRupiah(value: number): asserts value is Rupiah {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Nominal rupiah harus bilangan bulat aman, diterima: ${value}`);
  }
}

/** Format `350000` → `Rp350.000`, `-25000` → `−Rp25.000` (sesuai desain). */
export function formatRupiah(value: number | bigint): string {
  const big = typeof value === 'bigint' ? value : BigInt(toSafeInteger(value));
  const negative = big < 0n;
  const digits = (negative ? -big : big).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}Rp${grouped}`;
}

/** Format ringkas untuk kartu statistik: `44100000` → `Rp44,1 jt`. */
export function formatRupiahRingkas(value: number): string {
  const abs = Math.abs(toSafeInteger(value));
  const sign = value < 0 ? '−' : '';
  const units: [number, string][] = [
    [1_000_000_000_000, 'T'],
    [1_000_000_000, 'M'],
    [1_000_000, 'jt'],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      const scaled = Math.round((abs / size) * 10) / 10;
      const text = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1).replace('.', ',');
      return `${sign}Rp${text} ${label}`;
    }
  }
  return formatRupiah(value);
}

function toSafeInteger(value: number): number {
  assertRupiah(value);
  return value;
}
