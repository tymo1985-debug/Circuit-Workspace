#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-todo.mjs
 *
 * Живой прогон J9c (Chromium, чистый origin, 430×900): задачи Журнала в общем
 * To Do (CWTodo) — статус/срок/mutable живые, защищённая без текста, ссылка
 * #tasks/<id>, соседняя вкладка без опроса, bfcache, офлайн.
 *
 *   node scripts/live-journal-todo.mjs   (playwright-core; из корня репозитория)
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
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

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'ru-RU' });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const errors = [];
let dialogs = 0;
const watch = (page, name) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
  page.on('dialog', (d) => { dialogs++; d.accept(); });
};
const J_URL = BASE + '/journal/index.html';
const settle = (p, ms = 400) => p.waitForTimeout(ms);
const pj = await ctx.newPage(); watch(pj, 'journal');
const todo = (page, key) => page.evaluate((k) => CWTodo.get(k), key);

/* ═══ 1. Задачи в мосте ═════════════════════════════════════════════════ */
console.log('\n1. Задачи Журнала в CWTodo');
await pj.goto(J_URL + '#tasks', { waitUntil: 'load' });
await pj.waitForFunction(() => !!self.CWJournal && !!self.CWTodo);
await pj.evaluate(() => navigator.serviceWorker.ready);
const ids = await pj.evaluate(async () => {
  const J = CWJournal;
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-LIVE' });
  const n = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Живое' });
  const t1 = await J.tasks.add({ nodeId: n, body: 'Самостоятельная задача' });
  const v = await J.visits.add({ nodeId: n, dateFrom: '2028-03-12', dateTo: '2028-03-17' });
  const t2 = await J.visitRecords.add(v, { type: 'todo', body: 'Задача посещения' });
  const t3 = await J.tasks.add({ nodeId: n, body: 'Секретная задача ЖИВАЯ-КАНАРЕЙКА' });
  await CWTodo.init();
  return { c, n, t1, v, t2, t3 };
});
const k1 = 'journal:' + ids.t1, k2 = 'journal:' + ids.t2, k3 = 'journal:' + ids.t3;
ok('мост видит самостоятельную задачу', (await todo(pj, k1))?.text === 'Самостоятельная задача' && (await todo(pj, k1)).origin.kind === 'standalone');
ok('мост видит задачу посещения', (await todo(pj, k2))?.origin.kind === 'visit' && (await todo(pj, k2)).mutable === true);
await pj.evaluate(() => { location.hash = '#districts'; });
await settle(pj, 200);
await pj.evaluate(() => { location.hash = '#tasks'; });
await pj.waitForSelector('#tasksList .j-task');
const row = pj.locator('#tasksList .j-task', { hasText: 'Самостоятельная задача' });
await row.locator('.j-check__box').click();
await settle(pj, 500);
ok('отметка в Журнале → мост: done без опроса', (await todo(pj, k1)).status === 'done');
await pj.evaluate(() => { document.querySelector('#route-tasks [data-task-tab="done"]').click(); });
await settle(pj, 400);
await pj.locator('#tasksList .j-task', { hasText: 'Самостоятельная задача' }).locator('.j-check__box').click();
await settle(pj, 500);
ok('снятие отметки → open', (await todo(pj, k1)).status === 'open');
await pj.evaluate((id) => CWJournal.tasks.update(id, { dueDate: '2028-04-02' }), ids.t1);
await settle(pj, 300);
ok('срок → виден', (await todo(pj, k1)).dueDate === '2028-04-02');
await pj.evaluate((v) => CWJournal.visits.complete(v), ids.v);
await settle(pj, 300);
ok('посещение закрыто → mutable false', (await todo(pj, k2)).mutable === false);

/* ═══ 2. J8 ═════════════════════════════════════════════════════════════ */
console.log('\n2. Защищённая задача');
await pj.evaluate((id) => CWJournal.protection.setup('живая фраза J9c 2026', id), ids.t3);
await settle(pj, 300);
const p3 = await todo(pj, k3);
ok('защищённая: text null, protected true', p3.protected === true && p3.text === null);
ok('разблокировано — мост всё равно без текста', await pj.evaluate(async () => { await CWTodo.refresh(); return CWJournal.protection.isUnlocked() && !JSON.stringify(CWTodo.list()).includes('ЖИВАЯ-КАНАРЕЙКА'); }));

