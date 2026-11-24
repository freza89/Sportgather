import { BranchesCard } from '@/components/settings/branches-card';
import { SettingsHeader } from '@/components/settings/settings-header';
import { loadSettings } from '@/lib/settings-data';

export default async function LokasiPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const s = await loadSettings(slug);
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        base={`/admin/${slug}`}
        title="Lokasi latihan"
        subtitle={`${s.branches.length} lokasi · zona waktu dipakai untuk jadwal & pengingat`}
      />
      <div className="max-w-3xl">
        <BranchesCard slug={slug} branches={s.branches} canEdit={s.canEdit} />
      </div>
    </div>
  );
}
