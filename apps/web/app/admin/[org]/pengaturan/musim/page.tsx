import type { SeasonDto } from '@sportgather/shared';
import { SeasonCompetitions } from '@/components/seasons/competitions';
import { SeasonSetup } from '@/components/seasons/season-setup';
import { SettingsHeader } from '@/components/settings/settings-header';
import { apiPage } from '@/lib/api-server';

// A-05 · Musim & kompetisi
export default async function MusimPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const season = await apiPage<SeasonDto | null>(
    `/orgs/${slug}/seasons/active`,
    `/admin/${slug}/pengaturan/musim`,
  );
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        base={`/admin/${slug}`}
        title="Musim & kompetisi"
        subtitle="Tanggal kompetisi menjadi acuan perhitungan KU"
      />
      {season ? <SeasonCompetitions slug={slug} season={season} /> : <SeasonSetup slug={slug} />}
    </div>
  );
}
