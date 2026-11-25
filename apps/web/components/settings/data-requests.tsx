'use client';

import type { DataRequestDto } from '@sportgather/shared';
import { Alert, Badge, Button, Card } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';

const STATUS = {
  pending: { tone: 'warning' as const, label: 'Menunggu' },
  done: { tone: 'success' as const, label: 'Dihapus' },
  rejected: { tone: 'neutral' as const, label: 'Ditolak' },
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));

export function DataRequests({ slug, items }: { slug: string; items: DataRequestDto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(r: DataRequestDto, status: 'done' | 'rejected') {
    const note = prompt(
      status === 'done'
        ? `Hapus data ${r.childName}? Keanggotaan dinonaktifkan, kontak & dokumen usia dihapus. Catatan keuangan dan absensi disimpan untuk pembukuan.\n\nCatatan (opsional):`
        : `Tolak permintaan untuk ${r.childName}. Alasan:`,
    );
    if (note === null) return;
    setBusy(r.id);
    const res = await api('PATCH', `/orgs/${slug}/data-requests/${r.id}`, {
      status,
      ...(note ? { note } : {}),
    });
    setBusy(null);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info">
        Wali bisa meminta penghapusan data anak dari aplikasi. Data keuangan & absensi tetap
        disimpan sesuai kewajiban pembukuan; data kontak, foto, dan dokumen usia dihapus.
      </Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <p className="p-6 type-body text-fg-secondary">Belum ada permintaan.</p>
        ) : (
          items.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-0"
            >
              <div className="flex flex-1 flex-col">
                <span className="type-body-medium">{r.childName}</span>
                <span className="type-caption text-fg-muted">
                  Diminta {r.requesterName} · {fmt(r.createdAt)}
                  {r.reason ? ` · “${r.reason}”` : ''}
                  {r.note ? ` · Catatan: ${r.note}` : ''}
                </span>
              </div>
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              {r.status === 'pending' ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy === r.id}
                    onClick={() => handle(r, 'rejected')}
                  >
                    Tolak
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy === r.id}
                    onClick={() => handle(r, 'done')}
                  >
                    Hapus data
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
