'use client';

import {
  addDays,
  formatTimeRange,
  utcToLocalDate,
  WEEKDAY_SHORT,
  type HolidayDto,
  type ScheduleEventDto,
  type ZonaWaktu,
} from '@sportgather/shared';
import { cn } from '@sportgather/ui';
import { useState } from 'react';
import { KU_LEGEND, kuColor } from '@/lib/ku-colors';
import { EditEventDialog } from './schedule-dialogs';

/** A-12 · tampilan minggu: 7 kolom Sen–Min, sesi berwarna per KU, libur ditandai. */
export function WeekCalendar({
  slug,
  weekStart,
  today,
  events,
  holidays,
}: {
  slug: string;
  weekStart: string;
  today: string;
  events: ScheduleEventDto[];
  holidays: HolidayDto[];
}) {
  const [editing, setEditing] = useState<ScheduleEventDto | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateOf = (e: ScheduleEventDto) =>
    utcToLocalDate(new Date(e.startsAt), e.timezone as ZonaWaktu);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 overflow-x-auto md:grid-cols-7">
        {days.map((d, i) => {
          const dayEvents = events.filter((e) => dateOf(e) === d);
          const dayHolidays = holidays.filter((h) => h.date === d);
          return (
            <section
              key={d}
              aria-label={d}
              className="flex min-h-[220px] min-w-[150px] flex-col gap-2 rounded-card border border-line bg-surface p-3"
            >
              <h3 className="flex items-baseline gap-2">
                <span className="type-caption text-fg-secondary">{WEEKDAY_SHORT[(i + 1) % 7]}</span>
                <span className={cn('type-h3', d === today && 'text-brand')}>
                  {Number(d.slice(8))}
                </span>
              </h3>
              {dayHolidays.map((h) => (
                <div
                  key={h.id}
                  className="rounded-control border-l-4 border-warning bg-warning-bg px-2 py-2"
                >
                  <p className="type-caption-bold text-warning">Sepanjang hari</p>
                  <p className="type-caption-bold">{h.name}</p>
                  {h.branchName ? (
                    <p className="type-caption text-fg-muted">{h.branchName}</p>
                  ) : null}
                </div>
              ))}
              {dayEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEditing(e)}
                  className={cn(
                    'rounded-control bg-canvas px-2 py-2 text-left hover:bg-brand-tint',
                    e.status === 'cancelled' && 'opacity-60',
                  )}
                  style={{ borderLeft: `4px solid ${kuColor(e.ku)}` }}
                >
                  <p className="type-caption-bold text-fg-secondary">
                    {
                      formatTimeRange(
                        new Date(e.startsAt),
                        new Date(e.endsAt),
                        e.timezone as ZonaWaktu,
                      ).split(' – ')[0]
                    }
                  </p>
                  <p
                    className={cn('type-caption-bold', e.status === 'cancelled' && 'line-through')}
                  >
                    {e.teamName}
                    {e.title
                      ? ` · ${e.title}`
                      : e.isException && e.status === 'scheduled'
                        ? ' · diubah'
                        : ''}
                  </p>
                  <p className="type-caption text-fg-muted">
                    {e.status === 'cancelled'
                      ? e.cancelReason
                      : [e.branchName, e.locationNote].filter(Boolean).join(', ')}
                  </p>
                </button>
              ))}
              {dayEvents.length === 0 && dayHolidays.length === 0 ? (
                <p className="mt-4 text-center type-caption text-fg-muted">Tidak ada sesi</p>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 type-caption text-fg-secondary">
        {KU_LEGEND.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: kuColor(k) }} /> KU{k}
          </span>
        ))}
      </div>
      <EditEventDialog slug={slug} event={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
