import { describe, expect, it } from 'vitest';
import { formatRupiah, formatRupiahRingkas } from './rupiah.js';

describe('formatRupiah', () => {
  it.each([
    [0, 'Rp0'],
    [500, 'Rp500'],
    [350_000, 'Rp350.000'],
    [6_241_500, 'Rp6.241.500'],
    [118_850_000, 'Rp118.850.000'],
    [-25_000, '−Rp25.000'],
  ])('%d → %s', (input, expected) => {
    expect(formatRupiah(input)).toBe(expected);
  });

  it('menerima bigint dari database', () => {
    expect(formatRupiah(9_007_199_254_740_993n)).toBe('Rp9.007.199.254.740.993');
  });

  it('menolak pecahan (uang tidak boleh float)', () => {
    expect(() => formatRupiah(350_000.5)).toThrow(RangeError);
  });
});

describe('formatRupiahRingkas', () => {
  it.each([
    [44_100_000, 'Rp44,1 jt'],
    [38_600_000, 'Rp38,6 jt'],
    [3_000_000, 'Rp3 jt'],
    [1_500_000_000, 'Rp1,5 M'],
    [750_000, 'Rp750.000'],
  ])('%d → %s', (input, expected) => {
    expect(formatRupiahRingkas(input)).toBe(expected);
  });
});
