import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  bankAccount,
  branch,
  organization,
  staffRole,
  withContext,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  maskAccountNumber,
  slugify,
  type BankAccountDto,
  type BankAccountInputSchema,
  type BranchDto,
  type BranchInputSchema,
  type CreateOrgSchema,
  type OrgSummary,
  type UpdateOrgSchema,
} from '@sportgather/shared';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { BANK_VERIFIER, type BankVerifier } from '../integrations/bank-verification.js';

type Meta = { ip: string; userAgent: string | null };

export function toBankDto(row: typeof bankAccount.$inferSelect): BankAccountDto {
  return {
    id: row.id,
    bankCode: row.bankCode,
    maskedNumber: maskAccountNumber(row.bankCode, row.accountNumber),
    holderName: row.holderName,
    status: row.status,
    verificationNote: row.verificationNote,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}

function toBranchDto(row: typeof branch.$inferSelect): BranchDto {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    timezone: row.timezone,
    courts: row.courts,
  };
}

@Injectable()
export class OrgsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BANK_VERIFIER) private readonly bankVerifier: BankVerifier,
    private readonly audit: AuditService,
  ) {}

  /** A-01 / US-01: membuat klub; pembuatnya otomatis owner (dan punya semua akses admin). */
  async create(
    user: AuthUser,
    input: z.output<typeof CreateOrgSchema>,
    meta: Meta,
  ): Promise<OrgSummary> {
    const orgId = crypto.randomUUID();
    const slug = await this.uniqueSlug(input.name);
    const verification = await this.bankVerifier.verify(input.bankAccount);

    return withTenant(this.db, orgId, user.personId, async (tx) => {
      const [org] = await tx
        .insert(organization)
        .values({
          id: orgId,
          slug,
          name: input.name,
          sport: input.sport,
          city: input.city,
          whatsapp: input.whatsapp ?? null,
        })
        .returning();
      await tx.insert(branch).values(input.branches.map((b) => ({ ...b, orgId })));
      const [account] = await tx
        .insert(bankAccount)
        .values({
          orgId,
          ...input.bankAccount,
          status: verification.status,
          verificationNote: verification.note,
          verifiedAt: verification.status === 'verified' ? new Date() : null,
          submittedBy: user.personId,
        })
        .returning();
      await tx
        .insert(staffRole)
        .values({ orgId, personId: user.personId, role: 'owner', status: 'active' });
      await this.audit.log(tx, {
        orgId,
        actorPersonId: user.personId,
        action: 'org.created',
        entityType: 'organization',
        entityId: orgId,
        ...meta,
      });
      await this.audit.log(tx, {
        orgId,
        actorPersonId: user.personId,
        action: 'bank_account.submitted',
        entityType: 'bank_account',
        entityId: account!.id,
        meta: {
          bank: account!.bankCode,
          last4: account!.accountNumber.slice(-4),
          status: account!.status,
        },
        ...meta,
      });
      return { ...this.summary(org!), role: 'owner' };
    });
  }

  async get(ctx: OrgContext, user: AuthUser): Promise<OrgSummary> {
    const [org] = await withTenant(this.db, ctx.id, user.personId, (tx) =>
      tx.select().from(organization).where(eq(organization.id, ctx.id)),
    );
    if (!org) throw new NotFoundException('Klub tidak ditemukan');
    return { ...this.summary(org), role: ctx.role };
  }

  async update(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof UpdateOrgSchema>,
    meta: Meta,
  ): Promise<OrgSummary> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [org] = await tx
        .update(organization)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(organization.id, ctx.id))
        .returning();
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'org.updated',
        entityType: 'organization',
        entityId: ctx.id,
        meta: { fields: Object.keys(input) },
        ...meta,
      });
      return { ...this.summary(org!), role: ctx.role };
    });
  }

  listBranches(ctx: OrgContext, user: AuthUser): Promise<BranchDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) =>
      (
        await tx
          .select()
          .from(branch)
          .where(isNull(branch.archivedAt))
          .orderBy(asc(branch.createdAt))
      ).map(toBranchDto),
    );
  }

  async addBranch(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof BranchInputSchema>,
    meta: Meta,
  ): Promise<BranchDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [row] = await tx
        .insert(branch)
        .values({ ...input, orgId: ctx.id })
        .returning();
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'branch.created',
        entityType: 'branch',
        entityId: row!.id,
        ...meta,
      });
      return toBranchDto(row!);
    });
  }

  async updateBranch(
    ctx: OrgContext,
    user: AuthUser,
    branchId: string,
    input: z.output<typeof BranchInputSchema>,
    meta: Meta,
  ): Promise<BranchDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [row] = await tx
        .update(branch)
        .set(input)
        .where(and(eq(branch.id, branchId), isNull(branch.archivedAt)))
        .returning();
      if (!row) throw new NotFoundException('Lokasi tidak ditemukan');
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'branch.updated',
        entityType: 'branch',
        entityId: row.id,
        ...meta,
      });
      return toBranchDto(row);
    });
  }

  async archiveBranch(
    ctx: OrgContext,
    user: AuthUser,
    branchId: string,
    meta: Meta,
  ): Promise<void> {
    await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const active = await tx
        .select({ id: branch.id })
        .from(branch)
        .where(isNull(branch.archivedAt));
      if (!active.some((b) => b.id === branchId))
        throw new NotFoundException('Lokasi tidak ditemukan');
      if (active.length === 1)
        throw new ConflictException('Klub harus punya minimal satu lokasi latihan');
      await tx.update(branch).set({ archivedAt: new Date() }).where(eq(branch.id, branchId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'branch.archived',
        entityType: 'branch',
        entityId: branchId,
        ...meta,
      });
    });
  }

  async getBankAccount(ctx: OrgContext, user: AuthUser): Promise<BankAccountDto | null> {
    const [row] = await withTenant(this.db, ctx.id, user.personId, (tx) =>
      tx.select().from(bankAccount).where(ne(bankAccount.status, 'replaced')).limit(1),
    );
    return row ? toBankDto(row) : null;
  }

  /**
   * FEE-08: ganti rekening hanya oleh owner, lalu wajib verifikasi ulang. Rekening lama
   * ditandai `replaced`; penyaluran (M4) ditahan selama rekening aktif belum `verified`.
   */
  async replaceBankAccount(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof BankAccountInputSchema>,
    meta: Meta,
  ): Promise<BankAccountDto> {
    const verification = await this.bankVerifier.verify(input);
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [previous] = await tx
        .update(bankAccount)
        .set({ status: 'replaced' })
        .where(ne(bankAccount.status, 'replaced'))
        .returning();
      const [row] = await tx
        .insert(bankAccount)
        .values({
          orgId: ctx.id,
          ...input,
          status: verification.status,
          verificationNote: verification.note,
          verifiedAt: verification.status === 'verified' ? new Date() : null,
          submittedBy: user.personId,
        })
        .returning();
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'bank_account.replaced',
        entityType: 'bank_account',
        entityId: row!.id,
        meta: {
          previousId: previous?.id ?? null,
          bank: row!.bankCode,
          last4: row!.accountNumber.slice(-4),
          status: row!.status,
        },
        ...meta,
      });
      return toBankDto(row!);
    });
  }

  private summary(org: typeof organization.$inferSelect): Omit<OrgSummary, 'role'> {
    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      sport: org.sport,
      city: org.city,
      whatsapp: org.whatsapp,
      plan: org.plan,
    };
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'klub';
    for (let i = 1; i < 100; i++) {
      const candidate = i === 1 ? base : `${base}-${i}`;
      const [r] = await withContext(this.db, {}, (tx: Tx) =>
        tx.execute<{ taken: boolean }>(sql`select sg_slug_taken(${candidate}) as taken`),
      );
      if (!r?.taken) return candidate;
    }
    throw new ConflictException('Nama klub sudah dipakai, coba nama lain');
  }
}
