'use client';

import {
  RSVP_LABEL,
  formatHariTanggal,
  formatTimeRange,
  type ChildEventDto,
  type RsvpStatus,
  type ZonaWaktu,
} from '@sportgather/shared';
import { Avatar, Badge, Card, cn } from '@sportgather/ui';
import { useState } from 'react';
import { api } from '@/lib/api-client';

const TONE: Record<RsvpStatus, string> = {
  hadir: 'border-success bg-success-bg text-success',
  izin: 'border-warning bg-warning-bg text-warning',
  sakit: 'border-info bg-info-bg text-info',
};

export function eventLabel(e: Pick<ChildEventDto, 'startsAt' | 'endsAt' | 'timezone'>) {
  const zone = e.timezone as ZonaWaktu;
  return `${formatHariTanggal(new Date(e.startsAt), zone)} · ${formatTimeRange(new Date(e.startsAt), new Date(e.endsAt), zone).split(' – ')[0]}`;
}

/**
 * Kartu sesi + tombol RSVP (O-04). `submit` default memakai /me/rsvp (login); halaman
 * link bertoken memberi fungsi sendiri.
 */
export function RsvpCard({
  item,
  submit,
}: {
  item: ChildEventDto;
  submit?: (status: RsvpStatus) => Promise<string | null>;
}) {
  const [value, setValue] = useState<RsvpStatus | null>(item.rsvp);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(status: RsvpStatus) {
    setBusy(true);
    setError(null);
    const err = submit
      ? await submit(status)
      : await api('POST', '/me/rsvp', {
          eventId: item.eventId,
          membershipId: item.membershipId,
          status,
        }).then((r) => (r.ok ? null : r.message));
    setBusy(false);
    if (err) return setError(err);
    setValue(status);
  }

  const cancelled = item.status === 'cancelled';
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <Avatar name={item.childName} size={36} />
        <div className="min-w-0 flex-1">
          <p className="type-h3">{eventLabel(item)}</p>
          <p className="type-caption text-fg-muted">
            {item.childName} · {item.teamName}
            {item.title ? ` · ${item.title}` : ''}
            {item.location ? ` · ${item.location}` : ''}
          </p>
        </div>
        {cancelled ? (
          <Badge tone="danger">Dibatalkan</Badge>
        ) : item.changed ? (
          <Badge tone="warning">Jam berubah</Badge>
        ) : !item.rsvpOpen ? (
          <Badge tone="neutral">RSVP ditutup</Badge>
        ) : null}
      </div>
      {cancelled ? (
        <p className="type-body-sm text-fg-secondary">{item.cancelReason}</p>
      ) : (
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label={`Kehadiran ${item.childName}`}
        >
          {(['hadir', 'izin', 'sakit'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={value === s}
              disabled={!item.rsvpOpen || busy}
              onClick={() => void choose(s)}
              className={cn(
                'rounded-control border py-2 type-button disabled:opacity-60',
                value === s ? TONE[s] : 'border-line bg-canvas text-fg-secondary',
              )}
            >
              {RSVP_LABEL[s]}
            </button>
          ))}
        </div>
      )}
      {error ? <p className="type-caption text-danger">{error}</p> : null}
    </Card>
  );
}

/** "Latihan berikutnya — Apakah X hadir?" di beranda wali (O-03). */
export function NextSessionRsvp({ item }: { item: ChildEventDto }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="type-caption-bold text-fg-secondary">
        Latihan berikutnya · Apakah {item.childName.split(' ')[0]} hadir?
      </h2>
      <RsvpCard item={item} />
    </div>
  );
}
