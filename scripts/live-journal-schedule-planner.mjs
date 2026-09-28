#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-schedule-planner.mjs
 *
 * Живой прогон подсказки «Подставить из Планировщика» в диалоге расписания
 * Журнала (J3c): настоящая запись Клиндария (events[].schedule) → кнопка в
 * диалоге «Расписание встреч» находит событие по communityId → человек сам
 * выбирает поле → сохранение пишет ТОЛЬКО в fields.schedule Журнала.
 * Собрание без связанного события Клиндария — понятное сообщение, не сбой.
 *
 *   node scripts/live-journal-schedule-planner.mjs   (playwright-core)
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

console.log('\n1. Клиндарий: событие с расписанием');
await openPlanner(pa);
await pa.evaluate(() => navigator.serviceWorker.ready);
await plannerEdit(`
  App.state.app.events.push({ id: 'evt_sched', name: 'Живое расписание', color: '#1f7a45', address: '', schedule: 'Ср 19:00, Вс 10:00', visitType: 'congregation' });
`);
ok('событие в каноне', await pa.evaluate(() => CWDB.state.get('circuit-planner').then((r) => /evt_sched/.test(r.payload))));

console.log('\n2. Журнал: диалог расписания, собрание СВЯЗАНО с событием');
await pj.goto(J_URL + '#overview', { waitUntil: 'load' });
await pj.waitForFunction(() => !!self.CWJournal && !!self.CWPlanner);
await pj.evaluate(() => navigator.serviceWorker.ready);
const ids = await pj.evaluate(async () => {
  const J = CWJournal;
  // Карточки справочника: связанное собрание (id = id события Клиндария)
  // и связанное собрание, для которого в Клиндарии события нет.
  await CWDirectory.upsert({ id: 'evt_sched', name: 'Живое расписание' }, 'journal');
  await CWDirectory.upsert({ id: 'dir_nomatch', name: 'Без события' }, 'journal');
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-SCHED' });
  const linked = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Связанное', communityId: 'evt_sched' });
  const unlinked = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Без события', communityId: 'dir_nomatch' });
  return { c, linked, unlinked };
});
await pj.evaluate((h) => { location.hash = h; }, `#districts/${ids.c}/congregation/${ids.linked}`);
await pj.waitForSelector('#congEditScheduleBtn');
await pj.click('#congEditScheduleBtn');
await pj.waitForSelector('#scheduleDialog[open]');
ok('поля расписания пустые изначально', await pj.evaluate(() => document.getElementById('scheduleDialogMidweek').value === '' && document.getElementById('scheduleDialogWeekend').value === ''));

await pj.fill('#scheduleDialogWeekend', 'Ручной ввод — не трогать');
await pj.click('#schedulePlannerBtn');
await pj.waitForSelector('.j-planner-suggestion');
ok('подсказка показывает название и расписание события', /Живое расписание/.test(await pj.textContent('.j-planner-suggestion')) && /Ср 19:00, Вс 10:00/.test(await pj.textContent('.j-planner-suggestion')));
ok('ручной ввод в другом поле не тронут открытием подсказки', await pj.evaluate(() => document.getElementById('scheduleDialogWeekend').value) === 'Ручной ввод — не трогать');

await pj.click('.j-planner-suggestion [data-target="midweek"]');
ok('подстановка ушла именно в «Серединное»', await pj.evaluate(() => document.getElementById('scheduleDialogMidweek').value) === 'Ср 19:00, Вс 10:00');
ok('«Выходное» осталось как было (выбор явный, а не автозамена)', await pj.evaluate(() => document.getElementById('scheduleDialogWeekend').value) === 'Ручной ввод — не трогать');
ok('панель подсказки закрылась после выбора', await pj.evaluate(() => document.getElementById('schedulePlannerPanel').hidden === true));

await pj.click('#schedulePlannerBtn');
await pj.waitForSelector('.j-planner-suggestion');
await pj.click('.j-planner-suggestion [data-target="weekend"]');
ok('вторая подстановка ушла в «Выходное», заменив ручной ввод по явному клику', await pj.evaluate(() => document.getElementById('scheduleDialogWeekend').value) === 'Ср 19:00, Вс 10:00');

await pj.click('#scheduleDialogForm button[type="submit"]');
await settle(pj, 300);
const saved = await pj.evaluate((id) => CWJournal.nodes.get(id).then((n) => n.fields && n.fields.schedule), ids.linked);
ok('сохранено ТОЛЬКО в fields.schedule Журнала', saved && saved.midweek === 'Ср 19:00, Вс 10:00' && saved.weekend === 'Ср 19:00, Вс 10:00');
const plannerUntouched = await pa.evaluate(() => CWDB.state.get('circuit-planner').then((r) => JSON.parse(r.payload).events.find((e) => e.id === 'evt_sched').schedule));
ok('исходное событие Клиндария не изменилось (только чтение)', plannerUntouched === 'Ср 19:00, Вс 10:00');

console.log('\n3. Собрание без события в Клиндарии — понятное сообщение, не сбой');
await pj.evaluate((h) => { location.hash = h; }, `#districts/${ids.c}/congregation/${ids.unlinked}`);
await pj.waitForSelector('#congEditScheduleBtn');
await pj.click('#congEditScheduleBtn');
await pj.waitForSelector('#scheduleDialog[open]');
await pj.click('#schedulePlannerBtn');
await settle(pj, 300);
ok('нет ни одной кнопки подстановки — событие не найдено', await pj.evaluate(() => document.querySelectorAll('.j-planner-suggestion').length === 0));
ok('панель не пустая молча — есть текст сообщения', (await pj.textContent('#schedulePlannerPanel')).trim().length > 0);
await pj.click('#scheduleDialogCancel');

console.log('\n4. Ошибок консоли/страницы нет');
ok('ошибок консоли/страницы нет', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
if (failed) { console.log(`\n✗ live-journal-schedule-planner: ${failed} провал(ов)`); process.exit(1); }
console.log('\n✓ live-journal-schedule-planner: всё прошло');
