/**
 * Pembinaan (DEV-01..03) — fungsi murni: template skill basket bawaan, semester musim,
 * aturan ubah penilaian, dan ringkasan rapor.
 */
import { addDays } from '../schedule/schedule.js';
import { parseIsoDate, type IsoDate } from '../ku/ku.js';

export interface SkillTemplate {
  name: string;
  description: string;
  kuMin: number;
  kuMax: number;
}

/** Template basket bawaan (DEV-01). Klub bisa menonaktifkan/menambah skill. */
export const DEFAULT_BASKETBALL_SKILLS: SkillTemplate[] = [
  { name: 'Dribel', description: 'Kontrol bola dua tangan, kepala tegak', kuMin: 7, kuMax: 16 },
  {
    name: 'Passing',
    description: 'Chest, bounce, dan overhead pass tepat sasaran',
    kuMin: 7,
    kuMax: 16,
  },
  {
    name: 'Shooting',
    description: 'Lay-up dan tembakan jarak dekat–menengah',
    kuMin: 7,
    kuMax: 16,
  },
  {
    name: 'Koordinasi gerak',
    description: 'Keseimbangan, kelincahan, footwork dasar',
    kuMin: 7,
    kuMax: 10,
  },
  { name: 'Defense', description: 'Sikap bertahan, slide, menjaga lawan', kuMin: 11, kuMax: 16 },
  { name: 'Rebound', description: 'Box-out dan merebut bola pantul', kuMin: 13, kuMax: 16 },
  {
    name: 'Pemahaman permainan',
    description: 'Membaca situasi, spacing, keputusan',
    kuMin: 13,
    kuMax: 16,
  },
  {
    name: 'Kerja sama tim',
    description: 'Komunikasi, sportivitas, sikap latihan',
    kuMin: 7,
    kuMax: 16,
  },
];

export type Semester = 1 | 2;

const dayNumber = (d: IsoDate) => {
  const p = parseIsoDate(d);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
};

/** Musim dibagi dua semester sama panjang; semester 2 mulai sehari setelah titik tengah. */
export function semesterRange(
  season: { startsOn: IsoDate; endsOn: IsoDate },
  semester: Semester,
): { from: IsoDate; to: IsoDate } {
  const total = dayNumber(season.endsOn) - dayNumber(season.startsOn);
  const mid = addDays(season.startsOn, Math.floor(total / 2));
  return semester === 1
    ? { from: season.startsOn, to: mid }
    : { from: addDays(mid, 1), to: season.endsOn };
}

export function semesterOf(
  season: { startsOn: IsoDate; endsOn: IsoDate },
  date: IsoDate,
): Semester {
  return date <= semesterRange(season, 1).to ? 1 : 2;
}

export const ASSESSMENT_EDIT_DAYS = 7;

/** US-15: penilaian hanya bisa diubah pembuatnya dalam 7 hari sejak pertama disimpan. */
export function canEditAssessment(
  a: { assessedBy: string; createdAt: Date },
  personId: string,
  now = new Date(),
): boolean {
  return (
    a.assessedBy === personId &&
    now.getTime() - a.createdAt.getTime() <= ASSESSMENT_EDIT_DAYS * 86_400_000
  );
}

/** Rata-rata skor dengan satu desimal (null bila belum ada skor). */
export function averageScore(scores: number[]): number | null {
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

/** Persentase kehadiran: hadir / (sesi yang diabsen, tidak termasuk dibatalkan). */
export function attendancePct(attended: number, total: number): number | null {
  return total ? Math.round((attended / total) * 100) : null;
}

/** Format "3,8" (desimal koma). */
export function formatScore(v: number | null): string {
  return v === null ? '–' : v.toFixed(1).replace('.', ',');
}
