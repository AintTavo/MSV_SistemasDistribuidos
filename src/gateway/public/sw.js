// Service Worker de la PWA (app-shell offline).
// Estrategia NETWORK-FIRST: estando en línea siempre se sirve la versión más
// reciente (y se refresca la caché); sin conexión se usa la copia cacheada.
// Esto evita que quede "pegado" código antiguo tras una actualización.
const CACHE = 'patavo-v2';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/offline.js',
  '/js/dungeon.js',
  '/js/app.js',
  '/manifest.webmanifest',
  '/icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm',
];

self.addEventListener('install', (e) => {
  // Pre-cachea el shell en modo "best-effort": si un recurso (p. ej. el CDN)
  // no está disponible, NO se aborta la instalación.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Sólo GET; la API y los WebSockets siempre van directos a la red.
  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  // Network-first con respaldo en caché.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) =>
          cached || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error())
        )
      )
  );
});
