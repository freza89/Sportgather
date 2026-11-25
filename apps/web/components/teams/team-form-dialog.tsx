'use client';

import {
  ROLE_LABEL,
  TEAM_LEVELS,
  TeamInputSchema,
  type BranchDto,
  type StaffDto,
  type StaffRole,
  type TeamSummary,
} from '@sportgather/shared';
import { Alert, Button, Dialog, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

export function TeamFormDialog({
  slug,
  kuGroups,
  staff,
  branches,
  team,
  triggerLabel,
  triggerVariant = 'primary',
}: {
  slug: string;
  kuGroups: number[];
  staff: StaffDto[];
  branches: BranchDto[];
  team?: TeamSummary;
  /** Teks tombol pemicu (prop serializable: dialog ini dipakai dari Server Component). */
  triggerLabel: string;
  triggerVariant?: 'primary' | 'secondary';
}) {
  const router = useRouter();
  const coachesOptions = staff.filter((s) => s.role === 'coach' || s.role === 'team_manager');
  const initial = {
    ku: team?.ku ?? kuGroups[0] ?? 8,
    level: team?.level ?? 'Development',
    gender: team?.gender ?? 'mixed',
    name: team?.name ?? '',
    branchId: branches.find((b) => b.name === team?.branchName)?.id ?? branches[0]?.id ?? '',
    staffRoleIds: team?.coaches.map((c) => c.staffRoleId) ?? [],
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      ku: Number(form.ku),
      name: form.name || undefined,
      branchId: form.branchId || null,
    };
    const r = TeamInputSchema.safeParse(payload);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = team
      ? await api('PUT', `/orgs/${slug}/teams/${team.id}`, payload)
      : await api<TeamSummary>('POST', `/orgs/${slug}/teams`, payload);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant={triggerVariant}
        onClick={() => {
          setForm(initial);
          setError(null);
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={team ? `Ubah ${team.name}` : 'Buat tim'}
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Kelompok umur"
              value={String(form.ku)}
              options={kuGroups.map((k) => ({ value: String(k), label: `KU${k}` }))}
              onChange={(e) => setForm({ ...form, ku: Number(e.target.value) })}
            />
            <Select
              label="Level"
              value={form.level}
              options={TEAM_LEVELS.map((l) => ({ value: l, label: l }))}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Gender"
              value={form.gender}
              options={[
                { value: 'mixed', label: 'Campuran' },
                { value: 'male', label: 'Putra' },
                { value: 'female', label: 'Putri' },
              ]}
              onChange={(e) => setForm({ ...form, gender: e.target.value as 'mixed' })}
            />
            <Select
              label="Lokasi latihan"
              value={form.branchId}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            />
          </div>
          <Input
            label="Nama tim (opsional)"
            placeholder={`KU${form.ku} ${form.level}`}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 type-caption-bold text-fg-secondary">
              Pelatih / team manager
            </legend>
            {coachesOptions.length === 0 ? (
              <p className="type-body-sm text-fg-muted">
                Belum ada pelatih. Undang di Pengaturan › Staf & peran.
              </p>
            ) : null}
            {coachesOptions.map((s) => (
              <label key={s.id} className="flex items-center gap-2 type-body">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-brand)]"
                  checked={form.staffRoleIds.includes(s.id)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      staffRoleIds: e.target.checked
                        ? [...form.staffRoleIds, s.id]
                        : form.staffRoleIds.filter((x) => x !== s.id),
                    })
                  }
                />
                {s.fullName}{' '}
                <span className="type-caption text-fg-muted">
                  · {ROLE_LABEL[s.role as StaffRole]}
                  {s.status === 'invited' ? ' (diundang)' : ''}
                </span>
              </label>
            ))}
          </fieldset>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : team ? 'Simpan' : 'Buat tim'}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
