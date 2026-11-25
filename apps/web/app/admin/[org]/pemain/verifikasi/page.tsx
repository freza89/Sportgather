import type { RegistrationQueueItem, TeamSummary } from '@sportgather/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RegistrationLink } from '@/components/players/registration-link';
import { VerificationQueue } from '@/components/players/verification-queue';
import { apiPage } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Verifikasi pendaftar' };

// A-08 · Antrean verifikasi
export default async function VerifikasiPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [items, teams] = await Promise.all([
    apiPage<RegistrationQueueItem[]>(
      `/orgs/${slug}/registrations`,
      `/admin/${slug}/pemain/verifikasi`,
    ),
    apiPage<{ teams: TeamSummary[] }>(`/orgs/${slug}/teams`),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-h1">Verifikasi pendaftar</h1>
        <p className="type-body text-fg-secondary">
          <Link href={`/admin/${slug}/pemain`} className="hover:text-fg">
            Pemain
          </Link>{' '}
          › {items.length} pendaftar baru menunggu verifikasi dokumen usia
        </p>
      </div>
      <RegistrationLink slug={slug} />
      <VerificationQueue
        key={items.map((i) => i.membershipId).join()}
        slug={slug}
        items={items}
        teams={teams.teams}
      />
    </div>
  );
}
