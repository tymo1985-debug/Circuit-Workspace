#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-planner.mjs
 *
 * Живой прогон J9a (Chromium, чистый origin): настоящая запись Клиндария →
 * кандидат в посещении Журнала → явная связь → переход по глубокой ссылке
 * (с PIN) → правки/удаление/возврат записи в соседней вкладке → замена и
 * снятие → закрытое посещение → копии → перезагрузка → офлайн.
 *
 *   node scripts/live-journal-planner.mjs   (playwright-core; из корня репозитория)
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
const plannerLinks = (v) => pj.evaluate((vid) => CWDB.journalLinks.getAll().then((l) => l.filter((x) => x.from === 'journal:entry/' + vid && x.to.startsWith('cw:circuit-planner/entry/'))), v);

/* ═══ 1. Настоящая запись Клиндария ════════════════════════════════════ */
console.log('\n1. Клиндарий: визит собрания');
await openPlanner(pa);
await pa.evaluate(() => navigator.serviceWorker.ready);
await plannerEdit(`
  App.state.app.events.push({ id: 'evt_live', name: 'Живое собрание', color: '#1f7a45', address: '', schedule: '', visitType: 'congregation' });
  App.state.app.entries.push({ id: 'entry_live1', eventId: 'evt_live', start: '2028-03-13', end: '2028-03-18', title: 'Живое собрание', note: '', flags: {}, source: 'entry' });
  App.state.app.entries.push({ id: 'entry_live2', eventId: 'evt_live', start: '2028-03-20', end: '2028-03-22', title: 'Живое собрание', note: '', flags: {}, source: 'entry' });
`);
ok('запись в каноне', await pa.evaluate(() => CWDB.state.get('circuit-planner').then((r) => /entry_live1/.test(r.payload))));

/* ═══ 2. Журнал: кандидат, явная связь ═════════════════════════════════ */
console.log('\n2. Журнал: кандидат и явная связь');
await pj.goto(J_URL + '#overview', { waitUntil: 'load' });
await pj.waitForFunction(() => !!self.CWJournal && !!self.CWPlanner);
await pj.evaluate(() => navigator.serviceWorker.ready);
const ids = await pj.evaluate(async () => {
  const J = CWJournal;
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-LIVE' });
  const n = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Живое', communityId: 'evt_live' });
  const v = await J.visits.add({ nodeId: n, dateFrom: '2028-03-12', dateTo: '2028-03-17' });
  const p = await J.projects.add({ circuitId: c, title: 'Проект района' });
  await J.projects.link(p, J.urn.entry(v));
  return { c, n, v, p };
});
await pj.evaluate((h) => { location.hash = h; }, `#districts/${ids.c}/congregation/${ids.n}/visit/${ids.v}`);
await pj.waitForSelector('#visitPlannerLink', { timeout: 10000 });
ok('чип «Связать с Клиндарием»', /Клиндари/.test(await chipText()));
ok('до выбора связей нет (без автосвязи)', (await plannerLinks(ids.v)).length === 0);
await pj.click('#visitPlannerLink');
await pj.waitForSelector('#plannerDialogList [data-entry="entry_live1"]');
const rowsText = await pj.evaluate(() => [...document.querySelectorAll('#plannerDialogList [data-entry]')].map((r) => r.dataset.entry + '|' + r.innerText));
ok('кандидат по собранию и датам — первым', rowsText[0].startsWith('entry_live1|') && /то же собрание/.test(rowsText[0]) && /даты совпадают/.test(rowsText[0]), rowsText.join(' / '));
ok('кнопка «Связать» неактивна до выбора', await pj.evaluate(() => document.getElementById('plannerDialogLink').disabled));
await pj.click('#plannerDialogList [data-entry="entry_live1"]');
ok('выбор ещё не пишет связь', (await plannerLinks(ids.v)).length === 0);
await pj.click('#plannerDialogLink');
await pj.waitForSelector('#visitPlannerRef');
let links = await plannerLinks(ids.v);
ok('связь записана (одна, URN)', links.length === 1 && links[0].to === 'cw:circuit-planner/entry/entry_live1' && links[0].rel === 'external');
ok('чип: текущие данные Клиндария', /13/.test(await chipText()) && /18/.test(await chipText()) && /Живое собрание/.test(await chipText()), await chipText());
ok('ссылка чипа — глубокая ссылка', (await pj.getAttribute('#visitPlannerRef', 'href')) === '../circuit-planner/index.html#calendar?entry=entry_live1');

