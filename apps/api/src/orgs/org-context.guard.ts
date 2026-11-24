import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { organization, staffRole, withContext, type Database } from '@sportgather/db';
import { can, type Permission, type StaffRole } from '@sportgather/shared';
import { and, eq } from 'drizzle-orm';
import type { AppRequest, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';

const PERMISSION_KEY = 'sg:permission';

/** Izin yang dibutuhkan endpoint (lihat PERMISSIONS di @sportgather/shared). */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

/**
 * Menentukan klub aktif dari parameter `:slug` dan peran orang yang login di klub itu.
 * Bukan staf aktif → 404 (keberadaan klub tidak dibocorkan). Peran tanpa izin → 403.
 * Harus dipasang setelah AuthGuard.
 */
@Injectable()
export class OrgContextGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new UnauthorizedException();
    const slug = (req.params as Record<string, string | undefined>).slug;
    if (!slug) throw new NotFoundException('Klub tidak ditemukan');

    const [row] = await withContext(this.db, { personId: req.user.personId }, (tx) =>
      tx
        .select({ id: organization.id, slug: organization.slug, role: staffRole.role })
        .from(organization)
        .innerJoin(staffRole, eq(staffRole.orgId, organization.id))
        .where(
          and(
            eq(organization.slug, slug),
            eq(staffRole.personId, req.user!.personId),
            eq(staffRole.status, 'active'),
          ),
        )
        .limit(1),
    );
    if (!row) throw new NotFoundException('Klub tidak ditemukan');

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permission && !can(row.role as StaffRole, permission)) {
      throw new ForbiddenException('Peran Anda tidak punya akses untuk tindakan ini');
    }
    req.org = { id: row.id, slug: row.slug, role: row.role as StaffRole };
    return true;
  }
}

export const CurrentOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgContext => {
  const org = ctx.switchToHttp().getRequest<AppRequest>().org;
  if (!org) throw new NotFoundException('Klub tidak ditemukan');
  return org;
});
