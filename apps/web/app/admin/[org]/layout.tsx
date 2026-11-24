import type { ReactNode } from 'react';
import { AdminShell } from '@/components/shell/admin-shell';
import { DEMO } from '@/lib/demo';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  return (
    <AdminShell
      base={`/admin/${org}`}
      clubName={DEMO.clubName}
      seasonName={DEMO.seasonName}
      userName={DEMO.adminName}
      roleLabel="Owner"
    >
      {children}
    </AdminShell>
  );
}
