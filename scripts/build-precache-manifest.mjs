#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/build-precache-manifest.mjs
 *
 * Пишет `shared/precache-manifest.js`: путь от корня → короткий sha-256
 * содержимого для каждого файла каждого прекэша (аудит 04, вариант A).
 * По нему `shared/precache.js` при установке переносит неизменённые файлы из
 * прежнего кэша и сверяет скачанные.
 *
 * ЗАПУСК — ПОСЛЕДНИМ шагом выпуска, после всех правок и подъёма версий:
 *
 *     node scripts/build-precache-manifest.mjs
 *
 * Забытый запуск ловит `check-precache-manifest.mjs` в гейте. Если устаревший
 * манифест всё же уехал на сайт, установка нового worker'а провалится на
 * сверке хеша и пользователь останется на прежней целой версии — смешения не
 * будет, но и обновление не встанет, пока манифест не пересоберут.
 *
 * Список прекэша берётся не регулярным выражением по тексту, а из самого
 * worker'а: он исполняется в песочнице, и перехватывается список, который
 * worker отдаёт `CWOfflineCheck.listen()` — тот же, что кладёт установка
 * (это равенство держит check-offline-ready.mjs).
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'shared/precache-manifest.js';
const ORIGIN = 'https://cw.invalid/';

/** Хаб и все модули реестра: [id, путь к worker'у]. */
export function workers() {
  const reg = {};
  vm.runInNewContext(readFileSync(join(ROOT, 'shared/version.js'), 'utf8'), { self: reg });
  return [['hub', 'service-worker.js']].concat(Object.entries(reg.CW_MODULES).map(([id, m]) => [id, m.worker]));
}

/** Список прекэша, который worker передаёт CWOfflineCheck.listen(). */
export function precacheList(swFile) {
  let captured = null;
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    URL, setTimeout, clearTimeout,
    caches: {}, fetch: async () => { throw new Error('offline'); },
    Request: class {}, Response: class {}, Headers: class {},
  };
  ctx.self = ctx;
  ctx.location = new URL(swFile, ORIGIN);
  ctx.registration = { scope: new URL('./', ctx.location).href };
  ctx.clients = { claim: async () => {} };
  ctx.addEventListener = () => {};
  ctx.skipWaiting = () => {};
  ctx.importScripts = (...paths) => {
    for (const p of paths) {
      const abs = join(dirname(join(ROOT, swFile)), p);
      if (/offline-check\.js$/.test(p)) {
        ctx.CWOfflineCheck = { listen: (id, v, cache, urls) => { captured = urls.slice(); } };
      } else if (/precache(-manifest)?\.js$/.test(p)) {
        /* сам генератор не зависит от того, что он генерирует */
      } else {
        vm.runInContext(readFileSync(abs, 'utf8'), ctx, { filename: p });
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, swFile), 'utf8'), ctx, { filename: swFile });
  if (!captured) throw new Error(swFile + ': CWOfflineCheck.listen() не вызван — список прекэша не найден');
  return captured;
}

/** Адрес из списка worker'а → путь от корня (как relOf() в shared/precache.js). */
export function relPath(swFile, url) {
  const u = new URL(url, new URL(swFile, ORIGIN));
  let p = decodeURIComponent(u.pathname).replace(/^\//, '');
  if (p === '' || p.endsWith('/')) p += 'index.html';
  return posix.normalize(p);
}

export function build() {
  const map = {};
  const problems = [];
  for (const [id, sw] of workers()) {
    for (const url of precacheList(sw)) {
      const rel = relPath(sw, url);
      const abs = join(ROOT, rel);
      if (!existsSync(abs) || statSync(abs).isDirectory()) { problems.push(id + ': нет файла ' + rel + ' (' + url + ')'); continue; }
      map[rel] = createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16);
    }
  }
  const keys = Object.keys(map).sort();
  const body = keys.map((k) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(map[k]) + ',').join('\n');
  const text =
    '/* Circuit Workspace — shared/precache-manifest.js\n' +
    ' * СГЕНЕРИРОВАН: node scripts/build-precache-manifest.mjs — руками не править.\n' +
    ' * Путь от корня → sha-256 содержимого (16 знаков); читает shared/precache.js.\n' +
    ' * Пересобирать последним шагом выпуска; свежесть держит check-precache-manifest.mjs. */\n' +
    'self.CW_PRECACHE = {\n' + body + '\n};\n';
  return { map, text, problems, count: keys.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { text, problems, count } = build();
  if (problems.length) {
    console.error('Файлы прекэша не найдены:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  const path = join(ROOT, OUT);
  const before = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (before === text) { console.log(OUT + ': без изменений (' + count + ' файлов)'); process.exit(0); }
  writeFileSync(path, text);
  console.log(OUT + ': записан (' + count + ' файлов)');
}
