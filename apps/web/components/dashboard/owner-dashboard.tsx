import { formatRupiah, formatRupiahRingkas, kuLabel, type DashboardDto } from '@sportgather/shared';
import {
  Badge,
  Card,
  IconClipboard,
  IconShield,
  IconTransfer,
  IconUsers,
  IconWallet,
  StatCard,
  buttonVariants,
  type BadgeTone,
  type IconProps,
} from '@sportgather/ui';
import Link from 'next/link';
import type { ComponentType } from 'react';

const ACTION: Record<
  DashboardDto['actions'][number]['kind'],
  { icon: ComponentType<IconProps>; tone: BadgeTone; cta: string }
> = {
  documents: { icon: IconShield, tone: 'warning', cta: 'Tinjau' },
  overdue: { icon: IconWallet, tone: 'danger', cta: 'Lihat' },
  attendance: { icon: IconClipboard, tone: 'info', cta: 'Cek' },
  payout: { icon: IconTransfer, tone: 'success', cta: 'Detail' },
  data_requests: { icon: IconUsers, tone: 'warning', cta: 'Proses' },
};

const STATUS: Record<DashboardDto['today'][number]['status'], { tone: BadgeTone; label: string }> =
  {
    upcoming: { tone: 'neutral', label: 'Belum mulai' },
    running: { tone: 'info', label: 'Berjalan' },
    done: { tone: 'success', label: 'Selesai' },
    cancelled: { tone: 'danger', label: 'Dibatalkan' },
  };

function greeting(d: Date) {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(d),
  );
  return h < 11
    ? 'Selamat pagi'
    : h < 15
      ? 'Selamat siang'
      : h < 19
        ? 'Selamat sore'
        : 'Selamat malam';
}

