import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/placeholder';
import { MobileShell } from '@/components/shell/mobile-shell';
import { DEMO } from '@/lib/demo';
import { WALI_NAV } from '@/lib/navigation';

export default async function WaliSection({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section = [] } = await params;
  const entry = WALI_NAV.find((e) => e.segment === (section[0] ?? ''));
  if (!entry) notFound();
  const home = entry.segment === '';

  return (
    <MobileShell
      base="/wali"
      role="wali"
      title={home ? `Halo, ${DEMO.guardianName}` : entry.label}
      subtitle={DEMO.clubName}
      trailing="bell"
      userName={DEMO.guardianName}
    >
      <Placeholder entry={entry} />
    </MobileShell>
  );
}
