import type { GuardianProfile } from '@sportgather/shared';
import { MobileShell } from '@/components/shell/mobile-shell';
import { ProfileView } from '@/components/wali/profile-view';
import { apiPage, getMe } from '@/lib/api-server';

// O-08 · Profil & data anak
export default async function ProfilPage() {
  const me = await getMe('/wali/profil');
  const profile = await apiPage<GuardianProfile>('/me/profile');
  return (
    <MobileShell base="/wali" role="wali" title="Profil" userName={me.user.fullName}>
      <ProfileView profile={profile} />
    </MobileShell>
  );
}
