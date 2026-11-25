import { describe, expect, it } from 'vitest';
import {
  attendancePct,
  averageScore,
  canEditAssessment,
  DEFAULT_BASKETBALL_SKILLS,
  formatScore,
  semesterOf,
  semesterRange,
} from './development.js';

describe('semester musim', () => {
  const season = { startsOn: '2027-07-01', endsOn: '2028-06-30' };
  it('membagi musim menjadi dua tanpa celah/tumpang-tindih', () => {
    const s1 = semesterRange(season, 1);
    const s2 = semesterRange(season, 2);
    expect(s1.from).toBe('2027-07-01');
    expect(s2.to).toBe('2028-06-30');
    expect(s1.to < s2.from).toBe(true);
    expect(semesterOf(season, s1.to)).toBe(1);
    expect(semesterOf(season, s2.from)).toBe(2);
  });
});

describe('aturan ubah penilaian (US-15)', () => {
  const created = new Date('2027-10-01T10:00:00Z');
  it('pembuat boleh mengubah dalam 7 hari', () => {
    expect(
      canEditAssessment(
        { assessedBy: 'a', createdAt: created },
        'a',
        new Date('2027-10-08T09:00:00Z'),
      ),
    ).toBe(true);
  });
  it('lewat 7 hari atau orang lain → tidak boleh', () => {
    expect(
      canEditAssessment(
        { assessedBy: 'a', createdAt: created },
        'a',
        new Date('2027-10-08T11:00:00Z'),
      ),
    ).toBe(false);
    expect(canEditAssessment({ assessedBy: 'a', createdAt: created }, 'b', created)).toBe(false);
  });
});

describe('ringkasan rapor', () => {
  it('rata-rata satu desimal dan persen kehadiran', () => {
    expect(averageScore([4, 4, 3, 4, 4])).toBe(3.8);
    expect(averageScore([])).toBeNull();
    expect(formatScore(3.8)).toBe('3,8');
    expect(attendancePct(46, 50)).toBe(92);
    expect(attendancePct(0, 0)).toBeNull();
  });
  it('template basket punya skill untuk setiap KU7–KU16', () => {
    for (let ku = 7; ku <= 16; ku++)
      expect(
        DEFAULT_BASKETBALL_SKILLS.filter((s) => s.kuMin <= ku && ku <= s.kuMax).length,
      ).toBeGreaterThanOrEqual(5);
  });
});
