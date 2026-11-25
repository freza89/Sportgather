import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { authEvent, otpChallenge, person, userAccount, type Database } from '@sportgather/db';
import type { OtpChallengeResponse } from '@sportgather/shared';
import { and, count, eq, gt } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import { SMS_SENDER, WHATSAPP_SENDER, type MessageSender } from '../integrations/messaging.js';
import { generateOtp, hashOtp, safeEqualHex } from './crypto.js';

export const OTP_TTL_SECONDS = 5 * 60;
/** PRD bagian 13: cadangan SMS bila WhatsApp tidak masuk dalam 30 detik. */
export const OTP_RESEND_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 5;

type Meta = { ip: string; userAgent: string | null };

@Injectable()
export class OtpService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: MessageSender,
    @Inject(SMS_SENDER) private readonly sms: MessageSender,
  ) {}

  /**
   * Untuk login, kode hanya benar-benar dikirim bila nomornya terdaftar; responsnya tetap
   * sama agar keberadaan akun tidak bisa ditebak (dan biaya WhatsApp tidak terbuang).
   */
  async request(
    phone: string,
    purpose: 'login' | 'signup',
    meta: Meta,
  ): Promise<OtpChallengeResponse> {
    const now = Date.now();
    const recent = await this.db
      .select({ createdAt: otpChallenge.createdAt })
      .from(otpChallenge)
      .where(
        and(eq(otpChallenge.phone, phone), gt(otpChallenge.createdAt, new Date(now - 3_600_000))),
      )
      .orderBy(otpChallenge.createdAt);
    if (recent.length >= OTP_MAX_PER_HOUR) {
      throw new HttpException(
        'Terlalu banyak permintaan kode. Coba lagi dalam 1 jam.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const last = recent.at(-1);
    if (last && now - last.createdAt.getTime() < OTP_RESEND_SECONDS * 1000) {
      throw new HttpException(
        'Tunggu 30 detik sebelum meminta kode baru.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const [existing] = await this.db
      .select({ id: userAccount.id })
      .from(userAccount)
      .where(eq(userAccount.phone, phone));
    const code = generateOtp();
    const id = crypto.randomUUID();
    await this.db.insert(otpChallenge).values({
      id,
      phone,
      purpose,
      codeHash: hashOtp(this.env.AUTH_SECRET, id, code),
      expiresAt: new Date(now + OTP_TTL_SECONDS * 1000),
    });

    const shouldSend = purpose === 'signup' || Boolean(existing);
    if (shouldSend) {
      await this.whatsapp.send({
        channel: 'whatsapp',
        to: phone,
        template: 'kode_otp',
        params: { kode: code },
      });
    }
    await this.db.insert(authEvent).values({
      phone,
      userId: existing?.id ?? null,
      event: shouldSend ? 'otp_sent' : 'otp_requested_unknown',
      ...meta,
    });
    return { challengeId: id, resendAfter: OTP_RESEND_SECONDS, expiresIn: OTP_TTL_SECONDS };
  }

  /** Kirim ulang kode yang sama lewat SMS setelah 30 detik (tombol "Kirim lewat SMS"). */
  async smsFallback(challengeId: string): Promise<OtpChallengeResponse> {
    const [c] = await this.db.select().from(otpChallenge).where(eq(otpChallenge.id, challengeId));
    if (!c || c.consumedAt || c.expiresAt.getTime() < Date.now())
      throw new NotFoundException('Kode sudah tidak berlaku');
    if (Date.now() - c.createdAt.getTime() < OTP_RESEND_SECONDS * 1000) {
      throw new HttpException(
        'Tunggu 30 detik sebelum mengirim lewat SMS.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (c.smsFallbackAt)
      throw new HttpException('Kode sudah dikirim lewat SMS.', HttpStatus.TOO_MANY_REQUESTS);
    // Kode baru (hash lama tidak bisa dibalik); berlaku untuk challenge yang sama.
    const code = generateOtp();
    await this.db
      .update(otpChallenge)
      .set({
        codeHash: hashOtp(this.env.AUTH_SECRET, c.id, code),
        channel: 'sms',
        smsFallbackAt: new Date(),
        attempts: 0,
      })
      .where(eq(otpChallenge.id, c.id));
    const [exists] = await this.db
      .select({ n: count() })
      .from(userAccount)
      .where(eq(userAccount.phone, c.phone));
    if (c.purpose === 'signup' || (exists?.n ?? 0) > 0) {
      await this.sms.send({
        channel: 'sms',
        to: c.phone,
        template: 'kode_otp',
        params: { kode: code },
      });
    }
    const remaining = Math.max(0, Math.round((c.expiresAt.getTime() - Date.now()) / 1000));
    return { challengeId: c.id, resendAfter: remaining, expiresIn: remaining };
  }

  /**
   * Verifikasi kode. Mengembalikan userId (akun dibuat bila purpose = signup dan nomornya baru).
   */
  async verify(
    challengeId: string,
    code: string,
    fullName: string | undefined,
    meta: Meta,
  ): Promise<string> {
    // Percobaan gagal harus tetap tercatat walau request berakhir error, jadi transaksi
    // mengembalikan hasil (bukan melempar) dan error baru dilempar setelah commit.
    const result = await this.db.transaction(async (tx) => {
      const [c] = await tx
        .select()
        .from(otpChallenge)
        .where(eq(otpChallenge.id, challengeId))
        .for('update');
      if (!c || c.consumedAt || c.expiresAt.getTime() < Date.now())
        return { error: 'expired' as const };
      if (c.attempts >= OTP_MAX_ATTEMPTS) return { error: 'locked' as const };
      if (!safeEqualHex(c.codeHash, hashOtp(this.env.AUTH_SECRET, c.id, code))) {
        await tx
          .update(otpChallenge)
          .set({ attempts: c.attempts + 1 })
          .where(eq(otpChallenge.id, c.id));
        await tx.insert(authEvent).values({ phone: c.phone, event: 'otp_failed', ...meta });
        return { error: 'wrong' as const };
      }

      const [account] = await tx.select().from(userAccount).where(eq(userAccount.phone, c.phone));
      if (!account && c.purpose !== 'signup') return { error: 'unknown' as const };
      if (!account && !fullName) return { error: 'name_required' as const };
      await tx
        .update(otpChallenge)
        .set({ consumedAt: new Date() })
        .where(eq(otpChallenge.id, c.id));

      let userId = account?.id;
      if (!userId) {
        // id dibuat aplikasi: RLS person tidak mengizinkan RETURNING sebelum orang ini punya relasi.
        const personId = crypto.randomUUID();
        await tx.insert(person).values({ id: personId, fullName: fullName! });
        const [created] = await tx
          .insert(userAccount)
          .values({ personId, phone: c.phone })
          .returning({ id: userAccount.id });
        userId = created!.id;
      }
      await tx.insert(authEvent).values({ phone: c.phone, userId, event: 'login_otp', ...meta });
      return { userId };
    });

    if ('userId' in result) return result.userId;
    switch (result.error) {
      case 'expired':
        throw new UnprocessableEntityException('Kode sudah tidak berlaku. Minta kode baru.');
      case 'locked':
        throw new HttpException(
          'Terlalu banyak percobaan. Minta kode baru.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case 'wrong':
        throw new UnprocessableEntityException('Kode salah. Periksa lagi pesan WhatsApp Anda.');
      case 'unknown':
        throw new NotFoundException('Nomor ini belum terdaftar di SportGather.');
      case 'name_required':
        throw new UnprocessableEntityException('Nama lengkap wajib diisi untuk akun baru.');
    }
  }
}
