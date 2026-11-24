// Service worker SportGather (M0: kerangka).
// M3 menambahkan cache app-shell dan antrean sinkron absensi offline (IndexedDB).
const VERSION = 'sg-m0';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
