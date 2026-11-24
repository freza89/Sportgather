import { homeForRole, type MeResponse, type StaffRole } from '@sportgather/shared';

/** Ke mana orang diarahkan setelah login. */
export function homePath(me: MeResponse): string {
  const active = me.clubs.filter((c) => c.status === 'active');
  if (active.length === 1) return homeForRole(active[0]!.role as StaffRole, active[0]!.slug);
  if (active.length > 1) return '/pilih-klub';
  if (me.clubs.some((c) => c.status === 'invited')) return '/pilih-klub';
  return '/wali';
}

/** Hanya izinkan redirect ke path internal (mencegah open redirect). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return null;
  return next;
}
