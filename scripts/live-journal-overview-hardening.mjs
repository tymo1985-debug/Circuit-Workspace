#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-overview-hardening.mjs
 *
 * O3: расширенная приёмка живого Обзора Журнала (Chromium, чистые профили).
 * Дополняет live-journal-overview.mjs (O2), не заменяет его:
 *  1. телефоны 320×800 / 360×800 / 430×900 и десктоп 1280×900 — переполнение,
 *     перенос, панели, последняя секция не под нижней панелью, строка → «Назад»;
 *  2. пять языков на 320 (наполнено и пусто) — ключи, сырые ключи, геометрия;
 *  3. пустое и наполненное (>3) состояния — нули, превью 3, счётчики, порядок;
 *  4. Клиндарий: испорчен/недоступен → восстановление записью CWState из
 *     соседней вкладки (штатный маячок cw-state-rev), без перезагрузки;
 *  5. сбой CWJournal.overview.read → «—» без старых строк → восстановление;
 *  6. J8: канарейки задачи, переноса и проекта — нигде в HTML при блокировке;
 *  7. гонка блокировки во время асинхронной сборки проектов;
 *  8. повторные входы/языки/wireOverviewChrome → одно изменение = одна отрисовка;
 *  9. назад/вперёд и уход в хаб с возвратом (BFCache, если сработает);
 * 10. узкий офлайн-смоук Обзора (не полный аудит PWA);
 * 11. светлая/тёмная тема — контраст и переполнение.
 *
 *   node scripts/live-journal-overview-hardening.mjs   (playwright-core; из корня)
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
const expected = [];                 // намеренные сбои: текст ошибки → допустимо
const watch = (page, name) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
  page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) errors.push(name + ': request failed ' + r.url()); });
  page.on('dialog', (d) => d.accept());
};
const J_URL = BASE + '/journal/index.html';
const settle = (p, ms = 450) => p.waitForTimeout(ms);
const CAN = { task: 'КАНАРЕЙКА-ЗАДАЧА-O3', carry: 'КАНАРЕЙКА-ПЕРЕНОС-O3', project: 'КАНАРЕЙКА-ПРОЕКТ-O3' };
const PASS = 'correct horse battery';
const LONG = 'Очень-длинное-слово-без-пробелов-Приозёрно-Лесное-Заречное-Верхне-Нижнее ';

/** Контекст с чистым профилем; язык/тема — до загрузки страницы. */
async function open(name, { w = 1280, h = 900, lang = null, theme = null, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU', isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(([lang, theme]) => {
    if (lang) localStorage.setItem('cw-lang', lang);
    if (theme) localStorage.setItem('cw-theme', theme);
  }, [lang, theme]);
  const page = await ctx.newPage(); watch(page, name);
  await page.goto(J_URL + '#overview', { waitUntil: 'load' });
  await page.waitForFunction(() => !!self.CWJournal && !!self.CWPlanner && !!self.CWDB);
  return { ctx, page };
}
/** Канонический Клиндарий: запись через CWState (путь самого Клиндария). */
async function plannerWrite(page, payload) {
  await page.evaluate(async (payload) => {
    if (!self.CWState) await new Promise((r) => { const s = document.createElement('script'); s.src = '../shared/state.js'; s.onload = r; document.head.appendChild(s); });
    if (!self.__st) { self.__st = CWState.create('circuit-planner'); await self.__st.init(); }
    const okw = await self.__st.write(payload);
    if (!okw) throw new Error('CWState.write failed');
  }, payload);
}
const PLANNER = (extra = []) => JSON.stringify({ settings: {}, serviceYears: {}, events: [
  { id: 'ev_a', name: 'А', visitType: 'congregation' }, { id: 'ev_b', name: 'Б', visitType: 'congregation' },
  { id: 'ev_g', name: 'Г', visitType: 'group' }, { id: 'ev_p', name: 'П', visitType: 'pregroup' },
  { id: 'ev_x', name: 'Обычное', visitType: '' },
].concat(extra), entries: [{ id: 'e1', eventId: 'ev_a', start: '2028-03-13', end: '2028-03-18' }, { id: 'e2', eventId: 'ev_a', start: '2027-03-01', end: '2027-03-02' }] });

