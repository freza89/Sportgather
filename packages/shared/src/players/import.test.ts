import { describe, expect, it } from 'vitest';
import { duplicateKey, guessImportField, parseImportDate, parseImportGender } from './import.js';

describe('parseImportDate', () => {
  it.each([
    ['12/03/2015', '2015-03-12'],
    ['9-9-2016', '2016-09-09'],
    ['2015-03-12', '2015-03-12'],
    ['12 Mar 2015', '2015-03-12'],
    ['18 Agustus 2012', '2012-08-18'],
    ['4 Jan 2019', '2019-01-04'],
  ])('%s → %s', (input, expected) => {
    expect(parseImportDate(input)).toBe(expected);
  });

  it.each(['', '31/02/2014', '2014/13/01', 'kemarin', '12/03/15'])('menolak %s', (input) => {
    expect(parseImportDate(input)).toBeNull();
  });
});

describe('parseImportGender', () => {
  it.each([
    ['L', 'male'],
    ['Laki-laki', 'male'],
    ['P', 'female'],
    ['Perempuan', 'female'],
    ['?', null],
  ])('%s → %s', (input, expected) => {
    expect(parseImportGender(input)).toBe(expected);
  });
});

describe('pemetaan kolom (desain A-04)', () => {
  it.each([
    ['Nama Anak', 'fullName'],
    ['Tgl Lahir', 'birthDate'],
    ['JK', 'gender'],
    ['Nama Ortu', 'guardianName'],
    ['No HP Ortu', 'guardianPhone'],
    ['Kelas', null],
  ])('%s → %s', (header, field) => {
    expect(guessImportField(header)).toBe(field);
  });
});

it('duplicateKey tidak peka kapital & spasi', () => {
  expect(duplicateKey(' Raka  Saputra', '2011-11-30')).toBe(
    duplicateKey('raka saputra', '2011-11-30'),
  );
});
