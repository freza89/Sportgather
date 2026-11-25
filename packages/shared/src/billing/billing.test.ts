import { describe, expect, it } from 'vitest';
import {
  allocate,
  checkoutBreakdown,
  daysOverdue,
  dueDateFor,
  invoiceAmounts,
  invoiceNumber,
  issueDateFor,
  nextPeriod,
  periodLabel,
  reminderStage,
  serviceFee,
  withdrawalCheck,
} from './billing.js';

describe('periode & nomor tagihan', () => {
  it('format sesuai desain A-14', () => {
    expect(invoiceNumber('2027-10', 142)).toBe('INV-2710-0142');
    expect(periodLabel('2027-10')).toBe('Oktober 2027');
    expect(nextPeriod('2027-12')).toBe('2028-01');
  });

  it('tanggal terbit dijepit ke akhir bulan; jatuh tempo +N hari', () => {
    expect(issueDateFor('2027-10', 1)).toBe('2027-10-01');
    expect(issueDateFor('2027-02', 31)).toBe('2027-02-28');
    expect(issueDateFor('2028-02', 30)).toBe('2028-02-29');
    expect(dueDateFor('2027-10-01', 9)).toBe('2027-10-10');
  });
});

describe('beasiswa (FEE-01)', () => {
  it.each([
    [350_000, 0, 350_000],
    [350_000, 50, 175_000],
    [350_000, 100, 0],
    [250_000, 33, 167_500],
    [333_333, 50, 166_666],
  ])('%d − %d%% = %d', (amount, pct, total) => {
    const r = invoiceAmounts(amount, pct);
    expect(r.total).toBe(total);
    expect(r.amount - r.discount).toBe(r.total);
  });

  it('menolak nominal pecahan/negatif', () => {
    expect(() => invoiceAmounts(1.5)).toThrow();
    expect(() => invoiceAmounts(-1)).toThrow();
  });
});

describe('biaya layanan (keputusan Q5, ADR-016)', () => {
  it('VA flat, e-wallet persen (dibulatkan ke atas)', () => {
    expect(serviceFee('bca_va', 575_000)).toBe(4_000);
    expect(serviceFee('gopay', 575_001)).toBe(11_501);
  });

  it('QRIS: tanpa biaya layanan bila dimatikan; ikut bila dinyalakan', () => {
    expect(serviceFee('qris', 575_000)).toBe(0);
    expect(serviceFee('qris', 575_000, { platformFee: 2500, qrisSurchargeEnabled: true })).toBe(
      4_025,
    );
  });
});

describe('alokasi sisa terbesar', () => {
  it('jumlah selalu tepat', () => {
    expect(allocate(2500, [350_000, 250_000])).toEqual([1458, 1042]);
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(100, [0, 0])).toEqual([100, 0]);
  });
});

describe('pembagian dana per tagihan (US-13)', () => {
  it('VA: wali menanggung biaya Midtrans; klub dipotong fee platform saja', () => {
    const b = checkoutBreakdown(
      [
        { id: 'zaki', total: 350_000 },
        { id: 'nadia', total: 250_000 },
      ],
      'bca_va',
    );
    expect(b).toMatchObject({
      base: 600_000,
      serviceFee: 4_000,
      gross: 604_000,
      midtransFee: 4_000,
      clubNet: 597_500,
    });
    expect(b.perInvoice.map((p) => p.clubNet)).toEqual([348_542, 248_958]);
  });

  it('QRIS tanpa biaya layanan: biaya Midtrans ditanggung klub, terlacak per tagihan', () => {
    const b = checkoutBreakdown([{ id: 'a', total: 350_000 }], 'qris');
    expect(b).toMatchObject({ serviceFee: 0, gross: 350_000, midtransFee: 2_450 });
    expect(b.perInvoice[0]).toMatchObject({
      platformFee: 2_500,
      midtransFeeBorneByClub: 2_450,
      clubNet: 345_050,
    });
  });

  it('setiap rupiah tertelusur: gross = klub + fee platform + biaya Midtrans', () => {
    for (const method of ['qris', 'bca_va', 'gopay', 'shopeepay'] as const) {
      const b = checkoutBreakdown(
        [
          { id: 'x', total: 333_333 },
          { id: 'y', total: 125_000 },
        ],
        method,
      );
      expect(b.clubNet + b.platformFee + b.midtransFee, method).toBe(b.gross);
    }
  });
});

describe('penarikan dana (ADR-016)', () => {
  it('minimal, saldo, dan biaya transfer', () => {
    expect(withdrawalCheck(1_000_000, 2_000_000)).toEqual({ ok: true, net: 997_500 });
    expect(withdrawalCheck(10_000, 2_000_000)).toMatchObject({ ok: false });
    expect(withdrawalCheck(3_000_000, 2_000_000)).toMatchObject({
      ok: false,
      message: 'Melebihi saldo yang bisa ditarik',
    });
  });
});

describe('pengingat tagihan (PRD bagian 16)', () => {
  it('H-3, H, H+3, H+7', () => {
    expect(reminderStage('2027-10-10', '2027-10-07')).toBe('h-3');
    expect(reminderStage('2027-10-10', '2027-10-10')).toBe('h');
    expect(reminderStage('2027-10-10', '2027-10-13')).toBe('h+3');
    expect(reminderStage('2027-10-10', '2027-10-17')).toBe('h+7');
    expect(reminderStage('2027-10-10', '2027-10-11')).toBeNull();
    expect(daysOverdue('2027-10-10', '2027-10-22')).toBe(12);
    expect(daysOverdue('2027-10-10', '2027-10-01')).toBe(0);
  });
});