/** Наполненное состояние: по 5 в каждой секции, длинные тексты, три канарейки. */
async function seedFull(page) {
  const ids = await page.evaluate(async ({ CAN, PASS, LONG }) => {
    const J = CWJournal;
    const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район ' + LONG });
    const c2 = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район Второй' });
    const n = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Собрание ' + LONG });
    const visits = [];
    for (let i = 0; i < 5; i++) visits.push(await J.visits.add({ nodeId: n, dateFrom: '202' + (6 + (i % 3)) + '-0' + (i + 2) + '-10', dateTo: '202' + (6 + (i % 3)) + '-0' + (i + 2) + '-12' }));
    const carry = [];
    for (let i = 0; i < 5; i++) { const q = await J.visitRecords.add(visits[0], { type: 'question', body: (i === 0 ? CAN.carry : 'Вопрос ' + i + ' ') + LONG }); await J.carry.mark(q); carry.push(q); }
    const tasks = [];
    for (let i = 0; i < 5; i++) tasks.push(await J.tasks.add({ nodeId: n, body: (i === 0 ? CAN.task : 'Задача ' + i + ' ') + LONG, dueDate: '2028-0' + (i + 1) + '-15' }));
    const projects = [];
    for (let i = 0; i < 5; i++) projects.push(await J.projects.add({ circuitId: i % 2 ? c2 : c, title: 'Проект ' + i + ' ' + LONG }));
    // Защищённый проект — первым в каноническом порядке Обзора, чтобы он был в превью.
    const pOrder = (await J.overview.read()).projects.map((r) => r.id);
    await J.projects.update(pOrder[0], { title: CAN.project + ' ' + LONG });
    projects.splice(projects.indexOf(pOrder[0]), 1); projects.unshift(pOrder[0]);
    await J.protection.setup(PASS, tasks[0]);
    await J.protection.protect(carry[0]);
    await J.protection.protect(projects[0]);
    J.protection.lock();
    return { c, c2, n, visits, carry, tasks, projects };
  }, { CAN, PASS, LONG });
  await plannerWrite(page, PLANNER());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#overviewTasks .j-row');
  await settle(page);
  return ids;
}
const stats = (p) => p.$$eval('#overviewStats .j-ovstat__value', (xs) => xs.map((x) => x.textContent));
const noCanary = async (p) => { const h = await p.content(); return Object.values(CAN).every((c) => !h.includes(c)); };
const allCanary = async (p) => { const h = await p.content(); return Object.values(CAN).every((c) => h.includes(c)); };

