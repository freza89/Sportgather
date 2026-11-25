import type { AssessmentSheet, CoachTeamDto } from '@sportgather/shared';
import { Card } from '@sportgather/ui';
import Link from 'next/link';
import { AssessmentForm } from '@/components/coach/assessment-form';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';

// P-04 · Penilaian skill
export default async function PenilaianPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ tim?: string; pemain?: string }>;
}) {
  const { org } = await params;
  const sp = await searchParams;
  const { me } = await getClubSession(org, `/pelatih/${org}/penilaian`);
  const teams = await apiPage<CoachTeamDto[]>(`/orgs/${org}/coach/teams`);
  const teamId = teams.some((t) => t.id === sp.tim) ? sp.tim! : teams[0]?.id;
  const sheet = teamId
    ? await apiPage<AssessmentSheet>(`/orgs/${org}/coach/assessments?teamId=${teamId}`)
    : null;
  return (
    <MobileShell
      base={`/pelatih/${org}`}
      role="pelatih"
      title="Penilaian skill"
      backHref={`/pelatih/${org}`}
      subtitle={
        sheet
          ? `${sheet.team.name} · Semester ${sheet.semester} ${sheet.season.name}`
          : 'Belum ada tim'
      }
      userName={me.user.fullName}
    >
      {!sheet ? (
        <Card className="p-5 type-body text-fg-secondary">
          Anda belum ditugaskan ke tim. Hubungi admin klub.
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {teams.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {teams.map((t) => (
                <Link
                  key={t.id}
                  href={`/pelatih/${org}/penilaian?tim=${t.id}`}
                  className={
                    t.id === teamId
                      ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
                      : 'rounded-full border border-line bg-surface px-3 py-[6px] type-caption-bold'
                  }
                >
                  {t.name} ({t.members.length})
                </Link>
              ))}
            </div>
          ) : null}
          <AssessmentForm slug={org} sheet={sheet} initialPlayer={sp.pemain} />
        </div>
      )}
    </MobileShell>
  );
}
