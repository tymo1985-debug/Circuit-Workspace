#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-protection.mjs
 *
 * Живой прогон защиты Журнала (J8) в Chromium. НЕ ВХОДИТ В ГЕЙТ (как и
 * live-run.mjs): нужен браузер и playwright-core. Запускается перед выдачей.
 *
 * Каждый прогон — НОВЫЙ origin (случайный порт) и чистый профиль: старый
 * service worker, Cache Storage и IndexedDB не могут дать ложный PASS.
 *
 * Сквозная канарейка — уникальная строка; после защиты её не должно быть
 * ни в одной постоянной сериализации: сырые строки всех баз (включая базу
 * предохранительных снимков), localStorage, sessionStorage, Cache Storage,
 * копия модуля, полная копия.
 *
 *     npm i playwright-core
 *     node scripts/live-journal-protection.mjs
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const CHROME = process.env.CHROME_PATH || (() => {
  try {
    const dir = fs.readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d));
    if (dir) return path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
  } catch (e) { /* нет сборки Playwright */ }
  return undefined;
})();

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

const CANARY = 'LIVECANARY' + Math.random().toString(36).slice(2, 12) + 'Ж';
const PASS_A = 'живая фраза A 2026';
const PASS_B = 'совсем другая фраза B';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('dialog', (d) => d.accept());

const J_URL = BASE + '/journal/index.html';
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitSheet = (open) => page.waitForFunction((o) => !!document.getElementById('protectSheet').open === o, open, { timeout: 15000 });
const bodyText = () => ev(() => document.body.innerText);
const dumpDb = () => ev(async () => {
  const out = {};
  for (const s of ['journalNodes', 'journalEntries', 'journalLinks', 'journalMeta', 'communities']) out[s] = await CWDB[s].getAll();
  return JSON.stringify(out);
});
const raw = (id) => ev((i) => CWDB.journalEntries.get(i), id);
const settle = () => page.waitForTimeout(400);
async function gotoJournal(hash) {
  if (!page.url().startsWith(J_URL)) {
    await page.goto(J_URL + (hash || ''), { waitUntil: 'load' });
    await page.waitForFunction(() => !!self.CWJournal && !!self.CWJournalCrypto);
  } else if (page.url() === J_URL + (hash || '#overview')) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!self.CWJournal && !!self.CWJournalCrypto);
  } else {
    await ev((h) => { location.hash = h; }, hash || '#overview');
  }
  await settle();
}
async function submitPass(pass, confirm) {
  await page.fill('#protectPass', pass);
  if (confirm !== undefined) await page.fill('#protectConfirm', confirm);
  await page.click('#protectSubmit');
}

/* ═══ 0. Старт на чистом origin ═══════════════════════════════════════ */
console.log('\n0. Старт');
await gotoJournal('#overview');
await ev(() => navigator.serviceWorker.ready);
ok('service worker активен', await ev(() => !!navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true)));
ok('замок скрыт, пока защиты нет', await ev(() => document.getElementById('lockBtn').hidden));
ok('открытие Журнала сейф не заводит', (await ev(() => CWDB.journalMeta.get('crypto:v1'))) === null);

const ids = await ev(async (C) => {
  const J = CWJournal;
  const today = new Date().toISOString().slice(0, 10);
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-LIVE' });
  const cong = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Живое' });
  const v = await J.visits.add({ nodeId: cong, dateFrom: today, dateTo: today });
  const rec = await J.visitRecords.add(v, { type: 'note', body: 'Запись ' + C });
  const todo = await J.visitRecords.add(v, { type: 'todo', body: 'Перенос ' + C });
  const task = await J.tasks.add({ nodeId: c, body: 'Задача ' + C });
  const proj = await J.projects.add({ circuitId: c, title: 'Проект ' + C, body: 'Описание ' + C });
  await J.projects.link(proj, J.urn.node(cong));
  await CWDB.communities.put({ id: 'com_live', name: 'Справочник A' });
  return { c, cong, v, rec, todo, task, proj,
    visitHash: CWJournalRoute.build.visit(c, cong, v), projHash: CWJournalRoute.build.project(c, proj) };
}, CANARY);

