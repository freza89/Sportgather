import type { ChildSummary } from '@sportgather/shared';
import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/placeholder';
import { MobileShell } from '@/components/shell/mobile-shell';
import { ChildrenList } from '@/components/wali/children-list';
import { apiPage, getMe } from '@/lib/api-server';
import { WALI_NAV } from '@/lib/navigation';

export default async function WaliSection({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section = [] } = await params;
  const entry = WALI_NAV.find((e) => e.segment === (section[0] ?? ''));
  if (!entry || section.length > 1) notFound();
  const me = await getMe('/wali');
  const home = entry.segment === '';
  const children = home ? await apiPage<ChildSummary[]>('/me/children', '/wali') : [];

  return (
    <MobileShell
      base="/wali"
      role="wali"
      title={home ? `Halo, ${me.user.fullName}` : entry.label}
      subtitle="Area orang tua"
      trailing="bell"
      userName={me.user.fullName}
    >
      {home ? <ChildrenList items={children} /> : <Placeholder entry={entry} />}
    </MobileShell>
  );
}
