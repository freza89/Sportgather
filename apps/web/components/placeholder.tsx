import { Badge, Card } from '@sportgather/ui';
import type { NavEntry } from '@/lib/navigation';

/** Penanda halaman yang dibangun di milestone berikutnya. */
export function Placeholder({ entry }: { entry: NavEntry }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-6">
      <div className="flex flex-wrap gap-2">
        {entry.screens.map((s) => (
          <Badge key={s} tone="brand">
            {s}
          </Badge>
        ))}
        <Badge tone="info">Dibangun di {entry.milestone}</Badge>
      </div>
      <h2 className="type-h2">{entry.label}</h2>
      <p className="type-body text-fg-secondary">
        Kerangka navigasi sudah siap. Isi layar ini mengikuti desain Figma dan dikerjakan pada
        milestone {entry.milestone}.
      </p>
    </Card>
  );
}
