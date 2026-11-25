import {
  formatHariTanggal,
  formatTimeRange,
  type SessionSummary,
  type ZonaWaktu,
} from '@sportgather/shared';
import { Badge, Card, IconClock, IconPin, buttonVariants } from '@sportgather/ui';
import Link from 'next/link';

export function sessionTime(s: { startsAt: string; endsAt: string; timezone: string }) {
  const zone = s.timezone as ZonaWaktu;
  return `${formatHariTanggal(new Date(s.startsAt), zone)} · ${formatTimeRange(new Date(s.startsAt), new Date(s.endsAt), zone)}`;
}

/** Kartu "Sesi berikutnya" (P-01). */
export function NextSessionCard({ slug, session }: { slug: string; session: SessionSummary }) {
  const counts = [
    { n: session.rsvp.hadir, label: 'Hadir' },
    { n: session.rsvp.izin + session.rsvp.sakit, label: 'Izin/sakit' },
    { n: session.rsvp.belum, label: 'Belum RSVP' },
  ];
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <Badge tone="brand">Sesi berikutnya</Badge>
        {session.attendanceRecorded ? (
          <Badge tone="success">Diabsen {session.attendanceRecorded}</Badge>
        ) : null}
      </div>
      <h2 className="type-h2">{session.teamName}</h2>
      <p className="flex items-center gap-2 type-body-sm text-fg-secondary">
        <IconClock size={16} /> {sessionTime(session)}
      </p>
      {session.location ? (
        <p className="flex items-center gap-2 type-body-sm text-fg-secondary">
          <IconPin size={16} /> {session.location}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-2 rounded-control bg-canvas p-3 text-center">
        {counts.map((c) => (
          <div key={c.label}>
            <p className="type-h2">{c.n}</p>
            <p className="type-caption text-fg-muted">{c.label}</p>
          </div>
        ))}
      </div>
      <Link
        href={`/pelatih/${slug}/absensi/${session.eventId}`}
        className={buttonVariants({ block: true })}
      >
        Mulai absensi
      </Link>
    </Card>
  );
}

export function SessionRow({ slug, session }: { slug: string; session: SessionSummary }) {
  return (
    <Link href={`/pelatih/${slug}/absensi/${session.eventId}`}>
      <Card className="flex flex-col gap-1 p-4 hover:border-brand">
        <div className="flex items-center justify-between">
          <span className="type-caption-bold text-fg-secondary">{sessionTime(session)}</span>
          {session.status === 'cancelled' ? (
            <Badge tone="danger">Dibatalkan</Badge>
          ) : session.attendanceRecorded ? (
            <Badge tone="success">
              Diabsen {session.attendanceRecorded}/{session.playerCount}
            </Badge>
          ) : (
            <Badge tone="neutral">Belum diabsen</Badge>
          )}
        </div>
        <p className="type-body-medium">
          {session.teamName}
          {session.title ? ` · ${session.title}` : ''}
        </p>
        {session.location ? (
          <p className="flex items-center gap-2 type-caption text-fg-muted">
            <IconPin size={14} /> {session.location}
          </p>
        ) : null}
      </Card>
    </Link>
  );
}
