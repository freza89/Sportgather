'use client';

import {
  AnnouncementInputSchema,
  kuLabel,
  type AnnouncementDto,
  type AnnouncementTarget,
  type AudiencePreview,
} from '@sportgather/shared';
import { Alert, Badge, Button, Card, IconUsers, Input } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

type Opt = { id: string; name: string };
type Kind = AnnouncementTarget['kind'];

const KIND_LABEL: Record<Kind, string> = {
  club: 'Seluruh klub',
  branch: 'Per cabang',
  ku: 'KU',
  team: 'Tim tertentu',
};

const COACH_TEMPLATES = [
  [
    'Latihan dibatalkan',
    'Latihan hari ini dibatalkan. Informasi jadwal pengganti menyusul. Terima kasih.',
  ],
  [
    'Jadwal berubah',
    'Jadwal latihan berubah menjadi … Mohon anak datang 15 menit lebih awal. Terima kasih.',
  ],
  ['Bawa perlengkapan', 'Mohon anak membawa air minum, handuk, dan sepatu basket. Terima kasih.'],
  [
    'Info pertandingan',
    'Pertandingan hari … pukul … di …. Mohon konfirmasi kehadiran anak. Terima kasih.',
  ],
] as const;

function chip(active: boolean) {
  return active
    ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
    : 'rounded-full border border-line bg-surface px-3 py-[6px] type-caption-bold';
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-input border border-line px-4 py-3">
      <span className="flex flex-col">
        <span className="type-body">{label}</span>
        <span className="type-caption text-fg-muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

/** A-16 (admin) & P-05 (pelatih). Pelatih hanya bisa memilih tim yang dipegang. */
export function AnnouncementComposer({
  slug,
  mode,
  teams,
  branches = [],
  kus = [],
}: {
  slug: string;
  mode: 'admin' | 'coach';
  teams: Opt[];
  branches?: Opt[];
  kus?: number[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(mode === 'coach' ? 'team' : 'club');
  const [ids, setIds] = useState<string[]>(mode === 'coach' && teams[0] ? [teams[0].id] : []);
  const [selKus, setSelKus] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [wa, setWa] = useState(true);
  const [push, setPush] = useState(true);
  const [when, setWhen] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const target = useMemo<AnnouncementTarget | null>(() => {
    if (kind === 'club') return { kind };
    if (kind === 'ku') return selKus.length ? { kind, kus: selKus } : null;
    return ids.length ? { kind, ids } : null;
  }, [kind, ids, selKus]);

  useEffect(() => {
    if (!target) return;
    let live = true;
    void api<AudiencePreview>('POST', `/orgs/${slug}/announcements/preview`, target).then((r) => {
      if (live) setPreview(r.ok ? r.data : null);
    });
    return () => {
      live = false;
    };
  }, [slug, target]);
  const shownPreview = target ? preview : null;

  const options: Opt[] = kind === 'branch' ? branches : kind === 'team' ? teams : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!target) return setErrors({ target: 'Pilih target' });
    const payload = {
      title,
      body,
      target,
      viaWhatsapp: wa,
      viaPush: push,
      ...(scheduling && when ? { scheduledAt: new Date(`${when}:00+07:00`).toISOString() } : {}),
    };
    const r = AnnouncementInputSchema.safeParse(payload);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api<{ scheduled: boolean; recipients: number }>(
      'POST',
      `/orgs/${slug}/announcements`,
      r.data,
    );
    setBusy(false);
    if (!res.ok) return setMsg({ tone: 'danger', text: res.message });
    setMsg({
      tone: 'success',
      text: res.data.scheduled
        ? 'Pengumuman dijadwalkan.'
        : `Terkirim ke ${res.data.recipients} wali.`,
    });
    setTitle('');
    setBody('');
    setWhen('');
    setScheduling(false);
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {mode === 'admin' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 type-caption-bold">Kirim ke</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                className={chip(kind === k)}
                onClick={() => {
                  setKind(k);
                  setIds([]);
                  setSelKus([]);
                }}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {kind === 'ku' ? (
        <div className="flex flex-wrap gap-2" aria-label="Pilih KU">
          {kus.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={selKus.includes(k)}
              className={chip(selKus.includes(k))}
              onClick={() =>
                setSelKus(selKus.includes(k) ? selKus.filter((x) => x !== k) : [...selKus, k])
              }
            >
              {kuLabel(k)}
            </button>
          ))}
        </div>
      ) : options.length ? (
        <div
          className="flex flex-wrap gap-2"
          aria-label={kind === 'team' ? 'Pilih tim' : 'Pilih cabang'}
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={ids.includes(o.id)}
              className={chip(ids.includes(o.id))}
              onClick={() =>
                setIds(
                  mode === 'coach'
                    ? [o.id]
                    : ids.includes(o.id)
                      ? ids.filter((x) => x !== o.id)
                      : [...ids, o.id],
                )
              }
            >
              {o.name}
            </button>
          ))}
        </div>
      ) : kind !== 'club' ? (
        <Alert tone="warning">Belum ada {kind === 'team' ? 'tim' : 'cabang'} untuk dipilih.</Alert>
      ) : null}
      {shownPreview ? (
        <div className="flex items-center gap-2 rounded-input bg-brand-tint px-4 py-3 type-body text-brand-dark">
          <IconUsers size={18} />
          {shownPreview.label} · {shownPreview.players} pemain · {shownPreview.guardians} wali
          {shownPreview.multiChild ? ` (${shownPreview.multiChild} wali punya >1 anak)` : ''}
        </div>
      ) : errors.target ? (
        <span className="type-caption text-danger">{errors.target}</span>
      ) : null}
      {mode === 'coach' ? (
        <div className="flex flex-col gap-2">
          <span className="type-caption-bold">Template cepat</span>
          <div className="flex flex-wrap gap-2">
            {COACH_TEMPLATES.map(([t, b]) => (
              <button
                key={t}
                type="button"
                className={chip(false)}
                onClick={() => {
                  setTitle(t);
                  setBody(b);
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <Input
        label="Judul"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Perubahan jadwal latihan Kamis"
        error={errors.title}
      />
      <label className="flex flex-col gap-2">
        <span className="type-caption-bold">Pesan</span>
        <textarea
          className="min-h-32 rounded-input border border-line bg-surface px-4 py-3 type-body focus:border-brand focus:outline-none"
          value={body}
          maxLength={1000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Yth. Bapak/Ibu, …"
        />
        <span className="flex justify-between type-caption text-fg-muted">
          <span className="text-danger">{errors.body}</span>
          {body.length}/1000
        </span>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 type-caption-bold">Kanal</legend>
        <Toggle
          checked={wa}
          onChange={setWa}
          label="WhatsApp"
          hint="Template pengumuman (disetujui Meta), berisi link baca"
        />
        <Toggle
          checked={push}
          onChange={setPush}
          label="Notifikasi aplikasi"
          hint="Untuk wali yang sudah memasang PWA dan mengizinkan notifikasi"
        />
        {errors.viaWhatsapp ? (
          <span className="type-caption text-danger">{errors.viaWhatsapp}</span>
        ) : null}
      </fieldset>
      {scheduling ? (
        <Input
          label="Kirim pada (WIB)"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          hint="Tidak bisa di jam tenang 21.00–06.00"
          error={errors.scheduledAt}
        />
      ) : null}
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-3">
        {mode === 'admin' ? (
          <Button variant="secondary" onClick={() => setScheduling(!scheduling)}>
            {scheduling ? 'Kirim sekarang saja' : 'Jadwalkan'}
          </Button>
        ) : null}
        <Button type="submit" disabled={busy || !target} block={mode === 'coach'}>
          {busy
            ? 'Mengirim…'
            : scheduling
              ? 'Simpan jadwal'
              : `Kirim${shownPreview ? ` ke ${shownPreview.guardians} wali` : ''}`}
        </Button>
      </div>
    </form>
  );
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

/** Riwayat dengan jumlah terkirim & dibaca (COM-01/02). */
export function AnnouncementHistory({
  slug,
  items,
  compact = false,
}: {
  slug: string;
  items: AnnouncementDto[];
  compact?: boolean;
}) {
  const router = useRouter();
  if (!items.length)
    return <Card className="p-5 type-body text-fg-secondary">Belum ada pengumuman.</Card>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((a) => {
        const pct = a.recipients ? Math.round((a.read / a.recipients) * 100) : 0;
        return (
          <Card key={a.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="type-body-medium">{a.title}</span>
              <Badge tone={a.source === 'schedule_change' ? 'info' : 'brand'}>
                {a.source === 'schedule_change' ? 'Jadwal' : a.targetLabel}
              </Badge>
            </div>
            {a.status === 'scheduled' ? (
              <div className="flex items-center justify-between type-caption text-fg-muted">
                <span>
                  Terjadwal {fmt(a.scheduledAt!)} · {a.targetLabel}
                </span>
                <button
                  type="button"
                  className="type-caption-bold text-danger"
                  onClick={async () => {
                    if (!confirm('Batalkan pengumuman terjadwal ini?')) return;
                    await api('DELETE', `/orgs/${slug}/announcements/${a.id}`);
                    router.refresh();
                  }}
                >
                  Batalkan
                </button>
              </div>
            ) : a.status === 'cancelled' ? (
              <span className="type-caption text-fg-muted">Dibatalkan</span>
            ) : (
              <>
                <span className="type-caption text-fg-muted">
                  {a.sentAt ? fmt(a.sentAt) : ''} · {a.delivered} terkirim · dibaca {a.read}/
                  {a.recipients}
                  {!compact && a.authorName ? ` · ${a.authorName}` : ''}
                </span>
                <div
                  className="h-2 overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Persentase dibaca"
                >
                  <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
