// Circuit Workspace — service worker хаба.
// Кэширует только оболочку хаба и общий слой. Каждый модуль (congress-project,
// circuit-planner, pioneer-school) имеет собственный service worker внутри своей
// папки и управляет своим офлайн-кэшем самостоятельно — здесь это не дублируется.

// Версия берётся из единого источника (shared/version.js), поэтому имя кэша
// меняется автоматически при каждом обновлении CW_VERSION — не нужно отдельно
// вручную поднимать "v1"/"v2"/"v3" здесь при каждой правке хаба.
importScripts('./shared/version.js');

// ВАЖНО: Cache Storage — общий на весь origin, а не на область видимости SW.
// Поэтому очистка «всё, кроме своего кэша» стирала офлайн-кэши модулей
// (syp-static, congress-pwa-*, pioneer-school-*) при каждой активации хаба,
// а их SW точно так же стирали кэш хаба. Удаляем строго свои кэши по префиксу.
const CACHE_PREFIX = 'circuit-workspace-shell-v';
const CACHE_NAME = CACHE_PREFIX + self.CW_VERSION;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './shared/style.css',
  './shared/db.js',
  './shared/escape.js',
  './shared/nav.js',
  './shared/theme.js',
  './shared/backup.js',
  './shared/sender.js',
  './shared/version.js',
  './shared/release-manifest.js',
  './shared/update.js',
  // Локализация: без неё офлайн-хаб остался бы без переводов и упал бы
  // на CWI18n undefined в inline-скрипте.
  './shared/i18n.js',
  './shared/i18n/common.js',
  // Шрифты общего слоя: без них офлайн-хаб откатывался на системный шрифт.
  './shared/fonts/roboto-latin-400-normal.woff2',
  './shared/fonts/roboto-latin-500-normal.woff2',
  './shared/fonts/roboto-cyrillic-400-normal.woff2',
  './shared/fonts/roboto-cyrillic-500-normal.woff2',
  './shared/fonts/material-symbols-outlined-subset.woff2',
  './icon-16.png',
  './icon-32.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icon-maskable-512.png',
];

// Точный набор URL оболочки хаба. Раньше сопоставление шло через
// pathname.endsWith(...), из-за чего под правило попадал любой чужой путь,
// оканчивающийся на «/index.html» или «/manifest.json» (то есть страницы
// модулей), и любой кросс-доменный запрос.
const SHELL_URLS = new Set(SHELL_FILES.map((f) => new URL(f, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
  );
});

// Досрочная активация — только по явной просьбе пользователя (кнопка
// «Обновить» из shared/update.js). skipWaiting() на установке убран
// намеренно: он подменял ассеты под уже открытой страницей.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Обслуживаем только файлы оболочки хаба; модули идут через свои SW.
  if (!SHELL_URLS.has(url.href)) return;

  // Cache-first внутри собственного кэша (caches.match без указания кэша мог бы
  // отдать ответ из кэша чужого модуля) с фоновой ревалидацией, чтобы правка
  // shared/* доходила до вернувшегося пользователя.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then((res) => {
        if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
      })
      .catch(() => null);

    if (cached) return cached;
    return (await network) || Response.error();
  })());
});
