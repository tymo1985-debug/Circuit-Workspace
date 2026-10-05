#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-import.mjs
 *
 * Живой прогон R1 (Chromium, чистый профиль): экран «Состав» на настоящих
 * данных Журнала — вкладки, счётчики, фильтр, номер из справочника, переход в
 * собрание; плашки Обзора ведут в «Состав»; 1280×900 и 430×900 (нижняя
 * навигация остаётся из пяти, без горизонтального переполнения).
 * Скриншоты — в SHOT_DIR (по умолчанию /tmp).
 *
 *   node scripts/live-journal-import.mjs   (playwright-core; из корня репозитория)
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

const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'ru-RU' });
const pj = await ctx.newPage(); watch(pj, 'r3');
pj.on('dialog', (d) => d.accept());
await pj.goto(J_URL); await pj.waitForFunction(() => window.CWJournal && window.CWDirectory && window.CWPlanner); await settle(pj, 800);

const EVENTS = [
  { id: 'ev_a', name: 'Hamburg-Russian', visitType: 'congregation' },
  { id: 'ev_b', name: 'Berlin-Russisch (12345)', visitType: 'congregation' },
  { id: 'ev_c', name: 'Bremen', visitType: 'congregation' },
  { id: 'ev_g', name: 'Group (Ukrainian) Hamburg-Russian-West', visitType: 'group' },
  { id: 'ev_h', name: 'Ohne Hinweis', visitType: 'pregroup' },
  { id: 'ev_plain', name: 'Обычное', visitType: '' },
];
const putPlanner = (events) => pj.evaluate(async (ev) => {
  await CWDB.state.put({ id: 'circuit-planner', savedAt: Date.now(), rev: Date.now() % 100000, payload: JSON.stringify({ settings: {}, serviceYears: {}, events: ev, entries: [] }) });
  await CWPlanner.refresh();
}, events);

const seed = await pj.evaluate(async (ev) => {
  const J = CWJournal;
  await CWDirectory.init();
  for (const e of ev) if (e.visitType) await CWDirectory.upsert({ id: e.id, name: e.name }, 'circuit-planner');
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район И' });
  const a = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Hamburg-Russian' });
  await CWDirectory.attach('ev_a', 'journal');
  await J.nodes.update(a, { communityId: 'ev_a' });
  return { c, a };
}, EVENTS);
await putPlanner(EVENTS);

const nodes = () => pj.evaluate(() => CWJournal.nodes.getAll());
const byCom = async (id) => (await nodes()).filter((n) => n.communityId === id)[0] || null;
const card = (id) => pj.evaluate((i) => CWDirectory.get(i), id);
const openImport = async () => {
  await pj.evaluate(() => { location.hash = '#roster'; });
  await settle(pj, 500);
  await pj.locator('#rosterImportBtn').click();
  await pj.waitForSelector('#importDialog[open]');
  await settle(pj, 500);
};
const closeImport = async () => { await pj.locator('#importCancel').click(); await settle(pj, 200); };
const rowsText = () => pj.$$eval('#importBody .j-import__row .j-row__title', (r) => r.map((x) => x.textContent));
const applyText = () => pj.locator('#importApply').textContent();

