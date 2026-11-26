import { describe, expect, it } from 'vitest';
import {
  CoachExperienceInputSchema,
  CoachLicenseInputSchema,
  CoachLicenseReviewSchema,
  licenseDisplayStatus,
} from './coaching.js';

describe('lisensi pelatih (M7)', () => {
  const today = '2027-03-01';

  it('status tampilan memperhitungkan masa berlaku', () => {
    expect(licenseDisplayStatus('verified', null, today)).toBe('verified');
    expect(licenseDisplayStatus('verified', '2027-02-28', today)).toBe('expired');
    expect(licenseDisplayStatus('pending', '2027-02-28', today)).toBe('expired');
    expect(licenseDisplayStatus('verified', '2027-03-31', today)).toBe('expiring');
    expect(licenseDisplayStatus('verified', '2027-04-01', today)).toBe('verified');
    expect(licenseDisplayStatus('pending', '2027-03-10', today)).toBe('pending');
    expect(licenseDisplayStatus('in_progress', '2020-01-01', today)).toBe('in_progress');
    expect(licenseDisplayStatus('rejected', '2020-01-01', today)).toBe('rejected');
  });

  it('lisensi yang masih proses cukup diberi nama', () => {
    const r = CoachLicenseInputSchema.parse({ name: 'Lisensi Pelatih Level C', inProgress: true });
    expect(r).toMatchObject({ inProgress: true, issuedOn: null, expiresOn: null, issuer: null });
  });

  it('masa berlaku tidak boleh sebelum tanggal terbit', () => {
    const r = CoachLicenseInputSchema.safeParse({
      name: 'Lisensi C',
      issuedOn: '2027-01-01',
      expiresOn: '2026-12-31',
    });
    expect(r.success).toBe(false);
  });

  it('pengalaman: tahun selesai ≥ tahun mulai; kosong = sampai sekarang', () => {
    expect(
      CoachExperienceInputSchema.safeParse({
        title: 'Asisten',
        organization: 'Klub A',
        startYear: 2020,
        endYear: 2019,
      }).success,
    ).toBe(false);
    expect(
      CoachExperienceInputSchema.parse({
        title: 'Asisten',
        organization: 'Klub A',
        startYear: 2020,
      }).endYear,
    ).toBeNull();
  });

  it('penolakan lisensi wajib beralasan', () => {
    expect(CoachLicenseReviewSchema.safeParse({ decision: 'rejected' }).success).toBe(false);
    expect(CoachLicenseReviewSchema.safeParse({ decision: 'verified' }).success).toBe(true);
  });
});
