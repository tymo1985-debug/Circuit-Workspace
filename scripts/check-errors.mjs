#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-errors.mjs
 *
 * Кольцо ошибок и диагностика (аудит 03, P2-6): `shared/errors.js`.
 *
 * ПОЧЕМУ В ГЕЙТЕ. Работа идёт с телефона без DevTools: если на странице не
 * подключён перехватчик, сбой оседает в консоли, которую никто не видит, и
 * «кнопка ничего не сделала» не диагностируется. Дефект бесшумный по природе —
 * он проявляется только тогда, когда что-то уже сломалось. Поэтому проверяются:
 *   1. поведение кольца в изолированном контексте (запись, склейка повторов,
 *      предел длины, пропуск ресурсных ошибок, отказ хранилища, чужой мусор в
 *      ключе, содержимое отчёта);
 *   2. хаб и все семь модулей подключают `shared/errors.js` ПЕРВЫМ после
 *      `theme.js` — ошибки загрузки остальных скриптов тоже должны попасть в
 *      кольцо; хаб держит файл в прекэше (модули — check-shared-precache);
 *   3. карточка «Диагностика» в хабе на месте.
 *
 *   node scripts/check-errors.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

/* --- 1. Поведение кольца ------------------------------------------------ */
console.log('\nКольцо ошибок');
if (!existsSync(join(ROOT, 'shared/errors.js'))) { ok('shared/errors.js на месте', false); process.exit(1); }
const SRC = read('shared/errors.js');

function makeEnv({ failWrites = false, preset } = {}) {
  const store = preset ? { 'cw-errors-v1': preset } : {};
  const handlers = {};
  const self = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { if (failWrites) throw new Error('quota'); store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    navigator: { userAgent: 'TestUA/1.0', language: 'ru', onLine: true },
    innerWidth: 430, innerHeight: 900, devicePixelRatio: 2,
    CW_VERSION: '9.9.9', CW_MODULES: { journal: { version: '1.2.3' } },
  };
  self.self = self;
  /* Страница модуля `journal`: корень приложения берётся из адреса скрипта. */
  globalThis.document = { currentScript: { src: 'https://x.test/app/shared/errors.js?v=1' }, body: null, addEventListener() {} };
  globalThis.location = { pathname: '/app/journal/index.html', origin: 'https://x.test' };
  new Function('self', SRC)(self);
  return { self, store, handlers, E: self.CWErrors };
}
const err = (msg, extra = {}) => ({
  message: msg, filename: 'https://x.test/app/journal/js/a.js?v=3', lineno: 4, colno: 2,
  error: { message: msg, stack: 'Error: ' + msg + '\n at f (https://x.test/app/journal/js/a.js?v=3:4:2)' }, ...extra,
});

{
  const { handlers, E } = makeEnv();
  ok('перехватчики error и unhandledrejection поставлены', !!handlers.error && !!handlers.unhandledrejection);
  handlers.error(err('boom'));
  handlers.error(err('boom'));
  ok('повтор подряд склеивается в одну запись со счётчиком', E.count() === 1 && E.list()[0].n === 2);
  const rec = E.list()[0];
  ok('запись знает модуль, источник без origin и без query', rec.m === 'journal' && rec.src === 'journal/js/a.js:4:2', JSON.stringify(rec));
  handlers.unhandledrejection({ reason: new Error('rej') });
  ok('unhandledrejection записывается', E.count() === 2 && E.list()[1].k === 'rejection');
  handlers.error({ target: {}, message: 'img 404' });
  handlers.error(err('ResizeObserver loop completed with undelivered notifications.'));
  ok('ресурсная ошибка и ResizeObserver не пишутся', E.count() === 2);
  const text = E.report();
  ok('отчёт: версии хаба и модулей, браузер, ошибки',
    /Хаб: 9\.9\.9/.test(text) && /journal 1\.2\.3/.test(text) && /TestUA\/1\.0/.test(text) && /Ошибки \(2\)/.test(text) && /boom/.test(text), text);
  E.clear();
  ok('clear() очищает кольцо', E.count() === 0);
}
{
  const { handlers, E } = makeEnv();
  for (let i = 0; i < E.MAX + 7; i++) handlers.error(err('e' + i));
  ok('кольцо держит не больше MAX записей, старые вытесняются',
    E.count() === E.MAX && E.list()[0].msg === 'e7', E.count() + ' / ' + (E.list()[0] || {}).msg);
}
{
  const { handlers, E } = makeEnv();
  let threw = false;
  try { for (let i = 0; i < 400; i++) handlers.error(err('loop')); } catch { threw = true; }
  ok('ошибка в цикле не бросает и не раздувает счётчик без предела', !threw && E.list()[0].n <= 100, String(E.list()[0] && E.list()[0].n));
}
{
  const { handlers, E } = makeEnv({ failWrites: true });
  let threw = false;
  try { handlers.error(err('x')); handlers.unhandledrejection({ reason: 'y' }); E.report(); } catch { threw = true; }
  ok('отказ localStorage не превращается в новую ошибку', !threw);
}
{
  const { handlers, E } = makeEnv({ preset: '{"v":1,"items":"мусор"}' });
  let threw = false;
  try { handlers.error(err('after garbage')); } catch { threw = true; }
  ok('повреждённый ключ не ломает запись', !threw && E.count() === 1);
}

/* --- 2. Страницы подключают errors.js первым после theme.js -------------- */
console.log('\nПодключение shared/errors.js');
const PAGES = [
  { id: 'hub', html: 'index.html', sw: 'service-worker.js', prefix: 'shared/' },
  { id: 'congress-project', html: 'congress-project/index.html', prefix: '../shared/' },
  { id: 'circuit-planner', html: 'circuit-planner/index.html', prefix: '../shared/' },
  { id: 'pioneer-school', html: 'pioneer-school/index.html', prefix: '../shared/' },
  { id: 'appointments', html: 'appointments/index.html', prefix: '../shared/' },
  { id: 'documents', html: 'documents/index.html', prefix: '../shared/' },
  { id: 'journal', html: 'journal/index.html', prefix: '../shared/' },
  { id: 'archive', html: 'archive/index.html', prefix: '../shared/' },
];
for (const p of PAGES) {
  const srcs = [...read(p.html).matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  const rest = srcs.filter((s) => !/shared\/theme\.js$/.test(s));
  ok(p.id + ': errors.js — первый скрипт после theme.js', rest[0] === p.prefix + 'errors.js', rest.slice(0, 2).join(', '));
  if (p.sw) ok(p.id + ': errors.js в прекэше service worker', read(p.sw).includes('errors.js'));
}

/* --- 3. Карточка хаба ---------------------------------------------------- */
console.log('\nКарточка «Диагностика»');
const hub = read('index.html');
for (const id of ['errorsCard', 'errorsState', 'errorsCopyBtn', 'errorsClearBtn']) {
  ok('хаб: #' + id, new RegExp('id="' + id + '"').test(hub));
}

console.log('');
process.exit(failed ? 1 : 0);
