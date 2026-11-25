'use client';

import {
  CompetitionInputSchema,
  formatTanggalIso,
  kuLabel,
  type CompetitionDto,
  type KuChangeDto,
  type SeasonDto,
} from '@sportgather/shared';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  IconCalendar,
  IconLayers,
  Input,
} from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';
import { SeasonForm } from './season-setup';

const RULE_TEXT = {
  MAX_N: 'KU-N = usia maksimal N tahun pada tanggal acuan',
  UNDER_N: 'KU-N = di bawah N tahun pada tanggal acuan',
};

type Draft = {
  id: string | null;
  name: string;
  organizer: string;
  kind: string;
  referenceDate: string;
  kuGroups: number[];
  isPrimary: boolean;
};

// A-05 · Musim & kompetisi
export function SeasonCompetitions({ slug, season }: { slug: string; season: SeasonDto }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [changes, setChanges] = useState<KuChangeDto[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const primary = season.competitions.find((c) => c.isPrimary);

  function open(c?: CompetitionDto) {
    setErrors({});
    setError(null);
    setChanges(null);
    setEditing(
      c
        ? {
            id: c.id,
            name: c.name,
            organizer: c.organizer ?? '',
            kind: c.kind,
            referenceDate: c.referenceDate,
            kuGroups: c.kuGroups,
            isPrimary: c.isPrimary,
          }
        : {
            id: null,
            name: '',
            organizer: '',
            kind: 'Liga',
            referenceDate: '',
            kuGroups: season.kuGroups,
            isPrimary: !primary,
          },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const payload = { ...editing, organizer: editing.organizer || undefined };
    const r = CompetitionInputSchema.safeParse(payload);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    // US-05: tampilkan dulu pemain yang KU-nya berubah sebelum disimpan.
    const affectsTraining =
      editing.isPrimary || (editing.id !== null && editing.id === primary?.id);
    if (affectsTraining && changes === null) {
      const prev = await api<KuChangeDto[]>('POST', `/orgs/${slug}/competitions/preview`, {
        competitionId: editing.id === primary?.id ? editing.id : null,
        referenceDate: editing.referenceDate,
      });
      if (prev.ok && prev.data.length > 0) return setChanges(prev.data);
    }
    setBusy(true);
    const { id, ...body } = payload;
    const res = id
      ? await api('PUT', `/orgs/${slug}/competitions/${id}`, body)
      : await api('POST', `/orgs/${slug}/seasons/${season.id}/competitions`, body);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setEditing(null);
    setChanges(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm('Hapus kompetisi ini?')) return;
    const res = await api('DELETE', `/orgs/${slug}/competitions/${id}`);
    if (!res.ok) return setError(res.message);
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button onClick={() => open()}>Tambah kompetisi</Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col gap-2 p-5">
          <div className="flex items-center justify-between">
            <span className="type-caption-bold text-fg-secondary">Musim aktif</span>
            <Badge tone="success">Aktif</Badge>
          </div>
          <p className="type-h1">{season.name}</p>
          <p className="type-body-sm text-fg-secondary">
            {formatTanggalIso(season.startsOn)} – {formatTanggalIso(season.endsOn)} ·{' '}
            {season.teamCount} tim · {season.playerCount} pemain
          </p>
          <button
            type="button"
            className="self-start type-body-sm text-brand"
            onClick={() => setSeasonOpen(true)}
          >
            Ubah musim
          </button>
        </Card>
        <Card className="flex flex-col gap-2 p-5">
          <span className="type-caption-bold text-fg-secondary">
            Kompetisi utama (acuan KU latihan rutin)
          </span>
          <p className="type-h3">{primary?.name ?? 'Belum ada — cadangan 31 Desember'}</p>
          <p className="flex items-center gap-2 type-body text-fg-secondary">
            <IconCalendar size={18} className="text-brand" /> Tanggal acuan:{' '}
            {formatTanggalIso(season.referenceDate, true)}
          </p>
        </Card>
        <Card className="flex flex-col gap-2 p-5">
          <span className="type-caption-bold text-fg-secondary">Aturan KU</span>
          <ul className="flex flex-col gap-1 type-body-sm">
            <li>• {RULE_TEXT[season.kuRule]}</li>
            <li>• Kelompok: {season.kuGroups.map((g) => `KU${g}`).join(', ')}</li>
            <li>• Tanpa kompetisi: cadangan 31 Desember</li>
          </ul>
        </Card>
      </div>

      <h2 className="type-h2">Kompetisi musim ini</h2>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="border-b border-line bg-canvas/60 type-caption-bold text-fg-secondary">
            <tr>
              <th className="px-4 py-3">Kompetisi</th>
              <th className="px-4 py-3">Penyelenggara</th>
              <th className="px-4 py-3">Tanggal kompetisi (acuan KU)</th>
              <th className="px-4 py-3">KU diikuti</th>
              <th className="px-4 py-3">Tim</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {season.competitions.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas/50"
                onClick={() => open(c)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} size={32} />
                    <div>
                      <p className="type-body-medium">{c.name}</p>
                      <p className="type-caption text-fg-muted">{c.kind}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 type-body">{c.organizer ?? '—'}</td>
                <td className="px-4 py-3 type-body">{formatTanggalIso(c.referenceDate)}</td>
                <td className="px-4 py-3 type-body">
                  {c.kuGroups.map((g) => `KU${g}`).join(' · ')}
                </td>
                <td className="px-4 py-3 type-body">{c.teamCount}</td>
                <td className="px-4 py-3">
                  {c.isPrimary ? (
                    <Badge tone="brand">Utama</Badge>
                  ) : (
                    <Badge tone="neutral">Aktif</Badge>
                  )}
                </td>
              </tr>
            ))}
            {season.competitions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center type-body text-fg-secondary">
                  Belum ada kompetisi. Tambahkan kompetisi utama sebagai acuan KU.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
      {error && !editing ? <Alert tone="danger">{error}</Alert> : null}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Ubah kompetisi' : 'Tambah kompetisi'}
      >
        {editing ? (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Nama kompetisi"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              error={errors.name}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Penyelenggara"
                value={editing.organizer}
                onChange={(e) => setEditing({ ...editing, organizer: e.target.value })}
              />
              <Input
                label="Jenis"
                placeholder="Liga / Turnamen / Festival"
                value={editing.kind}
                onChange={(e) => setEditing({ ...editing, kind: e.target.value })}
              />
            </div>
            <Input
              label="Tanggal kompetisi (acuan KU)"
              type="date"
              value={editing.referenceDate}
              onChange={(e) => {
                setChanges(null);
                setEditing({ ...editing, referenceDate: e.target.value });
              }}
              error={errors.referenceDate}
            />
            <fieldset>
              <legend className="mb-2 type-caption-bold text-fg-secondary">KU diikuti</legend>
              <div className="flex flex-wrap gap-3">
                {season.kuGroups.map((g) => (
                  <label key={g} className="flex items-center gap-2 type-body">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-brand)]"
                      checked={editing.kuGroups.includes(g)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          kuGroups: e.target.checked
                            ? [...editing.kuGroups, g]
                            : editing.kuGroups.filter((x) => x !== g),
                        })
                      }
                    />
                    KU{g}
                  </label>
                ))}
              </div>
              {errors.kuGroups ? (
                <p className="mt-1 type-caption text-danger">{errors.kuGroups}</p>
              ) : null}
            </fieldset>
            <label className="flex items-center gap-2 type-body">
              <input
                type="checkbox"
                className="size-4"
                checked={editing.isPrimary}
                onChange={(e) => {
                  setChanges(null);
                  setEditing({ ...editing, isPrimary: e.target.checked });
                }}
              />
              Jadikan kompetisi utama (acuan KU latihan rutin)
            </label>
            {changes ? (
              <Alert tone="warning" icon={IconLayers}>
                <p className="type-body-medium">
                  {changes.length} pemain pindah KU dengan tanggal acuan ini. Tinjau sebelum
                  disimpan:
                </p>
                <ul className="mt-2 max-h-40 overflow-y-auto">
                  {changes.map((c) => (
                    <li key={c.membershipId}>
                      {c.fullName}: {kuLabel(c.from)} → {kuLabel(c.to)}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div className="flex gap-3">
              {editing.id ? (
                <Button variant="danger" onClick={() => void remove(editing.id!)}>
                  Hapus
                </Button>
              ) : null}
              <Button type="submit" className="ml-auto" disabled={busy}>
                {busy
                  ? 'Menyimpan…'
                  : changes
                    ? `Simpan & ubah KU ${changes.length} pemain`
                    : 'Simpan'}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>

      <Dialog open={seasonOpen} onClose={() => setSeasonOpen(false)} title="Ubah musim">
        <SeasonForm slug={slug} season={season} onDone={() => setSeasonOpen(false)} />
      </Dialog>
    </div>
  );
}
