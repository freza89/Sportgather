/**
 * Cek cepat kredensial Midtrans sandbox: buat transaksi Snap Rp10.000 lalu baca statusnya.
 * Jalankan: pnpm --filter api midtrans:check  (build dulu; membaca .env di root repo)
 */
import { MidtransHttpGateway } from '../dist/integrations/midtrans.js';

const key = process.env.MIDTRANS_SERVER_KEY;
if (!key || key.includes('MOCK')) {
  console.error('MIDTRANS_SERVER_KEY belum diisi di .env');
  process.exit(1);
}
if (process.env.MIDTRANS_IS_PRODUCTION === 'true') {
  console.error('Skrip ini hanya untuk sandbox (MIDTRANS_IS_PRODUCTION=false).');
  process.exit(1);
}
const gw = new MidtransHttpGateway(key, false);
const orderId = `SG-CHECK-${Date.now()}`;
const snap = await gw.createTransaction({
  orderId,
  gross: 10_000,
  enabledPayments: ['bca_va', 'other_qris'],
  items: [{ id: 'check', name: 'Cek sandbox SportGather', price: 10_000, quantity: 1 }],
  customer: { firstName: 'Tes', phone: null },
  finishUrl: `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/wali/tagihan`,
});
console.log('Snap OK  :', snap.redirectUrl);
const st = await gw.getStatus(orderId);
console.log('Status   :', st.transactionStatus, st.statusCode);
console.log('Buka URL di atas, bayar pakai simulator sandbox, lalu cek lagi status di dashboard.');
