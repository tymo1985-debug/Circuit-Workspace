#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-overview.mjs
 *
 * Живой прогон O2 (Chromium, чистый origin/профиль): Обзор Журнала на
 * настоящих данных Журнала и Клиндария — сводка, строки-ссылки, FAB скрыт,
 * защищённый текст (заблокировано/разблокировано/блокировка), обновление из
 * соседней вкладки без перезагрузки (задача и район), гонки отрисовки (уход с
 * маршрута, блокировка поверх раскрытой отрисовки), состояния Клиндария
 * (invalid/unavailable/empty), 1280×900 и 430×900.
 *
 *   node scripts/live-journal-overview.mjs   (playwright-core; из корня репозитория)
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
  page.on('dialog', (d) => d.accept());
};
const J_URL = BASE + '/journal/index.html';
const settle = (p, ms = 500) => p.waitForTimeout(ms);
const SECRET = 'ЖИВОЙ-СЕКРЕТ-O2';

/* ═══ Сид: чистый профиль, настоящие данные Журнала и Клиндария ══════════ */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const pj = await ctx.newPage(); watch(pj, 'desktop');
await pj.goto(J_URL + '#overview', { waitUntil: 'load' });
await pj.waitForFunction(() => !!self.CWJournal && !!self.CWPlanner && !!self.CWDB);
const ids = await pj.evaluate(async (SECRET) => {
  const J = CWJournal;
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район Живой' });
  const c2 = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район Второй' });
  const n = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Собрание Липовое с очень длинным названием для проверки переноса строки' });
  const v1 = await J.visits.add({ nodeId: n, dateFrom: '2027-10-04', dateTo: '2027-10-09' });
  const v2 = await J.visits.add({ nodeId: n, dateFrom: '2028-03-13', dateTo: '2028-03-18' });
  const q = await J.visitRecords.add(v1, { type: 'question', body: 'Вернуться к вопросу о расписании встреч' });
  await J.carry.mark(q);
  const t1 = await J.tasks.add({ nodeId: n, body: 'Подготовить письмо старейшинам', dueDate: '2028-04-01' });
  const t2 = await J.tasks.add({ nodeId: n, body: SECRET });
  await J.protection.setup('correct horse battery', t2);
  J.protection.lock();
  const p = await J.projects.add({ circuitId: c, title: 'Проект районного служения' });
  await CWDB.state.put({ id: 'circuit-planner', savedAt: Date.now(), rev: 1, payload: JSON.stringify({ settings: {}, serviceYears: {},
    events: [
      { id: 'ev_a', name: 'А', visitType: 'congregation' }, { id: 'ev_b', name: 'Б', visitType: 'congregation' },
      { id: 'ev_c', name: 'В', visitType: 'congregation' }, { id: 'ev_g', name: 'Г', visitType: 'group' },
      { id: 'ev_plain', name: 'Обычное', visitType: '' },
    ],
    entries: [{ id: 'e1', eventId: 'ev_a', start: '2028-03-13', end: '2028-03-18' }, { id: 'e2', eventId: 'ev_a', start: '2027-03-13', end: '2027-03-18' }],
  }) });
  return { c, c2, n, v1, v2, q, t1, t2, p };
}, SECRET);
await pj.reload({ waitUntil: 'load' });
await pj.waitForSelector('#overviewTasks .j-row');
await settle(pj);
const stats = (p) => p.$$eval('#overviewStats .j-ovstat__value', (xs) => xs.map((x) => x.textContent));

/* ═══ A. Desktop ═════════════════════════════════════════════════════════ */
console.log('\nA. Desktop 1280×900');
ok('Обзор — стартовый экран', await pj.isVisible('#route-overview'));
ok('сводка: 2 района · 3 собрания · 1 группа · 0 предгрупп', (await stats(pj)).join() === '2,3,1,0', (await stats(pj)).join());
const html = await pj.content();
ok('фикстуры J1 нет', !/EU-K-03|Западное — весна|Недавно изменённые|Уточнить адрес зала/.test(html));
ok('заблокировано: секрета нет в DOM', !html.includes(SECRET));
ok('FAB на Обзоре скрыт', await pj.isHidden('#fab'));
const clickGo = async (sel, expect) => {
  await pj.click(sel);
  await settle(pj, 300);
  const h = await pj.evaluate(() => location.hash);
  await pj.evaluate(() => { location.hash = '#overview'; });
  await pj.waitForSelector('#overviewTasks .j-row');
  await settle(pj, 300);
  return h === expect ? true : h;
};
ok('задача → #tasks/<id>', (await clickGo('#overviewTasks .j-row >> nth=0', '#tasks/' + ids.t1)) === true);
ok('проект → карточка проекта', (await clickGo('#overviewProjects .j-row', '#districts/' + ids.c + '/project/' + ids.p)) === true);
ok('посещение → экран посещения', (await clickGo('#overviewVisits .j-row', '#districts/' + ids.c + '/congregation/' + ids.n + '/visit/' + ids.v2)) === true);
ok('перенос → посещение-источник', (await clickGo('#overviewCarry .j-row', '#districts/' + ids.c + '/congregation/' + ids.n + '/visit/' + ids.v1)) === true);
ok('«Все» задач → #tasks', (await clickGo('#overviewTasksSec a.j-sec__more', '#tasks')) === true);
await pj.screenshot({ path: '/tmp/o2-desktop.png', fullPage: true });

