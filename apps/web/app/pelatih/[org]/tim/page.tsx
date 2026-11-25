import { formatPhone, type CoachTeamDto } from '@sportgather/shared';
import { Avatar, Card, IconCalendar, IconChart, IconMessage, IconPin } from '@sportgather/ui';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';

// P-03 · Tim saya (kontak darurat, tanpa dokumen)
export default async function TimSaya({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { me } = await getClubSession(org, `/pelatih/${org}/tim`);
  const teams = await apiPage<CoachTeamDto[]>(`/orgs/${org}/coach/teams`);
  const players = teams.reduce((n, t) => n + t.members.length, 0);
  return (
    <MobileShell
      base={`/pelatih/${org}`}
      role="pelatih"
      title="Tim saya"
      subtitle={`${teams.length} tim · ${players} pemain`}
      userName={me.user.fullName}
    >
      <div className="flex flex-col gap-5">
        {teams.length === 0 ? (
          <Card className="p-5 type-body text-fg-secondary">
            Anda belum ditugaskan ke tim. Hubungi admin klub.
          </Card>
        ) : null}
        {teams.map((t) => (
          <section key={t.id} className="flex flex-col gap-3">
            <h2 className="type-h2">{t.name}</h2>
            <Card className="flex flex-col gap-2 p-4 type-body-sm text-fg-secondary">
              <p className="flex items-center gap-2">
                <IconCalendar size={16} /> {t.schedule}
              </p>
              {t.branchName ? (
                <p className="flex items-center gap-2">
                  <IconPin size={16} /> {t.branchName}
                </p>
              ) : null}
              <p className="flex items-center gap-2">
                <IconChart size={16} /> Kehadiran 30 hari:{' '}
                {t.attendanceRate30d === null ? '—' : `${t.attendanceRate30d}%`}
              </p>
            </Card>
            <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4">
              {t.members.map((m) => (
                <li key={m.membershipId} className="flex items-center gap-3 py-3">
                  <Avatar name={m.fullName} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate type-body-medium">{m.fullName}</p>
                    <p className="truncate type-caption text-fg-muted">
                      {m.jerseyNumber !== null ? `#${m.jerseyNumber} · ` : ''}
                      {m.status === 'on_leave'
                        ? `Cuti${m.statusReason ? ` (${m.statusReason})` : ''}`
                        : m.placement === 'play_up'
                          ? `Play-up dari KU${m.actualKu}`
                          : m.guardianName
                            ? `Wali: ${m.guardianName}${m.guardianPhone ? ` · ${formatPhone(m.guardianPhone)}` : ''}`
                            : '—'}
                    </p>
                    {m.emergencyContactName ? (
                      <p className="truncate type-caption text-fg-muted">
                        Darurat: {m.emergencyContactName}
                        {m.emergencyContactPhone
                          ? ` · ${formatPhone(m.emergencyContactPhone)}`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                  {m.guardianPhone ? (
                    <a
                      href={`https://wa.me/${m.guardianPhone.replace('+', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`WhatsApp wali ${m.fullName}`}
                      className="flex size-8 items-center justify-center rounded-control bg-canvas text-fg-secondary"
                    >
                      <IconMessage size={16} />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </MobileShell>
  );
}
