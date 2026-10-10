#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-node-removal.mjs
 *
 * Живой прогон 0.24.0 (Chromium, чистый профиль, 430×900): удаление
 * ошибочного узла с содержимым через меню собрания — подтверждение со
 * счётчиками, файл-копия JSON скачивается ДО удаления, узел и записи исчезают,
 * узел с посещением отказывает без потерь, пустой узел удаляется прежним путём.
 *
 *   node scripts/live-journal-node-removal.mjs   (playwright-core; из корня репозитория)
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
const pj = await ctx.newPage(); watch(pj, 'r2');
pj.on('dialog', (d) => { if (d.type() === 'alert') alerts.push(d.message()); if (d.type() === 'confirm') confirms.push(d.message()); d.accept(); });
await pj.goto(J_URL); await pj.waitForFunction(() => window.CWJournal && window.CWDirectory); await settle(pj, 800);

/* Данные: район, собрания A (без связи) и B, группа G, предгруппа P; карточки справочника
   чужого источника — как карточки Клиндария. */

const ids = await pj.evaluate(async () => {
  const J = CWJournal;
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район RM' });
  const ham = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Hamburg' });
  const wrong = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Group (Ukrainian) Hamburg-Russian-West' });
  const empty = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Пустое' });
  await J.congregationNotes.add(wrong, { type: 'note', body: 'Заметка узла' });
  await J.congregationNotes.add(wrong, { type: 'question', body: 'Вопрос узла' });
  await J.tasks.add({ nodeId: wrong, body: 'Задача узла' });
  await J.links.add({ from: J.urn.node(wrong), to: J.urn.external('circuit-planner', 'entry', 'ev1'), rel: 'external' });
  const keep = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Узел с посещением' });
  await J.congregationNotes.add(keep, { type: 'note', body: 'не должна пропасть' });
  await J.visits.add({ nodeId: keep, dateFrom: '2027-03-14', dateTo: '2027-03-19' });
  return { c, ham, wrong, empty, keep };
});
const detail = (id) => J_URL + '#districts/' + encodeURIComponent(ids.c) + '/congregation/' + encodeURIComponent(id);
const openMenuDelete = async () => {
  await pj.click('#moreBtn');
  await pj.click('#moreMenuPanel [data-action="delete"]');
};

console.log('\nУзел с содержимым: подтверждение, копия, удаление');
await pj.goto(detail(ids.wrong)); await pj.reload(); await settle(pj, 800);
const dl = pj.waitForEvent('download', { timeout: 8000 });
await openMenuDelete();
const download = await dl;
const file = await download.path();
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
ok('подтверждение показывает счётчики (1 / 1 / 1 / 1)', confirms.length === 1 && /Заметок: 1, вопросов: 1, задач: 1, связей: 1/.test(confirms[0]), confirms[0]);
ok('имя файла — journal-…-YYYY-MM-DD.json', /^journal-.*-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
ok('копия: формат, узел, 3 записи, 1 связь', payload.format === 'cw-journal-node-export' && payload.node.id === ids.wrong && payload.entries.length === 3 && payload.links.length === 1);
await settle(pj, 1000);
const after = await pj.evaluate(async (id) => ({
  node: !!(await CWJournal.nodes.get(id)),
  entries: (await CWJournal.entries.byNode(id)).length,
}), ids.wrong);
ok('узел и его записи удалены', !after.node && after.entries === 0);
ok('экран вернулся к району', pj.url().endsWith('#districts/' + encodeURIComponent(ids.c)), pj.url());
ok('сообщений об ошибке нет', alerts.length === 0, alerts.join(' | '));

console.log('\nУзел с посещением: отказ, данные целы');
await pj.goto(detail(ids.keep)); await pj.reload(); await settle(pj, 800);
await openMenuDelete(); await settle(pj, 800);
const keepState = await pj.evaluate(async (id) => ({
  node: !!(await CWJournal.nodes.get(id)),
  entries: (await CWJournal.entries.byNode(id)).length,
}), ids.keep);
ok('показано сообщение об отказе', alerts.length === 1 && /посещени/.test(alerts[0]), alerts.join(' | '));
ok('узел и записи не тронуты', keepState.node && keepState.entries === 2);

console.log('\nПустой узел: прежний путь, без файла');
alerts.length = 0; confirms.length = 0;
await pj.goto(detail(ids.empty)); await pj.reload(); await settle(pj, 800);
let downloaded = false;
pj.once('download', () => { downloaded = true; });
await openMenuDelete(); await settle(pj, 1000);
ok('обычное подтверждение без счётчиков', confirms.length === 1 && !/Заметок/.test(confirms[0]), confirms[0]);
ok('файл не скачивался, узел удалён', !downloaded && !(await pj.evaluate((id) => CWJournal.nodes.get(id), ids.empty)));

ok('в консоли нет ошибок', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсё прошло');
process.exit(failed ? 1 : 0);
