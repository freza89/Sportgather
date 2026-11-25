import type { MeResponse } from '@sportgather/shared';
import { describe, expect, it } from 'vitest';
import { homePath, safeNext } from './home';

const me = (clubs: MeResponse['clubs']): MeResponse => ({
  user: { id: 'u', personId: 'p', fullName: 'X', phone: null, email: null },
  clubs,
});
const club = (slug: string, role: string, status = 'active') => ({
  orgId: slug,
  slug,
  name: slug,
  role,
  status,
});

describe('homePath', () => {
  it('satu klub: owner/admin → admin, pelatih → pelatih', () => {
    expect(homePath(me([club('bba', 'owner')]))).toBe('/admin/bba');
    expect(homePath(me([club('bba', 'coach')]))).toBe('/pelatih/bba');
  });
  it('banyak klub → pemilih klub', () => {
    expect(homePath(me([club('a', 'owner'), club('b', 'coach')]))).toBe('/pilih-klub');
  });
  it('tanpa klub → area wali', () => {
    expect(homePath(me([]))).toBe('/wali');
  });
});

describe('safeNext', () => {
  it.each([
    ['/admin/bba', '/admin/bba'],
    ['//evil.com', null],
    ['https://evil.com', null],
    ['/\\evil.com', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
