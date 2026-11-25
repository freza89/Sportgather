'use client';

import {
  classifyPlacement,
  DOCUMENT_KIND_LABEL,
  formatPhone,
  formatTanggalIso,
  GENDER_LABEL,
  kuLabel,
  RELATION_LABEL,
  type RegistrationQueueItem,
  type TeamSummary,
} from '@sportgather/shared';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  IconCheck,
  IconFile,
  IconShield,
  Input,
  Select,
  cn,
} from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';

// A-08 · Antrean verifikasi: daftar di kiri, detail + pratinjau dokumen di kanan.
function MatchCheck({
  checked,
  onChange,
  label,
  value,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  value: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-control border p-3',
        checked ? 'border-success bg-success-bg/40' : 'border-line',
      )}
    >
      <input
        type="checkbox"
        className="size-4 accent-[var(--color-success)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex-1">
        <span className="block type-caption-bold text-fg-secondary">{label}</span>
        <span className="block type-body">{value}</span>
      </span>
      {checked ? <IconCheck size={18} className="text-success" /> : null}
    </label>
  );
}

export function VerificationQueue({
  slug,
  items,
  teams,
}: {
  slug: string;
  items: RegistrationQueueItem[];
  teams: TeamSummary[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(items[0]?.membershipId ?? null);
  const selected = items.find((i) => i.membershipId === selectedId) ?? items[0] ?? null;
  const [checks, setChecks] = useState({ name: false, birth: false, gender: false });
  const [teamId, setTeamId] = useState('');
  const [reason, setReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!selected) {
    return (
      <Card className="p-8 text-center type-body text-fg-secondary">
        Tidak ada pendaftar yang menunggu verifikasi.
      </Card>
    );
  }
  const doc =
    selected.documents.find((d) => d.kind !== 'foto' && d.status === 'pending') ??
    selected.documents[0];
  const docUrl = doc ? `/api/orgs/${slug}/documents/${doc.id}/content` : null;
  const team = teams.find((t) => t.id === teamId);
  const placement =
    team && selected.ku !== undefined ? classifyPlacement(selected.ku, team.ku) : 'same';
  const allChecked = checks.name && checks.birth && checks.gender;
  const sortedTeams = [...teams].sort(
    (a, b) => Number(b.ku === selected.ku) - Number(a.ku === selected.ku) || a.ku - b.ku,
  );

  function select(id: string) {
    setSelectedId(id);
    setChecks({ name: false, birth: false, gender: false });
    setTeamId('');
    setReason('');
    setError(null);
  }

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await api('POST', `/orgs/${slug}/registrations/${selected!.membershipId}/accept`, {
      ...(teamId ? { teamId } : {}),
      ...(reason ? { placementReason: reason } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  async function reject() {
    setBusy(true);
    setError(null);
    const res = await api('POST', `/orgs/${slug}/registrations/${selected!.membershipId}/reject`, {
      reason: rejectReason,
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setRejectOpen(false);
    setRejectReason('');
    router.refresh();
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[320px_1fr]">
      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.membershipId}>
            <button
              type="button"
              onClick={() => select(i.membershipId)}
              className={cn(
                'flex w-full items-center gap-3 rounded-card border bg-surface p-4 text-left',
                i.membershipId === selected.membershipId
                  ? 'border-brand'
                  : 'border-line hover:border-fg-muted',
              )}
            >
              <Avatar name={i.fullName} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate type-body-medium">{i.fullName}</span>
                <span className="block truncate type-caption text-fg-muted">
                  {kuLabel(i.ku)} · daftar {formatTanggalIso(i.submittedAt.slice(0, 10))} ·{' '}
                  {i.documents[0] ? DOCUMENT_KIND_LABEL[i.documents[0].kind] : 'tanpa dokumen'}
                </span>
              </span>
              <Badge tone="warning">Menunggu</Badge>
            </button>
          </li>
        ))}
      </ul>

      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="type-h2">{selected.fullName}</h2>
            {selected.guardian ? (
              <p className="type-caption text-fg-secondary">
                Didaftarkan oleh {selected.guardian.fullName} (
                {RELATION_LABEL[selected.guardian.relation as keyof typeof RELATION_LABEL]})
                {selected.guardian.phone ? ` · ${formatPhone(selected.guardian.phone)}` : ''}
              </p>
            ) : null}
          </div>
          <Badge tone="brand">{kuLabel(selected.ku)} (otomatis)</Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 overflow-hidden rounded-control bg-canvas p-2">
            {docUrl && doc?.mimeType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element -- dokumen privat via proxy API, bukan aset statis
              <img
                src={docUrl}
                alt={`${DOCUMENT_KIND_LABEL[doc.kind]} ${selected.fullName}`}
                className="max-h-[420px] w-full object-contain"
              />
            ) : docUrl ? (
              <a
                href={docUrl}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-2 text-brand"
              >
                <IconFile size={32} /> Buka {doc?.fileName}
              </a>
            ) : (
              <p className="type-body text-fg-secondary">Tidak ada dokumen</p>
            )}
            {doc ? (
              <p className="type-caption text-fg-muted">{doc.fileName} · terenkripsi</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="type-h3">Cocokkan data dengan dokumen</h3>
            <MatchCheck
              checked={checks.name}
              onChange={(v) => setChecks({ ...checks, name: v })}
              label="Nama sesuai dokumen"
              value={selected.fullName}
            />
            <MatchCheck
              checked={checks.birth}
              onChange={(v) => setChecks({ ...checks, birth: v })}
              label="Tanggal lahir sesuai dokumen"
              value={formatTanggalIso(selected.birthDate)}
            />
            <MatchCheck
              checked={checks.gender}
              onChange={(v) => setChecks({ ...checks, gender: v })}
              label="Gender sesuai dokumen"
              value={selected.gender ? GENDER_LABEL[selected.gender] : '—'}
            />
            <Alert tone="info" icon={IconShield}>
              Akses dokumen ini tercatat di audit log.
            </Alert>
          </div>
        </div>

        <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <Select
            label="Masukkan ke tim (opsional)"
            value={teamId}
            options={[
              { value: '', label: 'Nanti saja' },
              ...sortedTeams.map((t) => ({
                value: t.id,
                label: `${t.name}${t.ku === selected.ku ? ' · KU sesuai' : ''}`,
              })),
            ]}
            onChange={(e) => setTeamId(e.target.value)}
          />
          {placement !== 'same' ? (
            <Input
              label={placement === 'play_up' ? 'Alasan play-up (wajib)' : 'Alasan (hanya owner)'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          ) : null}
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            variant="danger"
            onClick={() => {
              setError(null);
              setRejectOpen(true);
            }}
            disabled={busy}
          >
            Tolak dengan alasan
          </Button>
          <Button onClick={() => void accept()} disabled={busy || !allChecked}>
            {busy ? 'Memproses…' : teamId ? 'Verifikasi & masukkan ke tim' : 'Verifikasi'}
          </Button>
        </div>
        {!allChecked ? (
          <p className="text-right type-caption text-fg-muted">
            Centang ketiga data setelah dicocokkan dengan dokumen.
          </p>
        ) : null}
      </Card>

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`Tolak dokumen ${selected.fullName}`}
        description="Alasan dikirim ke wali lewat WhatsApp agar bisa memperbaiki dan mengirim ulang."
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Alasan penolakan"
            placeholder="mis. Foto akta buram, nama tidak terbaca"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button
            variant="danger"
            onClick={() => void reject()}
            disabled={busy || rejectReason.trim().length < 5}
          >
            Tolak & kirim ke wali
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
