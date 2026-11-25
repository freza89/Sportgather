import type { PromotionPreview, SeasonDto } from '@sportgather/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NextSeasonForm } from '@/components/teams/next-season-form';
import { PromotionBoard } from '@/components/teams/promotion-board';
import { ApiError, apiPage, apiServer } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Kenaikan KU' };

// A-11 · Kenaikan KU musim baru
export default async function KenaikanPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const active = await apiPage<SeasonDto | null>(
    `/orgs/${slug}/seasons/active`,
    `/admin/${slug}/tim/kenaikan`,
  );
  if (!active) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="type-h1">Kenaikan KU</h1>
        <p className="type-body text-fg-secondary">
          Belum ada musim aktif.{' '}
          <Link href={`/admin/${slug}/pengaturan/musim`} className="text-brand">
            Atur musim
          </Link>{' '}
          terlebih dahulu.
        </p>
      </div>
    );
  }
  const preview = await apiServer<PromotionPreview>(`/orgs/${slug}/promotion`).catch(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    },
  );
  if (!preview) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="type-h1">Kenaikan KU musim baru</h1>
          <p className="type-body text-fg-secondary">Musim aktif: {active.name}</p>
        </div>
        <NextSeasonForm
          slug={slug}
          kuGroups={active.kuGroups}
          suggestedYear={Number(active.endsOn.slice(0, 4)) + 1}
        />
      </div>
    );
  }
  return <PromotionBoard slug={slug} preview={preview} />;
}
