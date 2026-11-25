'use client';

import type { AttendanceOp, AttendanceSheet, AttendanceSyncResult } from '@sportgather/shared';

/**
 * Absensi offline-first (ATT-01, US-09). Lembar sesi & antrean perubahan disimpan di
 * IndexedDB HP pelatih; antrean dikirim ke server saat online. Server idempoten per
 * clientOpId, jadi kirim ulang aman.
 */
const DB_NAME = 'sportgather';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sheets')) db.createObjectStore('sheets');
      if (!db.objectStoreNames.contains('ops'))
        db.createObjectStore('ops', { keyPath: 'op.clientOpId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export interface QueuedOp {
  slug: string;
  op: AttendanceOp;
}

export const saveSheet = (eventId: string, sheet: AttendanceSheet) =>
  tx('sheets', 'readwrite', (s) => s.put(sheet, eventId));
export const loadSheet = (eventId: string) =>
  tx<AttendanceSheet>('sheets', 'readonly', (s) => s.get(eventId));
export const queueOps = async (items: QueuedOp[]) => {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('ops', 'readwrite');
    for (const i of items) t.objectStore('ops').put(i);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
};
export const pendingOps = async (): Promise<QueuedOp[]> =>
  (await tx<QueuedOp[]>('ops', 'readonly', (s) => s.getAll())) ?? [];
const removeOps = async (ids: string[]) => {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('ops', 'readwrite');
    for (const id of ids) t.objectStore('ops').delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
};

/** Kirim antrean ke server; mengembalikan jumlah yang masih tertunda. */
export async function flush(): Promise<{
  pending: number;
  rejected: AttendanceSyncResult['rejected'];
}> {
  const all = await pendingOps();
  const rejected: AttendanceSyncResult['rejected'] = [];
  for (const slug of [...new Set(all.map((o) => o.slug))]) {
    const ops = all.filter((o) => o.slug === slug).map((o) => o.op);
    for (let i = 0; i < ops.length; i += 500) {
      const batch = ops.slice(i, i + 500);
      const res = await fetch(`/api/orgs/${slug}/coach/attendance/sync`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ops: batch }),
      }).catch(() => null);
      if (!res || !res.ok) return { pending: (await pendingOps()).length, rejected };
      const result = (await res.json()) as AttendanceSyncResult;
      rejected.push(...result.rejected);
      // Semua op di batch sudah diproses server (diterima, duplikat, kalah versi, atau ditolak).
      await removeOps(batch.map((o) => o.clientOpId));
    }
  }
  return { pending: (await pendingOps()).length, rejected };
}
