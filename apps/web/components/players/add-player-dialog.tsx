'use client';

import { ManualPlayerSchema, RELATION_LABEL, type PlayerDetail } from '@sportgather/shared';
import { Alert, Button, Dialog, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

const EMPTY = {
  fullName: '',
  birthDate: '',
  gender: '',
  school: '',
  guardian: { fullName: '', phone: '', relation: 'mother' },
};

export function AddPlayerDialog({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { ...form, school: form.school || undefined };
    const r = ManualPlayerSchema.safeParse(payload);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api<PlayerDetail>('POST', `/orgs/${slug}/players`, payload);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    setForm(EMPTY);
    router.push(`/admin/${slug}/pemain/${res.data.membershipId}`);
  }

  return (
    <>
      <Button
        onClick={() => {
          setError(null);
          setErrors({});
          setOpen(true);
        }}
      >
        Tambah pemain
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Tambah pemain"
        description="Dokumen usia bisa diunggah wali atau admin kemudian."
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Input
            label="Nama lengkap anak"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            error={errors.fullName}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tanggal lahir"
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              error={errors.birthDate}
            />
            <Select
              label="Gender"
              value={form.gender}
              placeholder="Pilih"
              options={[
                { value: 'male', label: 'Laki-laki' },
                { value: 'female', label: 'Perempuan' },
              ]}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              error={errors.gender}
            />
          </div>
          <Input
            label="Sekolah (opsional)"
            value={form.school}
            onChange={(e) => setForm({ ...form, school: e.target.value })}
          />
          <fieldset className="flex flex-col gap-4 rounded-control bg-canvas p-4">
            <legend className="type-h3">Wali utama</legend>
            <Input
              label="Nama wali"
              value={form.guardian.fullName}
              onChange={(e) =>
                setForm({ ...form, guardian: { ...form.guardian, fullName: e.target.value } })
              }
              error={errors['guardian.fullName']}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="WhatsApp wali"
                type="tel"
                value={form.guardian.phone}
                onChange={(e) =>
                  setForm({ ...form, guardian: { ...form.guardian, phone: e.target.value } })
                }
                error={errors['guardian.phone']}
              />
              <Select
                label="Hubungan"
                value={form.guardian.relation}
                options={Object.entries(RELATION_LABEL).map(([value, label]) => ({ value, label }))}
                onChange={(e) =>
                  setForm({ ...form, guardian: { ...form.guardian, relation: e.target.value } })
                }
              />
            </div>
          </fieldset>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan pemain'}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
