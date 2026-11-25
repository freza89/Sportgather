/** Zona waktu yang didukung per cabang (PRD bagian 8). */
export const ZONA_WAKTU = {
  'Asia/Jakarta': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
} as const;

export type ZonaWaktu = keyof typeof ZONA_WAKTU;
export type LabelZonaWaktu = (typeof ZONA_WAKTU)[ZonaWaktu];

export const ZONA_WAKTU_DEFAULT: ZonaWaktu = 'Asia/Jakarta';

export function isZonaWaktu(value: string): value is ZonaWaktu {
  return Object.hasOwn(ZONA_WAKTU, value);
}

export function labelZonaWaktu(zona: ZonaWaktu): LabelZonaWaktu {
  return ZONA_WAKTU[zona];
}
