import {
  guardianLink,
  membership,
  person,
  staffRole,
  team,
  teamMember,
  teamStaff,
  userAccount,
  type Tx,
} from '@sportgather/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';

export interface GuardianRecipient {
  guardianPersonId: string;
  guardianName: string;
  phone: string;
  membershipId: string;
  childName: string;
  teamId: string;
}

/** Wali utama dari pemain aktif di tim-tim tsb (musim berjalan). */
export async function guardiansOfTeams(tx: Tx, teamIds: string[]): Promise<GuardianRecipient[]> {
  if (!teamIds.length) return [];
  const guardian = person;
  const rows = await tx
    .select({
      guardianPersonId: guardianLink.guardianPersonId,
      phone: userAccount.phone,
      membershipId: membership.id,
      childPersonId: membership.personId,
      teamId: teamMember.teamId,
    })
    .from(teamMember)
    .innerJoin(membership, eq(membership.id, teamMember.membershipId))
    .innerJoin(
      guardianLink,
      and(eq(guardianLink.childPersonId, membership.personId), eq(guardianLink.isPrimary, true)),
    )
    .innerJoin(userAccount, eq(userAccount.personId, guardianLink.guardianPersonId))
    .where(
      and(
        inArray(teamMember.teamId, teamIds),
        isNull(teamMember.leftAt),
        eq(membership.status, 'active'),
      ),
    );
  if (!rows.length) return [];
  const names = await tx
    .select({ id: guardian.id, fullName: guardian.fullName })
    .from(guardian)
    .where(
      inArray(guardian.id, [
        ...new Set([...rows.map((r) => r.guardianPersonId), ...rows.map((r) => r.childPersonId)]),
      ]),
    );
  const nameOf = new Map(names.map((n) => [n.id, n.fullName]));
  return rows
    .filter((r) => r.phone)
    .map((r) => ({
      guardianPersonId: r.guardianPersonId,
      guardianName: nameOf.get(r.guardianPersonId) ?? 'Wali',
      phone: r.phone!,
      membershipId: r.membershipId,
      childName: nameOf.get(r.childPersonId) ?? 'Anak',
      teamId: r.teamId,
    }));
}

/** Pelatih/team manager yang ditugaskan ke tim. */
export async function coachesOfTeams(
  tx: Tx,
  teamIds: string[],
): Promise<{ personId: string; phone: string; teamId: string }[]> {
  if (!teamIds.length) return [];
  const rows = await tx
    .select({ personId: staffRole.personId, phone: userAccount.phone, teamId: teamStaff.teamId })
    .from(teamStaff)
    .innerJoin(staffRole, eq(staffRole.id, teamStaff.staffRoleId))
    .innerJoin(userAccount, eq(userAccount.personId, staffRole.personId))
    .where(and(inArray(teamStaff.teamId, teamIds), eq(staffRole.status, 'active')));
  return rows.filter((r): r is { personId: string; phone: string; teamId: string } =>
    Boolean(r.phone),
  );
}

export async function teamNames(tx: Tx, teamIds: string[]): Promise<Map<string, string>> {
  if (!teamIds.length) return new Map();
  const rows = await tx
    .select({ id: team.id, name: team.name })
    .from(team)
    .where(inArray(team.id, teamIds));
  return new Map(rows.map((r) => [r.id, r.name]));
}
