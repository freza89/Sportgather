import type { AnnouncementDto, BranchDto, TeamSummary } from '@sportgather/shared';
import { Card } from '@sportgather/ui';
import type { Metadata } from 'next';
import { AnnouncementComposer, AnnouncementHistory } from '@/components/announcements/composer';
import { apiPage } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Pengumuman' };

// A-16 · Pengumuman
export default async function PengumumanPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const base = `/admin/${slug}/pengumuman`;
  const [history, teams, branches] = await Promise.all([
    apiPage<AnnouncementDto[]>(`/orgs/${slug}/announcements`, base),
    apiPage<{ teams: TeamSummary[] }>(`/orgs/${slug}/teams`),
    apiPage<BranchDto[]>(`/orgs/${slug}/branches`),
  ]);
  const kus = [...new Set(teams.teams.map((t) => t.ku))].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-h1">Pengumuman</h1>
        <p className="type-body text-fg-secondary">
          Kirim info ke orang tua lewat WhatsApp dan notifikasi aplikasi
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_440px]">
        <Card className="p-6">
          <h2 className="mb-4 type-h2">Buat pengumuman</h2>
          <AnnouncementComposer
            slug={slug}
            mode="admin"
            teams={teams.teams.map((t) => ({ id: t.id, name: t.name }))}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
            kus={kus}
          />
        </Card>
        <section className="flex flex-col gap-3">
          <h2 className="type-h2">Riwayat</h2>
          <AnnouncementHistory slug={slug} items={history} />
        </section>
      </div>
    </div>
  );
}
