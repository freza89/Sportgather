import type { StaffDto } from '@sportgather/shared';
import type { Metadata } from 'next';
import { RoleInfo } from '@/components/settings/role-info';
import { SettingsHeader } from '@/components/settings/settings-header';
import { StaffManager } from '@/components/settings/staff-manager';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';

export const metadata: Metadata = { title: 'Staf & peran' };

// A-03 · Staf & peran
export default async function StafPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { me, role } = await getClubSession(slug, `/admin/${slug}/pengaturan/staf`);
  const staff = await apiPage<StaffDto[]>(`/orgs/${slug}/staff`);
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        base={`/admin/${slug}`}
        title="Staf & peran"
        subtitle={`${staff.length} staf · undangan dikirim lewat WhatsApp`}
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <StaffManager slug={slug} staff={staff} actorRole={role} actorPersonId={me.user.personId} />
        <RoleInfo />
      </div>
    </div>
  );
}
