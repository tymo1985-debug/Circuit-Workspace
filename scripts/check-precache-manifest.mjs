#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-precache-manifest.mjs
 *
 * Установка прекэша с переносом по хешу (аудит 04, вариант A).
 *
 * ПОЧЕМУ В ГЕЙТЕ. Перенос неизменённых файлов держится на манифесте хешей.
 * Забыли пересобрать манифест — установка нового worker'а проваливается на
 * сверке, обновление у пользователей не встаёт. Перестали сверять или
 * перенесли файл из чужого кэша — вернётся смешение версий, класс бага
 * 24.09.2026. Оба отказа на глаз не видны: онлайн всё открывается.
 *
 * Проверяется:
 *   1. `shared/precache-manifest.js` совпадает с пересборкой по файлам;
 *   2. каждый worker подключает манифест и `shared/precache.js`, ставит
 *      прекэш через `CWPrecache.install()` и больше не зовёт `addAll()`;
 *   3. поведение `CWPrecache.install()` на имитации Cache Storage: первая
 *      установка, перенос неизменённого, сверка скачанного, атомарность,
 *      чужой кэш, одноимённый кэш, окружение без crypto.subtle.
 *
 *   node scripts/check-precache-manifest.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { build, workers, OUT } from './build-precache-manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

/* --- 1. Манифест свежий ------------------------------------------------- */
console.log('\nМанифест хешей прекэша');
const fresh = build();
ok('все файлы прекэшей на месте', fresh.problems.length === 0, fresh.problems.join('; '));
ok(OUT + ' на месте', existsSync(join(ROOT, OUT)));
ok(OUT + ' совпадает с пересборкой (' + fresh.count + ' файлов)',
  existsSync(join(ROOT, OUT)) && read(OUT) === fresh.text,
  'запустить: node scripts/build-precache-manifest.mjs');

