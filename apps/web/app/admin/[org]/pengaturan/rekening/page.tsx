import { BankCard } from '@/components/settings/bank-card';
import { SettingsHeader } from '@/components/settings/settings-header';
import { loadSettings } from '@/lib/settings-data';

export default async function RekeningPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const s = await loadSettings(slug);
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        base={`/admin/${slug}`}
        title="Rekening penerimaan"
        subtitle="Tujuan penyaluran iuran yang dibayar online"
      />
      <div className="max-w-3xl">
        <BankCard
          slug={slug}
          account={s.bank}
          canEdit={s.canEditFinance}
          defaultHolder={s.org.name}
        />
      </div>
    </div>
  );
}