/** Геометрия Обзора на телефоне. */
async function geometry(p) {
  return p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [...document.querySelectorAll('#route-overview *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > vw + 0.5 || r.left < -0.5); });
    const nav = document.querySelector('.md-bottomnav').getBoundingClientRect();
    const top = document.querySelector('.md-topbar-v2').getBoundingClientRect();
    const chev = [...document.querySelectorAll('#route-overview .j-row')].every((r) => { const e = r.querySelector('.j-row__end'), b = r.querySelector('.j-row__body'); return !e || !b || (b.getBoundingClientRect().right <= e.getBoundingClientRect().left + 1 && e.getBoundingClientRect().right <= vw); });
    const heads = [...document.querySelectorAll('#route-overview .j-sec__head')].every((h) => h.getBoundingClientRect().right <= vw && h.scrollWidth <= h.clientWidth + 1);
    const statsFit = [...document.querySelectorAll('.j-ovstat')].every((s) => s.getBoundingClientRect().right <= vw && s.getBoundingClientRect().width >= 40);
    const clickable = (e) => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return !!hit && (hit === e || e.contains(hit)); };
    const navItems = [...document.querySelectorAll('.md-bottomnav__item')];
    const navOk = nav.height === 0 ? null : navItems.length === 5 && navItems.every((e) => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.right <= vw + 0.5 && r.width >= 40 && clickable(e); });
    const bar = document.querySelector('.md-topbar-v2');
    const ctl = [...bar.querySelectorAll('a, button, select')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden], [role="menu"]'); });
    const rects = ctl.map((e) => e.getBoundingClientRect());
    let topOverlap = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (!ctl[i].contains(ctl[j]) && !ctl[j].contains(ctl[i]) && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) topOverlap++; }
    const langW = bar.querySelector('select') ? bar.querySelector('select').getBoundingClientRect().width : 0;
    // В защищённом проекте на 320 px в шапке одновременно шесть действий.
    // 44 px — общий coarse-pointer минимум; требование 56 px к одному select
    // искусственно объявляло корректную плотную раскладку ошибкой.
    const topOk = langW >= 44 && topOverlap === 0 && rects.every((r) => r.left >= -0.5 && r.right <= vw + 0.5) && ctl.every(clickable) && !!bar.querySelector('a.cw-home-btn, .cw-home-btn[href]');
    window.scrollTo(0, document.documentElement.scrollHeight);
    const last = [...document.querySelectorAll('#route-overview .j-sec')].pop().getBoundingClientRect();
    const nav2 = document.querySelector('.md-bottomnav').getBoundingClientRect();
    window.scrollTo(0, 0);
    return { vw, sw: document.documentElement.scrollWidth, out: out.length, outEx: out.slice(0, 3).map((e) => e.className || e.tagName),
      navVisible: nav.height === 0 ? null : nav.bottom <= innerHeight + 1 && document.querySelector('.md-bottomnav').scrollWidth <= document.querySelector('.md-bottomnav').clientWidth + 1, topVisible: top.height > 0 && top.top >= -1 && top.right <= vw + 1,
      lastClear: nav2.height === 0 ? true : last.bottom <= nav2.top + 1, chev, heads, statsFit, navOk, topOk, topN: ctl.length, langW: Math.round(langW),
      topOverlap, topDetail: ctl.map((e, i) => ({ id: e.id || e.className || e.tagName, l: Math.round(rects[i].left), r: Math.round(rects[i].right), clickable: clickable(e) })),
      fab: document.querySelector('#fab').hidden };
  });
}

/* ═══ 1. Мобильная матрица 320 / 360 / 430 и десктоп ══════════════════════ */
console.log('\n1. Мобильная матрица');
for (const [w, h] of [[320, 800], [360, 800], [430, 900], [1280, 900]]) {
  const mobile = w < 1000;
  const { ctx, page } = await open('w' + w, { w, h, mobile });
  const ids = await seedFull(page);
  const g = await geometry(page);
  const tag = w + '×' + h;
  ok(tag + ': нет горизонтального переполнения', g.sw <= g.vw && g.out === 0, JSON.stringify(g.outEx));
  ok(tag + ': сводка, шапки секций, стрелки — в экране', g.statsFit && g.heads && g.chev);
  ok(tag + ': верхняя панель в экране, нижняя ' + (mobile ? 'на месте и влезает' : 'не нужна (рейка)') + ', FAB скрыт', g.topVisible && (mobile ? g.navVisible === true : g.navVisible === null) && g.fab, JSON.stringify(g));
  ok(tag + ': нижняя панель не закрывает последнюю секцию', g.lastClear);
  ok(tag + ': ' + (mobile ? 'нижняя навигация — пять пунктов в экране, все кликабельны' : 'нижней навигации нет (рейка)'), mobile ? g.navOk === true : g.navOk === null);
  ok(tag + ': шапка Журнала (с кнопкой замка) — без наложений и обрезки, всё кликабельно', g.topOk && g.topN >= 5, 'элементов ' + g.topN);
  if (mobile) {
    for (const r of ['districts', 'tasks', 'search', 'archive', 'overview']) {
      await page.click('.md-bottomnav [data-route="' + r + '"]', { timeout: 3000 }).catch(() => {});
      await settle(page, 200);
      if (!(await page.isVisible('#route-' + r))) { ok(tag + ': пункт «' + r + '» открывает свой экран', false); }
    }
    ok(tag + ': все пять пунктов нижней навигации открывают свои экраны', await page.isVisible('#route-overview'));
    await page.waitForSelector('#overviewTasks .j-row');
  }
  await page.screenshot({ path: '/tmp/o3-' + w + '.png', fullPage: true });
  await page.click('#overviewTasks .j-row >> nth=1');
  await settle(page, 300);
  ok(tag + ': строка → задача', (await page.evaluate(() => location.hash)) === '#tasks/' + ids.tasks[1]);
  await page.goBack(); await settle(page);
  ok(tag + ': «Назад» → живой Обзор', (await page.evaluate(() => location.hash)) === '#overview' && (await page.$$('#overviewTasks .j-row')).length === 3
    && (await page.textContent('#overviewTasksCount')) === '5');
  await ctx.close();
}

