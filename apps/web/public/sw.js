// Service worker SportGather (M3, push M5).
// - Aset statis Next (/_next/static) disimpan: cache-first (nama file sudah ber-hash).
// - Halaman pelatih & wali: network-first, salinan terakhir dipakai saat offline, sehingga
//   absensi (P-02) tetap bisa dibuka di lapangan tanpa sinyal. Data absensi sendiri disimpan
//   di IndexedDB oleh halaman (lib/offline-attendance.ts), bukan di cache ini.
// - /api tidak pernah di-cache (data pribadi & selalu terbaru).
const VERSION = 'sg-m5-1';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg') {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  const offlinePage = url.pathname.startsWith('/pelatih/') || url.pathname.startsWith('/wali');
  if (req.mode === 'navigate' && offlinePage) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (hit) =>
              hit ||
              new Response(
                '<h1>Sedang offline</h1><p>Halaman ini belum pernah dibuka di HP ini.</p>',
                {
                  headers: { 'content-type': 'text/html; charset=utf-8' },
                },
              ),
          ),
        ),
    );
  }
});

// ── Web Push (M5): pengumuman, perubahan jadwal, tagihan, rapor ─────────────
self.addEventListener('push', (event) => {
  let data = { title: 'SportGather', body: '', url: '/wali' };
  try {
    data = { ...data, ...(event.data ? event.data.json() : {}) };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/wali', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const same = wins.find((w) => w.url === url);
      return same ? same.focus() : self.clients.openWindow(url);
    }),
  );
});
