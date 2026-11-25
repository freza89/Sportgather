'use client';

import { WEEKDAY_LONG, type SeriesDto } from '@sportgather/shared';
import { Card, IconCalendar, IconX } from '@sportgather/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

/** Jadwal latihan rutin tim (A-10 › Jadwal). */
export function SeriesCard({
  slug,
  teamId,
  series,
}: {
  slug: string;
  teamId: string;
  series: SeriesDto[];
}) {
  const router = useRouter();
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 type-h3">
          <IconCalendar size={18} /> Jadwal latihan rutin
        </h2>
        <Link href={`/admin/${slug}/jadwal?tim=${teamId}`} className="type-body-sm text-brand">
          Atur jadwal →
        </Link>
      </div>
      {series.length === 0 ? (
        <p className="type-body text-fg-secondary">Belum ada jadwal rutin.</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {series.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-control bg-canvas px-3 py-2">
            <span className="flex-1 type-body">
              {WEEKDAY_LONG[s.weekday]} {s.startTime.replace(':', '.')} · {s.durationMin} menit
              {s.branchName ? ` · ${s.branchName}` : ''}
              <span className="type-caption text-fg-muted"> · {s.upcoming} sesi mendatang</span>
            </span>
            <button
              type="button"
              aria-label={`Hentikan jadwal ${WEEKDAY_LONG[s.weekday]}`}
              className="text-fg-muted hover:text-danger"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Hentikan jadwal ${WEEKDAY_LONG[s.weekday]}? Sesi mendatang yang belum diabsen akan dihapus.`,
                  )
                )
                  return;
                const res = await api('DELETE', `/orgs/${slug}/schedule/series/${s.id}`);
                if (!res.ok) window.alert(res.message);
                router.refresh();
              }}
            >
              <IconX size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