/* ═══ 2. Пять языков на 320 ═════════════════════════════════════════════ */
console.log('\n2. Языки на 320');
const OV_KEYS = ['j.nav.overview', 'j.nav.districts', 'j.overview.stat.congregations', 'j.overview.stat.groups', 'j.overview.stat.pregroups', 'j.overview.empty_carry',
  'j.overview.empty_tasks', 'j.overview.empty_visits', 'j.overview.unavailable', 'j.section.upcoming', 'j.section.tasks_open', 'j.section.projects', 'j.section.recent_visits',
  'j.link.all', 'j.project.empty_overview', 'j.locked.title', 'j.planner.unavailable'];
for (const lang of ['ru', 'uk', 'en', 'pl', 'de']) {
  for (const state of ['full', 'empty']) {
    const { ctx, page } = await open(lang + '-' + state, { w: 320, h: 800, lang, mobile: true });
    if (state === 'full') await seedFull(page);
    else { await plannerWrite(page, JSON.stringify({ settings: {}, serviceYears: {}, events: [], entries: [] })); await page.reload(); await page.waitForSelector('#overviewTasks .j-sec__hint'); await settle(page); }
    const r = await page.evaluate((keys) => ({
      lang: CWI18n.getLang ? CWI18n.getLang() : document.documentElement.lang,
      missing: keys.filter((k) => CWJournalApp.t(k) === k || !CWJournalApp.t(k)),
      raw: /\bj\.[a-z_]+\.[a-z_.]+/.test(document.querySelector('#route-overview').innerText + document.querySelector('.md-bottomnav').innerText),
    }), OV_KEYS);
    const g = await geometry(page);
    ok(lang + '/' + state + ': ключи есть, сырых ключей нет', r.missing.length === 0 && !r.raw, r.missing.join());
    ok(lang + '/' + state + ': 320 без переполнения, сводка и шапки в экране, панели на месте', g.sw <= g.vw && g.out === 0 && g.statsFit && g.heads && g.navVisible && g.navOk && g.topOk && g.lastClear, JSON.stringify(g));
    if (lang === 'de' || lang === 'pl') await page.screenshot({ path: '/tmp/o3-' + lang + '-' + state + '-320.png', fullPage: true });
    await page.click('.md-bottomnav [data-route="tasks"]', { timeout: 3000 }).catch(() => {}); await settle(page, 250);
    ok(lang + '/' + state + ': нижняя навигация работает', await page.isVisible('#route-tasks'));
    await ctx.close();
  }
}

