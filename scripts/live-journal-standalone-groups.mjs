#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-standalone-groups.mjs
 *
 * Живой прогон 0.25.0 (Chromium, чистый профиль, 430×900): самостоятельная
 * группа (без собрания) — импорт из календаря с выбором «Отдельная группа»,
 * строка в списке района, страница группы без блоков собрания, посещение
 * через FAB, метка в «Составе», вложенная группа не затронута.
 *
 *   node scripts/live-journal-standalone-groups.mjs   (playwright-core; из корня репозитория)
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


const EVENTS = [
  { id: 'ev_hh', name: 'Hamburg-Russian', visitType: 'congregation' },
  { id: 'ev_l', name: 'Group (Ukrainian) Leipzig-Russian', visitType: 'group' },
  { id: 'ev_n', name: 'Group (Ukrainian) Hamburg-West', visitType: 'group' },
];
const seed = await pj.evaluate(async (ev) => {
  const J = CWJournal;
  await CWDirectory.init();
  for (const e of ev) await CWDirectory.upsert({ id: e.id, name: e.name }, 'circuit-planner');
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район SG' });
  const hh = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Hamburg-Russian' });
  await CWDirectory.attach('ev_hh', 'journal');
  await J.nodes.update(hh, { communityId: 'ev_hh' });
  await CWDB.state.put({ id: 'circuit-planner', savedAt: Date.now(), rev: Date.now() % 100000, payload: JSON.stringify({ settings: {}, serviceYears: {}, events: ev, entries: [] }) });
  await CWPlanner.refresh();
  return { c, hh };
}, EVENTS);
const nodes = () => pj.evaluate(() => CWJournal.nodes.getAll());
const byCom = async (id) => (await nodes()).filter((n) => n.communityId === id)[0] || null;

console.log('\n1. Импорт: «Отдельная группа» и вложенная в одном проходе');
await pj.evaluate(() => { location.hash = '#roster'; });
await settle(pj, 500);
await pj.locator('#rosterImportBtn').click();
await pj.waitForSelector('#importDialog[open]');
await settle(pj, 500);
const optTexts = await pj.$$eval('#importBody select:first-of-type option', (o) => o.map((x) => x.textContent));
ok('первым родителем — «Отдельная группа (без собрания)»', optTexts[1] === 'Отдельная группа (без собрания)', JSON.stringify(optTexts));
ok('кнопка пока (0), родитель сам не выбран', (await pj.locator('#importApply').textContent()).includes('(0)') && (await pj.$$eval('#importBody select', (s) => s.every((x) => x.value === ''))));
const rows = pj.locator('#importBody .j-import__row');
const rowL = rows.filter({ hasText: 'Leipzig-Russian' });
await rowL.locator('select').selectOption('circuit');
await settle(pj, 200);
ok('после выбора кнопка (1)', (await pj.locator('#importApply').textContent()).includes('(1)'));
const rowN = rows.filter({ hasText: 'Hamburg-West' });
await rowN.locator('select').selectOption({ label: 'Hamburg-Russian' });
await settle(pj, 200);
ok('вложенная выбирает собрание — кнопка (2)', (await pj.locator('#importApply').textContent()).includes('(2)'));
await pj.locator('#importApply').click();
await settle(pj, 1200);
ok('результат: добавлено 2, не удалось 0', (await pj.locator('#importBody').textContent()).includes('Добавлено: 2. Не удалось: 0.'));
const gl = await byCom('ev_l'), gn = await byCom('ev_n');
ok('самостоятельная: kind group, parentId = район', gl && gl.kind === 'group' && gl.parentId === seed.c && gl.circuitId === seed.c);
ok('вложенная: parentId = собрание', gn && gn.parentId === seed.hh);
await pj.locator('#importCancel').click();
await settle(pj, 300);

