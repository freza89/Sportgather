import { isValidIsoDate, type IsoDate } from '../ku/ku.js';

/**
 * Tanggal lahir dari spreadsheet klub: "12/03/2015", "12-3-2015", "2015-03-12",
 * "12 Mar 2015", "12 Maret 2015". Format Indonesia: hari dulu, lalu bulan.
 */
const MONTHS: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mar: 3,
  maret: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  agu: 8,
  agt: 8,
  agustus: 8,
  aug: 8,
  sep: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
  dec: 12,
};

export function parseImportDate(raw: string | null | undefined): IsoDate | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  let y: number, m: number, d: number;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(v))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/.exec(v)) && MONTHS[match[2]!]) {
    [d, m, y] = [Number(match[1]), MONTHS[match[2]!]!, Number(match[3])];
  } else {
    return null;
  }
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** "L", "Laki-laki", "Pria", "M" → male; "P", "Perempuan", "Wanita", "F" → female. */
export function parseImportGender(raw: string | null | undefined): 'male' | 'female' | null {
  const v = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (['l', 'lk', 'lakilaki', 'laki', 'pria', 'm', 'male', 'cowok'].includes(v)) return 'male';
  if (['p', 'pr', 'perempuan', 'wanita', 'f', 'female', 'cewek'].includes(v)) return 'female';
  return null;
}

/** Kunci pencocokan duplikat (nama + tanggal lahir), tidak peka spasi/kapital. */
export function duplicateKey(fullName: string, birthDate: string): string {
  return `${fullName.trim().toLowerCase().replace(/\s+/g, ' ')}|${birthDate}`;
}

/** Tebakan pemetaan kolom Excel → field SportGather dari judul kolom (A-04). */
export function guessImportField(header: string): string | null {
  const h = header.trim().toLowerCase();
  if (/(no\.?\s*)?(hp|wa|whatsapp|telp|telepon|ponsel)/.test(h)) return 'guardianPhone';
  if (/(ortu|orang tua|wali|ayah|ibu)/.test(h)) return 'guardianName';
  if (/(tgl|tanggal).*(lahir)|lahir|birth|dob/.test(h)) return 'birthDate';
  if (/^(jk|l\/p|gender|jenis kelamin|kelamin|sex)$/.test(h)) return 'gender';
  if (/sekolah|school/.test(h)) return 'school';
  if (/nama|name/.test(h)) return 'fullName';
  return null;
}
