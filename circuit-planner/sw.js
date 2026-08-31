// Клиндарий — service worker модуля.
// index.html / app.js / manifest / sw.js -> offline-first с фоновой ревалидацией
// images/fonts -> cache-first
// everything else -> stale-while-revalidate
//
// ВЕРСИОНИРОВАНИЕ КЭША — не украшение, а единственное, что делает выпуск
// доставленным. До 11.08.2026 имена кэшей были константами ('syp-static',
// 'syp-runtime') и не менялись никогда. Записи в них перезаписывались только
// при повторном запуске install, а он запускается только когда сам sw.js
// изменился побайтово. Выпуск, тронувший app.js и не тронувший sw.js
// (коммиты a9805e1, 2abe68a), до пользователя не доезжал вовсе: в кэше
// оставался старый app.js рядом с новой разметкой, обработчики висели на
// несуществующих элементах, кнопки нажимались вхолостую.
//
// Версия берётся из общего реестра (shared/version.js), как в SW хаба.
// Побочный, но важный эффект: при проверке обновления браузер сверяет не
// только сам sw.js, но и импортированные им скрипты — значит любой выпуск,
// поднимающий версию модуля в CW_MODULES, сам инвалидирует этот кэш.
importScripts('../shared/version.js');

const APP_VERSION = (self.CW_MODULES && self.CW_MODULES['circuit-planner']
  ? self.CW_MODULES['circuit-planner'].version
  : '0');
const STATIC_PREFIX = 'syp-static-v';
const RUNTIME_PREFIX = 'syp-runtime-v';
const CACHE_STATIC = STATIC_PREFIX + APP_VERSION;
const CACHE_RUNTIME = RUNTIME_PREFIX + APP_VERSION;
const APP_SHELL_URLS = [
  './',
  './?source=pwa',
  './index.html',
  './style.css',
  './app.js',
  // Части, зарегистрированные в window.CPParts, подключаются РАНЬШЕ app.js в
  // index.html и обязаны лежать в прекэше отдельно от него: иначе оффлайн
  // сборка получит app.js, но не увидит функцию, которую он ожидает найти
  // в App.ui после применения частей (shared/AGENTS.md, п.2 «Прекэш»).
  './ui/calendar-styles.js',
  './ui/doc-templates.js',
  './ui/modals.js',
  './ui/ui-aux.js',
  './ui/ui-toggles.js',
  './visit-pdf.js',
  './fonts/fonts-aptos-regular.js',
  './fonts/fonts-aptos-bold.js',
  './fonts/fonts-aptos-italic.js',
  './fonts/fonts-aptos-bolditalic.js',
  './forms/s302-form.js',
  './favicon.ico',
  './manifest.webmanifest',
  // Общий слой (стили + шрифты). Без него офлайн модуль терял оформление,
  // т.к. index.html ссылается на ../shared/style.css.
  '../shared/style.css',
  '../shared/nav.js',
  '../shared/theme.js',
  // Реестр версий: backup.js читает из него CW_VERSION/CW_MODULES. Без
  // прекэша офлайн-бэкап терял бы версии в метаданных.
  '../shared/version.js',
  '../shared/backup.js',
  // Общий слой обновления: без прекэша офлайн-запуск терял бы полосу
  // «Доступна новая версия».
  '../shared/update.js',
  // Локализация: скрипты синхронные и в <head>, без них офлайн-запуск
  // модуля упал бы на CWI18n undefined ещё до отрисовки.
  '../shared/i18n.js','../shared/sender.js',
  '../shared/persist.js',
  '../shared/state.js',
  '../shared/snapshots.js',
  '../shared/templates.js','../shared/templates/namespaces.js','../shared/templates/builtin.js',
  '../shared/documents.js',
  '../shared/docsview.js',
  '../shared/print.js',
  '../shared/db.js',
  '../shared/directory.js',
  '../shared/escape.js',
  '../shared/doclang.js',
  '../shared/serviceyear.js',
  '../shared/i18n/common.js',
  // Словарь модуля: с фазы 5 он живёт отдельным файлом, а не внутри app.js.
  // Без него офлайн-запуск дал бы интерфейс из голых ключей.
  './i18n/dict.js',
  '../shared/fonts/roboto-latin-400-normal.woff2',
  '../shared/fonts/roboto-latin-500-normal.woff2',
  '../shared/fonts/roboto-cyrillic-400-normal.woff2',
  '../shared/fonts/roboto-cyrillic-500-normal.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  // CDN libs: precache so PDF export works offline even before the second visit
  // (on the very first load the SW doesn't control the page yet, so runtime
  // caching alone would miss them).
  '../shared/vendor/jspdf.umd.min.js',
  '../shared/vendor/jspdf.plugin.autotable.min.js',
  '../shared/vendor/pdf-lib.min.js',
  '../shared/vendor/fontkit.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    for (const url of APP_SHELL_URLS) {
      try {
        const req = new Request(url, { cache: 'reload' });
        const res = await fetch(req);
        if (res && res.ok) {
          await cache.put(url, res.clone());
        }
      } catch (_) {
        // Ignore missing assets to keep install robust.
      }
    }
    // skipWaiting() здесь больше нет: новый worker останавливается в
    // состоянии waiting, и открытая страница продолжает жить на том наборе
    // файлов, с которым запустилась. Активацию запрашивает пользователь
    // кнопкой «Обновить» (shared/update.js) — иначе перезагрузка могла
    // прилететь посреди заполнения формуляра визита.
  })());
});

