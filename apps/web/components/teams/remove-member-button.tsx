'use client';

import { IconX } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

export function RemoveMemberButton({
  slug,
  teamId,
  memberId,
  name,
}: {
  slug: string;
  teamId: string;
  memberId: string;
  name: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={`Keluarkan ${name} dari tim`}
      className="rounded-control p-1 text-fg-muted hover:bg-canvas hover:text-danger"
      onClick={async () => {
        if (!window.confirm(`Keluarkan ${name} dari tim ini?`)) return;
        const res = await api('DELETE', `/orgs/${slug}/teams/${teamId}/members/${memberId}`);
        if (!res.ok) window.alert(res.message);
        router.refresh();
      }}
    >
      <IconX size={18} />
    </button>
  );
}
