'use client';

import { UpdatePlayerSchema, type PlayerDetail } from '@sportgather/shared';
import { Alert, Button, Dialog, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

export function EditPlayerDialog({ slug, player }: { slug: string; player: PlayerDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const editableStatus =
    player.status === 'active' || player.status === 'on_leave' || player.status === 'left';
  const initial = {
    fullName: player.fullName,
    birthDate: player.birthDate ?? '',
    gender: player.gender ?? '',
    school: player.school ?? '',
    emergencyContactName: player.emergencyContactName ?? '',
    emergencyContactPhone: player.emergencyContactPhone ?? '',
    status: player.status,
    statusReason: player.statusReason ?? '',
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      fullName: form.fullName,
      ...(form.birthDate ? { birthDate: form.birthDate } : {}),
      ...(form.gender ? { gender: form.gender } : {}),
      school: form.school || null,
      emergencyContactName: form.emergencyContactName || null,
      emergencyContactPhone: form.emergencyContactPhone || null,
      ...(editableStatus
        ? {
            status: form.status,
            statusReason: form.status === 'active' ? null : form.statusReason || null,
          }
        : {}),
    };
    const r = UpdatePlayerSchema.safeParse(payload);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api('PATCH', `/orgs/${slug}/players/${player.membershipId}`, payload);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setForm(initial);
          setError(null);
          setOpen(true);
        }}
      >
        Edit data
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit data pemain">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Input
            label="Nama lengkap"
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
            />
          </div>
          <Input
            label="Sekolah"
            value={form.school}
            onChange={(e) => setForm({ ...form, school: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Kontak darurat"
              value={form.emergencyContactName}
              onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
            />
            <Input
              label="No. kontak darurat"
              type="tel"
              value={form.emergencyContactPhone}
              onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
              error={errors.emergencyContactPhone}
            />
          </div>
          {editableStatus ? (
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Status"
                value={form.status}
                options={[
                  { value: 'active', label: 'Aktif' },
                  { value: 'on_leave', label: 'Cuti (tidak ditagih)' },
                  { value: 'left', label: 'Keluar' },
                ]}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              />
              {form.status !== 'active' ? (
                <Input
                  label="Alasan"
                  placeholder="mis. cedera"
                  value={form.statusReason}
                  onChange={(e) => setForm({ ...form, statusReason: e.target.value })}
                />
              ) : null}
            </div>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
