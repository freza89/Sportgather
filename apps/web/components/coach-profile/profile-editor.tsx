'use client';

import {
  CoachExperienceInputSchema,
  CoachLicenseInputSchema,
  CoachProfileInputSchema,
  LICENSE_STATUS_LABEL,
  ROLE_LABEL,
  formatPhone,
  formatTanggalIso,
  type CoachExperienceDto,
  type CoachLicenseDisplayStatus,
  type CoachLicenseDto,
  type CoachProfileDto,
  type StaffRole,
} from '@sportgather/shared';
import { Alert, Avatar, Badge, Button, Card, Dialog, Input, type BadgeTone } from '@sportgather/ui';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, apiUpload, fieldErrors } from '@/lib/api-client';

export const LICENSE_TONE: Record<CoachLicenseDisplayStatus, BadgeTone> = {
  in_progress: 'info',
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
  expired: 'danger',
  expiring: 'warning',
};

const textareaClass =
  'min-h-24 rounded-input border border-line bg-surface px-4 py-3 type-body focus:border-brand focus:outline-none';

function TextArea({
  label,
  value,
  onChange,
  max,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  error?: string | undefined;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="type-caption-bold text-fg-secondary">{label}</span>
      <textarea
        className={textareaClass}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="flex justify-between type-caption text-fg-muted">
        <span className="text-danger">{error}</span>
        {value.length}/{max}
      </span>
    </label>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-h3">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

const years = (e: { startYear: number; endYear: number | null }) =>
  `${e.startYear} – ${e.endYear ?? 'sekarang'}`;

/**
 * M7 · Profil/CV & lisensi pelatih. Dipakai admin (Pengaturan › Staf) dan pelatih sendiri
 * (`staffParam = 'me'`). Hak ubah/verifikasi datang dari API (`canEdit`, `canReview`).
 */
export function CoachProfileEditor({
  slug,
  staffParam,
  initial,
}: {
  slug: string;
  staffParam: string;
  initial: CoachProfileDto;
}) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const base = `/orgs/${slug}/coach-profiles/${staffParam}`;
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoVersion, setPhotoVersion] = useState(initial.profile.updatedAt ?? '0');

  function done(next: CoachProfileDto, message?: string) {
    setData(next);
    setError(null);
    setNotice(message ?? null);
  }

  async function uploadPhoto(file: File) {
    const form = new FormData();
    form.append('file', file);
    const res = await apiUpload<CoachProfileDto>(`${base}/photo`, form);
    if (!res.ok) return setError(res.message);
    setPhotoVersion(String(Date.now()));
    done(res.data, 'Foto diperbarui.');
  }

  const pending = data.licenses.filter((l) => l.displayStatus === 'pending').length;

  return (
    <div className="flex flex-col gap-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {data.canReview && pending ? (
        <Alert tone="warning">
          {pending} lisensi menunggu verifikasi. Periksa file sertifikatnya, lalu pilih Verifikasi
          atau Tolak.
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar
          name={data.fullName}
          size={72}
          src={data.profile.hasPhoto ? `/api${base}/photo?v=${photoVersion}` : undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="type-h2">{data.fullName}</p>
          <p className="type-body text-fg-secondary">
            {data.profile.headline ?? ROLE_LABEL[data.role as StaffRole]}
          </p>
          <p className="type-caption text-fg-muted">
            {[
              ROLE_LABEL[data.role as StaffRole],
              data.phone ? formatPhone(data.phone) : null,
              data.teams.length ? data.teams.map((t) => t.name).join(', ') : 'Belum memegang tim',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {data.canEdit ? (
          <>
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              aria-label="Pilih foto profil"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
                e.target.value = '';
              }}
            />
            <Button variant="secondary" onClick={() => photoInput.current?.click()}>
              {data.profile.hasPhoto ? 'Ganti foto' : 'Unggah foto'}
            </Button>
          </>
        ) : null}
      </Card>

      <BiodataSection data={data} base={base} onSaved={done} onError={setError} />
      <ExperienceSection data={data} base={base} onSaved={done} onError={setError} />
      <LicenseSection data={data} base={base} onSaved={done} onError={setError} />
    </div>
  );
}

type SectionProps = {
  data: CoachProfileDto;
  base: string;
  onSaved: (d: CoachProfileDto, message?: string) => void;
  onError: (m: string) => void;
};

// ── Biodata ──────────────────────────────────────────────────────────────────

function BiodataSection({ data, base, onSaved, onError }: SectionProps) {
  const p = data.profile;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    headline: p.headline ?? '',
    specialization: p.specialization ?? '',
    yearsCoaching: p.yearsCoaching === null ? '' : String(p.yearsCoaching),
    city: p.city ?? '',
    bio: p.bio ?? '',
    playingBackground: p.playingBackground ?? '',
    education: p.education ?? '',
  });
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = { ...form, yearsCoaching: form.yearsCoaching === '' ? null : form.yearsCoaching };
    const r = CoachProfileInputSchema.safeParse(body);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api<CoachProfileDto>('PUT', base, body);
    setBusy(false);
    if (!res.ok) return onError(res.message);
    setEditing(false);
    onSaved(res.data, 'Profil disimpan.');
  }

  const rows: [string, string | null][] = [
    ['Spesialisasi', p.specialization],
    ['Pengalaman melatih', p.yearsCoaching === null ? null : `${p.yearsCoaching} tahun`],
    ['Domisili', p.city],
    ['Latar belakang bermain', p.playingBackground],
    ['Pendidikan', p.education],
  ];

  return (
    <Section
      title="Biodata"
      action={
        data.canEdit && !editing ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Ubah
          </Button>
        ) : null
      }
    >
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Judul singkat"
              placeholder="Pelatih kepala KU12"
              value={form.headline}
              onChange={(e) => set('headline')(e.target.value)}
              error={errors.headline}
            />
            <Input
              label="Spesialisasi"
              placeholder="Fundamental, pertahanan"
              value={form.specialization}
              onChange={(e) => set('specialization')(e.target.value)}
              error={errors.specialization}
            />
            <Input
              label="Lama melatih (tahun)"
              inputMode="numeric"
              value={form.yearsCoaching}
              onChange={(e) => set('yearsCoaching')(e.target.value.replace(/\D/g, ''))}
              error={errors.yearsCoaching}
            />
            <Input
              label="Domisili"
              placeholder="Bandung"
              value={form.city}
              onChange={(e) => set('city')(e.target.value)}
              error={errors.city}
            />
          </div>
          <TextArea
            label="Tentang pelatih"
            value={form.bio}
            onChange={set('bio')}
            max={1500}
            error={errors.bio}
            placeholder="Filosofi melatih, prestasi, hal yang perlu diketahui orang tua…"
          />
          <TextArea
            label="Latar belakang bermain"
            value={form.playingBackground}
            onChange={set('playingBackground')}
            max={500}
            error={errors.playingBackground}
          />
          <Input
            label="Pendidikan"
            placeholder="S1 Pendidikan Jasmani"
            value={form.education}
            onChange={(e) => set('education')(e.target.value)}
            error={errors.education}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan profil'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          {p.bio ? <p className="type-body whitespace-pre-line">{p.bio}</p> : null}
          <dl className="grid gap-3 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="type-caption text-fg-muted">{k}</dt>
                <dd className="type-body">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Section>
  );
}

