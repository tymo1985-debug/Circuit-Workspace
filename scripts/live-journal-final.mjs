#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-final.mjs
 *
 * Регрессия J-Final (аудит 06, 07.10.2026) в Chromium. НЕ ВХОДИТ В ГЕЙТ;
 * запускается через `npm run test:journal`.
 *
 *  1. J8 на всех экранах (JF-1): обход Обзора, «Задач», всех вкладок района
 *     и собрания, «Состава», посещения, проекта с историей, окна выбора
 *     связей — при открытой сессии; затем lock и поиск канарейки во всём
 *     outerHTML, в значениях полей и при повторном обходе. 430 и 1280.
 *  2. Импорт в двух вкладках в одну миллисекунду (JF-2): без дублей.
 *  3. Слой данных держит communityId (JF-3).
 *  4. Активная вкладка на 320 видна целиком (JF-4).
 *
 * Каждый прогон — новый origin (случайный порт) и чистый профиль.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
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
const J_URL = BASE + '/journal/index.html';
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
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))));
};
const errors = [];
const watch = (p, tag) => {
  p.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ': ' + m.text()); });
  p.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + String(e)));
  p.on('dialog', (d) => d.accept());
};
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* ═══ 1. J8 на всех экранах ════════════════════════════════════════════ */
const CANARY = 'JFINAL' + Math.random().toString(36).slice(2, 10) + 'Ж';
for (const width of [430, 1280]) {
  console.log('\n1. J8: все экраны, ширина ' + width);
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage(); watch(page, 'j8-' + width);
  const ev = (f, a) => page.evaluate(f, a);
  await page.goto(J_URL + '#overview', { waitUntil: 'load' });
  await page.waitForFunction(() => !!self.CWJournal && !!self.CWJournalCrypto);
  const ids = await ev(async ({ C, P }) => {
    const J = CWJournal;
    const d = (o) => { const n = new Date(Date.now() + o * 864e5); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
    const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'JF-C' });
    const cong = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'JF-Cong' });
    await J.nodes.add({ kind: 'group', parentId: cong, label: 'JF-Grp' });
    const vNext = await J.visits.add({ nodeId: cong, dateFrom: d(5), dateTo: d(7) });
    const vPast = await J.visits.add({ nodeId: cong, dateFrom: d(-30), dateTo: d(-28) });
    const rec = await J.visitRecords.add(vNext, { type: 'note', body: 'ВЗ ' + C });
    const carry = await J.visitRecords.add(vPast, { type: 'todo', body: 'Перенос ' + C });
    await J.carry.mark(carry);
    const dn = await J.districtNotes.add(c, { type: 'note', body: 'Район ' + C });
    const cn = await J.congregationNotes.add(cong, { type: 'question', body: 'Собрание ' + C });
    const ctask = await J.tasks.add({ nodeId: cong, body: 'Задача собрания ' + C });
    const dtask = await J.tasks.add({ nodeId: c, body: 'Задача района ' + C });
    const proj = await J.projects.add({ circuitId: c, title: 'Проект ' + C, body: 'Описание ' + C });
    const ptask = await J.projects.addTask(proj, { body: 'Задача проекта ' + C });
    const aproj = await J.projects.add({ circuitId: c, title: 'Архивный ' + C });
    await J.protection.setup(P, dn);
    for (const id of [cn, ctask, dtask, proj, ptask, aproj, rec, carry]) await J.protection.protect(id);
    await J.projects.archive(aproj);
    const R = CWJournalRoute.build;
    return {
      project: R.project(c, proj),
      tour: ['#overview', '#tasks', '#roster', '#roster/groups', R.circuit(c), R.circuitTab(c, 'congregations'), R.circuitTab(c, 'entries'),
        R.circuitTab(c, 'tasks'), R.circuitTab(c, 'archive'), R.congregation(c, cong), R.visits(c, cong), R.congEntries(c, cong),
        R.congTasks(c, cong), R.congArchive(c, cong), R.visit(c, cong, vNext), R.project(c, proj), '#search', '#archive'],
    };
  }, { C: CANARY, P: 'фраза J-Final 2026' });
  const seen = [];
  for (const h of ids.tour) {
    await ev((x) => { location.hash = x; }, h);
    await page.waitForTimeout(450);
    if (await ev((c) => document.body.innerText.includes(c), CANARY)) seen.push(h);
  }
  ok('при открытой сессии текст виден на вкладках района и собрания', ['/tasks', '/entries'].every((t) => seen.filter((h) => h.endsWith(t)).length === 2), seen.join(' '));
  /* история проекта и окно выбора связей — затем уйти с экрана проекта */
  await ev((x) => { location.hash = x; }, ids.project); await page.waitForTimeout(500);
  ok('история проекта показывает задачу при открытой сессии', await ev((c) => document.getElementById('projectHistory').textContent.includes(c), CANARY));
  await page.click('#moreBtn'); await page.click('[data-action="link"]'); await page.waitForTimeout(700);
  ok('окно выбора связей показывает текст при открытой сессии', await ev((c) => document.getElementById('pickDialogList').textContent.includes(c), CANARY));
  await page.keyboard.press('Escape');
  await ev(() => { location.hash = '#search'; }); await page.waitForTimeout(400);
  await ev(() => CWJournal.protection.lock('live-final'));
  await page.waitForTimeout(400);
  const scan = await ev((c) => {
    const where = [];
    const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (w.currentNode.data.includes(c)) { let e = w.currentNode.parentElement; while (e && !e.id) e = e.parentElement; where.push(e ? e.id : '?'); }
    for (const e of document.querySelectorAll('*')) for (const a of e.attributes) if (a.value.includes(c)) where.push('attr:' + a.name);
    for (const f of document.querySelectorAll('input,textarea')) if (String(f.value).includes(c)) where.push('value:' + (f.id || f.name));
    if (document.title.includes(c)) where.push('title');
    return [...new Set(where)];
  }, CANARY);
  ok('lock: раскрытого текста нет нигде в документе (скрытые экраны, история, окно выбора)', scan.length === 0, scan.join(', '));
  const leaks = [];
  for (const h of ids.tour) {
    await ev((x) => { location.hash = x; }, h);
    await page.waitForTimeout(350);
    if (await ev((c) => document.documentElement.outerHTML.includes(c), CANARY)) leaks.push(h);
  }
  ok('заблокировано: повторный обход ни на одном экране не показывает текст', leaks.length === 0, leaks.join(' '));
  await ctx.close();
}

