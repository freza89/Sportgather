import type { StaffRole } from '@sportgather/shared';
import type { FastifyRequest } from 'fastify';

export interface AuthUser {
  userId: string;
  personId: string;
  sessionId: string;
}

export interface OrgContext {
  id: string;
  slug: string;
  role: StaffRole;
}

export type AppRequest = FastifyRequest & { user?: AuthUser; org?: OrgContext };

export function clientMeta(req: FastifyRequest): { ip: string; userAgent: string | null } {
  return { ip: req.ip, userAgent: req.headers['user-agent'] ?? null };
}
