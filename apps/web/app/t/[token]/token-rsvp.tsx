'use client';

import type { RsvpStatus, TokenRsvpView } from '@sportgather/shared';
import { Alert, Button, buttonVariants } from '@sportgather/ui';
import Link from 'next/link';
import { useState } from 'react';
import { RsvpCard } from '@/components/wali/schedule-list';
import { api } from '@/lib/api-client';

/**
 * Link bertoken sekali pakai: pilihan untuk semua anak dikumpulkan dulu, lalu dikirim
 * dalam satu permintaan.
 */
export function TokenRsvp({ token, view }: { token: string; view: TokenRsvpView }) {
  const [locked, setLocked] = useState(view.used || view.expired);
  const [choices, setChoices] = useState<Record<string, RsvpStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = (i: { eventId: string; membershipId: string }) => `${i.eventId}|${i.membershipId}`;
  const open = view.items.filter((i) => i.rsvpOpen && i.status === 'scheduled');

  async function send() {
    setBusy(true);
    setError(null);
    const responses = Object.entries(choices).map(([k, status]) => {
      const [eventId, membershipId] = k.split('|') as [string, string];
      return { eventId, membershipId, status };
    });
    const res = await api('POST', `/public/rsvp/${encodeURIComponent(token)}`, { responses });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setDone(true);
    setLocked(true);
  }

  return (
    <div className="flex flex-col gap-3">
      {view.items.map((item) => (
        <RsvpCard
          key={key(item)}
          item={{ ...item, rsvpOpen: item.rsvpOpen && !locked }}
          submit={async (status) => {
            setChoices((c) => ({ ...c, [key(item)]: status }));
            return null;
          }}
        />
      ))}
      {done ? (
        <Alert tone="success">Terima kasih, kehadiran sudah dikirim ke pelatih.</Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!locked && open.length > 0 ? (
        <Button
          block
          onClick={() => void send()}
          disabled={busy || Object.keys(choices).length < open.length}
        >
          {busy ? 'Mengirim…' : 'Kirim konfirmasi'}
        </Button>
      ) : null}
      <Link
        href="/wali/jadwal"
        className={buttonVariants({ variant: 'ghost', className: 'self-start' })}
      >
        Lihat semua jadwal di aplikasi →
      </Link>
    </div>
  );
}
