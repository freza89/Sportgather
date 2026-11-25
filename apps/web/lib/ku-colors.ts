// Warna KU di kalender (legenda A-12): KU8 hijau, KU10 biru, KU12 oranye, KU14 navy, KU16 merah.
const COLORS: Record<number, string> = {
  7: 'var(--color-success)',
  8: 'var(--color-success)',
  10: 'var(--color-info)',
  12: 'var(--color-brand)',
  14: 'var(--color-navy-900)',
  16: 'var(--color-danger)',
};

export function kuColor(ku: number): string {
  return COLORS[ku] ?? 'var(--color-fg-muted)';
}

export const KU_LEGEND = [8, 10, 12, 14, 16];