console.log('\n2. Список района и страница группы');
await pj.goto(J_URL + '#districts/' + encodeURIComponent(seed.c)); await pj.reload(); await settle(pj, 1000);
const titles = await pj.$$eval('#congregationsTree > .j-row .j-row__title', (r) => r.map((x) => x.textContent.trim()));
ok('в списке района и собрание, и самостоятельная группа', titles.includes('Hamburg-Russian') && titles.includes('Group (Ukrainian) Leipzig-Russian'), JSON.stringify(titles));
ok('вложенная группа отдельной строкой в списке района не стоит', !titles.includes('Group (Ukrainian) Hamburg-West') || (await pj.$$eval('#congregationsTree .j-tree__child .j-row__title', (r) => r.map((x) => x.textContent.trim()))).includes('Group (Ukrainian) Hamburg-West'));
ok('счётчик: «+ 1 собраний + 1 отдельных групп»', (await pj.locator('#districtCounts').textContent()).includes('1 отдельных групп'), await pj.locator('#districtCounts').textContent());
await pj.locator('#congregationsTree > .j-row', { hasText: 'Leipzig-Russian' }).first().locator('.j-row__body').click();
await settle(pj, 800);
ok('страница открыта по маршруту собрания', pj.url().includes('/congregation/' + encodeURIComponent(gl.id)), pj.url());
ok('заголовок — название группы', (await pj.locator('#congTitle').textContent()).trim() === 'Group (Ukrainian) Leipzig-Russian');
ok('подпись «группа · отдельная, без собрания»', (await pj.locator('#congMeta').textContent()).includes('отдельная, без собрания'), await pj.locator('#congMeta').textContent());
ok('карточка собрания и блок дочерних групп скрыты', await pj.locator('#congIdentityCard').isHidden() && await pj.locator('#congChildrenSec').isHidden());
ok('вкладки: «Записи» и «Посещения» есть', await pj.locator('[data-cong-tab="entries"]').isVisible() && await pj.locator('[data-cong-tab="visits"]').isVisible());
const menu = await pj.evaluate(() => [...document.querySelectorAll('#moreMenuPanel [data-action]')].map((b) => b.dataset.action));
ok('меню без «добавить группу/предгруппу»', !menu.includes('add-group') && !menu.includes('add-pregroup') && menu.includes('delete') && menu.includes('rename'), JSON.stringify(menu));

console.log('\n3. Посещение через FAB');
await pj.locator('[data-cong-tab="visits"]').click();
await settle(pj, 500);
await pj.locator('#fab').click();
await pj.waitForSelector('#visitDialog[open]');
await pj.fill('#visitDialogFrom', '2027-03-14');
await pj.fill('#visitDialogTo', '2027-03-19');
await pj.locator('#visitDialogForm button[type="submit"]').click();
await settle(pj, 1000);
const vis = await pj.evaluate((id) => CWJournal.visits.byNode(id), gl.id);
ok('посещение создано на группе', vis.length === 1 && vis[0].dateFrom === '2027-03-14');
ok('после сохранения открылся экран посещения (не сброшен на район)', pj.url().includes('/visit/' + encodeURIComponent(vis[0].id)), pj.url());
ok('подпись «посещение группы», крошка — название группы', (await pj.locator('#visitLede').textContent()).includes('посещение группы') && (await pj.locator('#visitCrumbCong').textContent()).includes('Leipzig-Russian'));
await pj.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/sg-visit.png' });

console.log('\n4. «Состав»: метка и ссылка');
await pj.goto(J_URL + '#roster/groups'); await pj.reload(); await settle(pj, 1000);
const rtxt = await pj.locator('#rosterList').textContent();
ok('отдельная — «отдельная группа», вложенная — «Собрание: Hamburg-Russian»', rtxt.includes('отдельная группа') && rtxt.includes('Собрание: Hamburg-Russian'), rtxt);
await pj.locator('#rosterList a', { hasText: 'Leipzig-Russian' }).first().click();
await settle(pj, 800);
ok('ссылка из «Состава» ведёт на страницу группы', pj.url().includes('/congregation/' + encodeURIComponent(gl.id)), pj.url());

