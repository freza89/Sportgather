'use client';

import { kuLabel, type TeamCandidate } from '@sportgather/shared';
import { Alert, Button, Dialog, Input, cn } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PlacementBadge } from '@/components/players/badges';
import { api } from '@/lib/api-client';

/**
 * Tambah pemain ke tim (A-10). Sistem menawarkan pemain dengan KU sesuai lebih dulu;
 * play-up wajib alasan; play-down & lewat usia hanya owner + alasan (US-06).
 */
export function AddMemberDialog({
  slug,
  teamId,
  isOwner,
}: {
  slug: string;
  teamId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<TeamCandidate[] | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [selected, setSelected] = useState<TeamCandidate | null>(null);
  const [jersey, setJersey] = useState('');
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openDialog() {
    setOpen(true);
    setSelected(null);
    setError(null);
    const res = await api<TeamCandidate[]>('GET', `/orgs/${slug}/teams/${teamId}/candidates`);
    setCandidates(res.ok ? res.data : []);
  }

  async function add() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const res = await api('POST', `/orgs/${slug}/teams/${teamId}/members`, {
      membershipId: selected.membershipId,
      ...(jersey ? { jerseyNumber: Number(jersey) } : {}),
      ...(reason ? { reason } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    setJersey('');
    setReason('');
    router.refresh();
  }

  const visible = (candidates ?? [])
    .filter((c) => showOthers || c.placement === 'same')
    .filter((c) => !query || c.fullName.toLowerCase().includes(query.toLowerCase()));
  const blocked =
    selected &&
    (selected.placement === 'play_down' || selected.placement === 'over_age') &&
    !isOwner;

  return (
    <>
      <Button onClick={() => void openDialog()}>Tambah pemain</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Tambah pemain ke tim"
        className="max-w-[560px]"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Input
              label={<span className="sr-only">Cari</span>}
              placeholder="Cari nama pemain"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <label className="flex items-center gap-2 type-body-sm whitespace-nowrap">
              <input
                type="checkbox"
                className="size-4"
                checked={showOthers}
                onChange={(e) => setShowOthers(e.target.checked)}
              />
              Tampilkan KU lain
            </label>
          </div>
          <ul className="max-h-72 overflow-y-auto rounded-control border border-line">
            {candidates === null ? <li className="p-4 type-body text-fg-muted">Memuat…</li> : null}
            {candidates && visible.length === 0 ? (
              <li className="p-4 type-body text-fg-muted">
                Tidak ada pemain dengan KU sesuai yang belum masuk tim ini.
              </li>
            ) : null}
            {visible.map((c) => (
              <li key={c.membershipId}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(c);
                    setError(null);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0',
                    selected?.membershipId === c.membershipId ? 'bg-brand-tint' : 'hover:bg-canvas',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block type-body-medium">{c.fullName}</span>
                    <span className="block type-caption text-fg-muted">
                      {kuLabel(c.ku)}
                      {c.currentTeam ? ` · sekarang di ${c.currentTeam}` : ''}
                    </span>
                  </span>
                  <PlacementBadge placement={c.placement} />
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="grid grid-cols-[120px_1fr] gap-4">
              <Input
                label="No. punggung"
                type="number"
                min={0}
                max={99}
                value={jersey}
                onChange={(e) => setJersey(e.target.value)}
              />
              {selected.placement !== 'same' ? (
                <Input
                  label={
                    selected.placement === 'play_up'
                      ? 'Alasan play-up (wajib)'
                      : 'Alasan override owner (wajib)'
                  }
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={Boolean(blocked)}
                />
              ) : null}
            </div>
          ) : null}
          {blocked ? (
            <Alert tone="warning">
              Play-down / lewat usia butuh persetujuan owner. Minta owner menempatkan pemain ini.
            </Alert>
          ) : null}
          {selected?.currentTeam ? (
            <Alert tone="info">
              {selected.fullName} akan dipindahkan dari {selected.currentTeam}.
            </Alert>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button onClick={() => void add()} disabled={!selected || busy || Boolean(blocked)}>
            {busy ? 'Menambahkan…' : 'Tambahkan'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
