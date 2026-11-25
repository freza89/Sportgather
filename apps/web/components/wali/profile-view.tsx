'use client';

import { formatPhone, kuLabel, type GuardianProfile } from '@sportgather/shared';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  IconChevron,
  IconLogout,
  Input,
} from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LogoutButton } from '@/components/auth/logout-button';
import { api } from '@/lib/api-client';
import { disablePush, enablePush, pushSupported } from '@/lib/push';

function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-0">
      <span className="flex flex-col">
        <span className="type-body">{label}</span>
        <span className="type-caption text-fg-muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-brand peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-brand after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

// O-08 · Profil, anak saya, privasi & data
export function ProfileView({ profile }: { profile: GuardianProfile }) {
  const router = useRouter();
  const [p, setP] = useState(profile);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(
    null,
  );
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(profile.fullName);
  const [child, setChild] = useState<GuardianProfile['children'][number] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function patchProfile(body: { fullName?: string; notifyWhatsapp?: boolean }) {
    const r = await api<GuardianProfile>('PATCH', '/me/profile', body);
    if (!r.ok) return setMsg({ tone: 'danger', text: r.message });
    setP(r.data);
    router.refresh();
  }

  async function photo(membershipId: string, photoPublic: boolean) {
    const set = (v: boolean) =>
      setP((cur) => ({
        ...cur,
        children: cur.children.map((c) =>
          c.membershipId === membershipId ? { ...c, photoPublic: v } : c,
        ),
      }));
    set(photoPublic); // optimis; dikembalikan bila gagal
    const r = await api('PATCH', `/me/children/${membershipId}/photo-consent`, { photoPublic });
    if (!r.ok) {
      set(!photoPublic);
      setMsg({ tone: 'danger', text: r.message });
    }
  }

  async function togglePush(on: boolean) {
    setBusy(true);
    if (on) {
      const r = await enablePush();
      if (!r.ok) setMsg({ tone: 'danger', text: r.message });
      else setP({ ...p, pushEnabled: true });
    } else {
      await disablePush();
      setP({ ...p, pushEnabled: false });
    }
    setBusy(false);
  }

  async function requestDelete() {
    if (!child) return;
    setBusy(true);
    const r = await api(
      'POST',
      `/me/children/${child.membershipId}/delete-request`,
      reason ? { reason } : {},
    );
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'danger', text: r.message });
    setP({
      ...p,
      children: p.children.map((c) =>
        c.membershipId === child.membershipId ? { ...c, deletionRequested: true } : c,
      ),
    });
    setMsg({
      tone: 'success',
      text: `Permintaan hapus data ${child.fullName} dikirim ke admin klub.`,
    });
    setChild(null);
    setReason('');
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex items-center gap-4 p-4">
        <Avatar name={p.fullName} size={52} />
        <span className="flex flex-1 flex-col">
          <span className="type-h3">{p.fullName}</span>
          <span className="type-caption text-fg-muted">{p.phone ? formatPhone(p.phone) : '—'}</span>
        </span>
        <button
          type="button"
          className="type-body-medium text-brand"
          onClick={() => setEditName(true)}
        >
          Edit
        </button>
      </Card>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}

      <section className="flex flex-col gap-2">
        <h2 className="type-caption-bold text-fg-secondary">Anak saya</h2>
        <Card className="overflow-hidden">
          {p.children.map((c) => (
            <div
              key={c.membershipId}
              className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0"
            >
              <Avatar name={c.fullName} size={36} />
              <span className="flex flex-1 flex-col">
                <span className="type-body">{c.fullName}</span>
                <span className="type-caption text-fg-muted">
                  {[
                    c.teamName ?? (c.ku ? kuLabel(c.ku) : null),
                    c.ageVerified ? 'usia terverifikasi' : 'usia belum diverifikasi',
                    c.orgName,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {c.deletionRequested ? <Badge tone="warning">Hapus diproses</Badge> : null}
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="type-caption-bold text-fg-secondary">Privasi & notifikasi</h2>
        <Card className="overflow-hidden">
          {p.children.map((c) => (
            <Switch
              key={c.membershipId}
              checked={c.photoPublic}
              onChange={(v) => photo(c.membershipId, v)}
              label={`Izin publikasi foto ${c.fullName.split(' ')[0]}`}
              hint="Foto tidak tampil publik bila nonaktif"
            />
          ))}
          <Switch
            checked={p.notifyWhatsapp}
            onChange={(v) => patchProfile({ notifyWhatsapp: v })}
            label="Notifikasi WhatsApp"
            hint="Pengingat jadwal & tagihan, pengumuman, rapor. Kode masuk, kuitansi, dan perubahan jadwal mendadak tetap dikirim."
          />
          <Switch
            checked={p.pushEnabled}
            disabled={busy || (typeof window !== 'undefined' && !pushSupported())}
            onChange={togglePush}
            label="Notifikasi aplikasi"
            hint="Untuk HP ini (pasang aplikasi ke layar utama dulu)"
          />
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="type-caption-bold text-fg-secondary">Data anak</h2>
        <Card className="overflow-hidden">
          {p.children.map((c) => (
            <a
              key={c.membershipId}
              href={`/api/me/children/${c.membershipId}/export`}
              className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"
            >
              <span className="flex flex-col">
                <span className="type-body">Unduh data {c.fullName.split(' ')[0]}</span>
                <span className="type-caption text-fg-muted">Salinan data pribadi (PDF)</span>
              </span>
              <IconChevron size={18} />
            </a>
          ))}
          {p.children
            .filter((c) => !c.deletionRequested)
            .map((c) => (
              <button
                key={c.membershipId}
                type="button"
                onClick={() => setChild(c)}
                className="flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left last:border-0"
              >
                <span className="flex flex-col">
                  <span className="type-body text-danger">
                    Minta hapus data {c.fullName.split(' ')[0]}
                  </span>
                  <span className="type-caption text-fg-muted">
                    Diproses admin klub sesuai kebijakan retensi
                  </span>
                </span>
                <IconChevron size={18} />
              </button>
            ))}
        </Card>
      </section>

      <LogoutButton className="flex items-center justify-center gap-2 py-3 type-body-medium text-danger">
        <IconLogout size={18} /> Keluar
      </LogoutButton>

      <Dialog open={editName} onClose={() => setEditName(false)} title="Ubah nama">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await patchProfile({ fullName: name });
            setEditName(false);
          }}
        >
          <Input label="Nama lengkap" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={name.trim().length < 3}>
            Simpan
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(child)}
        onClose={() => setChild(null)}
        title={`Hapus data ${child?.fullName ?? ''}?`}
        description="Admin klub akan menonaktifkan keanggotaan dan menghapus data kontak, foto, serta dokumen usia. Catatan pembayaran & kehadiran disimpan untuk pembukuan klub."
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Alasan (opsional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button variant="danger" disabled={busy} onClick={requestDelete}>
            Kirim permintaan
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