/** Batang tunggal per KU (satu seri → satu warna, label nilai langsung, tooltip per batang). */
function KuBars({ data }: { data: DashboardDto['playersPerKu'] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <figure className="flex flex-col gap-3">
      <div
        className="flex h-56 items-end gap-3 border-b border-line px-2"
        role="img"
        aria-label={`Pemain aktif per KU: ${data.map((d) => `${d.ku === null ? 'tanpa KU' : kuLabel(d.ku)} ${d.count}`).join(', ')}`}
      >
        {data.map((d) => (
          <div
            key={String(d.ku)}
            className="group relative flex h-full flex-1 flex-col items-center justify-end"
            title={`${d.ku === null ? 'Tanpa KU' : kuLabel(d.ku)}: ${d.count} pemain`}
          >
            <span className="mb-1 type-caption-bold text-fg-secondary">{d.count}</span>
            <div
              className="w-full max-w-14 rounded-t-[4px] bg-navy-700 transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max(d.count ? 4 : 0, (d.count / max) * 85)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 px-2">
        {data.map((d) => (
          <span key={String(d.ku)} className="flex-1 text-center type-caption text-fg-muted">
            {d.ku === null ? 'Tanpa KU' : kuLabel(d.ku)}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        <table>
          <tbody>
            {data.map((d) => (
              <tr key={String(d.ku)}>
                <th>{d.ku === null ? 'Tanpa KU' : kuLabel(d.ku)}</th>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

// A-17 · Dashboard owner
export function OwnerDashboard({
  slug,
  firstName,
  clubName,
  d,
}: {
  slug: string;
  firstName: string;
  clubName: string;
  d: DashboardDto;
}) {
  const base = `/admin/${slug}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">
            {greeting(new Date(d.generatedAt))}, {firstName}
          </h1>
          <p className="type-body text-fg-secondary">
            Ringkasan {clubName} · {d.period.label}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`${base}/laporan`} className={buttonVariants({ variant: 'secondary' })}>
            Unduh laporan
          </Link>
          <Link href={`${base}/pengumuman`} className={buttonVariants()}>
            Buat pengumuman
          </Link>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pemain aktif"
          value={String(d.activePlayers.total)}
          note={`+${d.activePlayers.newThisMonth} pemain bulan ini`}
          noteTone={d.activePlayers.newThisMonth ? 'success' : 'muted'}
        />
        <StatCard
          label="Kehadiran bulan ini"
          value={d.attendance30d.pct === null ? '–' : `${d.attendance30d.pct}%`}
          note={`Target ≥${d.attendance30d.target}%`}
          noteTone={
            d.attendance30d.pct !== null && d.attendance30d.pct >= d.attendance30d.target
              ? 'success'
              : 'danger'
          }
        />
        <StatCard
          label={`Iuran ${d.billing.period} terbayar`}
          value={`${d.billing.pct}%`}
          note={`${formatRupiahRingkas(d.billing.paid)} dari ${formatRupiahRingkas(d.billing.billed)}`}
        />
        <StatCard
          label="Tagihan terlambat"
          value={String(d.overdue.count)}
          note={
            d.overdue.count
              ? `${formatRupiahRingkas(d.overdue.amount)} · perlu tindak lanjut`
              : 'Tidak ada'
          }
          noteTone={d.overdue.count ? 'danger' : 'muted'}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="type-h3">Pemain aktif per KU</h2>
            <Badge tone="brand">Acuan: {d.kuReference}</Badge>
          </div>
          <KuBars data={d.playersPerKu} />
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="type-h3">Perlu tindakan</h2>
          {d.actions.length === 0 ? (
            <p className="type-body text-fg-secondary">
              Semua beres. Tidak ada yang perlu ditindaklanjuti.
            </p>
          ) : (
            d.actions.map((a) => {
              const meta = ACTION[a.kind];
              const Icon = meta.icon;
              return (
                <Link
                  key={a.kind}
                  href={a.href}
                  className="flex items-center gap-3 rounded-input bg-canvas p-3 hover:bg-line/40"
                >
                  <span className="rounded-input bg-surface p-2 text-fg-secondary">
                    <Icon size={18} />
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="type-body-medium">
                      {a.kind === 'payout' && a.amount
                        ? `${a.text} ${formatRupiah(a.amount)}`
                        : a.text}
                    </span>
                    <span className="type-caption text-fg-muted">{a.sub}</span>
                  </span>
                  <Badge tone={meta.tone}>{meta.cta}</Badge>
                </Link>
              );
            })
          )}
        </Card>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="type-h2">Sesi hari ini</h2>
        <Card className="overflow-x-auto">
          {d.today.length === 0 ? (
            <p className="p-6 type-body text-fg-secondary">Tidak ada sesi hari ini.</p>
          ) : (
            <table className="w-full min-w-[860px] text-left">
              <thead className="border-b border-line bg-canvas">
                <tr className="type-caption-bold text-fg-secondary">
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Tim</th>
                  <th className="px-4 py-3">Pelatih</th>
                  <th className="px-4 py-3">Lokasi</th>
                  <th className="px-4 py-3">RSVP</th>
                  <th className="px-4 py-3">Absensi</th>
                </tr>
              </thead>
              <tbody>
                {d.today.map((e) => {
                  const st =
                    e.attendanceTaken && e.status !== 'cancelled'
                      ? { tone: 'success' as const, label: 'Sudah diabsen' }
                      : STATUS[e.status];
                  return (
                    <tr key={e.eventId} className="border-b border-line last:border-0 type-body">
                      <td className="px-4 py-3 tabular-nums">{e.time}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span>{e.teamName}</span>
                          <span className="type-caption text-fg-muted">{e.playerCount} pemain</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{e.coaches.join(', ') || '—'}</td>
                      <td className="px-4 py-3">{e.location ?? '—'}</td>
                      <td className="px-4 py-3">
                        {e.rsvp.hadir} hadir{e.rsvp.izin ? ` · ${e.rsvp.izin} izin` : ''}
                        {e.rsvp.sakit ? ` · ${e.rsvp.sakit} sakit` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </section>
      <p className="type-caption text-fg-muted">
        Angka dihitung langsung dari data terbaru dan sama dengan ringkasan di laporan ekspor untuk
        periode {d.period.label}.
      </p>
    </div>
  );
}
