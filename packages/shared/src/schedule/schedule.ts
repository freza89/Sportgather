/**
 * Jadwal & absensi (SCH-01..03, ATT-01) — fungsi murni.
 * Zona waktu Indonesia tidak memakai DST, jadi offset tetap: WIB +7, WITA +8, WIT +9.
 */
import type { ZonaWaktu } from '../format/zona-waktu.js';
import { parseIsoDate, type IsoDate } from '../ku/ku.js';

export const ZONE_OFFSET_HOURS: Record<ZonaWaktu, number> = {
  'Asia/Jakarta': 7,
  'Asia/Makassar': 8,
  'Asia/Jayapura': 9,
};

/** "2027-10-12" + "16:00" di zona cabang → Date (UTC). */
export function localToUtc(date: IsoDate, time: string, zone: ZonaWaktu): Date {
  const { y, m, d } = parseIsoDate(date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) throw new RangeError(`Jam tidak valid: ${time}`);
  const [hh, mm] = [Number(match[1]), Number(match[2])];
  if (hh > 23 || mm > 59) throw new RangeError(`Jam tidak valid: ${time}`);
  return new Date(Date.UTC(y, m - 1, d, hh - ZONE_OFFSET_HOURS[zone], mm));
}

/** Tanggal kalender (ISO) sebuah instan di zona cabang. */
export function utcToLocalDate(instant: Date, zone: ZonaWaktu): IsoDate {
  const shifted = new Date(instant.getTime() + ZONE_OFFSET_HOURS[zone] * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

/** Jam lokal "HH:MM" sebuah instan di zona cabang. */
export function utcToLocalTime(instant: Date, zone: ZonaWaktu): string {
  const shifted = new Date(instant.getTime() + ZONE_OFFSET_HOURS[zone] * 3_600_000);
  return shifted.toISOString().slice(11, 16);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { y, m, d } = parseIsoDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Minggu … 6 = Sabtu. */
export function weekdayOf(date: IsoDate): number {
  const { y, m, d } = parseIsoDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const;
export const WEEKDAY_LONG = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
] as const;

export interface WeeklyPattern {
  weekday: number;
  startTime: string;
  durationMin: number;
  zone: ZonaWaktu;
}

export interface Occurrence {
  occurrenceDate: IsoDate;
  startsAt: Date;
  endsAt: Date;
}

/**
 * US-07: pola mingguan menghasilkan sesi dari `from` sampai `until` (akhir musim),
 * melewati tanggal libur.
 */
export function weeklyOccurrences(
  pattern: WeeklyPattern,
  from: IsoDate,
  until: IsoDate,
  holidays: ReadonlySet<IsoDate> = new Set(),
): Occurrence[] {
  const out: Occurrence[] = [];
  let date = addDays(from, (pattern.weekday - weekdayOf(from) + 7) % 7);
  while (date <= until) {
    if (!holidays.has(date)) {
      const startsAt = localToUtc(date, pattern.startTime, pattern.zone);
      out.push({
        occurrenceDate: date,
        startsAt,
        endsAt: new Date(startsAt.getTime() + pattern.durationMin * 60_000),
      });
    }
    date = addDays(date, 7);
  }
  return out;
}

/** US-08: RSVP terkunci 2 jam sebelum sesi. */
export const RSVP_LOCK_MINUTES = 120;

export function rsvpOpen(startsAt: Date, now: Date): boolean {
  return now.getTime() < startsAt.getTime() - RSVP_LOCK_MINUTES * 60_000;
}

export type RsvpStatus = 'hadir' | 'izin' | 'sakit';
export type AttendanceStatus = 'hadir' | 'izin' | 'sakit' | 'alpa';

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
};
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Alpa',
};

/** US-09: absensi default diisi dari RSVP (belum RSVP = kosong, pelatih yang menentukan). */
export function defaultAttendance(rsvp: RsvpStatus | null | undefined): AttendanceStatus | null {
  return rsvp ?? null;
}

export const EVENT_KIND_LABEL = {
  training: 'Latihan',
  match: 'Pertandingan',
  tournament: 'Turnamen',
  assessment: 'Ujian kenaikan level',
  other: 'Kegiatan',
} as const;
export type EventKind = keyof typeof EVENT_KIND_LABEL;

/** "15.30 – 17.00" di zona cabang. */
export function formatTimeRange(startsAt: Date, endsAt: Date, zone: ZonaWaktu): string {
  return `${utcToLocalTime(startsAt, zone).replace(':', '.')} – ${utcToLocalTime(endsAt, zone).replace(':', '.')}`;
}

/** Pengingat H-1 pukul 17.00 waktu cabang (PRD bagian 16). */
export const REMINDER_LOCAL_TIME = '17:00';
/** Tidak ada notifikasi otomatis 21.00–06.00 waktu lokal (kecuali OTP). */
export function withinQuietHours(instant: Date, zone: ZonaWaktu): boolean {
  const hour = Number(utcToLocalTime(instant, zone).slice(0, 2));
  return hour >= 21 || hour < 6;
}
