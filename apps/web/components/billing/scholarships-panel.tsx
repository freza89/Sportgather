'use client';

import type { PlayerRow, ScholarshipDto } from '@sportgather/shared';
import { Alert, Badge, Button, Card, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api-client';

// A-13 · Beasiswa 0–100% per pemain (ditetapkan owner, FEE-01).
export function ScholarshipsPanel({
  slug,
  isOwner,
  items,
  players,
}: {
  slug: string;
  isOwner: boolean;
  items: ScholarshipDto[];
  players: PlayerRow[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({ membershipId: '', pct: '50', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(membershipId: string, pct: number, reason: string) {
    setBusy(true);
    const res = await api('POST', `/orgs/${slug}/billing/scholarships`, {
      membershipId,
      pct,
      ...(reason ? { reason } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setError(null);
    setForm({ membershipId: '', pct: '50', reason: '' });
    router.refresh();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.membershipId) return setError('Pilih pemain');
    void save(form.membershipId, Number(form.pct), form.reason);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <p className="p-6 type-body text-fg-secondary">Belum ada pemain penerima beasiswa.</p>
        ) : (
          <ul>
            {items.map((s) => (
              <li
                key={s.membershipId}
                className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="type-body-medium">{s.fullName}</span>
                  <span className="type-caption text-fg-muted">{s.reason ?? '—'}</span>
                </div>
                <Badge tone="brand" className="ml-auto">
                  {s.pct}%
                </Badge>
                {isOwner ? (
                  <button
                    type="button"
                    className="type-body-medium text-danger"
                    disabled={busy}
                    onClick={() =>
                      confirm(`Hapus beasiswa ${s.fullName}?`) && save(s.membershipId, 0, '')
                    }
                  >
                    Hapus
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-6">
        {isOwner ? (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <h2 className="type-h2">Tetapkan beasiswa</h2>
            <Select
              label="Pemain"
              value={form.membershipId}
              onChange={(e) => setForm({ ...form, membershipId: e.target.value })}
              placeholder="Pilih pemain"
              options={players.map((p) => ({ value: p.membershipId, label: p.fullName }))}
            />
            <Input
              label="Potongan (%)"
              type="number"
              min={0}
              max={100}
              value={form.pct}
              onChange={(e) => setForm({ ...form, pct: e.target.value })}
            />
            <Input
              label="Alasan (opsional)"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Beasiswa prestasi"
            />
            <Alert tone="info">
              Berlaku untuk tagihan yang terbit berikutnya. Beasiswa 100% membuat tagihan langsung
              dibebaskan.
            </Alert>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" disabled={busy}>
              Simpan
            </Button>
          </form>
        ) : (
          <Alert tone="info">Beasiswa hanya bisa ditetapkan oleh owner klub.</Alert>
        )}
      </Card>
    </div>
  );
}
