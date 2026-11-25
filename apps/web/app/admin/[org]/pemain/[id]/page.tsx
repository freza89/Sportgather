import {
  DOCUMENT_KIND_LABEL,
  formatAge,
  formatPhone,
  formatTanggalIso,
  GENDER_LABEL,
  RELATION_LABEL,
  type PlayerDetail,
} from '@sportgather/shared';
import { Avatar, Badge, Card, IconFile } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DocBadge, KuBadge, MemberStatusBadge, PlacementBadge } from '@/components/players/badges';
import { EditPlayerDialog } from '@/components/players/edit-player-dialog';
import { apiPage } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Profil pemain' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-[6px] type-body">
      <span className="text-fg-secondary">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

// A-07 · Profil pemain
export default async function ProfilPemainPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org: slug, id } = await params;
  const p = await apiPage<PlayerDetail>(
    `/orgs/${slug}/players/${id}`,
    `/admin/${slug}/pemain/${id}`,
  );
  const docStatus = p.documents.some((d) => d.kind !== 'foto' && d.status === 'verified')
    ? 'verified'
    : p.documents.some((d) => d.kind !== 'foto' && d.status === 'pending')
      ? 'pending'
      : p.documents.some((d) => d.kind !== 'foto')
        ? 'rejected'
        : 'missing';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Profil pemain</h1>
          <p className="type-body text-fg-secondary">
            <Link href={`/admin/${slug}/pemain`} className="hover:text-fg">
              Pemain
            </Link>{' '}
            › {p.fullName}
          </p>
        </div>
        <EditPlayerDialog slug={slug} player={p} />
      </div>

      <Card className="flex flex-wrap items-center gap-5 p-6">
        <Avatar name={p.fullName} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="type-h1">{p.fullName}</h2>
          <div className="flex flex-wrap gap-2">
            <KuBadge ku={p.ku} />
            {p.team ? (
              <Badge tone="neutral">
                {p.team.name}
                {p.team.jerseyNumber !== null ? ` · #${p.team.jerseyNumber}` : ''}
              </Badge>
            ) : null}
            {p.team && p.team.placement !== 'same' ? (
              <PlacementBadge placement={p.team.placement as 'play_up'} />
            ) : null}
            {docStatus === 'verified' ? (
              <Badge tone="success">Usia terverifikasi</Badge>
            ) : (
              <DocBadge status={docStatus} />
            )}
            {p.status !== 'active' ? (
              <MemberStatusBadge status={p.status} reason={p.statusReason} />
            ) : null}
          </div>
        </div>
        <div className="flex gap-8">
          <div>
            <p className="type-caption text-fg-secondary">Bergabung</p>
            <p className="type-h3">{formatTanggalIso(p.joinedAt.slice(0, 10))}</p>
          </div>
          <div>
            <p className="type-caption text-fg-secondary">Kehadiran 30 hari</p>
            <p className="type-h3 text-fg-muted">— (M3)</p>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="mb-2 type-h3">Data diri</h2>
            <Row label="Tanggal lahir">{formatTanggalIso(p.birthDate, true)}</Row>
            <Row label="Gender">{p.gender ? GENDER_LABEL[p.gender] : '—'}</Row>
            <Row label="Sekolah">{p.school ?? '—'}</Row>
            <Row label={`KU pada acuan ${formatTanggalIso(p.referenceDate)}`}>
              {p.ku === null ? 'Lulus' : `KU${p.ku}`}
              {p.age ? ` (${formatAge(p.age)})` : ''}
            </Row>
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 type-h3">Wali & kontak darurat</h2>
            {p.guardians.map((g) => (
              <div key={g.personId}>
                <Row label={g.isPrimary ? 'Wali utama' : 'Wali'}>
                  {g.fullName} (
                  {RELATION_LABEL[g.relation as keyof typeof RELATION_LABEL] ?? g.relation})
                </Row>
                <Row label="WhatsApp">{g.phone ? formatPhone(g.phone) : '—'}</Row>
              </div>
            ))}
            <Row label="Kontak darurat">
              {p.emergencyContactName
                ? `${p.emergencyContactName}${p.emergencyContactPhone ? ` · ${formatPhone(p.emergencyContactPhone)}` : ''}`
                : '—'}
            </Row>
            <Row label="Persetujuan data">
              {p.consentAt
                ? `Disetujui ${formatTanggalIso(p.consentAt.slice(0, 10))}`
                : p.source === 'import'
                  ? 'Belum (data impor)'
                  : '—'}
            </Row>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 type-h3">Dokumen</h2>
            {p.documents.length === 0 ? (
              <p className="type-body text-fg-secondary">Belum ada dokumen.</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {p.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3">
                  <IconFile size={18} className="shrink-0 text-fg-secondary" />
                  {/* Setiap pembukaan dokumen tercatat di audit log. */}
                  <a
                    href={`/api/orgs/${slug}/documents/${d.id}/content`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate type-body hover:text-brand"
                  >
                    {DOCUMENT_KIND_LABEL[d.kind]} · {d.fileName}
                  </a>
                  <DocBadge
                    status={
                      d.status === 'verified'
                        ? 'verified'
                        : d.status === 'pending'
                          ? 'pending'
                          : 'rejected'
                    }
                  />
                </li>
              ))}
            </ul>
            <p className="mt-3 type-caption text-fg-muted">
              Dokumen hanya bisa dibuka owner & admin; setiap akses tercatat di audit log.
            </p>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="mb-2 type-h3">Riwayat tim</h2>
            {p.teamHistory.length === 0 ? (
              <p className="type-body text-fg-secondary">Belum pernah masuk tim.</p>
            ) : null}
            {p.teamHistory.map((h, i) => (
              <Row key={i} label={`${h.seasonName}`}>
                {h.teamName}
                <span className="block type-caption text-fg-muted">
                  {formatTanggalIso(h.joinedAt.slice(0, 10))} –{' '}
                  {h.leftAt ? formatTanggalIso(h.leftAt.slice(0, 10)) : 'sekarang'}
                </span>
              </Row>
            ))}
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 type-h3">Tagihan terakhir</h2>
            <p className="type-body text-fg-secondary">Tersedia setelah modul iuran (M4).</p>
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 type-h3">Penilaian skill</h2>
            <p className="type-body text-fg-secondary">Tersedia setelah modul pembinaan (M5).</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