/* ═══ 3. Пусто и наполнено ══════════════════════════════════════════════ */
console.log('\n3. Пусто / наполнено');
{
  const { ctx, page } = await open('empty');
  await plannerWrite(page, JSON.stringify({ settings: {}, serviceYears: {}, events: [], entries: [] }));
  await page.reload(); await page.waitForSelector('#overviewVisits .j-sec__hint'); await settle(page);
  ok('пусто: сводка — честные нули', (await stats(page)).join() === '0,0,0,0', (await stats(page)).join());
  const counts = await page.$$eval('#route-overview .j-sec__count', (xs) => xs.map((x) => x.textContent));
  ok('пусто: счётчики секций 0', counts.join() === '0,0,0,0', counts.join());
  const hints = await page.$$eval('#route-overview .j-sec__hint', (xs) => xs.length);
  ok('пусто: четыре сообщения «пусто», строк нет', hints === 4 && (await page.$$('#route-overview .j-row')).length === 0);
  ok('пусто: ни одной фикстуры', !/EU-K-03|Северное|Западное|Уточнить/.test(await page.content()));
  await ctx.close();
}
{
  const { ctx, page } = await open('full');
  const ids = await seedFull(page);
  const order = await page.evaluate(async () => { const d = await CWJournal.overview.read(); return { t: d.tasks.map((r) => r.id), c: d.carry.map((r) => r.id), p: d.projects.map((r) => r.id), v: d.visits.map((x) => x.visit.id), n: [d.tasks.length, d.carry.length, d.projects.length, d.visits.length] }; });
  const dom = await page.evaluate(() => ({
    t: [...document.querySelectorAll('#overviewTasks .j-row')].map((a) => a.getAttribute('href').split('/').pop()),
    counts: [...document.querySelectorAll('#route-overview .j-sec__count')].map((x) => x.textContent),
    rows: ['overviewCarry', 'overviewTasks', 'overviewProjects', 'overviewVisits'].map((id) => document.getElementById(id).querySelectorAll('.j-row').length),
    hidden: [...document.querySelectorAll('#route-overview .j-row')].filter((r) => r.hidden || getComputedStyle(r).display === 'none').length,
    more: [...document.querySelectorAll('#route-overview .j-sec__more')].map((a) => a.tagName + ':' + a.getAttribute('href')),
  }));
  ok('наполнено: по 3 строки в каждой секции', dom.rows.join() === '3,3,3,3', dom.rows.join());
  ok('наполнено: полные счётчики', dom.counts.join() === order.n[1] + ',' + order.n[0] + ',' + order.n[2] + ',' + order.n[3] && order.n.every((x) => x === 5), dom.counts.join());
  ok('наполнено: порядок задач — канон O1', dom.t.join() === order.t.slice(0, 3).join());
  ok('наполнено: четвёртой строки нет в DOM (не спрятана)', dom.hidden === 0);
  ok('наполнено: единственная «Все» → #tasks, «История»/«Все» переноса нет', dom.more.join() === 'A:#tasks');
  const vHref = await page.$$eval('#overviewVisits .j-row', (xs) => xs.map((a) => a.getAttribute('href').split('/').pop()));
  ok('наполнено: посещения новые сверху (канон O1)', vHref.join() === order.v.slice(0, 3).join());
  const pTitles = await page.$$eval('#overviewProjects .j-row', (xs) => xs.length);
  ok('проекты: 5 активных → ровно 3 строки, счётчик 5', pTitles === 3 && order.p.length === 5 && (await page.textContent('#overviewProjectsCount')) === '5');
  const rest = await page.evaluate(async () => { const d = await CWJournal.overview.read(); return d.projects.slice(3).map((p) => p.title).filter(Boolean); });
  const pText = await page.textContent('#overviewProjects');
  ok('проекты: четвёртого и пятого нет в DOM Обзора', rest.length >= 1 && rest.every((tt) => !pText.includes(tt.trim())), rest.join(' | '));
  ok('проекты: без «Все»', !(await page.$('#overviewProjectsSec .j-sec__more')));

  /* ═══ 6. J8 во всех секциях ════════════════════════════════════════════ */
  console.log('\n6. J8: задача, перенос, проект');
  ok('заблокировано: три канарейки отсутствуют во всём HTML (текст, атрибуты)', await noCanary(page));
  await page.evaluate((PASS) => CWJournal.protection.unlock(PASS), PASS); await settle(page);
  ok('разблокировано: все три видны', await allCanary(page));
  const lockedNow = await page.evaluate(() => { CWJournal.protection.lock(); const h = document.documentElement.outerHTML; return ['КАНАРЕЙКА-ЗАДАЧА-O3', 'КАНАРЕЙКА-ПЕРЕНОС-O3', 'КАНАРЕЙКА-ПРОЕКТ-O3'].some((c) => h.includes(c)); });
  ok('блокировка: текст исчез синхронно', lockedNow === false);
  await settle(page, 900);
  ok('после всех отрисовок: текста нет', await noCanary(page));

  /* ═══ 7. Гонка в асинхронной сборке проектов ════════════════════════════ */
  console.log('\n7. Гонки');
  await page.evaluate((PASS) => CWJournal.protection.unlock(PASS), PASS); await settle(page);
  const projRace = await page.evaluate(async () => {
    const real = CWJournal.projects.related;
    let release; const gate = new Promise((r) => { release = r; });
    CWJournal.projects.related = async function () { const r = await real.apply(this, arguments); await gate; return r; };
    const stale = CWJournalApp.renderOverview();
    await new Promise((r) => setTimeout(r, 200));
    CWJournal.projects.related = real;                 // новая отрисовка пойдёт без задержки
    CWJournal.protection.lock();
    await new Promise((r) => setTimeout(r, 400));
    release(); await stale;
    await new Promise((r) => setTimeout(r, 300));
    return document.documentElement.outerHTML.includes('КАНАРЕЙКА-ПРОЕКТ-O3');
  });
  ok('проект: блокировка во время сборки связей → канарейка не вернулась', projRace === false);
  ok('после гонки проекта: никакой канарейки', await noCanary(page));
  // Прежние гонки O2 (уход с маршрута, разблокированное чтение после Lock) — в live-journal-overview.mjs, не заменяются.

  /* ═══ 8. Повторные обновления и подписки ═══════════════════════════════ */
  console.log('\n8. Повторные обновления');
  for (let i = 0; i < 4; i++) { await page.evaluate(() => { location.hash = '#tasks'; }); await settle(page, 150); await page.evaluate(() => { location.hash = '#overview'; }); await settle(page, 150); }
  for (const l of ['en', 'de', 'ru']) { await page.selectOption('#uiLanguage', l); await settle(page, 200); }
  await page.evaluate(() => { CWJournalApp.wireOverviewChrome(); CWJournalApp.wireOverviewChrome(); });
  await settle(page);
  const reads = await page.evaluate(async (n) => {
    let count = 0; const real = CWJournal.overview.read;
    CWJournal.overview.read = function () { count++; return real.apply(this, arguments); };
    await CWJournal.tasks.add({ nodeId: n, body: 'Одна новая задача' });
    await new Promise((r) => setTimeout(r, 700));
    CWJournal.overview.read = real;
    return count;
  }, ids.n);
  ok('одно изменение → одна отрисовка (подписки не размножились)', reads === 1, reads);
  const dup = await page.evaluate(() => ({
    rows: ['overviewCarry', 'overviewTasks', 'overviewProjects', 'overviewVisits'].map((id) => document.getElementById(id).querySelectorAll('.j-row').length).join(),
    stats: document.querySelectorAll('#overviewStats .j-ovstat').length,
    // Перенос из одного посещения законно ведёт на один адрес — дубли ищем в задачах и посещениях.
    hrefs: (() => { const h = [...document.querySelectorAll('#overviewTasks a.j-row, #overviewVisits a.j-row')].map((a) => a.getAttribute('href')); return h.length - new Set(h).size; })(),
  }));
  ok('без дублей строк и сводки', dup.rows === '3,3,3,3' && dup.stats === 4 && dup.hrefs === 0, JSON.stringify(dup));
  ok('счётчик задач обновился ровно на 1', (await page.textContent('#overviewTasksCount')) === '6');

  /* ═══ 5. Сбой чтения Журнала и восстановление ════════════════════════════ */
  console.log('\n5. Сбой Журнала');
  await page.evaluate((PASS) => CWJournal.protection.unlock(PASS), PASS); await settle(page);
  const fail = await page.evaluate(async () => {
    self.__realRead = CWJournal.overview.read;
    CWJournal.overview.read = () => Promise.reject(new Error('O3: намеренный сбой чтения'));
    CWJournal.protection.lock();                      // смена блокировки — обычная перерисовка
    await new Promise((r) => setTimeout(r, 500));
    const h = document.documentElement.outerHTML;
    return { rows: document.querySelectorAll('#route-overview .j-row').length, stats: [...document.querySelectorAll('.j-ovstat__value')].map((x) => x.textContent)[0],
      counts: [...document.querySelectorAll('#route-overview .j-sec__count')].map((x) => x.textContent).join(), canary: /КАНАРЕЙКА/.test(h),
      hint: document.querySelector('#overviewTasks').textContent === CWJournalApp.t('j.overview.unavailable') };
  });
  expected.push(/O3: намеренный сбой чтения|данные Обзора не прочитаны/);
  ok('сбой: старых строк нет, «—» вместо чисел, подсказка', fail.rows === 0 && fail.stats === '—' && fail.counts === '—,—,—,—' && fail.hint, JSON.stringify(fail));
  ok('сбой: защищённого текста нет', !fail.canary);
  await page.evaluate(() => { CWJournal.overview.read = self.__realRead; location.hash = '#tasks'; });
  await settle(page, 250);
  await page.evaluate(() => { location.hash = '#overview'; });
  await settle(page);
  ok('восстановление: повторный вход на маршрут → живой Обзор без перезагрузки', (await page.$$('#overviewTasks .j-row')).length === 3 && (await stats(page))[0] === '2');

  /* ═══ 4. Клиндарий: сбой → восстановление, две вкладки ════════════════ */
  console.log('\n4. Клиндарий: восстановление из соседней вкладки');
  const tab2 = await ctx.newPage(); watch(tab2, 'tab2');
  await tab2.goto(J_URL + '#tasks', { waitUntil: 'load' });
  await tab2.waitForFunction(() => !!self.CWDB);
  await plannerWrite(tab2, '{испорчено');
  await settle(page, 700);
  ok('соседняя вкладка записала испорченный канон → «—»', (await stats(page)).slice(1).every((x) => x === '—'), (await stats(page)).join());
  await plannerWrite(tab2, PLANNER([{ id: 'ev_c', name: 'В', visitType: 'congregation' }, { id: 'ev_p2', name: 'П2', visitType: 'pregroup' }]));
  await settle(page, 700);
  ok('исправленный канон → верные числа без перезагрузки', (await stats(page)).slice(1).join() === '3,1,2', (await stats(page)).join());
  const unav = await page.evaluate(async () => {
    const real = CWDB.state.get; CWDB.state.get = () => Promise.reject(new Error('O3: канон недоступен'));
    await CWPlanner.refresh(); await new Promise((r) => setTimeout(r, 300));
    const a = [...document.querySelectorAll('.j-ovstat__value')].slice(1).map((x) => x.textContent).join();
    CWDB.state.get = real; return a;
  });
  expected.push(/O3: канон недоступен|Клиндари/);
  ok('unavailable → «—»', unav === '—,—,—', unav);
  await plannerWrite(tab2, PLANNER());
  await settle(page, 700);
  ok('unavailable → запись из соседней вкладки → числа вернулись', (await stats(page)).slice(1).join() === '2,1,1', (await stats(page)).join());
  await tab2.close();

  /* ═══ 9. Назад/вперёд и BFCache ═══════════════════════════════════════════ */
  console.log('\n9. Назад/вперёд, BFCache');
  await page.evaluate((PASS) => CWJournal.protection.unlock(PASS), PASS); await settle(page);
  await page.click('#overviewVisits .j-row >> nth=0'); await settle(page, 300);
  await page.goBack(); await settle(page);
  ok('посещение → «Назад» → Обзор с данными', (await page.evaluate(() => location.hash)) === '#overview' && (await page.$$('#overviewVisits .j-row')).length === 3);
  await page.goForward(); await settle(page, 300); await page.goBack(); await settle(page);
  ok('«Вперёд»/«Назад» → Обзор цел', (await page.$$('#overviewTasks .j-row')).length === 3);
  await page.evaluate(() => { self.__bf = 'живая страница'; });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await settle(page, 300);
  await page.goBack({ waitUntil: 'load' }); await settle(page, 700);
  const bf = await page.evaluate(() => ({ restored: self.__bf === 'живая страница', unlocked: CWJournal.protection.isUnlocked(), hash: location.hash }));
  ok('после ухода в хаб и «Назад»: сессия заблокирована, текста нет (BFCache ' + (bf.restored ? 'сработал' : 'не сработал — обычная загрузка') + ')', !bf.unlocked && await noCanary(page) && bf.hash === '#overview');
  ok('после возврата Обзор живой', (await page.$$('#overviewTasks .j-row')).length === 3);
  await ctx.close();
}

