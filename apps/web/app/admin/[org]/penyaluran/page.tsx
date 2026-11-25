import { type PayoutOverview } from '@sportgather/shared';
import type { Metadata } from 'next';
import { PayoutView } from '@/components/billing/payout-view';
import { apiPage, getMe } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Penyaluran dana' };

// A-15 · Penyaluran dana (ADR-016: penarikan manual oleh owner lewat Iris)
export default async function PenyaluranPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const base = `/admin/${slug}/penyaluran`;
  const me = await getMe(base);
  const role = me.clubs.find((c) => c.slug === slug)?.role;
  const data = await apiPage<PayoutOverview>(`/orgs/${slug}/billing/payouts`, base);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-h1">Penyaluran dana</h1>
        <p className="type-body text-fg-secondary">
          Dana iuran yang dibayar online, setelah biaya Midtrans dan fee platform
        </p>
      </div>
      <PayoutView slug={slug} data={data} isOwner={role === 'owner'} />
    </div>
  );
}
