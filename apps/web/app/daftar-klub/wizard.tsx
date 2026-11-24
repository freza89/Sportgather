'use client';

import {
  BANKS,
  BankAccountInputSchema,
  BranchInputSchema,
  CreateOrgSchema,
  OrgProfileSchema,
  ZONA_WAKTU,
  type BranchInput,
  type OrgSummary,
} from '@sportgather/shared';
import {
  Alert,
  Button,
  Card,
  IconPlus,
  IconUpload,
  IconX,
  Input,
  Select,
  Stepper,
} from '@sportgather/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OtpLogin } from '@/components/auth/otp-login';
import { api, fieldErrors } from '@/lib/api-client';

const STEPS = ['Profil klub', 'Lokasi latihan', 'Rekening'];
const TZ_OPTIONS = Object.entries(ZONA_WAKTU).map(([value, label]) => ({ value, label }));
const BANK_OPTIONS = Object.entries(BANKS).map(([value, label]) => ({ value, label }));
const emptyBranch = (): BranchInput => ({
  name: '',
  address: '',
  timezone: 'Asia/Jakarta',
  courts: 1,
});

type Account = { fullName: string; phone: string | null } | null;

export function RegisterClubWizard({ account: initialAccount }: { account: Account }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<Account>(initialAccount);
  const [profile, setProfile] = useState({ name: '', city: '' });
  const [branches, setBranches] = useState<BranchInput[]>([emptyBranch()]);
  const [bank, setBank] = useState({ bankCode: '', accountNumber: '', holderName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function nextFromProfile() {
    const r = OrgProfileSchema.safeParse({ ...profile, sport: 'basketball' });
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    if (!account) return setError('Verifikasi nomor WhatsApp owner terlebih dahulu.');
    setError(null);
    setBank((b) => ({ ...b, holderName: b.holderName || profile.name }));
    setStep(1);
  }

  function nextFromBranches() {
    const errs: Record<string, string> = {};
    branches.forEach((b, i) => {
      const r = BranchInputSchema.safeParse(b);
      if (!r.success)
        for (const [k, v] of Object.entries(fieldErrors(r.error.issues))) errs[`${i}.${k}`] = v;
    });
    setErrors(errs);
    if (Object.keys(errs).length === 0) setStep(2);
  }

  async function submit() {
    const r = BankAccountInputSchema.safeParse(bank);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    // WhatsApp klub default = nomor owner (bisa diubah di Pengaturan).
    const payload = {
      ...profile,
      sport: 'basketball',
      ...(account?.phone ? { whatsapp: account.phone } : {}),
      branches,
      bankAccount: bank,
    };
    const check = CreateOrgSchema.safeParse(payload);
    if (!check.success) return setError(check.error.issues[0]?.message ?? 'Data belum lengkap');
    setBusy(true);
    setError(null);
    const res = await api<OrgSummary>('POST', '/orgs', payload);
    if (!res.ok) {
      setBusy(false);
      return setError(res.message);
    }
    router.replace(`/admin/${res.data.slug}`);
    router.refresh();
  }

  const updateBranch = (i: number, patch: Partial<BranchInput>) =>
    setBranches((list) => list.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <Card className="flex flex-col gap-6 p-6 sm:p-10">
      <Stepper steps={STEPS} current={step} />

      {step === 0 ? (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="type-h1">Daftarkan klub Anda</h2>
            <p className="type-body text-fg-secondary">
              Isi profil singkat. Anda bisa melengkapi data lain setelah klub aktif.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <Input
              label="Nama klub / akademi"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              error={errors.name}
            />
            <Select
              label="Olahraga"
              value="basketball"
              disabled
              options={[{ value: 'basketball', label: 'Basket' }]}
            />
            <Input
              label="Kota"
              value={profile.city}
              onChange={(e) => setProfile({ ...profile, city: e.target.value })}
              error={errors.city}
            />
            <div className="flex items-center gap-3 rounded-control border border-dashed border-line p-4 opacity-60">
              <span className="flex size-10 items-center justify-center rounded-control bg-brand-tint text-brand">
                <IconUpload size={20} />
              </span>
              <div className="flex flex-col">
                <span className="type-body-medium">Unggah logo klub</span>
                <span className="type-caption text-fg-muted">
                  PNG/JPG, maks. 2 MB · bisa diatur setelah klub aktif
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <h3 className="type-h3">Akun owner</h3>
            {account ? (
              <p className="type-body text-fg-secondary">
                Anda akan menjadi owner sebagai{' '}
                <strong className="text-fg">{account.fullName}</strong>
                {account.phone ? ` · ${account.phone}` : ''}.
              </p>
            ) : (
              <>
                <p className="type-body-sm text-fg-secondary">
                  Nomor WhatsApp owner dipakai untuk masuk dan menerima notifikasi klub.
                </p>
                <OtpLogin
                  purpose="signup"
                  askName
                  submitLabel="Verifikasi"
                  onSuccess={async () => {
                    const me = await api<{ user: { fullName: string; phone: string | null } }>(
                      'GET',
                      '/me',
                    );
                    if (me.ok)
                      setAccount({ fullName: me.data.user.fullName, phone: me.data.user.phone });
                  }}
                />
              </>
            )}
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button block onClick={nextFromProfile} disabled={!account}>
            Lanjut ke lokasi latihan
          </Button>
          <p className="text-center type-body-sm text-fg-secondary">
            Sudah punya akun?{' '}
            <Link href="/masuk" className="text-brand">
              Masuk
            </Link>
          </p>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="type-h1">Lokasi latihan</h2>
            <p className="type-body text-fg-secondary">
              Lapangan atau GOR tempat klub berlatih. Zona waktu dipakai untuk jadwal & pengingat.
            </p>
          </div>
          {branches.map((b, i) => (
            <fieldset key={i} className="flex flex-col gap-4 rounded-control bg-canvas p-4">
              <div className="flex items-center justify-between">
                <legend className="type-h3">Lokasi {i + 1}</legend>
                {branches.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Hapus lokasi ${i + 1}`}
                    className="text-fg-muted hover:text-danger"
                    onClick={() => setBranches(branches.filter((_, j) => j !== i))}
                  >
                    <IconX size={18} />
                  </button>
                ) : null}
              </div>
              <Input
                label="Nama lokasi"
                placeholder="GOR Pajajaran"
                value={b.name}
                onChange={(e) => updateBranch(i, { name: e.target.value })}
                error={errors[`${i}.name`]}
              />
              <Input
                label="Alamat"
                value={b.address}
                onChange={(e) => updateBranch(i, { address: e.target.value })}
                error={errors[`${i}.address`]}
              />
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Zona waktu"
                  value={b.timezone}
                  options={TZ_OPTIONS}
                  onChange={(e) => updateBranch(i, { timezone: e.target.value })}
                />
                <Input
                  label="Jumlah lapangan"
                  type="number"
                  min={1}
                  value={String(b.courts ?? 1)}
                  onChange={(e) => updateBranch(i, { courts: Number(e.target.value) })}
                  error={errors[`${i}.courts`]}
                />
              </div>
            </fieldset>
          ))}
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => setBranches([...branches, emptyBranch()])}
          >
            <IconPlus size={18} /> Tambah lokasi
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Kembali
            </Button>
            <Button className="flex-1" onClick={nextFromBranches}>
              Lanjut ke rekening
            </Button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="type-h1">Rekening penerimaan</h2>
            <p className="type-body text-fg-secondary">
              Iuran yang dibayar online disalurkan ke rekening ini setelah dipotong biaya.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <Select
              label="Bank"
              value={bank.bankCode}
              placeholder="Pilih bank"
              options={BANK_OPTIONS}
              onChange={(e) => setBank({ ...bank, bankCode: e.target.value })}
              error={errors.bankCode}
            />
            <Input
              label="Nomor rekening"
              inputMode="numeric"
              value={bank.accountNumber}
              onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })}
              error={errors.accountNumber}
            />
            <Input
              label="Nama pemilik rekening"
              hint="Harus sama persis dengan nama di buku tabungan."
              value={bank.holderName}
              onChange={(e) => setBank({ ...bank, holderName: e.target.value })}
              error={errors.holderName}
            />
          </div>
          <Alert tone="warning">
            Rekening diverifikasi otomatis (nama pemilik harus cocok). Penyaluran dana ditahan
            sampai rekening terverifikasi.
          </Alert>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} disabled={busy}>
              Kembali
            </Button>
            <Button className="flex-1" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Mendaftarkan…' : 'Daftarkan klub'}
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}
