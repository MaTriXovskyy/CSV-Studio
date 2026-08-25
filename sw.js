const CACHE_NAME = 'csv-studio-v28';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/toolbar.css',
  './css/grid.css',
  './css/modals.css',
  './js/vendor/lucide.min.js',
  './js/vendor/papaparse.min.js',
  './js/vendor/xlsx.full.min.js',
  './js/storage.js',
  './js/parser.js',
  './js/history.js',
  './js/stats.js',
  './js/operations.js',
  './js/export.js',
  './js/grid/grid-core.js',
  './js/grid/grid-render.js',
  './js/grid/grid-selection.js',
  './js/grid/grid-clipboard.js',
  './js/grid/grid-editor.js',
  './js/grid/grid-contextmenu.js',
  './js/grid/grid-events.js',
  './js/grid.js',
  './js/app.js',
  './assets/icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

// Instalacja Service Workera i pobranie zasobów do pamięci podręcznej offline
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Aktywacja i czyszczenie starych wersji cache
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Strategia Stale-While-Revalidate: natychmiastowe ładowanie z cache + aktualizacja w tle
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
