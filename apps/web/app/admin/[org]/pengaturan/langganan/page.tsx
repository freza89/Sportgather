import { PLANS, formatRupiah } from '@sportgather/shared';
import { Badge, Card } from '@sportgather/ui';
import { PlanCard } from '@/components/settings/plan-card';
import { SettingsHeader } from '@/components/settings/settings-header';
import { loadSettings } from '@/lib/settings-data';

export default async function LanggananPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const s = await loadSettings(slug);
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        base={`/admin/${slug}`}
        title="Langganan"
        subtitle="Paket berdasarkan jumlah pemain aktif"
      />
      <div className="grid items-start gap-6 xl:grid-cols-[380px_1fr]">
        <PlanCard plan={s.org.plan} activePlayers={0} />
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="type-h3">Pilihan paket</h2>
          {Object.entries(PLANS).map(([key, p]) => (
            <div key={key} className="flex items-center gap-3 rounded-control bg-canvas px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="type-body-medium">
                  {p.label} {key === s.org.plan ? <Badge tone="brand">Paket Anda</Badge> : null}
                </p>
                <p className="type-caption text-fg-secondary">{p.summary}</p>
              </div>
              <span className="type-body-medium whitespace-nowrap">
                {p.priceMonthly === null
                  ? 'Negosiasi'
                  : p.priceMonthly === 0
                    ? 'Gratis'
                    : `${formatRupiah(p.priceMonthly)}/bln`}
              </span>
            </div>
          ))}
          <p className="type-caption text-fg-muted">
            Perubahan paket dibantu tim SportGather selama masa pilot.
          </p>
        </Card>
      </div>
    </div>
  );
}
