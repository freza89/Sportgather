import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, activeEntry, hrefFor, PELATIH_NAV, WALI_NAV } from './navigation';

describe('navigasi', () => {
  it('menentukan menu aktif dari path', () => {
    expect(activeEntry(ADMIN_NAV, '/admin/demo', '/admin/demo')?.label).toBe('Beranda');
    expect(activeEntry(ADMIN_NAV, '/admin/demo', '/admin/demo/pemain/123')?.label).toBe('Pemain');
    expect(activeEntry(ADMIN_NAV, '/admin/demo', '/admin/demo/tidak-ada')).toBeUndefined();
  });

  it('membuat href', () => {
    expect(hrefFor('/wali', '')).toBe('/wali');
    expect(hrefFor('/wali', 'tagihan')).toBe('/wali/tagihan');
  });

  it('bottom nav mobile berisi 5 tab sesuai desain', () => {
    expect(PELATIH_NAV.map((e) => e.label)).toEqual([
      'Hari ini',
      'Absensi',
      'Tim',
      'Penilaian',
      'Info',
    ]);
    expect(WALI_NAV.map((e) => e.label)).toEqual([
      'Beranda',
      'Jadwal',
      'Tagihan',
      'Rapor',
      'Profil',
    ]);
  });

  it('setiap layar MVP di PRD bagian 14 punya tempat di navigasi', () => {
    const screens = [...ADMIN_NAV, ...PELATIH_NAV, ...WALI_NAV].flatMap((e) => e.screens);
    // A-01 (daftar klub), O-01 (formulir) & O-02 (login) berada di luar shell.
    const expected = [
      ...Array.from({ length: 18 }, (_, i) => `A-${String(i + 1).padStart(2, '0')}`).filter(
        (c) => c !== 'A-01',
      ),
      'P-01',
      'P-02',
      'P-03',
      'P-04',
      'P-05',
      'O-03',
      'O-04',
      'O-05',
      'O-06',
      'O-07',
      'O-08',
    ];
    expect(new Set(screens)).toEqual(new Set(expected));
  });
});
