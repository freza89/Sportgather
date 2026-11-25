import type { DataRequestDto } from '@sportgather/shared';
import type { Metadata } from 'next';
import { DataRequests } from '@/components/settings/data-requests';
import { SettingsHeader } from '@/components/settings/settings-header';
import { apiPage } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Data & privasi' };

// Permintaan hapus data dari wali (O-08), diproses admin klub.
export default async function DataPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const items = await apiPage<DataRequestDto[]>(
    `/orgs/${slug}/data-requests`,
    `/admin/${slug}/pengaturan/data`,
  );
  const pending = items.filter((i) => i.status === 'pending').length;
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        base={`/admin/${slug}`}
        title="Data & privasi"
        subtitle={
          pending ? `${pending} permintaan hapus data menunggu` : 'Permintaan hapus data dari wali'
        }
      />
      <DataRequests slug={slug} items={items} />
    </div>
  );
}
