/**
 * Mesin kelompok umur (KU) — PRD bagian 4. Fungsi murni: tanpa I/O, tanpa Date.now().
 *
 * Aturan default `MAX_N` (keputusan 25 Nov 2026, sesuai tabel PRD): KU-N berisi pemain
 * yang berusia MAKSIMAL N tahun pada tanggal acuan (tanggal kompetisi), mis. KU12 = 11–12
 * tahun pada kelompok dua tahunan. Aturan `UNDER_N` (opsional, untuk kompetisi yang
 * memakai konvensi "di bawah N tahun") berisi pemain berusia < N tahun.
 *
 * Tanggal ditulis sebagai string ISO "YYYY-MM-DD" (tanggal kalender, tanpa zona waktu).
 */

export type AgeRule = 'UNDER_N' | 'MAX_N';
export type IsoDate = string;

/** Kelompok default dua tahunan (keputusan Q1). KU7 opsional per klub/kompetisi. */
export const DEFAULT_KU_GROUPS = [8, 10, 12, 14, 16] as const;
export const OPTIONAL_KU7 = 7;

export interface KuConfig {
  rule: AgeRule;
  /** Nilai N tiap kelompok, mis. [8, 10, 12, 14, 16]. */
  groups: readonly number[];
}

export const DEFAULT_KU_CONFIG: KuConfig = { rule: 'MAX_N', groups: DEFAULT_KU_GROUPS };

interface Ymd {
  y: number;
  m: number;
  d: number;
}

export function parseIsoDate(value: IsoDate): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Tanggal tidak valid: ${value}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new RangeError(`Tanggal tidak valid: ${value}`);
  }
  return { y, m, d };
}

export function isValidIsoDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Usia (tahun & bulan penuh) pada tanggal acuan.
 * Lahir 29 Februari: di tahun bukan kabisat, ulang tahun dihitung jatuh pada 1 Maret
 * (bertambah usia setelah 28 Februari berlalu).
 */
export function ageOn(birth: IsoDate, reference: IsoDate): { years: number; months: number } {
  const b = parseIsoDate(birth);
  const r = parseIsoDate(reference);
  if (r.y * 10_000 + r.m * 100 + r.d < b.y * 10_000 + b.m * 100 + b.d) {
    throw new RangeError('Tanggal acuan sebelum tanggal lahir');
  }
  // Hari ulang tahun efektif di tahun acuan.
  const bdMonth = b.m === 2 && b.d === 29 && !isLeap(r.y) ? 3 : b.m;
  const bdDay = b.m === 2 && b.d === 29 && !isLeap(r.y) ? 1 : b.d;
  let years = r.y - b.y;
  if (r.m < bdMonth || (r.m === bdMonth && r.d < bdDay)) years -= 1;

  let months = r.m - b.m;
  if (r.d < b.d) months -= 1;
  months = ((months % 12) + 12) % 12;
  return { years, months };
}

/**
 * KU pemain pada tanggal acuan: kelompok terkecil yang memenuhi aturan.
 * Mengembalikan `null` bila pemain sudah melewati kelompok tertua (lulus KU16).
 * Pemain yang lebih muda dari kelompok termuda masuk kelompok termuda.
 */
export function kuFor(
  birth: IsoDate,
  reference: IsoDate,
  config: KuConfig = DEFAULT_KU_CONFIG,
): number | null {
  const { years } = ageOn(birth, reference);
  const groups = [...config.groups].sort((a, b) => a - b);
  for (const n of groups) {
    if (config.rule === 'UNDER_N' ? years < n : years <= n) return n;
  }
  return null;
}

export type Placement = 'same' | 'play_up' | 'play_down' | 'over_age';

/** Bandingkan KU asli pemain dengan KU tim tujuan. */
export function classifyPlacement(actualKu: number | null, teamKu: number): Placement {
  if (actualKu === null) return 'over_age';
  if (teamKu === actualKu) return 'same';
  return teamKu > actualKu ? 'play_up' : 'play_down';
}

export interface PlacementCheck {
  allowed: boolean;
  needsReason: boolean;
  /** Hanya owner yang boleh menyetujui (play-down / melewati batas usia). */
  ownerOnly: boolean;
  message: string | null;
}

