import { addDays, checkoutBreakdown, periodOf } from '@sportgather/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { midtransSignature, MockMidtrans } from '../integrations/midtrans.js';
import { todayIso } from '../seasons/ku-context.js';
import { CLUB, Client, createHarness, type Harness } from '../test/harness.js';
import { BillingService } from './billing.service.js';

/** M4: paket iuran, terbit tagihan, checkout Midtrans + webhook idempoten, ledger, penarikan. */
describe('M4 · iuran & pembayaran', () => {
  let h: Harness;
  let owner: Client;
  let wali: Client;
  let otherWali: Client;
  let slug: string;
  let players: { membershipId: string; fullName: string }[];
  const base = () => `/v1/orgs/${slug}`;
  const today = todayIso();
  const period = periodOf(today);
  const byName = (n: string) => players.find((p) => p.fullName === n)!.membershipId;

  beforeAll(async () => {
    h = await createHarness();
    owner = new Client(h);
    await owner.loginOtp('081600000001', { purpose: 'signup', fullName: 'Owner Iuran' });
    slug = (await owner.call('POST', '/v1/orgs', CLUB)).body.slug;
    await owner.call('POST', `${base()}/seasons`, {
      name: 'Musim Iuran',
      startsOn: addDays(today, -30),
      endsOn: addDays(today, 200),
    });
    const year = Number(today.slice(0, 4));
    await owner.call('POST', `${base()}/players/import`, {
      commit: true,
      rows: [
        {
          fullName: 'Kakak Bayar',
          birthDate: `${year - 10}-03-01`,
          gender: 'L',
          guardianName: 'Rina',
          guardianPhone: '081322220001',
        },
        {
          fullName: 'Adik Bayar',
          birthDate: `${year - 9}-03-01`,
          gender: 'P',
          guardianName: 'Rina',
          guardianPhone: '081322220001',
        },
        {
          fullName: 'Beasiswa Penuh',
          birthDate: `${year - 10}-06-01`,
          gender: 'L',
          guardianName: 'Budi',
          guardianPhone: '081322220002',
        },
        {
          fullName: 'Sedang Cuti',
          birthDate: `${year - 10}-07-01`,
          gender: 'L',
          guardianName: 'Sari',
          guardianPhone: '081322220003',
        },
      ],
    });
    players = (await owner.call('GET', `${base()}/players`)).body.rows;
    await owner.call('PATCH', `${base()}/players/${byName('Sedang Cuti')}`, {
      status: 'on_leave',
      statusReason: 'Cedera',
    });
    wali = new Client(h);
    await wali.loginOtp('081322220001');
    otherWali = new Client(h);
    await otherWali.loginOtp('081322220002');
  });
  afterAll(async () => {
    await h.close();
  });

  describe('paket & beasiswa (A-13)', () => {
    it('membuat paket bulanan dan menolak KU yang tumpang-tindih', async () => {
      const res = await owner.call('POST', `${base()}/billing/plans`, {
        name: 'Iuran Reguler',
        kind: 'monthly',
        amount: 350000,
        issueDay: 1,
        dueDays: 9,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const dup = await owner.call('POST', `${base()}/billing/plans`, {
        name: 'Iuran Lain',
        kind: 'monthly',
        amount: 300000,
      });
      expect(dup.status).toBe(422);
      const plans = await owner.call('GET', `${base()}/billing/plans`);
      expect(plans.body[0]).toMatchObject({ name: 'Iuran Reguler', playerCount: 3 });
    });

    it('beasiswa hanya oleh owner', async () => {
      const res = await owner.call('POST', `${base()}/billing/scholarships`, {
        membershipId: byName('Beasiswa Penuh'),
        pct: 100,
        reason: 'Prestasi',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const list = await owner.call('GET', `${base()}/billing/scholarships`);
      expect(list.body).toEqual([
        expect.objectContaining({ fullName: 'Beasiswa Penuh', pct: 100 }),
      ]);
    });
  });

  describe('terbit tagihan (US-11)', () => {
    it('idempoten, melewati pemain cuti, beasiswa 100% langsung dibebaskan', async () => {
      const first = await owner.call('POST', `${base()}/billing/invoices/issue`, { period });
      expect(first.body).toMatchObject({ created: 3, skippedOnLeave: 1 });
      const again = await owner.call('POST', `${base()}/billing/invoices/issue`, { period });
      expect(again.body).toMatchObject({ created: 0, skippedExisting: 3 });
      // Job paralel juga tidak menggandakan.
      const svc = h.app.get(BillingService);
      await Promise.all([svc.runIssuance(), svc.runIssuance()]);
      const list = await owner.call('GET', `${base()}/billing/invoices?period=${period}`);
      expect(list.body.invoices).toHaveLength(3);
      const free = list.body.invoices.find(
        (i: { playerName: string }) => i.playerName === 'Beasiswa Penuh',
      );
      expect(free).toMatchObject({ status: 'waived', total: 0, discount: 350000 });
      expect(list.body.summary.billed).toMatchObject({ count: 2, amount: 700000 });
      expect(list.body.invoices[0].number).toMatch(/^INV-\d{4}-\d{4}$/);
    });
  });

  describe('checkout Midtrans + webhook (O-05, US-12, US-13)', () => {
    let invoiceIds: string[];
    let checkoutId: string;
    let orderId: string;

    it('wali melihat tagihan anak-anaknya saja', async () => {
      const mine = await wali.call('GET', '/v1/me/invoices');
      expect(mine.body).toHaveLength(2);
      invoiceIds = mine.body.map((i: { id: string }) => i.id);
      expect((await otherWali.call('GET', '/v1/me/invoices')).body).toHaveLength(0);
      const steal = await otherWali.call('POST', '/v1/me/checkout', {
        invoiceIds,
        method: 'bca_va',
      });
      expect(steal.status).toBe(404);
    });

    it('quote memuat biaya layanan per metode (QRIS gratis selama ADR-016)', async () => {
      const q = await wali.call('POST', '/v1/me/checkout/quote', { invoiceIds });
      const qris = q.body.find((m: { method: string }) => m.method === 'qris');
      const va = q.body.find((m: { method: string }) => m.method === 'bca_va');
      expect(qris).toMatchObject({ base: 700000, serviceFee: 0, gross: 700000 });
      expect(va).toMatchObject({ base: 700000, serviceFee: 4000, gross: 704000 });
    });

    it('satu checkout untuk dua tagihan', async () => {
      const res = await wali.call('POST', '/v1/me/checkout', { invoiceIds, method: 'bca_va' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      ({ checkoutId, orderId } = res.body);
      expect(res.body.gross).toBe(704000);
      expect(res.body.redirectUrl).toContain(`/dev/midtrans/`);
      const st = await wali.call('GET', `/v1/me/checkout/${checkoutId}`);
      expect(st.body).toMatchObject({ status: 'pending', gross: 704000 });
    });

    it('notifikasi dengan signature salah ditolak dan tidak mengubah apa pun', async () => {
      const res = await new Client(h).call('POST', '/v1/webhooks/midtrans', {
        order_id: orderId,
        status_code: '200',
        gross_amount: '704000.00',
        transaction_status: 'settlement',
        signature_key: 'ab'.repeat(64),
      });
      expect(res.status).toBe(403);
      // Signature benar tapi status tidak cocok dengan Status API → status resmi yang dipakai.
      const forged = await new Client(h).call('POST', '/v1/webhooks/midtrans', {
        order_id: orderId,
        status_code: '200',
        gross_amount: '704000.00',
        transaction_status: 'settlement',
        signature_key: midtransSignature(
          orderId,
          '200',
          '704000.00',
          'SB-Mid-server-MOCK-sportgather',
        ),
      });
      expect(forged.status).toBe(200);
      expect((await wali.call('GET', '/v1/me/invoices')).body).toHaveLength(2);
    });

    it('settlement diproses sekali walau notifikasi datang berulang', async () => {
      const n = h.app.get(MockMidtrans).simulate(orderId, 'settlement', 'bank_transfer');
      const results = await Promise.all(
        [0, 1, 2].map(() => new Client(h).call('POST', '/v1/webhooks/midtrans', n)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      await new Client(h).call('POST', '/v1/webhooks/midtrans', n);
      const st = await wali.call('GET', `/v1/me/checkout/${checkoutId}`);
      expect(st.body.status).toBe('paid');
      expect((await wali.call('GET', '/v1/me/invoices')).body).toHaveLength(0);
      const rows = await h.db.admin.db.execute<{ n: number; total: string }>(
        sql`select count(*)::int as n, sum(amount)::text as total from ledger_entry where checkout_id = ${checkoutId}`,
      );
      const expected = checkoutBreakdown(
        invoiceIds.map((id) => ({ id, total: 350000 })),
        'bca_va',
        { platformFee: 2500, qrisSurchargeEnabled: false },
      );
      expect(Number(rows[0]!.total)).toBe(expected.clubNet);
      const payments = await h.db.admin.db.execute<{ n: number }>(
        sql`select count(*)::int as n from payment where checkout_id = ${checkoutId}`,
      );
      expect(payments[0]!.n).toBe(2);
      expect(h.outbox.messages.filter((m) => m.template === 'pembayaran_berhasil')).toHaveLength(1);
    });

    it('riwayat & kuitansi PDF untuk wali', async () => {
      const hist = await wali.call('GET', '/v1/me/payments');
      expect(hist.body).toHaveLength(2);
      const pdf = await h.app.inject({
        method: 'GET',
        url: `/v1/me/payments/${hist.body[0].paymentId}/receipt.pdf`,
        headers: { cookie: wali.cookie! },
      });
      expect(pdf.statusCode).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      const theirs = await otherWali.call(
        'GET',
        `/v1/me/payments/${hist.body[0].paymentId}/receipt.pdf`,
      );
      expect(theirs.status).toBe(404);
    });

    it('ringkasan penyaluran menelusuri tiap rupiah ke tagihan', async () => {
      const ov = await owner.call('GET', `${base()}/billing/payouts`);
      expect(ov.status).toBe(200);
      expect(ov.body.transactions).toHaveLength(1);
      const t = ov.body.transactions[0];
      expect(t.gross).toBe(704000);
      expect(t.invoices.reduce((a: number, i: { clubNet: number }) => a + i.clubNet, 0)).toBe(
        t.clubNet,
      );
      expect(ov.body.available).toBe(t.clubNet);
    });
  });

  describe('bayar manual (US-14)', () => {
    it('transfer wajib bukti; tunai tidak', async () => {
      const one = await owner.call('POST', `${base()}/billing/invoices/one-time`, {
        description: 'Jersey tandang',
        amount: 150000,
        dueDate: addDays(today, 7),
        membershipIds: [byName('Kakak Bayar')],
      });
      expect(one.status, JSON.stringify(one.body)).toBe(201);
      const list = await owner.call('GET', `${base()}/billing/invoices?status=unpaid`);
      const inv = list.body.invoices.find(
        (i: { description: string }) => i.description === 'Jersey tandang',
      );
      const noProof = await owner.call(
        'POST',
        `${base()}/billing/invoices/${inv.id}/manual-payment`,
        {
          method: 'transfer',
          paidAt: today,
        },
      );
      expect(noProof.status).toBe(400);
      const cash = await owner.call('POST', `${base()}/billing/invoices/${inv.id}/manual-payment`, {
        method: 'cash',
        paidAt: today,
        note: 'Bayar di GOR',
      });
      expect(cash.status, JSON.stringify(cash.body)).toBe(201);
      const twice = await owner.call(
        'POST',
        `${base()}/billing/invoices/${inv.id}/manual-payment`,
        {
          method: 'cash',
          paidAt: today,
        },
      );
      expect(twice.status).toBe(422);
      const manual = await owner.call('GET', `${base()}/billing/invoices?status=manual`);
      expect(manual.body.invoices).toHaveLength(1);
      // Bayar manual tidak masuk ledger (uang tidak lewat Midtrans).
      const ov = await owner.call('GET', `${base()}/billing/payouts`);
      expect(ov.body.transactions).toHaveLength(1);
    });
  });

  describe('penarikan dana (ADR-016)', () => {
    it('di bawah minimum & melebihi saldo ditolak; sukses memotong biaya transfer', async () => {
      const ov = (await owner.call('GET', `${base()}/billing/payouts`)).body;
      expect(
        (await owner.call('POST', `${base()}/billing/payouts/withdraw`, { amount: 1000 })).status,
      ).toBe(422);
      expect(
        (
          await owner.call('POST', `${base()}/billing/payouts/withdraw`, {
            amount: ov.available + 1,
          })
        ).status,
      ).toBe(422);
      const res = await owner.call('POST', `${base()}/billing/payouts/withdraw`, {
        amount: 500000,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({ status: 'completed', net: 497500 });
      const after = (await owner.call('GET', `${base()}/billing/payouts`)).body;
      expect(after.available).toBe(ov.available - 500000);
      expect(after.totalWithdrawn).toBe(500000);
    });

    it('rekening belum terverifikasi → dana ditahan', async () => {
      await h.db.admin.db.execute(sql`update bank_account set status = 'pending_verification'`);
      const res = await owner.call('POST', `${base()}/billing/payouts/withdraw`, { amount: 60000 });
      expect(res.status).toBe(422);
      expect(res.body.message).toContain('belum terverifikasi');
      await h.db.admin.db.execute(sql`update bank_account set status = 'verified'`);
    });
  });

  describe('pengingat iuran', () => {
    it('H-3 dikirim sekali per tagihan', async () => {
      const due = addDays(today, 3);
      await owner.call('POST', `${base()}/billing/invoices/one-time`, {
        description: 'Turnamen',
        amount: 100000,
        dueDate: due,
        membershipIds: [byName('Adik Bayar')],
      });
      const { PaymentsService } = await import('./payments.service.js');
      const svc = h.app.get(PaymentsService);
      const at10 = new Date(`${today}T10:00:00+07:00`);
      const a = await svc.runReminders(at10);
      const b = await svc.runReminders(at10);
      expect(a.sent).toBe(1);
      expect(b.sent).toBe(0);
      expect(h.outbox.latest('+6281322220001', 'pengingat_iuran')!.params.rincian).toContain(
        'Turnamen',
      );
    });
  });
});
