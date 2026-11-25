import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  invitation,
  organization,
  person,
  staffRole,
  userAccount,
  withContext,
  withTenant,
  type Database,
} from '@sportgather/db';
import {
  assignableRoles,
  maskPhone,
  ROLE_LABEL,
  type InvitationPreview,
  type InviteStaffSchema,
  type StaffDto,
  type StaffRole,
} from '@sportgather/shared';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { hashToken, randomToken } from '../auth/crypto.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { ENV, type Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import { WHATSAPP_SENDER, type MessageSender } from '../integrations/messaging.js';

type Meta = { ip: string; userAgent: string | null };
const INVITE_DAYS = 7;
const PRIVILEGED: StaffRole[] = ['owner', 'admin'];

@Injectable()
export class StaffService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: MessageSender,
    private readonly audit: AuditService,
  ) {}

  list(ctx: OrgContext, user: AuthUser): Promise<StaffDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const rows = await tx
        .select({
          id: staffRole.id,
          personId: staffRole.personId,
          fullName: person.fullName,
          phone: userAccount.phone,
          role: staffRole.role,
          status: staffRole.status,
        })
        .from(staffRole)
        .innerJoin(person, eq(person.id, staffRole.personId))
        .leftJoin(userAccount, eq(userAccount.personId, staffRole.personId))
        .where(ne(staffRole.status, 'removed'))
        .orderBy(
          sql`array_position(array['owner','admin','coach','team_manager']::staff_role_kind[], ${staffRole.role})`,
          asc(person.fullName),
        );
      return rows;
    });
  }

  /** A-03 / ORG-03: undang staf lewat WhatsApp. Akun dibuat bila nomornya belum terdaftar. */
  async invite(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof InviteStaffSchema>,
    meta: Meta,
  ): Promise<StaffDto> {
    if (!assignableRoles(ctx.role).includes(input.role)) {
      throw new ForbiddenException(
        `Peran ${ROLE_LABEL[ctx.role]} tidak bisa mengundang ${ROLE_LABEL[input.role]}`,
      );
    }
    const token = randomToken();
    const result = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      let [account] = await tx.select().from(userAccount).where(eq(userAccount.phone, input.phone));
      if (!account) {
        // id dibuat aplikasi: RLS person tidak mengizinkan RETURNING sebelum orang ini punya relasi.
        const newPersonId = crypto.randomUUID();
        await tx.insert(person).values({ id: newPersonId, fullName: input.fullName });
        [account] = await tx
          .insert(userAccount)
          .values({ personId: newPersonId, phone: input.phone })
          .returning();
      }
      const personId = account!.personId;
      const [existing] = await tx.select().from(staffRole).where(eq(staffRole.personId, personId));
      if (existing && existing.status !== 'removed') {
        throw new ConflictException('Orang ini sudah terdaftar sebagai staf klub');
      }
      const [role] = existing
        ? await tx
            .update(staffRole)
            .set({ role: input.role, status: 'invited' })
            .where(eq(staffRole.id, existing.id))
            .returning()
        : await tx
            .insert(staffRole)
            .values({ orgId: ctx.id, personId, role: input.role, status: 'invited' })
            .returning();
      await tx.insert(invitation).values({
        orgId: ctx.id,
        staffRoleId: role!.id,
        phone: input.phone,
        tokenHash: hashToken(token),
        invitedBy: user.personId,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      });
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'staff.invited',
        entityType: 'staff_role',
        entityId: role!.id,
        meta: { role: input.role, phone: maskPhone(input.phone) },
        ...meta,
      });
      const [org] = await tx
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, ctx.id));
      const [p] = await tx
        .select({ fullName: person.fullName })
        .from(person)
        .where(eq(person.id, personId));
      return {
        orgName: org!.name,
        dto: {
          id: role!.id,
          personId,
          fullName: p!.fullName,
          phone: input.phone,
          role: role!.role,
          status: role!.status,
        },
      };
    });

    await this.whatsapp.send({
      channel: 'whatsapp',
      to: input.phone,
      template: 'undangan_staf',
      params: {
        klub: result.orgName,
        peran: ROLE_LABEL[input.role],
        link: `${this.env.WEB_ORIGIN}/undangan/${token}`,
      },
    });
    return result.dto;
  }

  async changeRole(
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
    role: StaffRole,
    meta: Meta,
  ): Promise<StaffDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const target = await this.loadManageable(tx, ctx, user, staffId);
      if (!assignableRoles(ctx.role).includes(role)) {
        throw new ForbiddenException(
          `Peran ${ROLE_LABEL[ctx.role]} tidak bisa memberi peran ${ROLE_LABEL[role]}`,
        );
      }
      if (target.role === 'owner' && role !== 'owner') await this.assertNotLastOwner(tx);
      const [row] = await tx
        .update(staffRole)
        .set({ role })
        .where(eq(staffRole.id, staffId))
        .returning();
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'staff.role_changed',
        entityType: 'staff_role',
        entityId: staffId,
        meta: { from: target.role, to: role },
        ...meta,
      });
      const [p] = await tx
        .select({ fullName: person.fullName })
        .from(person)
        .where(eq(person.id, row!.personId));
      const [a] = await tx
        .select({ phone: userAccount.phone })
        .from(userAccount)
        .where(eq(userAccount.personId, row!.personId));
      return {
        id: row!.id,
        personId: row!.personId,
        fullName: p!.fullName,
        phone: a?.phone ?? null,
        role: row!.role,
        status: row!.status,
      };
    });
  }

  async remove(ctx: OrgContext, user: AuthUser, staffId: string, meta: Meta): Promise<void> {
    await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const target = await this.loadManageable(tx, ctx, user, staffId);
      if (target.role === 'owner') await this.assertNotLastOwner(tx);
      await tx.update(staffRole).set({ status: 'removed' }).where(eq(staffRole.id, staffId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'staff.removed',
        entityType: 'staff_role',
        entityId: staffId,
        meta: { role: target.role },
        ...meta,
      });
    });
  }

  /** Pratinjau undangan (publik, dari link WhatsApp) — data minimal. */
  async preview(token: string): Promise<InvitationPreview> {
    const found = await this.findInvitation(token);
    return withTenant(this.db, found.org_id, undefined, async (tx) => {
      const [row] = await tx
        .select({
          orgName: organization.name,
          orgSlug: organization.slug,
          role: staffRole.role,
          invitedName: person.fullName,
          phone: invitation.phone,
          expiresAt: invitation.expiresAt,
          acceptedAt: invitation.acceptedAt,
        })
        .from(invitation)
        .innerJoin(staffRole, eq(staffRole.id, invitation.staffRoleId))
        .innerJoin(organization, eq(organization.id, invitation.orgId))
        .innerJoin(person, eq(person.id, staffRole.personId))
        .where(eq(invitation.id, found.invitation_id));
      if (!row) throw new NotFoundException('Undangan tidak ditemukan');
      return {
        orgName: row.orgName,
        orgSlug: row.orgSlug,
        role: row.role,
        invitedName: row.invitedName,
        phoneMasked: maskPhone(row.phone),
        expired: row.expiresAt.getTime() < Date.now(),
        accepted: row.acceptedAt !== null,
      };
    });
  }

  /** Terima undangan: harus login dengan nomor yang diundang. */
  async accept(
    token: string,
    user: AuthUser,
    meta: Meta,
  ): Promise<{ slug: string; role: StaffRole }> {
    const found = await this.findInvitation(token);
    return withTenant(this.db, found.org_id, user.personId, async (tx) => {
      const [inv] = await tx
        .select()
        .from(invitation)
        .where(eq(invitation.id, found.invitation_id))
        .for('update');
      if (!inv) throw new NotFoundException('Undangan tidak ditemukan');
      if (inv.acceptedAt) throw new GoneException('Undangan ini sudah diterima');
      if (inv.expiresAt.getTime() < Date.now())
        throw new GoneException('Undangan sudah kedaluwarsa. Minta admin mengirim ulang.');
      const [role] = await tx.select().from(staffRole).where(eq(staffRole.id, inv.staffRoleId));
      if (!role || role.personId !== user.personId) {
        throw new ForbiddenException('Undangan ini untuk nomor WhatsApp lain');
      }
      if (role.status === 'removed') throw new GoneException('Undangan sudah dibatalkan');
      await tx.update(staffRole).set({ status: 'active' }).where(eq(staffRole.id, role.id));
      await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
      await this.audit.log(tx, {
        orgId: found.org_id,
        actorPersonId: user.personId,
        action: 'invitation.accepted',
        entityType: 'staff_role',
        entityId: role.id,
        meta: { role: role.role },
        ...meta,
      });
      const [org] = await tx
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, found.org_id));
      return { slug: org!.slug, role: role.role };
    });
  }

  private async findInvitation(token: string): Promise<{ invitation_id: string; org_id: string }> {
    const [found] = await withContext(this.db, {}, (tx) =>
      tx.execute<{ invitation_id: string; org_id: string }>(
        sql`select * from sg_find_invitation(${hashToken(token)})`,
      ),
    );
    if (!found) throw new NotFoundException('Undangan tidak ditemukan');
    return found;
  }

  /** Owner boleh mengelola siapa pun; admin hanya pelatih & team manager. Tidak boleh mengubah diri sendiri. */
  private async loadManageable(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    ctx: OrgContext,
    user: AuthUser,
    staffId: string,
  ) {
    const [target] = await tx
      .select()
      .from(staffRole)
      .where(and(eq(staffRole.id, staffId), ne(staffRole.status, 'removed')));
    if (!target) throw new NotFoundException('Staf tidak ditemukan');
    if (target.personId === user.personId)
      throw new ForbiddenException('Anda tidak bisa mengubah peran sendiri');
    if (ctx.role !== 'owner' && PRIVILEGED.includes(target.role)) {
      throw new ForbiddenException('Hanya owner yang bisa mengubah owner/admin');
    }
    return target;
  }

  private async assertNotLastOwner(tx: Parameters<Parameters<Database['transaction']>[0]>[0]) {
    const [r] = await tx
      .select({ n: count() })
      .from(staffRole)
      .where(and(eq(staffRole.role, 'owner'), eq(staffRole.status, 'active')));
    if ((r?.n ?? 0) <= 1) throw new ConflictException('Klub harus punya minimal satu owner');
  }
}