/* ═══ 1. Первая защита — из диалога задачи ════════════════════════════ */
console.log('\n1. Первая настройка');
await gotoJournal('#tasks');
await page.click('.j-task__main:has-text("Задача ' + CANARY + '")');
await page.waitForSelector('#taskDialog[open]');
ok('в диалоге задачи — «Защитить»', (await page.textContent('#taskDialogProtect')).trim().length > 0 && await page.isVisible('#taskDialogProtect'));
await page.click('#taskDialogProtect');
await waitSheet(true);
ok('лист в режиме первой настройки', (await ev(() => document.getElementById('protectSheet').dataset.mode)) === 'setup');
ok('предупреждение о невосстановимой фразе видно', await page.isVisible('#protectWarn'));
await submitPass('short', 'short');
ok('короткая фраза — ошибка', await page.isVisible('#protectError'));
await submitPass('первая фраза раз', 'первая фраза два');
ok('несовпадение — ошибка, сейфа нет', await page.isVisible('#protectError') && (await ev(() => CWDB.journalMeta.get('crypto:v1'))) === null);
await submitPass(PASS_A, PASS_A);
await waitSheet(false);
await settle();
let t = await raw(ids.task);
ok('задача защищена: sec, без body', !!t.sec && !('body' in t));
ok('поля фразы очищены', await ev(() => ['protectPass', 'protectConfirm', 'protectOld'].every((i) => document.getElementById(i).value === '')));
ok('замок в шапке виден (открыт)', await ev(() => !document.getElementById('lockBtn').hidden && document.getElementById('lockBtn').classList.contains('is-open')));
ok('текст на экране при открытой сессии', (await bodyText()).includes('Задача ' + CANARY));

/* ═══ 2. Блокировка, неверная и верная фраза ═══════════════════════════ */
console.log('\n2. Блокировка');
await page.click('#lockBtn');
await waitSheet(true);
await page.click('#protectSubmit');
await waitSheet(false);
await settle();
ok('заблокировано: текста задачи на экране нет', !(await bodyText()).includes('Задача ' + CANARY) && !(await ev(() => CWJournal.protection.isUnlocked())));
ok('заблокированная строка подписана', (await bodyText()).includes(await ev(() => CWI18n.t('j.locked.title'))));
let before = await dumpDb();
await page.click('#lockBtn');
await waitSheet(true);
await submitPass('неверная фраза!!');
await page.waitForFunction(() => !document.getElementById('protectError').hidden);
ok('неверная фраза — ошибка, поле очищено', (await ev(() => document.getElementById('protectPass').value)) === '');
ok('…ноль изменений в базе', (await dumpDb()) === before && !(await ev(() => CWJournal.protection.isUnlocked())));
await submitPass(PASS_A);
await waitSheet(false);
await settle();
ok('верная фраза — текст вернулся', (await bodyText()).includes('Задача ' + CANARY));

/* ═══ 3. Запись посещения и проект ═════════════════════════════════════ */
console.log('\n3. Запись посещения и проект');
await gotoJournal(ids.visitHash);
await page.click('.j-block[data-record-id="' + ids.rec + '"]');
await page.click('[data-act="protect"]');
await settle();
ok('запись посещения защищена', !!(await raw(ids.rec)).sec && !('body' in (await raw(ids.rec))));
await page.click('.j-block[data-record-id="' + ids.rec + '"]');
await page.click('[data-act="protect"]');
await settle();
ok('снятие защиты записи: открытый текст вернулся', (await raw(ids.rec)).body === 'Запись ' + CANARY && !('sec' in (await raw(ids.rec))));
await page.click('.j-block[data-record-id="' + ids.rec + '"]');
await page.click('[data-act="protect"]');
await settle();
await page.click('.j-block[data-record-id="' + ids.todo + '"]');
await page.click('[data-act="protect"]');
await settle();
ok('задача посещения (перенос) защищена', !!(await raw(ids.rec)).sec && !!(await raw(ids.todo)).sec);

await gotoJournal(ids.projHash);
await page.click('#moreBtn');
await page.click('[data-action="protect"]');
await settle();
let p = await raw(ids.proj);
ok('проект защищён: без title/body', !!p.sec && !('title' in p) && !('body' in p));
await page.click('#moreBtn');
await page.click('[data-action="protect"]');
await settle();
p = await raw(ids.proj);
ok('снятие защиты проекта', p.title === 'Проект ' + CANARY && !('sec' in p));
await page.click('#moreBtn');
await page.click('[data-action="protect"]');
await settle();

