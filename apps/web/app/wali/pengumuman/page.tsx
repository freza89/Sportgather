import type { MyAnnouncement } from '@sportgather/shared';
import { MobileShell } from '@/components/shell/mobile-shell';
import { AnnouncementInbox } from '@/components/wali/announcement-inbox';
import { apiPage, getMe } from '@/lib/api-server';

// Pengumuman untuk wali (PAR-01)
export default async function WaliPengumuman() {
  const me = await getMe('/wali/pengumuman');
  const items = await apiPage<MyAnnouncement[]>('/me/announcements');
  return (
    <MobileShell
      base="/wali"
      role="wali"
      title="Pengumuman"
      subtitle="Dari klub & pelatih"
      backHref="/wali"
      userName={me.user.fullName}
    >
      <AnnouncementInbox items={items} />
    </MobileShell>
  );
}
