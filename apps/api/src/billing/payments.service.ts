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
  bankAccount,
  checkout,
  checkoutInvoice,
  gatewayEvent,
  guardianLink,
  invoice,
  ledgerEntry,
  membership,
  notificationLog,
  organization,
  payment,
  paymentAttempt,
  person,
  userAccount,
  withdrawal,
  withContext,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import {
  PAYMENT_METHODS,
  checkoutBreakdown,
  daysOverdue,
  formatRupiah,
  reminderStage,
  withdrawalCheck,
  type CheckoutQuote,
  type CheckoutResult,
  type CheckoutStatus,
  type FeePolicy,
  type GuardianInvoice,
  type GuardianPayment,
  type MidtransNotification,
  type PaymentMethod,
  type PayoutOverview,
  type WithdrawalPolicy,
} from '@sportgather/shared';
import { and, asc, desc, eq, inArray, lte, gt, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { ENV, type Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import { WHATSAPP_SENDER, type MessageSender } from '../integrations/messaging.js';
import {
  PAYMENT_GATEWAY,
  PAYOUT_PROVIDER,
  isFailedStatus,
  isPaidStatus,
  verifyMidtransSignature,
  type GatewayStatus,
  type PaymentGateway,
  type PayoutProvider,
} from '../integrations/midtrans.js';
import { todayIso } from '../seasons/ku-context.js';

type Meta = { ip: string; userAgent: string | null };

interface ChildRef {
  orgId: string;
  membershipId: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(PAYOUT_PROVIDER) private readonly payout: PayoutProvider,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: MessageSender,
    private readonly audit: AuditService,
  ) {}

  get feePolicy(): FeePolicy {
    return {
      platformFee: this.env.PLATFORM_FEE,
      qrisSurchargeEnabled: this.env.QRIS_SERVICE_FEE_ENABLED,
    };
  }

  get withdrawalPolicy(): WithdrawalPolicy {
    return { minAmount: this.env.WITHDRAWAL_MIN, transferFee: this.env.WITHDRAWAL_FEE };
  }

  private async myChildren(user: AuthUser): Promise<ChildRef[]> {
    const rows = await withContext(this.db, { personId: user.personId }, (tx) =>
      tx.execute<{ org_id: string; membership_id: string }>(
        sql`select org_id, membership_id from sg_my_children_orgs(${user.personId})`,
      ),
    );
    return rows.map((r) => ({ orgId: r.org_id, membershipId: r.membership_id }));
  }

  private byOrg(refs: ChildRef[]): Map<string, string[]> {
    const m = new Map<string, string[]>();
    for (const r of refs) m.set(r.orgId, [...(m.get(r.orgId) ?? []), r.membershipId]);
    return m;
  }

  // ── O-05 · Wali: tagihan, checkout, status ─────────────────────────────────

  async myInvoices(user: AuthUser): Promise<GuardianInvoice[]> {
    const out: GuardianInvoice[] = [];
    const today = todayIso();
    for (const [orgId, ids] of this.byOrg(await this.myChildren(user))) {
      const rows = await withTenant(this.db, orgId, user.personId, (tx) =>
        tx
          .select({
            inv: invoice,
            childName: person.fullName,
            orgName: organization.name,
            orgSlug: organization.slug,
          })
          .from(invoice)
          .innerJoin(membership, eq(membership.id, invoice.membershipId))
          .innerJoin(person, eq(person.id, membership.personId))
          .innerJoin(organization, eq(organization.id, invoice.orgId))
          .where(and(inArray(invoice.membershipId, ids), eq(invoice.status, 'unpaid')))
          .orderBy(asc(invoice.dueDate)),
      );
      out.push(
        ...rows.map((r) => ({
          id: r.inv.id,
          orgName: r.orgName,
          orgSlug: r.orgSlug,
          childName: r.childName,
          description: r.inv.description,
          total: r.inv.total,
          discount: r.inv.discount,
          dueDate: r.inv.dueDate,
          overdueDays: daysOverdue(r.inv.dueDate, today),
        })),
      );
    }
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  async myPayments(user: AuthUser): Promise<GuardianPayment[]> {
    const out: GuardianPayment[] = [];
    for (const [orgId, ids] of this.byOrg(await this.myChildren(user))) {
      const rows = await withTenant(this.db, orgId, user.personId, (tx) =>
        tx
          .select({
            p: payment,
            description: invoice.description,
            childName: person.fullName,
            orgName: organization.name,
          })
          .from(payment)
          .innerJoin(invoice, eq(invoice.id, payment.invoiceId))
          .innerJoin(membership, eq(membership.id, invoice.membershipId))
          .innerJoin(person, eq(person.id, membership.personId))
          .innerJoin(organization, eq(organization.id, payment.orgId))
          .where(inArray(invoice.membershipId, ids))
          .orderBy(desc(payment.paidAt))
          .limit(100),
      );
      out.push(
        ...rows.map((r) => ({
          paymentId: r.p.id,
          orgName: r.orgName,
          description: r.description,
          childName: r.childName,
          method: r.p.method,
          amount: r.p.amount,
          paidAt: r.p.paidAt.toISOString(),
          checkoutId: r.p.checkoutId,
        })),
      );
    }
    return out.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }

  /** Tagihan milik anak-anak wali ini; semua harus dari satu klub dan belum lunas. */
  private async resolveMine(user: AuthUser, invoiceIds: string[]) {
    const refs = await this.myChildren(user);
    const ids = [...new Set(invoiceIds)];
    for (const [orgId, mids] of this.byOrg(refs)) {
      const rows = await withTenant(this.db, orgId, user.personId, (tx) =>
        tx
          .select({ inv: invoice, childName: person.fullName })
          .from(invoice)
          .innerJoin(membership, eq(membership.id, invoice.membershipId))
          .innerJoin(person, eq(person.id, membership.personId))
          .where(and(inArray(invoice.id, ids), inArray(invoice.membershipId, mids))),
      );
      if (!rows.length) continue;
      if (rows.length !== ids.length)
        throw new UnprocessableEntityException('Bayar tagihan dari satu klub dalam satu transaksi');
      if (rows.some((r) => r.inv.status !== 'unpaid'))
        throw new UnprocessableEntityException('Ada tagihan yang sudah lunas. Muat ulang halaman.');
      return { orgId, rows };
    }
    throw new NotFoundException('Tagihan tidak ditemukan');
  }

  async quote(user: AuthUser, invoiceIds: string[]): Promise<CheckoutQuote[]> {
    const { rows } = await this.resolveMine(user, invoiceIds);
    const invs = rows.map((r) => ({ id: r.inv.id, total: r.inv.total }));
    return (Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((method) => {
      const b = checkoutBreakdown(invs, method, this.feePolicy);
      return { method, base: b.base, serviceFee: b.serviceFee, gross: b.gross };
    });
  }

  /** ADR-003: satu checkout = satu order_id Midtrans untuk 1..n tagihan. */
  async createCheckout(
    user: AuthUser,
    input: { invoiceIds: string[]; method: PaymentMethod },
    meta: Meta,
  ): Promise<CheckoutResult> {
    const { orgId, rows } = await this.resolveMine(user, input.invoiceIds);
    const invs = rows.map((r) => ({ id: r.inv.id, total: r.inv.total }));
    const b = checkoutBreakdown(invs, input.method, this.feePolicy);
    if (b.base <= 0) throw new UnprocessableEntityException('Tidak ada yang perlu dibayar');
    const { co, orderId, guardian } = await withTenant(
      this.db,
      orgId,
      user.personId,
      async (tx) => {
        const [co] = await tx
          .insert(checkout)
          .values({
            orgId,
            guardianPersonId: user.personId,
            method: input.method,
            base: b.base,
            serviceFee: b.serviceFee,
            gross: b.gross,
            platformFee: b.platformFee,
          })
          .returning();
        await tx
          .insert(checkoutInvoice)
          .values(invs.map((i) => ({ orgId, checkoutId: co!.id, invoiceId: i.id })));
        const orderId = `SG-${co!.id}-1`;
        await tx.insert(paymentAttempt).values({
          orgId,
          checkoutId: co!.id,
          orderId,
          method: input.method,
          gross: b.gross,
        });
        const [g] = await tx
          .select({ fullName: person.fullName, phone: userAccount.phone })
          .from(person)
          .leftJoin(userAccount, eq(userAccount.personId, person.id))
          .where(eq(person.id, user.personId));
        await this.audit.log(tx, {
          orgId,
          actorPersonId: user.personId,
          action: 'checkout.create',
          entityType: 'checkout',
          entityId: co!.id,
          meta: { method: input.method, gross: b.gross, invoices: invs.length },
          ...meta,
        });
        return { co: co!, orderId, guardian: g };
      },
    );

    const items = rows.map((r) => ({
      id: r.inv.id.slice(0, 50),
      name: `${r.inv.description} - ${r.childName}`.slice(0, 50),
      price: r.inv.total,
      quantity: 1,
    }));
    if (b.serviceFee > 0)
      items.push({ id: 'service-fee', name: 'Biaya layanan', price: b.serviceFee, quantity: 1 });
    let snap: { token: string; redirectUrl: string };
    try {
      snap = await this.gateway.createTransaction({
        orderId,
        gross: b.gross,
        enabledPayments: [PAYMENT_METHODS[input.method].snap],
        items,
        customer: { firstName: guardian?.fullName ?? 'Wali', phone: guardian?.phone ?? null },
        finishUrl: `${this.env.WEB_ORIGIN}/wali/bayar/${co.id}`,
      });
    } catch (e) {
      this.logger.error(`Snap gagal untuk ${orderId}: ${(e as Error).message}`);
      await withTenant(this.db, orgId, user.personId, (tx) =>
        tx.update(checkout).set({ status: 'failed' }).where(eq(checkout.id, co.id)),
      );
      throw new UnprocessableEntityException(
        'Gagal menghubungi Midtrans. Coba lagi beberapa saat lagi.',
      );
    }
    await withTenant(this.db, orgId, user.personId, (tx) =>
      tx
        .update(paymentAttempt)
        .set({ snapToken: snap.token, redirectUrl: snap.redirectUrl })
        .where(eq(paymentAttempt.orderId, orderId)),
    );
    return { checkoutId: co.id, orderId, gross: b.gross, redirectUrl: snap.redirectUrl };
  }

  /**
   * Status checkout untuk halaman "selesai bayar". Bila masih pending, status dicek ulang ke
   * Midtrans (Status API) — sehingga pembayaran tetap tercatat walau webhook belum masuk
   * (mis. lokal tanpa URL publik).
   */
  async checkoutStatus(user: AuthUser, checkoutId: string): Promise<CheckoutStatus> {
    const orgId = await this.orgOfMyCheckout(user, checkoutId);
    let view = await this.loadCheckout(orgId, user.personId, checkoutId);
    if (view.status === 'pending' && view.orderId) {
      await this.reconcile(orgId, view.orderId, 'status-check');
      view = await this.loadCheckout(orgId, user.personId, checkoutId);
    }
    return {
      checkoutId: view.checkoutId,
      status: view.status,
      gross: view.gross,
      method: view.method,
      invoices: view.invoices,
    };
  }

  private async orgOfMyCheckout(user: AuthUser, checkoutId: string): Promise<string> {
    for (const orgId of new Set((await this.myChildren(user)).map((r) => r.orgId))) {
      const [row] = await withTenant(this.db, orgId, user.personId, (tx) =>
        tx
          .select({ id: checkout.id })
          .from(checkout)
          .where(and(eq(checkout.id, checkoutId), eq(checkout.guardianPersonId, user.personId))),
      );
      if (row) return orgId;
    }
    throw new NotFoundException('Pembayaran tidak ditemukan');
  }

  private async loadCheckout(orgId: string, personId: string | undefined, checkoutId: string) {
    return withTenant(this.db, orgId, personId, async (tx) => {
      const [co] = await tx.select().from(checkout).where(eq(checkout.id, checkoutId));
      if (!co) throw new NotFoundException('Pembayaran tidak ditemukan');
      const invs = await tx
        .select({
          id: invoice.id,
          description: invoice.description,
          childName: person.fullName,
          total: invoice.total,
        })
        .from(checkoutInvoice)
        .innerJoin(invoice, eq(invoice.id, checkoutInvoice.invoiceId))
        .innerJoin(membership, eq(membership.id, invoice.membershipId))
        .innerJoin(person, eq(person.id, membership.personId))
        .where(eq(checkoutInvoice.checkoutId, checkoutId));
      const [att] = await tx
        .select({ orderId: paymentAttempt.orderId })
        .from(paymentAttempt)
        .where(eq(paymentAttempt.checkoutId, checkoutId))
        .orderBy(desc(paymentAttempt.createdAt))
        .limit(1);
      return {
        checkoutId,
        status: co.status,
        gross: co.gross,
        method: co.method,
        invoices: invs,
        orderId: att?.orderId ?? null,
      };
    });
  }

  // ── Webhook Midtrans (US-12) ───────────────────────────────────────────────

  /**
   * HTTP notification. Signature diverifikasi, event mentah disimpan (dedupe), lalu status
   * dicek ulang ke Status API sebelum apa pun diubah. Aman diterima berkali-kali.
   */
  async handleNotification(n: MidtransNotification): Promise<{ ok: true; ignored?: string }> {
    if (!verifyMidtransSignature(n, this.env.MIDTRANS_SERVER_KEY))
      throw new ForbiddenException('Signature tidak valid');
    const [found] = await withContext(this.db, {}, (tx) =>
      tx.execute<{ attempt_id: string; org_id: string }>(
        sql`select attempt_id, org_id from sg_find_payment_attempt(${n.order_id})`,
      ),
    );
    // Order dari sistem lain di akun Midtrans yang sama (mis. tes dashboard): balas 200.
    if (!found) return { ok: true, ignored: 'unknown order' };
    await withTenant(this.db, found.org_id, undefined, (tx) =>
      tx
        .insert(gatewayEvent)
        .values({
          orgId: found.org_id,
          orderId: n.order_id,
          transactionStatus: n.transaction_status,
          statusCode: n.status_code,
          grossAmount: n.gross_amount,
          payload: n as Record<string, unknown>,
        })
        .onConflictDoNothing(),
    );
    await this.reconcile(found.org_id, n.order_id, 'webhook');
    await withTenant(this.db, found.org_id, undefined, (tx) =>
      tx
        .update(gatewayEvent)
        .set({ processedAt: new Date() })
        .where(
          and(
            eq(gatewayEvent.orderId, n.order_id),
            eq(gatewayEvent.transactionStatus, n.transaction_status),
            eq(gatewayEvent.statusCode, n.status_code),
          ),
        ),
    );
    return { ok: true };
  }

  /** Ambil status resmi dari Midtrans lalu terapkan (idempoten, dikunci per checkout). */
  async reconcile(orgId: string, orderId: string, source: string): Promise<void> {
    const status = await this.gateway.getStatus(orderId);
    await withTenant(this.db, orgId, undefined, (tx) =>
      this.apply(tx, orgId, orderId, status, source),
    );
  }

  private async apply(tx: Tx, orgId: string, orderId: string, s: GatewayStatus, source: string) {
    const [att] = await tx.select().from(paymentAttempt).where(eq(paymentAttempt.orderId, orderId));
    if (!att) return;
    const [co] = await tx
      .select()
      .from(checkout)
      .where(eq(checkout.id, att.checkoutId))
      .for('update');
    if (!co) return;
    await tx
      .update(paymentAttempt)
      .set({ gatewayStatus: s.transactionStatus, paymentType: s.paymentType })
      .where(eq(paymentAttempt.id, att.id));
    if (co.status === 'paid') return; // sudah diproses (webhook ganda / status-check)

    if (isFailedStatus(s)) {
      if (co.status === 'pending')
        await tx
          .update(checkout)
          .set({ status: s.transactionStatus === 'expire' ? 'expired' : 'failed' })
          .where(eq(checkout.id, co.id));
      return;
    }
    if (!isPaidStatus(s)) return;

    if (Math.round(Number(s.grossAmount)) !== co.gross) {
      this.logger.error(`Nominal ${orderId} tidak cocok: ${s.grossAmount} vs ${co.gross}`);
      await this.audit.log(tx, {
        orgId,
        actorPersonId: null,
        action: 'checkout.amount_mismatch',
        entityType: 'checkout',
        entityId: co.id,
        meta: { gateway: s.grossAmount, expected: co.gross, source },
      });
      return;
    }

    const paidAt = s.settlementTime ? parseMidtransTime(s.settlementTime) : new Date();
    const availableAt = new Date(paidAt.getTime() + this.env.SETTLEMENT_DELAY_HOURS * 3_600_000);
    await tx.update(checkout).set({ status: 'paid', paidAt }).where(eq(checkout.id, co.id));

    const invs = await tx
      .select({ i: invoice })
      .from(checkoutInvoice)
      .innerJoin(invoice, eq(invoice.id, checkoutInvoice.invoiceId))
      .where(eq(checkoutInvoice.checkoutId, co.id))
      .for('update', { of: invoice });
    // Fee dihitung atas seluruh checkout (yang memang dibayar wali).
    const b = checkoutBreakdown(
      invs.map((r) => ({ id: r.i.id, total: r.i.total })),
      co.method as PaymentMethod,
      {
        platformFee: co.platformFee,
        qrisSurchargeEnabled: co.serviceFee > 0 || co.method !== 'qris',
      },
    );
    const doubles: string[] = [];
    for (const part of b.perInvoice) {
      const inv = invs.find((r) => r.i.id === part.invoiceId)!.i;
      if (inv.status !== 'unpaid') {
        // Sudah dibayar lewat jalur lain (mis. manual) → dana tetap masuk klub, perlu refund manual.
        doubles.push(inv.id);
      } else {
        await tx
          .update(invoice)
          .set({ status: 'paid', paidAt, paidVia: 'online' })
          .where(eq(invoice.id, inv.id));
      }
      const [p] = doubles.includes(inv.id)
        ? [null]
        : await tx
            .insert(payment)
            .values({
              orgId,
              invoiceId: inv.id,
              checkoutId: co.id,
              method: co.method,
              amount: part.total,
              paidAt,
              reference: orderId,
            })
            .returning({ id: payment.id });
      const base = {
        orgId,
        invoiceId: inv.id,
        checkoutId: co.id,
        paymentId: p?.id ?? null,
        availableAt,
      };
      const entries: (typeof ledgerEntry.$inferInsert)[] = [
        { ...base, kind: 'club_gross', amount: part.total },
      ];
      if (part.platformFee)
        entries.push({ ...base, kind: 'platform_fee', amount: -part.platformFee });
      if (part.midtransFeeBorneByClub)
        entries.push({ ...base, kind: 'midtrans_fee', amount: -part.midtransFeeBorneByClub });
      await tx.insert(ledgerEntry).values(entries);
    }
    await this.audit.log(tx, {
      orgId,
      actorPersonId: null,
      action: 'checkout.paid',
      entityType: 'checkout',
      entityId: co.id,
      meta: { orderId, gross: co.gross, source, paymentType: s.paymentType, doublePaid: doubles },
    });
    await this.notifyPaid(tx, orgId, co, invs.length);
  }

  private async notifyPaid(tx: Tx, orgId: string, co: typeof checkout.$inferSelect, count: number) {
    const [g] = await tx
      .select({ phone: userAccount.phone, name: person.fullName, org: organization.name })
      .from(person)
      .innerJoin(userAccount, eq(userAccount.personId, person.id))
      .innerJoin(organization, eq(organization.id, sql`${orgId}::uuid`))
      .where(eq(person.id, co.guardianPersonId));
    if (!g?.phone) return;
    const inserted = await tx
      .insert(notificationLog)
      .values({
        orgId,
        dedupeKey: `paid:${co.id}`,
        template: 'pembayaran_berhasil',
        recipientPersonId: co.guardianPersonId,
      })
      .onConflictDoNothing()
      .returning({ id: notificationLog.id });
    if (!inserted.length) return;
    await this.whatsapp.send({
      channel: 'whatsapp',
      to: g.phone,
      template: 'pembayaran_berhasil',
      params: {
        nama: g.name,
        klub: g.org,
        jumlah: formatRupiah(co.gross),
        tagihan: String(count),
        link: `${this.env.WEB_ORIGIN}/wali/bayar/${co.id}`,
      },
    });
  }

  // ── A-15 · Penyaluran & penarikan dana (ADR-016) ───────────────────────────

  private async balances(tx: Tx, now = new Date()) {
    const [row] = await tx
      .select({
        available: sql<string>`coalesce(sum(${ledgerEntry.amount}) filter (where ${ledgerEntry.availableAt} <= ${now.toISOString()}::timestamptz), 0)`,
        pending: sql<string>`coalesce(sum(${ledgerEntry.amount}) filter (where ${ledgerEntry.availableAt} > ${now.toISOString()}::timestamptz), 0)`,
      })
      .from(ledgerEntry);
    return { available: Number(row!.available), pending: Number(row!.pending) };
  }

  async payoutOverview(ctx: OrgContext, user: AuthUser): Promise<PayoutOverview> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const now = new Date();
      const { available, pending } = await this.balances(tx, now);
      const [acct] = await tx
        .select()
        .from(bankAccount)
        .where(sql`${bankAccount.status} <> 'replaced'`)
        .limit(1);
      const wds = await tx.select().from(withdrawal).orderBy(desc(withdrawal.createdAt)).limit(50);
      const totalWithdrawn = wds
        .filter((w) => w.status === 'completed')
        .reduce((a, w) => a + w.amount, 0);
      const cos = await tx
        .select()
        .from(checkout)
        .where(eq(checkout.status, 'paid'))
        .orderBy(desc(checkout.paidAt))
        .limit(50);
      const ledger = cos.length
        ? await tx
            .select({
              e: ledgerEntry,
              number: invoice.number,
              playerName: person.fullName,
              total: invoice.total,
            })
            .from(ledgerEntry)
            .innerJoin(invoice, eq(invoice.id, ledgerEntry.invoiceId))
            .innerJoin(membership, eq(membership.id, invoice.membershipId))
            .innerJoin(person, eq(person.id, membership.personId))
            .where(
              inArray(
                ledgerEntry.checkoutId,
                cos.map((c) => c.id),
              ),
            )
        : [];
      return {
        available,
        pending,
        totalWithdrawn,
        policy: this.withdrawalPolicy,
        bankAccount: acct
          ? {
              maskedNumber: `••••${acct.accountNumber.slice(-4)}`,
              holderName: acct.holderName,
              status: acct.status,
            }
          : null,
        scheme: 'Penarikan manual (Iris) · biaya transfer dipotong dari nominal',
        withdrawals: wds.map((w) => ({
          id: w.id,
          createdAt: w.createdAt.toISOString(),
          amount: w.amount,
          fee: w.fee,
          net: w.net,
          status: w.status,
          providerRef: w.providerRef,
          failureReason: w.failureReason,
        })),
        transactions: cos.map((c) => {
          const rows = ledger.filter((l) => l.e.checkoutId === c.id);
          const sumKind = (k: string) =>
            rows.filter((r) => r.e.kind === k).reduce((a, r) => a + r.e.amount, 0);
          const perInv = new Map<
            string,
            { number: string; playerName: string; total: number; clubNet: number }
          >();
          for (const r of rows) {
            const cur = perInv.get(r.e.invoiceId!) ?? {
              number: r.number,
              playerName: r.playerName,
              total: r.total,
              clubNet: 0,
            };
            cur.clubNet += r.e.amount;
            perInv.set(r.e.invoiceId!, cur);
          }
          return {
            checkoutId: c.id,
            paidAt: c.paidAt!.toISOString(),
            method: c.method,
            gross: c.gross,
            midtransFee: c.serviceFee - sumKind('midtrans_fee'),
            platformFee: -sumKind('platform_fee'),
            clubNet: rows.reduce((a, r) => a + r.e.amount, 0),
            invoices: [...perInv.values()],
            available: rows.every((r) => r.e.availableAt <= now),
          };
        }),
      };
    });
  }

  /** Owner menarik dana. Rekening harus terverifikasi (penahanan penyaluran, FEE-07). */
  async withdraw(ctx: OrgContext, user: AuthUser, amount: number, meta: Meta) {
    if (ctx.role !== 'owner') throw new ForbiddenException('Hanya owner yang bisa menarik dana');
    const reserved = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      // Satu penarikan per klub pada satu waktu.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`withdraw:${ctx.id}`}))`);
      const [acct] = await tx
        .select()
        .from(bankAccount)
        .where(sql`${bankAccount.status} <> 'replaced'`)
        .limit(1);
      if (!acct) throw new UnprocessableEntityException('Tambahkan rekening klub dulu');
      if (acct.status !== 'verified')
        throw new UnprocessableEntityException(
          'Rekening klub belum terverifikasi. Dana ditahan sampai verifikasi selesai.',
        );
      const { available } = await this.balances(tx);
      const check = withdrawalCheck(amount, available, this.withdrawalPolicy);
      if (!check.ok) throw new UnprocessableEntityException(check.message);
      const [w] = await tx
        .insert(withdrawal)
        .values({
          orgId: ctx.id,
          amount,
          fee: this.withdrawalPolicy.transferFee,
          net: check.net,
          bankAccountId: acct.id,
          requestedBy: user.personId,
        })
        .returning();
      await tx.insert(ledgerEntry).values({
        orgId: ctx.id,
        kind: 'withdrawal',
        amount: -amount,
        withdrawalId: w!.id,
        availableAt: new Date(),
      });
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: 'withdrawal.request',
        entityType: 'withdrawal',
        entityId: w!.id,
        meta: { amount, net: check.net },
        ...meta,
      });
      return { w: w!, acct };
    });

    let result: Awaited<ReturnType<PayoutProvider['disburse']>>;
    try {
      result = await this.payout.disburse({
        reference: reserved.w.id,
        amount: reserved.w.net,
        bankCode: reserved.acct.bankCode,
        accountNumber: reserved.acct.accountNumber,
        holderName: reserved.acct.holderName,
        note: 'Penarikan dana SportGather',
      });
    } catch (e) {
      result = { status: 'failed', providerRef: '', failureReason: (e as Error).message };
    }
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      await tx
        .update(withdrawal)
        .set({
          status: result.status,
          providerRef: result.providerRef || null,
          failureReason: result.failureReason ?? null,
          completedAt: result.status === 'completed' ? new Date() : null,
        })
        .where(eq(withdrawal.id, reserved.w.id));
      if (result.status === 'failed') {
        // Ledger append-only: kembalikan saldo dengan entri balik.
        await tx.insert(ledgerEntry).values({
          orgId: ctx.id,
          kind: 'withdrawal',
          amount: reserved.w.amount,
          withdrawalId: reserved.w.id,
          availableAt: new Date(),
        });
      }
      await this.audit.log(tx, {
        orgId: ctx.id,
        actorPersonId: user.personId,
        action: `withdrawal.${result.status}`,
        entityType: 'withdrawal',
        entityId: reserved.w.id,
        meta: { failureReason: result.failureReason ?? null },
        ...meta,
      });
      return {
        id: reserved.w.id,
        status: result.status,
        net: reserved.w.net,
        failureReason: result.failureReason ?? null,
      };
    });
  }

  // ── Pengingat tagihan (PRD bagian 16) ──────────────────────────────────────

  /**
   * H-3, H, H+3, H+7 dari jatuh tempo; dikirim mulai 09.00 WIB, satu pesan per wali per hari
   * (beberapa tagihan digabung). Dedupe per tagihan & tahap di notification_log.
   */
  async runReminders(now = new Date()): Promise<{ sent: number }> {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        hour12: false,
      }).format(now),
    );
    if (hour < 9 || hour >= 21) return { sent: 0 };
    const today = todayIso(now);
    let sent = 0;
    const orgIds = (
      await withContext(this.db, {}, (tx) =>
        tx.execute<{ id: string }>(sql`select sg_all_org_ids() as id`),
      )
    ).map((r) => r.id);
    for (const orgId of orgIds) {
      const msgs = await withTenant(this.db, orgId, undefined, async (tx) => {
        const rows = await tx
          .select({
            inv: invoice,
            childName: person.fullName,
            guardianPersonId: guardianLink.guardianPersonId,
            phone: userAccount.phone,
            org: organization.name,
          })
          .from(invoice)
          .innerJoin(membership, eq(membership.id, invoice.membershipId))
          .innerJoin(person, eq(person.id, membership.personId))
          .innerJoin(
            guardianLink,
            and(
              eq(guardianLink.childPersonId, membership.personId),
              eq(guardianLink.isPrimary, true),
            ),
          )
          .innerJoin(userAccount, eq(userAccount.personId, guardianLink.guardianPersonId))
          .innerJoin(organization, eq(organization.id, invoice.orgId))
          .where(
            and(
              eq(invoice.status, 'unpaid'),
              lte(invoice.issueDate, today),
              gt(invoice.dueDate, sql`(${today}::date - 8)`),
            ),
          );
        const byGuardian = new Map<string, { phone: string; org: string; lines: string[] }>();
        for (const r of rows) {
          const stage = reminderStage(r.inv.dueDate, today);
          if (!stage || !r.phone) continue;
          const ins = await tx
            .insert(notificationLog)
            .values({
              orgId,
              dedupeKey: `invoice:${r.inv.id}:${stage}`,
              template: 'pengingat_iuran',
              recipientPersonId: r.guardianPersonId,
            })
            .onConflictDoNothing()
            .returning({ id: notificationLog.id });
          if (!ins.length) continue;
          const g = byGuardian.get(r.guardianPersonId) ?? { phone: r.phone, org: r.org, lines: [] };
          g.lines.push(
            `${r.childName}: ${r.inv.description} ${formatRupiah(r.inv.total)} (jatuh tempo ${r.inv.dueDate})`,
          );
          byGuardian.set(r.guardianPersonId, g);
        }
        return [...byGuardian.values()];
      });
      for (const m of msgs) {
        await this.whatsapp.send({
          channel: 'whatsapp',
          to: m.phone,
          template: 'pengingat_iuran',
          params: {
            klub: m.org,
            rincian: m.lines.join('\n'),
            link: `${this.env.WEB_ORIGIN}/wali/tagihan`,
          },
        });
        sent++;
      }
    }
    return { sent };
  }

  // ── Kuitansi ───────────────────────────────────────────────────────────────

  /** Data kuitansi untuk wali (hanya pembayaran anaknya). */
  async receiptForGuardian(user: AuthUser, paymentId: string) {
    for (const [orgId, ids] of this.byOrg(await this.myChildren(user))) {
      const r = await withTenant(this.db, orgId, user.personId, (tx) =>
        this.receiptData(tx, paymentId, ids),
      );
      if (r) return r;
    }
    throw new NotFoundException('Kuitansi tidak ditemukan');
  }

  async receiptForInvoice(ctx: OrgContext, user: AuthUser, invoiceId: string) {
    const r = await withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const [p] = await tx
        .select({ id: payment.id })
        .from(payment)
        .where(eq(payment.invoiceId, invoiceId));
      return p ? this.receiptData(tx, p.id) : null;
    });
    if (!r) throw new NotFoundException('Tagihan belum lunas');
    return r;
  }

  private async receiptData(tx: Tx, paymentId: string, membershipIds?: string[]) {
    const [row] = await tx
      .select({
        p: payment,
        inv: invoice,
        childName: person.fullName,
        org: organization.name,
        city: organization.city,
      })
      .from(payment)
      .innerJoin(invoice, eq(invoice.id, payment.invoiceId))
      .innerJoin(membership, eq(membership.id, invoice.membershipId))
      .innerJoin(person, eq(person.id, membership.personId))
      .innerJoin(organization, eq(organization.id, payment.orgId))
      .where(
        and(
          eq(payment.id, paymentId),
          membershipIds ? inArray(invoice.membershipId, membershipIds) : undefined,
        ),
      );
    if (!row) return null;
    return {
      orgName: row.org,
      orgCity: row.city,
      invoiceNumber: row.inv.number,
      childName: row.childName,
      description: row.inv.description,
      amount: row.inv.amount,
      discount: row.inv.discount,
      total: row.inv.total,
      method: row.p.method,
      paidAt: row.p.paidAt,
      reference: row.p.reference,
    };
  }

  assertMethod(m: string): asserts m is PaymentMethod {
    if (!(m in PAYMENT_METHODS)) throw new BadRequestException('Metode tidak dikenal');
  }
}

/** Midtrans memakai "2027-10-12 14:03:22" dalam WIB. */
export function parseMidtransTime(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s))
    return new Date(`${s.replace(' ', 'T')}+07:00`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
