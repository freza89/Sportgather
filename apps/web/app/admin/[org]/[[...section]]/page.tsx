import type { DashboardDto } from '@sportgather/shared';
import { notFound } from 'next/navigation';
import { OwnerDashboard } from '@/components/dashboard/owner-dashboard';
import { Placeholder } from '@/components/placeholder';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';
import { ADMIN_NAV } from '@/lib/navigation';

// Beranda admin = A-17 (dashboard owner). Segmen lain yang belum punya halaman → placeholder.
export default async function AdminSection({
  params,
}: {
  params: Promise<{ org: string; section?: string[] }>;
}) {
  const { org, section = [] } = await params;
  const entry = ADMIN_NAV.find((e) => e.segment === (section[0] ?? ''));
  if (!entry || section.length > 1) notFound();

  if (entry.segment === '') {
    const { me, club } = await getClubSession(org, `/admin/${org}`);
    const d = await apiPage<DashboardDto>(`/orgs/${org}/dashboard`, `/admin/${org}`);
    return (
      <OwnerDashboard
        slug={org}
        firstName={me.user.fullName.split(' ')[0]!}
        clubName={club.name}
        d={d}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-h1">{entry.label}</h1>
      </div>
      <Placeholder entry={entry} />
    </div>
  );
}