/* ═══ C. Защита: разблокировать → видно, заблокировать → исчезло ════════ */
console.log('\nC. Защита');
await pj.evaluate(() => CWJournal.protection.unlock('correct horse battery'));
await settle(pj);
ok('разблокировано: текст виден', (await pj.textContent('#overviewTasks')).includes(SECRET));
await pj.evaluate(() => CWJournal.protection.lock());
ok('блокировка: текст исчез сразу', !(await pj.content()).includes(SECRET));
await settle(pj);
ok('после перерисовки текста нет', !(await pj.content()).includes(SECRET) && (await pj.$$('#overviewTasks .j-row')).length === 2);

/* ═══ D. Изменение без перезагрузки: соседняя вкладка ════════════════════ */
console.log('\nD. Живое обновление');
const other = await ctx.newPage(); watch(other, 'tab2');
await other.goto(J_URL + '#tasks', { waitUntil: 'load' });
await other.waitForFunction(() => !!self.CWJournal);
await other.evaluate(async (n) => { await CWJournal.tasks.add({ nodeId: n, body: 'Задача из соседней вкладки' }); }, ids.n);
await settle(pj, 800);
ok('задача из соседней вкладки → счётчик 3', (await pj.textContent('#overviewTasksCount')) === '3');
await other.evaluate(async () => { await CWJournal.nodes.add({ kind: 'circuit', parentId: CWJournal.ROOT_PARENT, label: 'Район Третий' }); });
await settle(pj, 800);
ok('новый район в соседней вкладке → 3 района', (await stats(pj))[0] === '3', (await stats(pj)).join());
await other.close();

/* ═══ E. Гонки: уход с маршрута и блокировка поверх раскрытой отрисовки ══ */
console.log('\nE. Гонки отрисовки');
await pj.evaluate(() => {
  const real = CWJournal.overview.read;
  self.__ovGate = null;
  CWJournal.overview.read = async function () { const d = await real.apply(this, arguments); if (self.__ovGate) await self.__ovGate.p; return d; };
  self.__ovHold = () => { let r; self.__ovGate = { p: new Promise((x) => { r = x; }) }; self.__ovGate.r = r; };
});
const before = await pj.evaluate(() => document.querySelector('#overviewTasks').innerHTML + '|' + document.querySelector('#overviewTasksCount').textContent);
await pj.evaluate(() => { self.__ovHold(); self.__pending = CWJournalApp.renderOverview(); });
await pj.evaluate(async (n) => { await CWJournal.tasks.add({ nodeId: n, body: 'Задача во время ухода' }); }, ids.n);
await pj.evaluate(() => { location.hash = '#tasks'; });
await settle(pj, 300);
await pj.evaluate(async () => { const g = self.__ovGate; self.__ovGate = null; g.r(); await self.__pending; });
await settle(pj, 300);
const after = await pj.evaluate(() => document.querySelector('#overviewTasks').innerHTML + '|' + document.querySelector('#overviewTasksCount').textContent);
ok('уход с маршрута: устаревший результат не вставлен', after === before);
await pj.evaluate(() => { location.hash = '#overview'; });
await settle(pj);
await pj.evaluate(() => CWJournal.protection.unlock('correct horse battery'));
await settle(pj);
ok('разблокировано перед гонкой: текст виден', (await pj.content()).includes(SECRET));
await pj.evaluate(async () => {
  self.__ovHold();
  const stale = CWJournalApp.renderOverview();       // раскрытое чтение ждёт
  await new Promise((r) => setTimeout(r, 150));
  const g = self.__ovGate; self.__ovGate = null;
  CWJournal.protection.lock();                       // новая отрисовка без текста
  await new Promise((r) => setTimeout(r, 300));
  g.r(); await stale;
});
await settle(pj);
ok('устаревшая разблокированная отрисовка не вернула текст', !(await pj.content()).includes(SECRET));

