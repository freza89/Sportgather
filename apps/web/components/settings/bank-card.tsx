'use client';

import {
  BANKS,
  BankAccountInputSchema,
  formatTanggal,
  type BankAccountDto,
} from '@sportgather/shared';
import { Alert, Badge, Button, Card, Dialog, IconBuilding, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

const BANK_OPTIONS = Object.entries(BANKS).map(([value, label]) => ({ value, label }));
const STATUS = {
  verified: { tone: 'success', label: 'Terverifikasi' },
  pending_verification: { tone: 'warning', label: 'Menunggu verifikasi' },
  rejected: { tone: 'danger', label: 'Ditolak' },
  replaced: { tone: 'neutral', label: 'Diganti' },
} as const;

export function BankCard({
  slug,
  account,
  canEdit,
  defaultHolder,
}: {
  slug: string;
  account: BankAccountDto | null;
  canEdit: boolean;
  defaultHolder: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bankCode: '', accountNumber: '', holderName: defaultHolder });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = BankAccountInputSchema.safeParse(form);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api<BankAccountDto>('PUT', `/orgs/${slug}/bank-account`, form);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  const status = account ? STATUS[account.status] : null;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-h3">Rekening penerimaan</h2>
        {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
      </div>
      {account ? (
        <div className="flex items-center gap-3 rounded-control bg-canvas px-4 py-3">
          <IconBuilding size={22} className="shrink-0" />
          <div className="min-w-0">
            <p className="type-h3">{account.maskedNumber}</p>
            <p className="type-caption text-fg-muted">
              a.n. {account.holderName}
              {account.verifiedAt
                ? ` · diverifikasi ${formatTanggal(new Date(account.verifiedAt))}`
                : ''}
            </p>
          </div>
        </div>
      ) : (
        <p className="type-body text-fg-secondary">Belum ada rekening.</p>
      )}
      {account?.status === 'rejected' && account.verificationNote ? (
        <Alert tone="danger">
          Verifikasi gagal: {account.verificationNote}. Periksa data lalu ganti rekening.
        </Alert>
      ) : null}
      <Alert tone="warning">
        Ganti rekening butuh persetujuan owner dan verifikasi ulang. Penyaluran dana ditahan sampai
        rekening baru terverifikasi.
      </Alert>
      {canEdit ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setError(null);
            setErrors({});
            setOpen(true);
          }}
        >
          Ganti rekening
        </Button>
      ) : (
        <p className="type-caption text-fg-muted">Hanya owner yang dapat mengganti rekening.</p>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Ganti rekening penerimaan"
        description="Rekening baru diverifikasi ulang sebelum menerima penyaluran."
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Select
            label="Bank"
            value={form.bankCode}
            placeholder="Pilih bank"
            options={BANK_OPTIONS}
            onChange={(e) => setForm({ ...form, bankCode: e.target.value })}
            error={errors.bankCode}
          />
          <Input
            label="Nomor rekening"
            inputMode="numeric"
            value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            error={errors.accountNumber}
          />
          <Input
            label="Nama pemilik rekening"
            value={form.holderName}
            onChange={(e) => setForm({ ...form, holderName: e.target.value })}
            error={errors.holderName}
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Memverifikasi…' : 'Simpan & verifikasi'}
          </Button>
        </form>
      </Dialog>
    </Card>
  );
}