/* ═══ 3. Ссылка #tasks/<id> ═════════════════════════════════════════════ */
console.log('\n3. Ссылка на задачу');
const pl = await ctx.newPage(); watch(pl, 'link');
const url1 = await pj.evaluate((k) => CWTodo.urlFor(k), k2);
ok('ссылка из моста', url1 === '../journal/index.html#tasks/' + encodeURIComponent(ids.t2));
await pl.goto(BASE + '/journal/' + url1.replace('../journal/', ''), { waitUntil: 'load' });
await pl.waitForSelector('#tasksList .j-task--focus');
ok('открыта нужная задача (подсвечена, в фокусе)', await pl.evaluate(() => {
  const f = document.querySelector('#tasksList .j-task--focus');
  return !!f && /Задача посещения/.test(f.innerText) && f.contains(document.activeElement);
}));
ok('закрытое посещение — строка только для чтения', await pl.evaluate(() => document.querySelector('#tasksList .j-task--focus .j-check__box').disabled));
await pl.screenshot({ path: '/tmp/j9c-focus-430.png' });
await pl.goto('about:blank');
await pl.goto(J_URL + '#tasks/' + encodeURIComponent(ids.t3), { waitUntil: 'load' });
await pl.waitForFunction(() => document.getElementById('protectSheet') && document.getElementById('protectSheet').open, null, { timeout: 8000 }).catch(() => {});
ok('защищённая задача, Журнал закрыт → обычная разблокировка', await pl.evaluate(() => document.getElementById('protectSheet').open && !!document.querySelector('#tasksList .j-task--focus')));
await pl.keyboard.press('Escape');
for (const bad of ['#tasks/je_nope', '#tasks/a%20b', '#tasks/x/y']) {
  await pl.goto('about:blank');
  await pl.goto(J_URL + bad, { waitUntil: 'load' });
  await pl.waitForFunction(() => location.hash === '#tasks', null, { timeout: 5000 }).catch(() => {});
  ok('нет/кривая задача → обычные «Задачи»: ' + bad, await pl.evaluate(() => location.hash === '#tasks' && !document.querySelector('.j-task--focus') && !document.getElementById('route-tasks').hidden));
}
await pl.close();

/* ═══ 4. Соседняя вкладка и bfcache ════════════════════════════════════ */
console.log('\n4. Две вкладки, bfcache');
const p2 = await ctx.newPage(); watch(p2, 'journal-2');
await p2.goto(J_URL + '#tasks', { waitUntil: 'load' });
await p2.waitForFunction(() => !!self.CWTodo);
await p2.evaluate(() => CWTodo.init());
ok('вторая вкладка видит задачи', (await todo(p2, k1))?.status === 'open');
await pj.evaluate((id) => CWJournal.tasks.complete(id), ids.t1);
await p2.waitForFunction((k) => CWTodo.get(k) && CWTodo.get(k).status === 'done', k1, { timeout: 5000 }).catch(() => {});
ok('изменение в первой вкладке пришло без опроса', (await todo(p2, k1)).status === 'done');
ok('сигнал без следа в localStorage', await p2.evaluate(() => Object.keys(localStorage).every((k) => !/journal|todo/i.test(k) && !/Самостоятельная/.test(localStorage.getItem(k) || ''))));
await p2.evaluate(() => { window.__bfMark = 1; });
await p2.goto(BASE + '/documents/index.html', { waitUntil: 'load' });
await pj.evaluate((id) => CWJournal.tasks.reopen(id), ids.t1);
await settle(pj, 300);
await p2.goBack({ waitUntil: 'load' });
await p2.waitForFunction(() => !!self.CWTodo, null, { timeout: 8000 });
const fromBf = await p2.evaluate(() => window.__bfMark === 1);
if (!fromBf) await p2.evaluate(() => CWTodo.init());
await p2.waitForFunction((k) => CWTodo.get(k) && CWTodo.get(k).status === 'open', k1, { timeout: 5000 }).catch(() => {});
ok('возврат назад (' + (fromBf ? 'из bfcache' : 'новой загрузкой') + ') → свежий статус', (await todo(p2, k1)).status === 'open');
await p2.close();

/* ═══ 4b. Старт моста ∥ изменение из соседней вкладки ════════════════ */
console.log('\n4b. init() ∥ правка в соседней вкладке');
let raceOk = true, raceInfo = '';
for (let i = 0; i < 8; i++) {
  const p3 = await ctx.newPage(); watch(p3, 'journal-3');
  await p3.goto(J_URL + '#overview', { waitUntil: 'load' });
  await p3.waitForFunction(() => !!self.CWTodo && CWTodo.status() === 'idle');
  const want = i % 2 ? 'open' : 'done';
  await Promise.all([
    p3.evaluate(() => CWTodo.init()),
    pj.evaluate(([id, w]) => (w === 'done' ? CWJournal.tasks.complete(id) : CWJournal.tasks.reopen(id)).catch(() => null), [ids.t1, want]),
  ]);
  await p3.waitForTimeout(300);
  const st = await p3.evaluate(async (k) => ({ bridge: CWTodo.get(k).status, db: (await CWDB.journalEntries.get(k.split(':')[1])).status }), k1);
  if (st.bridge !== st.db) { raceOk = false; raceInfo = i + ': ' + JSON.stringify(st); }
  await p3.close();
  if (!raceOk) break;
}
ok('старт моста ∥ правка соседа ×8: мост показывает последнее состояние', raceOk, raceInfo);

/* ═══ 5. Офлайн ═════════════════════════════════════════════════════════ */
console.log('\n5. Офлайн');
await ctx.setOffline(true);
await pj.goto('about:blank');
await pj.goto(J_URL + '#tasks/' + encodeURIComponent(ids.t1), { waitUntil: 'load' });
await pj.waitForSelector('#tasksList .j-task--focus', { timeout: 10000 }).catch(() => {});
ok('офлайн: Журнал, ссылка на задачу, мост', await pj.evaluate(async (k) => { await CWTodo.init(); return !!document.querySelector('.j-task--focus') && CWTodo.get(k).status === 'open'; }, k1));
await ctx.setOffline(false);

const noise = errors.filter((e) => !/favicon|net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
ok('ошибок консоли/страницы нет', noise.length === 0, noise.join(' | '));

await browser.close();
server.close();
console.log(failed ? `\n✗ live-journal-todo: ${failed} провал(ов)` : '\n✓ live-journal-todo: всё прошло');
process.exit(failed ? 1 : 0);
