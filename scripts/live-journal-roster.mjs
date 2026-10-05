#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-roster.mjs
 *
 * Живой прогон R1 (Chromium, чистый профиль): экран «Состав» на настоящих
 * данных Журнала — вкладки, счётчики, фильтр, номер из справочника, переход в
 * собрание; плашки Обзора ведут в «Состав»; 1280×900 и 430×900 (нижняя
 * навигация остаётся из пяти, без горизонтального переполнения).
 * Скриншоты — в SHOT_DIR (по умолчанию /tmp).
 *
 *   node scripts/live-journal-roster.mjs   (playwright-core; из корня репозитория)
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


const SHOT = process.env.SHOT_DIR || '/tmp';
const seed = async (page) => page.evaluate(async () => {
  const J = CWJournal;
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район Живой' });
  const a = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Duisburg-Ukrainisch' });
  const b = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Собрание с очень длинным названием для проверки переноса строки в списке' });
  await J.nodes.add({ kind: 'group', parentId: a, label: 'Group (Ukrainian) Hamburg-Russian-West' });
  await J.nodes.add({ kind: 'group', parentId: b, label: 'Группа Озеро' });
  await J.nodes.add({ kind: 'pregroup', parentId: a, label: 'Предгруппа Холм' });
  await CWDirectory.init();
  const rec = await CWDirectory.create({ name: 'Duisburg-Ukrainisch', congNumber: '36152' }, 'journal');
  await J.nodes.update(a, { communityId: rec.id });
  return { c, a };
});
const visibleRows = (p) => p.$$eval('#rosterList .j-row', (rs) => rs.filter((r) => r.getBoundingClientRect().height > 0).length);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/* ═══ A. Desktop 1280×900 ═══════════════════════════════════════════════ */
console.log('A. Desktop 1280×900');
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const pj = await ctx.newPage(); watch(pj, 'desktop');
await pj.goto(J_URL + '#overview', { waitUntil: 'load' });
await pj.waitForFunction(() => !!self.CWJournal && !!self.CWDB);
await seed(pj);
await pj.evaluate(() => { location.hash = '#roster'; });
await settle(pj);
ok('«Состав» открыт, виден', await pj.isVisible('#route-roster'));
ok('пункт «Состав» в боковой навигации активен', await pj.$eval('.md-sidenav [data-route="roster"]', (e) => e.classList.contains('active')));
ok('собрания: 2 строки, номер из справочника виден', (await visibleRows(pj)) === 2 && (await pj.textContent('#rosterList')).includes('36152'));
ok('счётчики вкладок 2 · 2 · 1', (await pj.$$eval('#rosterTabs .j-roster__n', (e) => e.map((x) => x.textContent).join(' · '))) === '2 · 2 · 1');
await pj.screenshot({ path: SHOT + '/roster-desktop.png' });
await pj.click('[data-roster-tab="groups"]'); await settle(pj, 250);
ok('вкладка «Группы» по клику', (await visibleRows(pj)) === 2 && (await pj.evaluate(() => location.hash)) === '#roster/groups');
await pj.fill('#rosterInput', 'hamburg'); await settle(pj, 200);
ok('фильтр: одна группа', (await visibleRows(pj)) === 1);
await pj.screenshot({ path: SHOT + '/roster-desktop-groups.png' });
await pj.fill('#rosterInput', '');
await pj.click('#rosterList a.j-row'); await settle(pj, 300);
ok('клик по строке → экран собрания', /^#districts\/[^/]+\/congregation\/[^/]+$/.test(await pj.evaluate(() => location.hash)) && await pj.isVisible('#congregationDetailView'));
await ctx.close();

/* ═══ B. Телефон 430×900 ════════════════════════════════════════════════ */
console.log('\nB. Телефон 430×900');
const mctx = await browser.newContext({ viewport: { width: 430, height: 900 }, isMobile: true, hasTouch: true, locale: 'ru-RU' });
const pm = await mctx.newPage(); watch(pm, 'mobile');
await pm.goto(J_URL + '#overview', { waitUntil: 'load' });
await pm.waitForFunction(() => !!self.CWJournal && !!self.CWDB);
await seed(pm);
await pm.reload({ waitUntil: 'load' }); await settle(pm, 700);
const plates = await pm.$$eval('#overviewStats .j-ovstat__value', (e) => e.map((x) => x.textContent).join());
ok('Обзор: плашки по Журналу 1 · 2 · 2 · 1', plates === '1,2,2,1', plates);
await pm.tap('#overviewStats a[href="#roster/groups"]'); await settle(pm, 400);
ok('тап по плашке «Группы» → «Состав», вкладка «Группы»', await pm.isVisible('#route-roster') && (await pm.evaluate(() => location.hash)) === '#roster/groups' && (await visibleRows(pm)) === 2);
ok('нет горизонтального переполнения', await overflow(pm));
ok('нижняя навигация: пять пунктов, влезает', await pm.$$eval('.md-bottomnav__item', (e) => e.length === 5 && e.every((x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5 && r.width >= 40; })));
ok('вкладки состава в экране', await pm.$eval('#rosterTabs', (t) => t.scrollWidth <= t.clientWidth + 1 || getComputedStyle(t).overflowX === 'auto'));
await pm.screenshot({ path: SHOT + '/roster-mobile.png' });
await pm.tap('[data-roster-tab="congregations"]'); await settle(pm, 300);
ok('длинное название переносится без переполнения', await overflow(pm) && (await visibleRows(pm)) === 2);
await mctx.close();

ok('ошибок консоли и страницы нет', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
console.log(failed ? '\n✗ Провалов: ' + failed : '\n✓ live-journal-roster: всё прошло');
process.exit(failed ? 1 : 0);
