#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-visit-from-planner.mjs
 *
 * Живой прогон 0.23.0: «Новое посещение» из календаря Клиндария —
 * предстоящие визиты собрания, предвыбор ближайшего свободного, блокировка
 * дат, «Отвязать», связь в слот J9a, пометка «уже в журнале», собрание без
 * карточки, расхождение дат и обновление по нажатию, 320px.
 *
 *   node scripts/live-journal-visit-from-planner.mjs   (из корня репозитория)
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
const errors = [];
const watch = (page, name) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
  page.on('dialog', (d) => d.accept());
};
const P_URL = BASE + '/circuit-planner/index.html';
const J_URL = BASE + '/journal/index.html';
const pa = await ctx.newPage(); watch(pa, 'planner');
const pj = await ctx.newPage(); watch(pj, 'journal');
const settle = (p, ms = 400) => p.waitForTimeout(ms);

async function openPlanner(page, hash) {
  await page.goto(P_URL + (hash || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.App && !!window.App.state && !!window.App.state.app && !!document.querySelector('#calendarSideDetails'));
  await settle(page, 600);
}
/* Правка Клиндария его же кодом (App.state + save/flush) — канон пишет CWState. */
async function plannerEdit(src) {
  await pa.evaluate(async (code) => {
    new Function('App', code)(window.App);
    App.store.save(); App.store.flushNow('live');
    App.ui.renderAll();
    for (let i = 0; i < 50; i++) {
      const rec = await CWDB.state.get('circuit-planner');
      if (rec && rec.payload === JSON.stringify(App.state.app)) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('канон не записан');
  }, src);
  await settle(pj, 700);
}
const chipText = () => pj.evaluate(() => { const s = document.getElementById('visitPlannerSlot'); return s ? s.innerText : ''; });
await openPlanner(pa);
await pa.evaluate(() => navigator.serviceWorker.ready);
await plannerEdit(`
  App.state.app.events.push({ id: 'evt_v', name: 'Berlin-Ukrainisch', color: '#1f7a45', address: '', schedule: '', visitType: 'congregation' });
  App.state.app.entries.push({ id: 'e_past', eventId: 'evt_v', start: '2025-03-10', end: '2025-03-15', title: '', note: '', flags: {}, source: 'entry' });
  App.state.app.entries.push({ id: 'e_a', eventId: 'evt_v', start: '2028-03-13', end: '2028-03-18', title: '', note: '', flags: {}, source: 'entry' });
  App.state.app.entries.push({ id: 'e_b', eventId: 'evt_v', start: '2028-09-11', end: '2028-09-16', title: '', note: '', flags: {}, source: 'entry' });
`);
await pj.goto(J_URL + '#overview', { waitUntil: 'load' });
await pj.waitForFunction(() => !!self.CWJournal && !!self.CWPlanner);
const ids = await pj.evaluate(async () => {
  const J = CWJournal;
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
  const n = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Berlin', communityId: 'evt_v' });
  const m = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Без связи' });
  return { c, n, m };
});
async function openNew(node) {
  await pj.evaluate((h) => { location.hash = h; }, `#districts/${ids.c}/congregation/${node}/visits`);
  await settle(pj, 600);
  await pj.click('#fab');
  await pj.waitForSelector('#visitDialog[open]');
  await settle(pj, 600);
}
const state = () => pj.evaluate(() => ({
  shown: !document.getElementById('visitDialogPlanner').hidden,
  opts: [...document.querySelectorAll('#visitDialogEntry option')].map((o) => o.value + '|' + o.textContent),
  val: document.getElementById('visitDialogEntry').value,
  from: document.getElementById('visitDialogFrom').value, to: document.getElementById('visitDialogTo').value,
  locked: document.getElementById('visitDialogFrom').disabled && document.getElementById('visitDialogTo').disabled,
  manual: !document.getElementById('visitDialogManual').hidden,
}));
console.log('\n1. Собрание со связью: предвыбор, блокировка');
await openNew(ids.n);
let s = await state();
ok('блок календаря показан', s.shown);
ok('прошедшие не в списке', !s.opts.some((o) => o.startsWith('e_past')), JSON.stringify(s.opts));
ok('3 пункта (ручной + 2)', s.opts.length === 3, JSON.stringify(s.opts));
ok('ближайший предвыбран, даты заполнены и закрыты', s.val === 'e_a' && s.from === '2028-03-13' && s.to === '2028-03-18' && s.locked && s.manual, JSON.stringify(s));
await pj.selectOption('#visitDialogEntry', 'e_b'); s = await state();
ok('смена записи меняет даты', s.from === '2028-09-11' && s.to === '2028-09-16' && s.locked);
await pj.click('#visitDialogManual'); s = await state();
ok('«Отвязать» открывает ручной ввод', s.val === '' && !s.locked && !s.manual);
await pj.selectOption('#visitDialogEntry', 'e_a');
await pj.click('#visitDialog button[type=submit]');
await pj.waitForFunction(() => /\/visit\//.test(location.hash), null, { timeout: 10000 });
const v1 = await pj.evaluate(() => location.hash.split('/visit/')[1]);
const link = await pj.evaluate((v) => CWJournal.planner.get(v), v1);
const vis = await pj.evaluate((v) => CWJournal.visits.get ? CWJournal.visits.get(v) : CWJournal.entries.get(v), v1);
ok('посещение создано с датами записи', vis.dateFrom === '2028-03-13' && vis.dateTo === '2028-03-18', JSON.stringify(vis));
ok('связь записана в слот', link && link.entryId === 'e_a', JSON.stringify(link));
await pj.waitForSelector('#visitPlannerRef', { timeout: 10000 });
ok('чип календаря на посещении, метки расхождения нет', !(await pj.$('#visitPlannerDates')));

console.log('\n2. Повторное создание: занятая запись помечена');
await openNew(ids.n);
s = await state();
ok('e_a помечена «уже в журнале», предвыбрана свободная e_b', s.opts.some((o) => o.startsWith('e_a|') && /уже в журнале/.test(o)) && s.val === 'e_b', JSON.stringify(s));
await pj.click('#visitDialogCancel');
await settle(pj);
ok('после отмены поля разблокированы', await pj.evaluate(() => !document.getElementById('visitDialogFrom').disabled));

console.log('\n3. Собрание без связи со справочником: ручной ввод');
await openNew(ids.m);
s = await state();
ok('блок скрыт, поля свободны', !s.shown && !s.locked);
await pj.click('#visitDialogCancel');

console.log('\n4. Даты в календаре изменились');
await pj.evaluate((h) => { location.hash = h; }, `#districts/${ids.c}/congregation/${ids.n}/visit/${v1}`);
await pj.waitForSelector('#visitPlannerRef', { timeout: 10000 });
await plannerEdit(`const e = App.state.app.entries.find((x) => x.id === 'e_a'); e.start = '2028-03-20'; e.end = '2028-03-25';`);
await pj.waitForSelector('#visitPlannerDates', { timeout: 10000 });
ok('метка расхождения', /изменились/.test(await chipText()), await chipText());
const before = await pj.evaluate((v) => CWJournal.entries.get(v), v1);
ok('сами даты не перезаписаны автоматически', before.dateFrom === '2028-03-13');
await pj.click('#visitPlannerDates');
await settle(pj, 800);
const after = await pj.evaluate((v) => CWJournal.entries.get(v), v1);
ok('«обновить» берёт даты календаря', after.dateFrom === '2028-03-20' && after.dateTo === '2028-03-25', JSON.stringify(after));
ok('метка ушла', !(await pj.$('#visitPlannerDates')));
if (process.env.SHOT) await pj.screenshot({ path: process.env.SHOT });

console.log('\n5. Телефон 320: диалог влезает');
await pj.setViewportSize({ width: 320, height: 640 });
await openNew(ids.n);
const fit = await pj.evaluate(() => { const r = document.querySelector('#visitDialog').getBoundingClientRect(); return r.right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth; });
ok('без горизонтальной прокрутки', fit);
if (process.env.SHOT) await pj.screenshot({ path: process.env.SHOT.replace('.png', '-320.png') });

ok('нет ошибок консоли', !errors.length, errors.join(' | '));
await browser.close(); server.close();
console.log(failed ? `\n✗ провалено: ${failed}` : '\n✓ всё прошло');
process.exit(failed ? 1 : 0);
