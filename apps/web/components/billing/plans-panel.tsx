'use client';

import { FeePlanInputSchema, formatRupiah, type FeePlanDto } from '@sportgather/shared';
import { Alert, Badge, Button, Card, IconWallet, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

const KU_OPTIONS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

type Form = {
  name: string;
  kind: 'monthly' | 'registration';
  amount: string;
  issueDay: string;
  dueDays: string;
  kuGroups: number[];
  active: boolean;
};

const EMPTY: Form = {
  name: '',
  kind: 'monthly',
  amount: '',
  issueDay: '1',
  dueDays: '9',
  kuGroups: [],
  active: true,
};

function cycleText(p: FeePlanDto) {
  return p.kind === 'monthly'
    ? `per bulan · terbit tgl ${p.issueDay} · jatuh tempo ${p.dueDays} hari setelahnya`
    : `sekali per musim · jatuh tempo ${p.dueDays} hari setelah terbit`;
}

// A-13 · Paket iuran: daftar paket + formulir buat/ubah.
export function PlansPanel({ slug, plans }: { slug: string; plans: FeePlanDto[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(p: FeePlanDto) {
    setEditing(p.id);
    setErrors({});
    setError(null);
    setForm({
      name: p.name,
      kind: p.kind,
      amount: String(p.amount),
      issueDay: String(p.issueDay),
      dueDays: String(p.dueDays),
      kuGroups: p.kuGroups ?? [],
      active: p.active,
    });
  }

  function reset() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      kind: form.kind,
      amount: form.amount.replace(/\D/g, ''),
      issueDay: form.issueDay,
      dueDays: form.dueDays,
      kuGroups: form.kuGroups.length ? form.kuGroups : null,
      active: form.active,
    };
    const r = FeePlanInputSchema.safeParse(payload);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api(
      editing ? 'PATCH' : 'POST',
      `/orgs/${slug}/billing/plans${editing ? `/${editing}` : ''}`,
      r.data,
    );
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setNotice(editing ? 'Paket diperbarui. Berlaku untuk tagihan berikutnya.' : 'Paket dibuat.');
    reset();
    router.refresh();
  }

  async function issueRegistration(p: FeePlanDto) {
    if (!confirm(`Terbitkan "${p.name}" untuk pemain aktif yang belum ditagih musim ini?`)) return;
    const res = await api<{ created: number }>('POST', `/orgs/${slug}/billing/plans/${p.id}/issue`);
    setNotice(res.ok ? `${res.data.created} tagihan registrasi diterbitkan.` : res.message);
    router.refresh();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
      <div className="flex flex-col gap-4">
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {plans.length === 0 ? (
          <Card className="p-6 type-body text-fg-secondary">
            Belum ada paket. Buat paket iuran bulanan agar tagihan terbit otomatis.
          </Card>
        ) : null}
        {plans.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="type-h3">{p.name}</h3>
                <p className="type-caption text-fg-muted">{cycleText(p)}</p>
              </div>
              <span className="type-stat whitespace-nowrap">{formatRupiah(p.amount)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {p.kuGroups ? (
                p.kuGroups.map((k) => (
                  <Badge key={k} tone="brand">
                    KU{k}
                  </Badge>
                ))
              ) : (
                <Badge tone="brand">Semua KU</Badge>
              )}
              <Badge tone="neutral">{p.playerCount} pemain</Badge>
              <span className="ml-auto flex items-center gap-4">
                <Badge tone={p.active ? 'success' : 'neutral'}>
                  {p.active ? 'Aktif' : 'Nonaktif'}
                </Badge>
                {p.kind === 'registration' && p.active ? (
                  <button
                    type="button"
                    className="type-body-medium text-brand"
                    onClick={() => issueRegistration(p)}
                  >
                    Terbitkan
                  </button>
                ) : null}
                <button
                  type="button"
                  className="type-body-medium text-brand"
                  onClick={() => edit(p)}
                >
                  Edit
                </button>
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <h2 className="type-h2">{editing ? 'Ubah paket' : 'Buat paket baru'}</h2>
          <Input
            label="Nama paket"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Iuran Bulanan KU12–KU16"
            error={errors.name}
          />
          <Select
            label="Jenis"
            value={form.kind}
            disabled={Boolean(editing)}
            onChange={(e) => setForm({ ...form, kind: e.target.value as Form['kind'] })}
            options={[
              { value: 'monthly', label: 'Iuran bulanan' },
              { value: 'registration', label: 'Registrasi (sekali per musim)' },
            ]}
          />
          <Input
            label="Nominal (Rp)"
            inputMode="numeric"
            value={
              form.amount ? Number(form.amount.replace(/\D/g, '')).toLocaleString('id-ID') : ''
            }
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })}
            placeholder="350.000"
            error={errors.amount}
          />
          <div className="grid grid-cols-2 gap-3">
            {form.kind === 'monthly' ? (
              <Input
                label="Terbit tanggal"
                type="number"
                min={1}
                max={28}
                value={form.issueDay}
                onChange={(e) => setForm({ ...form, issueDay: e.target.value })}
                error={errors.issueDay}
              />
            ) : null}
            <Input
              label="Jatuh tempo (hari)"
              type="number"
              min={0}
              max={60}
              value={form.dueDays}
              onChange={(e) => setForm({ ...form, dueDays: e.target.value })}
              error={errors.dueDays}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 type-caption-bold">Berlaku untuk</legend>
            <div className="flex flex-wrap gap-2">
              {KU_OPTIONS.map((k) => {
                const on = form.kuGroups.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setForm({
                        ...form,
                        kuGroups: on ? form.kuGroups.filter((x) => x !== k) : [...form.kuGroups, k],
                      })
                    }
                    className={
                      on
                        ? 'rounded-full bg-brand px-3 py-[6px] type-caption-bold text-fg-inverse'
                        : 'rounded-full border border-line px-3 py-[6px] type-caption-bold'
                    }
                  >
                    KU{k}
                  </button>
                );
              })}
            </div>
            <span className="type-caption text-fg-muted">
              {form.kuGroups.length ? `${form.kuGroups.length} KU dipilih` : 'Kosong = semua KU'}
            </span>
          </fieldset>
          {editing ? (
            <label className="flex items-center gap-2 type-body">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Paket aktif
            </label>
          ) : null}
          <Alert tone="info" icon={IconWallet}>
            Satu pemain hanya punya satu paket iuran bulanan aktif. Paket untuk KU tertentu
            didahulukan dari paket semua KU.
          </Alert>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={reset}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan paket'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