/* --- 2. Worker'ы ставят прекэш через CWPrecache ------------------------- */
console.log('\nУстановка во всех worker\'ах');
for (const [id, sw] of workers()) {
  const src = read(sw).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(id + ': подключает манифест и shared/precache.js',
    /importScripts\([^)]*shared\/precache-manifest\.js[^)]*shared\/precache\.js/.test(src));
  const m = src.match(/CWPrecache\.install\(\s*\{([^}]*)\}/);
  ok(id + ': install через CWPrecache.install()', !!m);
  if (m) {
    const prefixVar = (m[1].match(/prefix\s*:\s*([A-Za-z_$][\w$]*)/) || [])[1];
    const cacheVar = (m[1].match(/cacheName\s*:\s*([A-Za-z_$][\w$]*)/) || [])[1];
    /* Имя кэша начинается либо с самой переменной префикса, либо со строки,
       начинающейся с её значения (Конгрессы: 'congress-pwa-v'+…). */
    const def = cacheVar && src.match(new RegExp('const\\s+' + cacheVar + '\\s*=\\s*([A-Za-z_$][\\w$]*|\'[^\']*\')\\s*\\+'));
    const prefixVal = prefixVar && (src.match(new RegExp('const\\s+' + prefixVar + '\\s*=\\s*\'([^\']+)\'')) || [])[1];
    const head = def && def[1];
    const own = !!head && (head === prefixVar || (!!prefixVal && head.startsWith("'" + prefixVal)));
    ok(id + ': источник переноса — свой префикс кэша', own, 'prefix ' + prefixVar + ' = ' + prefixVal + ', имя кэша начинается с ' + head);
    ok(id + ': корень приложения указан', /root\s*:\s*['"]\.{1,2}\/['"]/.test(m[1]));
  }
  ok(id + ': addAll() в установке больше нет', !/\.addAll\(/.test(src));
}

/* --- 3. Поведение на имитации ------------------------------------------ */
console.log('\nПеренос и сверка на имитации Cache Storage');

const keyOf = (r) => (typeof r === 'string' ? r : r.url);
class FakeCache {
  constructor() { this.map = new Map(); }
  async match(r) { const hit = this.map.get(keyOf(r)); return hit ? hit.clone() : undefined; }
  async put(r, res) { this.map.set(keyOf(r), res.clone()); }
}
class FakeStorage {
  constructor() { this.c = new Map(); this.failPut = false; }
  async open(n) {
    if (!this.c.has(n)) {
      const cache = new FakeCache();
      const store = this;
      const put = cache.put.bind(cache);
      cache.put = async (r, res) => { if (store.failPut) throw new Error('QuotaExceededError'); return put(r, res); };
      this.c.set(n, cache);
    }
    return this.c.get(n);
  }
  async has(n) { return this.c.has(n); }
  async keys() { return [...this.c.keys()]; }
  async delete(n) { return this.c.delete(n); }
}

const SW = 'https://x.test/app/mod/sw.js';
const URLS = ['./', './a.js', './b.js', '../shared/c.js'];
const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function env(storage, server, manifest, { crypto = true } = {}) {
  const fetched = [];
  const ctx = {
    URL, Request, Response, Headers, Promise, JSON, Uint8Array,
    caches: storage,
    location: new URL(SW),
    crypto: crypto ? webcrypto : undefined,
    fetch: async (req) => {
      let u = keyOf(req).replace('https://x.test/app/', '');
      if (u.endsWith('/')) u += 'index.html';
      fetched.push(u);
      if (!(u in server)) return new Response('nf', { status: 404 });
      return new Response(server[u], { status: 200, headers: { 'Content-Type': 'text/plain', 'Content-Encoding': 'gzip', 'Content-Length': '1' } });
    },
    CW_PRECACHE: manifest,
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('shared/precache.js'), ctx, { filename: 'shared/precache.js' });
  return { P: ctx.CWPrecache, fetched };
}
const manifestOf = (server) => Object.fromEntries(Object.entries(server).map(([k, v]) => [k, h(v)]));
const abs = (u) => new URL(u, SW).href;
const body = async (storage, cache, u) => { const r = await (await storage.open(cache)).match(abs(u)); return r ? r.text() : null; };
const run = (p) => p.then((s) => ({ s }), (e) => ({ e }));

const server1 = { 'mod/index.html': 'shell-1', 'mod/a.js': 'a-1', 'mod/b.js': 'b-1', 'shared/c.js': 'c-1' };
const st = new FakeStorage();

{
  const { P } = env(st, server1, manifestOf(server1));
  const r = await run(P.install({ cacheName: 'mod-v1', urls: URLS, prefix: 'mod-', root: '../' }));
  ok('первая установка: всё скачано, ничего не перенесено', !r.e && r.s.fetched === 4 && r.s.copied === 0, r.e || JSON.stringify(r.s));
  const revs = await (await st.open('mod-v1')).match(new URL(P.REVS, SW).href);
  const rec = revs && await revs.json();
  ok('карта хешей и итог записаны в кэш', !!rec && rec.v === 1 && Object.keys(rec.revs).length === 4 && rec.fetched.length === 4);
  const res = await (await st.open('mod-v1')).match(abs('./a.js'));
  ok('у скачанного сняты заголовки сжатия и длины', res && !res.headers.get('content-encoding') && !res.headers.get('content-length'));
}

const server2 = { ...server1, 'mod/b.js': 'b-2' };
{
  const { P, fetched } = env(st, server2, manifestOf(server2));
  const r = await run(P.install({ cacheName: 'mod-v2', urls: URLS, prefix: 'mod-', root: '../' }));
  ok('второй выпуск: скачан только изменённый файл', !r.e && r.s.fetched === 1 && r.s.copied === 3 && fetched.join() === 'mod/b.js',
    r.e || JSON.stringify(r.s) + ' ' + fetched.join());
  ok('перенесённое и скачанное — нужного содержимого',
    (await body(st, 'mod-v2', './a.js')) === 'a-1' && (await body(st, 'mod-v2', './b.js')) === 'b-2' && (await body(st, 'mod-v2', './')) === 'shell-1');
  ok('прежний кэш не тронут', (await body(st, 'mod-v1', './b.js')) === 'b-1');
}

{
  /* Фоновая ревалидация переписала тело в кэше, а карта осталась прежней:
     файл с устаревшей записью карты не переносится, а скачивается. */
  for (const n of ['mod-v1', 'mod-v2']) await (await st.open(n)).put(abs('./a.js'), new Response('a-other'));
  const { P, fetched } = env(st, server2, manifestOf(server2));
  const r = await run(P.install({ cacheName: 'mod-v2b', urls: URLS, prefix: 'mod-', root: '../' }));
  ok('тело в прежнем кэше не совпало с картой: файл скачан, а не перенесён',
    !r.e && fetched.join() === 'mod/a.js' && (await body(st, 'mod-v2b', './a.js')) === 'a-1', r.e || fetched.join());
  await st.delete('mod-v2b');
  for (const n of ['mod-v1', 'mod-v2']) await (await st.open(n)).put(abs('./a.js'), new Response('a-1'));
}

{
  const server3 = { ...server2, 'mod/a.js': 'a-3' };
  const stale = { ...server3, 'mod/a.js': 'a-1' }; // край CDN ещё отдаёт прошлую версию
  const { P } = env(st, stale, manifestOf(server3));
  const r = await run(P.install({ cacheName: 'mod-v3', urls: URLS, prefix: 'mod-', root: '../' }));
  ok('устаревший файл с CDN: установка проваливается', !!r.e && /манифест/.test(String(r.e.message)), r.e ? r.e.message : 'не провалилась');
  ok('провал: новый кэш не создан, прежний цел', !(await st.has('mod-v3')) && (await body(st, 'mod-v2', './a.js')) === 'a-1');
}

{
  const server404 = { ...server2 }; delete server404['mod/b.js'];
  const { P } = env(st, server404, { ...manifestOf(server2), 'mod/b.js': h('b-new') });
  const r = await run(P.install({ cacheName: 'mod-v4', urls: URLS, prefix: 'mod-', root: '../' }));
  ok('404 при установке: провал, кэша нет', !!r.e && !(await st.has('mod-v4')));
}

{
  const st2 = new FakeStorage();
  const theirs = await st2.open('other-v1');
  for (const [k, v] of Object.entries(server1)) await theirs.put('https://x.test/app/' + k, new Response(v));
  await theirs.put(new URL('__cw-precache-revs.json', SW).href, new Response(JSON.stringify({ v: 1,
    revs: Object.fromEntries(Object.entries(server1).map(([k, v]) => ['https://x.test/app/' + k, h(v)])) })));
  const { P } = env(st2, server1, manifestOf(server1));
  const r = await run(P.install({ cacheName: 'mod-v1', urls: URLS, prefix: 'mod-', root: '../' }));
  ok('чужой кэш (другой префикс) источником не служит', !r.e && r.s.copied === 0 && r.s.fetched === 4);
}

{
  const st3 = new FakeStorage();
  const same = await st3.open('mod-v1');
  await same.put(abs('./a.js'), new Response('active'));
  st3.failPut = true;
  const { P } = env(st3, server1, manifestOf(server1));
  const r = await run(P.install({ cacheName: 'mod-v1', urls: URLS, prefix: 'mod-', root: '../' }));
  st3.failPut = false;
  ok('сбой записи в одноимённый существующий кэш: кэш не удалён', !!r.e && (await st3.has('mod-v1')) && (await body(st3, 'mod-v1', './a.js')) === 'active');
}

{
  const st4 = new FakeStorage();
  const { P } = env(st4, server2, manifestOf(server1), { crypto: false });
  const r = await run(P.install({ cacheName: 'mod-v1', urls: URLS, prefix: 'mod-', root: '../' }));
  const revs = await (await st4.open('mod-v1')).match(new URL('__cw-precache-revs.json', SW).href);
  ok('без crypto.subtle: прежнее поведение — всё скачано, переносить нечего',
    !r.e && r.s.fetched === 4 && revs && Object.keys((await revs.json()).revs).length === 0, r.e && r.e.message);
}

console.log('');
process.exit(failed ? 1 : 0);