/* ═══ 4. Без ключа: метаданные, перенос, удаление ══════════════════════ */
console.log('\n4. Заблокированный режим');
await page.click('#lockBtn'); await waitSheet(true); await page.click('#protectSubmit'); await waitSheet(false); await settle();
const secProj = JSON.stringify((await raw(ids.proj)).sec);
ok('проект на экране без текста', !(await bodyText()).includes(CANARY));
await page.click('#projectStatusBtn'); await settle();
ok('завершить без ключа', (await raw(ids.proj)).status === 'completed');
await page.click('#projectStatusBtn'); await settle();
ok('вернуть в работу без ключа', (await raw(ids.proj)).status === 'active');
await page.click('#projectArchiveBtn'); await settle();
ok('в архив без ключа', (await raw(ids.proj)).status === 'archived');
await page.click('#projectArchiveBtn'); await settle();
ok('из архива без ключа; sec байт в байт', (await raw(ids.proj)).status === 'active' && JSON.stringify((await raw(ids.proj)).sec) === secProj);
const carry = await ev(async (i) => {
  const J = CWJournal;
  const secBefore = JSON.stringify((await CWDB.journalEntries.get(i.todo)).sec);
  const n0 = (await CWDB.journalEntries.getAll()).length;
  await J.carry.mark(i.todo);
  const v2 = await J.visits.add({ nodeId: i.cong, dateFrom: '2099-01-01', dateTo: '2099-01-02' });
  await J.carry.touch(i.todo, v2, 'kept');
  const row = await CWDB.journalEntries.get(i.todo);
  return { same: JSON.stringify(row.sec) === secBefore, rows: (await CWDB.journalEntries.getAll()).length - n0, touches: row.touches.length };
}, ids);
ok('перенос без ключа — одна строка, sec тот же', carry.same && carry.rows === 1 && carry.touches === 2, JSON.stringify(carry));
const del = await ev(async (c) => {
  const J = CWJournal;
  const id = await J.tasks.add({ nodeId: c, body: 'удалить' });
  return id;
}, ids.c);
await page.click('#lockBtn'); await waitSheet(true); await submitPass(PASS_A); await waitSheet(false);
await ev((id) => CWJournal.protection.protect(id), del);
await ev(() => CWJournal.protection.lock());
await ev((id) => CWJournal.tasks.remove(id), del);
ok('удаление защищённой без ключа', (await raw(del)) === null);

/* ═══ 5. Поиск ═════════════════════════════════════════════════════════ */
console.log('\n5. Поиск');
await gotoJournal('#search');
await page.fill('#searchInput', CANARY.slice(0, 14));
await page.waitForTimeout(700);
ok('заблокировано: не найдено, есть пометка о защищённых', !(await ev(() => document.getElementById('searchResults').innerText)).includes(CANARY)
  && await ev(() => !!document.querySelector('.j-sres__locked')));
await page.click('#lockBtn'); await waitSheet(true); await submitPass(PASS_A); await waitSheet(false);
await page.waitForTimeout(700);
ok('разблокировано: защищённое находится', (await ev(() => document.getElementById('searchResults').innerText)).includes(CANARY));
await page.click('#lockBtn'); await waitSheet(true); await page.click('#protectSubmit'); await waitSheet(false);
await page.waitForTimeout(700);
ok('блокировка убрала расшифрованные результаты', !(await bodyText()).includes(CANARY));

/* ═══ 5b. Полный DOM/value purge, Directory refresh и смена vault ══════ */
console.log('\n5b. J-Final: hidden DOM, Directory и внешний vault');
await page.click('#lockBtn'); await waitSheet(true); await submitPass(PASS_A); await waitSheet(false);
await gotoJournal('#overview');
await page.waitForFunction((c) => document.body.innerText.includes(c), CANARY);
await gotoJournal('#tasks');
await page.waitForFunction((c) => document.body.innerText.includes(c), CANARY);
await gotoJournal(ids.visitHash);
await page.waitForFunction((c) => document.body.innerText.includes(c), CANARY);
await gotoJournal(ids.projHash);
await page.waitForFunction((c) => document.body.innerText.includes(c), CANARY);
await ev((c) => {
  document.getElementById('taskDialogBody').value = 'Поле задачи ' + c;
  document.getElementById('projectDialogBody').value = 'Поле проекта ' + c;
}, CANARY);
await ev(() => CWJournal.protection.lock('live-hidden-dom'));
await settle();
const domPurge = await ev((c) => ({
  html: !document.documentElement.outerHTML.includes(c),
  values: Array.from(document.querySelectorAll('input,textarea')).every((f) => !String(f.value).includes(c)),
  autocomplete: document.getElementById('taskDialogBody').autocomplete === 'off'
    && document.getElementById('projectDialogBody').autocomplete === 'off',
}), CANARY);
ok('Lock: канарейки нет во всём outerHTML и значениях форм', domPurge.html && domPurge.values, JSON.stringify(domPurge));
ok('поля задачи/проекта запрещают восстановление истории', domPurge.autocomplete);

