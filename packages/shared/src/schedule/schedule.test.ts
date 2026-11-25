import { describe, expect, it } from 'vitest';
import {
  addDays,
  defaultAttendance,
  formatTimeRange,
  localToUtc,
  rsvpOpen,
  utcToLocalDate,
  utcToLocalTime,
  weekdayOf,
  weeklyOccurrences,
  withinQuietHours,
} from './schedule.js';

describe('zona waktu cabang', () => {
  it('16.00 WIB = 09.00 UTC; WITA +8; WIT +9', () => {
    expect(localToUtc('2027-10-12', '16:00', 'Asia/Jakarta').toISOString()).toBe(
      '2027-10-12T09:00:00.000Z',
    );
    expect(localToUtc('2027-10-12', '16:00', 'Asia/Makassar').toISOString()).toBe(
      '2027-10-12T08:00:00.000Z',
    );
    expect(localToUtc('2027-10-12', '06:00', 'Asia/Jayapura').toISOString()).toBe(
      '2027-10-11T21:00:00.000Z',
    );
  });

  it('kembali ke tanggal & jam lokal', () => {
    const t = new Date('2027-10-11T21:00:00Z');
    expect(utcToLocalDate(t, 'Asia/Jayapura')).toBe('2027-10-12');
    expect(utcToLocalTime(t, 'Asia/Jayapura')).toBe('06:00');
    expect(
      formatTimeRange(
        new Date('2027-10-12T09:00:00Z'),
        new Date('2027-10-12T10:30:00Z'),
        'Asia/Jakarta',
      ),
    ).toBe('16.00 – 17.30');
  });

  it('menolak jam tidak valid', () => {
    expect(() => localToUtc('2027-10-12', '25:00', 'Asia/Jakarta')).toThrow(RangeError);
  });
});

describe('jadwal berulang (US-07)', () => {
  it('menghasilkan sesi tiap minggu sampai akhir musim', () => {
    // Selasa 16.00, 90 menit, dari Senin 11 Okt sampai 31 Des 2027.
    const occ = weeklyOccurrences(
      { weekday: 2, startTime: '16:00', durationMin: 90, zone: 'Asia/Jakarta' },
      '2027-10-11',
      '2027-12-31',
    );
    expect(occ[0]).toMatchObject({ occurrenceDate: '2027-10-12' });
    expect(occ[0]!.endsAt.toISOString()).toBe('2027-10-12T10:30:00.000Z');
    expect(occ.at(-1)!.occurrenceDate).toBe('2027-12-28');
    expect(occ).toHaveLength(12);
    expect(occ.every((o) => weekdayOf(o.occurrenceDate) === 2)).toBe(true);
  });

  it('tanggal libur meniadakan sesi', () => {
    const occ = weeklyOccurrences(
      { weekday: 5, startTime: '17:30', durationMin: 90, zone: 'Asia/Jakarta' },
      '2027-10-11',
      '2027-10-31',
      new Set(['2027-10-15']),
    );
    expect(occ.map((o) => o.occurrenceDate)).toEqual(['2027-10-22', '2027-10-29']);
  });

  it('hari mulai = hari pola ikut dihitung', () => {
    const occ = weeklyOccurrences(
      {
        weekday: weekdayOf('2027-10-12'),
        startTime: '08:00',
        durationMin: 60,
        zone: 'Asia/Jakarta',
      },
      '2027-10-12',
      '2027-10-12',
    );
    expect(occ).toHaveLength(1);
  });

  it('addDays melewati akhir bulan/tahun', () => {
    expect(addDays('2027-12-30', 3)).toBe('2028-01-02');
  });
});

describe('RSVP & absensi', () => {
  const start = new Date('2027-10-14T08:30:00Z'); // 15.30 WIB
  it('RSVP terkunci 2 jam sebelum sesi (US-08)', () => {
    expect(rsvpOpen(start, new Date('2027-10-14T06:29:00Z'))).toBe(true);
    expect(rsvpOpen(start, new Date('2027-10-14T06:30:00Z'))).toBe(false);
    expect(rsvpOpen(start, new Date('2027-10-14T09:00:00Z'))).toBe(false);
  });

  it('absensi default dari RSVP (US-09)', () => {
    expect(defaultAttendance('izin')).toBe('izin');
    expect(defaultAttendance(null)).toBeNull();
  });

  it('jam tenang 21.00–06.00 waktu lokal', () => {
    expect(withinQuietHours(new Date('2027-10-14T14:30:00Z'), 'Asia/Jakarta')).toBe(true); // 21.30 WIB
    expect(withinQuietHours(new Date('2027-10-14T10:00:00Z'), 'Asia/Jakarta')).toBe(false); // 17.00 WIB
  });
});
