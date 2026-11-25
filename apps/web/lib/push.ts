'use client';

import { api } from './api-client';

/** Status dukungan & izin notifikasi di perangkat ini. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Minta izin & daftarkan langganan Web Push ke API. */
export async function enablePush(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!pushSupported())
    return {
      ok: false,
      message: 'Browser ini belum mendukung notifikasi. Pasang aplikasi ke layar utama dulu.',
    };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    return { ok: false, message: 'Izin notifikasi ditolak di pengaturan browser.' };
  const key = await api<{ publicKey: string | null }>('GET', '/public/push-key');
  if (!key.ok || !key.data.publicKey)
    return { ok: false, message: 'Notifikasi aplikasi belum diaktifkan di server.' };
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.data.publicKey),
    }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const res = await api('POST', '/me/push-subscriptions', {
    endpoint: json.endpoint,
    keys: json.keys,
  });
  return res.ok ? { ok: true } : { ok: false, message: res.message };
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api('POST', '/me/push-subscriptions/remove', { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
