import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/placeholder';
import { MobileShell } from '@/components/shell/mobile-shell';
import { getClubSession } from '@/lib/club';
import { PELATIH_NAV } from '@/lib/navigation';

/** Tab pelatih yang belum dibangun (Penilaian, Info — M5). */
export default async function PelatihSection({
  params,
}: {
  params: Promise<{ org: string; section: string[] }>;
}) {
  const { org, section } = await params;
  const entry = PELATIH_NAV.find((e) => e.segment !== '' && e.segment === section[0]);
  if (!entry || section.length > 1) notFound();
  const { me, club } = await getClubSession(org, `/pelatih/${org}`);
  return (
    <MobileShell
      base={`/pelatih/${org}`}
      role="pelatih"
      title={entry.label}
      subtitle={club.name}
      userName={me.user.fullName}
    >
      <Placeholder entry={entry} />
    </MobileShell>
  );
}
