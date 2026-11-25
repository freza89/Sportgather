import type { TokenRsvpView } from '@sportgather/shared';
import { Alert, Logo } from '@sportgather/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, apiServer } from '@/lib/api-server';
import { TokenRsvp } from './token-rsvp';

export const metadata: Metadata = { title: 'Konfirmasi kehadiran' };

// Link bertoken dari WhatsApp (US-08): RSVP tanpa login ulang, berlaku 48 jam, sekali pakai.
export default async function TokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await apiServer<TokenRsvpView>(`/public/rsvp/${encodeURIComponent(token)}`).catch(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    },
  );
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-5 bg-canvas px-5 py-10">
      <Logo />
      <div>
        <h1 className="type-h1">Konfirmasi kehadiran</h1>
        <p className="type-body text-fg-secondary">
          Halo, {view.guardianName}. Pilih kehadiran untuk sesi besok.
        </p>
      </div>
      {view.expired ? (
        <Alert tone="warning">Link sudah kedaluwarsa. Masuk ke aplikasi untuk mengubah RSVP.</Alert>
      ) : null}
      {view.used ? (
        <Alert tone="success">
          Kehadiran sudah dikonfirmasi lewat link ini. Ubah lewat aplikasi bila perlu.
        </Alert>
      ) : null}
      <TokenRsvp token={token} view={view} />
    </main>
  );
}
