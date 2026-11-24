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
  if (!entry || section.length > 1) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-h1">{entry.label}</h1>
      </div>
      <Placeholder entry={entry} />
    </div>
  );
}
