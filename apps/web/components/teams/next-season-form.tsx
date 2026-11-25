'use client';

import { NewSeasonSchema } from '@sportgather/shared';
import { Alert, Button, Card, Input } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

export function NextSeasonForm({
  slug,
  kuGroups,
  suggestedYear,
}: {
  slug: string;
  kuGroups: number[];
  suggestedYear: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: `Musim ${suggestedYear}`,
    startsOn: `${suggestedYear}-01-01`,
    endsOn: `${suggestedYear}-12-31`,
    competitionName: '',
    referenceDate: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      startsOn: form.startsOn,
      endsOn: form.endsOn,
      ...(form.competitionName && form.referenceDate
        ? {
            competition: {
              name: form.competitionName,
              referenceDate: form.referenceDate,
              kuGroups,
            },
          }
        : {}),
    };
    const r = NewSeasonSchema.safeParse(payload);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api('POST', `/orgs/${slug}/promotion/season`, payload);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  return (
    <Card className="max-w-2xl p-6">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <h2 className="type-h2">Siapkan musim baru</h2>
        <p className="type-body text-fg-secondary">
          Isi kompetisi utama musim baru sebagai acuan KU. Tanpa kompetisi, acuan memakai 31
          Desember.
        </p>
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
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Kompetisi utama (opsional)"
            placeholder="Liga Basket Pelajar 2028"
            value={form.competitionName}
            onChange={(e) => setForm({ ...form, competitionName: e.target.value })}
          />
          <Input
            label="Tanggal kompetisi (acuan KU)"
            type="date"
            value={form.referenceDate}
            onChange={(e) => setForm({ ...form, referenceDate: e.target.value })}
          />
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" className="self-start" disabled={busy}>
          {busy ? 'Menyiapkan…' : 'Lihat usulan kenaikan KU'}
        </Button>
      </form>
    </Card>
  );
}
