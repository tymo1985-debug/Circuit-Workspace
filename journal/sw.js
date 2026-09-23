// Журнал — service worker модуля.
//
// Тот же приём, что и в остальных четырёх кэш-фёрст модулях (см. AGENTS.md,
// «Версии»): версия читается из общего реестра импортом, а не хардкодится.
// Побочный выигрыш — тот же: браузер сверяет импортированные скрипты при
// проверке обновления, поэтому подъём версии в реестре сам инвалидирует кэш
// этого модуля.
importScripts('../shared/version.js');
const APP_VERSION = (self.CW_MODULES && self.CW_MODULES['journal']
  ? self.CW_MODULES['journal'].version
  : '0');
const CACHE_PREFIX = 'journal-cache-v';
const CACHE_NAME = CACHE_PREFIX + APP_VERSION;

// shared/state.js здесь нет и не будет: Журнал хранит данные строками в
// собственных хранилищах общей базы через shared/db.js (journal/AGENTS.md).
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/app/core.js',
  './js/app/districts.js',
  './js/app/visits.js',
  './js/app/tasks.js',
  './js/app/projects.js',
  './js/app/search-archive.js',
  './js/app/protection.js',
  './js/crypto.js',
  './js/data.js',
  './js/route.js',
  './i18n/dict.js',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  // Общий слой хаба. Без него офлайн-запуск теряет стили, кнопку возврата
  // и падает на CWI18n undefined.
  '../shared/style.css',
  '../shared/nav.js',
  '../shared/theme.js',
  '../shared/backup.js',
  '../shared/db.js',
  '../shared/directory.js',
  '../shared/planner.js',
  '../shared/version.js',
  '../shared/update.js',
  '../shared/i18n.js',
  '../shared/escape.js',
  '../shared/i18n/common.js',
  '../shared/fonts/roboto-latin-400-normal.woff2',
  '../shared/fonts/roboto-latin-500-normal.woff2',
  '../shared/fonts/roboto-cyrillic-400-normal.woff2',
  '../shared/fonts/roboto-cyrillic-500-normal.woff2',
  '../shared/fonts/material-symbols-outlined-subset.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
  })());
});

// Досрочная активация — только по явной просьбе пользователя (кнопка
// «Обновить» из shared/update.js). skipWaiting() на установке убран
// намеренно: он подменял ассеты под уже открытой страницей.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Чтение строго из СВОЕГО кэша — см. обоснование в appointments/sw.js:
// общий слой лежит под тем же URL ещё и в кэшах соседних модулей, и
// глобальный caches.match() мог бы отдать чужую (не пропатченную) копию.
async function matchOwn(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  event.respondWith((async () => {
    const cached = await matchOwn(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && url.origin === self.location.origin) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      if (request.mode === 'navigate') {
        const shell = await matchOwn('./index.html');
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
