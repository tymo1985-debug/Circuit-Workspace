#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-ceiling.mjs
 *
 * Потолок версии базы при восстановлении — на НАСТОЯЩЕМ IndexedDB Chromium.
 * НЕ ВХОДИТ В ГЕЙТ: `check-backup.mjs` гоняет тот же механизм на
 * `fake-indexeddb` и работает без браузера. Здесь проверяется, что настоящая
 * реализация ведёт себя так же.
 *
 * ─── ЗАЧЕМ ОТДЕЛЬНО ОТ ГЕЙТА ───────────────────────────────────────────────
 *
 * Это единственный класс отказа в проекте, у которого нет обратного хода:
 * понизить версию IndexedDB невозможно, и база, поднятая восстановлением выше
 * той версии, которой её открывает рабочий код, не откроется больше никогда.
 * Проверять такое поведение только на подделке рискованно: `VersionError` —
 * ровно та деталь, которую `fake-indexeddb` мог бы имитировать неточно.
 *
 * Четыре профиля:
 *   1. настоящая база модуля v2 + копия из более новой версии модуля → отказ,
 *      версия не тронута, данные целы (находка N-1, 29.08.2026);
 *   2. «призрачная» база без хранилищ — та, что создаёт openExisting() на
 *      устройстве, где модуль ни разу не открывали → восстановление проходит;
 *   3. штатное восстановление настоящей базы тем же набором хранилищ;
 *   4. общая база — регрессия к C-1 первого аудита.
 *
 * ─── ЗАПУСК ────────────────────────────────────────────────────────────────
 *
 *     npm i playwright-core
 *     node scripts/live-ceiling.mjs
 *
 * Путь к браузеру — переменная CHROME_PATH (см. scripts/live-run.mjs).
 * Сценарии выполняются НА СТРАНИЦЕ ХАБА: там уже подключены shared/backup.js
 * и shared/db.js, и проверяется ровно тот код, что доедет до пользователя.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PORT = 8138;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('нет'); return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const CHROME = process.env.CHROME_PATH || (() => {
  try {
    const dir = fs.readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d));
    if (dir) return path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
  } catch (e) { /* сборки Playwright здесь нет */ }
  return undefined;
})();

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'networkidle' });

