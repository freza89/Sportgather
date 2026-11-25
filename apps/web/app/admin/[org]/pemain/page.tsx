import { formatTanggalIso, type PlayerListResponse } from '@sportgather/shared';
import { Avatar, Badge, Card, buttonVariants } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AddPlayerDialog } from '@/components/players/add-player-dialog';
import { DocBadge, KuBadge, MemberStatusBadge } from '@/components/players/badges';
import { apiPage } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Pemain' };

// A-06 · Daftar pemain
export default async function PemainPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const data = await apiPage<PlayerListResponse>(
    `/orgs/${slug}/players?${qs.toString()}`,
    `/admin/${slug}/pemain`,
  );
  const base = `/admin/${slug}/pemain`;
  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    const s = next.toString();
    return s ? `${base}?${s}` : base;
  };
  const chip = (active: boolean) =>
    active
      ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
      : 'rounded-full border border-line bg-surface px-3 py-[6px] type-caption-bold text-fg-secondary hover:border-fg-muted';
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Pemain</h1>
          <p className="type-body text-fg-secondary">
            {data.activeCount} pemain aktif ·{' '}
            <Link href={`${base}/verifikasi`} className="text-brand">
              {data.pendingCount} menunggu verifikasi
            </Link>
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`${base}/impor`} className={buttonVariants({ variant: 'secondary' })}>
            Impor Excel
          </Link>
          <AddPlayerDialog slug={slug} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={link({ ku: undefined })} className={chip(!sp.ku)}>
          Semua ({data.activeCount})
        </Link>
        {data.kuCounts.map((c) => (
          <Link
            key={String(c.ku)}
            href={link({ ku: c.ku === null ? undefined : String(c.ku) })}
            className={chip(sp.ku === String(c.ku))}
          >
            {c.ku === null ? 'Lulus' : `KU${c.ku}`} ({c.count})
          </Link>
        ))}
        <form action={base} className="ml-auto">
          {sp.ku ? <input type="hidden" name="ku" value={sp.ku} /> : null}
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Cari nama pemain / wali"
            className="h-9 rounded-control border border-line bg-surface px-3 type-body-sm focus:border-brand focus:outline-none"
          />
        </form>
      </div>
      <div className="flex gap-2 type-caption">
        {(['active', 'pending', 'rejected', 'left', 'all'] as const).map((s) => (
          <Link
            key={s}
            href={link({ status: s === 'active' ? undefined : s })}
            className={(sp.status ?? 'active') === s ? 'text-brand' : 'text-fg-muted hover:text-fg'}
          >
            {
              {
                active: 'Aktif & cuti',
                pending: 'Menunggu',
                rejected: 'Ditolak',
                left: 'Keluar',
                all: 'Semua status',
              }[s]
            }
          </Link>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead className="border-b border-line bg-canvas/60 type-caption-bold text-fg-secondary">
            <tr>
              <th className="px-4 py-3">Pemain</th>
              <th className="px-4 py-3">KU</th>
              <th className="px-4 py-3">Tim</th>
              <th className="px-4 py-3">Wali</th>
              <th className="px-4 py-3">Dokumen usia</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr
                key={r.membershipId}
                className="border-b border-line last:border-0 hover:bg-canvas/50"
              >
                <td className="px-4 py-3">
                  <Link href={`${base}/${r.membershipId}`} className="flex items-center gap-3">
                    <Avatar name={r.fullName} size={32} />
                    <span>
                      <span className="block type-body-medium">{r.fullName}</span>
                      <span className="block type-caption text-fg-muted">
                        {formatTanggalIso(r.birthDate)}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <KuBadge ku={r.ku} />
                </td>
                <td className="px-4 py-3 type-body">
                  {r.team?.name ?? <span className="text-fg-muted">Belum ada tim</span>}
                </td>
                <td className="px-4 py-3 type-body">{r.guardianName ?? '—'}</td>
                <td className="px-4 py-3">
                  <DocBadge status={r.docStatus} />
                </td>
                <td className="px-4 py-3">
                  {r.status === 'active' ? (
                    <Badge tone="success">Aktif</Badge>
                  ) : (
                    <MemberStatusBadge status={r.status} />
                  )}
                </td>
              </tr>
            ))}
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center type-body text-fg-secondary">
                  Belum ada pemain. Impor dari Excel atau tambah pemain satu per satu.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body-sm text-fg-secondary">
          Menampilkan {from}–{Math.min(data.page * data.pageSize, data.total)} dari {data.total}{' '}
          pemain · KU per acuan {formatTanggalIso(data.referenceDate)}
        </p>
        <div className="flex gap-3">
          {data.page > 1 ? (
            <Link
              href={link({ page: String(data.page - 1) })}
              className={buttonVariants({ variant: 'secondary' })}
            >
              Sebelumnya
            </Link>
          ) : null}
          {data.page < pages ? (
            <Link
              href={link({ page: String(data.page + 1) })}
              className={buttonVariants({ variant: 'secondary' })}
            >
              Berikutnya
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
