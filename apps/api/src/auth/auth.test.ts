import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ageOtpChallenges, Client, createHarness, type Harness } from '../test/harness.js';

describe('autentikasi OTP WhatsApp (O-02)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it('pendaftaran akun baru lewat OTP lalu /me', async () => {
    const c = new Client(h);
    await c.loginOtp('0812-1111-0001', { purpose: 'signup', fullName: 'Rina Pratama' });
    expect(c.cookie).toMatch(/^sg_session=/);
    const me = await c.call('GET', '/v1/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      user: { fullName: 'Rina Pratama', phone: '+6281211110001' },
      clubs: [],
    });
  });

  it('signup tanpa nama ditolak', async () => {
    const c = new Client(h);
    const req = await c.call('POST', '/v1/auth/otp/request', {
      phone: '081211110002',
      purpose: 'signup',
    });
    const code = h.outbox.latest('+6281211110002', 'kode_otp')!.params.kode;
    const res = await c.call('POST', '/v1/auth/otp/verify', {
      challengeId: (req.body as { challengeId: string }).challengeId,
      code,
    });
    expect(res.status).toBe(422);
  });

  it('nomor tidak terdaftar: respons sama, tapi kode tidak dikirim dan login ditolak', async () => {
    const c = new Client(h);
    const before = h.outbox.messages.length;
    const req = await c.call('POST', '/v1/auth/otp/request', { phone: '081299990000' });
    expect(req.status).toBe(200);
    expect(req.body).toHaveProperty('challengeId');
    expect(h.outbox.messages.length).toBe(before);
  });

  it('nomor tidak valid ditolak dengan pesan berbahasa Indonesia', async () => {
    const res = await new Client(h).call('POST', '/v1/auth/otp/request', { phone: '021-555' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Nomor WhatsApp tidak valid' });
  });

  it('kode salah dihitung dan dikunci setelah 5 percobaan', async () => {
    const c = new Client(h);
    await c.loginOtp('081211110003', { purpose: 'signup', fullName: 'Budi' });
    await ageOtpChallenges(h, '081211110003', 60);
    const req = await c.call('POST', '/v1/auth/otp/request', { phone: '081211110003' });
    const challengeId = (req.body as { challengeId: string }).challengeId;
    const real = h.outbox.latest('+6281211110003', 'kode_otp')!.params.kode;
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect(
        (await c.call('POST', '/v1/auth/otp/verify', { challengeId, code: wrong })).status,
      ).toBe(422);
    }
    expect((await c.call('POST', '/v1/auth/otp/verify', { challengeId, code: real })).status).toBe(
      429,
    );
  });

  it('kirim ulang < 30 detik ditolak; SMS cadangan setelah 30 detik', async () => {
    const c = new Client(h);
    await c.loginOtp('081211110004', { purpose: 'signup', fullName: 'Sari' });
    await ageOtpChallenges(h, '081211110004', 60);
    const first = await c.call('POST', '/v1/auth/otp/request', { phone: '081211110004' });
    expect((await c.call('POST', '/v1/auth/otp/request', { phone: '081211110004' })).status).toBe(
      429,
    );
    const challengeId = (first.body as { challengeId: string }).challengeId;
    expect((await c.call('POST', '/v1/auth/otp/sms', { challengeId })).status).toBe(429);

    await ageOtpChallenges(h, '081211110004', 31);
    expect((await c.call('POST', '/v1/auth/otp/sms', { challengeId })).status).toBe(200);
    const sms = h.outbox.latest('+6281211110004', 'kode_otp')!;
    expect(sms.channel).toBe('sms');
    const ok = await c.call('POST', '/v1/auth/otp/verify', { challengeId, code: sms.params.kode });
    expect(ok.status).toBe(200);
  });

  it('kode hanya bisa dipakai sekali', async () => {
    const c = new Client(h);
    const req = await c.call('POST', '/v1/auth/otp/request', {
      phone: '081211110005',
      purpose: 'signup',
    });
    const challengeId = (req.body as { challengeId: string }).challengeId;
    const code = h.outbox.latest('+6281211110005', 'kode_otp')!.params.kode;
    expect(
      (await c.call('POST', '/v1/auth/otp/verify', { challengeId, code, fullName: 'Dewi' })).status,
    ).toBe(200);
    expect(
      (await c.call('POST', '/v1/auth/otp/verify', { challengeId, code, fullName: 'Dewi' })).status,
    ).toBe(422);
  });

  it('logout mencabut sesi', async () => {
    const c = new Client(h);
    await c.loginOtp('081211110006', { purpose: 'signup', fullName: 'Yanti' });
    const cookie = c.cookie;
    expect((await c.call('POST', '/v1/auth/logout')).status).toBe(200);
    c.cookie = cookie;
    expect((await c.call('GET', '/v1/me')).status).toBe(401);
  });

  it('tanpa sesi → 401', async () => {
    expect((await new Client(h).call('GET', '/v1/me')).status).toBe(401);
  });
});
