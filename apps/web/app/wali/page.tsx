import {
  addDays,
  formatRupiah,
  type ChildEventDto,
  type ChildSummary,
  type GuardianInvoice,
  type MyAnnouncement,
} from '@sportgather/shared';
import { Badge, Card, IconMegaphone, buttonVariants } from '@sportgather/ui';
import Link from 'next/link';
import { MobileShell } from '@/components/shell/mobile-shell';
import { ChildrenList } from '@/components/wali/children-list';
import { NextSessionRsvp } from '@/components/wali/schedule-list';
import { apiPage } from '@/lib/api-server';
import { nextUpcoming, todayJakarta } from '@/lib/dates';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${Math.max(1, m)} menit lalu`;
  if (m < 24 * 60) return `${Math.round(m / 60)} jam lalu`;
  return `${Math.round(m / 1440)} hari lalu`;
};

// O-03 · Beranda orang tua: jadwal terdekat, tagihan, pengumuman (PAR-01)
export default async function WaliHome() {
  const today = todayJakarta();
  const [me, children, events, invoices, announcements] = await Promise.all([
    apiPage<{ user: { fullName: string } }>('/me', '/wali'),
    apiPage<ChildSummary[]>('/me/children'),
    apiPage<ChildEventDto[]>(`/me/schedule?from=${today}&to=${addDays(today, 7)}`),
    apiPage<GuardianInvoice[]>('/me/invoices'),
    apiPage<MyAnnouncement[]>('/me/announcements'),
  ]);
  const next = nextUpcoming(events);
  const total = invoices.reduce((a, i) => a + i.total, 0);
  const soonest = invoices[0];
  const kids = new Set(invoices.map((i) => i.childName)).size;
  const latest = announcements[0];
  const unread = announcements.filter((a) => !a.read).length;
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
        {soonest ? (
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="type-caption-bold text-fg-secondary">
                {invoices.length} tagihan{kids > 1 ? ` · ${kids} anak` : ''}
              </span>
              <Badge tone={soonest.overdueDays > 0 ? 'danger' : 'warning'}>
                {soonest.overdueDays > 0
                  ? `Terlambat ${soonest.overdueDays} hari`
                  : 'Belum dibayar'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="type-stat">{formatRupiah(total)}</span>
              <Link href="/wali/tagihan" className={buttonVariants()}>
                Bayar
              </Link>
            </div>
          </Card>
        ) : null}
        {latest ? (
          <Link
            href="/wali/pengumuman"
            className="flex items-center gap-3 rounded-card border border-line bg-surface p-4"
          >
            <span className="rounded-input bg-brand-tint p-2 text-brand">
              <IconMegaphone size={20} />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="type-body-medium">{latest.title}</span>
              <span className="type-caption text-fg-muted">
                {latest.authorName ?? latest.orgName} · {ago(latest.sentAt)}
              </span>
            </span>
            {unread ? <Badge tone="brand">{unread} baru</Badge> : null}
          </Link>
        ) : null}
        <ChildrenList items={children} />
      </div>
    </MobileShell>
  );
}
