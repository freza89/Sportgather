import { addDays, type ChildEventDto, type ChildSummary } from '@sportgather/shared';
import { MobileShell } from '@/components/shell/mobile-shell';
import { ChildrenList } from '@/components/wali/children-list';
import { NextSessionRsvp } from '@/components/wali/schedule-list';
import { apiPage, getMe } from '@/lib/api-server';
import { nextUpcoming, todayJakarta } from '@/lib/dates';

// O-03 · Beranda orang tua (kartu anak + latihan berikutnya)
export default async function WaliHome() {
  const me = await getMe('/wali');
  const today = todayJakarta();
  const [children, events] = await Promise.all([
    apiPage<ChildSummary[]>('/me/children', '/wali'),
    apiPage<ChildEventDto[]>(`/me/schedule?from=${today}&to=${addDays(today, 7)}`),
  ]);
  const next = nextUpcoming(events);
  return (
    <MobileShell
      base="/wali"
      role="wali"
      title={`Halo, ${me.user.fullName}`}
      subtitle="Area orang tua"
      trailing="bell"
      userName={me.user.fullName}
    >
      <div className="flex flex-col gap-4">
        {next ? <NextSessionRsvp item={next} /> : null}
        <ChildrenList items={children} />
      </div>
    </MobileShell>
  );
}
