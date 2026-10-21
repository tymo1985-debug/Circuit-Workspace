#!/usr/bin/env node
/* Живой прогон по пробелам аудита 07: высота шапки на 360px, контраст текста
   в тёмной теме, светлая тема при печати. Нужен CHROME_PATH (см. docs/rules/).
   Не входит в check-all: запускается руками перед релизом, как live-*.mjs. */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = process.env.CHROME_PATH || undefined;
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const PAGES = ['', 'circuit-planner/', 'congress-project/', 'pioneer-school/', 'appointments/', 'documents/', 'journal/', 'archive/'];
const MAX_HEADER_360 = 120;   // px: шапка не должна съедать больше трети экрана
const MIN_CONTRAST = 4.5;     // WCAG AA для обычного текста

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let failures = 0;
const report = (ok, text) => { if (!ok) failures++; console.log(`${ok ? '✓' : '✗'} ${text}`); };

async function open(width, height, theme) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('cw-theme', t); } catch (e) {} }, theme);
  return { context, page };
}

/* 1. Высота шапки на 360px (светлая и тёмная). */
console.log('Шапка на 360px');
for (const modulePath of PAGES) {
  const { context, page } = await open(360, 740, 'light');
  await page.goto(`${BASE}/${modulePath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const h = await page.evaluate(() => {
    const el = document.querySelector('header, .cw-hub-header, .md-topbar, .topbar');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return Math.round(r.bottom);
  });
  report(h !== null && h <= MAX_HEADER_360, `360px ${modulePath || 'hub'}: нижний край шапки ${h}px (лимит ${MAX_HEADER_360})`);
  await context.close();
}

/* 2. Контраст текста в тёмной теме: листовые текстовые элементы против
   ближайшего непрозрачного фона предка. */
console.log('\nКонтраст в тёмной теме');
for (const modulePath of PAGES) {
  const { context, page } = await open(1280, 800, 'dark');
  await page.goto(`${BASE}/${modulePath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const res = await page.evaluate((MIN) => {
    const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a >= 0.95) return c; } return { r: 0, g: 0, b: 0, a: 1 }; };
    const bad = [];
    let total = 0;
    document.querySelectorAll('body *').forEach((el) => {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      if (!r.width || !r.height || s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0 || el.closest('[hidden],script,style,.sr-only')) return;
      const fg = parse(s.color), bg = bgOf(el);
      if (!fg) return;
      total++;
      const a = lum(fg), b = lum(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < MIN) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} «${el.textContent.trim().slice(0, 24)}» ${ratio.toFixed(2)}`);
    });
    return { total, bad: bad.slice(0, 6), count: bad.length };
  }, MIN_CONTRAST);
  report(res.count === 0, `тёмная ${modulePath || 'hub'}: ${res.count} из ${res.total} ниже ${MIN_CONTRAST}${res.count ? ' — ' + res.bad.join('; ') : ''}`);
  await context.close();
}

/* 3. Печать при выбранной тёмной теме — светлые листы. */
console.log('\nПечать при тёмной теме');
for (const modulePath of PAGES) {
  const { context, page } = await open(1280, 800, 'dark');
  await page.goto(`${BASE}/${modulePath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);
  const light = await page.evaluate(() => {
    /* Прозрачный body — бумага белая, если не тёмен html. */
    let m = [255, 255, 255];
    for (const el of [document.body, document.documentElement]) {
      const c = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || [];
      if (c.length < 4 || +c[3] > 0.5) { if (c.length) m = c; break; }
    }
    return { theme: document.documentElement.getAttribute('data-theme'), lum: (+m[0] + +m[1] + +m[2]) / 3 };
  });
  report(light.lum > 200, `печать ${modulePath || 'hub'}: data-theme=${light.theme}, яркость фона ${Math.round(light.lum)}`);
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} провал(ов)` : '\nPASS');
process.exit(failures ? 1 : 0);
