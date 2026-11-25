import type { GuardianInvoice, GuardianPayment } from '@sportgather/shared';
import Link from 'next/link';
import { MobileShell } from '@/components/shell/mobile-shell';
import { InvoicePicker, PaymentHistory } from '@/components/wali/billing';
import { apiPage, getMe } from '@/lib/api-server';

// O-05 (daftar tagihan aktif) & O-06 · Riwayat & kuitansi
export default async function WaliTagihan({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const me = await getMe('/wali/tagihan');
  const [invoices, payments] = await Promise.all([
    apiPage<GuardianInvoice[]>('/me/invoices', '/wali/tagihan'),
    apiPage<GuardianPayment[]>('/me/payments'),
  ]);
  const history = tab === 'riwayat';
  const seg = (active: boolean) =>
    active
      ? 'flex-1 rounded-full bg-navy-900 py-2 text-center type-caption-bold text-fg-inverse'
      : 'flex-1 rounded-full py-2 text-center type-caption-bold text-fg-secondary';
  return (
    <MobileShell
      base="/wali"
      role="wali"
      title="Tagihan"
      subtitle={history ? 'Riwayat pembayaran' : 'Tagihan aktif'}
      trailing="bell"
      userName={me.user.fullName}
    >
      <div className="flex flex-col gap-4">
        <nav className="flex rounded-full border border-line bg-surface p-1" aria-label="Tagihan">
          <Link
            href="/wali/tagihan"
            className={seg(!history)}
            aria-current={!history ? 'page' : undefined}
          >
            Aktif ({invoices.length})
          </Link>
          <Link
            href="/wali/tagihan?tab=riwayat"
            className={seg(history)}
            aria-current={history ? 'page' : undefined}
          >
            Riwayat
          </Link>
        </nav>
        {history ? <PaymentHistory items={payments} /> : <InvoicePicker items={invoices} />}
      </div>
    </MobileShell>
  );
}