/* ═══ 2. Импорт в двух вкладках одновременно ═══════════════════════════ */
console.log('\n2. Импорт из Клиндария в двух вкладках в одну миллисекунду');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'ru-RU' });
  const mk = async (tag) => {
    const p = await ctx.newPage(); watch(p, tag);
    await p.goto(J_URL + '#overview', { waitUntil: 'load' });
    await p.waitForFunction(() => window.CWJournal && window.CWDirectory && window.CWPlanner);
    await p.waitForTimeout(500);
    return p;
  };
  const p1 = await mk('import-1');
  const EVENTS = [{ id: 'ev_b', name: 'Berlin', visitType: 'congregation' }, { id: 'ev_c', name: 'Bremen', visitType: 'congregation' }];
  await p1.evaluate(async (ev) => {
    await CWDirectory.init();
    for (const e of ev) await CWDirectory.upsert({ id: e.id, name: e.name }, 'circuit-planner');
    await CWJournal.nodes.add({ kind: 'circuit', parentId: CWJournal.ROOT_PARENT, label: 'Район' });
    await CWDB.state.put({ id: 'circuit-planner', savedAt: Date.now(), rev: 7, payload: JSON.stringify({ settings: {}, serviceYears: {}, events: ev, entries: [] }) });
    await CWPlanner.refresh();
  }, EVENTS);
  const p2 = await mk('import-2');
  for (const p of [p1, p2]) {
    await p.evaluate(() => { location.hash = '#roster'; }); await p.waitForTimeout(400);
    await p.locator('#rosterImportBtn').click(); await p.waitForSelector('#importDialog[open]'); await p.waitForTimeout(500);
  }
  ok('обе вкладки предлагают 2 собрания', /\(2\)/.test(await p1.locator('#importApply').textContent()) && /\(2\)/.test(await p2.locator('#importApply').textContent()));
  const at = Date.now() + 400;
  await Promise.all([p1, p2].map((p) => p.evaluate((t) => new Promise((r) => setTimeout(() => { document.getElementById('importApply').click(); r(); }, t - Date.now())), at)));
  await p1.waitForTimeout(2500);
  const congs = await p1.evaluate(async () => (await CWJournal.nodes.getAll()).filter((n) => n.kind === 'congregation').map((n) => n.communityId).sort());
  ok('после двух одновременных импортов — по одному узлу на карточку', JSON.stringify(congs) === JSON.stringify(['ev_b', 'ev_c']), congs);
  const reports = [await p1.locator('#importBody').textContent(), await p2.locator('#importBody').textContent()];
  ok('одна вкладка добавила 2, другая — 0, без «не удалось»', reports.some((x) => /2\D+0/.test(x)) && reports.some((x) => /0\D+0/.test(x)), reports);
  await ctx.close();
}

