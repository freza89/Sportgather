import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/placeholder';
import { MobileShell } from '@/components/shell/mobile-shell';
import { getMe } from '@/lib/api-server';
import { WALI_NAV } from '@/lib/navigation';

/** Tab wali yang belum dibangun (Tagihan M4, Rapor & Profil M5). */
export default async function WaliSection({ params }: { params: Promise<{ section: string[] }> }) {
  const { section } = await params;
  const entry = WALI_NAV.find((e) => e.segment !== '' && e.segment === section[0]);
  if (!entry || section.length > 1) notFound();
  const me = await getMe(`/wali/${section[0]}`);
  return (
    <MobileShell
      base="/wali"
      role="wali"
      title={entry.label}
      subtitle="Area orang tua"
      trailing="bell"
      userName={me.user.fullName}
    >
      <Placeholder entry={entry} />
    </MobileShell>
  );
}
