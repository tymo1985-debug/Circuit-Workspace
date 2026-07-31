const CACHE_NAME = 'pioneer-school-cache-v1.3.0';

const ASSETS = [
  './',
  './index.html',
  './register.html',
  './manifest.json',
  './css/styles.css',
  './js/db.js',
  './js/app.js',
  './js/utils/dateUtils.js',
  './js/utils/validators.js',
  './js/modules/anketa.js',
  './js/modules/assignment.js',
  './js/modules/registration.js',
  './js/modules/substitutes.js',
  './js/modules/students.js',
  './js/modules/pdfImport.js',
  './js/modules/textbooks.js',
  './js/modules/practical.js',
  './js/modules/review.js',
  './js/modules/afterSchool.js',
  './js/modules/signLanguage.js',
  './js/export/pdfExport.js',
  './js/export/excelExport.js',
  './data/seed-lessons.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for app shell assets, network-first fallback for anything else (e.g. CDN jsPDF)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// Заготовка для Background Sync — приложение работает полностью на локальной IndexedDB,
// поэтому фактической синхронизации с сервером пока нет. Событие оставлено для будущего расширения.
self.addEventListener('sync', (event) => {
  if (event.tag === 'pioneer-school-sync') {
    // место для будущей логики синхронизации с сервером, если он появится
  }
});
