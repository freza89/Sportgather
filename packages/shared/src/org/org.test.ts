import { describe, expect, it } from 'vitest';
import { maskAccountNumber, slugify } from './org.js';

describe('slugify', () => {
  it.each([
    ['Belajar Basket Akademi', 'belajar-basket-akademi'],
    ['  Klub  Basket & Futsal  ', 'klub-basket-dan-futsal'],
    ['Akademi Ñandú 2027!', 'akademi-nandu-2027'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('maskAccountNumber', () => {
  it('BCA •••• 4821', () => {
    expect(maskAccountNumber('BCA', '0123454821')).toBe('BCA •••• 4821');
  });
});