await page.click('#lockBtn'); await waitSheet(true); await submitPass(PASS_A); await waitSheet(false);
await gotoJournal(ids.visitHash);
await ev(() => CWDirectory.upsert({ id: 'dir_refresh_live', name: 'Directory refresh live' }, 'journal'));
await settle();
await page.click('#moreBtn');
const visitActions = await ev(() => Array.from(document.querySelectorAll('#moreMenuPanel [data-action]')).map((x) => x.dataset.action));
ok('CWDirectory.onChange сохраняет меню посещения', visitActions.includes('edit-dates') && !visitActions.includes('add-group'), visitActions.join(','));
await page.keyboard.press('Escape');

const restorePage = await ctx.newPage();
restorePage.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('restore: ' + m.text()); });
restorePage.on('pageerror', (e) => pageErrors.push('restore: ' + String(e)));
await restorePage.goto(J_URL + '#overview', { waitUntil: 'load' });
await restorePage.waitForFunction(() => !!self.CWBackup && !!self.CWJournalCrypto);
const foreign = await restorePage.evaluate(async (canary) => {
  const snap = await CWBackup.snapshot(['journal']);
  const original = structuredClone(snap);
  const made = await CWJournalCrypto.createVault('чужая фраза 2026');
  const row = {
    id: 'je_foreign_live', type: 'todo', status: 'open', nodeId: null,
    circuitId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    sec: await CWJournalCrypto.encryptEntry(made.key, 'je_foreign_live', { body: 'Чужой ' + canary }),
  };
  const stores = snap.sections.shared.idb['circuit-workspace-db'].stores;
  stores.journalMeta.rows = [made.meta];
  stores.journalEntries.rows = [row];
  stores.journalNodes.rows = [];
  stores.journalLinks.rows = [];
  return { original, changed: snap };
}, CANARY);
await restorePage.evaluate((snap) => CWBackup.restore(snap), foreign.changed);
await page.waitForFunction(() => !CWJournal.protection.isUnlocked(), null, { timeout: 15000 });
await settle();
const externalVault = await ev((c) => ({
  locked: !CWJournal.protection.isUnlocked(),
  html: !document.documentElement.outerHTML.includes(c),
  values: Array.from(document.querySelectorAll('input,textarea')).every((f) => !String(f.value).includes(c)),
}), CANARY);
ok('внешняя смена vault блокирует сессию и очищает plaintext', externalVault.locked && externalVault.html && externalVault.values, JSON.stringify(externalVault));
await restorePage.evaluate((snap) => CWBackup.restore(snap), foreign.original);
await restorePage.close();

/* ═══ 6. Перезагрузка и BFCache ════════════════════════════════════════ */
console.log('\n6. Жизненный цикл');
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!self.CWJournal);
await settle();
ok('перезагрузка — заблокировано', !(await ev(() => CWJournal.protection.isUnlocked())) && !(await bodyText()).includes(CANARY));
await gotoJournal('#tasks');
await page.click('#lockBtn'); await waitSheet(true); await submitPass(PASS_A); await waitSheet(false); await settle();
ok('перед уходом — текст виден', (await bodyText()).includes(CANARY));
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.goBack({ waitUntil: 'load' });
await page.waitForFunction(() => !!self.CWJournal);
await settle();
const nav = await ev(() => (performance.getEntriesByType('navigation')[0] || {}).type);
ok('после pagehide/возврата (' + nav + ') — заблокировано, текста нет', !(await ev(() => CWJournal.protection.isUnlocked())) && !(await bodyText()).includes(CANARY));

