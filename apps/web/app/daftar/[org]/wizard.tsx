'use client';

import {
  CONSENT_VERSION,
  kuFor,
  kuLabel,
  PhoneSchema,
  RegistrationChildSchema,
  RELATION_LABEL,
  type PublicOrgInfo,
  type RegistrationResult,
} from '@sportgather/shared';
import {
  Alert,
  Button,
  Card,
  IconBack,
  IconCheck,
  IconLayers,
  IconUpload,
  IconX,
  Input,
  Select,
  cn,
} from '@sportgather/ui';
import Link from 'next/link';
import { useState } from 'react';
import { OtpLogin } from '@/components/auth/otp-login';
import { apiUpload, fieldErrors, MAX_UPLOAD_BYTES } from '@/lib/api-client';

type Child = {
  fullName: string;
  birthDate: string;
  gender: '' | 'male' | 'female';
  school: string;
  documentKind: 'akta' | 'kia' | 'kk';
  file: File | null;
};
const emptyChild = (): Child => ({
  fullName: '',
  birthDate: '',
  gender: '',
  school: '',
  documentKind: 'akta',
  file: null,
});
const STEPS = ['Data anak', 'Data wali', 'Tinjau & kirim'];

export function RegistrationWizard({
  info,
  signedInAs,
}: {
  info: PublicOrgInfo;
  signedInAs: string | null;
}) {
  const [step, setStep] = useState(0);
  const [children, setChildren] = useState<Child[]>([emptyChild()]);
  const [consent, setConsent] = useState(false);
  const [account, setAccount] = useState<string | null>(signedInAs);
  const [guardian, setGuardian] = useState({
    relation: 'mother',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const config = { rule: info.kuRule, groups: info.kuGroups };

  const estimate = (birth: string) => {
    try {
      return birth ? kuFor(birth, info.referenceDate, config) : undefined;
    } catch {
      return undefined;
    }
  };
  const update = (i: number, patch: Partial<Child>) =>
    setChildren((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  function validateChildren() {
    const errs: Record<string, string> = {};
    children.forEach((c, i) => {
      const r = RegistrationChildSchema.safeParse({ ...c, school: c.school || undefined });
      if (!r.success)
        for (const [k, v] of Object.entries(fieldErrors(r.error.issues))) errs[`${i}.${k}`] = v;
      if (!c.file) errs[`${i}.file`] = 'Unggah akta kelahiran / KIA';
      else if (c.file.size > MAX_UPLOAD_BYTES) errs[`${i}.file`] = 'Ukuran file maksimal 5 MB';
    });
    if (!consent) errs.consent = 'Persetujuan wajib dicentang';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateGuardian() {
    const errs: Record<string, string> = {};
    if (guardian.emergencyContactName.trim().length < 2)
      errs.emergencyContactName = 'Nama kontak darurat wajib diisi';
    if (!PhoneSchema.safeParse(guardian.emergencyContactPhone).success)
      errs.emergencyContactPhone = 'Nomor tidak valid';
    if (!account) errs.account = 'Verifikasi nomor WhatsApp Anda terlebih dahulu';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append(
      'data',
      JSON.stringify({
        ...guardian,
        consent: true,
        consentVersion: CONSENT_VERSION,
        children: children.map((c) => ({
          fullName: c.fullName,
          birthDate: c.birthDate,
          gender: c.gender,
          documentKind: c.documentKind,
          ...(c.school ? { school: c.school } : {}),
        })),
      }),
    );
    children.forEach((c, i) => form.append(`document_${i}`, c.file!, c.file!.name));
    const res = await apiUpload<RegistrationResult>(
      `/public/orgs/${info.slug}/registrations`,
      form,
    );
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setResult(res.data);
  }

  if (result) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-6 bg-canvas px-5 py-12">
        <span className="flex size-14 items-center justify-center rounded-full bg-success-bg text-success">
          <IconCheck size={28} />
        </span>
        <h1 className="type-display">Pendaftaran terkirim</h1>
        <p className="type-body text-fg-secondary">
          Konfirmasi dikirim ke WhatsApp Anda. Admin {info.name} akan memverifikasi dokumen usia,
          lalu Anda menerima kabar lewat WhatsApp.
        </p>
        <Card className="flex flex-col gap-2 p-4">
          {result.children.map((c) => (
            <p key={c.membershipId} className="flex justify-between type-body">
              {c.fullName} <span className="text-fg-secondary">perkiraan {kuLabel(c.ku)}</span>
            </p>
          ))}
        </Card>
        <Link href="/wali" className="text-brand">
          Buka area orang tua →
        </Link>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-canvas">
      <header className="flex items-center gap-3 bg-surface px-5 pt-6 pb-4">
        {step > 0 ? (
          <button type="button" aria-label="Kembali" onClick={() => setStep(step - 1)}>
            <IconBack />
          </button>
        ) : null}
        <div>
          <h1 className="type-h2">Pendaftaran pemain</h1>
          <p className="type-caption text-fg-muted">{info.name}</p>
        </div>
      </header>
      <div className="flex flex-col gap-2 px-5 pt-4">
        <div className="flex justify-between type-caption-bold">
          <span>
            Langkah {step + 1} dari 3 · {STEPS[step]}
          </span>
          <span className="text-brand">{Math.round(((step + 1) / 3) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${((step + 1) / 3) * 100}%` }}
          />
        </div>
      </div>

      <main className="flex flex-1 flex-col gap-5 px-5 py-5 pb-28">
        {step === 0 ? (
          <>
            {children.map((c, i) => {
              const ku = estimate(c.birthDate);
              return (
                <section key={i} className="flex flex-col gap-4">
                  {children.length > 1 ? (
                    <div className="flex items-center justify-between">
                      <h2 className="type-h3">Anak {i + 1}</h2>
                      <button
                        type="button"
                        aria-label={`Hapus anak ${i + 1}`}
                        onClick={() => setChildren(children.filter((_, j) => j !== i))}
                        className="text-fg-muted"
                      >
                        <IconX size={18} />
                      </button>
                    </div>
                  ) : null}
                  <Input
                    label="Nama lengkap anak"
                    value={c.fullName}
                    onChange={(e) => update(i, { fullName: e.target.value })}
                    error={errors[`${i}.fullName`]}
                  />
                  <Input
                    label="Tanggal lahir"
                    type="date"
                    value={c.birthDate}
                    onChange={(e) => update(i, { birthDate: e.target.value })}
                    error={errors[`${i}.birthDate`]}
                  />
                  <fieldset>
                    <legend className="mb-[6px] type-caption-bold text-fg-secondary">Gender</legend>
                    <div className="flex gap-2">
                      {(['male', 'female'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          aria-pressed={c.gender === g}
                          onClick={() => update(i, { gender: g })}
                          className={cn(
                            'rounded-full border px-4 py-2 type-body-medium',
                            c.gender === g
                              ? 'border-navy-900 bg-navy-900 text-fg-inverse'
                              : 'border-line bg-surface',
                          )}
                        >
                          {g === 'male' ? 'Laki-laki' : 'Perempuan'}
                        </button>
                      ))}
                    </div>
                    {errors[`${i}.gender`] ? (
                      <p className="mt-1 type-caption text-danger">{errors[`${i}.gender`]}</p>
                    ) : null}
                  </fieldset>
                  <Input
                    label="Sekolah"
                    value={c.school}
                    onChange={(e) => update(i, { school: e.target.value })}
                  />
                  {ku !== undefined ? (
                    <Alert
                      tone="warning"
                      icon={IconLayers}
                      className="bg-brand-tint text-brand-dark"
                    >
                      Perkiraan kelompok: {kuLabel(ku)} (dihitung dari tanggal kompetisi klub)
                    </Alert>
                  ) : null}
                  <Select
                    label="Jenis dokumen usia"
                    value={c.documentKind}
                    options={[
                      { value: 'akta', label: 'Akta kelahiran' },
                      { value: 'kia', label: 'KIA (Kartu Identitas Anak)' },
                      { value: 'kk', label: 'Kartu keluarga' },
                    ]}
                    onChange={(e) =>
                      update(i, { documentKind: e.target.value as Child['documentKind'] })
                    }
                  />
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-control border border-dashed bg-surface p-4',
                      errors[`${i}.file`]
                        ? 'border-danger'
                        : c.file
                          ? 'border-success'
                          : 'border-line',
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-tint text-brand">
                      {c.file ? <IconCheck size={20} /> : <IconUpload size={20} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate type-body-medium">
                        {c.file ? c.file.name : 'Unggah akta kelahiran / KIA'}
                      </span>
                      <span className="block type-caption text-fg-muted">
                        Foto jelas, maks. 5 MB · hanya dilihat admin
                      </span>
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => update(i, { file: e.target.files?.[0] ?? null })}
                    />
                  </label>
                  {errors[`${i}.file`] ? (
                    <p className="-mt-3 type-caption text-danger">{errors[`${i}.file`]}</p>
                  ) : null}
                </section>
              );
            })}
            {children.length < 6 ? (
              <Button
                variant="ghost"
                className="self-start"
                onClick={() => setChildren([...children, emptyChild()])}
              >
                + Daftarkan anak lain
              </Button>
            ) : null}
            <label
              className={cn(
                'flex items-start gap-3 rounded-control border bg-surface p-4',
                errors.consent ? 'border-danger' : 'border-line',
              )}
            >
              <input
                type="checkbox"
                className="mt-1 size-5 accent-[var(--color-brand)]"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span className="type-body-sm">
                Saya, orang tua/wali, menyetujui data anak diproses {info.name} melalui SportGather
                sesuai Kebijakan Privasi.
              </span>
            </label>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="type-h3">Nomor WhatsApp wali</h2>
              {account ? (
                <Alert tone="success">
                  Masuk sebagai {account}. Info jadwal, tagihan, dan rapor dikirim ke WhatsApp ini.
                </Alert>
              ) : (
                <>
                  <p className="type-body-sm text-fg-secondary">
                    Kami kirim kode untuk memastikan nomor ini milik Anda.
                  </p>
                  <OtpLogin
                    purpose="signup"
                    askName
                    submitLabel="Verifikasi"
                    onSuccess={async () => {
                      const me = await fetch('/api/me').then((r) => (r.ok ? r.json() : null));
                      setAccount(me?.user?.fullName ?? 'Wali');
                    }}
                  />
                </>
              )}
              {errors.account ? <p className="type-caption text-danger">{errors.account}</p> : null}
            </section>
            <Select
              label="Hubungan dengan anak"
              value={guardian.relation}
              options={Object.entries(RELATION_LABEL).map(([value, label]) => ({ value, label }))}
              onChange={(e) => setGuardian({ ...guardian, relation: e.target.value })}
            />
            <Input
              label="Kontak darurat (selain Anda)"
              value={guardian.emergencyContactName}
              onChange={(e) => setGuardian({ ...guardian, emergencyContactName: e.target.value })}
              error={errors.emergencyContactName}
            />
            <Input
              label="No. kontak darurat"
              type="tel"
              value={guardian.emergencyContactPhone}
              onChange={(e) => setGuardian({ ...guardian, emergencyContactPhone: e.target.value })}
              error={errors.emergencyContactPhone}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            {children.map((c, i) => (
              <Card key={i} className="flex flex-col gap-1 p-4">
                <p className="type-h3">{c.fullName}</p>
                <p className="type-body-sm text-fg-secondary">
                  {c.birthDate} · {c.gender === 'male' ? 'Laki-laki' : 'Perempuan'} · perkiraan{' '}
                  {kuLabel(estimate(c.birthDate) ?? null)}
                </p>
                <p className="type-caption text-fg-muted">{c.file?.name}</p>
              </Card>
            ))}
            <Card className="flex flex-col gap-1 p-4">
              <p className="type-body-medium">
                Wali: {account} ({RELATION_LABEL[guardian.relation as keyof typeof RELATION_LABEL]})
              </p>
              <p className="type-body-sm text-fg-secondary">
                Kontak darurat: {guardian.emergencyContactName} · {guardian.emergencyContactPhone}
              </p>
            </Card>
            {error ? <Alert tone="danger">{error}</Alert> : null}
          </>
        ) : null}
      </main>

      <footer className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px] border-t border-line bg-surface px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {step === 0 ? (
          <Button block onClick={() => validateChildren() && setStep(1)}>
            Lanjut: data wali
          </Button>
        ) : step === 1 ? (
          <Button block onClick={() => validateGuardian() && setStep(2)}>
            Lanjut: tinjau
          </Button>
        ) : (
          <Button block onClick={() => void submit()} disabled={busy}>
            {busy ? 'Mengirim…' : `Kirim pendaftaran (${children.length} anak)`}
          </Button>
        )}
      </footer>
    </div>
  );
}
