import { Logo } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMeOptional } from '@/lib/api-server';
import { homePath, safeNext } from '@/lib/home';
import { LoginPanel } from './login-panel';

export const metadata: Metadata = { title: 'Masuk' };

// O-02 · Login OTP. Mobile-first, juga dipakai staf di desktop.
export default async function MasukPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const me = await getMeOptional();
  if (me) redirect(safeNext(next) ?? homePath(me));

  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col gap-6 px-5 pt-12 pb-10">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="type-display">Masuk ke SportGather</h1>
        <p className="type-body text-fg-secondary">
          Kami kirim kode 6 digit ke WhatsApp Anda. Tidak perlu kata sandi.
        </p>
      </div>
      <LoginPanel next={next ?? null} />
      <p className="mt-auto type-body-sm text-fg-secondary">
        Pengelola klub baru?{' '}
        <Link href="/daftar-klub" className="text-brand">
          Daftarkan klub Anda
        </Link>
      </p>
    </main>
  );
}
