import type { ChildSummary, CoachSummaryDto } from '@sportgather/shared';
import { Avatar, Badge, Card } from '@sportgather/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage, getMe } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Pelatih' };

const years = (e: { startYear: number; endYear: number | null }) =>
  `${e.startYear} – ${e.endYear ?? 'sekarang'}`;

// M7 · Wali mengenal pelatih tim anaknya (hanya lisensi terverifikasi & masih berlaku)
export default async function PelatihAnak({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}) {
  const { membershipId } = await params;
  const me = await getMe(`/wali/pelatih/${membershipId}`);
  const children = await apiPage<ChildSummary[]>('/me/children');
  const child = children.find((c) => c.membershipId === membershipId);
  if (!child) notFound();
  const coaches = await apiPage<CoachSummaryDto[]>(`/me/children/${membershipId}/coaches`);
  return (
    <MobileShell
      base="/wali"
      role="wali"
      title="Pelatih"
      subtitle={`${child.fullName} · ${child.teamName ?? child.orgName}`}
      backHref="/wali"
      userName={me.user.fullName}
    >
      <div className="flex flex-col gap-4">
        {coaches.length === 0 ? (
          <Card className="p-5 type-body text-fg-secondary">
            Tim anak Anda belum punya pelatih yang terdaftar di aplikasi.
          </Card>
        ) : null}
        {coaches.map((c) => (
          <Card key={c.staffId} className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <Avatar
                name={c.fullName}
                size={56}
                src={
                  c.hasPhoto
                    ? `/api/me/children/${membershipId}/coaches/${c.staffId}/photo`
                    : undefined
                }
              />
              <div className="min-w-0 flex-1">
                <p className="type-h3">{c.fullName}</p>
                <p className="type-caption text-fg-muted">
                  {[
                    c.headline ?? `Pelatih ${c.teamName}`,
                    c.yearsCoaching !== null ? `${c.yearsCoaching} tahun melatih` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
            {c.specialization ? (
              <p className="type-body-sm text-fg-secondary">Spesialisasi: {c.specialization}</p>
            ) : null}
            {c.bio ? <p className="type-body whitespace-pre-line">{c.bio}</p> : null}
            <section className="flex flex-col gap-2">
              <h2 className="type-caption-bold text-fg-secondary">Lisensi</h2>
              {c.licenses.length === 0 ? (
                <p className="type-body-sm text-fg-muted">Belum ada lisensi terverifikasi.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {c.licenses.map((l) => (
                    <li key={l.name} className="flex items-center gap-2">
                      <Badge tone="success">Terverifikasi</Badge>
                      <span className="type-body-sm">
                        {l.name}
                        {l.issuer ? ` · ${l.issuer}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {c.experiences.length ? (
              <section className="flex flex-col gap-2">
                <h2 className="type-caption-bold text-fg-secondary">Pengalaman</h2>
                <ul className="flex flex-col gap-1">
                  {c.experiences.map((e) => (
                    <li key={`${e.title}-${e.startYear}`} className="type-body-sm">
                      {e.title} · {e.organization}{' '}
                      <span className="text-fg-muted">({years(e)})</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Card>
        ))}
      </div>
    </MobileShell>
  );
}
