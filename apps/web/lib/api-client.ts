'use client';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; issues: { path: string; message: string }[] };

/** Panggilan API dari browser lewat rewrite /api → API (cookie first-party). */
export async function api<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, status: 0, message: 'Tidak ada koneksi internet. Coba lagi.', issues: [] };
  }
  if (res.ok) {
    return { ok: true, data: (res.status === 204 ? undefined : await res.json()) as T };
  }
  const err = (await res.json().catch(() => null)) as {
    message?: string | string[];
    issues?: { path: string; message: string }[];
  } | null;
  const message = Array.isArray(err?.message) ? err.message[0] : err?.message;
  return {
    ok: false,
    status: res.status,
    message:
      message ??
      (res.status >= 500
        ? 'Terjadi kesalahan di server. Coba lagi.'
        : 'Permintaan tidak bisa diproses.'),
    issues: err?.issues ?? [],
  };
}

/** Ubah daftar issue (dari Zod/API) menjadi peta field → pesan. */
export function fieldErrors(
  issues: { path: PropertyKey[] | string; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = Array.isArray(issue.path) ? issue.path.map(String).join('.') : issue.path;
    out[key] ??= issue.message;
  }
  return out;
}
