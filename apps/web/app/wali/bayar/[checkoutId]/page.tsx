import { MobileShell } from '@/components/shell/mobile-shell';
import { CheckoutResultView } from '@/components/wali/billing';
import { getMe } from '@/lib/api-server';

// Halaman kembali dari Midtrans (finish URL Snap)
export default async function CheckoutResultPage({
  params,
}: {
  params: Promise<{ checkoutId: string }>;
}) {
  const { checkoutId } = await params;
  const me = await getMe(`/wali/bayar/${checkoutId}`);
  return (
    <MobileShell
      base="/wali"
      role="wali"
      title="Status pembayaran"
      backHref="/wali/tagihan"
      userName={me.user.fullName}
    >
      <CheckoutResultView checkoutId={checkoutId} />
    </MobileShell>
  );
}
