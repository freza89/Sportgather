import { MockPay } from './mock-pay';

/**
 * Pengganti halaman Snap saat PAYMENT_PROVIDER=mock. Penjaganya di API: endpoint /v1/dev/*
 * hanya ada di non-produksi dengan provider mock, jadi di produksi halaman ini hanya
 * menampilkan "tidak ditemukan".
 */
export default async function MockMidtransPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <MockPay orderId={decodeURIComponent(orderId)} />;
}
