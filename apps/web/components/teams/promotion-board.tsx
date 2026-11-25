'use client';

import {
  kuLabel,
  formatTanggalIso,
  type PromotionPreview,
  type PromotionRow,
} from '@sportgather/shared';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  IconLayers,
  StatCard,
  type BadgeTone,
} from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';

type Action = 'auto' | 'leave' | 'skip';
const STATUS: Record<PromotionRow['status'], { tone: BadgeTone; label: string }> = {
  naik: { tone: 'success', label: 'Otomatis' },
  tetap: { tone: 'neutral', label: 'Tetap' },
  lulus: { tone: 'warning', label: 'Perlu keputusan' },
  perlu_keputusan: { tone: 'warning', label: 'Perlu keputusan' },
};

function defaultAction(r: PromotionRow): Action | '' {
  if (r.status === 'perlu_keputusan' || r.status === 'lulus') return '';
  return 'auto';
}

// A-11 · Kenaikan KU musim baru
export function PromotionBoard({ slug, preview }: { slug: string; preview: PromotionPreview }) {
  const router = useRouter();
  const saved = new Map(
    (
      (preview.draft?.decisions as { membershipId: string; action: Action }[] | undefined) ?? []
    ).map((d) => [d.membershipId, d.action]),
  );
  const [actions, setActions] = useState<Record<string, Action | ''>>(
    Object.fromEntries(
      preview.rows.map((r) => [r.membershipId, saved.get(r.membershipId) ?? defaultAction(r)]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = preview.rows.filter((r) => !actions[r.membershipId]).length;
  const changing = preview.rows.filter(
    (r) => r.oldKu !== r.newKu && actions[r.membershipId] !== 'skip',
  ).length;

  async function submit(draft: boolean) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const decisions = Object.entries(actions)
      .filter(([, a]) => a)
      .map(([membershipId, action]) => ({ membershipId, action }));
    const res = await api<{ applied: boolean; placed?: number; teamsCreated?: number }>(
      'POST',
      `/orgs/${slug}/promotion`,
      { decisions, draft },
    );
    setBusy(false);
    if (!res.ok) return setError(res.message);
    if (draft) return setNotice('Draf disimpan. Perubahan belum berlaku.');
    router.push(`/admin/${slug}/tim`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Kenaikan KU · {preview.toSeason.name}</h1>
          <p className="type-body text-fg-secondary">
            Acuan lama {formatTanggalIso(preview.fromSeason.referenceDate)} → acuan baru{' '}
            {formatTanggalIso(preview.toSeason.referenceDate)}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => void submit(true)} disabled={busy}>
            Simpan draf
          </Button>
          <Button onClick={() => void submit(false)} disabled={busy || pending > 0}>
            {busy ? 'Memproses…' : `Setujui ${changing} perubahan`}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pemain aktif" value={String(preview.summary.total)} />
        <StatCard
          label="Naik KU otomatis"
          value={String(preview.summary.naik)}
          note="dari usia pada acuan baru"
        />
        <StatCard label="Tetap di KU" value={String(preview.summary.tetap)} />
        <StatCard
          label="Perlu keputusan"
          value={String(preview.summary.perluKeputusan + preview.summary.lulus)}
          note="lulus KU tertua / play-up / play-down"
          noteTone="danger"
        />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead className="border-b border-line bg-canvas/60 type-caption-bold text-fg-secondary">
            <tr>
              <th className="px-4 py-3">Pemain</th>
              <th className="px-4 py-3">
                KU {preview.fromSeason.name.replace(/\D+/g, '')} →{' '}
                {preview.toSeason.name.replace(/\D+/g, '')}
              </th>
              <th className="px-4 py-3">Tim usulan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Keputusan</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => {
              const needs = r.status === 'perlu_keputusan' || r.status === 'lulus';
              return (
                <tr key={r.membershipId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.fullName} size={32} />
                      <div>
                        <p className="type-body-medium">{r.fullName}</p>
                        <p className="type-caption text-fg-muted">
                          lahir {formatTanggalIso(r.birthDate)}
                          {r.currentTeam ? ` · ${r.currentTeam}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Badge tone="neutral">{kuLabel(r.oldKu)}</Badge>›
                      <Badge tone={r.newKu === null ? 'warning' : 'brand'}>
                        {kuLabel(r.newKu)}
                      </Badge>
                    </span>
                  </td>
                  <td className="px-4 py-3 type-body">
                    {r.suggestedTeam?.name ?? <span className="text-fg-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Keputusan untuk ${r.fullName}`}
                      value={actions[r.membershipId]}
                      onChange={(e) =>
                        setActions({ ...actions, [r.membershipId]: e.target.value as Action })
                      }
                      className={`h-9 rounded-control border bg-surface px-2 type-body-sm ${needs && !actions[r.membershipId] ? 'border-warning' : 'border-line'}`}
                    >
                      {needs ? <option value="">Pilih tindakan…</option> : null}
                      {r.newKu !== null ? (
                        <option value="auto">
                          {r.suggestedTeam ? 'Ikut tim usulan' : 'Naik KU (tanpa tim)'}
                        </option>
                      ) : null}
                      <option value="skip">
                        {r.newKu === null ? 'Tetap aktif tanpa tim' : 'Jangan tempatkan dulu'}
                      </option>
                      <option value="leave">
                        {r.newKu === null ? 'Lulus / keluar' : 'Keluar dari klub'}
                      </option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {pending > 0 ? <Alert tone="warning">{pending} pemain belum diputuskan.</Alert> : null}
      <Alert tone="warning" icon={IconLayers}>
        Perubahan baru berlaku setelah disetujui: musim baru menjadi aktif dan tim yang belum ada
        dibuat otomatis (pelatih disalin dari tim lama).
      </Alert>
    </div>
  );
}
