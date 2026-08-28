// Назначения — service worker модуля.
//
// Исходный автономный бланк использовал кэш без префикса
// ('pryznachennia-cache-v10') и «удаляй всё, кроме своего» на активации.
// Внутри хаба это стирало бы офлайн-кэши остальных модулей: Cache Storage
// общий на весь origin. Здесь, как и в остальных модулях, удаляются строго
// свои кэши по префиксу.
const APP_VERSION = '5.5.24';
const CACHE_PREFIX = 'appointments-cache-v';
const CACHE_NAME = CACHE_PREFIX + APP_VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
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
  '../shared/version.js',
  '../shared/update.js',
  '../shared/i18n.js',
  '../shared/sender.js',
  '../shared/doclang.js',
  '../shared/print.js',
  '../shared/i18n/common.js',
  '../shared/fonts/roboto-latin-400-normal.woff2',
  '../shared/fonts/roboto-latin-500-normal.woff2',
  '../shared/fonts/roboto-cyrillic-400-normal.woff2',
  '../shared/fonts/roboto-cyrillic-500-normal.woff2',
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

// Чтение строго из СВОЕГО кэша.
//
// Раньше здесь стоял глобальный `caches.match()`, который перебирает ВСЕ кэши
// origin в порядке их создания. Общие файлы (`../shared/style.css` и остальной
// общий слой) лежат под тем же URL ещё и в кэше хаба, и в кэшах соседних
// модулей — модуль мог получить чужую копию. Это подрывало правило «поднял
// `shared/*` — патч-бампи модули»: бамп меняет имя СВОЕГО кэша, а глобальный
// поиск всё равно мог отдать старый файл соседа.
//
// Условие корректности: каждый общий файл, который модуль подключает, обязан
// лежать в его собственном прекэше — это стережёт `check-shared-precache.mjs`.
// Образец — `matchOwn` в `circuit-planner/sw.js` (там кэшей два, здесь один).
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
