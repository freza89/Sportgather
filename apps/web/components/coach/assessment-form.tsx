'use client';

import { ASSESSMENT_EDIT_DAYS, type AssessmentSheet } from '@sportgather/shared';
import {
  Alert,
  Avatar,
  Button,
  Card,
  IconBack,
  IconCheck,
  IconChevron,
  IconClock,
} from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';

/** P-04: satu pemain per layar, skor 1–5 per skill, catatan untuk orang tua. */
export function AssessmentForm({
  slug,
  sheet,
  initialPlayer,
}: {
  slug: string;
  sheet: AssessmentSheet;
  initialPlayer?: string | undefined;
}) {
  const router = useRouter();
  const start = Math.max(
    0,
    sheet.players.findIndex((p) => p.membershipId === initialPlayer),
  );
  const [idx, setIdx] = useState(start);
  const player = sheet.players[idx];
  const [scores, setScores] = useState<Record<string, number>>(player?.scores ?? {});
  const [note, setNote] = useState(player?.note ?? '');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!player)
    return <Card className="p-5 type-body text-fg-secondary">Belum ada pemain di tim ini.</Card>;
  const done = sheet.players.filter((p) => Object.keys(p.scores).length > 0).length;
  const editable = player.editable;

  function go(next: number) {
    const p = sheet.players[next]!;
    setIdx(next);
    setScores(p.scores);
    setNote(p.note ?? '');
    setMsg(null);
  }

  async function save() {
    const list = Object.entries(scores).map(([skillId, score]) => ({ skillId, score }));
    if (!list.length) return setMsg({ tone: 'danger', text: 'Isi minimal satu skor' });
    setBusy(true);
    const r = await api('PUT', `/orgs/${slug}/coach/assessments`, {
      teamId: sheet.team.id,
      membershipId: player!.membershipId,
      scores: list,
      note: note.trim(),
    });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'danger', text: r.message });
    setMsg({ tone: 'success', text: 'Penilaian tersimpan' });
    router.refresh();
    if (idx < sheet.players.length - 1) setTimeout(() => go(idx + 1), 400);
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <Card className="flex items-center gap-2 p-4">
        <button
          type="button"
          aria-label="Pemain sebelumnya"
          disabled={idx === 0}
          onClick={() => go(idx - 1)}
          className="rounded-full p-1 text-fg-secondary disabled:opacity-30"
        >
          <IconBack size={20} />
        </button>
        <div className="flex flex-1 flex-col items-center gap-1 text-center">
          <Avatar name={player.fullName} size={52} />
          <span className="type-h3">{player.fullName}</span>
          <span className="type-caption text-fg-muted">
            Pemain {idx + 1} dari {sheet.players.length}
            {player.jerseyNumber !== null ? ` · #${player.jerseyNumber}` : ''} · {done} sudah
            dinilai
          </span>
        </div>
        <button
          type="button"
          aria-label="Pemain berikutnya"
          disabled={idx === sheet.players.length - 1}
          onClick={() => go(idx + 1)}
          className="rounded-full p-1 text-fg-secondary disabled:opacity-30"
        >
          <IconChevron size={20} />
        </button>
      </Card>
      {sheet.published ? (
        <Alert tone="info">Rapor semester ini sudah terbit. Penilaian terkunci.</Alert>
      ) : !editable ? (
        <Alert tone="warning">
          Dinilai {player.assessedByName ?? 'pelatih lain'}. Hanya penilai yang bisa mengubah,
          paling lama {ASSESSMENT_EDIT_DAYS} hari setelah disimpan.
        </Alert>
      ) : null}
      <Card className="flex flex-col gap-4 p-4">
        {sheet.skills.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="type-body">{s.name}</span>
              {s.description ? (
                <span className="type-caption text-fg-muted">{s.description}</span>
              ) : null}
            </span>
            <div className="flex gap-1.5" role="radiogroup" aria-label={`Skor ${s.name}`}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = scores[s.id] === n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${s.name} ${n}`}
                    disabled={!editable}
                    onClick={() => setScores({ ...scores, [s.id]: n })}
                    className={`size-[34px] rounded-full type-caption-bold transition-colors disabled:opacity-60 ${on ? 'bg-brand text-fg-inverse' : 'border border-line bg-surface text-fg'}`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Card>
      <label className="flex flex-col gap-2">
        <span className="type-caption-bold">Catatan untuk orang tua</span>
        <textarea
          className="min-h-24 rounded-input border border-line bg-surface px-4 py-3 type-body focus:border-brand focus:outline-none disabled:opacity-60"
          value={note}
          maxLength={500}
          disabled={!editable}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Perkembangan & saran latihan di rumah"
        />
      </label>
      <span className="flex items-center gap-2 type-caption text-fg-muted">
        <IconClock size={16} /> Penilaian bisa diubah hingga {ASSESSMENT_EDIT_DAYS} hari setelah
        disimpan.
      </span>
      {msg ? (
        <Alert tone={msg.tone} {...(msg.tone === 'success' ? { icon: IconCheck } : {})}>
          {msg.text}
        </Alert>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px] border-t border-line bg-surface px-5 pt-3 pb-6">
        <Button block disabled={busy || !editable} onClick={save}>
          {busy
            ? 'Menyimpan…'
            : idx < sheet.players.length - 1
              ? 'Simpan & lanjut'
              : 'Simpan penilaian'}
        </Button>
      </div>
    </div>
  );
}
