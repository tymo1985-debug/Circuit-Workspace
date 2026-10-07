#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-offline-ready.mjs
 *
 * Самопроверка офлайн-готовности (аудит 03, P1-5). Два вопроса:
 *
 * 1. Каждый service worker (хаб + все модули реестра) подключает
 *    shared/offline-check.js и регистрирует CWOfflineCheck.listen() с ТЕМ ЖЕ
 *    именем кэша и ТЕМ ЖЕ списком, что и его install. Иначе хаб сверял бы
 *    не тот кэш или не тот список — и честно рапортовал бы «готово» при
 *    пустом настоящем кэше. Новый модуль без listen() хаб показал бы как
 *    «не готов» навсегда.
 * 2. Сам протокол: недостающие файлы находятся, при repair докачиваются в
 *    тот же кэш, ответ уходит в порт. Проверяется на имитации Cache Storage.
 *
 *   node scripts/check-offline-ready.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failed = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (cond || !extra ? '' : ' — ' + extra));
  if (!cond) failed++;
};

const reg = {};
vm.runInNewContext(read('shared/version.js'), { self: reg });
const workers = [['hub', 'service-worker.js']].concat(
  Object.entries(reg.CW_MODULES).map(([id, meta]) => [id, meta.worker]));

console.log('\nКаждый worker отвечает на CW_OFFLINE своим кэшем и своим списком');
for (const [id, file] of workers) {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(id + ': подключает shared/offline-check.js', /importScripts\(\s*['"][^'"]*shared\/offline-check\.js['"]\s*\)/.test(src));
  const m = src.match(/CWOfflineCheck\.listen\(\s*['"]([^'"]+)['"]\s*,\s*[^,]+,\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)/);
  ok(id + ': вызывает CWOfflineCheck.listen()', !!m);
  if (!m) continue;
  const [, listenId, cacheVar, listVar] = m;
  ok(id + ': id в listen() совпадает с реестром', listenId === id, listenId);
  ok(id + ': кэш listen() — тот же, что открывает install',
    new RegExp("caches\\.open\\(\\s*" + cacheVar + "\\s*\\)").test(src), cacheVar);
  ok(id + ': список listen() — тот же, что кладёт install',
    new RegExp("addAll\\(\\s*" + listVar + "\\b").test(src), listVar);
}

console.log('\nПротокол на имитации Cache Storage');
const store = new Map();
const fetched = [];
const cacheApi = {
  match: async (url) => store.get(url) || undefined,
  addAll: async (reqs) => { for (const r of reqs) { fetched.push(r.url); if (r.url.endsWith('/broken.js')) throw new Error('404'); } for (const r of reqs) store.set(r.url, 'body'); },
};
const listeners = [];
const self = {
  location: { href: 'https://x.test/mod/sw.js' },
  addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
};
const sandbox = { self, URL, Request: class { constructor(url, init) { this.url = url; this.init = init; } }, caches: { open: async () => cacheApi }, Promise };
vm.runInNewContext(read('shared/offline-check.js'), sandbox);
self.CWOfflineCheck.listen('mod', '1.0.0', 'mod-cache-v1', ['./', './a.js', '../shared/b.js']);
const send = (data) => new Promise((resolve) => {
  let waited;
  listeners[0]({ data, ports: [{ postMessage: resolve }], waitUntil: (p) => { waited = p; } });
  if (!waited) resolve('no-waitUntil');
});

store.set('https://x.test/mod/', 'body');
let r = await send({ type: 'CW_OFFLINE', repair: false });
ok('без repair: находит недостающие', JSON.stringify(r.missing) === JSON.stringify(['./a.js', '../shared/b.js']), JSON.stringify(r));
ok('без repair: ничего не качает', fetched.length === 0);
r = await send({ type: 'CW_OFFLINE', repair: true });
ok('repair: докачивает только недостающее, мимо HTTP-кэша',
  fetched.length === 2 && fetched.includes('https://x.test/mod/a.js') && fetched.includes('https://x.test/shared/b.js'), JSON.stringify(fetched));
ok('repair: после докачки недостающих нет', r.repaired === true && r.missing.length === 0, JSON.stringify(r));
ok('ответ несёт модуль, версию и размер списка', r.module === 'mod' && r.version === '1.0.0' && r.total === 3);
const other = await send({ type: 'CW_VERSION' });
ok('чужие сообщения не обрабатываются', other === 'no-waitUntil');

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nОфлайн-самопроверка подключена у всех worker\'ов.');
process.exit(failed ? 1 : 0);
