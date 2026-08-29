#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-sw-cache-scope.mjs
 *
 * ЧТО ПРОВЕРЯЕТ. Service worker модуля обязан читать кэш СТРОГО СВОЙ.
 *
 * ЗАЧЕМ. Cache Storage общий на весь origin, а глобальный `caches.match()`
 * перебирает ВСЕ кэши в порядке их создания и отдаёт первое совпадение.
 * Общий слой (`../shared/style.css` и остальные `shared/*`) лежит под одним и
 * тем же URL в кэше хаба и в кэше каждого модуля — то есть модуль мог получить
 * чужую копию. Это подрывало правило «поднял `shared/*` — патч-бампи модули»:
 * бамп меняет имя СВОЕГО кэша, но не мешает глобальному поиску отдать старый
 * файл соседа, чей кэш создан раньше.
 *
 * ДВА СЛОЯ ПРОВЕРКИ, И ОНИ ЛОВЯТ РАЗНОЕ.
 *
 *   §1 Статический. В коде (вне комментариев) не должно быть ни одного
 *      `caches.match(`. Ловит возврат глобального чтения при любой будущей
 *      правке, включая новый service worker, написанный по старому образцу.
 *
 *   §2 Поведенческий. Service worker исполняется в `vm` с поддельным Cache API,
 *      где кэш ХАБА создан РАНЬШЕ кэша модуля и содержит устаревшую копию
 *      общего файла под тем же URL. Глобальный поиск отдал бы копию хаба;
 *      правильный ответ — своя. Ловит случай, когда `caches.match()` в коде
 *      нет, но чтение всё равно идёт мимо своего кэша (например, через
 *      `caches.open()` с чужим именем).
 *
 * ГРАНИЦЫ, ЧЕСТНО.
 * - §2 прогоняется на четырёх модулях с ОДНИМ кэшем. `circuit-planner` (два
 *   кэша, свой порядок чтения) и service worker хаба (`importScripts` в шапке,
 *   отбор по `SHELL_URLS`) покрыты только §1: строить модель Cache API под
 *   каждый частный случай значит проверять модель, а не код. Возврат
 *   глобального чтения ловится у них §1 — то есть главный регресс закрыт.
 * - Поддельный Cache API — модель, а не браузер. Смоделированы ровно те
 *   свойства, от которых зависит дефект: общее хранилище на origin, порядок
 *   создания кэшей, разрешение относительных URL от адреса service worker'а.
 *   Заголовки, `ignoreSearch`, `vary` не моделируются вовсе.
 * - Проверка НЕ утверждает, что нужный файл в прекэше есть, — это соседняя
 *   проверка `check-shared-precache.mjs`, и она обязательное условие: читая
 *   только свой кэш, модуль обязан иметь в нём весь общий слой, который
 *   подключает.
 */

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Все service worker'ы модулей. `cacheVar` — имя константы с именем кэша. */
const WORKERS = [
  { id: 'pioneer-school', file: 'pioneer-school/sw.js', cacheVar: 'CACHE_NAME', behavioural: true },
  { id: 'appointments', file: 'appointments/sw.js', cacheVar: 'CACHE_NAME', behavioural: true },
  { id: 'documents', file: 'documents/sw.js', cacheVar: 'CACHE_NAME', behavioural: true },
  { id: 'congress-project', file: 'congress-project/service-worker.js', cacheVar: 'CACHE', behavioural: true },
  { id: 'circuit-planner', file: 'circuit-planner/sw.js', cacheVar: 'CACHE_STATIC', behavioural: false,
    why: 'два кэша (static + runtime) и собственный matchOwn с осознанным порядком чтения' },
  { id: 'hub', file: 'service-worker.js', cacheVar: 'CACHE_NAME', behavioural: false,
    why: 'importScripts() в шапке и отбор по SHELL_URLS — модель пришлось бы строить под один файл' },
];

const errors = [];
const notes = [];

/* ═══ §1. Статический скан ═══════════════════════════════════════════════ */

/** Снять комментарии, чтобы объяснение дефекта в шапке файла не считалось
 *  дефектом. Строковые литералы не трогаем: `caches.match(` в строке — тоже
 *  повод посмотреть. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

async function staticScan(worker) {
  const src = await readFile(join(ROOT, worker.file), 'utf8');
  const code = stripComments(src);
  const hits = [...code.matchAll(/caches\s*\.\s*match\s*\(/g)];
  if (hits.length) {
    errors.push(`${worker.id}: глобальный caches.match() — ${hits.length} шт. (${worker.file})`);
  }
  return src;
}

/* ═══ §2. Поддельный Cache API ═══════════════════════════════════════════ */

