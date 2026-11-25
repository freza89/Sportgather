import { kuLabel, type DocStatus } from '@sportgather/shared';
import { Badge } from '@sportgather/ui';

export function KuBadge({ ku }: { ku: number | null }) {
  return <Badge tone={ku === null ? 'neutral' : 'brand'}>{kuLabel(ku)}</Badge>;
}

const DOC = {
  verified: { tone: 'success', label: 'Terverifikasi' },
  pending: { tone: 'warning', label: 'Menunggu' },
  rejected: { tone: 'danger', label: 'Ditolak' },
  missing: { tone: 'neutral', label: 'Belum ada' },
} as const;

export function DocBadge({ status }: { status: DocStatus }) {
  return <Badge tone={DOC[status].tone}>{DOC[status].label}</Badge>;
}

const MEMBER = {
  active: { tone: 'success', label: 'Aktif' },
  on_leave: { tone: 'danger', label: 'Cuti' },
  left: { tone: 'neutral', label: 'Keluar' },
  pending: { tone: 'warning', label: 'Menunggu verifikasi' },
  rejected: { tone: 'danger', label: 'Dokumen ditolak' },
} as const;

export function MemberStatusBadge({ status, reason }: { status: string; reason?: string | null }) {
  const s = MEMBER[status as keyof typeof MEMBER] ?? MEMBER.active;
  return (
    <Badge tone={s.tone}>
      {reason && status === 'on_leave' ? `${s.label} (${reason.toLowerCase()})` : s.label}
    </Badge>
  );
}

const PLACEMENT = {
  same: { tone: 'neutral', label: 'Reguler' },
  play_up: { tone: 'warning', label: 'Play-up' },
  play_down: { tone: 'info', label: 'Play-down' },
  over_age: { tone: 'danger', label: 'Lewat usia' },
} as const;

export function PlacementBadge({
  placement,
  reason,
}: {
  placement: keyof typeof PLACEMENT;
  reason?: string | null;
}) {
  const p = PLACEMENT[placement];
  return (
    <Badge tone={p.tone}>
      {reason && placement !== 'same' ? `${p.label} · ${reason}` : p.label}
    </Badge>
  );
}
