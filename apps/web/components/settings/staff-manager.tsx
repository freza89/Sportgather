'use client';

import {
  ROLE_LABEL,
  assignableRoles,
  InviteStaffSchema,
  formatPhone,
  type StaffDto,
  type StaffRole,
} from '@sportgather/shared';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  IconMore,
  Input,
  Select,
  type BadgeTone,
} from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

const ROLE_TONE: Record<StaffRole, BadgeTone> = {
  owner: 'brand',
  admin: 'info',
  coach: 'neutral',
  team_manager: 'neutral',
};

/** A-03 · Staf & peran: tabel staf + undang + ubah peran / hapus. */
export function StaffManager({
  slug,
  staff,
  actorRole,
  actorPersonId,
}: {
  slug: string;
  staff: StaffDto[];
  actorRole: StaffRole;
  actorPersonId: string;
}) {
  const router = useRouter();
  const roles = assignableRoles(actorRole);
  const roleOptions = roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    role: roles.includes('coach') ? 'coach' : (roles[0] ?? ''),
  });
  const [manage, setManage] = useState<StaffDto | null>(null);
  const [newRole, setNewRole] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = (s: StaffDto) =>
    s.personId !== actorPersonId &&
    (actorRole === 'owner' || (s.role !== 'owner' && s.role !== 'admin'));

  async function invite(e: FormEvent) {
    e.preventDefault();
    const r = InviteStaffSchema.safeParse(form);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api<StaffDto>('POST', `/orgs/${slug}/staff`, form);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setInviteOpen(false);
    setNotice(`Undangan terkirim ke WhatsApp ${formatPhone(res.data.phone ?? '')}.`);
    setForm({ ...form, fullName: '', phone: '' });
    router.refresh();
  }

  async function changeRole() {
    if (!manage) return;
    setBusy(true);
    const res = await api('PATCH', `/orgs/${slug}/staff/${manage.id}`, { role: newRole });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setManage(null);
    router.refresh();
  }

  async function remove() {
    if (!manage || !window.confirm(`Hapus ${manage.fullName} dari staf klub?`)) return;
    setBusy(true);
    const res = await api('DELETE', `/orgs/${slug}/staff/${manage.id}`);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setManage(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setErrors({});
            setError(null);
            setInviteOpen(true);
          }}
        >
          Undang staf
        </Button>
      </div>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="border-b border-line bg-canvas/60 type-caption-bold text-fg-secondary">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Peran</th>
              <th className="px-4 py-3">Tim</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.fullName} size={32} />
                    <div>
                      <p className="type-body-medium">{s.fullName}</p>
                      <p className="type-caption text-fg-muted">
                        {s.phone ? formatPhone(s.phone) : '—'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={ROLE_TONE[s.role as StaffRole]}>
                    {ROLE_LABEL[s.role as StaffRole]}
                  </Badge>
                </td>
                <td className="px-4 py-3 type-body text-fg-secondary">
                  {s.role === 'owner' || s.role === 'admin' ? 'Semua' : '—'}
                </td>
                <td className="px-4 py-3">
                  {s.status === 'invited' ? (
                    <Badge tone="warning">Undangan terkirim</Badge>
                  ) : (
                    <Badge tone="success">Aktif</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage(s) ? (
                    <button
                      type="button"
                      aria-label={`Kelola ${s.fullName}`}
                      className="rounded-control p-1 text-fg-muted hover:bg-canvas hover:text-fg"
                      onClick={() => {
                        setError(null);
                        setNewRole(s.role);
                        setManage(s);
                      }}
                    >
                      <IconMore size={20} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Undang staf"
        description="Undangan dikirim lewat WhatsApp dan berlaku 7 hari."
      >
        <form onSubmit={invite} className="flex flex-col gap-4" noValidate>
          <Input
            label="Nama lengkap"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            error={errors.fullName}
          />
          <Input
            label="Nomor WhatsApp"
            type="tel"
            placeholder="0812-3456-7890"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            error={errors.phone}
          />
          <Select
            label="Peran"
            value={form.role}
            options={roleOptions}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          />
          <p className="type-caption text-fg-muted">
            Penugasan pelatih ke tim tertentu diatur setelah tim dibuat (Tim & KU).
          </p>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Mengirim…' : 'Kirim undangan'}
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={manage !== null}
        onClose={() => setManage(null)}
        title={manage ? `Kelola ${manage.fullName}` : ''}
      >
        {manage ? (
          <div className="flex flex-col gap-4">
            <Select
              label="Peran"
              value={newRole}
              options={roleOptions}
              onChange={(e) => setNewRole(e.target.value)}
            />
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div className="flex gap-3">
              <Button variant="danger" onClick={() => void remove()} disabled={busy}>
                Hapus dari staf
              </Button>
              <Button
                className="ml-auto"
                onClick={() => void changeRole()}
                disabled={busy || newRole === manage.role}
              >
                Simpan peran
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
