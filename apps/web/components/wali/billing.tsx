'use client';

import {
  formatRupiah,
  formatTanggalIso,
  PAYMENT_METHODS,
  type CheckoutQuote,
  type CheckoutResult,
  type CheckoutStatus,
  type GuardianInvoice,
  type GuardianPayment,
  type PaymentMethod,
} from '@sportgather/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  IconBuilding,
  IconCheck,
  IconDownload,
  IconQr,
  IconShield,
  IconWallet,
  type IconProps,
} from '@sportgather/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { api } from '@/lib/api-client';

const METHOD_ICON: Record<PaymentMethod, ComponentType<IconProps>> = {
  qris: IconQr,
  bca_va: IconBuilding,
  mandiri_va: IconBuilding,
  bri_va: IconBuilding,
  gopay: IconWallet,
  shopeepay: IconWallet,
};
const METHOD_LABEL: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  bca_va: 'VA BCA',
  mandiri_va: 'VA Mandiri',
  bri_va: 'VA BRI',
  qris: 'QRIS',
  gopay: 'GoPay',
  shopeepay: 'ShopeePay',
};

/** O-05: pilih tagihan (per klub) lalu lanjut bayar. */
export function InvoicePicker({ items }: { items: GuardianInvoice[] }) {
  const router = useRouter();
  const orgs = [...new Set(items.map((i) => i.orgSlug))];
  const [org, setOrg] = useState(orgs[0] ?? '');
  const inOrg = items.filter((i) => i.orgSlug === org);
  const [selected, setSelected] = useState<string[]>(inOrg.map((i) => i.id));
  const total = inOrg.filter((i) => selected.includes(i.id)).reduce((a, i) => a + i.total, 0);

  if (!items.length)
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <span className="rounded-full bg-success-bg p-3 text-success">
          <IconCheck />
        </span>
        <span className="type-h3">Semua tagihan lunas</span>
        <span className="type-caption text-fg-muted">
          Terima kasih! Riwayat ada di tab Riwayat.
        </span>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      {orgs.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {orgs.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                setOrg(o);
                setSelected(items.filter((i) => i.orgSlug === o).map((i) => i.id));
              }}
              className={
                org === o
                  ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
                  : 'rounded-full border border-line bg-surface px-3 py-[6px] type-caption-bold'
              }
            >
              {items.find((i) => i.orgSlug === o)!.orgName}
            </button>
          ))}
        </div>
      ) : null}
      <Card className="overflow-hidden">
        {inOrg.map((i) => (
          <label
            key={i.id}
            className="flex items-start gap-3 border-b border-line px-4 py-4 last:border-0"
          >
            <input
              type="checkbox"
              className="mt-1 size-5 accent-brand"
              checked={selected.includes(i.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id),
                )
              }
            />
            <div className="flex flex-1 flex-col">
              <span className="type-body-medium">{i.description}</span>
              <span className="type-caption text-fg-muted">
                {i.childName} · jatuh tempo {formatTanggalIso(i.dueDate)}
              </span>
              {i.overdueDays > 0 ? (
                <Badge tone="danger" className="mt-1 self-start">
                  Terlambat {i.overdueDays} hari
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-col items-end">
              <span className="type-body-medium tabular-nums">{formatRupiah(i.total)}</span>
              {i.discount ? (
                <span className="type-caption text-success">
                  beasiswa −{formatRupiah(i.discount)}
                </span>
              ) : null}
            </div>
          </label>
        ))}
      </Card>
      <Button
        block
        disabled={!selected.length}
        onClick={() => router.push(`/wali/bayar?ids=${selected.join(',')}`)}
      >
        Bayar {formatRupiah(total)}
      </Button>
    </div>
  );
}

