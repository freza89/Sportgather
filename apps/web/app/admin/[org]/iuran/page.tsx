import {
  formatRupiahRingkas,
  periodLabel,
  type FeePlanDto,
  type InvoiceDto,
  type InvoiceSummary,
  type PlayerListResponse,
  type ScholarshipDto,
} from '@sportgather/shared';
import { StatCard, TabLink, Tabs } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InvoiceActions, InvoiceTable } from '@/components/billing/invoice-table';
import { PlansPanel } from '@/components/billing/plans-panel';
import { ScholarshipsPanel } from '@/components/billing/scholarships-panel';
import { apiPage, getMe } from '@/lib/api-server';
import { todayJakarta } from '@/lib/dates';

export const metadata: Metadata = { title: 'Iuran & tagihan' };

const STATUS_FILTERS = [
  ['all', 'Semua'],
  ['paid', 'Lunas'],
  ['unpaid', 'Menunggu'],
  ['overdue', 'Terlambat'],
  ['manual', 'Manual'],
  ['waived', 'Dibebaskan'],
] as const;

// A-13 · Paket iuran / A-14 · Tagihan
export default async function IuranPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ tab?: string; status?: string; periode?: string; q?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const tab = sp.tab === 'paket' || sp.tab === 'beasiswa' ? sp.tab : 'tagihan';
  const base = `/admin/${slug}/iuran`;
  const me = await getMe(base);
  const role = me.clubs.find((c) => c.slug === slug)?.role;
  const period =
    sp.periode && /^\d{4}-\d{2}$/.test(sp.periode) ? sp.periode : todayJakarta().slice(0, 7);
  const status = STATUS_FILTERS.some(([k]) => k === sp.status) ? sp.status! : 'all';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Iuran & tagihan</h1>
          <p className="type-body text-fg-secondary">
            {tab === 'tagihan'
              ? `Periode ${periodLabel(period)} · terbit otomatis sesuai tanggal paket`
              : 'Atur nominal, siklus, dan siapa yang ditagih'}
          </p>
        </div>
        {tab === 'tagihan' ? <InvoiceActions slug={slug} period={period} /> : null}
      </div>
      <Tabs label="Iuran">
        <TabLink as={Link} href={base} active={tab === 'tagihan'}>
          Tagihan
        </TabLink>
        <TabLink as={Link} href={`${base}?tab=paket`} active={tab === 'paket'}>
          Paket iuran
        </TabLink>
        <TabLink as={Link} href={`${base}?tab=beasiswa`} active={tab === 'beasiswa'}>
          Beasiswa
        </TabLink>
      </Tabs>
      {tab === 'paket' ? (
        <PlansPanel
          slug={slug}
          plans={await apiPage<FeePlanDto[]>(`/orgs/${slug}/billing/plans`, base)}
        />
      ) : tab === 'beasiswa' ? (
        <ScholarshipsPanel
          slug={slug}
          isOwner={role === 'owner'}
          items={await apiPage<ScholarshipDto[]>(`/orgs/${slug}/billing/scholarships`, base)}
          players={
            (
              await apiPage<PlayerListResponse>(
                `/orgs/${slug}/players?pageSize=100&status=active`,
                base,
              )
            ).rows
          }
        />
      ) : (
        <TagihanTab slug={slug} base={base} period={period} status={status} q={sp.q} />
      )}
    </div>
  );
}

async function TagihanTab({
  slug,
  base,
  period,
  status,
  q,
}: {
  slug: string;
  base: string;
  period: string;
  status: string;
  q: string | undefined;
}) {
  const qs = new URLSearchParams({ period, status, ...(q ? { q } : {}) });
  const data = await apiPage<{ summary: InvoiceSummary; invoices: InvoiceDto[] }>(
    `/orgs/${slug}/billing/invoices?${qs}`,
    base,
  );
  const s = data.summary;
  const [y, m] = period.split('-').map(Number);
  const shift = (d: number) => {
    const t = new Date(Date.UTC(y!, m! - 1 + d, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const href = (o: { periode?: string; status?: string }) =>
    `${base}?periode=${o.periode ?? period}${(o.status ?? status) !== 'all' ? `&status=${o.status ?? status}` : ''}`;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total tertagih"
          value={formatRupiahRingkas(s.billed.amount)}
          note={`${s.billed.count} tagihan`}
        />
        <StatCard
          label="Terbayar"
          value={formatRupiahRingkas(s.paid.amount)}
          note={`${s.paid.pct}% · ${s.paid.count} tagihan`}
          noteTone="success"
        />
        <StatCard
          label="Menunggu"
          value={formatRupiahRingkas(s.waiting.amount - s.overdue.amount)}
          note={`${s.waiting.count - s.overdue.count} tagihan belum jatuh tempo`}
        />
        <StatCard
          label="Terlambat"
          value={formatRupiahRingkas(s.overdue.amount)}
          note={
            s.overdue.count
              ? `${s.overdue.count} tagihan · s.d. H+${s.overdue.maxDays}`
              : 'Tidak ada'
          }
          noteTone={s.overdue.count ? 'danger' : 'muted'}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={href({ status: k })}
            className={
              status === k
                ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
                : 'rounded-full border border-line px-3 py-[6px] type-caption-bold'
            }
          >
            {label}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Link href={href({ periode: shift(-1) })} className="type-caption-bold text-brand">
            ‹ {periodLabel(shift(-1))}
          </Link>
          <span className="text-fg-muted">·</span>
          <Link href={href({ periode: shift(1) })} className="type-caption-bold text-brand">
            {periodLabel(shift(1))} ›
          </Link>
        </div>
      </div>
      <InvoiceTable slug={slug} invoices={data.invoices} />
    </>
  );
}
