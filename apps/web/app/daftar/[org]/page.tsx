import type { PublicOrgInfo } from '@sportgather/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, apiServer, getMeOptional } from '@/lib/api-server';
import { RegistrationWizard } from './wizard';

export const metadata: Metadata = { title: 'Pendaftaran pemain' };

// O-01 · Formulir pendaftaran (dibuka dari link/QR klub, tanpa install aplikasi)
export default async function DaftarPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const info = await apiServer<PublicOrgInfo>(`/public/orgs/${encodeURIComponent(slug)}`).catch(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    },
  );
  const me = await getMeOptional();
  return <RegistrationWizard info={info} signedInAs={me ? me.user.fullName : null} />;
}