const SW_ORIGIN = 'https://example.test';

class FakeResponse {
  constructor(body, init) {
    this.body = body;
    this.ok = !init || init.ok !== false;
    this.type = (init && init.type) || 'basic';
  }
  clone() {
    return new FakeResponse(this.body, { ok: this.ok, type: this.type });
  }
  static error() {
    return new FakeResponse(null, { ok: false, type: 'error' });
  }
}

class FakeRequest {
  constructor(url, init) {
    const o = init || {};
    this.url = new URL(url, o.base || SW_ORIGIN).href;
    this.method = o.method || 'GET';
    this.mode = o.mode || 'no-cors';
    this.destination = o.destination || '';
    this._headers = o.headers || {};
    this.headers = { get: (k) => this._headers[String(k).toLowerCase()] || null };
  }
}

/** Кэш: ключ — абсолютный URL, разрешённый от адреса service worker'а. */
class FakeCache {
  constructor(base) {
    this.base = base;
    this.map = new Map();
  }
  _key(req) {
    const raw = typeof req === 'string' ? req : req.url;
    return new URL(raw, this.base).href;
  }
  async put(req, res) {
    this.map.set(this._key(req), res);
  }
  async match(req) {
    return this.map.get(this._key(req));
  }
  async addAll(urls) {
    for (const u of urls) this.map.set(this._key(u), new FakeResponse('precache:' + u));
  }
}

/** Хранилище кэшей. Порядок создания сохранён — на нём и построен дефект. */
class FakeCacheStorage {
  constructor(base) {
    this.base = base;
    this.caches = new Map(); // insertion order
  }
  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache(this.base));
    return this.caches.get(name);
  }
  /** Глобальный поиск — ровно то поведение, от которого уходим: первый кэш
   *  по порядку создания, где нашлось совпадение. Здесь он живёт, чтобы
   *  прогон на сломанном входе воспроизводил прежний дефект. */
  async match(req) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    return undefined;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name) {
    return this.caches.delete(name);
  }
}

/**
 * Прогнать один fetch-обработчик service worker'а.
 *
 * @param {string} src        исходник service worker'а
 * @param {string} cacheVar   имя константы с именем своего кэша
 * @param {object} scenario   { request, offline, seedForeign, seedOwn }
 * @returns {Promise<{body: string|null, cacheName: string}>}
 */
async function runWorker(src, cacheVar, scenario, swFile) {
  swFile = swFile || scenario.swFile;
  const base = SW_ORIGIN + '/module/sw.js';
  const storage = new FakeCacheStorage(base);

  // Кэш хаба создан РАНЬШЕ кэша модуля: именно этот порядок делал старый
  // caches.match() отдающим чужую копию.
  const foreign = await storage.open('cw-hub-v0.1.0');
  for (const [url, body] of Object.entries(scenario.seedForeign || {})) {
    await foreign.put(url, new FakeResponse(body));
  }

  const listeners = {};
  const ctx = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    Response: FakeResponse,
    Request: FakeRequest,
    caches: storage,
    fetch: async () => {
      if (scenario.offline) throw new Error('offline');
      return new FakeResponse('network');
    },
  };
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.location = new URL(base);
  ctx.self.location = ctx.location;
  ctx.self.clients = { claim: async () => {} };
  ctx.self.registration = {};
  ctx.self.skipWaiting = () => {};
  ctx.self.addEventListener = (type, fn) => {
    (listeners[type] = listeners[type] || []).push(fn);
  };
  /* `importScripts` — настоящая функция окружения service worker'а, и с
     28.08.2026 её зовут все шесть оболочек: версия модуля берётся из
     shared/version.js, а не дублируется числом. Подставлять заглушку-пустышку
     нельзя — APP_VERSION стал бы запасным «0», имя кэша перестало бы
     совпадать с рабочим, и проверка мерила бы не тот кэш. Поэтому файл
     реально исполняется в том же контексте, как это делает браузер. */
  ctx.self.importScripts = (...paths) => {
    paths.forEach((p) => {
      const abs = join(dirname(join(ROOT, swFile)), p);
      vm.runInContext(readFileSync(abs, 'utf8'), ctx, { filename: p });
    });
  };

  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'sw.js' });

  const cacheName = vm.runInContext(cacheVar, ctx);

  // Свой кэш создаётся ПОСЛЕ чужого — как в жизни у второго установленного
  // модуля. Наполняем напрямую, а не прогоном install: цель проверки — чтение.
  const own = await storage.open(cacheName);
  for (const [url, body] of Object.entries(scenario.seedOwn || {})) {
    await own.put(url, new FakeResponse(body));
  }

  const handlers = listeners.fetch || [];
  if (!handlers.length) throw new Error('в service worker нет обработчика fetch');

  let answered = null;
  const event = {
    request: scenario.request,
    respondWith: (p) => {
      answered = Promise.resolve(p);
    },
  };
  handlers[0](event);

  if (!answered) return { body: null, cacheName, skipped: true };
  const res = await answered;
  return { body: res ? res.body : null, cacheName };
}

