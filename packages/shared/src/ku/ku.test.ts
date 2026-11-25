import { describe, expect, it } from 'vitest';
import {
  ageOn,
  checkPlacement,
  classifyPlacement,
  formatAge,
  kuChanges,
  kuFor,
  proposePromotions,
  referenceDate,
} from './ku.js';

const REF = '2027-06-14'; // Liga Basket Pelajar Bandung 2027 (contoh desain)

describe('ageOn', () => {
  it('menghitung tahun & bulan penuh (desain A-07: 12 th 3 bln)', () => {
    expect(ageOn('2015-03-12', REF)).toEqual({ years: 12, months: 3 });
    expect(formatAge(ageOn('2015-03-12', REF))).toBe('12 th 3 bln');
  });

  it('ulang tahun tepat di tanggal acuan: usia sudah bertambah', () => {
    expect(ageOn('2015-06-14', REF).years).toBe(12);
    expect(ageOn('2015-06-15', REF).years).toBe(11);
  });

  it('lahir 29 Februari: di tahun bukan kabisat bertambah usia pada 1 Maret', () => {
    expect(ageOn('2016-02-29', '2027-02-28').years).toBe(10);
    expect(ageOn('2016-02-29', '2027-03-01').years).toBe(11);
    expect(ageOn('2016-02-29', '2028-02-29').years).toBe(12);
  });

  it('menolak tanggal tidak valid & acuan sebelum lahir', () => {
    expect(() => ageOn('2014-02-31', REF)).toThrow(RangeError);
    expect(() => ageOn('2028-01-01', REF)).toThrow(RangeError);
  });
});

describe('kuFor — MAX_N (default: KU-N = usia maksimal N tahun)', () => {
  it('contoh desain sesuai tabel PRD', () => {
    expect(kuFor('2015-03-12', REF)).toBe(12); // Zaki 12 th 3 bln → KU12
    expect(kuFor('2015-09-14', REF)).toBe(12); // Rafa 11 th 9 bln → KU12
    expect(kuFor('2017-02-02', REF)).toBe(10); // Kayla 10 th → KU10 (play-up ke KU12 di desain)
    expect(kuFor('2019-01-04', REF)).toBe(8); // Nadia 8 th → KU8
  });

  it.each([
    ['2015-06-14', 12], // tepat 12 th di tanggal acuan → masih KU12
    ['2014-06-15', 12], // 12 th (13 th besok) → KU12
    ['2014-06-14', 14], // tepat 13 th → KU14
    ['2021-01-01', 8], // 6 th → KU8 (KU7 tidak aktif)
    ['2023-01-01', 8], // 4 th → kelompok termuda
    ['2011-06-14', 16], // tepat 16 th → KU16
    ['2010-06-14', null], // tepat 17 th → lulus
  ])('lahir %s → %s', (birth, expected) => {
    expect(kuFor(birth, REF)).toBe(expected);
  });

  it('KU7 opsional = 6–7 tahun (PRD bagian 4)', () => {
    const cfg = { rule: 'MAX_N' as const, groups: [7, 8, 10, 12, 14, 16] };
    expect(kuFor('2021-01-01', REF, cfg)).toBe(7); // 6 th
    expect(kuFor('2020-01-01', REF, cfg)).toBe(7); // 7 th
    expect(kuFor('2019-01-01', REF, cfg)).toBe(8); // 8 th
  });

  it('kelompok satu tahunan', () => {
    const cfg = { rule: 'MAX_N' as const, groups: [8, 9, 10, 11, 12, 13, 14, 15, 16] };
    expect(kuFor('2016-01-01', REF, cfg)).toBe(11); // 11 th
  });
});

describe('kuFor — UNDER_N (opsional per kompetisi)', () => {
  const cfg = { rule: 'UNDER_N' as const, groups: [8, 10, 12, 14, 16] };
  it('KU-N berisi usia < N', () => {
    expect(kuFor('2015-03-12', REF, cfg)).toBe(14); // 12 th bukan < 12
    expect(kuFor('2015-06-15', REF, cfg)).toBe(12); // 11 th
    expect(kuFor('2011-06-14', REF, cfg)).toBe(null); // tepat 16 th
  });
});

