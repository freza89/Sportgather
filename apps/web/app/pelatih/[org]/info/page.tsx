import type { AnnouncementDto, CoachTeamDto } from '@sportgather/shared';
import { Card } from '@sportgather/ui';
import { AnnouncementComposer, AnnouncementHistory } from '@/components/announcements/composer';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';

// P-05 · Kirim info ke orang tua tim sendiri
export default async function InfoPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { me } = await getClubSession(org, `/pelatih/${org}/info`);
  const [teams, history] = await Promise.all([
    apiPage<CoachTeamDto[]>(`/orgs/${org}/coach/teams`),
    apiPage<AnnouncementDto[]>(`/orgs/${org}/announcements`),
  ]);
  return (
    <MobileShell
      base={`/pelatih/${org}`}
      role="pelatih"
      title="Kirim info ke orang tua"
      subtitle="Lewat WhatsApp + notifikasi aplikasi"
      userName={me.user.fullName}
    >
      <div className="flex flex-col gap-5">
        {teams.length === 0 ? (
          <Card className="p-5 type-body text-fg-secondary">Anda belum ditugaskan ke tim.</Card>
        ) : (
          <Card className="p-4">
            <AnnouncementComposer
              slug={org}
              mode="coach"
              teams={teams.map((t) => ({ id: t.id, name: t.name }))}
            />
          </Card>
        )}
        <h2 className="type-h3">Terkirim sebelumnya</h2>
        <AnnouncementHistory slug={org} items={history} compact />
      </div>
    </MobileShell>
  );
}
