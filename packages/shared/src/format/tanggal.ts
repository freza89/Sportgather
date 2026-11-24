import { ZONA_WAKTU_DEFAULT, type ZonaWaktu } from './zona-waktu.js';

const BULAN_PENDEK = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;
const BULAN_PANJANG = [
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
] as const;
const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const;
const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

/** Tanggal kalender tanpa jam (tanggal lahir, tanggal acuan KU). */
export interface TanggalLokal {
  year: number;
  month: number; // 1–12
  day: number;
}

interface Bagian {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0 = Minggu
  hour: number;
  minute: number;
}

function bagianDi(instant: Date, zona: ZonaWaktu): Bagian {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdays.indexOf(get('weekday')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function isTanggalLokal(value: Date | TanggalLokal): value is TanggalLokal {
  return !(value instanceof Date);
}

function hariDalamMinggu({ year, month, day }: TanggalLokal): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** `12 Okt 2027` */
export function formatTanggal(
  value: Date | TanggalLokal,
  zona: ZonaWaktu = ZONA_WAKTU_DEFAULT,
): string {
  const b = isTanggalLokal(value) ? value : bagianDi(value, zona);
  return `${b.day} ${BULAN_PENDEK[b.month - 1]} ${b.year}`;
}

/** `12 Oktober 2027` */
export function formatTanggalPanjang(
  value: Date | TanggalLokal,
  zona: ZonaWaktu = ZONA_WAKTU_DEFAULT,
): string {
  const b = isTanggalLokal(value) ? value : bagianDi(value, zona);
  return `${b.day} ${BULAN_PANJANG[b.month - 1]} ${b.year}`;
}

/** `Sel 12 Okt` */
export function formatHariTanggal(
  value: Date | TanggalLokal,
  zona: ZonaWaktu = ZONA_WAKTU_DEFAULT,
): string {
  const b = isTanggalLokal(value)
    ? { ...value, weekday: hariDalamMinggu(value) }
    : bagianDi(value, zona);
  return `${HARI_PENDEK[b.weekday]} ${b.day} ${BULAN_PENDEK[b.month - 1]}`;
}

/** `Selasa, 12 Okt 2027` */
export function formatHariTanggalPanjang(
  value: Date,
  zona: ZonaWaktu = ZONA_WAKTU_DEFAULT,
): string {
  const b = bagianDi(value, zona);
  return `${HARI_PANJANG[b.weekday]}, ${b.day} ${BULAN_PENDEK[b.month - 1]} ${b.year}`;
}

/** `16.00` (format jam Indonesia memakai titik). */
export function formatJam(value: Date, zona: ZonaWaktu = ZONA_WAKTU_DEFAULT): string {
  const b = bagianDi(value, zona);
  return `${String(b.hour).padStart(2, '0')}.${String(b.minute).padStart(2, '0')}`;
}

/** `16.00 – 17.30` */
export function formatRentangJam(
  mulai: Date,
  selesai: Date,
  zona: ZonaWaktu = ZONA_WAKTU_DEFAULT,
): string {
  return `${formatJam(mulai, zona)} – ${formatJam(selesai, zona)}`;
}

/** `Oktober 2027` */
export function formatBulanTahun(
  value: Date | TanggalLokal,
  zona: ZonaWaktu = ZONA_WAKTU_DEFAULT,
): string {
  const b = isTanggalLokal(value) ? value : bagianDi(value, zona);
  return `${BULAN_PANJANG[b.month - 1]} ${b.year}`;
}