/** O-06: riwayat pembayaran + kuitansi PDF. */
export function PaymentHistory({ items }: { items: GuardianPayment[] }) {
  if (!items.length)
    return <Card className="p-6 type-body text-fg-secondary">Belum ada pembayaran.</Card>;
  return (
    <Card className="overflow-hidden">
      {items.map((p) => (
        <div
          key={p.paymentId}
          className="flex items-start gap-3 border-b border-line px-4 py-4 last:border-0"
        >
          <span className="rounded-input bg-success-bg p-2 text-success">
            <IconCheck size={20} />
          </span>
          <div className="flex flex-1 flex-col">
            <span className="type-body-medium">{p.description}</span>
            <span className="type-caption text-fg-muted">
              {p.childName} · {METHOD_LABEL[p.method] ?? p.method} ·{' '}
              {formatTanggalIso(p.paidAt.slice(0, 10))}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="type-body-medium tabular-nums">{formatRupiah(p.amount)}</span>
            <a
              href={`/api/me/payments/${p.paymentId}/receipt`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 type-caption-bold text-brand"
            >
              <IconDownload size={14} /> Kuitansi
            </a>
          </div>
        </div>
      ))}
    </Card>
  );
}

/** O-05 · Bayar iuran: rincian + metode + biaya layanan → Midtrans Snap. */
export function PayForm({ invoices }: { invoices: GuardianInvoice[] }) {
  const [quotes, setQuotes] = useState<CheckoutQuote[] | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('qris');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useMemo(() => invoices.map((i) => i.id), [invoices]);

  useEffect(() => {
    void api<CheckoutQuote[]>('POST', '/me/checkout/quote', { invoiceIds: ids }).then((r) =>
      r.ok ? setQuotes(r.data) : setError(r.message),
    );
  }, [ids]);

  const q = quotes?.find((x) => x.method === method);

  async function pay() {
    setBusy(true);
    setError(null);
    const r = await api<CheckoutResult>('POST', '/me/checkout', { invoiceIds: ids, method });
    if (!r.ok) {
      setBusy(false);
      return setError(r.message);
    }
    window.location.assign(r.data.redirectUrl);
  }

  return (
    <div className="flex flex-col gap-5 pb-28">
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="type-h3">Rincian tagihan</h2>
        {invoices.map((i) => (
          <div key={i.id} className="flex justify-between gap-3 type-body">
            <span className="text-fg-secondary">
              {i.childName} · {i.description}
            </span>
            <span className="tabular-nums">{formatRupiah(i.total)}</span>
          </div>
        ))}
        {q && q.serviceFee > 0 ? (
          <div className="flex justify-between type-body">
            <span className="text-fg-secondary">Biaya layanan {PAYMENT_METHODS[method].label}</span>
            <span className="tabular-nums">{formatRupiah(q.serviceFee)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="type-body-medium">Total</span>
          <span className="type-stat tabular-nums">
            {formatRupiah(q?.gross ?? invoices.reduce((a, i) => a + i.total, 0))}
          </span>
        </div>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="type-h3">Metode pembayaran</h2>
        <Card className="overflow-hidden" role="radiogroup" aria-label="Metode pembayaran">
          {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => {
            const Icon = METHOD_ICON[m];
            const fee = quotes?.find((x) => x.method === m)?.serviceFee;
            return (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-3 border-b border-line px-4 py-3 last:border-0"
              >
                <Icon size={20} />
                <span className="flex flex-1 flex-col">
                  <span className="type-body">{PAYMENT_METHODS[m].label}</span>
                  <span className="type-caption text-fg-muted">
                    {[
                      PAYMENT_METHODS[m].hint,
                      fee
                        ? `+ biaya ${formatRupiah(fee)}`
                        : fee === 0
                          ? 'tanpa biaya layanan'
                          : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <input
                  type="radio"
                  name="method"
                  className="size-5 accent-brand"
                  checked={method === m}
                  onChange={() => setMethod(m)}
                />
              </label>
            );
          })}
        </Card>
      </section>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-[480px] flex-col gap-2 border-t border-line bg-surface px-5 pt-3 pb-6">
        <span className="flex items-center justify-center gap-1 type-caption text-fg-muted">
          <IconShield size={14} /> Pembayaran diproses aman oleh Midtrans
        </span>
        <Button block disabled={busy || !q} onClick={pay}>
          {busy
            ? 'Menghubungkan ke Midtrans…'
            : `Bayar ${formatRupiah(q?.gross ?? 0)} dengan ${PAYMENT_METHODS[method].label}`}
        </Button>
      </div>
    </div>
  );
}

/** Halaman setelah kembali dari Midtrans: cek status (server mengecek ulang ke Midtrans). */
export function CheckoutResultView({ checkoutId }: { checkoutId: string }) {
  const [st, setSt] = useState<CheckoutStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let tries = 0;
    async function tick() {
      const r = await api<CheckoutStatus>('GET', `/me/checkout/${checkoutId}`);
      if (stop) return;
      if (!r.ok) return setError(r.message);
      setSt(r.data);
      // VA bisa dibayar belakangan: cek beberapa kali lalu berhenti (tombol muat ulang tersedia).
      if (r.data.status === 'pending' && ++tries < 20) setTimeout(tick, 3000);
    }
    void tick();
    return () => {
      stop = true;
    };
  }, [checkoutId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!st) return <Card className="p-6 type-body text-fg-secondary">Memeriksa pembayaran…</Card>;
  const view = {
    paid: {
      tone: 'success' as const,
      title: 'Pembayaran berhasil',
      text: 'Kuitansi sudah tersedia di Riwayat dan dikirim lewat WhatsApp.',
    },
    pending: {
      tone: 'warning' as const,
      title: 'Menunggu pembayaran',
      text: 'Selesaikan pembayaran di aplikasi bank/e-wallet Anda. Halaman ini akan diperbarui otomatis.',
    },
    expired: {
      tone: 'danger' as const,
      title: 'Pembayaran kedaluwarsa',
      text: 'Batas waktu pembayaran habis. Silakan bayar ulang dari halaman Tagihan.',
    },
    failed: {
      tone: 'danger' as const,
      title: 'Pembayaran gagal',
      text: 'Pembayaran ditolak atau dibatalkan. Silakan coba lagi.',
    },
  }[st.status];
  return (
    <div className="flex flex-col gap-4">
      <Alert tone={view.tone}>
        <span className="flex flex-col gap-1">
          <strong>{view.title}</strong>
          {view.text}
        </span>
      </Alert>
      <Card className="flex flex-col gap-3 p-5">
        {st.invoices.map((i) => (
          <div key={i.id} className="flex justify-between gap-3 type-body">
            <span className="text-fg-secondary">
              {i.childName} · {i.description}
            </span>
            <span className="tabular-nums">{formatRupiah(i.total)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-line pt-3 type-body-medium">
          <span>Total ({PAYMENT_METHODS[st.method as PaymentMethod]?.label ?? st.method})</span>
          <span className="tabular-nums">{formatRupiah(st.gross)}</span>
        </div>
      </Card>
      <Link
        href={st.status === 'paid' ? '/wali/tagihan?tab=riwayat' : '/wali/tagihan'}
        className="text-center type-body-medium text-brand"
      >
        {st.status === 'paid' ? 'Lihat riwayat & kuitansi' : 'Kembali ke tagihan'}
      </Link>
    </div>
  );
}