// ── Pengalaman ───────────────────────────────────────────────────────────────

function ExperienceSection({ data, base, onSaved, onError }: SectionProps) {
  const [open, setOpen] = useState<CoachExperienceDto | 'new' | null>(null);
  const [form, setForm] = useState({
    title: '',
    organization: '',
    startYear: '',
    endYear: '',
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function edit(e: CoachExperienceDto | 'new') {
    setErrors({});
    setForm(
      e === 'new'
        ? { title: '', organization: '', startYear: '', endYear: '', description: '' }
        : {
            title: e.title,
            organization: e.organization,
            startYear: String(e.startYear),
            endYear: e.endYear === null ? '' : String(e.endYear),
            description: e.description ?? '',
          },
    );
    setOpen(e);
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const body = { ...form, endYear: form.endYear === '' ? null : form.endYear };
    const r = CoachExperienceInputSchema.safeParse(body);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res =
      open === 'new'
        ? await api<CoachProfileDto>('POST', `${base}/experiences`, body)
        : await api<CoachProfileDto>('PUT', `${base}/experiences/${open!.id}`, body);
    setBusy(false);
    if (!res.ok) return onError(res.message);
    setOpen(null);
    onSaved(res.data, 'Pengalaman disimpan.');
  }

  async function remove(e: CoachExperienceDto) {
    if (!window.confirm(`Hapus "${e.title} · ${e.organization}"?`)) return;
    const res = await api<CoachProfileDto>('DELETE', `${base}/experiences/${e.id}`);
    if (!res.ok) return onError(res.message);
    onSaved(res.data, 'Pengalaman dihapus.');
  }

  return (
    <Section
      title="Pengalaman"
      action={
        data.canEdit ? (
          <Button variant="secondary" onClick={() => edit('new')}>
            Tambah
          </Button>
        ) : null
      }
    >
      {data.experiences.length === 0 ? (
        <p className="type-body text-fg-muted">Belum ada riwayat pengalaman.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {data.experiences.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="type-body-medium">{e.title}</p>
                <p className="type-body-sm text-fg-secondary">
                  {e.organization} · {years(e)}
                </p>
                {e.description ? (
                  <p className="mt-1 type-caption text-fg-muted">{e.description}</p>
                ) : null}
              </div>
              {data.canEdit ? (
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => edit(e)}>
                    Ubah
                  </Button>
                  <Button variant="ghost" onClick={() => void remove(e)}>
                    Hapus
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === 'new' ? 'Tambah pengalaman' : 'Ubah pengalaman'}
      >
        <form onSubmit={save} className="flex flex-col gap-4">
          <Input
            label="Jabatan / peran"
            placeholder="Asisten pelatih KU14"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={errors.title}
          />
          <Input
            label="Klub / organisasi"
            value={form.organization}
            onChange={(e) => setForm({ ...form, organization: e.target.value })}
            error={errors.organization}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Tahun mulai"
              inputMode="numeric"
              maxLength={4}
              value={form.startYear}
              onChange={(e) => setForm({ ...form, startYear: e.target.value.replace(/\D/g, '') })}
              error={errors.startYear}
            />
            <Input
              label="Tahun selesai"
              hint="Kosongkan bila masih berjalan"
              inputMode="numeric"
              maxLength={4}
              value={form.endYear}
              onChange={(e) => setForm({ ...form, endYear: e.target.value.replace(/\D/g, '') })}
              error={errors.endYear}
            />
          </div>
          <TextArea
            label="Keterangan (opsional)"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
            max={500}
            error={errors.description}
          />
          <Button type="submit" block disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </form>
      </Dialog>
    </Section>
  );
}

// ── Lisensi ──────────────────────────────────────────────────────────────────

function LicenseSection({ data, base, onSaved, onError }: SectionProps) {
  const [open, setOpen] = useState<CoachLicenseDto | 'new' | null>(null);
  const empty = {
    name: '',
    issuer: '',
    level: '',
    licenseNumber: '',
    issuedOn: '',
    expiresOn: '',
    inProgress: false,
  };
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<CoachLicenseDto | null>(null);
  const [note, setNote] = useState('');

  function edit(l: CoachLicenseDto | 'new') {
    setErrors({});
    setFile(null);
    setForm(
      l === 'new'
        ? empty
        : {
            name: l.name,
            issuer: l.issuer ?? '',
            level: l.level ?? '',
            licenseNumber: l.licenseNumber ?? '',
            issuedOn: l.issuedOn ?? '',
            expiresOn: l.expiresOn ?? '',
            inProgress: l.status === 'in_progress',
          },
    );
    setOpen(l);
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const body = {
      ...form,
      issuedOn: form.issuedOn || null,
      expiresOn: form.expiresOn || null,
    };
    const r = CoachLicenseInputSchema.safeParse(body);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    if (file && file.size > 5 * 1024 * 1024)
      return setErrors({ file: 'Ukuran file maksimal 5 MB' });
    const fd = new FormData();
    fd.append('data', JSON.stringify(body));
    if (file) fd.append('file', file);
    setBusy(true);
    const res = await apiUpload<CoachProfileDto>(
      open === 'new' ? `${base}/licenses` : `${base}/licenses/${open!.id}`,
      fd,
    );
    setBusy(false);
    if (!res.ok) return onError(res.message);
    setOpen(null);
    const saved = res.data.licenses.find((l) => l.name === body.name);
    onSaved(
      res.data,
      saved?.status === 'pending'
        ? 'Lisensi disimpan dan menunggu verifikasi admin.'
        : 'Lisensi disimpan.',
    );
  }

  async function remove(l: CoachLicenseDto) {
    if (!window.confirm(`Hapus lisensi "${l.name}"?`)) return;
    const res = await api<CoachProfileDto>('DELETE', `${base}/licenses/${l.id}`);
    if (!res.ok) return onError(res.message);
    onSaved(res.data, 'Lisensi dihapus.');
  }

  async function review(l: CoachLicenseDto, decision: 'verified' | 'rejected', reason?: string) {
    const res = await api<CoachProfileDto>('POST', `${base}/licenses/${l.id}/review`, {
      decision,
      note: reason ?? null,
    });
    if (!res.ok) return onError(res.message);
    setRejecting(null);
    onSaved(res.data, decision === 'verified' ? 'Lisensi terverifikasi.' : 'Lisensi ditolak.');
  }

  return (
    <Section
      title="Lisensi & sertifikat"
      action={
        data.canEdit ? (
          <Button variant="secondary" onClick={() => edit('new')}>
            Tambah lisensi
          </Button>
        ) : null
      }
    >
      {data.licenses.length === 0 ? (
        <p className="type-body text-fg-muted">
          Belum ada lisensi. Lisensi yang masih dalam proses juga bisa dicatat.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.licenses.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-3 rounded-input border border-line p-4 sm:flex-row sm:items-start"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="type-body-medium">{l.name}</p>
                  <Badge tone={LICENSE_TONE[l.displayStatus]}>
                    {LICENSE_STATUS_LABEL[l.displayStatus]}
                  </Badge>
                </div>
                {l.issuer || l.level || l.licenseNumber ? (
                  <p className="type-body-sm text-fg-secondary">
                    {[l.issuer, l.level ? `Level ${l.level}` : null, l.licenseNumber]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
                <p className="type-caption text-fg-muted">
                  {l.status === 'in_progress'
                    ? 'Sedang dalam proses pengambilan lisensi'
                    : [
                        l.issuedOn ? `Terbit ${formatTanggalIso(l.issuedOn)}` : null,
                        l.expiresOn
                          ? `Berlaku s.d. ${formatTanggalIso(l.expiresOn)}`
                          : 'Tanpa masa berlaku',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </p>
                {l.status === 'rejected' && l.reviewNote ? (
                  <p className="type-caption text-danger">Alasan ditolak: {l.reviewNote}</p>
                ) : null}
                {l.file ? (
                  <a
                    href={`/api${base}/licenses/${l.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="type-caption-bold text-brand"
                  >
                    Lihat file: {l.file.name}
                  </a>
                ) : (
                  <span className="type-caption text-fg-muted">Belum ada file sertifikat</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1 sm:justify-end">
                {data.canReview && (l.status === 'pending' || l.status === 'rejected') ? (
                  <Button onClick={() => void review(l, 'verified')}>Verifikasi</Button>
                ) : null}
                {data.canReview && l.status === 'pending' ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      setNote('');
                      setRejecting(l);
                    }}
                  >
                    Tolak
                  </Button>
                ) : null}
                {data.canEdit ? (
                  <>
                    <Button variant="ghost" onClick={() => edit(l)}>
                      Ubah
                    </Button>
                    <Button variant="ghost" onClick={() => void remove(l)}>
                      Hapus
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === 'new' ? 'Tambah lisensi' : 'Ubah lisensi'}
        description={
          data.canReview
            ? undefined
            : 'Lisensi yang Anda tambahkan atau ubah akan diverifikasi oleh admin klub.'
        }
      >
        <form onSubmit={save} className="flex flex-col gap-4">
          <Input
            label="Nama lisensi"
            placeholder="Lisensi Pelatih Bola Basket Level C"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
          />
          <label className="flex items-start gap-3 rounded-input border border-line px-4 py-3">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-brand"
              checked={form.inProgress}
              onChange={(e) => setForm({ ...form, inProgress: e.target.checked })}
            />
            <span className="flex flex-col">
              <span className="type-body">Masih dalam proses mengambil lisensi</span>
              <span className="type-caption text-fg-muted">
                File sertifikat dan tanggal tidak wajib diisi.
              </span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Penerbit"
              placeholder="PERBASI / FIBA"
              value={form.issuer}
              onChange={(e) => setForm({ ...form, issuer: e.target.value })}
              error={errors.issuer}
            />
            <Input
              label="Level"
              placeholder="C"
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              error={errors.level}
            />
          </div>
          <Input
            label="Nomor lisensi"
            value={form.licenseNumber}
            onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
            error={errors.licenseNumber}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Tanggal terbit"
              type="date"
              value={form.issuedOn}
              onChange={(e) => setForm({ ...form, issuedOn: e.target.value })}
              error={errors.issuedOn}
            />
            <Input
              label="Berlaku sampai"
              type="date"
              hint="Kosongkan bila seumur hidup"
              value={form.expiresOn}
              onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
              error={errors.expiresOn}
            />
          </div>
          <label className="flex flex-col gap-[6px]">
            <span className="type-caption-bold text-fg-secondary">File sertifikat (opsional)</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="type-body-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span className="type-caption text-fg-muted">
              {open !== 'new' && open?.file && !file
                ? `File sekarang: ${open.file.name}. Pilih file baru untuk mengganti.`
                : 'PDF, JPG, atau PNG, maksimal 5 MB.'}
            </span>
            {errors.file ? <span className="type-caption text-danger">{errors.file}</span> : null}
          </label>
          <Button type="submit" block disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan lisensi'}
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Tolak lisensi"
        description={rejecting?.name}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting && note.trim()) void review(rejecting, 'rejected', note.trim());
          }}
          className="flex flex-col gap-4"
        >
          <TextArea
            label="Alasan penolakan"
            value={note}
            onChange={setNote}
            max={300}
            placeholder="Mis. file tidak terbaca, nomor lisensi tidak sesuai"
          />
          <Button type="submit" variant="danger" block disabled={!note.trim()}>
            Tolak lisensi
          </Button>
        </form>
      </Dialog>
    </Section>
  );
}