/**
 * Aturan penempatan (US-06): play-up wajib alasan; play-down & pemain lewat usia
 * diblokir kecuali owner memberi override dengan alasan (keputusan Q2).
 */
export function checkPlacement(
  placement: Placement,
  actor: { isOwner: boolean },
  reason: string | null | undefined,
): PlacementCheck {
  const hasReason = Boolean(reason && reason.trim().length >= 3);
  switch (placement) {
    case 'same':
      return { allowed: true, needsReason: false, ownerOnly: false, message: null };
    case 'play_up':
      return hasReason
        ? { allowed: true, needsReason: true, ownerOnly: false, message: null }
        : {
            allowed: false,
            needsReason: true,
            ownerOnly: false,
            message: 'Play-up wajib disertai alasan',
          };
    case 'play_down':
    case 'over_age': {
      const label = placement === 'play_down' ? 'Play-down' : 'Pemain melewati batas usia KU tim';
      if (!actor.isOwner) {
        return {
          allowed: false,
          needsReason: true,
          ownerOnly: true,
          message: `${label} butuh persetujuan owner`,
        };
      }
      return hasReason
        ? { allowed: true, needsReason: true, ownerOnly: true, message: null }
        : {
            allowed: false,
            needsReason: true,
            ownerOnly: true,
            message: `${label} wajib disertai alasan`,
          };
    }
  }
}

/** Tanggal acuan: tanggal kompetisi utama musim; cadangan 31 Desember tahun berakhirnya musim. */
export function referenceDate(
  season: { endsOn: IsoDate },
  primaryCompetition?: { referenceDate: IsoDate } | null,
): IsoDate {
  if (primaryCompetition) return primaryCompetition.referenceDate;
  return `${parseIsoDate(season.endsOn).y}-12-31`;
}

export function kuLabel(n: number | null): string {
  return n === null ? 'Lulus' : `KU${n}`;
}

/** "12 th 3 bln" */
export function formatAge(age: { years: number; months: number }): string {
  return `${age.years} th ${age.months} bln`;
}

export type PromotionStatus = 'naik' | 'tetap' | 'lulus' | 'perlu_keputusan';

export interface PromotionInput {
  id: string;
  birthDate: IsoDate;
  /** KU tim saat ini (bisa berbeda dari KU asli bila play-up). */
  currentTeamKu: number | null;
  currentPlacement: Placement | null;
}

export interface PromotionProposal {
  id: string;
  oldKu: number | null;
  newKu: number | null;
  status: PromotionStatus;
}

/**
 * Usulan kenaikan KU massal saat ganti musim (A-11, KU-02). Pemain play-up/down atau yang
 * lulus kelompok tertua ditandai "perlu keputusan" agar ditinjau admin.
 */
export function proposePromotions(
  players: PromotionInput[],
  oldReference: IsoDate,
  newReference: IsoDate,
  config: KuConfig = DEFAULT_KU_CONFIG,
  newConfig: KuConfig = config,
): PromotionProposal[] {
  return players.map((p) => {
    const oldKu = kuFor(p.birthDate, oldReference, config);
    const newKu = kuFor(p.birthDate, newReference, newConfig);
    let status: PromotionStatus;
    if (newKu === null) status = 'lulus';
    else if (
      p.currentPlacement === 'play_up' ||
      p.currentPlacement === 'play_down' ||
      p.currentPlacement === 'over_age'
    )
      status = 'perlu_keputusan';
    else if (oldKu !== newKu) status = 'naik';
    else status = 'tetap';
    return { id: p.id, oldKu, newKu, status: newKu === null ? 'lulus' : status };
  });
}

/** Pemain yang KU-nya berubah bila tanggal acuan diganti (US-05: tampilkan sebelum disimpan). */
export function kuChanges(
  players: { id: string; birthDate: IsoDate }[],
  oldReference: IsoDate,
  newReference: IsoDate,
  config: KuConfig = DEFAULT_KU_CONFIG,
  newConfig: KuConfig = config,
): { id: string; from: number | null; to: number | null }[] {
  return players
    .map((p) => ({
      id: p.id,
      from: kuFor(p.birthDate, oldReference, config),
      to: kuFor(p.birthDate, newReference, newConfig),
    }))
    .filter((c) => c.from !== c.to);
}