/** Три сценария на модуль. Каждый отвечает на отдельный вопрос. */
async function behavioural(worker, src, label) {
  const local = [];
  const shared = '../shared/style.css';
  const sharedAbs = new URL(shared, SW_ORIGIN + '/module/sw.js').href;
  const shellAbs = new URL('./index.html', SW_ORIGIN + '/module/sw.js').href;

  // (1) Общий файл есть и у соседа, и у себя — обязана прийти СВОЯ копия.
  const both = await runWorker(src, worker.cacheVar, {
    swFile: worker.file,
    request: new FakeRequest(sharedAbs, { destination: 'style' }),
    seedForeign: { [sharedAbs]: 'ЧУЖАЯ-УСТАРЕВШАЯ' },
    seedOwn: { [sharedAbs]: 'СВОЯ-СВЕЖАЯ' },
  });
  local.push(['общий файл берётся из своего кэша, а не из кэша хаба', both.body === 'СВОЯ-СВЕЖАЯ', both.body]);

  // (2) У себя копии НЕТ, у соседа есть, сети нет — чужую брать нельзя.
  //     Правильный ответ — сетевая ошибка, а не тихая подмена чужим файлом.
  const onlyForeign = await runWorker(src, worker.cacheVar, {
    swFile: worker.file,
    offline: true,
    request: new FakeRequest(sharedAbs, { destination: 'style' }),
    seedForeign: { [sharedAbs]: 'ЧУЖАЯ-УСТАРЕВШАЯ' },
    seedOwn: {},
  });
  local.push(['чужая копия не подставляется вместо отсутствующей своей', onlyForeign.body !== 'ЧУЖАЯ-УСТАРЕВШАЯ', onlyForeign.body]);

  // (3) Офлайн-переход по странице: оболочка берётся своя, а не чужой index.html.
  const nav = await runWorker(src, worker.cacheVar, {
    swFile: worker.file,
    offline: true,
    request: new FakeRequest(SW_ORIGIN + '/module/', { mode: 'navigate', destination: 'document', headers: { accept: 'text/html' } }),
    seedForeign: { [shellAbs]: 'ЧУЖАЯ-ОБОЛОЧКА' },
    seedOwn: { [shellAbs]: 'СВОЯ-ОБОЛОЧКА' },
  });
  local.push(['офлайн-оболочка своя, а не чужой index.html', nav.body === 'СВОЯ-ОБОЛОЧКА', nav.body]);

  let failed = 0;
  for (const [title, ok, got] of local) {
    if (ok) {
      console.log(`    ✓ ${title}`);
    } else {
      failed += 1;
      console.log(`    ✗ ${title} → получено: ${JSON.stringify(got)}`);
    }
  }
  return { failed, total: local.length, label };
}

/* ═══ Прогон ═════════════════════════════════════════════════════════════ */

console.log('Область кэша service worker\'ов\n');

console.log('§1. Глобальный caches.match() в коде');
const sources = new Map();
for (const worker of WORKERS) {
  const src = await staticScan(worker);
  sources.set(worker.id, src);
  const bad = errors.some((e) => e.startsWith(worker.id + ':'));
  console.log(`  ${bad ? '✗' : '✓'} ${worker.id}`);
}

console.log('\n§2. Поведение при чужой копии того же URL');
for (const worker of WORKERS) {
  if (!worker.behavioural) {
    notes.push(`${worker.id}: §2 не прогонялся — ${worker.why}; покрыт §1`);
    console.log(`  · ${worker.id} — только §1, см. границы в шапке файла`);
    continue;
  }
  console.log(`  ${worker.id}`);
  try {
    const res = await behavioural(worker, sources.get(worker.id));
    if (res.failed) errors.push(`${worker.id}: провалено сценариев ${res.failed} из ${res.total}`);
  } catch (err) {
    errors.push(`${worker.id}: сценарий не выполнен — ${err.message}`);
    console.log(`    ✗ прогон не состоялся: ${err.message}`);
  }
}

console.log('');
for (const note of notes) console.log(`Замечание: ${note}`);

if (errors.length) {
  console.error(`\nПроверка области кэша не пройдена:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('\nВсе service worker\'ы читают только свой кэш.');
}