describe('penempatan (US-06)', () => {
  it('klasifikasi', () => {
    expect(classifyPlacement(12, 12)).toBe('same');
    expect(classifyPlacement(10, 12)).toBe('play_up');
    expect(classifyPlacement(14, 12)).toBe('play_down');
    expect(classifyPlacement(null, 16)).toBe('over_age');
  });

  it('KU sama: bebas', () => {
    expect(checkPlacement('same', { isOwner: false }, null).allowed).toBe(true);
  });

  it('play-up wajib alasan (admin boleh)', () => {
    expect(checkPlacement('play_up', { isOwner: false }, '').allowed).toBe(false);
    expect(checkPlacement('play_up', { isOwner: false }, 'Skill di atas KU-nya').allowed).toBe(
      true,
    );
  });

  it('play-down diblokir tanpa override owner', () => {
    expect(checkPlacement('play_down', { isOwner: false }, 'Alasan apa pun')).toMatchObject({
      allowed: false,
      ownerOnly: true,
    });
    expect(checkPlacement('play_down', { isOwner: true }, '').allowed).toBe(false);
    expect(checkPlacement('play_down', { isOwner: true }, 'Pulih cedera, adaptasi').allowed).toBe(
      true,
    );
  });

  it('pemain lewat usia: hanya owner + alasan', () => {
    expect(checkPlacement('over_age', { isOwner: false }, 'x x x').allowed).toBe(false);
    expect(checkPlacement('over_age', { isOwner: true }, 'Masa transisi').allowed).toBe(true);
  });
});

describe('tanggal acuan', () => {
  it('memakai kompetisi utama, cadangan 31 Desember', () => {
    expect(referenceDate({ endsOn: '2027-12-31' }, { referenceDate: REF })).toBe(REF);
    expect(referenceDate({ endsOn: '2027-12-31' }, null)).toBe('2027-12-31');
    expect(referenceDate({ endsOn: '2028-06-30' })).toBe('2028-12-31');
  });
});

describe('kenaikan KU musim baru (A-11)', () => {
  it('naik, tetap, lulus, perlu keputusan (contoh desain, acuan 13 Jun 2028)', () => {
    const proposals = proposePromotions(
      [
        { id: 'kayla', birthDate: '2017-02-02', currentTeamKu: 12, currentPlacement: 'play_up' }, // 10→11 th
        { id: 'zaki', birthDate: '2015-03-12', currentTeamKu: 12, currentPlacement: 'same' }, // 12→13 th
        { id: 'nadia', birthDate: '2019-01-04', currentTeamKu: 8, currentPlacement: 'same' }, // 8→9 th
        { id: 'tetap', birthDate: '2015-12-01', currentTeamKu: 12, currentPlacement: 'same' }, // 11→12 th
        { id: 'raka', birthDate: '2010-11-30', currentTeamKu: 16, currentPlacement: 'same' }, // 16→17 th
      ],
      '2027-06-14',
      '2028-06-13',
    );
    expect(Object.fromEntries(proposals.map((p) => [p.id, [p.oldKu, p.newKu, p.status]]))).toEqual({
      kayla: [10, 12, 'perlu_keputusan'],
      zaki: [12, 14, 'naik'],
      nadia: [8, 10, 'naik'],
      tetap: [12, 12, 'tetap'],
      raka: [16, null, 'lulus'],
    });
  });
});

describe('perubahan tanggal acuan (US-05)', () => {
  it('hanya mengembalikan pemain yang KU-nya berubah', () => {
    const changes = kuChanges(
      [
        { id: 'a', birthDate: '2014-07-01' }, // 12 th pada 14 Jun, 13 th pada 1 Agu
        { id: 'b', birthDate: '2016-01-01' },
      ],
      '2027-06-14',
      '2027-08-01',
    );
    expect(changes).toEqual([{ id: 'a', from: 12, to: 14 }]);
  });
});