/* ═══ 3. Слой данных держит communityId ═════════════════════════════════ */
console.log('\n3. communityId в слое данных');
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage(); watch(p, 'data');
  await p.goto(J_URL + '#overview', { waitUntil: 'load' });
  await p.waitForFunction(() => !!self.CWJournal);
  const r = await p.evaluate(async () => {
    const J = CWJournal, out = {};
    const code = async (f) => { try { await f(); return 'ok'; } catch (e) { return e.message; } };
    const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'C' });
    const n = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'N', communityId: 'com_1' });
    const g1 = await J.nodes.add({ kind: 'group', parentId: n, label: 'G1', communityId: 'com_g' });
    out.groupDup = await code(() => J.nodes.add({ kind: 'group', parentId: n, label: 'G2', communityId: 'com_g' }));
    const p1 = await J.nodes.add({ kind: 'pregroup', parentId: n, label: 'P' });
    out.pregroupTaken = await code(() => J.nodes.update(p1, { communityId: 'com_g' }));
    out.circuit = await code(() => J.nodes.update(c, { communityId: 'com_x' }));
    out.circuitAdd = await code(() => J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'C2', communityId: 'com_y' }));
    out.empty = await code(() => J.nodes.update(p1, { communityId: '' }));
    out.number = await code(() => J.nodes.update(p1, { communityId: 42 }));
    out.groupSharesCong = await code(() => J.nodes.update(p1, { communityId: 'com_1' }));
    out.sameValue = await code(() => J.nodes.update(g1, { communityId: 'com_g', label: 'G1+' }));
    out.congShare = await code(() => J.nodes.add({ kind: 'congregation', parentId: c, label: 'N2', communityId: 'com_g' }));
    out.groups = (await J.nodes.getAll()).filter((x) => x.communityId === 'com_g' && (x.kind === 'group' || x.kind === 'pregroup')).length;
    return out;
  });
  ok('вторая группа на ту же карточку — отказ', r.groupDup === 'journal-node-community-taken', r.groupDup);
  ok('предгруппа на карточку группы — отказ', r.pregroupTaken === 'journal-node-community-taken', r.pregroupTaken);
  ok('у района связи нет (update и add)', r.circuit === 'journal-node-community-kind' && r.circuitAdd === 'journal-node-community-kind', [r.circuit, r.circuitAdd]);
  ok("'' снимает связь, не-строка — отказ", r.empty === 'ok' && r.number === 'journal-node-community-invalid', [r.empty, r.number]);
  ok('группа может делить карточку с собранием (R2)', r.groupSharesCong === 'ok' && r.congShare === 'ok', [r.groupSharesCong, r.congShare]);
  ok('тот же communityId в патче — не отказ', r.sameValue === 'ok', r.sameValue);
  ok('на карточке по-прежнему одна группа', r.groups === 1, r.groups);
  await ctx.close();
}

/* ═══ 4. Активная вкладка видна на 320 ════════════════════════════════ */
console.log('\n4. Вкладки на 320 px');
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('cw-lang', 'de'); } catch (e) { /* приватный режим */ } });
  const p = await ctx.newPage(); watch(p, 'tabs');
  await p.goto(J_URL + '#overview', { waitUntil: 'load' });
  await p.waitForFunction(() => !!self.CWJournal);
  const h = await p.evaluate(async () => {
    const J = CWJournal;
    const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'C' });
    const n = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'N' });
    const R = CWJournalRoute.build;
    return [R.circuitTab(c, 'archive'), R.congArchive(c, n), R.congTasks(c, n), '#roster/pregroups'];
  });
  for (const hash of h) {
    await p.evaluate((x) => { location.hash = x; }, hash);
    await p.waitForTimeout(500);
    const v = await p.evaluate(() => [...document.querySelectorAll('.j-tabs')].filter((e) => e.offsetParent).map((bar) => {
      const a = bar.querySelector('.active'); if (!a) return null;
      const br = bar.getBoundingClientRect(), r = a.getBoundingClientRect();
      return { label: a.textContent.trim(), inside: r.left >= br.left - 1 && r.right <= br.right + 1, pageX: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
    }).filter(Boolean));
    ok('активная вкладка целиком в поле зрения: ' + hash.replace(/^#districts\/[^/]+/, '#districts/…'), v.length > 0 && v.every((x) => x.inside && x.pageX), v);
  }
  await ctx.close();
}

ok('без console.error/pageerror', errors.length === 0, errors.slice(0, 6).join(' | '));
await browser.close();
server.close();
console.log(failed ? '\n✗ Провалов: ' + failed : '\n✓ live-journal-final: всё прошло');
process.exit(failed ? 1 : 0);
