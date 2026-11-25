import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/shell/admin-shell';
import { getClubSession } from '@/lib/club';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { me, club, role, roleLabel } = await getClubSession(org, `/admin/${org}`);
  // Pelatih & team manager memakai tampilan mobile.
  if (role === 'coach' || role === 'team_manager') redirect(`/pelatih/${org}`);

  return (
    <AdminShell
      base={`/admin/${org}`}
      clubName={club.name}
      seasonName="Belum ada musim aktif"
      userName={me.user.fullName}
      roleLabel={roleLabel}
      hasOtherClubs={me.clubs.length > 1}
    >
      {children}
    </AdminShell>
  );
}
