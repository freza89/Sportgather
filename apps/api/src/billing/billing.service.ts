import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  checkout,
  checkoutInvoice,
  document,
  feePlan,
  invoice,
  membership,
  payment,
  person,
  team,
  teamMember,
  withContext,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  INVOICE_KIND_LABEL,
  daysOverdue,
  dueDateFor,
  invoiceAmounts,
  invoiceNumber,
  issueDateFor,
  kuFor,
  periodLabel,
  periodOf,
  type FeePlanDto,
  type FeePlanInputSchema,
  type InvoiceDto,
  type InvoiceListQuerySchema,
  type InvoiceSummary,
  type IsoDate,
  type ManualPaymentSchema,
  type OneTimeFeeSchema,
  type ScholarshipDto,
  type ScholarshipSchema,
} from '@sportgather/shared';
import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { loadKuContext, todayIso } from '../seasons/ku-context.js';
import type { UploadedFile } from '../common/multipart.js';
import { DocumentVault, MAX_DOCUMENT_BYTES, sniffMime } from '../storage/storage.js';

type Meta = { ip: string; userAgent: string | null };
type PlanRow = typeof feePlan.$inferSelect;
type InvoiceRow = typeof invoice.$inferSelect;

export interface BillablePlayer {
  membershipId: string;
  fullName: string;
  status: string;
  ku: number | null;
  teamName: string | null;
  scholarshipPct: number;
}

/** Paket bulanan yang berlaku untuk KU tsb: paket ber-KU spesifik menang atas paket "semua KU". */
export function planForKu<P extends Pick<PlanRow, 'kuGroups' | 'createdAt'>>(
  plans: P[],
  ku: number | null,
): P | null {
  const specific = plans.filter(
    (p) => p.kuGroups?.length && ku !== null && p.kuGroups.includes(ku),
  );
  if (specific.length) return specific[0]!;
  return plans.find((p) => !p.kuGroups?.length) ?? null;
}

