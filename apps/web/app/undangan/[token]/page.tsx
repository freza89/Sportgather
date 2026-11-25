import { ROLE_LABEL, type InvitationPreview, type StaffRole } from '@sportgather/shared';
import { Alert, Card, Logo } from '@sportgather/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, apiServer, getMeOptional } from '@/lib/api-server';
import { AcceptInvitation } from './accept';

export const metadata: Metadata = { title: 'Undangan staf' };

export default async function UndanganPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await apiServer<InvitationPreview>(
    `/invitations/${encodeURIComponent(token)}`,
  ).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const me = await getMeOptional();
  const roleLabel = ROLE_LABEL[invite.role as StaffRole] ?? invite.role;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col gap-6 px-5 pt-12 pb-10">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="type-display">Undangan bergabung</h1>
        <p className="type-body text-fg-secondary">
          {invite.invitedName}, Anda diundang menjadi{' '}
          <strong className="text-fg">{roleLabel}</strong> di{' '}
          <strong className="text-fg">{invite.orgName}</strong>.
        </p>
      </div>
      <Card className="flex flex-col gap-4 p-5">
        {invite.accepted ? (
          <Alert tone="success">Undangan ini sudah diterima. Silakan masuk.</Alert>
        ) : invite.expired ? (
          <Alert tone="warning">Undangan sudah kedaluwarsa. Minta admin klub mengirim ulang.</Alert>
        ) : (
          <AcceptInvitation token={token} phoneMasked={invite.phoneMasked} loggedIn={Boolean(me)} />
        )}
      </Card>
    </main>
  );
}
