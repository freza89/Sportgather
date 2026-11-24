import { PLANS, formatRupiah, type Plan } from '@sportgather/shared';
import { Badge, Card } from '@sportgather/ui';

/** Paket langganan (harga hipotesis PRD bagian 9; penagihan langganan belum ada di MVP). */
export function PlanCard({ plan, activePlayers }: { plan: string; activePlayers: number }) {
  const p = PLANS[plan as Plan] ?? PLANS.starter;
  const pct = p.maxPlayers ? Math.min(100, Math.round((activePlayers / p.maxPlayers) * 100)) : 0;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="type-h3">Langganan</h2>
        <Badge tone="brand">{p.label}</Badge>
      </div>
      <p className="type-h1">
        {p.priceMonthly === null
          ? 'Negosiasi'
          : p.priceMonthly === 0
            ? 'Gratis'
            : `${formatRupiah(p.priceMonthly)} / bulan`}
      </p>
      <p className="type-body text-fg-secondary">
        {p.maxPlayers ? `Hingga ${p.maxPlayers} pemain aktif · ` : ''}
        {p.summary}
      </p>
      {p.maxPlayers ? (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between type-caption">
            <span className="text-fg-muted">Pemakaian</span>
            <span className="font-bold">
              {activePlayers} / {p.maxPlayers} pemain
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-canvas"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
