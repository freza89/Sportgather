import { describe, expect, it } from 'vitest';
import {
  formatBulanTahun,
  formatHariTanggal,
  formatHariTanggalPanjang,
  formatJam,
  formatRentangJam,
  formatTanggal,
  formatTanggalPanjang,
} from './tanggal.js';

// 12 Okt 2027 16.00 WIB = 09.00 UTC
const sesi = new Date('2027-10-12T09:00:00Z');

describe('format tanggal Indonesia', () => {
  it('format tanggal pendek sesuai desain', () => {
    expect(formatTanggal(sesi)).toBe('12 Okt 2027');
    expect(formatTanggal({ year: 2015, month: 3, day: 12 })).toBe('12 Mar 2015');
  });

  it('format panjang & hari', () => {
    expect(formatTanggalPanjang({ year: 2015, month: 3, day: 12 })).toBe('12 Maret 2015');
    expect(formatHariTanggal(sesi)).toBe('Sel 12 Okt');
    expect(formatHariTanggal({ year: 2027, month: 10, day: 14 })).toBe('Kam 14 Okt');
    expect(formatHariTanggalPanjang(sesi)).toBe('Selasa, 12 Okt 2027');
    expect(formatBulanTahun(sesi)).toBe('Oktober 2027');
  });

  it('jam memakai titik dan mengikuti zona waktu cabang', () => {
    expect(formatJam(sesi)).toBe('16.00');
    expect(formatJam(sesi, 'Asia/Makassar')).toBe('17.00');
    expect(formatJam(sesi, 'Asia/Jayapura')).toBe('18.00');
    expect(formatRentangJam(sesi, new Date('2027-10-12T10:30:00Z'))).toBe('16.00 – 17.30');
  });

  it('pergantian hari dihitung di zona cabang, bukan UTC', () => {
    // 31 Des 2027 18.00 UTC = 1 Jan 2028 01.00 WIB
    const malam = new Date('2027-12-31T18:00:00Z');
    expect(formatTanggal(malam)).toBe('1 Jan 2028');
  });
});

describe('formatTanggalIso', () => {
  it('format tanggal kalender ISO', async () => {
    const { formatTanggalIso } = await import('./tanggal.js');
    expect(formatTanggalIso('2015-03-12')).toBe('12 Mar 2015');
    expect(formatTanggalIso('2015-03-12', true)).toBe('12 Maret 2015');
    expect(formatTanggalIso(null)).toBe('—');
  });
});
