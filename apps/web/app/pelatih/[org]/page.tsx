import {
  formatHariTanggalPanjang,
  formatTanggalIso,
  type SessionSummary,
} from '@sportgather/shared';
import { Card, IconChevron, IconStar } from '@sportgather/ui';
import Link from 'next/link';
import { NextSessionCard, SessionRow } from '@/components/coach/session-card';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';
import { nextUpcoming } from '@/lib/dates';

// P-01 · Beranda pelatih
export default async function PelatihHome({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { me, club } = await getClubSession(org, `/pelatih/${org}`);
  const [sessions, pending] = await Promise.all([
    apiPage<SessionSummary[]>(`/orgs/${org}/coach/sessions`),
    apiPage<{ pending: number; semester: number | null; closesOn: string | null }>(
      `/orgs/${org}/coach/assessments/pending`,
    ),
  ]);
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
        {pending.pending > 0 ? (
          <Link
            href={`/pelatih/${org}/penilaian`}
            className="flex items-center gap-3 rounded-card border border-line bg-surface p-4"
          >
            <IconStar size={22} className="text-brand" />
            <span className="flex flex-1 flex-col">
              <span className="type-body-medium">{pending.pending} pemain belum dinilai</span>
              <span className="type-caption text-fg-muted">
                Penilaian semester {pending.semester} sampai {formatTanggalIso(pending.closesOn)}
              </span>
            </span>
            <IconChevron size={18} />
          </Link>
        ) : null}
      </div>
    </MobileShell>
  );
}
