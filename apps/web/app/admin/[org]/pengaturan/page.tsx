import type { Metadata } from 'next';
import { BankCard } from '@/components/settings/bank-card';
import { BranchesCard } from '@/components/settings/branches-card';
import { PlanCard } from '@/components/settings/plan-card';
import { ProfileForm } from '@/components/settings/profile-form';
import { SettingsHeader } from '@/components/settings/settings-header';
import { loadSettings } from '@/lib/settings-data';

export const metadata: Metadata = { title: 'Pengaturan klub' };

// A-02 · Pengaturan klub
export default async function PengaturanPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const s = await loadSettings(slug);
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        base={`/admin/${slug}`}
        title="Pengaturan klub"
        subtitle="Profil, lokasi, rekening, dan langganan"
      />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <ProfileForm org={s.org} canEdit={s.canEdit} />
          <BranchesCard slug={slug} branches={s.branches} canEdit={s.canEdit} />
        </div>
        <div className="flex flex-col gap-6">
          <BankCard
            slug={slug}
            account={s.bank}
            canEdit={s.canEditFinance}
            defaultHolder={s.org.name}
          />
          <PlanCard plan={s.org.plan} activePlayers={0} />
        </div>
      </div>
    </div>
  );
}
