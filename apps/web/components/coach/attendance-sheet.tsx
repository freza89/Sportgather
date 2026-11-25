'use client';

import { ATTENDANCE_LABEL, type AttendanceSheet, type AttendanceStatus } from '@sportgather/shared';
import { Alert, Avatar, Button, Chip, IconWifioff, cn } from '@sportgather/ui';
import { useEffect, useMemo, useState } from 'react';
import { flush, loadSheet, pendingOps, queueOps, saveSheet } from '@/lib/offline-attendance';

const STATUSES: AttendanceStatus[] = ['hadir', 'izin', 'sakit', 'alpa'];
const TONE: Record<AttendanceStatus, string> = {
  hadir: 'bg-success text-fg-inverse',
  izin: 'bg-warning text-fg-inverse',
  sakit: 'bg-info text-fg-inverse',
  alpa: 'bg-danger text-fg-inverse',
};

/**
 * P-02 · Absensi sesi. Isian awal dari RSVP; satu ketukan per pemain; tersimpan di HP dan
 * tersinkron otomatis saat online (US-09: 20 pemain < 1 menit, offline, tanpa data ganda).
 */
export function AttendanceSheetView({
  slug,
  eventId,
  initial,
}: {
  slug: string;
  eventId: string;
  initial: AttendanceSheet | null;
}) {
  const [sheet, setSheet] = useState<AttendanceSheet | null>(initial);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus | null>>({});
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  // Data dari server disimpan ke HP; bila halaman dibuka offline, pakai salinan di HP.
  useEffect(() => {
    const sync = async () => {
      const r = await flush();
      setPending(r.pending);
      if (r.rejected.length) setRejected(r.rejected.map((x) => x.message));
    };
    if (initial) void saveSheet(eventId, initial);
    else void loadSheet(eventId).then((s) => s && setSheet(s));
    void pendingOps().then((ops) => setPending(ops.length));
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync();
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [eventId, initial]);

  const current = useMemo(() => {
    const out: Record<string, AttendanceStatus | null> = {};
    for (const p of sheet?.players ?? [])
      out[p.membershipId] = marks[p.membershipId] ?? p.attendance ?? p.rsvp ?? null;
    return out;
  }, [sheet, marks]);

  if (!sheet)
    return (
      <Alert tone="warning">
        Sesi ini belum pernah dibuka di HP ini. Sambungkan internet untuk memuat daftar pemain.
      </Alert>
    );

  const counts = STATUSES.map((s) => ({
    s,
    n: Object.values(current).filter((v) => v === s).length,
  }));
  const filled = Object.values(current).filter(Boolean).length;
  const total = sheet.players.length;

  async function save() {
    const now = new Date().toISOString();
    const ops = sheet!.players
      .filter((p) => current[p.membershipId] && current[p.membershipId] !== p.attendance)
      .map((p) => ({
        slug,
        op: {
          clientOpId: crypto.randomUUID(),
          eventId,
          membershipId: p.membershipId,
          status: current[p.membershipId]!,
          recordedAt: now,
        },
      }));
    if (ops.length) await queueOps(ops);
    // Tandai tersimpan di salinan lokal agar tampilan offline konsisten.
    const updated = {
      ...sheet!,
      players: sheet!.players.map((p) => ({
        ...p,
        attendance: current[p.membershipId] ?? p.attendance,
      })),
    };
    await saveSheet(eventId, updated);
    setSheet(updated);
    setMarks({});
    const r = navigator.onLine
      ? await flush()
      : { pending: (await pendingOps()).length, rejected: [] };
    setPending(r.pending);
    setRejected(r.rejected.map((x) => x.message));
    setSaved(
      r.pending
        ? 'Tersimpan di HP — akan dikirim otomatis saat online.'
        : `Absensi tersimpan · ${filled}/${total}`,
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      {!online ? (
        <Alert tone="warning" icon={IconWifioff}>
          Sedang offline — absensi disimpan di HP dan tersinkron otomatis saat online.
        </Alert>
      ) : null}
      {pending > 0 && online ? (
        <Alert tone="info">{pending} perubahan menunggu dikirim…</Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {counts.map(({ s, n }) => (
          <Chip key={s} selected={s === 'hadir'}>
            {ATTENDANCE_LABEL[s]} {n}
          </Chip>
        ))}
      </div>
      <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4">
        {sheet.players.map((p) => (
          <li key={p.membershipId} className="flex items-center gap-3 py-3">
            <Avatar name={p.fullName} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate type-body-medium">{p.fullName}</p>
              <p className="truncate type-caption text-fg-muted">
                {p.rsvp
                  ? `RSVP: ${ATTENDANCE_LABEL[p.rsvp]}${p.rsvpNote ? ` · ${p.rsvpNote}` : ''}`
                  : 'Belum RSVP'}
              </p>
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label={`Absensi ${p.fullName}`}>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={current[p.membershipId] === s}
                  aria-label={`${ATTENDANCE_LABEL[s]} — ${p.fullName}`}
                  onClick={() => setMarks({ ...marks, [p.membershipId]: s })}
                  className={cn(
                    'size-9 rounded-control type-caption-bold',
                    current[p.membershipId] === s ? TONE[s] : 'bg-canvas text-fg-muted',
                  )}
                >
                  {ATTENDANCE_LABEL[s][0]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {saved ? <Alert tone="success">{saved}</Alert> : null}
      {rejected.length ? (
        <Alert tone="danger">Sebagian tidak tersimpan: {[...new Set(rejected)].join(', ')}</Alert>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-line bg-surface px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        <Button block onClick={() => void save()} disabled={filled === 0}>
          Simpan absensi · {filled}/{total}
        </Button>
      </div>
    </div>
  );
}
