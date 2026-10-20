#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-node-overview.mjs
 *
 * Живой прогон 0.27.0 (Chromium, 430×900): вкладка «Обзор» самостоятельной
 * группы — подсказка о прошедшем посещении и «Завершить», «На следующее
 * посещение», задачи, записи, быстрые действия; пустая группа.
 *
 *   node scripts/live-journal-node-overview.mjs   (playwright-core; из корня репозитория)
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
const errors = [];
const watch = (page, name) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
};
const J_URL = BASE + '/journal/index.html';
const settle = (p, ms = 500) => p.waitForTimeout(ms);
const alerts = [];
const confirms = [];

const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'ru-RU' });
const pj = await ctx.newPage(); watch(pj, 'nov');
pj.on('dialog', (d) => { if (d.type() === 'alert') alerts.push(d.message()); if (d.type() === 'confirm') confirms.push(d.message()); d.accept(); });
await pj.goto(J_URL); await pj.waitForFunction(() => window.CWJournal && window.CWDirectory); await settle(pj, 800);

/* Данные: район, самостоятельная группа G (визит с прошедшими датами, открыт;
   пункт «на след. визит», задача, заметка) и пустая группа E. */
const seed = await pj.evaluate(async () => {
  const J = CWJournal;
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район NO' });
  const g = await J.nodes.add({ kind: 'group', parentId: c, label: 'Группа Обзора' });
  const e = await J.nodes.add({ kind: 'group', parentId: c, label: 'Пустая группа' });
  const v = await J.visits.add({ nodeId: g, dateFrom: '2026-01-05', dateTo: '2026-01-10' });
  const r = await J.visitRecords.add(v, { type: 'note', body: 'Пункт на следующий визит' });
  await J.carry.mark(r);
  await J.tasks.add({ nodeId: g, body: 'Задача узла' });
  await J.congregationNotes.add(g, { type: 'note', body: 'Заметка группы' });
  return { c, g, e, v };
});
const enc = encodeURIComponent;
await pj.goto(J_URL + '#districts/' + enc(seed.c) + '/congregation/' + enc(seed.g)); await settle(pj, 1200);
const box = pj.locator('#congNodeOverview');
const text = await box.innerText();
ok('подсказка о завершении посещения видна', (await box.locator('.j-nov__hint').count()) === 1);
ok('«На следующее посещение» показывает пункт', text.includes('Пункт на следующий визит'));
ok('открытая задача показана', text.includes('Задача узла'));
ok('последняя запись показана', text.includes('Заметка группы'));
ok('быстрые действия есть', (await box.locator('.j-nov__quick button').count()) === 3);
await pj.screenshot({ path: process.env.NOV_SHOT || 'live-journal-node-overview.png', fullPage: true });

await box.locator('.j-nov__hint button').click(); await settle(pj, 1000);
const status = await pj.evaluate(async (id) => (await CWJournal.visits.get(id)).status, seed.v);
ok('«Завершить» завершает посещение', status === 'completed', status);
ok('подсказка исчезла после завершения', (await pj.locator('#congNodeOverview .j-nov__hint').count()) === 0);

await pj.goto(J_URL + '#districts/' + enc(seed.c) + '/congregation/' + enc(seed.e)); await settle(pj, 1000);
const etext = await pj.locator('#congNodeOverview').innerText();
ok('пустая группа: «Посещений пока нет» и «Пока ничего»', etext.includes('Посещений пока нет') && etext.includes('Пока ничего'));
ok('пустая группа: кнопка «Визит»', (await pj.locator('#congNodeOverview .md-btn-filled').count()) === 1);

ok('без ошибок консоли', errors.length === 0, errors.join(' | '));
await browser.close(); server.close();
console.log(failed ? '\nПровалов: ' + failed : '\nОбзор узла: всё прошло');
process.exit(failed ? 1 : 0);
