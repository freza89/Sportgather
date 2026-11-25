'use client';

import { formatRupiah } from '@sportgather/shared';
import { Alert, Button, Card } from '@sportgather/ui';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

type Tx = { orderId: string; grossAmount: string; transactionStatus: string; finishUrl: string };

export function MockPay({ orderId }: { orderId: string }) {
  const [tx, setTx] = useState<Tx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Tx>('GET', `/dev/midtrans/${encodeURIComponent(orderId)}`).then((r) =>
      r.ok ? setTx(r.data) : setError(r.message),
    );
  }, [orderId]);

  async function simulate(outcome: 'settlement' | 'expire' | 'deny') {
    setBusy(true);
    const r = await api<{ finishUrl: string }>(
      'POST',
      `/dev/midtrans/${encodeURIComponent(orderId)}/simulate`,
      { outcome },
    );
    if (!r.ok) {
      setBusy(false);
      return setError(r.message);
    }
    window.location.assign(r.data.finishUrl);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-4 bg-canvas p-6">
      <Alert tone="warning">
        Midtrans tiruan (lokal). Set PAYMENT_PROVIDER=real untuk memakai sandbox Midtrans.
      </Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {tx ? (
        <Card className="flex flex-col gap-4 p-6">
          <span className="type-caption text-fg-muted">{tx.orderId}</span>
          <span className="type-stat">{formatRupiah(Math.round(Number(tx.grossAmount)))}</span>
          <span className="type-body">Status: {tx.transactionStatus}</span>
          <Button disabled={busy} onClick={() => simulate('settlement')}>
            Bayar (berhasil)
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => simulate('deny')}>
            Tolak
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => simulate('expire')}>
            Kedaluwarsa
          </Button>
        </Card>
      ) : null}
    </main>
  );
}