/* ═══ 7. Резервные копии ═══════════════════════════════════════════════ */
console.log('\n7. Резервные копии');
const snaps = await ev(async () => {
  const locked = await CWBackup.snapshot(['journal']);
  return { locked: JSON.stringify(locked) };
});
await page.click('#lockBtn'); await waitSheet(true); await submitPass(PASS_A); await waitSheet(false);
const snaps2 = await ev(async () => {
  const mod = await CWBackup.snapshot(['journal']);
  const full = await CWBackup.snapshot();
  const gid = await CWBackup.guard.save(mod);
  const guard = await CWBackup.guard.get(gid);
  const secs = Object.fromEntries((await CWDB.journalEntries.getAll()).filter((r) => r.sec).map((r) => [r.id, JSON.stringify(r.sec)]));
  const rows = mod.sections.shared.idb['circuit-workspace-db'].stores.journalEntries.rows.filter((r) => r.sec);
  return { mod: JSON.stringify(mod), full: JSON.stringify(full), guard: JSON.stringify(guard), same: rows.every((r) => JSON.stringify(r.sec) === secs[r.id]) && rows.length === Object.keys(secs).length };
});
ok('копия модуля (заблокировано) без канарейки', !snaps.locked.includes(CANARY));
ok('копия модуля (разблокировано) без канарейки', !snaps2.mod.includes(CANARY));
ok('полная копия без канарейки', !snaps2.full.includes(CANARY));
ok('предохранительный снимок без канарейки', !snaps2.guard.includes(CANARY));
ok('шифротекст в копии — байт в байт как в базе', snaps2.same);
const leak = await ev(async (C) => {
  const found = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if ((localStorage.getItem(k) || '').includes(C)) found.push('localStorage:' + k); }
  for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if ((sessionStorage.getItem(k) || '').includes(C)) found.push('sessionStorage:' + k); }
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const txt = await (await cache.match(req)).clone().text().catch(() => '');
      if (txt.includes(C)) found.push('cache:' + req.url);
    }
  }
  for (const info of await indexedDB.databases()) {
    const db = await new Promise((res, rej) => { const r = indexedDB.open(info.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    for (const s of db.objectStoreNames) {
      const all = await new Promise((res) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); });
      if (JSON.stringify(all).includes(C)) found.push('idb:' + info.name + '/' + s);
    }
    db.close();
  }
  return found;
}, CANARY);
ok('канарейки нет: localStorage, sessionStorage, Cache Storage, все базы IndexedDB', leak.length === 0, leak.join(', '));

/* Восстановление через настоящий интерфейс хаба. */
async function hubRestore(json) {
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!self.CWBackup);
  await page.setInputFiles('#backupFile', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.waitForFunction(() => { const s = document.getElementById('backupStatus').textContent; return !!s && s !== CWI18n.t('backup.working'); }, null, { timeout: 20000 });
  const status = await ev(() => document.getElementById('backupStatus').textContent);
  await page.waitForTimeout(1600);
  return status;
}
const secsA = await ev(async () => Object.fromEntries((await CWDB.journalEntries.getAll()).filter((r) => r.sec).map((r) => [r.id, JSON.stringify(r.sec)])));
// Другой сейф на «другом устройстве»: чистый Журнал, новая фраза.
const tb = await ev(async () => {
  for (const s of ['journalNodes', 'journalEntries', 'journalLinks', 'journalMeta']) await CWDB[s].clear();
  CWJournal.protection.lock();
  const c = await CWJournal.nodes.add({ kind: 'circuit', parentId: CWJournal.ROOT_PARENT, label: 'B' });
  const id = await CWJournal.tasks.add({ nodeId: c, body: 'только на B' });
  await CWDB.communities.put({ id: 'com_b', name: 'Только на B' });
  return id;
});
await gotoJournal('#tasks');
await page.click('.j-task__main:has-text("только на B")');
await page.waitForSelector('#taskDialog[open]');
await page.click('#taskDialogProtect');
await waitSheet(true);
await submitPass(PASS_B, PASS_B);
await waitSheet(false);
ok('устройство B: свой сейф', (await ev(() => CWDB.journalMeta.get('crypto:v1'))).wrap.ct !== JSON.parse(snaps2.mod).sections.shared.idb['circuit-workspace-db'].stores.journalMeta.rows[0].wrap.ct);
let st = await hubRestore(snaps2.mod);
await gotoJournal('#tasks');
const after = await ev(async (b) => ({
  bGone: (await CWDB.journalEntries.get(b)) === null,
  comB: !!(await CWDB.communities.get('com_b')), comA: !!(await CWDB.communities.get('com_live')),
  secs: Object.fromEntries((await CWDB.journalEntries.getAll()).filter((r) => r.sec).map((r) => [r.id, JSON.stringify(r.sec)])),
}), tb);
ok('копия модуля через хаб: набор Журнала заменён (' + st.trim().slice(0, 40) + ')', after.bGone && JSON.stringify(after.secs) === JSON.stringify(secsA));
ok('communities слиты: своё с B и из копии', after.comA && after.comB);
ok('после восстановления — заблокировано', !(await ev(() => CWJournal.protection.isUnlocked())));
await page.click('#lockBtn'); await waitSheet(true); await submitPass(PASS_B);
await page.waitForFunction(() => !document.getElementById('protectError').hidden);
ok('фраза B к восстановленному сейфу A не подходит', !(await ev(() => CWJournal.protection.isUnlocked())));
await submitPass(PASS_A); await waitSheet(false); await settle();
const allReadable = await ev(async () => {
  const rows = (await CWDB.journalEntries.getAll()).filter((r) => r.sec);
  const views = await Promise.all(rows.map((r) => CWJournal.entries.get(r.id)));
  return views.every((v) => !CWJournal.protection.isLocked(v));
});
ok('все защищённые строки открываются одним ключом A', allReadable);