console.log('\n5. Вкладка «Записи» по прямой ссылке на группу — открывается');
await pj.goto(J_URL + '#districts/' + encodeURIComponent(seed.c) + '/congregation/' + encodeURIComponent(gl.id) + '/entries'); await pj.reload(); await settle(pj, 1000);
const panels = await pj.evaluate(() => ({ e: document.getElementById('congEntriesPanel').hidden, o: document.getElementById('congOverviewPanel').hidden, url: location.hash, view: document.getElementById('congregationDetailView').hidden }));
ok('панель «Записи» показана, «Обзор» скрыт', panels.e === false && panels.o === true, JSON.stringify(panels));

console.log('\n6. Собрание не пострадало');
await pj.goto(J_URL + '#districts/' + encodeURIComponent(seed.c) + '/congregation/' + encodeURIComponent(seed.hh)); await pj.reload(); await settle(pj, 1000);
ok('у собрания блоки на месте, вкладка «Записи» есть', await pj.locator('#congIdentityCard').isVisible() && await pj.locator('#congChildrenSec').isVisible() && await pj.locator('[data-cong-tab="entries"]').isVisible());

console.log('\n7. «Преобразовать в самостоятельную группу» (0.26.0)');
const cv = await pj.evaluate(async (c) => {
  const id = await CWJournal.nodes.add({ kind: 'congregation', parentId: c, label: 'Group (Ukrainian) Test-Convert' });
  await CWJournal.congregationNotes.add(id, { type: 'note', body: 'Заметка до преобразования' });
  await CWJournal.visits.add({ nodeId: id, dateFrom: '2027-05-02', dateTo: '2027-05-07' });
  return id;
}, seed.c);
await pj.goto(J_URL + '#districts/' + encodeURIComponent(seed.c) + '/congregation/' + encodeURIComponent(cv)); await pj.reload(); await settle(pj, 1000);
await pj.click('#moreBtn'); await settle(pj, 200);
const menu7 = await pj.evaluate(() => [...document.querySelectorAll('#moreMenuPanel [data-action]')].map((b) => b.dataset.action));
ok('в меню собрания есть «Преобразовать»', menu7.includes('to-standalone'), JSON.stringify(menu7));
const nConf = confirms.length;
await pj.locator('#moreMenuPanel [data-action="to-standalone"]').click();
await settle(pj, 1000);
ok('подтверждение показано с названием узла', confirms.length === nConf + 1 && confirms[nConf].includes('Test-Convert'), confirms[nConf]);
const cvNode = await pj.evaluate((id) => CWJournal.nodes.get(id), cv);
ok('узел стал группой, остался под районом', cvNode.kind === 'group' && cvNode.parentId === seed.c);
ok('страница перерисована как у группы: карточка собрания скрыта', await pj.locator('#congIdentityCard').isHidden());
ok('вкладка «Записи» есть, заголовок — «Записи группы»', await pj.locator('[data-cong-tab="entries"]').isVisible() && (await pj.locator('#congEntriesTitle').textContent()).trim() === 'Записи группы');
await pj.locator('[data-cong-tab="entries"]').click(); await settle(pj, 600);
ok('заметка, созданная до преобразования, видна', (await pj.locator('#congEntriesPanel').textContent()).includes('Заметка до преобразования'));
await pj.locator('[data-cong-tab="visits"]').click(); await settle(pj, 600);
ok('посещение сохранилось', (await pj.evaluate((id) => CWJournal.visits.byNode(id), cv)).length === 1);
const menu7b = await pj.evaluate(() => { document.getElementById('moreBtn').click(); return [...document.querySelectorAll('#moreMenuPanel [data-action]')].map((b) => b.dataset.action); });
ok('после преобразования пункта «Преобразовать» нет', !menu7b.includes('to-standalone'), JSON.stringify(menu7b));
await pj.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/sg-converted.png' });

ok('в консоли нет ошибок', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
console.log(failed ? `\nПровалено: ${failed}` : '\nВсё прошло');
process.exit(failed ? 1 : 0);
