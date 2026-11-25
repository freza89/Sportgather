import type { GuardianInvoice } from '@sportgather/shared';
import { Alert } from '@sportgather/ui';
import { MobileShell } from '@/components/shell/mobile-shell';
import { PayForm } from '@/components/wali/billing';
import { apiPage, getMe } from '@/lib/api-server';

// O-05 · Bayar iuran
export default async function BayarPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids = '' } = await searchParams;
  const me = await getMe('/wali/tagihan');
  const wanted = new Set(ids.split(',').filter(Boolean));
  const invoices = (await apiPage<GuardianInvoice[]>('/me/invoices', '/wali/tagihan')).filter((i) =>
    wanted.has(i.id),
  );
  const orgs = new Set(invoices.map((i) => i.orgSlug));
  return (
    <MobileShell
      base="/wali"
      role="wali"
      title="Bayar iuran"
      subtitle={invoices[0]?.orgName ?? 'Tagihan'}
      backHref="/wali/tagihan"
      userName={me.user.fullName}
    >
      {!invoices.length ? (
        <Alert tone="warning">Tagihan tidak ditemukan atau sudah lunas.</Alert>
      ) : orgs.size > 1 ? (
        <Alert tone="warning">Bayar tagihan dari satu klub dalam satu transaksi.</Alert>
      ) : (
        <PayForm invoices={invoices} />
      )}
    </MobileShell>
  );
}