console.log('1. Предпросмотр: ничего не записано');
const before = (await nodes()).length;
await openImport();
const rows1 = await rowsText();
ok('новые собрания: Berlin-Russisch (12345) и Bremen', rows1.includes('Berlin-Russisch (12345)') && rows1.includes('Bremen'), JSON.stringify(rows1));
ok('группа и предгруппа в «требуют решения»', rows1.some((r) => r.startsWith('Group (Ukrainian)')) && rows1.includes('Ohne Hinweis'));
ok('«Обычное» (не объект) и уже существующее собрание не показаны', !rows1.includes('Обычное') && !rows1.includes('Hamburg-Russian'));
ok('показано «Уже в Журнале: 1»', (await pj.locator('#importBody').textContent()).includes('Уже в Журнале: 1'));
ok('для Berlin показана подсказка про номер', (await pj.locator('#importBody').textContent()).includes('номер, возможно, вшит'));
ok('есть подсказка родителя у группы', (await pj.locator('#importBody').textContent()).includes('Подсказка: Hamburg-Russian'));
ok('подсказка НЕ применена сама: выбор пуст', (await pj.$$eval('#importBody select', (s) => s.map((x) => x.value))).every((v) => v === ''));
ok('кнопка: 2 собрания (группа без родителя не считается)', (await applyText()).includes('(2)'), await applyText());
ok('в данные ничего не записано', (await nodes()).length === before);
ok('диалог укладывается в экран 430', await pj.evaluate(() => { const r = document.getElementById('importDialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; }));
await pj.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/r3-preview.png' });

console.log('2. Принять подсказку и применить');
await pj.locator('#importBody button', { hasText: 'Принять' }).first().click();
await settle(pj, 200);
ok('кнопка: 3 строки', (await applyText()).includes('(3)'), await applyText());
await pj.locator('#importApply').click();
await settle(pj, 1200);
ok('результат: добавлено 3, не удалось 0', (await pj.locator('#importBody').textContent()).includes('Добавлено: 3. Не удалось: 0.'));
const bremen = await byCom('ev_c'), berlin = await byCom('ev_b'), grp = await byCom('ev_g');
ok('собрания созданы в районе с communityId', bremen && berlin && bremen.parentId === seed.c && berlin.parentId === seed.c && bremen.kind === 'congregation');
ok('группа создана под выбранным собранием с названием календаря', grp && grp.kind === 'group' && grp.parentId === seed.a && grp.label === 'Group (Ukrainian) Hamburg-Russian-West');
ok('предгруппа без родителя не создана', !(await byCom('ev_h')));
const cb = await card('ev_b');
ok("карточки: источник 'journal' добавлен, 'circuit-planner' сохранён, имя не изменено",
  cb.sources.includes('journal') && cb.sources.includes('circuit-planner') && cb.name === 'Berlin-Russisch (12345)' && !cb.congNumber);
await closeImport();

console.log('3. Повторный прогон идемпотентен; предгруппа к собранию из этой же партии');
await putPlanner(EVENTS.concat([{ id: 'ev_d', name: 'Lübeck', visitType: 'congregation' }, { id: 'ev_q', name: 'Gruppe Lübeck-Süd', visitType: 'pregroup' }]));
await pj.evaluate(async () => { await CWDirectory.upsert({ id: 'ev_d', name: 'Lübeck' }, 'circuit-planner'); await CWDirectory.upsert({ id: 'ev_q', name: 'Gruppe Lübeck-Süd' }, 'circuit-planner'); });
const cnt = (await nodes()).length;
await openImport();
const rows3 = await rowsText();
ok('уже импортированное не предлагается', !rows3.includes('Bremen') && !rows3.includes('Berlin-Russisch (12345)') && rows3.includes('Lübeck') && rows3.includes('Gruppe Lübeck-Süd'), JSON.stringify(rows3));
const sel = pj.locator('#importBody .j-import__row', { hasText: 'Gruppe Lübeck-Süd' }).locator('select');
ok('в списке родителей есть «Lübeck +» (собрание партии)', (await sel.locator('option').allTextContents()).includes('Lübeck +'));
await sel.selectOption({ label: 'Lübeck +' });
await settle(pj, 200);
await pj.locator('#importApply').click();
await settle(pj, 1200);
const lub = await byCom('ev_d'), q = await byCom('ev_q');
ok('Lübeck и предгруппа под ним созданы', lub && q && q.parentId === lub.id && q.kind === 'pregroup');
ok('добавлено ровно 2 узла', (await nodes()).length === cnt + 2);
await closeImport();
await openImport();
ok('третий прогон: остаётся только предгруппа без родителя', (await rowsText()).join('|') === 'Ohne Hinweis', (await rowsText()).join('|'));
await closeImport();

console.log('4. Архивный узел считается «уже есть»; удалённое из календаря не удаляется');
await pj.evaluate((id) => CWJournal.nodes.archive(id), bremen.id);
await putPlanner(EVENTS.filter((e) => e.id !== 'ev_b'));
await openImport();
ok('архивный Bremen не предлагается повторно', !(await rowsText()).includes('Bremen'));
ok('узел Berlin остался, хотя из календаря пропал', !!(await byCom('ev_b')));
await closeImport();

console.log('5. Календарь не прочитан → импорт недоступен');
await pj.evaluate(async () => { await CWDB.state.put({ id: 'circuit-planner', savedAt: Date.now(), rev: 99999, payload: '{испорчено' }); await CWPlanner.refresh(); });
const cnt5 = (await nodes()).length;
await openImport();
ok('сообщение «не прочитан», кнопка применения скрыта', (await pj.locator('#importBody').textContent()).includes('Календарь не прочитан') && await pj.locator('#importApply').isHidden());
ok('данные не тронуты', (await nodes()).length === cnt5);
await closeImport();

ok('нет ошибок консоли', errors.filter((e) => !/испорчен|не прочитан|не собран/.test(e)).length === 0, errors.join(' | '));
await browser.close(); server.close();
console.log(failed ? '\n✗ Провалов: ' + failed : '\n✓ live-journal-import: всё прошло');
process.exit(failed ? 1 : 0);
