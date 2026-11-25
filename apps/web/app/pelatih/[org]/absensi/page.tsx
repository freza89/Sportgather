import type { SessionSummary } from '@sportgather/shared';
import { Card } from '@sportgather/ui';
import { SessionRow } from '@/components/coach/session-card';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';

export default async function AbsensiList({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { me, club } = await getClubSession(org, `/pelatih/${org}/absensi`);
  const sessions = await apiPage<SessionSummary[]>(`/orgs/${org}/coach/sessions`);
  return (
    <MobileShell
      base={`/pelatih/${org}`}
      role="pelatih"
      title="Absensi"
      subtitle={club.name}
      userName={me.user.fullName}
    >
      <div className="flex flex-col gap-3">
        {sessions.length === 0 ? (
          <Card className="p-5 type-body text-fg-secondary">
            Tidak ada sesi hari ini atau besok.
          </Card>
        ) : null}
        {sessions.map((s) => (
          <SessionRow key={s.eventId} slug={org} session={s} />
        ))}
      </div>
    </MobileShell>
  );
}
