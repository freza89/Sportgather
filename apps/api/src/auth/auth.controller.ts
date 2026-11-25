import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  authEvent,
  person,
  staffRole,
  userAccount,
  withContext,
  type Database,
} from '@sportgather/db';
import {
  OtpRequestSchema,
  OtpSmsFallbackSchema,
  OtpVerifySchema,
  PasswordLoginSchema,
  SetPasswordSchema,
  type OtpChallengeResponse,
} from '@sportgather/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { clientMeta, type AppRequest, type AuthUser } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { DB } from '../db/db.module.js';
import { AuthGuard, CurrentUser } from './auth.guard.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    @Inject(DB) private readonly db: Database,
  ) {}

  @Post('otp/request')
  @HttpCode(200)
  @ApiZodBody(OtpRequestSchema)
  request(
    @Body(new ZodPipe(OtpRequestSchema)) body: z.output<typeof OtpRequestSchema>,
    @Req() req: AppRequest,
  ): Promise<OtpChallengeResponse> {
    return this.otp.request(body.phone, body.purpose, clientMeta(req));
  }

  @Post('otp/sms')
  @HttpCode(200)
  @ApiZodBody(OtpSmsFallbackSchema)
  sms(@Body(new ZodPipe(OtpSmsFallbackSchema)) body: z.output<typeof OtpSmsFallbackSchema>) {
    return this.otp.smsFallback(body.challengeId);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @ApiZodBody(OtpVerifySchema)
  async verify(
    @Body(new ZodPipe(OtpVerifySchema)) body: z.output<typeof OtpVerifySchema>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const meta = clientMeta(req);
    const userId = await this.otp.verify(body.challengeId, body.code, body.fullName, meta);
    const { token, expiresAt } = await this.sessions.create(userId, meta);
    this.sessions.setCookie(reply, token, expiresAt);
    return { ok: true };
  }

  /** Login email + kata sandi — opsi tambahan untuk owner/admin (keputusan plan Q6). */
  @Post('password/login')
  @HttpCode(200)
  @ApiZodBody(PasswordLoginSchema)
  async passwordLogin(
    @Body(new ZodPipe(PasswordLoginSchema)) body: z.output<typeof PasswordLoginSchema>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const meta = clientMeta(req);
    const [account] = await this.db
      .select()
      .from(userAccount)
      .where(sql`lower(${userAccount.email}) = ${body.email}`);
    const ok = account?.passwordHash
      ? await verifyPassword(body.password, account.passwordHash)
      : false;
    await this.db.insert(authEvent).values({
      userId: account?.id ?? null,
      email: body.email,
      event: ok ? 'login_password' : 'password_failed',
      ...meta,
    });
    if (!account || !ok) throw new UnauthorizedException('Email atau kata sandi salah');
    const { token, expiresAt } = await this.sessions.create(account.id, meta);
    this.sessions.setCookie(reply, token, expiresAt);
    return { ok: true };
  }

  /** Mengatur email + kata sandi. Hanya untuk orang yang menjadi owner/admin di suatu klub. */
  @Post('password')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiZodBody(SetPasswordSchema)
  async setPassword(
    @Body(new ZodPipe(SetPasswordSchema)) body: z.output<typeof SetPasswordSchema>,
    @CurrentUser() user: AuthUser,
  ) {
    const privileged = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.person_id', ${user.personId}, true)`);
      return tx
        .select({ id: staffRole.id })
        .from(staffRole)
        .where(
          and(
            eq(staffRole.personId, user.personId),
            inArray(staffRole.role, ['owner', 'admin']),
            eq(staffRole.status, 'active'),
          ),
        )
        .limit(1);
    });
    if (privileged.length === 0)
      throw new UnauthorizedException('Login kata sandi hanya untuk owner/admin klub');
    const [taken] = await this.db
      .select({ id: userAccount.id })
      .from(userAccount)
      .where(
        sql`lower(${userAccount.email}) = ${body.email} and ${userAccount.id} <> ${user.userId}`,
      );
    if (taken) throw new UnauthorizedException('Email sudah dipakai akun lain');
    await this.db
      .update(userAccount)
      .set({ email: body.email, passwordHash: await hashPassword(body.password) })
      .where(eq(userAccount.id, user.userId));
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.sessions.revoke(user.sessionId);
    this.sessions.clearCookie(reply);
    return { ok: true };
  }

  @Get('session')
  @UseGuards(AuthGuard)
  async current(@CurrentUser() user: AuthUser) {
    const [p] = await this.db
      .select({ fullName: person.fullName })
      .from(person)
      .where(eq(person.id, user.personId));
    return { personId: user.personId, fullName: p?.fullName ?? null };
  }
}
