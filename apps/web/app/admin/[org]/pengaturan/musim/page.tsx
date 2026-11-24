import { Badge, Card } from '@sportgather/ui';
import { SettingsHeader } from '@/components/settings/settings-header';

export default async function MusimPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        base={`/admin/${slug}`}
        title="Musim & kompetisi"
        subtitle="Tanggal kompetisi menjadi acuan perhitungan KU"
      />
      <Card className="flex flex-col items-start gap-3 p-6">
        <div className="flex gap-2">
          <Badge tone="brand">A-05</Badge>
          <Badge tone="info">Dibangun di M2</Badge>
        </div>
        <p className="type-body text-fg-secondary">
          Musim, kompetisi utama, dan aturan KU dibuat bersama modul pemain & KU.
        </p>
      </Card>
    </div>
  );
}
