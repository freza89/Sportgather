import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IconHome } from '../icons/index';
import { Avatar, initials } from './avatar';
import { Badge } from './badge';
import { Button } from './button';
import { Input } from './input';
import { NavItem } from './nav-item';

afterEach(cleanup);

describe('initials', () => {
  it.each([
    ['Zaki Pratama', 'ZP'],
    ['Coach Andi', 'CA'],
    ['Zaki', 'ZA'],
    ['Belajar Basket Akademi', 'BB'],
    ['Rizky Ramadhan', 'RR'],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('komponen dasar', () => {
  it('Button default bertipe button dan varian primary', () => {
    render(<Button>Simpan</Button>);
    const btn = screen.getByRole('button', { name: 'Simpan' });
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.className).toContain('bg-brand');
  });

  it('Badge memakai warna tone', () => {
    render(<Badge tone="success">Lunas</Badge>);
    expect(screen.getByText('Lunas').className).toContain('text-success');
  });

  it('Input menghubungkan label dan pesan error', () => {
    render(<Input label="Nama lengkap anak" error="Wajib diisi" />);
    const input = screen.getByLabelText('Nama lengkap anak');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Wajib diisi').id).toBe(input.getAttribute('aria-describedby'));
  });

  it('NavItem aktif menandai aria-current', () => {
    render(
      <NavItem href="/" icon={IconHome} active>
        Beranda
      </NavItem>,
    );
    expect(screen.getByRole('link', { name: 'Beranda' }).getAttribute('aria-current')).toBe('page');
  });

  it('Avatar punya label aksesibel', () => {
    render(<Avatar name="Zaki Pratama" />);
    expect(screen.getByRole('img', { name: 'Zaki Pratama' }).textContent).toBe('ZP');
  });
});
