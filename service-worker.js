// Circuit Workspace — service worker хаба.
// Кэширует только оболочку хаба и общий слой. Каждый модуль (congress-project,
// circuit-planner) имеет собственный service worker внутри своей папки и
// управляет своим офлайн-кэшем самостоятельно — здесь это не дублируется.

// Версия берётся из единого источника (shared/version.js), поэтому имя кэша
// меняется автоматически при каждом обновлении CW_VERSION — не нужно отдельно
// вручную поднимать "v1"/"v2"/"v3" здесь при каждой правке хаба.
importScripts('./shared/version.js');
const CACHE_NAME = 'circuit-workspace-shell-v' + self.CW_VERSION;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './shared/style.css',
  './shared/db.js',
  './shared/version.js',
  './icon-16.png',
  './icon-32.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Кэшируем только запросы к файлам оболочки хаба (не трогаем модули —
  // они обслуживаются собственными service worker'ами).
  const isShellRequest = SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')));
  if (!isShellRequest) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