/* ═══ F. Клиндарий недоступен / испорчен / пуст ═══════════════════════════ */
console.log('\nF. Состояния Клиндария');
await pj.evaluate(async () => {
  await CWDB.state.put({ id: 'circuit-planner', savedAt: Date.now(), rev: 9, payload: '{испорчено' });
  await CWPlanner.refresh();
});
await settle(pj);
ok('invalid → «—», не 0', (await stats(pj)).slice(1).every((x) => x === '—'), (await stats(pj)).join());
await pj.evaluate(async () => {
  const real = CWDB.state.get;
  CWDB.state.get = () => Promise.reject(new Error('недоступно'));
  await CWPlanner.refresh();
  CWDB.state.get = real;
});
await settle(pj);
ok('unavailable → «—», не 0', (await stats(pj)).slice(1).every((x) => x === '—'));
await pj.evaluate(async () => { await CWDB.state.remove('circuit-planner'); await CWPlanner.refresh(); });
await settle(pj);
ok('пустой Клиндарий → настоящие нули', (await stats(pj)).slice(1).join() === '0,0,0', (await stats(pj)).join());
// Намеренные сбои чтения пишут console.error у CWPlanner — это ожидаемо.
for (let i = errors.length - 1; i >= 0; i--) if (/канон Клиндария не прочитан|недоступно/.test(errors[i])) errors.splice(i, 1);

/* ═══ B. Mobile 430×900 ═══════════════════════════════════════════════════ */
console.log('\nB. Mobile 430×900');
const mctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'ru-RU', isMobile: true, hasTouch: true });
const pm = await mctx.newPage(); watch(pm, 'mobile');
await pm.goto(J_URL + '#overview', { waitUntil: 'load' });
await pm.waitForFunction(() => !!self.CWJournal && !!self.CWDB);
await pm.evaluate(async () => {
  const J = CWJournal;
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район' });
  const n = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Собрание с длинным-длинным-длинным названием Приозёрно-Лесное-Заречное' });
  const v = await J.visits.add({ nodeId: n, dateFrom: '2028-03-13', dateTo: '2028-03-18' });
  for (let i = 0; i < 4; i++) await J.tasks.add({ nodeId: n, body: 'Очень длинная задача номер ' + i + ' ' + 'словословословословословословословословословословослово'.repeat(2), dueDate: '2028-0' + (i + 1) + '-01' });
  const q = await J.visitRecords.add(v, { type: 'note', body: 'Длинный пункт переноса, который обязан переноситься по словам и не выходить за экран' });
  await J.carry.mark(q);
  await J.projects.add({ circuitId: c, title: 'Проект с длинным названием, который должен переноситься на мобильном' });
});
await pm.reload({ waitUntil: 'load' });
await pm.waitForSelector('#overviewTasks .j-row');
await settle(pm);
const geo = await pm.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const over = [...document.querySelectorAll('#route-overview *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > vw + 1 || r.left < -1); }).map((e) => e.className || e.tagName);
  const stats = [...document.querySelectorAll('#overviewStats .j-ovstat')].map((e) => e.getBoundingClientRect());
  const nav = document.querySelector('.md-bottomnav');
  const navR = nav ? nav.getBoundingClientRect() : null;
  return { vw, sw: document.documentElement.scrollWidth, over: over.slice(0, 5), statsIn: stats.every((r) => r.right <= vw + 1),
    rows: stats.length, nav: navR && navR.height > 0 && navR.bottom <= innerHeight + 1, fab: document.querySelector('#fab').hidden };
});
ok('нет горизонтального переполнения', geo.sw <= geo.vw && geo.over.length === 0, JSON.stringify(geo));
ok('сводка переносится и влезает', geo.rows === 4 && geo.statsIn);
ok('нижняя навигация на месте', geo.nav === true);
ok('FAB скрыт — не перекрывает', geo.fab === true);
ok('строки задач: ≤3, читаемы', (await pm.$$('#overviewTasks .j-row')).length === 3);
await pm.click('.md-bottomnav [data-route="tasks"]');
await settle(pm, 400);
ok('нижняя навигация работает (→ Задачи)', await pm.isVisible('#route-tasks'));
await pm.click('.md-bottomnav [data-route="overview"]');
await settle(pm, 400);
await pm.screenshot({ path: '/tmp/o2-mobile.png', fullPage: true });
ok('назад на Обзор', await pm.isVisible('#route-overview'));

ok('ошибок консоли/страницы нет', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ live-journal-overview: всё прошло');
process.exit(failed ? 1 : 0);