// Единственный способ активировать этот worker досрочно. Раньше Клиндарий
// слал это сообщение, но обработчика не существовало ни в одном SW проекта —
// код был мёртвым.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Cache Storage общий на origin: удаляем строго свои кэши по префиксам,
    // иначе активация этого SW стирала бы офлайн-кэши хаба и других модулей.
    // 'syp-static'/'syp-runtime' без суффикса версии — кэши до 9.66.0;
    // их нужно снести, иначе они останутся лежать мёртвым грузом навсегда.
    const keys = await caches.keys();
    const mine = (key) => key.startsWith(STATIC_PREFIX) || key.startsWith(RUNTIME_PREFIX)
      || key === 'syp-static' || key === 'syp-runtime'
      || key.startsWith('static-') || key.startsWith('runtime-') || key.startsWith('syp-v');
    await Promise.all(
      keys.filter((key) => mine(key) && key !== CACHE_STATIC && key !== CACHE_RUNTIME)
        .map((key) => caches.delete(key))
    );

    if ('navigationPreload' in self.registration) {
      try {
        await self.registration.navigationPreload.enable();
      } catch (_) {}
    }

    await self.clients.claim();
  })());
});

// Чтение строго из собственных кэшей.
//
// Раньше здесь стоял глобальный caches.match(), который перебирает ВСЕ кэши
// origin в порядке их создания. Это давало два скрытых отказа. Первый: свежая
// копия, положенная фоновой ревалидацией в CACHE_RUNTIME, никогда не читалась —
// CACHE_RUNTIME создаётся позже CACHE_STATIC, и устаревшая копия из статики
// выигрывала всегда. Второй: общие файлы (../shared/style.css и др.) лежат ещё
// и в кэше хаба под тем же URL, и модуль мог получить чужую копию.
//
// Порядок здесь осознанный: сначала runtime (там лежит самое свежее, что
// принесла ревалидация), затем static (прекэш установки).
async function matchOwn(request) {
  const runtime = await caches.open(CACHE_RUNTIME);
  const fromRuntime = await runtime.match(request);
  if (fromRuntime) return fromRuntime;
  const stat = await caches.open(CACHE_STATIC);
  return stat.match(request);
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (
    request.method === 'GET' &&
    (request.headers.get('accept') || '').includes('text/html')
  );
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAppShellRequest(request) {
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return false;

  const pathname = url.pathname;
  const shellFiles = ['/index.html', '/app.js', '/manifest.webmanifest', '/sw.js'];

  return (
    pathname.endsWith('/') ||
    shellFiles.some((file) => pathname.endsWith(file)) ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'manifest' ||
    request.destination === 'document'
  );
}

async function cacheFirst(request) {
  const cached = await matchOwn(request);

  // Revalidate in the background even on a cache hit, so replacing an icon/font
  // file (without also touching sw.js) eventually reaches returning users
  // instead of being served from cache forever.
  // Write into CACHE_STATIC (not RUNTIME): these same-origin fonts/icons are
  // precached there at install, and putting revalidated copies into a second
  // cache would double the ~3.4 MB font payload in storage.
  const revalidate = fetch(request)
    .then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(CACHE_STATIC);
        try {
          await cache.put(request, res.clone());
        } catch (_) {}
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    revalidate.catch(() => {});
    return cached;
  }

  return (await revalidate) || Response.error();
}

