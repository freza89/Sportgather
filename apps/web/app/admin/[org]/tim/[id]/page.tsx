import {
  formatAge,
  formatTanggalIso,
  kuLabel,
  type SeriesDto,
  type TeamDetail,
} from '@sportgather/shared';
import { Alert, Avatar, Badge, Card, IconLayers } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MemberStatusBadge, PlacementBadge } from '@/components/players/badges';
import { SeriesCard } from '@/components/schedule/series-card';
import { AddMemberDialog } from '@/components/teams/add-member-dialog';
import { RemoveMemberButton } from '@/components/teams/remove-member-button';
import { TeamFormDialog } from '@/components/teams/team-form-dialog';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';
import { loadTeamContext } from '@/lib/teams-data';

export const metadata: Metadata = { title: 'Detail tim' };

// A-10 · Detail tim
export default async function TimDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org: slug, id } = await params;
  const [team, ctx, session, series] = await Promise.all([
    apiPage<TeamDetail>(`/orgs/${slug}/teams/${id}`, `/admin/${slug}/tim/${id}`),
    loadTeamContext(slug),
    getClubSession(slug, `/admin/${slug}/tim/${id}`),
    apiPage<SeriesDto[]>(`/orgs/${slug}/schedule/series?teamId=${id}`),
  ]);
  const coaches = team.coaches.map((c) => c.fullName).join(', ') || 'belum ada pelatih';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">{team.name}</h1>
          <p className="type-body text-fg-secondary">
            <Link href={`/admin/${slug}/tim`} className="hover:text-fg">
              Tim & KU
            </Link>{' '}
            › {team.name} · {coaches} · {team.members.length} pemain
            {team.branchName ? ` · ${team.branchName}` : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <TeamFormDialog
            slug={slug}
            kuGroups={ctx.activeSeason?.kuGroups ?? [team.ku]}
            staff={ctx.staff}
            branches={ctx.branches}
            team={team}
            triggerLabel="Ubah tim"
            triggerVariant="secondary"
          />
          <AddMemberDialog slug={slug} teamId={team.id} isOwner={session.role === 'owner'} />
        </div>
      </div>

      <SeriesCard slug={slug} teamId={team.id} series={series} />

      <Alert tone="info" icon={IconLayers}>
        Sistem hanya menawarkan pemain dengan KU sesuai. Play-up wajib alasan; play-down butuh
        persetujuan owner.
      </Alert>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="border-b border-line bg-canvas/60 type-caption-bold text-fg-secondary">
            <tr>
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">Pemain</th>
              <th className="px-4 py-3">Usia per {formatTanggalIso(team.referenceDate)}</th>
              <th className="px-4 py-3">KU asli</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {team.members.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 type-body">{m.jerseyNumber ?? '—'}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/${slug}/pemain/${m.membershipId}`}
                    className="flex items-center gap-3 hover:text-brand"
                  >
                    <Avatar name={m.fullName} size={32} />
                    <span className="type-body-medium">{m.fullName}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 type-body">{m.age ? formatAge(m.age) : '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone="brand">{kuLabel(m.actualKu)}</Badge>
                </td>
                <td className="px-4 py-3">
                  {m.membershipStatus === 'on_leave' ? (
                    <MemberStatusBadge status="on_leave" reason={m.statusReason} />
                  ) : (
                    <PlacementBadge placement={m.placement} reason={m.placementReason} />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <RemoveMemberButton
                    slug={slug}
                    teamId={team.id}
                    memberId={m.id}
                    name={m.fullName}
                  />
                </td>
              </tr>
            ))}
            {team.members.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center type-body text-fg-secondary">
                  Belum ada pemain di tim ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
