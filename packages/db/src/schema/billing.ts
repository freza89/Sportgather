// Iuran, tagihan, pembayaran Midtrans, ledger & penarikan (M4). Semua tabel tenant + RLS.
// Nominal: bigint rupiah (mode number; aman sampai 9 kuadriliun).
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  checkoutStatusEnum,
  feePlanKindEnum,
  invoiceKindEnum,
  invoiceStatusEnum,
  ledgerKindEnum,
  withdrawalStatusEnum,
} from './enums.js';
import { person } from './identity.js';
import { bankAccount, document, membership, organization, team } from './tenant.js';

const orgRef = () =>
  uuid()
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' });
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const money = () => bigint({ mode: 'number' }).notNull();

/** Paket iuran (A-13, FEE-01). Berlaku untuk KU tertentu (kosong = semua). */
export const feePlan = pgTable(
  'fee_plan',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    name: text().notNull(),
    kind: feePlanKindEnum().notNull(),
    amount: money(),
    /** Bulanan: tanggal terbit tiap bulan (1–28 disarankan; 29–31 dijepit ke akhir bulan). */
    issueDay: integer().notNull().default(1),
    /** Jatuh tempo = tanggal terbit + N hari. */
    dueDays: integer().notNull().default(9),
    kuGroups: integer().array(),
    teamId: uuid().references(() => team.id, { onDelete: 'set null' }),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('fee_plan_org_idx').on(t.orgId)],
);

/** Urutan nomor tagihan per klub per periode (INV-YYMM-NNNN). */
export const invoiceCounter = pgTable(
  'invoice_counter',
  {
    orgId: orgRef(),
    period: text().notNull(),
    last: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.period] })],
);

export const invoice = pgTable(
  'invoice',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    number: text().notNull(),
    membershipId: uuid()
      .notNull()
      .references(() => membership.id),
    planId: uuid().references(() => feePlan.id),
    kind: invoiceKindEnum().notNull(),
    /** "2027-10" untuk iuran bulanan; "season:<id>" untuk registrasi. */
    period: text(),
    description: text().notNull(),
    amount: money(),
    discount: money().default(0),
    total: money(),
    issueDate: date({ mode: 'string' }).notNull(),
    dueDate: date({ mode: 'string' }).notNull(),
    status: invoiceStatusEnum().notNull().default('unpaid'),
    paidAt: timestamp({ withTimezone: true }),
    /** online (Midtrans) | cash | transfer */
    paidVia: text(),
    createdBy: uuid().references(() => person.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('invoice_number_key').on(t.orgId, t.number),
    // US-11: tidak ada tagihan ganda untuk periode & paket yang sama.
    uniqueIndex('invoice_period_key')
      .on(t.membershipId, t.planId, t.period)
      .where(sql`${t.planId} is not null and ${t.period} is not null and ${t.status} <> 'void'`),
    index('invoice_org_due_idx').on(t.orgId, t.dueDate),
  ],
);

/** Satu pembayaran wali untuk 1..n tagihan (ADR-003). */
export const checkout = pgTable(
  'checkout',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    guardianPersonId: uuid()
      .notNull()
      .references(() => person.id),
    method: text().notNull(),
    base: money(),
    serviceFee: money(),
    gross: money(),
    platformFee: money(),
    status: checkoutStatusEnum().notNull().default('pending'),
    paidAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('checkout_guardian_idx').on(t.orgId, t.guardianPersonId)],
);

export const checkoutInvoice = pgTable(
  'checkout_invoice',
  {
    orgId: orgRef(),
    checkoutId: uuid()
      .notNull()
      .references(() => checkout.id, { onDelete: 'cascade' }),
    invoiceId: uuid()
      .notNull()
      .references(() => invoice.id),
  },
  (t) => [primaryKey({ columns: [t.checkoutId, t.invoiceId] })],
);

/** Percobaan bayar ke Midtrans: order_id = id checkout + suffix percobaan. */
export const paymentAttempt = pgTable(
  'payment_attempt',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    checkoutId: uuid()
      .notNull()
      .references(() => checkout.id, { onDelete: 'cascade' }),
    orderId: text().notNull(),
    method: text().notNull(),
    gross: money(),
    snapToken: text(),
    redirectUrl: text(),
    /** Status terakhir dari Midtrans (pending, settlement, capture, expire, cancel, deny, failure). */
    gatewayStatus: text().notNull().default('pending'),
    paymentType: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('payment_attempt_order_key').on(t.orderId)],
);

/** Notifikasi HTTP Midtrans mentah (dedupe per order+status). */
export const gatewayEvent = pgTable(
  'gateway_event',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    orderId: text().notNull(),
    transactionStatus: text().notNull(),
    statusCode: text().notNull(),
    grossAmount: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    receivedAt: createdAt(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('gateway_event_key').on(t.orderId, t.transactionStatus, t.statusCode)],
);

/** Pembayaran yang melunasi tagihan: online (Midtrans) atau manual dengan bukti (US-14). */
export const payment = pgTable(
  'payment',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    invoiceId: uuid()
      .notNull()
      .references(() => invoice.id),
    checkoutId: uuid().references(() => checkout.id),
    method: text().notNull(),
    amount: money(),
    paidAt: timestamp({ withTimezone: true }).notNull(),
    recordedBy: uuid().references(() => person.id),
    proofDocumentId: uuid().references(() => document.id),
    reference: text(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payment_invoice_key').on(t.invoiceId),
    index('payment_checkout_idx').on(t.checkoutId),
  ],
);

/** Penarikan dana oleh owner (ADR-016) lewat Iris. */
export const withdrawal = pgTable(
  'withdrawal',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    amount: money(),
    fee: money(),
    net: money(),
    bankAccountId: uuid()
      .notNull()
      .references(() => bankAccount.id),
    status: withdrawalStatusEnum().notNull().default('processing'),
    providerRef: text(),
    failureReason: text(),
    requestedBy: uuid()
      .notNull()
      .references(() => person.id),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('withdrawal_org_idx').on(t.orgId, t.createdAt)],
);

/**
 * Ledger dana klub (append-only, sudut pandang klub): + bagian iuran online, − fee platform,
 * − biaya Midtrans yang ditanggung klub, − penarikan. Saldo bisa ditarik = jumlah entri dengan
 * available_at ≤ sekarang (dana sudah settle). Pembayaran manual tidak masuk ledger.
 */
export const ledgerEntry = pgTable(
  'ledger_entry',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgRef(),
    kind: ledgerKindEnum().notNull(),
    amount: bigint({ mode: 'number' }).notNull(),
    invoiceId: uuid().references(() => invoice.id),
    paymentId: uuid().references(() => payment.id),
    checkoutId: uuid().references(() => checkout.id),
    withdrawalId: uuid().references(() => withdrawal.id),
    availableAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_org_available_idx').on(t.orgId, t.availableAt),
    index('ledger_invoice_idx').on(t.invoiceId),
  ],
);