async function networkFirst(request, fallbackUrl = './index.html') {
  const cache = await caches.open(CACHE_RUNTIME);
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    if (res && res.ok) {
      try {
        await cache.put(request, res.clone());
      } catch (_) {}
    }
    return res;
  } catch (_) {
    const cached = await matchOwn(request);
    if (cached) return cached;

    const fallback = fallbackUrl
      ? (await matchOwn(fallbackUrl)) || (await matchOwn('./'))
      : null;

    return fallback || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await matchOwn(request);
  const fetchPromise = fetch(request)
    .then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(CACHE_RUNTIME);
        try {
          await cache.put(request, res.clone());
        } catch (_) {}
      }
      return res;
    })
    .catch(() => cached);

  // Never resolve respondWith() with undefined: if there is no cached copy and
  // the network fails, return a proper error Response instead of a TypeError.
  return cached || fetchPromise.then((res) => res || Response.error());
}

// Serves from cache immediately when available — this is the core of making the app
// reliably usable with no connection at all, not just resilient to a failed request.
// Revalidates in the background so a connected session still picks up updates; only
// falls through to the network (via networkFirst's own fallback chain) on the very
// first visit, before anything has been cached yet.
async function offlineFirst(request, fallbackUrl) {
  const cached = await matchOwn(request);
  if (cached) {
    fetch(request, { cache: 'no-cache' })
      .then(async (res) => {
        if (res && res.ok) {
          const cache = await caches.open(CACHE_RUNTIME);
          try { await cache.put(request, res.clone()); } catch (_) {}
        }
      })
      .catch(() => {});
    return cached;
  }
  return networkFirst(request, fallbackUrl);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      const cached = (await matchOwn(request)) || (await matchOwn('./index.html')) || (await matchOwn('./'));
      if (cached) {
        fetch(request, { cache: 'no-cache' })
          .then(async (res) => { if (res && res.ok) { const cache = await caches.open(CACHE_RUNTIME); try { await cache.put(request, res.clone()); } catch (_) {} } })
          .catch(() => {});
        return cached;
      }
      const preload = await event.preloadResponse;
      if (preload) return preload;
      return networkFirst(request, './index.html');
    })());
    return;
  }

  // Font bundles are .js files (destination === 'script'), so without this
  // explicit path check they would fall into the app-shell branch below,
  // contradicting the cache-first promise above and hitting the network on every
  // load for ~3.4 MB of rarely-changing assets. cacheFirst still revalidates in
  // the background, so a replaced font eventually reaches returning users.
  if (isSameOrigin(url) && (url.pathname.includes('/fonts/') || ['image', 'font'].includes(request.destination))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isAppShellRequest(request)) {
    event.respondWith(offlineFirst(request, request.destination === 'document' ? './index.html' : null));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
