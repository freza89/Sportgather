'use client';

import {
  EVENT_KIND_LABEL,
  EventInputSchema,
  formatTanggalIso,
  SeriesInputSchema,
  utcToLocalDate,
  utcToLocalTime,
  WEEKDAY_LONG,
  type BranchDto,
  type HolidayDto,
  type ScheduleEventDto,
  type TeamSummary,
  type ZonaWaktu,
} from '@sportgather/shared';
import { Alert, Button, Dialog, IconX, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

const KIND_OPTIONS = Object.entries(EVENT_KIND_LABEL)
  .filter(([k]) => k !== 'training')
  .map(([value, label]) => ({ value, label }));

/** "Buat jadwal": pola latihan mingguan (SCH-01) atau event tunggal (SCH-02). */
export function CreateScheduleDialog({
  slug,
  teams,
  branches,
  defaultTeamId,
}: {
  slug: string;
  teams: TeamSummary[];
  branches: BranchDto[];
  defaultTeamId?: string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'series' | 'single'>('series');
  const [form, setForm] = useState({
    teamId: defaultTeamId ?? teams[0]?.id ?? '',
    weekdays: [] as number[],
    startTime: '16:00',
    durationMin: '90',
    branchId: '',
    locationNote: '',
    kind: 'match',
    title: '',
    date: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const common = {
      teamId: form.teamId,
      startTime: form.startTime,
      durationMin: Number(form.durationMin),
      ...(form.branchId ? { branchId: form.branchId } : {}),
      ...(form.locationNote ? { locationNote: form.locationNote } : {}),
    };
    const payload =
      mode === 'series'
        ? { ...common, weekdays: form.weekdays }
        : {
            ...common,
            kind: form.kind,
            date: form.date,
            ...(form.title ? { title: form.title } : {}),
          };
    const r = (mode === 'series' ? SeriesInputSchema : EventInputSchema).safeParse(payload);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api(
      'POST',
      `/orgs/${slug}/schedule/${mode === 'series' ? 'series' : 'events'}`,
      payload,
    );
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={teams.length === 0}
      >
        Buat jadwal
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Buat jadwal">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-2 rounded-control bg-canvas p-1">
            {(['series', 'single'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-control py-2 type-button ${mode === m ? 'bg-surface shadow-sm' : 'text-fg-secondary'}`}
              >
                {m === 'series' ? 'Latihan rutin mingguan' : 'Event sekali'}
              </button>
            ))}
          </div>
          <Select
            label="Tim"
            value={form.teamId}
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(e) => setForm({ ...form, teamId: e.target.value })}
          />
          {mode === 'series' ? (
            <fieldset>
              <legend className="mb-2 type-caption-bold text-fg-secondary">Hari latihan</legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <label key={d} className="flex items-center gap-1 type-body">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-brand)]"
                      checked={form.weekdays.includes(d)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          weekdays: e.target.checked
                            ? [...form.weekdays, d]
                            : form.weekdays.filter((x) => x !== d),
                        })
                      }
                    />
                    {WEEKDAY_LONG[d]}
                  </label>
                ))}
              </div>
              {errors.weekdays ? (
                <p className="mt-1 type-caption text-danger">{errors.weekdays}</p>
              ) : null}
              <p className="mt-2 type-caption text-fg-muted">
                Sesi dibuat sampai akhir musim; hari libur dilewati.
              </p>
            </fieldset>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Jenis"
                value={form.kind}
                options={KIND_OPTIONS}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              />
              <Input
                label="Tanggal"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                error={errors.date}
              />
              <Input
                label="Judul"
                placeholder="Uji coba vs Akademi Tamu"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="col-span-2"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Jam mulai"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              error={errors.startTime}
            />
            <Input
              label="Durasi (menit)"
              type="number"
              min={15}
              value={form.durationMin}
              onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
              error={errors.durationMin}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Lokasi"
              value={form.branchId}
              options={[
                { value: '', label: 'Lokasi tim' },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            />
            <Input
              label="Lapangan / catatan"
              placeholder="Lapangan 2"
              value={form.locationNote}
              onChange={(e) => setForm({ ...form, locationNote: e.target.value })}
            />
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : mode === 'series' ? 'Buat jadwal rutin' : 'Buat event'}
          </Button>
        </form>
      </Dialog>
    </>
  );
}

/** Ubah atau batalkan SATU sesi; wali & pelatih tim dikabari lewat WhatsApp. */
export function EditEventDialog({
  slug,
  event,
  onClose,
}: {
  slug: string;
  event: ScheduleEventDto | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const zone = (event?.timezone ?? 'Asia/Jakarta') as ZonaWaktu;
  const [form, setForm] = useState<{
    date: string;
    startTime: string;
    durationMin: string;
    locationNote: string;
    cancelReason: string;
  } | null>(null);
  const [mode, setMode] = useState<'edit' | 'cancel'>('edit');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value =
    form ??
    (event
      ? {
          date: utcToLocalDate(new Date(event.startsAt), zone),
          startTime: utcToLocalTime(new Date(event.startsAt), zone),
          durationMin: String(
            Math.round(
              (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 60_000,
            ),
          ),
          locationNote: event.locationNote ?? '',
          cancelReason: '',
        }
      : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!event || !value) return;
    setBusy(true);
    setError(null);
    const body =
      mode === 'cancel'
        ? { cancelReason: value.cancelReason }
        : {
            date: value.date,
            startTime: value.startTime,
            durationMin: Number(value.durationMin),
            locationNote: value.locationNote || null,
          };
    const res = await api<{ notified: number }>(
      'PATCH',
      `/orgs/${slug}/schedule/events/${event.id}`,
      body,
    );
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setForm(null);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={event !== null}
      onClose={() => {
        setForm(null);
        setMode('edit');
        onClose();
      }}
      title={event ? `${event.teamName}${event.title ? ` · ${event.title}` : ''}` : ''}
      description="Perubahan hanya untuk sesi ini dan dikirim ke wali & pelatih tim lewat WhatsApp."
    >
      {event && value ? (
        event.status === 'cancelled' ? (
          <Alert tone="warning">Sesi ini dibatalkan: {event.cancelReason}</Alert>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-2 gap-2 rounded-control bg-canvas p-1">
              {(['edit', 'cancel'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-control py-2 type-button ${mode === m ? 'bg-surface shadow-sm' : 'text-fg-secondary'}`}
                >
                  {m === 'edit' ? 'Ubah jam/tempat' : 'Batalkan sesi'}
                </button>
              ))}
            </div>
            {mode === 'edit' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Tanggal"
                    type="date"
                    value={value.date}
                    onChange={(e) => setForm({ ...value, date: e.target.value })}
                  />
                  <Input
                    label="Jam mulai"
                    type="time"
                    value={value.startTime}
                    onChange={(e) => setForm({ ...value, startTime: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Durasi (menit)"
                    type="number"
                    value={value.durationMin}
                    onChange={(e) => setForm({ ...value, durationMin: e.target.value })}
                  />
                  <Input
                    label="Lapangan / catatan"
                    value={value.locationNote}
                    onChange={(e) => setForm({ ...value, locationNote: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <Input
                label="Alasan pembatalan"
                placeholder="mis. GOR dipakai acara"
                value={value.cancelReason}
                onChange={(e) => setForm({ ...value, cancelReason: e.target.value })}
              />
            )}
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button
              type="submit"
              variant={mode === 'cancel' ? 'danger' : 'primary'}
              disabled={busy || (mode === 'cancel' && value.cancelReason.trim().length < 3)}
            >
              {busy ? 'Menyimpan…' : mode === 'cancel' ? 'Batalkan & kabari' : 'Simpan & kabari'}
            </Button>
          </form>
        )
      ) : null}
    </Dialog>
  );
}

/** "Atur hari libur": menambah libur meniadakan sesi pada tanggal tsb. */
export function HolidaysDialog({
  slug,
  holidays,
  branches,
}: {
  slug: string;
  holidays: HolidayDto[];
  branches: BranchDto[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: '', name: '', branchId: '' });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<{ cancelled: number }>('POST', `/orgs/${slug}/schedule/holidays`, {
      date: form.date,
      name: form.name,
      ...(form.branchId ? { branchId: form.branchId } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setNotice(
      `Libur ditambahkan. ${res.data.cancelled ? 'Wali & pelatih tim terkait sudah dikabari.' : ''}`,
    );
    setForm({ date: '', name: '', branchId: '' });
    router.refresh();
  }

  async function remove(id: string) {
    const res = await api('DELETE', `/orgs/${slug}/schedule/holidays/${id}`);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setNotice(null);
          setOpen(true);
        }}
      >
        Atur hari libur
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Hari libur"
        description="Sesi pada tanggal libur otomatis dibatalkan."
      >
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {holidays.length === 0 ? (
              <li className="type-body-sm text-fg-muted">Belum ada hari libur mendatang.</li>
            ) : null}
            {holidays.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-3 rounded-control bg-canvas px-3 py-2"
              >
                <span className="flex-1 type-body">
                  {formatTanggalIso(h.date)} · {h.name}
                  {h.branchName ? (
                    <span className="type-caption text-fg-muted"> · {h.branchName}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  aria-label={`Hapus libur ${h.name}`}
                  onClick={() => void remove(h.id)}
                  className="text-fg-muted hover:text-danger"
                >
                  <IconX size={16} />
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={add} className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Tanggal"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
              <Select
                label="Berlaku untuk"
                value={form.branchId}
                options={[
                  { value: '', label: 'Semua lokasi' },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              />
            </div>
            <Input
              label="Keterangan"
              placeholder="Libur akademi"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {notice ? <Alert tone="success">{notice}</Alert> : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" disabled={busy || !form.date || form.name.trim().length < 2}>
              Tambah hari libur
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
