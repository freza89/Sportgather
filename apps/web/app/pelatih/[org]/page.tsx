import { formatHariTanggalPanjang, type SessionSummary } from '@sportgather/shared';
import { Card } from '@sportgather/ui';
import { NextSessionCard, SessionRow } from '@/components/coach/session-card';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';
import { nextUpcoming } from '@/lib/dates';

// P-01 · Beranda pelatih
export default async function PelatihHome({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { me, club } = await getClubSession(org, `/pelatih/${org}`);
  const sessions = await apiPage<SessionSummary[]>(`/orgs/${org}/coach/sessions`);
  const next = nextUpcoming(sessions);
  return (
    <MobileShell
      base={`/pelatih/${org}`}
      role="pelatih"
      title={`Halo, ${me.user.fullName}`}
      subtitle={`${formatHariTanggalPanjang(new Date())} · ${club.name}`}
      userName={me.user.fullName}
    >
      <div className="flex flex-col gap-4">
        {next ? (
          <NextSessionCard slug={org} session={next} />
        ) : (
          <Card className="p-5 type-body text-fg-secondary">
            Tidak ada sesi hari ini atau besok.
          </Card>
        )}
        {sessions.length > 1 ? (
          <>
            <h2 className="type-h3">Jadwal hari ini & besok</h2>
            {sessions
              .filter((s) => s !== next)
              .map((s) => (
                <SessionRow key={s.eventId} slug={org} session={s} />
              ))}
          </>
        ) : null}
      </div>
    </MobileShell>
  );
}
