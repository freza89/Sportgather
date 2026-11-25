import { Inject, Injectable } from '@nestjs/common';
import { session, userAccount, type Database } from '@sportgather/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { ENV, type Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import type { AuthUser } from '../common/request.js';
import { hashToken, randomToken } from './crypto.js';

export const SESSION_COOKIE = 'sg_session';

@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(
    userId: string,
    meta: { ip: string; userAgent: string | null },
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_DAYS * 86_400_000);
    await this.db.insert(session).values({
      tokenHash: hashToken(token),
      userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    });
    await this.db
      .update(userAccount)
      .set({ lastLoginAt: new Date() })
      .where(eq(userAccount.id, userId));
    return { token, expiresAt };
  }

  async resolve(token: string): Promise<AuthUser | null> {
    const [row] = await this.db
      .select({ sessionId: session.id, userId: userAccount.id, personId: userAccount.personId })
      .from(session)
      .innerJoin(userAccount, eq(userAccount.id, session.userId))
      .where(
        and(
          eq(session.tokenHash, hashToken(token)),
          isNull(session.revokedAt),
          gt(session.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db.update(session).set({ revokedAt: new Date() }).where(eq(session.id, sessionId));
  }

  setCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  clearCookie(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
