'use client';

import {
  addDays,
  utcToLocalDate,
  WEEKDAY_SHORT,
  weekdayOf,
  type ChildEventDto,
  type ZonaWaktu,
} from '@sportgather/shared';
import { Card, Chip, cn } from '@sportgather/ui';
import { useState } from 'react';
import { RsvpCard } from './schedule-list';

export function WaliSchedule({ events, today }: { events: ChildEventDto[]; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const children = [...new Map(events.map((e) => [e.membershipId, e.childName])).entries()];
  const [day, setDay] = useState<string | null>(null);
  const [child, setChild] = useState<string | null>(null);
  const dateOf = (e: ChildEventDto) =>
    utcToLocalDate(new Date(e.startsAt), e.timezone as ZonaWaktu);
  const shown = events.filter(
    (e) => (!day || dateOf(e) === day) && (!child || e.membershipId === child),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const has = events.some((e) => dateOf(e) === d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={day === d}
              onClick={() => setDay(day === d ? null : d)}
              className={cn(
                'flex flex-col items-center rounded-control border py-2',
                day === d
                  ? 'border-navy-900 bg-navy-900 text-fg-inverse'
                  : 'border-line bg-surface',
              )}
            >
              <span className="type-caption">{WEEKDAY_SHORT[weekdayOf(d)]}</span>
              <span className="type-h3">{Number(d.slice(8))}</span>
              <span
                className={cn('mt-1 size-1 rounded-full', has ? 'bg-brand' : 'bg-transparent')}
              />
            </button>
          );
        })}
      </div>
      {children.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <Chip selected={!child} onClick={() => setChild(null)}>
            Semua anak
          </Chip>
          {children.map(([id, name]) => (
            <Chip key={id} selected={child === id} onClick={() => setChild(id)}>
              {name.split(' ')[0]}
            </Chip>
          ))}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <Card className="p-5 type-body text-fg-secondary">Tidak ada jadwal.</Card>
      ) : null}
      {shown.map((e) => (
        <RsvpCard key={`${e.eventId}-${e.membershipId}`} item={e} />
      ))}
      <p className="type-caption text-fg-muted">
        RSVP ditutup 2 jam sebelum sesi. Hubungi pelatih untuk perubahan mendadak.
      </p>
    </div>
  );
}
