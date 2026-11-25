'use client';

import { SeasonInputSchema, type SeasonDto } from '@sportgather/shared';
import { Alert, Button, Card, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

const ALL_GROUPS = [7, 8, 10, 12, 14, 16];

/** Buat/ubah musim: nama, tanggal, aturan KU, kelompok (KU7 opsional — keputusan Q1). */
export function SeasonForm({
  slug,
  season,
  onDone,
}: {
  slug: string;
  season?: SeasonDto;
  onDone?: () => void;
}) {
  const router = useRouter();
  const year = new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0);
  const [form, setForm] = useState({
    name: season?.name ?? `Musim ${year}`,
    startsOn: season?.startsOn ?? `${year}-01-01`,
    endsOn: season?.endsOn ?? `${year}-12-31`,
    kuRule: season?.kuRule ?? 'MAX_N',
    kuGroups: season?.kuGroups ?? [8, 10, 12, 14, 16],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = SeasonInputSchema.safeParse(form);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = season
      ? await api('PUT', `/orgs/${slug}/seasons/${season.id}`, form)
      : await api('POST', `/orgs/${slug}/seasons`, form);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone?.();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Input
        label="Nama musim"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        error={errors.name}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Mulai"
          type="date"
          value={form.startsOn}
          onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
          error={errors.startsOn}
        />
        <Input
          label="Selesai"
          type="date"
          value={form.endsOn}
          onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
          error={errors.endsOn}
        />
      </div>
      <Select
        label="Aturan KU"
        value={form.kuRule}
        options={[
          { value: 'MAX_N', label: 'KU-N = usia maksimal N tahun (default)' },
          { value: 'UNDER_N', label: 'KU-N = usia di bawah N tahun' },
        ]}
        onChange={(e) => setForm({ ...form, kuRule: e.target.value as 'MAX_N' })}
      />
      <fieldset>
        <legend className="mb-2 type-caption-bold text-fg-secondary">Kelompok umur</legend>
        <div className="flex flex-wrap gap-3">
          {ALL_GROUPS.map((g) => (
            <label key={g} className="flex items-center gap-2 type-body">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-brand)]"
                checked={form.kuGroups.includes(g)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kuGroups: e.target.checked
                      ? [...form.kuGroups, g].sort((a, b) => a - b)
                      : form.kuGroups.filter((x) => x !== g),
                  })
                }
              />
              KU{g}
              {g === 7 ? <span className="type-caption text-fg-muted">(opsional)</span> : null}
            </label>
          ))}
        </div>
        {errors.kuGroups ? (
          <p className="mt-1 type-caption text-danger">{errors.kuGroups}</p>
        ) : null}
      </fieldset>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" className="self-start" disabled={busy}>
        {busy ? 'Menyimpan…' : season ? 'Simpan musim' : 'Buat musim'}
      </Button>
    </form>
  );
}

export function SeasonSetup({ slug }: { slug: string }) {
  return (
    <Card className="max-w-2xl p-6">
      <h2 className="mb-1 type-h2">Buat musim pertama</h2>
      <p className="mb-4 type-body text-fg-secondary">
        Musim menjadi dasar tim, jadwal, dan tagihan. Tambahkan kompetisi utama setelahnya sebagai
        acuan KU.
      </p>
      <SeasonForm slug={slug} />
    </Card>
  );
}
