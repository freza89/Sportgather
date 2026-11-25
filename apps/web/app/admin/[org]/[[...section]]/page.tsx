import { Button } from '@sportgather/ui';
import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/placeholder';
import { ADMIN_NAV } from '@/lib/navigation';

export default async function AdminSection({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = [] } = await params;
  const entry = ADMIN_NAV.find((e) => e.segment === (section[0] ?? ''));
  if (!entry) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">{entry.label}</h1>
          <p className="type-body text-fg-secondary">Klub Demo · kerangka M0</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary">Unduh laporan</Button>
          <Button>Buat pengumuman</Button>
        </div>
      </div>
      <Placeholder entry={entry} />
    </div>
  );
}
