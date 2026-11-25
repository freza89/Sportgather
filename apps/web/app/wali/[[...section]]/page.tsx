import { Card } from '@sportgather/ui';
import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/placeholder';
import { MobileShell } from '@/components/shell/mobile-shell';
import { getMe } from '@/lib/api-server';
import { WALI_NAV } from '@/lib/navigation';

export default async function WaliSection({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section = [] } = await params;
  const entry = WALI_NAV.find((e) => e.segment === (section[0] ?? ''));
  if (!entry || section.length > 1) notFound();
  const me = await getMe('/wali');
  const home = entry.segment === '';

  return (
    <MobileShell
      base="/wali"
      role="wali"
      title={home ? `Halo, ${me.user.fullName}` : entry.label}
      subtitle="Area orang tua"
      trailing="bell"
      userName={me.user.fullName}
    >
      {home ? (
        <Card className="mb-4 p-5 type-body text-fg-secondary">
          Belum ada anak yang terdaftar. Pendaftaran anak lewat link dari klub tersedia di milestone
          M2.
        </Card>
      ) : null}
      <Placeholder entry={entry} />
    </MobileShell>
  );
}