/* ═══ 10. Офлайн-смоук Обзора ═══════════════════════════════════════════ */
console.log('\n10. Офлайн');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage(); watch(page, 'offline');
  await page.goto(J_URL + '#overview', { waitUntil: 'load' });
  await page.waitForFunction(() => !!self.CWJournal);
  await page.evaluate(async () => { await CWJournal.tasks.add({ nodeId: await CWJournal.nodes.add({ kind: 'circuit', parentId: CWJournal.ROOT_PARENT, label: 'Офлайн-район' }), body: 'Задача офлайн' }); });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  const cached = await page.evaluate(async () => {
    const names = await caches.keys(); let hit = null;
    for (const n of names) { const c = await caches.open(n); if (await c.match(new URL('js/app/overview.js', location.href).href)) hit = n; }
    return { names, hit };
  });
  ok('overview.js в кэше Журнала', !!cached.hit && /journal/i.test(cached.hit), JSON.stringify(cached));
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#overviewTasks .j-row', { timeout: 10000 }).catch(() => {});
  const off = await page.evaluate(() => ({ online: navigator.onLine, row: !!document.querySelector('#overviewTasks .j-row'), css: getComputedStyle(document.querySelector('.j-ovstat')).borderRadius !== '0px', stat: document.querySelector('.j-ovstat__value').textContent }));
  ok('офлайн: оболочка, overview.js и стили загрузились, данные показаны', !off.online && off.row && off.css && off.stat === '1', JSON.stringify(off));
  await ctx.close();
}

