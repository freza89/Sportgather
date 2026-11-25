import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { MidtransNotification } from '@sportgather/shared';

/**
 * Midtrans Snap + HTTP notification. Status bayar HANYA dipercaya dari notifikasi yang
 * signature_key-nya valid, lalu dicek ulang lewat API status (PRD bagian 13, US-12).
 */
export interface SnapRequest {
  orderId: string;
  gross: number;
  enabledPayments: string[];
  items: { id: string; name: string; price: number; quantity: number }[];
  customer: { firstName: string; phone: string | null };
  finishUrl: string;
}

export interface GatewayStatus {
  orderId: string;
  transactionStatus: string;
  statusCode: string;
  grossAmount: string;
  paymentType: string | null;
  fraudStatus: string | null;
  settlementTime: string | null;
}

export interface PaymentGateway {
  createTransaction(req: SnapRequest): Promise<{ token: string; redirectUrl: string }>;
  getStatus(orderId: string): Promise<GatewayStatus>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** signature_key = SHA512(order_id + status_code + gross_amount + server_key). */
export function midtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

export function verifyMidtransSignature(
  n: Pick<MidtransNotification, 'order_id' | 'status_code' | 'gross_amount' | 'signature_key'>,
  serverKey: string,
): boolean {
  const expected = Buffer.from(
    midtransSignature(n.order_id, n.status_code, n.gross_amount, serverKey),
    'hex',
  );
  const given = Buffer.from(n.signature_key, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** "350000.00" — format gross_amount Midtrans. */
export const grossString = (gross: number) => `${gross}.00`;

/** Status lunas menurut Midtrans. */
export function isPaidStatus(s: Pick<GatewayStatus, 'transactionStatus' | 'fraudStatus'>): boolean {
  return (
    s.transactionStatus === 'settlement' ||
    (s.transactionStatus === 'capture' && (s.fraudStatus ?? 'accept') === 'accept')
  );
}

export function isFailedStatus(s: Pick<GatewayStatus, 'transactionStatus'>): boolean {
  return ['expire', 'cancel', 'deny', 'failure'].includes(s.transactionStatus);
}

/**
 * Midtrans tiruan (sampai akses Midtrans dari pihak terkait tersedia). Menyimpan transaksi di
 * memori, punya halaman bayar simulasi di web (/dev/midtrans/<order_id>), dan menghasilkan
 * notifikasi dengan signature_key yang sama dengan Midtrans asli.
 */
@Injectable()
export class MockMidtrans implements PaymentGateway {
  private readonly logger = new Logger('MockMidtrans');
  private readonly txs = new Map<string, GatewayStatus & { finishUrl: string }>();
  private webOrigin = 'http://localhost:3000';
  private serverKey = 'SB-Mid-server-MOCK-sportgather';

  configure(webOrigin: string, serverKey: string) {
    this.webOrigin = webOrigin;
    this.serverKey = serverKey;
  }

  async createTransaction(req: SnapRequest) {
    this.txs.set(req.orderId, {
      orderId: req.orderId,
      transactionStatus: 'pending',
      statusCode: '201',
      grossAmount: grossString(req.gross),
      paymentType: null,
      fraudStatus: null,
      settlementTime: null,
      finishUrl: req.finishUrl,
    });
    this.logger.log(`Snap mock ${req.orderId} Rp${req.gross}`);
    return {
      token: `mock-${req.orderId}`,
      redirectUrl: `${this.webOrigin}/dev/midtrans/${encodeURIComponent(req.orderId)}`,
    };
  }

  async getStatus(orderId: string): Promise<GatewayStatus> {
    const tx = this.txs.get(orderId);
    if (!tx)
      return {
        orderId,
        transactionStatus: 'not_found',
        statusCode: '404',
        grossAmount: '0.00',
        paymentType: null,
        fraudStatus: null,
        settlementTime: null,
      };
    return {
      orderId: tx.orderId,
      transactionStatus: tx.transactionStatus,
      statusCode: tx.statusCode,
      grossAmount: tx.grossAmount,
      paymentType: tx.paymentType,
      fraudStatus: tx.fraudStatus,
      settlementTime: tx.settlementTime,
    };
  }

  info(orderId: string) {
    return this.txs.get(orderId) ?? null;
  }

  /** Simulasikan hasil pembayaran; mengembalikan payload notifikasi bertanda tangan. */
  simulate(
    orderId: string,
    outcome: 'settlement' | 'expire' | 'deny',
    paymentType = 'qris',
  ): MidtransNotification {
    const tx = this.txs.get(orderId);
    if (!tx) throw new Error('Transaksi mock tidak ditemukan');
    tx.transactionStatus = outcome;
    tx.statusCode = outcome === 'settlement' ? '200' : outcome === 'deny' ? '202' : '407';
    tx.paymentType = paymentType;
    tx.fraudStatus = outcome === 'settlement' ? 'accept' : null;
    tx.settlementTime = outcome === 'settlement' ? new Date().toISOString() : null;
    return {
      order_id: orderId,
      status_code: tx.statusCode,
      gross_amount: tx.grossAmount,
      transaction_status: outcome,
      payment_type: paymentType,
      ...(tx.fraudStatus ? { fraud_status: tx.fraudStatus } : {}),
      ...(tx.settlementTime ? { settlement_time: tx.settlementTime } : {}),
      transaction_id: `mock-tx-${orderId}`,
      signature_key: midtransSignature(orderId, tx.statusCode, tx.grossAmount, this.serverKey),
    };
  }
}

/**
 * Implementasi Midtrans asli (Snap API + Status API). Belum diuji ke sandbox — aktif lewat
 * PAYMENT_PROVIDER=real setelah server key tersedia. TODO(midtrans-access): uji end-to-end
 * dengan sandbox sebelum dipakai.
 */
export class MidtransHttpGateway implements PaymentGateway {
  constructor(
    private readonly serverKey: string,
    private readonly production: boolean,
  ) {}

  private get auth() {
    return `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`;
  }

  async createTransaction(req: SnapRequest) {
    const base = this.production ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
    const res = await fetch(`${base}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        authorization: this.auth,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        transaction_details: { order_id: req.orderId, gross_amount: req.gross },
        item_details: req.items,
        customer_details: {
          first_name: req.customer.firstName,
          phone: req.customer.phone ?? undefined,
        },
        enabled_payments: req.enabledPayments,
        callbacks: { finish: req.finishUrl },
      }),
    });
    if (!res.ok) throw new Error(`Midtrans Snap ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { token: string; redirect_url: string };
    return { token: body.token, redirectUrl: body.redirect_url };
  }

  async getStatus(orderId: string): Promise<GatewayStatus> {
    const base = this.production ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
    const res = await fetch(`${base}/v2/${encodeURIComponent(orderId)}/status`, {
      headers: { authorization: this.auth, accept: 'application/json' },
    });
    const b = (await res.json()) as Record<string, string | undefined>;
    return {
      orderId,
      transactionStatus: b.transaction_status ?? 'not_found',
      statusCode: b.status_code ?? String(res.status),
      grossAmount: b.gross_amount ?? '0.00',
      paymentType: b.payment_type ?? null,
      fraudStatus: b.fraud_status ?? null,
      settlementTime: b.settlement_time ?? null,
    };
  }
}

// ── Penyaluran dana (FEE-07, ADR-016: penarikan manual lewat Iris) ──────────────

export interface PayoutProvider {
  disburse(req: {
    reference: string;
    amount: number;
    bankCode: string;
    accountNumber: string;
    holderName: string;
    note: string;
  }): Promise<{
    status: 'completed' | 'processing' | 'failed';
    providerRef: string;
    failureReason?: string;
  }>;
}

export const PAYOUT_PROVIDER = Symbol('PAYOUT_PROVIDER');

/** Iris tiruan: langsung berhasil; rekening berakhiran 0000 gagal (untuk uji). */
@Injectable()
export class MockIris implements PayoutProvider {
  async disburse(req: { reference: string; accountNumber: string }) {
    if (req.accountNumber.endsWith('0000'))
      return {
        status: 'failed' as const,
        providerRef: `iris-mock-${req.reference}`,
        failureReason: 'Rekening tujuan tidak valid',
      };
    return { status: 'completed' as const, providerRef: `iris-mock-${req.reference}` };
  }
}