/* ═══ 3. Переход и PIN ═════════════════════════════════════════════════ */
console.log('\n3. Глубокая ссылка');
const visitUrl = pj.url();
await pj.click('#visitPlannerRef');
await pj.waitForFunction(() => !!window.App && window.App.state && window.App.state.calendarDetailId === 'entry:entry_live1');
await settle(pj, 600);
ok('Клиндарий: календарь, месяц записи', await pj.evaluate(() => App.state.selectedScreen === 'calendar' && App.state.calendarMonth === 2 && App.state.calendarYear === 2028));
ok('карточка записи показана', await pj.evaluate(() => /Живое собрание/.test(document.getElementById('calendarSideTitle').innerText)));
await pj.goto(visitUrl, { waitUntil: 'load' });
await pj.waitForSelector('#visitPlannerRef');
const pinPage = await ctx.newPage(); watch(pinPage, 'pin');
await pa.evaluate(() => localStorage.setItem('syp-pin-hash', App.ui.pinHash('2468')));
await pinPage.goto(P_URL + '#calendar?entry=entry_live1', { waitUntil: 'load' });
await pinPage.waitForFunction(() => !!window.App && window.App.state && !!window.App.state.app);
await settle(pinPage, 600);
ok('PIN: оверлей закрывает экран', await pinPage.evaluate(() => !document.getElementById('pinOverlay').hidden));
await pinPage.fill('#pinInput', '2468');
await pinPage.click('#pinSubmitBtn');
await settle(pinPage);
ok('после PIN — нужная запись', await pinPage.evaluate(() => document.getElementById('pinOverlay').hidden && App.state.calendarDetailId === 'entry:entry_live1' && /Живое собрание/.test(document.getElementById('calendarSideTitle').innerText)));
const fresh = async (hash) => { await pinPage.goto('about:blank'); await pinPage.goto(P_URL + hash, { waitUntil: 'load' }); };
await fresh('#calendar?entry=entry_nope');
await pinPage.waitForFunction(() => !!window.App && window.App.state && !!window.App.state.app);
ok('неизвестная запись — обычный запуск, PIN на месте', await pinPage.evaluate(() => !/entry_nope/.test(App.state.calendarDetailId || '') && !document.getElementById('pinOverlay').hidden));
await fresh('#calendar?entry=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
await pinPage.waitForFunction(() => !!window.App && window.App.state && !!window.App.state.app);
ok('кривой id — без инъекции', await pinPage.evaluate(() => !document.querySelector('img[src="x"]')));
await fresh('#settings');
await pinPage.waitForFunction(() => !!window.App && window.App.state && !!window.App.state.app);
ok('обычная навигация по хэшу', await pinPage.evaluate(() => App.state.selectedScreen === 'settings'));
await fresh('#events');
await pinPage.waitForFunction(() => !!window.App && window.App.state && !!window.App.state.app);
ok('ярлык PWA ./#events', await pinPage.evaluate(() => App.state.selectedScreen === 'events'));
await pa.evaluate(() => localStorage.removeItem('syp-pin-hash'));
await pinPage.close();

/* ═══ 4. Соседняя вкладка: правки, удаление, возврат ═══════════════════ */
console.log('\n4. Живые изменения из Клиндария');
await openPlanner(pa);
await plannerEdit(`const e = App.state.app.entries.find((x) => x.id === 'entry_live1'); e.start = '2028-04-03'; e.end = '2028-04-08';`);
ok('даты сменились — чип обновился без перезагрузки', /3/.test(await chipText()) && /8/.test(await chipText()) && /апр/i.test(await chipText()), await chipText());
await plannerEdit(`const e = App.state.app.entries.find((x) => x.id === 'entry_live1'); e.title = 'Живое собрание (переименовано)';`);
ok('заголовок сменился', /переименовано/.test(await chipText()));
await plannerEdit(`App.state.app.entries = App.state.app.entries.filter((x) => x.id !== 'entry_live1');`);
await pj.waitForSelector('#visitPlannerBroken');
ok('запись удалена → «не найдена»', /не найдена/.test(await chipText()));
ok('…связь сохранена', (await plannerLinks(ids.v)).length === 1);
await plannerEdit(`App.state.app.entries.push({ id: 'entry_live1', eventId: 'evt_live', start: '2028-03-13', end: '2028-03-18', title: 'Живое собрание', note: '', flags: {}, source: 'entry' });`);
await pj.waitForSelector('#visitPlannerRef');
ok('тот же id вернулся → снова разрешается', /Живое собрание/.test(await chipText()));

/* ═══ 5. Замена, снятие, правила посещения ═════════════════════════════ */
console.log('\n5. Замена и снятие');
await pj.click('#visitPlannerEdit');
await pj.waitForSelector('#plannerDialogList [data-entry="entry_live2"]');
ok('в диалоге видна текущая связь', await pj.evaluate(() => !document.getElementById('plannerDialogCurrent').hidden && !document.getElementById('plannerDialogUnlink').hidden));
await pj.click('#plannerDialogList [data-entry="entry_live2"]');
await pj.click('#plannerDialogLink');
await settle(pj, 600);
links = await plannerLinks(ids.v);
ok('замена: одна связь на новую запись', links.length === 1 && links[0].to.endsWith('/entry_live2'));
ok('связь проекта цела', await pj.evaluate((v) => CWDB.journalLinks.getAll().then((l) => l.some((x) => x.to === 'journal:entry/' + v && x.rel === 'relates')), ids.v));
await pj.click('#visitPlannerEdit');
await pj.waitForSelector('#plannerDialogUnlink:not([hidden])');
await pj.click('#plannerDialogUnlink');
await pj.waitForSelector('#visitPlannerLink');
ok('снятие: связей нет, чип «Связать»', (await plannerLinks(ids.v)).length === 0);
ok('…связь проекта цела', await pj.evaluate((v) => CWDB.journalLinks.getAll().then((l) => l.some((x) => x.to === 'journal:entry/' + v)), ids.v));
await pj.evaluate((v) => CWJournal.planner.set(v, 'entry_live1'), ids.v);
await pj.evaluate(async (v) => { await CWJournal.visits.complete(v); }, ids.v);
await pj.reload({ waitUntil: 'load' });
await pj.waitForSelector('#visitPlannerRef');
ok('закрытое посещение: ссылка есть, правки нет', await pj.evaluate(() => !document.getElementById('visitPlannerEdit')));
ok('удаление посещения со связью — отказ', await pj.evaluate((v) => CWJournal.visits.remove(v).then(() => false, (e) => e.message === 'journal-visit-has-links'), ids.v));
await pj.evaluate(async (v) => { await CWJournal.visits.reopen(v); }, ids.v);

/* ═══ 5b. Две вкладки Журнала одновременно; справочник в той же вкладке ═ */
console.log('\n5b. Две вкладки: set ∥ set, set ∥ clear; справочник');
const pj2 = await ctx.newPage(); watch(pj2, 'journal-2');
await pj2.goto(J_URL + '#overview', { waitUntil: 'load' });
await pj2.waitForFunction(() => !!self.CWJournal && !!self.CWPlanner);
let raceOk = true;
for (let i = 0; i < 10; i++) {
  const a = i % 2 ? 'entry_live1' : 'entry_live2', b = i % 2 ? 'entry_live2' : 'entry_live1';
  await Promise.allSettled([
    pj.evaluate(([v, e]) => CWJournal.planner.set(v, e), [ids.v, a]),
    pj2.evaluate(([v, e]) => CWJournal.planner.set(v, e), [ids.v, b]),
  ]);
  const r = await plannerLinks(ids.v);
  if (r.length !== 1 || r[0].id !== 'jl_planner|journal:entry/' + ids.v) { raceOk = false; break; }
  await Promise.allSettled([
    pj.evaluate(([v, e]) => CWJournal.planner.set(v, e), [ids.v, a]),
    pj2.evaluate((v) => CWJournal.planner.clear(v), ids.v),
  ]);
  if ((await plannerLinks(ids.v)).length > 1) { raceOk = false; break; }
}
ok('две вкладки ×10: никогда больше одной строки-слота', raceOk);
await pj2.close();
await pj.evaluate((v) => CWJournal.planner.clear(v), ids.v);
const dirName = await pj.evaluate(async () => {
  await CWDirectory.upsert({ id: 'evt_live', name: 'Живое (справочник)' }, 'journal');
  await new Promise((r) => setTimeout(r, 200));
  return CWPlanner.getEntry('entry_live1').name;
});
ok('справочник в той же вкладке → имя в мосте обновлено', dirName === 'Живое (справочник)', dirName);

/* ═══ 6. Копии ═════════════════════════════════════════════════════════ */
console.log('\n6. Резервные копии');
await pj.reload({ waitUntil: 'load' });
await pj.waitForFunction(() => !!self.CWBackup && !!self.CWJournal);
await pj.evaluate((v) => CWJournal.planner.set(v, 'entry_live1'), ids.v);
const bk = await pj.evaluate(async (v) => {
  const snapJ = await CWBackup.snapshot(['journal']);
  const full = await CWBackup.snapshot();
  const journalOnlyUrn = JSON.stringify(snapJ).includes('cw:circuit-planner/entry/entry_live1');
  const noPlannerData = !/Живое собрание/.test(JSON.stringify(snapJ.sections.shared.idb['circuit-workspace-db'].stores.journalLinks));
  await CWJournal.planner.clear(v);
  await CWBackup.restore(snapJ);
  const back = (await CWJournal.planner.get(v))?.entryId;
  await CWJournal.planner.clear(v);
  await CWBackup.restore(full);
  const backFull = (await CWJournal.planner.get(v))?.entryId;
  return { journalOnlyUrn, noPlannerData, back, backFull, fullOk: CWBackup.inspect(full).ok };
}, ids.v);
ok('копия Журнала: только URN', bk.journalOnlyUrn && bk.noPlannerData);
ok('восстановление Журнала возвращает связь', bk.back === 'entry_live1');
ok('полная копия: проверка и восстановление', bk.fullOk && bk.backFull === 'entry_live1');

/* Справочник переименован в 5b: Клиндарий (вкладка открыта) переносит
   новое имя в свои записи сам — чип показывает живой заголовок. */
/* ═══ 7. Перезагрузка и офлайн ═════════════════════════════════════════ */
console.log('\n7. Перезагрузка и офлайн');
await pj.goto(visitUrl, { waitUntil: 'load' });
await pj.waitForSelector('#visitPlannerRef');
ok('после перезагрузки связь разрешается', /Живое/.test(await chipText()));
await ctx.setOffline(true);
await pj.reload({ waitUntil: 'load' });
await pj.waitForSelector('#visitPlannerRef', { timeout: 10000 });
ok('офлайн: Журнал открывается и разрешает связь', /Живое/.test(await chipText()));
await pj.click('#visitPlannerRef');
await pj.waitForFunction(() => !!window.App && window.App.state && window.App.state.calendarDetailId === 'entry:entry_live1', null, { timeout: 15000 });
ok('офлайн: глубокая ссылка открывает Клиндарий', await pj.evaluate(() => App.state.selectedScreen === 'calendar'));
await ctx.setOffline(false);

const noise = errors.filter((e) => !/favicon|net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
ok('ошибок консоли/страницы нет', noise.length === 0, noise.join(' | '));

await browser.close();
server.close();
console.log(failed ? `\n✗ live-journal-planner: ${failed} провал(ов)` : '\n✓ live-journal-planner: всё прошло');
process.exit(failed ? 1 : 0);
