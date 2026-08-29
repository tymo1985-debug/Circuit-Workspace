// Школа пионеров — service worker модуля.
/* ВЕРСИЯ БЕРЁТСЯ ИЗ ЕДИНОГО ИСТОЧНИКА (28.08.2026, приём Клиндария).
   Раньше число дублировалось здесь и в shared/version.js: при каждом выпуске
   правились два места, а расхождение ловил гейт — но только если его
   запустили. Побочный выигрыш важнее самого дедупа: браузер при проверке
   обновления сверяет не только sw.js, но и импортированные им скрипты,
   поэтому ЛЮБОЙ выпуск, поднявший версию в реестре, сам инвалидирует кэш
   этого модуля. Запасное '0' — на случай, если импорт не удался: имя кэша
   всё равно должно получиться строкой, иначе SW не установится вовсе. */
importScripts('../shared/version.js');
const APP_VERSION = (self.CW_MODULES && self.CW_MODULES['pioneer-school']
  ? self.CW_MODULES['pioneer-school'].version
  : '0');
const CACHE_PREFIX = 'pioneer-school-cache-v';
const CACHE_NAME = CACHE_PREFIX + APP_VERSION;

const ASSETS = [
  './',
  './index.html',
  './register.html',
  './manifest.json',
  './css/styles.css',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  // Общий слой (стили + шрифты). Особенно важно здесь: раньше модуль тянул
  // шрифты с Google Fonts CDN, которые не кэшировались вовсе.
  '../shared/style.css',
  '../shared/nav.js',
  '../shared/theme.js',
  '../shared/backup.js',
  // Локализация: общий слой + словарь модуля. Без них офлайн-запуск падал бы
  // на T is not defined — T() зовут ещё на этапе объявления констант.
  '../shared/version.js',
  '../shared/update.js',
  '../shared/i18n.js',
  '../shared/docsview.js',
  '../shared/i18n/common.js',
  '../shared/escape.js',
  '../shared/doclang.js',
  // Общий слой документов (фаза 6): письмо учащемуся собирается из общего
  // хранилища шаблонов. Без предварительного кэширования офлайн-запуск падал
  // бы на CWTemplates is not defined ещё до первой отрисовки.
  '../shared/sender.js',
  '../shared/db.js',
  '../shared/templates/namespaces.js',
  '../shared/templates/builtin.js',
  '../shared/templates.js',
  '../shared/documents.js',
  '../shared/print.js',
  './i18n/dict.js',
  './i18n/doc.js',
  './js/i18n.js',
  './js/doclang.js',
  '../shared/fonts/roboto-latin-400-normal.woff2',
  '../shared/fonts/roboto-latin-500-normal.woff2',
  '../shared/fonts/roboto-cyrillic-400-normal.woff2',
  '../shared/fonts/roboto-cyrillic-500-normal.woff2',
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
  './js/modules/letters.js',
  './js/export/pdfExport.js',
  './js/export/pdfFormExport.js',
  './js/export/excelExport.js',
  './js/modules/registrationSchema.js',
  './js/modules/registrationForm.js',
  // Шрифты для PDF: встраиваются в сами PDF-файлы (кириллица в бланке и в
  // интерактивной анкете), поэтому нужны офлайн.
  './js/export/fonts/dejavu-sans-subset.js',
  './js/export/fonts/dejavu-form-b64.js',
  // pdf-lib + fontkit лежат локально, а не на CDN: интерактивная AcroForm-анкета
  // должна собираться и без сети.
  '../shared/vendor/jspdf.umd.min.js',
  '../shared/vendor/pdf.min.js',
  '../shared/vendor/xlsx.full.min.js',
  '../shared/vendor/pdf-lib.min.js',
  '../shared/vendor/fontkit.umd.min.js',
  /* Воркер pdf.js: `integrity` его не защищает (адрес подставляется строкой в
     workerSrc, а не тегом), поэтому копия лежит в репозитории. Здесь же он
     переехал из CDN_ASSETS в обязательный прекэш: свой файл обязан доехать,
     а не кэшироваться «мягко». */
  '../shared/vendor/pdf.worker.min.js',
  './data/seed-lessons.json'
];

// Внешние библиотеки. Без предварительного кэширования экспорт PDF/Excel и
// импорт PDF работали только при наличии сети: на первой загрузке SW ещё не
// управляет страницей, поэтому runtime-кэширование их не перехватывало.
// Ошибка загрузки любой из них не должна ломать установку SW, поэтому они
// кэшируются отдельно и «мягко».
/* CDN_ASSETS больше нет (29.08.2026): библиотеки переехали в shared/vendor и
   лежат в обязательном прекэше выше. Прежний «мягкий» кэш был вынужденной
   мерой — отказ загрузки CDN не должен был ломать установку SW, — и её
   ценой было то, что на первом запуске без сети выгрузка PDF и разбор
   импортированных PDF не работали вовсе. Свой файл доезжает всегда. */
const CDN_ASSETS = [];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    await Promise.all(CDN_ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (_) { /* нет сети на момент установки — подхватится в рантайме */ }
    }));
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
    // Cache Storage общий на origin: удаляем только свои кэши по префиксу,
    // иначе активация этого SW стирала офлайн-кэши хаба и других модулей.
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

// Cache-first для оболочки, сеть — как запасной вариант.
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
      if (response && response.ok && (url.origin === self.location.origin || response.type === 'cors')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      // Раньше здесь возвращался уже проверенный на пустоту `cached`, то есть
      // undefined, и respondWith падал с TypeError вместо сетевой ошибки.
      if (request.mode === 'navigate') {
        const shell = await matchOwn('./index.html');
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
