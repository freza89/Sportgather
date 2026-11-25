import {
  IconCalendar,
  IconChart,
  IconClipboard,
  IconFile,
  IconHome,
  IconLayers,
  IconMegaphone,
  IconSliders,
  IconStar,
  IconTransfer,
  IconUser,
  IconUsers,
  IconWallet,
  type IconProps,
} from '@sportgather/ui';
import type { ComponentType } from 'react';

export type NavEntry = {
  /** Segmen URL setelah prefix peran; '' = beranda. */
  segment: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** Kode layar di PRD bagian 14 / Figma, untuk penelusuran. */
  screens: string[];
  milestone: string;
};

// Urutan & label mengikuti sidebar A-17 di Figma.
export const ADMIN_NAV: NavEntry[] = [
  { segment: '', label: 'Beranda', icon: IconHome, screens: ['A-17'], milestone: 'M5' },
  {
    segment: 'pemain',
    label: 'Pemain',
    icon: IconUsers,
    screens: ['A-06', 'A-07', 'A-08', 'A-04'],
    milestone: 'M2',
  },
  {
    segment: 'tim',
    label: 'Tim & KU',
    icon: IconLayers,
    screens: ['A-09', 'A-10', 'A-11'],
    milestone: 'M2',
  },
  { segment: 'jadwal', label: 'Jadwal', icon: IconCalendar, screens: ['A-12'], milestone: 'M3' },
  {
    segment: 'iuran',
    label: 'Iuran & Tagihan',
    icon: IconWallet,
    screens: ['A-13', 'A-14'],
    milestone: 'M4',
  },
  {
    segment: 'penyaluran',
    label: 'Penyaluran Dana',
    icon: IconTransfer,
    screens: ['A-15'],
    milestone: 'M4',
  },
  {
    segment: 'pengumuman',
    label: 'Pengumuman',
    icon: IconMegaphone,
    screens: ['A-16'],
    milestone: 'M5',
  },
  { segment: 'laporan', label: 'Laporan', icon: IconChart, screens: ['A-18'], milestone: 'M5' },
  {
    segment: 'pengaturan',
    label: 'Pengaturan',
    icon: IconSliders,
    screens: ['A-02', 'A-03', 'A-05'],
    milestone: 'M1',
  },
];

// Bottom nav P-01 di Figma.
export const PELATIH_NAV: NavEntry[] = [
  { segment: '', label: 'Hari ini', icon: IconHome, screens: ['P-01'], milestone: 'M3' },
  { segment: 'absensi', label: 'Absensi', icon: IconClipboard, screens: ['P-02'], milestone: 'M3' },
  { segment: 'tim', label: 'Tim', icon: IconUsers, screens: ['P-03'], milestone: 'M3' },
  { segment: 'penilaian', label: 'Penilaian', icon: IconStar, screens: ['P-04'], milestone: 'M5' },
  { segment: 'info', label: 'Info', icon: IconMegaphone, screens: ['P-05'], milestone: 'M5' },
];

// Bottom nav O-03 di Figma.
export const WALI_NAV: NavEntry[] = [
  { segment: '', label: 'Beranda', icon: IconHome, screens: ['O-03'], milestone: 'M5' },
  { segment: 'jadwal', label: 'Jadwal', icon: IconCalendar, screens: ['O-04'], milestone: 'M3' },
  {
    segment: 'tagihan',
    label: 'Tagihan',
    icon: IconWallet,
    screens: ['O-05', 'O-06'],
    milestone: 'M4',
  },
  { segment: 'rapor', label: 'Rapor', icon: IconFile, screens: ['O-07'], milestone: 'M5' },
  { segment: 'profil', label: 'Profil', icon: IconUser, screens: ['O-08'], milestone: 'M5' },
];

export function hrefFor(base: string, segment: string): string {
  return segment ? `${base}/${segment}` : base;
}

/** Entri aktif = segmen pertama setelah base. */
export function activeEntry(
  entries: NavEntry[],
  base: string,
  pathname: string,
): NavEntry | undefined {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : '';
  const first = rest.split('/')[0] ?? '';
  return entries.find((e) => e.segment === first);
}
