'use client';

import { kuLabel, type ChildSummary } from '@sportgather/shared';
import { Alert, Avatar, Badge, Button, Card, IconUpload } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiUpload, MAX_UPLOAD_BYTES } from '@/lib/api-client';

function Reupload({ child }: { child: ChildSummary }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) return setError('Ukuran file maksimal 5 MB');
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('data', JSON.stringify({ kind: 'akta' }));
    form.append('document', file, file.name);
    const res = await apiUpload(`/me/children/${child.membershipId}/documents`, form);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-2">
      <Alert tone="danger">Dokumen ditolak: {child.rejectionReason}</Alert>
      <label className="self-start">
        <span className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-brand px-4 py-2 type-button text-fg-inverse">
          <IconUpload size={18} /> {busy ? 'Mengunggah…' : 'Unggah ulang akta / KIA'}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
        />
      </label>
      {error ? <p className="type-caption text-danger">{error}</p> : null}
    </div>
  );
}

const STATUS = {
  active: { tone: 'success', label: 'Aktif' },
  on_leave: { tone: 'neutral', label: 'Cuti' },
  left: { tone: 'neutral', label: 'Keluar' },
  pending: { tone: 'warning', label: 'Menunggu verifikasi' },
  rejected: { tone: 'danger', label: 'Perlu perbaikan' },
} as const;

/** Kartu per anak di beranda wali (O-03); satu akun untuk banyak anak & klub (PAR-01). */
export function ChildrenList({ items }: { items: ChildSummary[] }) {
  if (items.length === 0) {
    return (
      <Card className="flex flex-col gap-2 p-5">
        <p className="type-h3">Belum ada anak terdaftar</p>
        <p className="type-body text-fg-secondary">
          Buka link pendaftaran dari klub (biasanya dikirim lewat WhatsApp) untuk mendaftarkan anak.
        </p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((c) => {
        const s = STATUS[c.status as keyof typeof STATUS] ?? STATUS.active;
        return (
          <Card key={c.membershipId} className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={c.fullName} />
              <div className="min-w-0 flex-1">
                <p className="truncate type-h3">{c.fullName}</p>
                <p className="truncate type-caption text-fg-muted">
                  {c.orgName} · {c.teamName ?? kuLabel(c.ku)}
                </p>
              </div>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
            {c.status === 'active' && c.ageVerified ? (
              <p className="type-caption text-success">Usia terverifikasi</p>
            ) : null}
            {c.status === 'pending' ? (
              <p className="type-body-sm text-fg-secondary">
                Admin klub sedang memeriksa dokumen. Kabar dikirim lewat WhatsApp.
              </p>
            ) : null}
            {c.status === 'rejected' ? <Reupload child={c} /> : null}
          </Card>
        );
      })}
      <Button variant="ghost" className="self-start" disabled>
        Jadwal, tagihan & rapor muncul di sini (M3–M5)
      </Button>
    </div>
  );
}