/** Nomor urut tagihan berikutnya untuk klub & periode (atomik). */
export async function nextInvoiceNumber(tx: Tx, orgId: string, period: string): Promise<string> {
  const rows = await tx.execute<{ last: number }>(
    sql`insert into invoice_counter (org_id, period, last) values (${orgId}, ${period}, 1)
        on conflict (org_id, period) do update set last = invoice_counter.last + 1
        returning last`,
  );
  return invoiceNumber(period, Number(rows[0]!.last));
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly vault: DocumentVault,
  ) {}

  // ── Pemain & KU ────────────────────────────────────────────────────────────

  /** Pemain aktif/cuti beserta KU (KU tim aktif; tanpa tim: dihitung dari tanggal lahir). */
  async billablePlayers(tx: Tx): Promise<BillablePlayer[]> {
    const ctx = await loadKuContext(tx);
    const rows = await tx
      .select({
        membershipId: membership.id,
        fullName: person.fullName,
        birthDate: person.birthDate,
        status: membership.status,
        scholarshipPct: membership.scholarshipPct,
        teamKu: team.ku,
        teamName: team.name,
      })
      .from(membership)
      .innerJoin(person, eq(person.id, membership.personId))
      .leftJoin(
        teamMember,
        and(
          eq(teamMember.membershipId, membership.id),
          isNull(teamMember.leftAt),
          ctx.season ? eq(teamMember.seasonId, ctx.season.id) : sql`false`,
        ),
      )
      .leftJoin(team, eq(team.id, teamMember.teamId))
      .where(inArray(membership.status, ['active', 'on_leave']))
      .orderBy(asc(person.fullName));
    return rows.map((r) => ({
      membershipId: r.membershipId,
      fullName: r.fullName,
      status: r.status,
      ku: r.teamKu ?? (r.birthDate ? kuFor(r.birthDate, ctx.referenceDate, ctx.config) : null),
      teamName: r.teamName,
      scholarshipPct: r.scholarshipPct,
    }));
  }

  // ── A-13 · Paket iuran ─────────────────────────────────────────────────────

  async listPlans(ctx: OrgContext, user: AuthUser): Promise<FeePlanDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const plans = await tx.select().from(feePlan).orderBy(asc(feePlan.createdAt));
      const players = (await this.billablePlayers(tx)).filter((p) => p.status === 'active');
      const monthly = plans.filter((p) => p.kind === 'monthly' && p.active);
      return plans.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        amount: p.amount,
        issueDay: p.issueDay,
        dueDays: p.dueDays,
        kuGroups: p.kuGroups?.length ? p.kuGroups : null,
        active: p.active,
        playerCount: !p.active
          ? 0
          : p.kind === 'monthly'
            ? players.filter((pl) => planForKu(monthly, pl.ku)?.id === p.id).length
            : players.filter(
                (pl) => !p.kuGroups?.length || (pl.ku !== null && p.kuGroups.includes(pl.ku)),
              ).length,
      }));
    });
  }

  /** Satu paket aktif per pemain: KU paket bulanan aktif tidak boleh tumpang-tindih. */
  private async assertNoOverlap(tx: Tx, input: z.output<typeof FeePlanInputSchema>, id?: string) {
    if (input.kind !== 'monthly' || !input.active) return;
    const others = (
      await tx
        .select()
        .from(feePlan)
        .where(and(eq(feePlan.kind, 'monthly'), eq(feePlan.active, true)))
    ).filter((p) => p.id !== id);
    const mine = input.kuGroups?.length ? input.kuGroups : null;
    for (const o of others) {
      const theirs = o.kuGroups?.length ? o.kuGroups : null;
      if (!mine && !theirs)
        throw new UnprocessableEntityException(
          `Sudah ada paket bulanan untuk semua KU ("${o.name}"). Nonaktifkan dulu atau pilih KU tertentu.`,
        );
      if (mine && theirs && mine.some((k) => theirs.includes(k)))
        throw new UnprocessableEntityException(
          `KU ${mine.filter((k) => theirs.includes(k)).join(', ')} sudah memakai paket "${o.name}". Satu pemain hanya boleh punya satu paket bulanan aktif.`,
        );
    }
  }

  async createPlan(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof FeePlanInputSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      await this.assertNoOverlap(tx, input);
      const [p] = await tx
        .insert(feePlan)
        .values({
          orgId: ctx.id,
          name: input.name,
          kind: input.kind,
          amount: input.amount,
          issueDay: input.issueDay,
          dueDays: input.dueDays,
          kuGroups: input.kuGroups?.length ? input.kuGroups : null,
          active: input.active,
        })
        .returning();
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'fee_plan.create',
        entityType: 'fee_plan',
        entityId: p!.id,
        meta: { name: p!.name, amount: p!.amount, kind: p!.kind },
        ...meta,
      });
      return { id: p!.id };
    });
  }

  async updatePlan(
    ctx: OrgContext,
    user: AuthUser,
    id: string,
    input: z.output<typeof FeePlanInputSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [old] = await tx.select().from(feePlan).where(eq(feePlan.id, id));
      if (!old) throw new NotFoundException('Paket tidak ditemukan');
      if (old.kind !== input.kind)
        throw new UnprocessableEntityException('Jenis paket tidak bisa diubah');
      await this.assertNoOverlap(tx, input, id);
      await tx
        .update(feePlan)
        .set({
          name: input.name,
          amount: input.amount,
          issueDay: input.issueDay,
          dueDays: input.dueDays,
          kuGroups: input.kuGroups?.length ? input.kuGroups : null,
          active: input.active,
        })
        .where(eq(feePlan.id, id));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'fee_plan.update',
        entityType: 'fee_plan',
        entityId: id,
        meta: { from: { amount: old.amount, active: old.active }, to: input },
        ...meta,
      });
      // Tagihan yang sudah terbit tidak berubah; perubahan berlaku di periode berikutnya.
      return { id };
    });
  }

  async listScholarships(ctx: OrgContext, user: AuthUser): Promise<ScholarshipDto[]> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const rows = await tx
        .select({
          membershipId: membership.id,
          fullName: person.fullName,
          pct: membership.scholarshipPct,
          reason: membership.scholarshipReason,
        })
        .from(membership)
        .innerJoin(person, eq(person.id, membership.personId))
        .where(sql`${membership.scholarshipPct} > 0`)
        .orderBy(desc(membership.scholarshipPct), asc(person.fullName));
      return rows;
    });
  }

  async setScholarship(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof ScholarshipSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [m] = await tx
        .select({ id: membership.id, pct: membership.scholarshipPct })
        .from(membership)
        .where(eq(membership.id, input.membershipId));
      if (!m) throw new NotFoundException('Pemain tidak ditemukan');
      await tx
        .update(membership)
        .set({ scholarshipPct: input.pct, scholarshipReason: input.reason ?? null })
        .where(eq(membership.id, m.id));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'scholarship.set',
        entityType: 'membership',
        entityId: m.id,
        meta: { from: m.pct, to: input.pct, reason: input.reason ?? null },
        ...meta,
      });
      return { membershipId: m.id, pct: input.pct };
    });
  }

  // ── Terbit tagihan (US-11) ─────────────────────────────────────────────────

  /**
   * Terbitkan iuran bulanan periode `period` untuk semua pemain aktif (yang cuti dilewati).
   * Idempoten: pemain yang sudah punya tagihan paket+periode tsb dilewati, dan unique index
   * `invoice_period_key` menjaga dari dua proses yang berjalan bersamaan.
   */
  async issueMonthlyTx(
    tx: Tx,
    orgId: string,
    period: string,
    actor: string | null,
    opts: { onlyDue?: IsoDate } = {},
  ): Promise<{ created: number; skippedOnLeave: number; skippedExisting: number }> {
    const plans = await tx
      .select()
      .from(feePlan)
      .where(and(eq(feePlan.kind, 'monthly'), eq(feePlan.active, true)))
      .orderBy(asc(feePlan.createdAt));
    const issuable = opts.onlyDue
      ? plans.filter((p) => issueDateFor(period, p.issueDay) <= opts.onlyDue!)
      : plans;
    if (!issuable.length) return { created: 0, skippedOnLeave: 0, skippedExisting: 0 };
    const today = todayIso();
    const players = await this.billablePlayers(tx);
    const existing = new Set(
      (
        await tx
          .select({ m: invoice.membershipId, p: invoice.planId })
          .from(invoice)
          .where(and(eq(invoice.period, period), sql`${invoice.status} <> 'void'`))
      ).map((r) => `${r.m}:${r.p}`),
    );
    let created = 0;
    let skippedOnLeave = 0;
    let skippedExisting = 0;
    for (const pl of players) {
      const plan = planForKu(plans, pl.ku);
      if (!plan || !issuable.includes(plan)) continue;
      if (pl.status === 'on_leave') {
        skippedOnLeave++;
        continue;
      }
      if (existing.has(`${pl.membershipId}:${plan.id}`)) {
        skippedExisting++;
        continue;
      }
      // Terbit terlambat (mis. paket baru dibuat pertengahan bulan): tanggal terbit = hari ini,
      // agar tagihan tidak langsung terlambat begitu terbit.
      const planned = issueDateFor(period, plan.issueDay);
      const issueDate = planned < today ? today : planned;
      const amounts = invoiceAmounts(plan.amount, pl.scholarshipPct);
      const number = await nextInvoiceNumber(tx, orgId, period);
      const rows = await tx
        .insert(invoice)
        .values({
          orgId,
          number,
          membershipId: pl.membershipId,
          planId: plan.id,
          kind: 'recurring',
          period,
          description: `Iuran ${periodLabel(period)}`,
          ...amounts,
          issueDate,
          dueDate: dueDateFor(issueDate, plan.dueDays),
          // Beasiswa 100%: langsung dibebaskan.
          status: amounts.total === 0 ? 'waived' : 'unpaid',
          createdBy: actor,
        })
        .onConflictDoNothing()
        .returning({ id: invoice.id });
      if (rows.length) created++;
      else skippedExisting++;
    }
    return { created, skippedOnLeave, skippedExisting };
  }

  async issueMonthly(ctx: OrgContext, user: AuthUser, period: string | undefined, meta: Meta) {
    const p = period ?? periodOf(todayIso());
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const res = await this.issueMonthlyTx(tx, ctx.id, p, user.personId);
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'invoice.issue_monthly',
        entityType: 'invoice',
        meta: { period: p, ...res },
        ...meta,
      });
      return { period: p, ...res };
    });
  }

  /** Job harian: terbitkan iuran periode berjalan di semua klub saat tanggal terbit tiba. */
  async runIssuance(now = new Date()): Promise<{ created: number }> {
    const today = todayIso(now);
    const orgIds = await this.allOrgIds();
    let created = 0;
    for (const orgId of orgIds) {
      const res = await withTenant(this.db, orgId, undefined, (tx) =>
        this.issueMonthlyTx(tx, orgId, periodOf(today), null, { onlyDue: today }),
      );
      created += res.created;
    }
    return { created };
  }

  async allOrgIds(): Promise<string[]> {
    const rows = await withContext(this.db, {}, (tx) =>
      tx.execute<{ id: string }>(sql`select sg_all_org_ids() as id`),
    );
    return rows.map((r) => r.id);
  }

  /** Biaya registrasi musim berjalan untuk pemain aktif yang belum ditagih. */
  async issueRegistration(ctx: OrgContext, user: AuthUser, planId: string, meta: Meta) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [plan] = await tx.select().from(feePlan).where(eq(feePlan.id, planId));
      if (!plan || plan.kind !== 'registration' || !plan.active)
        throw new NotFoundException('Paket registrasi aktif tidak ditemukan');
      const kc = await loadKuContext(tx);
      if (!kc.season) throw new UnprocessableEntityException('Belum ada musim aktif');
      const period = `season:${kc.season.id}`;
      const today = todayIso();
      const players = (await this.billablePlayers(tx)).filter(
        (p) =>
          p.status === 'active' &&
          (!plan.kuGroups?.length || (p.ku !== null && plan.kuGroups.includes(p.ku))),
      );
      let created = 0;
      for (const pl of players) {
        const amounts = invoiceAmounts(plan.amount, pl.scholarshipPct);
        const number = await nextInvoiceNumber(tx, ctx.id, periodOf(today));
        const rows = await tx
          .insert(invoice)
          .values({
            orgId: ctx.id,
            number,
            membershipId: pl.membershipId,
            planId: plan.id,
            kind: 'registration',
            period,
            description: `${plan.name} · ${kc.season.name}`,
            ...amounts,
            issueDate: today,
            dueDate: dueDateFor(today, plan.dueDays),
            status: amounts.total === 0 ? 'waived' : 'unpaid',
            createdBy: user.personId,
          })
          .onConflictDoNothing()
          .returning({ id: invoice.id });
        created += rows.length;
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'invoice.issue_registration',
        entityType: 'fee_plan',
        entityId: plan.id,
        meta: { created },
        ...meta,
      });
      return { created };
    });
  }

  /** Biaya lain (FEE-03): mis. jersey, turnamen. */
  async oneTime(
    ctx: OrgContext,
    user: AuthUser,
    input: z.output<typeof OneTimeFeeSchema>,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const ids = [...new Set(input.membershipIds)];
      const found = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(
          and(inArray(membership.id, ids), inArray(membership.status, ['active', 'on_leave'])),
        );
      if (found.length !== ids.length)
        throw new UnprocessableEntityException('Ada pemain yang tidak ditemukan atau tidak aktif');
      const today = todayIso();
      for (const id of ids) {
        await tx.insert(invoice).values({
          orgId: ctx.id,
          number: await nextInvoiceNumber(tx, ctx.id, periodOf(today)),
          membershipId: id,
          kind: 'one_time',
          description: input.description,
          amount: input.amount,
          discount: 0,
          total: input.amount,
          issueDate: today,
          dueDate: input.dueDate < today ? today : input.dueDate,
          createdBy: user.personId,
        });
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'invoice.one_time',
        entityType: 'invoice',
        meta: { description: input.description, amount: input.amount, count: ids.length },
        ...meta,
      });
      return { created: ids.length };
    });
  }

  // ── A-14 · Daftar tagihan ──────────────────────────────────────────────────

  async listInvoices(
    ctx: OrgContext,
    user: AuthUser,
    q: z.output<typeof InvoiceListQuerySchema>,
  ): Promise<{ summary: InvoiceSummary; invoices: InvoiceDto[] }> {
    const period = q.period ?? periodOf(todayIso());
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const rows = await this.invoiceRows(tx, {
        period: q.membershipId ? undefined : period,
        membershipId: q.membershipId,
        q: q.q,
      });
      const today = todayIso();
      const all = rows.map((r) => toInvoiceDto(r, today));
      const live = all.filter((i) => i.status !== 'void');
      const sum = (xs: InvoiceDto[]) => xs.reduce((a, i) => a + i.total, 0);
      const paid = live.filter((i) => i.status === 'paid');
      const unpaid = live.filter((i) => i.status === 'unpaid');
      const overdue = unpaid.filter((i) => i.overdueDays > 0);
      const billed = live.filter((i) => i.status !== 'waived');
      const summary: InvoiceSummary = {
        period,
        billed: { amount: sum(billed), count: billed.length },
        paid: {
          amount: sum(paid),
          count: paid.length,
          pct: billed.length ? Math.round((paid.length / billed.length) * 100) : 0,
        },
        waiting: { amount: sum(unpaid), count: unpaid.length },
        overdue: {
          amount: sum(overdue),
          count: overdue.length,
          maxDays: Math.max(0, ...overdue.map((i) => i.overdueDays)),
        },
      };
      const filtered = all.filter((i) => {
        switch (q.status) {
          case 'paid':
            return i.status === 'paid';
          case 'unpaid':
            return i.status === 'unpaid';
          case 'overdue':
            return i.status === 'unpaid' && i.overdueDays > 0;
          case 'manual':
            return i.status === 'paid' && i.paidVia !== 'online';
          case 'waived':
            return i.status === 'waived';
          default:
            return i.status !== 'void';
        }
      });
      return { summary, invoices: filtered };
    });
  }

  async invoiceRows(
    tx: Tx,
    f: {
      period?: string | undefined;
      membershipId?: string | undefined;
      membershipIds?: string[];
      ids?: string[];
      q?: string | undefined;
    },
  ) {
    return tx
      .select({
        inv: invoice,
        playerName: person.fullName,
        teamName: team.name,
        method: payment.method,
      })
      .from(invoice)
      .innerJoin(membership, eq(membership.id, invoice.membershipId))
      .innerJoin(person, eq(person.id, membership.personId))
      .leftJoin(
        teamMember,
        and(eq(teamMember.membershipId, membership.id), isNull(teamMember.leftAt)),
      )
      .leftJoin(team, eq(team.id, teamMember.teamId))
      .leftJoin(payment, eq(payment.invoiceId, invoice.id))
      .where(
        and(
          f.period
            ? sql`(${invoice.period} = ${f.period} or (${invoice.kind} <> 'recurring' and to_char(${invoice.issueDate}, 'YYYY-MM') = ${f.period}))`
            : undefined,
          f.membershipId ? eq(invoice.membershipId, f.membershipId) : undefined,
          f.membershipIds ? inArray(invoice.membershipId, f.membershipIds) : undefined,
          f.ids ? inArray(invoice.id, f.ids) : undefined,
          f.q ? ilike(person.fullName, `%${f.q}%`) : undefined,
        ),
      )
      .orderBy(desc(invoice.issueDate), asc(person.fullName));
  }

  // ── Bayar manual (US-14) ───────────────────────────────────────────────────

  async recordManual(
    ctx: OrgContext,
    user: AuthUser,
    invoiceId: string,
    input: z.output<typeof ManualPaymentSchema>,
    proof: UploadedFile | undefined,
    meta: Meta,
  ) {
    if (input.paidAt > todayIso())
      throw new BadRequestException('Tanggal bayar tidak boleh di masa depan');
    let sniff: { mime: string; ext: string } | null = null;
    if (proof) {
      if (proof.buffer.length > MAX_DOCUMENT_BYTES)
        throw new BadRequestException('Ukuran file maksimal 5 MB');
      sniff = sniffMime(proof.buffer);
      if (!sniff) throw new BadRequestException('Bukti harus berupa JPG, PNG, atau PDF');
    } else if (input.method === 'transfer') {
      throw new BadRequestException('Unggah bukti transfer');
    }
    const stored = proof ? await this.vault.save(ctx.id, proof.buffer) : null;
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [inv] = await tx
        .select({ i: invoice, childPersonId: membership.personId })
        .from(invoice)
        .innerJoin(membership, eq(membership.id, invoice.membershipId))
        .where(eq(invoice.id, invoiceId))
        .for('update', { of: invoice });
      if (!inv) throw new NotFoundException('Tagihan tidak ditemukan');
      if (inv.i.status !== 'unpaid')
        throw new UnprocessableEntityException('Tagihan ini sudah lunas atau dibebaskan');
      let proofId: string | null = null;
      if (stored && proof && sniff) {
        const [doc] = await tx
          .insert(document)
          .values({
            orgId: ctx.id,
            personId: inv.childPersonId,
            kind: 'bukti_bayar',
            storageKey: stored.storageKey,
            fileName: proof.filename || `bukti.${sniff.ext}`,
            mimeType: sniff.mime,
            sizeBytes: proof.buffer.length,
            sha256: stored.sha256,
            status: 'verified',
            uploadedBy: user.personId,
            reviewedBy: user.personId,
            reviewedAt: new Date(),
          })
          .returning({ id: document.id });
        proofId = doc!.id;
      }
      const paidAt = new Date(`${input.paidAt}T12:00:00+07:00`);
      const [p] = await tx
        .insert(payment)
        .values({
          orgId: ctx.id,
          invoiceId,
          method: input.method,
          amount: inv.i.total,
          paidAt,
          recordedBy: user.personId,
          proofDocumentId: proofId,
          reference: input.reference ?? null,
          note: input.note ?? null,
        })
        .returning({ id: payment.id });
      await tx
        .update(invoice)
        .set({ status: 'paid', paidAt, paidVia: input.method })
        .where(eq(invoice.id, invoiceId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'payment.manual',
        entityType: 'invoice',
        entityId: invoiceId,
        meta: {
          method: input.method,
          amount: inv.i.total,
          paymentId: p!.id,
          proof: Boolean(proofId),
        },
        ...meta,
      });
      return { paymentId: p!.id };
    });
  }

  async setStatus(
    ctx: OrgContext,
    user: AuthUser,
    invoiceId: string,
    status: 'waived' | 'void',
    reason: string,
    meta: Meta,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [inv] = await tx.select().from(invoice).where(eq(invoice.id, invoiceId)).for('update');
      if (!inv) throw new NotFoundException('Tagihan tidak ditemukan');
      if (inv.status !== 'unpaid')
        throw new UnprocessableEntityException('Hanya tagihan belum lunas yang bisa diubah');
      const [pending] = await tx
        .select({ id: checkout.id })
        .from(checkoutInvoice)
        .innerJoin(checkout, eq(checkout.id, checkoutInvoice.checkoutId))
        .where(and(eq(checkoutInvoice.invoiceId, invoiceId), eq(checkout.status, 'pending')))
        .limit(1);
      if (pending && status === 'void')
        throw new UnprocessableEntityException(
          'Wali sedang dalam proses pembayaran tagihan ini. Coba lagi nanti.',
        );
      await tx.update(invoice).set({ status }).where(eq(invoice.id, invoiceId));
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: `invoice.${status}`,
        entityType: 'invoice',
        entityId: invoiceId,
        meta: { reason, total: inv.total },
        ...meta,
      });
      return { id: invoiceId, status };
    });
  }

  async proof(ctx: OrgContext, user: AuthUser, invoiceId: string) {
    const doc = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [row] = await tx
        .select({ d: document })
        .from(payment)
        .innerJoin(document, eq(document.id, payment.proofDocumentId))
        .where(eq(payment.invoiceId, invoiceId));
      return row?.d ?? null;
    });
    if (!doc) throw new NotFoundException('Bukti tidak ditemukan');
    return {
      body: await this.vault.read(doc.storageKey),
      mime: doc.mimeType,
      fileName: doc.fileName,
    };
  }

  assertOwner(ctx: OrgContext) {
    if (ctx.role !== 'owner') throw new ForbiddenException('Hanya owner');
  }
}

export function toInvoiceDto(
  r: { inv: InvoiceRow; playerName: string; teamName: string | null; method: string | null },
  today: IsoDate,
): InvoiceDto {
  const i = r.inv;
  return {
    id: i.id,
    number: i.number,
    membershipId: i.membershipId,
    playerName: r.playerName,
    teamName: r.teamName,
    kind: i.kind,
    description: i.description || INVOICE_KIND_LABEL[i.kind],
    period: i.period?.startsWith('season:') ? null : i.period,
    amount: i.amount,
    discount: i.discount,
    total: i.total,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    status: i.status,
    overdueDays: i.status === 'unpaid' ? daysOverdue(i.dueDate, today) : 0,
    paidAt: i.paidAt?.toISOString() ?? null,
    paidVia: i.paidVia,
    method: r.method,
  };
}
