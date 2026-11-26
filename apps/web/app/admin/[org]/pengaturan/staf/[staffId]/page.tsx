import type { CoachProfileDto } from '@sportgather/shared';
import { IconBack } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CoachProfileEditor } from '@/components/coach-profile/profile-editor';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';

export const metadata: Metadata = { title: 'Profil staf' };

// M7 · Profil/CV & lisensi staf (dibuka dari Pengaturan › Staf & peran)
export default async function StafProfilPage({
  params,
}: {
  params: Promise<{ org: string; staffId: string }>;
}) {
  const { org: slug, staffId } = await params;
  await getClubSession(slug, `/admin/${slug}/pengaturan/staf/${staffId}`);
  const profile = await apiPage<CoachProfileDto>(`/orgs/${slug}/coach-profiles/${staffId}`);
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/admin/${slug}/pengaturan/staf`}
          className="flex items-center gap-1 type-caption-bold text-fg-secondary hover:text-fg"
        >
          <IconBack size={16} /> Staf & peran
        </Link>
        <h1 className="type-h1">Profil & lisensi</h1>
        <p className="type-body text-fg-secondary">
          CV pelatih, riwayat pengalaman, dan lisensi. Wali hanya melihat ringkasan pelatih tim
          anaknya dengan lisensi yang sudah terverifikasi.
        </p>
      </div>
      <CoachProfileEditor slug={slug} staffParam={staffId} initial={profile} />
    </div>
  );
}
