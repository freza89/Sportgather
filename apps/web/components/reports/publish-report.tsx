'use client';

import type { ReportStatus } from '@sportgather/shared';
import { Button } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';

/** US-16: rapor tampil ke wali setelah admin mempublikasikan; penilaian semester itu terkunci. */
export function PublishReportButton({ slug, status }: { slug: string; status: ReportStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function publish() {
    const missing = status.players - status.assessed;
    if (
      !confirm(
        `Terbitkan rapor semester ${status.semester}?${missing > 0 ? ` ${missing} pemain belum dinilai.` : ''} Penilaian semester ini akan terkunci dan wali dikabari lewat WhatsApp.`,
      )
    )
      return;
    setBusy(true);
    const r = await api<{ notified: number }>('POST', `/orgs/${slug}/report-cards/publish`, {
      seasonId: status.season.id,
      semester: status.semester,
    });
    setBusy(false);
    setMsg(r.ok ? `Rapor terbit · ${r.data.notified} wali dikabari` : r.message);
    router.refresh();
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={publish} disabled={busy || status.assessed === 0}>
        {busy ? 'Menerbitkan…' : 'Terbitkan rapor'}
      </Button>
      {msg ? <span className="type-caption text-fg-secondary">{msg}</span> : null}
    </div>
  );
}
