import { formatTanggalIso } from '@sportgather/shared';
import { Badge, Card, IconPin, IconUser, IconUsers, buttonVariants } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TeamFormDialog } from '@/components/teams/team-form-dialog';
import { loadTeamContext } from '@/lib/teams-data';

export const metadata: Metadata = { title: 'Tim & KU' };

// A-09 · Tim & KU
export default async function TimPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ku?: string }>;
}) {
  const { org: slug } = await params;
  const { ku } = await searchParams;
  const ctx = await loadTeamContext(slug);
  const base = `/admin/${slug}/tim`;

  if (!ctx.season || !ctx.activeSeason) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="type-h1">Tim & KU</h1>
        <Card className="flex flex-col items-start gap-3 p-6">
          <h2 className="type-h3">Belum ada musim aktif</h2>
          <p className="type-body text-fg-secondary">
            KU dihitung dari tanggal kompetisi utama musim. Buat musim terlebih dahulu.
          </p>
          <Link href={`/admin/${slug}/pengaturan/musim`} className={buttonVariants()}>
            Atur musim & kompetisi
          </Link>
        </Card>
      </div>
    );
  }
  const groups = ctx.activeSeason.kuGroups;
  const teams = ku ? ctx.teams.filter((t) => String(t.ku) === ku) : ctx.teams;
  const chip = (active: boolean) =>
    active
      ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
      : 'rounded-full border border-line bg-surface px-3 py-[6px] type-caption-bold text-fg-secondary';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Tim & KU</h1>
          <p className="type-body text-fg-secondary">
            {ctx.season.name} · KU dihitung dari {ctx.season.referenceSource} (
            {formatTanggalIso(ctx.season.referenceDate)})
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`${base}/kenaikan`} className={buttonVariants({ variant: 'secondary' })}>
            Kenaikan KU musim baru
          </Link>
          <TeamFormDialog
            slug={slug}
            kuGroups={groups}
            staff={ctx.staff}
            branches={ctx.branches}
            triggerLabel="Buat tim"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={base} className={chip(!ku)}>
          Semua tim ({ctx.teams.length})
        </Link>
        {groups.map((g) => (
          <Link key={g} href={`${base}?ku=${g}`} className={chip(ku === String(g))}>
            KU{g}
          </Link>
        ))}
      </div>
      {teams.length === 0 ? (
        <Card className="p-6 type-body text-fg-secondary">
          Belum ada tim{ku ? ` KU${ku}` : ''}.
        </Card>
      ) : null}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => (
          <Link key={t.id} href={`${base}/${t.id}`}>
            <Card className="flex h-full flex-col gap-3 p-5 transition-colors hover:border-brand">
              <div className="flex gap-2">
                <Badge tone="brand">KU{t.ku}</Badge>
                <Badge tone={t.level === 'Elite' ? 'info' : 'neutral'}>{t.level}</Badge>
                {t.gender !== 'mixed' ? (
                  <Badge tone="neutral">{t.gender === 'male' ? 'Putra' : 'Putri'}</Badge>
                ) : null}
              </div>
              <h2 className="type-h2">{t.name}</h2>
              <p className="flex items-center gap-2 type-body-sm text-fg-secondary">
                <IconUser size={16} />{' '}
                {t.coaches.length
                  ? t.coaches.map((c) => c.fullName).join(', ')
                  : 'Belum ada pelatih'}
              </p>
              <p className="flex items-center gap-2 type-body-sm text-fg-secondary">
                <IconUsers size={16} /> {t.playerCount} pemain
              </p>
              {t.branchName ? (
                <p className="flex items-center gap-2 type-body-sm text-fg-secondary">
                  <IconPin size={16} /> {t.branchName}
                </p>
              ) : null}
              <p className="mt-auto type-caption text-fg-muted">
                Jadwal & kehadiran tersedia di M3
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
