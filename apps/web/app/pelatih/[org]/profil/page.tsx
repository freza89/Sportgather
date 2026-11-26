import type { CoachProfileDto } from '@sportgather/shared';
import type { Metadata } from 'next';
import { CoachProfileEditor } from '@/components/coach-profile/profile-editor';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';

export const metadata: Metadata = { title: 'Profil saya' };

// M7 · Pelatih melengkapi CV & lisensinya sendiri
export default async function ProfilPelatih({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { me, club } = await getClubSession(org, `/pelatih/${org}/profil`);
  const profile = await apiPage<CoachProfileDto>(`/orgs/${org}/coach-profiles/me`);
  return (
    <MobileShell
      base={`/pelatih/${org}`}
      role="pelatih"
      title="Profil & lisensi"
      subtitle={club.name}
      backHref={`/pelatih/${org}/tim`}
      userName={me.user.fullName}
    >
      <CoachProfileEditor slug={org} staffParam="me" initial={profile} />
    </MobileShell>
  );
}
