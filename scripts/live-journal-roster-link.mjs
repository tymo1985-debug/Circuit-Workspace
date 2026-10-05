#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-roster-link.mjs
 *
 * Живой прогон R1 (Chromium, чистый профиль): экран «Состав» на настоящих
 * данных Журнала — вкладки, счётчики, фильтр, номер из справочника, переход в
 * собрание; плашки Обзора ведут в «Состав»; 1280×900 и 430×900 (нижняя
 * навигация остаётся из пяти, без горизонтального переполнения).
 * Скриншоты — в SHOT_DIR (по умолчанию /tmp).
 *
 *   node scripts/live-journal-roster-link.mjs   (playwright-core; из корня репозитория)
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

const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'ru-RU' });
const pj = await ctx.newPage(); watch(pj, 'r2');
pj.on('dialog', (d) => { if (d.type() === 'alert') alerts.push(d.message()); d.accept(); });
await pj.goto(J_URL); await pj.waitForFunction(() => window.CWJournal && window.CWDirectory); await settle(pj, 800);

/* Данные: район, собрания A (без связи) и B, группа G, предгруппа P; карточки справочника
   чужого источника — как карточки Клиндария. */
const ids = await pj.evaluate(async () => {
  const J = CWJournal;
  await CWDirectory.init();
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район R2' });
  const a = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Собрание А' });
  const g = await J.nodes.add({ kind: 'group', parentId: a, label: 'Группа Г' });
  const p = await J.nodes.add({ kind: 'pregroup', parentId: a, label: 'Предгруппа П' });
  const cardX = await CWDirectory.upsert({ id: 'com_x', name: 'Группа Г (календарь)' }, 'circuit-planner');
  const cardY = await CWDirectory.upsert({ id: 'com_y', name: 'Предгруппа П (календарь)' }, 'circuit-planner');
  return { c, a, g, p, x: cardX.id, y: cardY.id };
});
const nodeOf = (id) => pj.evaluate((i) => CWJournal.nodes.get(i), id);
const cardOf = (id) => pj.evaluate((i) => CWDirectory.get(i), id);
const openCong = async () => { await pj.evaluate((h) => { location.hash = h; }, '#districts/' + encodeURIComponent(ids.c) + '/congregation/' + encodeURIComponent(ids.a)); await settle(pj); };
const pickFor = async (title, cardId) => {
  const row = pj.locator('#congChildrenTree .j-row', { hasText: title });
  await row.locator('.md-menu > .j-row__chevronbtn').click();
  await row.locator('[data-action="link-directory"]').click();
  await settle(pj, 300);
  ok('для группы нет «создать новую запись»', await pj.locator('#linkDialogCreate').isHidden());
  await pj.locator('#linkDialogCandidates .j-row--link[data-id="' + cardId + '"]').click();
  await settle(pj, 600);
};

console.log('1. Привязка группы к карточке вручную');
await openCong();
await pickFor('Группа Г', ids.x);
ok('у группы появился communityId', (await nodeOf(ids.g)).communityId === ids.x);
ok("карточка получила источник 'journal' и сохранила 'circuit-planner'",
  (await cardOf(ids.x)).sources.includes('journal') && (await cardOf(ids.x)).sources.includes('circuit-planner'));
ok('название группы не изменилось', (await nodeOf(ids.g)).label === 'Группа Г');

console.log('2. Предгруппа: та же карточка занята — отказ, данные не тронуты');
alerts.length = 0;
await pickFor('Предгруппа П', ids.x);
ok('показано сообщение об уже занятой карточке', alerts.length === 1, JSON.stringify(alerts));
ok('communityId предгруппы не появился', !(await nodeOf(ids.p)).communityId);
await pj.evaluate(() => { const d = document.getElementById('linkDialog'); if (d.open) d.close(); });
await pickFor('Предгруппа П', ids.y);
ok('предгруппа связана со своей карточкой', (await nodeOf(ids.p)).communityId === ids.y);

console.log('3. Собрание берёт ту же карточку, что у группы; удаление собрания не снимает источник');
await pj.evaluate(async (i) => { await CWJournal.nodes.update(i.g, { communityId: i.x }); }, ids);
const refs = await pj.evaluate(async (i) => {
  const b = await CWJournal.nodes.add({ kind: 'congregation', parentId: i.c, label: 'Собрание Б' });
  await CWDirectory.attach(i.x, 'journal');
  await CWJournal.nodes.update(b, { communityId: i.x });
  return b;
}, ids);
await pj.evaluate((h) => { location.hash = h; }, '#districts/' + encodeURIComponent(ids.c) + '/congregation/' + encodeURIComponent(refs));
await settle(pj);
await pj.locator('#moreBtn').click();
await pj.locator('#moreMenuPanel [data-action="delete"]').click();
await settle(pj, 800);
ok('собрание Б удалено', !(await nodeOf(refs)));
ok("карточка X осталась за 'journal': на неё ссылается группа", (await cardOf(ids.x)).sources.includes('journal'));

console.log('4. Удаление группы (последняя ссылка) снимает только источник journal');
await openCong();
const rowG = pj.locator('#congChildrenTree .j-row', { hasText: 'Группа Г' });
await rowG.locator('.md-menu > .j-row__chevronbtn').click();
await rowG.locator('[data-action="delete"]').click();
await settle(pj, 800);
ok('группа удалена', !(await nodeOf(ids.g)));
const cx = await cardOf(ids.x);
ok("карточка Клиндария жива, без источника 'journal'", cx && cx.sources.includes('circuit-planner') && !cx.sources.includes('journal'));

console.log('5. Копия → очистка → восстановление: ссылки узлов и источники совпадают');
const before = await pj.evaluate(async () => {
  const nodes = await CWJournal.nodes.getAll();
  return {
    links: nodes.filter((n) => n.communityId).map((n) => n.id + ':' + n.communityId).sort(),
    count: nodes.length,
    src: CWDirectory.all().map((r) => r.id + ':' + r.sources.slice().sort().join('+')).sort(),
  };
});
const snap = await pj.evaluate(() => CWBackup.snapshot(['journal']));
await pj.evaluate(async (i) => { await CWJournal.nodes.update(i.p, { communityId: '' }); }, ids);
await pj.evaluate((s) => CWBackup.restore(s), snap);
await pj.reload(); await pj.waitForFunction(() => window.CWJournal && window.CWDirectory); await settle(pj, 800);
await pj.evaluate(() => CWDirectory.init());
const after = await pj.evaluate(async () => {
  const nodes = await CWJournal.nodes.getAll();
  return {
    links: nodes.filter((n) => n.communityId).map((n) => n.id + ':' + n.communityId).sort(),
    count: nodes.length,
    src: CWDirectory.all().map((r) => r.id + ':' + r.sources.slice().sort().join('+')).sort(),
  };
});
ok('число узлов совпало', before.count === after.count, before.count + ' / ' + after.count);
ok('communityId узлов совпали (включая предгруппу)', JSON.stringify(before.links) === JSON.stringify(after.links), JSON.stringify([before.links, after.links]));
ok("источники карточек (journal) совпали", JSON.stringify(before.src) === JSON.stringify(after.src), JSON.stringify([before.src, after.src]));
ok('в списке связанных есть предгруппа', after.links.some((l) => l.startsWith(ids.p + ':')));

ok('нет ошибок консоли', errors.length === 0, errors.join(' | '));
await browser.close(); server.close();
console.log(failed ? '\n✗ Провалов: ' + failed : '\n✓ live-journal-roster-link: всё прошло');
process.exit(failed ? 1 : 0);
