'use client';

import {
  formatRupiah,
  formatTanggalIso,
  ManualPaymentSchema,
  OneTimeFeeSchema,
  periodLabel,
  PAYMENT_METHODS,
  type InvoiceDto,
  type PlayerListResponse,
} from '@sportgather/shared';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  IconMore,
  Input,
  Select,
  type BadgeTone,
} from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, apiUpload, fieldErrors, MAX_UPLOAD_BYTES } from '@/lib/api-client';
import { todayJakarta } from '@/lib/dates';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  ...Object.fromEntries(Object.entries(PAYMENT_METHODS).map(([k, v]) => [k, v.label])),
};
const SHORT_METHOD: Record<string, string> = {
  bca_va: 'VA BCA',
  mandiri_va: 'VA Mandiri',
  bri_va: 'VA BRI',
};

function statusBadge(i: InvoiceDto): { tone: BadgeTone; label: string } {
  if (i.status === 'paid')
    return i.paidVia === 'online'
      ? { tone: 'success', label: 'Lunas' }
      : { tone: 'info', label: 'Lunas (manual)' };
  if (i.status === 'waived') return { tone: 'brand', label: 'Dibebaskan' };
  if (i.status === 'void') return { tone: 'neutral', label: 'Dibatalkan' };
  if (i.overdueDays > 0) return { tone: 'danger', label: `Terlambat H+${i.overdueDays}` };
  return { tone: 'warning', label: 'Menunggu' };
}

function methodText(i: InvoiceDto) {
  if (!i.method) return '—';
  const m = SHORT_METHOD[i.method] ?? METHOD_LABEL[i.method] ?? i.method;
  return i.paidVia === 'online' ? m : `${m}${i.method === 'transfer' ? ' · bukti' : ''}`;
}

/** Tombol kepala A-14: terbitkan iuran periode & biaya lain. */
export function InvoiceActions({ slug, period }: { slug: string; period: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [oneTime, setOneTime] = useState(false);

  async function issue() {
    if (!confirm(`Terbitkan iuran ${periodLabel(period)} untuk semua pemain aktif sekarang?`))
      return;
    setBusy(true);
    const res = await api<{ created: number; skippedOnLeave: number; skippedExisting: number }>(
      'POST',
      `/orgs/${slug}/billing/invoices/issue`,
      { period },
    );
    setBusy(false);
    setMsg(
      res.ok
        ? {
            tone: 'success',
            text: `${res.data.created} tagihan terbit · ${res.data.skippedExisting} sudah ada · ${res.data.skippedOnLeave} pemain cuti dilewati`,
          }
        : { tone: 'danger', text: res.message },
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setOneTime(true)}>
          Biaya lain
        </Button>
        <Button onClick={issue} disabled={busy}>
          {busy ? 'Menerbitkan…' : `Terbitkan iuran ${periodLabel(period)}`}
        </Button>
      </div>
      {msg ? (
        <span className={`type-caption ${msg.tone === 'success' ? 'text-success' : 'text-danger'}`}>
          {msg.text}
        </span>
      ) : null}
      <OneTimeDialog slug={slug} open={oneTime} onClose={() => setOneTime(false)} />
    </div>
  );
}

function OneTimeDialog({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerListResponse['rows']>([]);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    dueDate: '',
    ids: [] as string[],
  });
  const [filter, setFilter] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || players.length) return;
    void api<PlayerListResponse>('GET', `/orgs/${slug}/players?pageSize=100&status=active`).then(
      (r) => r.ok && setPlayers(r.data.rows),
    );
  }, [open, players.length, slug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = OneTimeFeeSchema.safeParse({
      description: form.description,
      amount: form.amount,
      dueDate: form.dueDate,
      membershipIds: form.ids,
    });
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api('POST', `/orgs/${slug}/billing/invoices/one-time`, r.data);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onClose();
    setForm({ description: '', amount: '', dueDate: '', ids: [] });
    router.refresh();
  }

  const shown = players.filter((p) => p.fullName.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Biaya lain"
      description="Mis. jersey, turnamen, atau camp. Ditagihkan ke pemain yang dipilih."
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Input
          label="Keterangan"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Jersey tandang 2027"
          error={errors.description}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Nominal (Rp)"
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })}
            error={errors.amount}
          />
          <Input
            label="Jatuh tempo"
            type="date"
            min={todayJakarta()}
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            error={errors.dueDate}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="type-caption-bold">Pemain ({form.ids.length} dipilih)</span>
            <button
              type="button"
              className="type-caption-bold text-brand"
              onClick={() =>
                setForm({
                  ...form,
                  ids: form.ids.length === players.length ? [] : players.map((p) => p.membershipId),
                })
              }
            >
              {form.ids.length === players.length ? 'Kosongkan' : 'Pilih semua'}
            </button>
          </div>
          <input
            className="rounded-input border border-line px-3 py-2 type-body"
            placeholder="Cari nama…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="max-h-56 overflow-y-auto rounded-input border border-line">
            {shown.map((p) => (
              <label
                key={p.membershipId}
                className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0 type-body"
              >
                <input
                  type="checkbox"
                  checked={form.ids.includes(p.membershipId)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      ids: e.target.checked
                        ? [...form.ids, p.membershipId]
                        : form.ids.filter((x) => x !== p.membershipId),
                    })
                  }
                />
                {p.fullName}
                <span className="ml-auto type-caption text-fg-muted">
                  {p.team?.name ?? (p.ku ? `KU${p.ku}` : '')}
                </span>
              </label>
            ))}
          </div>
          {errors.membershipIds ? (
            <span className="type-caption text-danger">{errors.membershipIds}</span>
          ) : null}
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Terbitkan tagihan'}
        </Button>
      </form>
    </Dialog>
  );
}

