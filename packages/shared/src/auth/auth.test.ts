import { describe, expect, it } from 'vitest';
import { assignableRoles, can, homeForRole, STAFF_ROLES } from './rbac.js';
import { formatPhone, maskPhone, normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it.each([
    ['0812-3456-7890', '+6281234567890'],
    ['081322114455', '+6281322114455'],
    ['+62 813 2211 4455', '+6281322114455'],
    ['6281322114455', '+6281322114455'],
    ['81322114455', '+6281322114455'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '021-555-1234', '0812', '+1 415 555 0100', 'abc', '0812345678901234'])(
    'menolak %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it('format & samaran sesuai desain', () => {
    expect(formatPhone('+6281234567890')).toBe('0812-3456-7890');
    expect(maskPhone('+6281234567890')).toBe('0812-****-7890');
  });
});

describe('RBAC (PRD bagian 7)', () => {
  it('rekening & langganan hanya owner', () => {
    expect(STAFF_ROLES.filter((r) => can(r, 'club.manage_finance_settings'))).toEqual(['owner']);
  });

  it('dokumen usia hanya owner & admin', () => {
    expect(STAFF_ROLES.filter((r) => can(r, 'documents.view'))).toEqual(['owner', 'admin']);
  });

  it('override KU (play-down) hanya owner', () => {
    expect(STAFF_ROLES.filter((r) => can(r, 'ku.override'))).toEqual(['owner']);
  });

  it('tagihan & laporan keuangan tidak untuk pelatih/TM', () => {
    expect(can('coach', 'billing.manage')).toBe(false);
    expect(can('team_manager', 'billing.manage')).toBe(false);
  });

  it('team manager bisa absensi tapi tidak menilai skill', () => {
    expect(can('team_manager', 'attendance.record_team')).toBe(true);
    expect(can('team_manager', 'assessment.record_team')).toBe(false);
  });

  it('tanpa peran tidak punya izin apa pun', () => {
    expect(can(null, 'club.view')).toBe(false);
  });

  it('admin hanya bisa mengundang pelatih & team manager', () => {
    expect(assignableRoles('admin')).toEqual(['coach', 'team_manager']);
    expect(assignableRoles('coach')).toEqual([]);
    expect(assignableRoles('owner')).toContain('admin');
  });

  it('beranda sesuai peran', () => {
    expect(homeForRole('owner', 'bba')).toBe('/admin/bba');
    expect(homeForRole('coach', 'bba')).toBe('/pelatih/bba');
  });
});
