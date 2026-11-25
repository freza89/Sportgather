import { formatScore, formatTanggalIso, kuLabel, type ReportCardDto } from '@sportgather/shared';
import { Avatar, Card, buttonVariants } from '@sportgather/ui';
import Link from 'next/link';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage, getMe } from '@/lib/api-server';

// O-07 · Rapor anak (terbit setelah admin mempublikasikan semester)
export default async function RaporPage({
  searchParams,
}: {
  searchParams: Promise<{ anak?: string }>;
}) {
  const { anak } = await searchParams;
  const me = await getMe('/wali/rapor');
  const cards = await apiPage<ReportCardDto[]>('/me/report-cards');
  const card = cards.find((c) => c.membershipId === anak) ?? cards[0];
  return (
    <MobileShell
      base="/wali"
      role="wali"
      title="Rapor"
      subtitle={card ? `Semester ${card.semester} · ${card.season.name}` : 'Perkembangan anak'}
      trailing="bell"
      userName={me.user.fullName}
    >
      {!card ? (
        <Card className="p-5 type-body text-fg-secondary">
          Rapor belum terbit. Klub akan mengabari lewat WhatsApp saat rapor semester dipublikasikan.
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {cards.map((c) => (
                <Link
                  key={c.membershipId}
                  href={`/wali/rapor?anak=${c.membershipId}`}
                  className={
                    c.membershipId === card.membershipId
                      ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
                      : 'rounded-full border border-line bg-surface px-3 py-[6px] type-caption-bold'
                  }
                >
                  {c.childName.split(' ')[0]}
                  {c.ku ? ` · ${kuLabel(c.ku)}` : ''}
                </Link>
              ))}
            </div>
          ) : (
            <span className="type-caption text-fg-muted">
              {card.childName} · {card.teamName ?? card.orgName}
            </span>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Card className="flex flex-col gap-1 p-4">
              <span className="type-caption-bold text-fg-secondary">Kehadiran</span>
              <span className="type-stat">
                {card.attendance.pct === null ? '–' : `${card.attendance.pct}%`}
              </span>
              <span className="type-caption text-fg-muted">
                {card.attendance.attended} dari {card.attendance.total} sesi
              </span>
            </Card>
            <Card className="flex flex-col gap-1 p-4">
              <span className="type-caption-bold text-fg-secondary">Skor skill</span>
              <span className="type-stat">
                {card.average === null ? '–' : `${formatScore(card.average)}/5`}
              </span>
              <span
                className={`type-caption ${card.previousAverage !== null && card.average !== null && card.average >= card.previousAverage ? 'text-success' : 'text-fg-muted'}`}
              >
                {card.previousAverage === null
                  ? 'rata-rata semua skill'
                  : `${card.average !== null && card.average >= card.previousAverage ? 'naik' : 'turun'} dari ${formatScore(card.previousAverage)}`}
              </span>
            </Card>
          </div>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="type-h3">Penilaian skill</h2>
            {card.skills.map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="w-32 shrink-0 type-body text-fg-secondary">{s.name}</span>
                <div
                  className="flex flex-1 gap-1.5"
                  role="img"
                  aria-label={`${s.name} ${s.score ?? 0} dari 5`}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={`h-2 flex-1 rounded-full ${s.score !== null && n <= s.score ? 'bg-brand' : 'bg-line'}`}
                    />
                  ))}
                </div>
                <span className="w-8 text-right type-caption-bold">{s.score ?? '–'}/5</span>
              </div>
            ))}
            {!card.skills.length ? (
              <span className="type-caption text-fg-muted">Belum ada penilaian skill.</span>
            ) : null}
          </Card>
          {card.note ? (
            <Card className="flex flex-col gap-2 border-brand-tint bg-brand-tint p-5">
              <span className="flex items-center gap-2 type-body-medium">
                <Avatar name={card.note.coachName ?? 'Pelatih'} size={28} />
                Catatan {card.note.coachName ?? 'pelatih'}
              </span>
              <p className="type-body">{card.note.text}</p>
            </Card>
          ) : null}
          <a
            href={`/api/me/report-cards/${card.membershipId}/pdf`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'secondary', block: true })}
          >
            Unduh rapor (PDF)
          </a>
          <span className="text-center type-caption text-fg-muted">
            Terbit {formatTanggalIso(card.publishedAt.slice(0, 10))}
          </span>
        </div>
      )}
    </MobileShell>
  );
}