// A-14 · Tabel tagihan + aksi per baris.
export function InvoiceTable({ slug, invoices }: { slug: string; invoices: InvoiceDto[] }) {
  const [manualFor, setManualFor] = useState<InvoiceDto | null>(null);
  const [waiveFor, setWaiveFor] = useState<InvoiceDto | null>(null);
  if (!invoices.length)
    return (
      <Card className="p-6 type-body text-fg-secondary">Tidak ada tagihan untuk filter ini.</Card>
    );
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left">
        <thead className="border-b border-line bg-canvas">
          <tr className="type-caption-bold text-fg-secondary">
            <th className="px-4 py-3">No. tagihan</th>
            <th className="px-4 py-3">Pemain</th>
            <th className="px-4 py-3">Untuk</th>
            <th className="px-4 py-3 text-right">Jumlah</th>
            <th className="px-4 py-3">Jatuh tempo</th>
            <th className="px-4 py-3">Metode</th>
            <th className="px-4 py-3">Status</th>
            <th className="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => {
            const b = statusBadge(i);
            return (
              <tr key={i.id} className="border-b border-line last:border-0 type-body">
                <td className="px-4 py-3 tabular-nums">{i.number}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={i.playerName} size={32} />
                    <div className="flex flex-col">
                      <span>{i.playerName}</span>
                      <span className="type-caption text-fg-muted">
                        {i.discount
                          ? `Beasiswa ${Math.round((i.discount / i.amount) * 100)}%`
                          : (i.teamName ?? '—')}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{i.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(i.total)}</td>
                <td className="px-4 py-3">
                  {i.status === 'waived' ? '—' : formatTanggalIso(i.dueDate)}
                </td>
                <td className="px-4 py-3">{methodText(i)}</td>
                <td className="px-4 py-3">
                  <Badge tone={b.tone}>{b.label}</Badge>
                </td>
                <td className="px-4 py-3">
                  <RowMenu
                    slug={slug}
                    invoice={i}
                    onManual={() => setManualFor(i)}
                    onWaive={() => setWaiveFor(i)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ManualPaymentDialog slug={slug} invoice={manualFor} onClose={() => setManualFor(null)} />
      <WaiveDialog slug={slug} invoice={waiveFor} onClose={() => setWaiveFor(null)} />
    </Card>
  );
}

function RowMenu({
  slug,
  invoice: i,
  onManual,
  onWaive,
}: {
  slug: string;
  invoice: InvoiceDto;
  onManual: () => void;
  onWaive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const base = `/api/orgs/${slug}/billing/invoices/${i.id}`;
  const items: { label: string; href?: string; onClick?: () => void }[] = [];
  if (i.status === 'unpaid') {
    items.push({ label: 'Catat bayar manual', onClick: onManual });
    items.push({ label: 'Bebaskan tagihan', onClick: onWaive });
  }
  if (i.status === 'paid') items.push({ label: 'Kuitansi (PDF)', href: `${base}/receipt` });
  if (i.status === 'paid' && i.method === 'transfer')
    items.push({ label: 'Lihat bukti transfer', href: `${base}/proof` });
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Aksi tagihan"
        aria-expanded={open}
        className="rounded-full p-1 text-fg-secondary hover:bg-canvas"
        onClick={() => setOpen(!open)}
      >
        <IconMore size={20} />
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 flex w-52 flex-col rounded-card border border-line bg-surface py-1 shadow-md">
          {items.map((it) =>
            it.href ? (
              <a
                key={it.label}
                href={it.href}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 type-body hover:bg-canvas"
              >
                {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                type="button"
                className="px-4 py-2 text-left type-body hover:bg-canvas"
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function ManualPaymentDialog({
  slug,
  invoice,
  onClose,
}: {
  slug: string;
  invoice: InvoiceDto | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    method: 'cash',
    paidAt: todayJakarta(),
    reference: '',
    note: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    const r = ManualPaymentSchema.safeParse({
      method: form.method,
      paidAt: form.paidAt,
      ...(form.reference ? { reference: form.reference } : {}),
      ...(form.note ? { note: form.note } : {}),
    });
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    if (form.method === 'transfer' && !file) return setError('Unggah bukti transfer');
    if (file && file.size > MAX_UPLOAD_BYTES) return setError('Ukuran file maksimal 5 MB');
    setBusy(true);
    const path = `/orgs/${slug}/billing/invoices/${invoice.id}/manual-payment`;
    let res;
    if (file) {
      const fd = new FormData();
      fd.set('data', JSON.stringify(r.data));
      fd.set('proof', file);
      res = await apiUpload(path, fd);
    } else {
      res = await api('POST', path, r.data);
    }
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setFile(null);
    setError(null);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={Boolean(invoice)}
      onClose={onClose}
      title="Catat bayar manual"
      description={
        invoice ? `${invoice.number} · ${invoice.playerName} · ${formatRupiah(invoice.total)}` : ''
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Select
          label="Metode"
          value={form.method}
          onChange={(e) => setForm({ ...form, method: e.target.value })}
          options={[
            { value: 'cash', label: 'Tunai' },
            { value: 'transfer', label: 'Transfer bank (wajib bukti)' },
          ]}
        />
        <Input
          label="Tanggal bayar"
          type="date"
          max={todayJakarta()}
          value={form.paidAt}
          onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
          error={errors.paidAt}
        />
        {form.method === 'transfer' ? (
          <Input
            label="No. referensi (opsional)"
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        ) : null}
        <label className="flex flex-col gap-2 type-caption-bold">
          Bukti {form.method === 'transfer' ? '(wajib)' : '(opsional)'} · JPG, PNG, PDF maks. 5 MB
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="type-body"
          />
        </label>
        <Input
          label="Catatan (opsional)"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        <Alert tone="info">
          Pembayaran manual tidak lewat Midtrans, jadi tidak masuk saldo penyaluran dana.
        </Alert>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Tandai lunas'}
        </Button>
      </form>
    </Dialog>
  );
}

function WaiveDialog({
  slug,
  invoice,
  onClose,
}: {
  slug: string;
  invoice: InvoiceDto | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setBusy(true);
    const res = await api('PATCH', `/orgs/${slug}/billing/invoices/${invoice.id}/status`, {
      status: 'waived',
      reason,
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setReason('');
    onClose();
    router.refresh();
  }
  return (
    <Dialog
      open={Boolean(invoice)}
      onClose={onClose}
      title="Bebaskan tagihan"
      description={invoice ? `${invoice.number} · ${invoice.playerName}` : ''}
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Input
          label="Alasan"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Mis. cedera panjang, kebijakan klub"
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" variant="dark" disabled={busy || reason.trim().length < 3}>
          Bebaskan
        </Button>
      </form>
    </Dialog>
  );
}
