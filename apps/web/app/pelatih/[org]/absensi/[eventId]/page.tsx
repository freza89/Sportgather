import type { AttendanceSheet } from '@sportgather/shared';
import { AttendanceSheetView } from '@/components/coach/attendance-sheet';
import { sessionTime } from '@/components/coach/session-card';
import { MobileShell } from '@/components/shell/mobile-shell';
import { apiPage } from '@/lib/api-server';
import { getClubSession } from '@/lib/club';

// P-02 · Absensi sesi
export default async function AbsensiSesi({
  params,
}: {
  params: Promise<{ org: string; eventId: string }>;
}) {
  const { org, eventId } = await params;
  const { me } = await getClubSession(org, `/pelatih/${org}/absensi/${eventId}`);
  const sheet = await apiPage<AttendanceSheet>(`/orgs/${org}/coach/sessions/${eventId}`);
  return (
    <MobileShell
      base={`/pelatih/${org}`}
      role="pelatih"
      title={`Absensi · ${sheet.event.teamName}`}
      subtitle={`${sessionTime(sheet.event)}${sheet.event.location ? ` · ${sheet.event.location}` : ''}`}
      backHref={`/pelatih/${org}`}
      userName={me.user.fullName}
    >
      <AttendanceSheetView slug={org} eventId={eventId} initial={sheet} />
    </MobileShell>
  );
}
