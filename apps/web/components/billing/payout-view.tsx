'use client';

import { formatRupiah, PAYMENT_METHODS, type PayoutOverview } from '@sportgather/shared';
import { Alert, Badge, Button, Card, Dialog, Input, type BadgeTone } from '@sportgather/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useState, type FormEvent } from 'react';
import { api } from '@/lib/api-client';

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const WD_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  processing: { tone: 'warning', label: 'Diproses' },
  completed: { tone: 'success', label: 'Tersalurkan' },
  failed: { tone: 'danger', label: 'Gagal' },
};

const ACCOUNT_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  verified: { tone: 'success', label: 'Terverifikasi' },
  pending_verification: { tone: 'warning', label: 'Menunggu verifikasi' },
  rejected: { tone: 'danger', label: 'Ditolak' },
};

export function PayoutView({
  slug,
  data,
  isOwner,
}: {
  slug: string;
  data: PayoutOverview;
  isOwner: boolean;
}) {
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const acct = data.bankAccount;
  const verified = acct?.status === 'verified';

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-2 border-navy-900 bg-navy-900 p-6 text-fg-inverse">
          <span className="type-caption-bold opacity-80">Saldo bisa ditarik</span>
          <span className="type-stat">{formatRupiah(data.available)}</span>
          <span className="type-caption opacity-80">
            {data.pending > 0
              ? `${formatRupiah(data.pending)} masih menunggu settlement`
              : `Total sudah ditarik ${formatRupiah(data.totalWithdrawn)}`}
          </span>
          {isOwner ? (
            <Button
              className="mt-2 self-start"
              disabled={!verified || data.available < data.policy.minAmount}
              onClick={() => setWithdrawOpen(true)}
            >
              Tarik dana
            </Button>
          ) : (
            <span className="mt-2 type-caption opacity-80">Penarikan hanya oleh owner</span>
          )}
        </Card>
        <Card className="flex flex-col gap-2 p-6">
          <span className="type-caption-bold text-fg-secondary">Skema penyaluran</span>
          <span className="type-h3">Penarikan manual</span>
          <span className="type-caption text-fg-secondary">
            Owner menarik dana kapan saja ke rekening klub. Minimal{' '}
            {formatRupiah(data.policy.minAmount)}, biaya transfer{' '}
            {formatRupiah(data.policy.transferFee)} per penarikan.
          </span>
        </Card>
        <Card className="flex flex-col gap-2 p-6">
          <span className="flex items-center gap-2 type-caption-bold text-fg-secondary">
            Rekening tujuan
            {acct ? (
              <Badge tone={ACCOUNT_STATUS[acct.status]?.tone ?? 'neutral'}>
                {ACCOUNT_STATUS[acct.status]?.label ?? acct.status}
              </Badge>
            ) : null}
          </span>
          {acct ? (
            <>
              <span className="type-h3">{acct.maskedNumber}</span>
              <span className="type-caption text-fg-secondary">a.n. {acct.holderName}</span>
            </>
          ) : (
            <span className="type-body">Belum ada rekening</span>
          )}
          <Link href={`/admin/${slug}/pengaturan/rekening`} className="type-caption text-brand">
            Kelola rekening
          </Link>
        </Card>
      </div>
      {acct && !verified ? (
        <Alert tone="warning">
          Rekening klub belum terverifikasi. Dana tetap tercatat, tetapi baru bisa ditarik setelah
          verifikasi selesai.
        </Alert>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="type-h2">Riwayat penarikan</h2>
        <Card className="overflow-x-auto">
          {data.withdrawals.length === 0 ? (
            <p className="p-6 type-body text-fg-secondary">Belum ada penarikan.</p>
          ) : (
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-line bg-canvas">
                <tr className="type-caption-bold text-fg-secondary">
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                  <th className="px-4 py-3 text-right">Biaya transfer</th>
                  <th className="px-4 py-3 text-right">Diterima rekening</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-line last:border-0 type-body">
                    <td className="px-4 py-3">{fmtDate(w.createdAt)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(w.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(w.fee)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(w.net)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={WD_STATUS[w.status]!.tone}>{WD_STATUS[w.status]!.label}</Badge>
                      {w.failureReason ? (
                        <span className="ml-2 type-caption text-danger">{w.failureReason}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-h2">Pembayaran online masuk</h2>
        <Card className="overflow-x-auto">
          {data.transactions.length === 0 ? (
            <p className="p-6 type-body text-fg-secondary">Belum ada pembayaran online.</p>
          ) : (
            <table className="w-full min-w-[860px] text-left">
              <thead className="border-b border-line bg-canvas">
                <tr className="type-caption-bold text-fg-secondary">
                  <th className="px-4 py-3">Tanggal bayar</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3 text-right">Bruto</th>
                  <th className="px-4 py-3 text-right">Biaya Midtrans</th>
                  <th className="px-4 py-3 text-right">Fee platform</th>
                  <th className="px-4 py-3 text-right">Diterima klub</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <Fragment key={t.checkoutId}>
                    <tr
                      className="cursor-pointer border-b border-line type-body hover:bg-canvas"
                      onClick={() => setExpanded(expanded === t.checkoutId ? null : t.checkoutId)}
                      aria-expanded={expanded === t.checkoutId}
                    >
                      <td className="px-4 py-3">{fmtDate(t.paidAt)}</td>
                      <td className="px-4 py-3">
                        {PAYMENT_METHODS[t.method as keyof typeof PAYMENT_METHODS]?.label ??
                          t.method}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(t.gross)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatRupiah(t.midtransFee)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatRupiah(t.platformFee)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatRupiah(t.clubNet)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={t.available ? 'success' : 'warning'}>
                          {t.available ? 'Bisa ditarik' : 'Menunggu settlement'}
                        </Badge>
                      </td>
                    </tr>
                    {expanded === t.checkoutId
                      ? t.invoices.map((i) => (
                          <tr
                            key={i.number}
                            className="border-b border-line bg-canvas type-caption text-fg-secondary"
                          >
                            <td className="px-4 py-2 pl-8" colSpan={2}>
                              {i.number} · {i.playerName}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {formatRupiah(i.total)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums" colSpan={2}>
                              potongan {formatRupiah(i.total - i.clubNet)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {formatRupiah(i.clubNet)}
                            </td>
                            <td />
                          </tr>
                        ))
                      : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <p className="type-caption text-fg-muted">
          Biaya layanan metode bayar ditanggung wali di checkout. Klik baris untuk menelusuri setiap
          rupiah ke tagihan asalnya.
        </p>
      </section>
      <WithdrawDialog
        slug={slug}
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        data={data}
      />
    </>
  );
}

function WithdrawDialog({
  slug,
  open,
  onClose,
  data,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  data: PayoutOverview;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const n = Number(amount || 0);
  const net = Math.max(0, n - data.policy.transferFee);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ status: string; failureReason: string | null }>(
      'POST',
      `/orgs/${slug}/billing/payouts/withdraw`,
      { amount: n },
    );
    setBusy(false);
    if (!res.ok) return setError(res.message);
    if (res.data.status === 'failed')
      return setError(
        `Transfer gagal: ${res.data.failureReason ?? 'coba lagi'}. Saldo dikembalikan.`,
      );
    setAmount('');
    setError(null);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Tarik dana"
      description={`Saldo bisa ditarik ${formatRupiah(data.available)} → ${data.bankAccount?.maskedNumber ?? ''}`}
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Input
          label="Nominal (Rp)"
          inputMode="numeric"
          value={amount ? n.toLocaleString('id-ID') : ''}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          hint={`Minimal ${formatRupiah(data.policy.minAmount)}`}
        />
        <button
          type="button"
          className="self-start type-caption-bold text-brand"
          onClick={() => setAmount(String(data.available))}
        >
          Tarik semua
        </button>
        <div className="flex flex-col gap-1 rounded-input bg-canvas p-4 type-body">
          <div className="flex justify-between">
            <span>Biaya transfer</span>
            <span>{formatRupiah(-data.policy.transferFee)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Diterima rekening</span>
            <span>{formatRupiah(net)}</span>
          </div>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" disabled={busy || n < data.policy.minAmount || n > data.available}>
          {busy ? 'Memproses…' : `Tarik ${formatRupiah(n)}`}
        </Button>
      </form>
    </Dialog>
  );
}
