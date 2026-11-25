import type { MyAnnouncement } from '@sportgather/shared';
import { Alert, Card, Logo, buttonVariants } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiError, apiServer } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Pengumuman' };

// Link bertoken dari WhatsApp/push: tampilkan pengumuman tanpa login & tandai dibaca.
export default async function PublicAnnouncement({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let a: MyAnnouncement | null = null;
  let error: string | null = null;
  try {
    a = await apiServer<MyAnnouncement>(`/public/announcements/${encodeURIComponent(token)}`);
  } catch (e) {
    error = e instanceof ApiError ? e.message : 'Pengumuman tidak bisa dibuka.';
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-5 bg-canvas p-5">
      <Logo />
      {a ? (
        <Card className="flex flex-col gap-3 p-5">
          <span className="type-caption text-fg-muted">
            {a.orgName}
            {a.authorName ? ` · ${a.authorName}` : ''} ·{' '}
            {new Intl.DateTimeFormat('id-ID', {
              timeZone: 'Asia/Jakarta',
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(a.sentAt))}
          </span>
          <h1 className="type-h2">{a.title}</h1>
          <p className="type-body whitespace-pre-line">{a.body}</p>
        </Card>
      ) : (
        <Alert tone="warning">{error}</Alert>
      )}
      <Link href="/wali" className={buttonVariants({ variant: 'secondary' })}>
        Buka aplikasi SportGather
      </Link>
    </main>
  );
}
