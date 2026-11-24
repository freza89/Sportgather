'use client';

import {
  BranchInputSchema,
  ZONA_WAKTU,
  type BranchDto,
  type BranchInput,
  type ZonaWaktu,
} from '@sportgather/shared';
import { Alert, Button, Card, Dialog, IconPin, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

const TZ_OPTIONS = Object.entries(ZONA_WAKTU).map(([value, label]) => ({ value, label }));
const EMPTY: BranchInput = { name: '', address: '', timezone: 'Asia/Jakarta', courts: 1 };

export function BranchesCard({
  slug,
  branches,
  canEdit,
}: {
  slug: string;
  branches: BranchDto[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; value: BranchInput } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const r = BranchInputSchema.safeParse(editing.value);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = editing.id
      ? await api('PUT', `/orgs/${slug}/branches/${editing.id}`, editing.value)
      : await api('POST', `/orgs/${slug}/branches`, editing.value);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setEditing(null);
    router.refresh();
  }

  async function archive(id: string) {
    if (!window.confirm('Hapus lokasi ini dari daftar?')) return;
    const res = await api('DELETE', `/orgs/${slug}/branches/${id}`);
    if (!res.ok) return setError(res.message);
    setEditing(null);
    router.refresh();
  }

  const set = (patch: Partial<BranchInput>) =>
    editing && setEditing({ ...editing, value: { ...editing.value, ...patch } });

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="type-h3">Lokasi latihan</h2>
        {canEdit ? (
          <Button
            variant="ghost"
            onClick={() => {
              setErrors({});
              setError(null);
              setEditing({ id: null, value: EMPTY });
            }}
          >
            Tambah
          </Button>
        ) : null}
      </div>
      {error && !editing ? <Alert tone="danger">{error}</Alert> : null}
      <ul className="flex flex-col gap-3">
        {branches.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => {
                setErrors({});
                setError(null);
                setEditing({
                  id: b.id,
                  value: {
                    name: b.name,
                    address: b.address,
                    timezone: b.timezone,
                    courts: b.courts,
                  },
                });
              }}
              className="flex w-full items-center gap-3 rounded-control bg-canvas px-4 py-3 text-left enabled:hover:bg-brand-tint"
            >
              <IconPin size={20} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block truncate type-body-medium">{b.name}</span>
                <span className="block truncate type-caption text-fg-muted">
                  {b.address} · {b.courts} lapangan ·{' '}
                  {ZONA_WAKTU[b.timezone as ZonaWaktu] ?? b.timezone}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Ubah lokasi' : 'Tambah lokasi latihan'}
      >
        {editing ? (
          <form onSubmit={save} className="flex flex-col gap-4" noValidate>
            <Input
              label="Nama lokasi"
              value={editing.value.name}
              onChange={(e) => set({ name: e.target.value })}
              error={errors.name}
            />
            <Input
              label="Alamat"
              value={editing.value.address}
              onChange={(e) => set({ address: e.target.value })}
              error={errors.address}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Zona waktu"
                value={editing.value.timezone}
                options={TZ_OPTIONS}
                onChange={(e) => set({ timezone: e.target.value })}
              />
              <Input
                label="Jumlah lapangan"
                type="number"
                min={1}
                value={String(editing.value.courts ?? 1)}
                onChange={(e) => set({ courts: Number(e.target.value) })}
                error={errors.courts}
              />
            </div>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div className="flex gap-3">
              {editing.id ? (
                <Button variant="danger" onClick={() => void archive(editing.id!)} disabled={busy}>
                  Hapus
                </Button>
              ) : null}
              <Button type="submit" className="ml-auto" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </Card>
  );
}
