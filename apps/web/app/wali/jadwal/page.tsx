import { addDays, type ChildEventDto } from '@sportgather/shared';
import { MobileShell } from '@/components/shell/mobile-shell';
import { WaliSchedule } from '@/components/wali/wali-schedule';
import { apiPage, getMe } from '@/lib/api-server';
import { todayJakarta } from '@/lib/dates';

// O-04 · Jadwal & RSVP
export default async function WaliJadwal() {
  const me = await getMe('/wali/jadwal');
  const today = todayJakarta();
  const events = await apiPage<ChildEventDto[]>(
    `/me/schedule?from=${today}&to=${addDays(today, 13)}`,
  );
  return (
    <MobileShell
      base="/wali"
      role="wali"
      title="Jadwal"
      subtitle="2 minggu ke depan"
      trailing="bell"
      userName={me.user.fullName}
    >
      <WaliSchedule events={events} today={today} />
    </MobileShell>
  );
}
