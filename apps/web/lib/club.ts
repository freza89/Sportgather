import 'server-only';
import { ROLE_LABEL, type MeResponse, type StaffRole } from '@sportgather/shared';
import { notFound } from 'next/navigation';
import { getMe } from './api-server';

export type ClubSession = {
  me: MeResponse;
  club: MeResponse['clubs'][number];
  role: StaffRole;
  roleLabel: string;
};

/** Klub aktif dari slug URL; 404 bila bukan staf aktif di klub tsb. */
export async function getClubSession(slug: string, nextPath: string): Promise<ClubSession> {
  const me = await getMe(nextPath);
  const club = me.clubs.find((c) => c.slug === slug && c.status === 'active');
  if (!club) notFound();
  const role = club.role as StaffRole;
  return { me, club, role, roleLabel: ROLE_LABEL[role] };
}
