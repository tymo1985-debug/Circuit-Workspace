#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-shell-topbar.mjs
 *
 * Смоук общей шапки .md-topbar-v2 (shared/style.css) во всех шести модулях на
 * 320/360/430 (Chromium, чистые профили): шапка без переполнения, элементы
 * управления в экране, не перекрываются и кликабельны (elementFromPoint),
 * кнопка хаба есть, выбор языка не уже 56 px. Не аудит модулей целиком —
 * только шапка после правки общего слоя (O3).
 *
 *   node scripts/live-shell-topbar.mjs   (playwright-core; из корня)
 *   TOPBAR_SHOTS=/tmp node scripts/live-shell-topbar.mjs   — плюс снимки шапок
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


const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const MODULES = ['congress-project', 'circuit-planner', 'pioneer-school', 'appointments', 'documents', 'journal'];
const WIDTHS = [[320, 800], [360, 800], [430, 900]];
const SHOTS = process.env.TOPBAR_SHOTS || '';
const errors = [];

/** Интерактивные элементы шапки: видимы, в экране, не перекрываются, кликабельны. */
async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bar = document.querySelector('.md-topbar-v2') || document.querySelector('header');
    if (!bar) return { vw, none: true };
    const els = [...bar.querySelectorAll('a, button, select')].filter((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden], .md-menu__list, [role="menu"]');
    });
    const info = els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className || e.tagName, l: Math.round(r.left), r: Math.round(r.right), t: r.top, b: r.bottom, el: e }; });
    const overlaps = [];
    for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) {
      const a = info[i], b = info[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) overlaps.push(a.id + '×' + b.id);
    }
    const outside = info.filter((x) => x.l < -0.5 || x.r > vw + 0.5).map((x) => x.id + ':' + x.l + '-' + x.r);
    const unclickable = info.filter((x) => { const hit = document.elementFromPoint((x.l + x.r) / 2, (x.t + x.b) / 2); return !hit || !(hit === x.el || x.el.contains(hit)); }).map((x) => x.id);
    const home = !!bar.querySelector('.cw-home-btn[href], a.cw-home-btn');
    const lang = bar.querySelector('select');
    const title = bar.querySelector('.md-topbar-v2__title');
    const mark = bar.querySelector('.md-topbar-v2__mark');
    return { vw, sw: document.documentElement.scrollWidth, barSw: bar.scrollWidth, barCw: bar.clientWidth, n: info.length, ids: info.map((x) => x.id + ':' + x.l + '-' + x.r),
      overlaps, outside, unclickable, home, lang: lang ? Math.round(lang.getBoundingClientRect().width) : null,
      title: title ? getComputedStyle(title).display + '/' + Math.round(title.getBoundingClientRect().width) : null,
      mark: mark ? getComputedStyle(mark).display : null };
  });
}
const results = [];
let failed = 0;

for (const mod of MODULES) {
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(mod + '@' + w + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push(mod + '@' + w + ': ' + String(e)));
    await page.goto(BASE + '/' + mod + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const m = await measure(page);
    const pass = !m.none && m.barSw <= m.barCw + 1 && m.overlaps.length === 0 && m.outside.length === 0 && m.unclickable.length === 0 && m.home && (m.lang === null || m.lang >= 56);
    if (!pass) failed++;
    console.log((pass ? '  ✓ ' : '  ✗ ') + mod + ' ' + w + ': ' + JSON.stringify({ sw: m.sw, bar: m.barSw + '/' + m.barCw, lang: m.lang, title: m.title, mark: m.mark, home: m.home, overlaps: m.overlaps, outside: m.outside, unclickable: m.unclickable }));
    if (process.env.TOPBAR_IDS) console.log('     ' + m.ids.join(' '));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/topbar-' + mod + '-' + w + '.png', clip: { x: 0, y: 0, width: w, height: 90 } });
    await ctx.close();
  }
}
console.log(errors.length ? '  ✗ ошибки консоли: ' + errors.slice(0, 5).join(' | ') : '  ✓ ошибок консоли/страницы нет');
if (errors.length) failed++;
await browser.close();
server.close();
console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ live-shell-topbar: шапка шести модулей на 320/360/430 цела');
process.exit(failed ? 1 : 0);