// Легаси-копия J1–J7: открытый текст, без сейфа.
const legacy = JSON.parse(snaps2.mod);
const lst = legacy.sections.shared.idb['circuit-workspace-db'].stores;
lst.journalEntries.rows = lst.journalEntries.rows.filter((r) => !r.sec);
lst.journalMeta.rows = [];
await hubRestore(JSON.stringify(legacy));
await gotoJournal('#overview');
ok('легаси-копия: восстановлена, защиты нет, замок скрыт', (await ev(() => CWJournal.protection.status())).state === 'off' && await ev(() => document.getElementById('lockBtn').hidden));

// Повреждённая копия — отдельное сообщение, данные не тронуты.
const damaged = JSON.parse(snaps2.mod);
damaged.sections.shared.idb['circuit-workspace-db'].stores.journalMeta.rows = [];
before = await dumpDb();
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!self.CWBackup);
await page.setInputFiles('#backupFile', { name: 'damaged.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(damaged)) });
await page.waitForTimeout(800);
const dmsg = await ev(() => document.getElementById('backupStatus').textContent);
ok('повреждённая копия: «повреждена», не «не копия»', dmsg.trim() === (await ev(() => CWI18n.t('backup.damaged'))).trim(), dmsg);
await gotoJournal('#overview');
ok('…данные не изменены', (await dumpDb()) === before);

// Полная копия.
await hubRestore(snaps2.full);
await gotoJournal('#tasks');
await page.click('#lockBtn'); await waitSheet(true); await submitPass(PASS_A); await waitSheet(false); await settle();
ok('полная копия через хаб: восстановлено, открывается ключом A', (await bodyText()).includes('Задача ' + CANARY));

/* ═══ 8. Офлайн ═══════════════════════════════════════════════════════ */
console.log('\n8. Офлайн');
await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!self.CWJournal && !!self.CWJournalCrypto, null, { timeout: 15000 });
await settle();
ok('офлайн: модуль и crypto.js из кэша, заблокировано', !(await ev(() => CWJournal.protection.isUnlocked())));
await gotoJournal('#tasks');
await page.click('#lockBtn'); await waitSheet(true); await submitPass(PASS_A); await waitSheet(false); await settle();
ok('офлайн: разблокировка и расшифровка работают', (await bodyText()).includes('Задача ' + CANARY));
await ctx.setOffline(false);

/* ═══ 9. Широкий экран ═════════════════════════════════════════════════ */
await page.setViewportSize({ width: 1280, height: 900 });
await page.click('#lockBtn'); await waitSheet(true);
const box = await page.$eval('#protectSheet', (d) => { const r = d.getBoundingClientRect(); return { w: r.width, x: r.x }; });
ok('широкий экран: лист по центру, не во всю ширину', box.w <= 600 && box.x > 100, JSON.stringify(box));
await page.click('#protectSubmit'); await waitSheet(false);

console.log('\nОшибки консоли: ' + (consoleErrors.length ? consoleErrors.join(' | ') : 'нет'));
console.log('Ошибки страницы: ' + (pageErrors.length ? pageErrors.join(' | ') : 'нет'));
ok('без ошибок консоли и страницы', consoleErrors.length === 0 && pageErrors.length === 0);

await browser.close();
server.close();
console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ Живой прогон защиты Журнала: все проверки пройдены');
process.exit(failed ? 1 : 0);
