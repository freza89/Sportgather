import 'server-only';
import type { MeResponse } from '@sportgather/shared';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Panggilan API dari Server Component; cookie sesi diteruskan. */
export async function apiServer<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API_URL}/v1${path}`, {
    ...init,
    headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), ...init.headers },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Seperti apiServer, tetapi 401 → halaman masuk dan 404 → notFound(). */
export async function apiPage<T>(path: string, nextPath?: string): Promise<T> {
  try {
    return await apiServer<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401)
      redirect(`/masuk${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`);
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
}

/** Profil orang yang login (di-cache per request). */
export const getMe = cache(async (nextPath?: string) => apiPage<MeResponse>('/me', nextPath));

/** Untuk halaman publik: null bila belum login. */
export const getMeOptional = cache(async (): Promise<MeResponse | null> => {
  try {
    return await apiServer<MeResponse>('/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
});
