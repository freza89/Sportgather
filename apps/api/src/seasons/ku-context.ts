import { competition, membership, person, season, type Tx } from '@sportgather/db';
import { DEFAULT_KU_CONFIG, referenceDate, type IsoDate, type KuConfig } from '@sportgather/shared';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

export interface KuContext {
  season: typeof season.$inferSelect | null;
  referenceDate: IsoDate;
  referenceSource: string;
  config: KuConfig;
}

/** Tanggal hari ini di WIB (default zona klub) sebagai ISO date. */
export function todayIso(now = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function seasonConfig(s: Pick<typeof season.$inferSelect, 'kuRule' | 'kuGroups'>): KuConfig {
  return { rule: s.kuRule, groups: s.kuGroups };
}

/**
 * Acuan KU untuk latihan rutin: kompetisi utama musim aktif; cadangan 31 Desember
 * (PRD bagian 4 & 12). Tanpa musim aktif: aturan default dan 31 Desember tahun ini.
 */
export async function loadKuContext(tx: Tx, seasonId?: string): Promise<KuContext> {
  const [s] = await tx
    .select()
    .from(season)
    .where(seasonId ? eq(season.id, seasonId) : eq(season.status, 'active'))
    .limit(1);
  if (!s) {
    const year = todayIso().slice(0, 4);
    return {
      season: null,
      referenceDate: `${year}-12-31`,
      referenceSource: 'Belum ada musim aktif · cadangan 31 Desember',
      config: DEFAULT_KU_CONFIG,
    };
  }
  const [primary] = s.primaryCompetitionId
    ? await tx.select().from(competition).where(eq(competition.id, s.primaryCompetitionId))
    : [];
  return {
    season: s,
    referenceDate: referenceDate({ endsOn: s.endsOn }, primary ?? null),
    referenceSource: primary ? primary.name : 'Tanpa kompetisi · cadangan 31 Desember',
    config: seasonConfig(s),
  };
}

/** Pemain aktif/cuti dengan tanggal lahir (untuk perhitungan KU massal). */
export async function activePlayers(tx: Tx) {
  return tx
    .select({ membershipId: membership.id, fullName: person.fullName, birthDate: person.birthDate })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(and(inArray(membership.status, ['active', 'on_leave']), isNotNull(person.birthDate)));
}
