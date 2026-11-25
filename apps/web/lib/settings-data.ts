import 'server-only';
import { can, type BankAccountDto, type BranchDto, type OrgSummary } from '@sportgather/shared';
import { apiPage } from './api-server';
import { getClubSession } from './club';

export async function loadSettings(slug: string) {
  const session = await getClubSession(slug, `/admin/${slug}/pengaturan`);
  const [org, branches, bank] = await Promise.all([
    apiPage<OrgSummary>(`/orgs/${slug}`),
    apiPage<BranchDto[]>(`/orgs/${slug}/branches`),
    apiPage<BankAccountDto | null>(`/orgs/${slug}/bank-account`),
  ]);
  return {
    ...session,
    org,
    branches,
    bank,
    canEdit: can(session.role, 'club.manage'),
    canEditFinance: can(session.role, 'club.manage_finance_settings'),
  };
}