const out = await page.evaluate(async () => {
  const SCHOOL = 'pioneer-school-db';
  const log = [];
  const del = (n) => new Promise((res) => {
    const r = indexedDB.deleteDatabase(n);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
  const open = (n, v, build) => new Promise((res, rej) => {
    const r = v ? indexedDB.open(n, v) : indexedDB.open(n);
    if (build) r.onupgradeneeded = () => build(r.result);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const versionOf = async () => { const db = await open(SCHOOL); const v = db.version; db.close(); return v; };
  const opensAt = (v) => new Promise((res) => {
    const r = indexedDB.open(SCHOOL, v);
    r.onsuccess = () => { r.result.close(); res('открылась'); };
    r.onerror = () => res(String(r.error && r.error.name));
    r.onblocked = () => res('blocked');
  });
  const rowsOf = async (store) => {
    const db = await open(SCHOOL);
    if (!db.objectStoreNames.contains(store)) { db.close(); return []; }
    const q = db.transaction([store]).objectStore(store).getAll();
    return new Promise((res) => { q.onsuccess = () => { db.close(); res(q.result); }; });
  };
  const file = (dump) => ({
    format: CWBackup.FORMAT, formatVersion: CWBackup.FORMAT_VERSION, scope: 'full',
    createdAt: new Date().toISOString(), app: { hub: '0.0.0', modules: {} }, modules: [],
    sections: { 'pioneer-school': { local: {}, idb: { [SCHOOL]: dump } } },
  });

  /* Профиль 1: настоящая база Школы v2, копия из более новой Школы. */
  await del(SCHOOL);
  let db = await open(SCHOOL, 2, (x) => {
    x.createObjectStore('students', { keyPath: 'id' });
    x.createObjectStore('classes', { keyPath: 'id' });
  });
  await new Promise((res) => {
    const tx = db.transaction(['students'], 'readwrite');
    tx.objectStore('students').put({ id: 's_keep', name: 'Учащийся' });
    tx.oncomplete = res;
  });
  db.close();
  let err = null;
  try {
    await CWBackup.restore(file({ version: 3, stores: {
      students: { keyPath: 'id', autoIncrement: false, indexes: [], rows: [{ id: 's_new' }] },
      mentors: { keyPath: 'id', autoIncrement: false, indexes: [], rows: [{ id: 'm1' }] },
    } }));
  } catch (e) { err = e && e.message; }
  log.push(['копия из более новой Школы отклонена', err === 'backup-newer-schema', String(err)]);
  log.push(['версия базы не изменилась', (await versionOf()) === 2, 'версия ' + (await versionOf())]);
  log.push(['модуль открывает свою базу версией 2', (await opensAt(2)) === 'открылась', await opensAt(2)]);
  log.push(['данные до восстановления целы', (await rowsOf('students')).some((r) => r.id === 's_keep'), '']);

  /* Профиль 2: призрачная база (openExisting без версии, ноль хранилищ). */
  await del(SCHOOL);
  db = await open(SCHOOL);
  db.close();
  err = null;
  try {
    await CWBackup.restore(file({ version: 2, stores: {
      students: { keyPath: 'id', autoIncrement: false, indexes: [], rows: [{ id: 's_ghost' }] },
    } }));
  } catch (e) { err = e && e.message; }
  log.push(['призрачная база восстанавливается', err === null, String(err)]);
  log.push(['после восстановления модуль открывает базу версией 2', (await opensAt(2)) === 'открылась', await opensAt(2)]);
  log.push(['данные из копии на месте', (await rowsOf('students')).some((r) => r.id === 's_ghost'), '']);

  /* Профиль 3: штатное восстановление настоящей базы тем же набором. */
  await del(SCHOOL);
  db = await open(SCHOOL, 2, (x) => { x.createObjectStore('students', { keyPath: 'id' }); });
  db.close();
  err = null;
  try {
    await CWBackup.restore(file({ version: 2, stores: {
      students: { keyPath: 'id', autoIncrement: false, indexes: [], rows: [{ id: 's_plain' }] },
    } }));
  } catch (e) { err = e && e.message; }
  log.push(['штатное восстановление проходит', err === null, String(err)]);
  log.push(['версия осталась 2', (await versionOf()) === 2, '']);

  /* Профиль 4: общая база — регрессия к C-1 на настоящем IndexedDB. */
  const DB = 'circuit-workspace-db';
  const ceiling = CWDB.DB_VERSION;
  await new Promise((res) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  const shared = {
    format: CWBackup.FORMAT, formatVersion: CWBackup.FORMAT_VERSION, scope: 'full',
    createdAt: new Date().toISOString(), app: { hub: '0.0.0', modules: {} }, modules: [],
    sections: { shared: { local: {}, idb: { [DB]: { version: ceiling, stores: {
      templates: { keyPath: 'id', autoIncrement: false, indexes: [], rows: [{ id: 'tpl' }] },
    } } } } },
  };
  err = null;
  try { await CWBackup.restore(shared); } catch (e) { err = e && e.message; }
  const sharedVersion = await new Promise((res) => {
    const r = indexedDB.open(DB); r.onsuccess = () => { const v = r.result.version; r.result.close(); res(v); };
  });
  log.push(['общая база: восстановление прошло', err === null, String(err)]);
  log.push(['общая база: версия не выше DB_VERSION', sharedVersion <= ceiling, sharedVersion + ' / ' + ceiling]);
  await del(SCHOOL);

  return log;
});

let bad = 0;
for (const [name, pass, extra] of out) {
  if (!pass) bad++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + name + (pass || !extra ? '' : ' — ' + extra));
}
await browser.close();
server.close();
console.log(bad ? '\nПРОВАЛОВ: ' + bad : '\nНастоящий IndexedDB подтверждает поведение гейта.');
process.exit(bad ? 1 : 0);
