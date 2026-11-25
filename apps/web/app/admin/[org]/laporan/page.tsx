import {
  formatRupiah,
  formatTanggalIso,
  type ReportStatus,
  type RevenueReport,
} from '@sportgather/shared';
import {
  Badge,
  Card,
  IconChart,
  IconClipboard,
  IconTransfer,
  IconWallet,
  type IconProps,
} from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { PublishReportButton } from '@/components/reports/publish-report';
import { apiPage, apiServer } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Laporan & ekspor' };

const PRESETS = [
  ['month', 'Bulan ini'],
  ['3months', '3 bulan'],
  ['season', 'Musim berjalan'],
  ['custom', 'Pilih tanggal'],
] as const;

const REPORTS: { kind: string; title: string; text: string; icon: ComponentType<IconProps> }[] = [
  {
    kind: 'receivables',
    title: 'Piutang iuran',
    text: 'Tagihan belum lunas per pemain & lama keterlambatan',
    icon: IconWallet,
  },
  {
    kind: 'revenue',
    title: 'Pendapatan per KU',
    text: 'Iuran terbayar per KU dan per bulan',
    icon: IconChart,
  },
  {
    kind: 'attendance',
    title: 'Kehadiran',
    text: 'Rekap hadir/izin/sakit/alpa per tim',
    icon: IconClipboard,
  },
  {
    kind: 'payouts',
    title: 'Penyaluran dana',
    text: 'Bruto, biaya Midtrans, fee platform, diterima klub',
    icon: IconTransfer,
  },
];

// A-18 · Laporan & ekspor (+ publikasi rapor semester)
export default async function LaporanPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ periode?: string; dari?: string; sampai?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const preset = PRESETS.some(([k]) => k === sp.periode) ? sp.periode! : 'month';
  const custom = preset === 'custom' && sp.dari && sp.sampai;
  const qs = new URLSearchParams({
    preset: custom || preset !== 'custom' ? preset : 'month',
    ...(custom ? { from: sp.dari!, to: sp.sampai! } : {}),
  });
  const base = `/admin/${slug}/laporan`;
  const [revenue, reportStatus] = await Promise.all([
    apiPage<{
      period: { label: string; from: string; to: string };
      data: Omit<RevenueReport, 'rows'> & {
        rows: (RevenueReport['rows'][number] & { label: string })[];
      };
    }>(`/orgs/${slug}/reports/revenue?${qs}`, base),
    apiServer<ReportStatus>(`/orgs/${slug}/report-cards/status`).catch(() => null),
  ]);
  const r = revenue.data;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-h1">Laporan & ekspor</h1>
        <p className="type-body text-fg-secondary">
          Angka laporan sama dengan dashboard untuk periode yang sama
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-caption-bold text-fg-secondary">Periode</span>
        {PRESETS.map(([k, label]) => (
          <Link
            key={k}
            href={`${base}?periode=${k}`}
            className={
              preset === k
                ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
                : 'rounded-full border border-line px-3 py-[6px] type-caption-bold'
            }
          >
            {label}
          </Link>
        ))}
        {preset === 'custom' ? (
          <form className="flex flex-wrap items-center gap-2" action={base}>
            <input type="hidden" name="periode" value="custom" />
            <input
              type="date"
              name="dari"
              defaultValue={sp.dari}
              aria-label="Dari tanggal"
              className="rounded-input border border-line px-3 py-1 type-body"
              required
            />
            <span>–</span>
            <input
              type="date"
              name="sampai"
              defaultValue={sp.sampai}
              aria-label="Sampai tanggal"
              className="rounded-input border border-line px-3 py-1 type-body"
              required
            />
            <button
              type="submit"
              className="rounded-full bg-brand px-3 py-[6px] type-caption-bold text-fg-inverse"
            >
              Terapkan
            </button>
          </form>
        ) : null}
        <span className="ml-auto type-caption text-fg-muted">
          {revenue.period.label} · {formatTanggalIso(revenue.period.from)} –{' '}
          {formatTanggalIso(revenue.period.to)}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {REPORTS.map((rep) => {
          const Icon = rep.icon;
          const href = (f: string) =>
            `/api/orgs/${slug}/reports/${rep.kind}/export?${qs}&format=${f}`;
          return (
            <Card key={rep.kind} className="flex flex-col gap-3 p-5">
              <span className="self-start rounded-input bg-brand-tint p-2 text-brand">
                <Icon size={20} />
              </span>
              <h2 className="type-h3">{rep.title}</h2>
              <p className="flex-1 type-caption text-fg-secondary">{rep.text}</p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={href('xlsx')}
                  className="rounded-input border border-line py-2 text-center type-body-medium hover:bg-canvas"
                >
                  Excel
                </a>
                <a
                  href={href('pdf')}
                  className="rounded-input border border-line py-2 text-center type-body-medium hover:bg-canvas"
                >
                  PDF
                </a>
              </div>
            </Card>
          );
        })}
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="type-h2">Pratinjau · Pendapatan per KU ({revenue.period.label})</h2>
        <Card className="overflow-x-auto">
          {r.rows.length === 0 ? (
            <p className="p-6 type-body text-fg-secondary">Belum ada pembayaran di periode ini.</p>
          ) : (
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-line bg-canvas">
                <tr className="type-caption-bold text-fg-secondary">
                  <th className="px-4 py-3">KU</th>
                  {r.months.map((m) => (
                    <th key={m} className="px-4 py-3 text-right">
                      {m}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.label} className="border-b border-line type-body">
                    <td className="px-4 py-3">
                      <Badge tone="brand">{row.label}</Badge>
                    </td>
                    {row.perMonth.map((v, i) => (
                      <td key={i} className="px-4 py-3 text-right tabular-nums">
                        {formatRupiah(v)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(row.total)}</td>
                  </tr>
                ))}
                <tr className="type-body-medium">
                  <td className="px-4 py-3">Total</td>
                  {r.totals.map((v, i) => (
                    <td key={i} className="px-4 py-3 text-right tabular-nums">
                      {formatRupiah(v)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRupiah(r.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      </section>
      {reportStatus ? (
        <section className="flex flex-col gap-3">
          <h2 className="type-h2">Rapor semester</h2>
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <div className="flex flex-1 flex-col gap-1">
              <span className="type-body-medium">
                Semester {reportStatus.semester} · {reportStatus.season.name}
              </span>
              <span className="type-caption text-fg-muted">
                {formatTanggalIso(reportStatus.range.from)} –{' '}
                {formatTanggalIso(reportStatus.range.to)} · {reportStatus.assessed} dari{' '}
                {reportStatus.players} pemain sudah dinilai
              </span>
            </div>
            {reportStatus.published ? (
              <Badge tone="success">
                Terbit {formatTanggalIso(reportStatus.published.at.slice(0, 10))}
              </Badge>
            ) : (
              <PublishReportButton slug={slug} status={reportStatus} />
            )}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
