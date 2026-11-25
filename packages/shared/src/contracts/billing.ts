import { z } from 'zod';
import { PAYMENT_METHOD_KEYS, type PaymentMethod } from '../billing/billing.js';
import { IsoDateSchema, KuGroupsSchema } from './players.js';

const MoneySchema = z.coerce.number().int('Nominal harus bilangan bulat').min(0).max(1_000_000_000);

// A-13 · Paket iuran
export const FeePlanInputSchema = z.object({
  name: z.string().trim().min(3).max(80),
  kind: z.enum(['monthly', 'registration']),
  amount: MoneySchema.refine((v) => v > 0, 'Nominal wajib diisi'),
  issueDay: z.coerce.number().int().min(1).max(31).default(1),
  dueDays: z.coerce.number().int().min(0).max(60).default(9),
  /** Kosong/null = semua KU. */
  kuGroups: KuGroupsSchema.nullable().optional(),
  active: z.boolean().default(true),
});
export type FeePlanInput = z.input<typeof FeePlanInputSchema>;

export interface FeePlanDto {
  id: string;
  name: string;
  kind: 'monthly' | 'registration';
  amount: number;
  issueDay: number;
  dueDays: number;
  kuGroups: number[] | null;
  active: boolean;
  playerCount: number;
}

export const ScholarshipSchema = z.object({
  membershipId: z.uuid(),
  pct: z.coerce.number().int().min(0).max(100),
  reason: z.string().trim().max(200).optional(),
});

export interface ScholarshipDto {
  membershipId: string;
  fullName: string;
  pct: number;
  reason: string | null;
}

// A-14 · Tagihan
export const IssueInvoicesSchema = z.object({
  /** "YYYY-MM"; default periode berjalan. */
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode harus YYYY-MM')
    .optional(),
});

export const OneTimeFeeSchema = z.object({
  description: z.string().trim().min(3).max(100),
  amount: MoneySchema.refine((v) => v > 0, 'Nominal wajib diisi'),
  dueDate: IsoDateSchema,
  membershipIds: z.array(z.uuid()).min(1, 'Pilih minimal satu pemain').max(2000),
});

export const InvoiceListQuerySchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  status: z.enum(['all', 'paid', 'unpaid', 'overdue', 'manual', 'waived']).default('all'),
  q: z.string().trim().max(100).optional(),
  membershipId: z.uuid().optional(),
});

export interface InvoiceDto {
  id: string;
  number: string;
  membershipId: string;
  playerName: string;
  teamName: string | null;
  kind: 'recurring' | 'registration' | 'one_time';
  description: string;
  period: string | null;
  amount: number;
  discount: number;
  total: number;
  issueDate: string;
  dueDate: string;
  status: 'unpaid' | 'paid' | 'waived' | 'void';
  overdueDays: number;
  paidAt: string | null;
  paidVia: string | null;
  method: string | null;
}

export interface InvoiceSummary {
  period: string;
  billed: { amount: number; count: number };
  paid: { amount: number; count: number; pct: number };
  waiting: { amount: number; count: number };
  overdue: { amount: number; count: number; maxDays: number };
}

export const ManualPaymentSchema = z.object({
  method: z.enum(['cash', 'transfer']),
  paidAt: IsoDateSchema,
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(200).optional(),
});

// O-05 · Bayar
export const CheckoutSchema = z.object({
  invoiceIds: z.array(z.uuid()).min(1, 'Pilih tagihan').max(20),
  method: z.enum(PAYMENT_METHOD_KEYS as [PaymentMethod, ...PaymentMethod[]]),
});

export interface CheckoutQuote {
  method: PaymentMethod;
  base: number;
  serviceFee: number;
  gross: number;
}

export interface CheckoutResult {
  checkoutId: string;
  orderId: string;
  gross: number;
  redirectUrl: string;
}

export interface CheckoutStatus {
  checkoutId: string;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  gross: number;
  method: string;
  invoices: { id: string; description: string; childName: string; total: number }[];
}

export interface GuardianInvoice {
  id: string;
  orgName: string;
  orgSlug: string;
  childName: string;
  description: string;
  total: number;
  discount: number;
  dueDate: string;
  overdueDays: number;
}

export interface GuardianPayment {
  paymentId: string;
  orgName: string;
  description: string;
  childName: string;
  method: string;
  amount: number;
  paidAt: string;
  checkoutId: string | null;
}

// A-15 · Penyaluran dana
export interface PayoutOverview {
  available: number;
  pending: number;
  totalWithdrawn: number;
  policy: { minAmount: number; transferFee: number };
  bankAccount: { maskedNumber: string; holderName: string; status: string } | null;
  scheme: string;
  withdrawals: {
    id: string;
    createdAt: string;
    amount: number;
    fee: number;
    net: number;
    status: 'processing' | 'completed' | 'failed';
    providerRef: string | null;
    failureReason: string | null;
  }[];
  transactions: {
    checkoutId: string;
    paidAt: string;
    method: string;
    gross: number;
    midtransFee: number;
    platformFee: number;
    clubNet: number;
    invoices: { number: string; playerName: string; total: number; clubNet: number }[];
    available: boolean;
  }[];
}

export const WithdrawalSchema = z.object({ amount: MoneySchema });

// Notifikasi webhook Midtrans (HTTP notification) — field yang dipakai.
export const MidtransNotificationSchema = z.looseObject({
  order_id: z.string().min(1),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_status: z.string(),
  payment_type: z.string().optional(),
  fraud_status: z.string().optional(),
  transaction_id: z.string().optional(),
  settlement_time: z.string().optional(),
});
export type MidtransNotification = z.infer<typeof MidtransNotificationSchema>;