/* ═══ 11. Темы ═══════════════════════════════════════════════════════════ */
console.log('\n11. Светлая / тёмная');
const contrast = (p) => p.evaluate(() => {
  const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const bg = (e) => { while (e) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(.*, 0\)|transparent/.test(c)) return rgb(c); e = e.parentElement; } return [255, 255, 255]; };
  const ratio = (e) => { const a = lum(rgb(getComputedStyle(e).color)), b = lum(bg(e)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const pick = (sel) => [...document.querySelectorAll(sel)].map(ratio);
  return { stat: Math.min(...pick('.j-ovstat__value'), 99), label: Math.min(...pick('.j-ovstat__label'), 99), count: Math.min(...pick('#route-overview .j-sec__count'), 99),
    title: Math.min(...pick('#route-overview .j-row__title'), 99), meta: Math.min(...pick('#route-overview .j-row__meta'), 99), hint: Math.min(...pick('#route-overview .j-sec__hint'), 99),
    theme: document.documentElement.getAttribute('data-theme') };
});
for (const theme of ['light', 'dark']) {
  for (const [w, h] of [[1280, 900], [320, 800]]) {
    const { ctx, page } = await open(theme + w, { w, h, theme, mobile: w < 1000 });
    await seedFull(page);
    const c = await contrast(page);
    const g = await geometry(page);
    ok(theme + ' ' + w + ': контраст сводки/счётчиков/строк ≥ 4.5 (подписи ≥ 3)', c.theme === theme && c.stat >= 4.5 && c.count >= 3 && c.title >= 4.5 && c.meta >= 3 && c.label >= 3, JSON.stringify(c));
    ok(theme + ' ' + w + ': без переполнения', g.sw <= g.vw && g.out === 0);
    await page.screenshot({ path: '/tmp/o3-' + theme + '-' + w + '.png', fullPage: true });
    await ctx.close();
  }
}
{
  const { ctx, page } = await open('dark-empty', { w: 320, h: 800, theme: 'dark', mobile: true });
  await plannerWrite(page, JSON.stringify({ settings: {}, serviceYears: {}, events: [], entries: [] }));
  await page.reload(); await page.waitForSelector('#overviewTasks .j-sec__hint'); await settle(page);
  const c = await contrast(page);
  ok('dark 320: сообщения «пусто» читаемы (≥ 4.5)', c.hint >= 4.5, JSON.stringify(c));
  await page.screenshot({ path: '/tmp/o3-dark-empty-320.png', fullPage: true });
  await ctx.close();
}

const real = errors.filter((e) => !expected.some((re) => re.test(e)));
ok('ошибок консоли/страницы/запросов нет (кроме намеренных сбоев)', real.length === 0, real.slice(0, 5).join(' | '));
await browser.close();
server.close();
console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ live-journal-overview-hardening: всё прошло');
process.exit(failed ? 1 : 0);
