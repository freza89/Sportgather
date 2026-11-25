import 'server-only';
import type { BranchDto, SeasonDto, StaffDto, TeamSummary } from '@sportgather/shared';
import { apiPage } from './api-server';

export async function loadTeamContext(slug: string) {
  const [teams, season, staff, branches] = await Promise.all([
    apiPage<{
      season: { id: string; name: string; referenceDate: string; referenceSource: string } | null;
      teams: TeamSummary[];
    }>(`/orgs/${slug}/teams`, `/admin/${slug}/tim`),
    apiPage<SeasonDto | null>(`/orgs/${slug}/seasons/active`),
    apiPage<StaffDto[]>(`/orgs/${slug}/staff`),
    apiPage<BranchDto[]>(`/orgs/${slug}/branches`),
  ]);
  return { ...teams, activeSeason: season, staff, branches };
}
