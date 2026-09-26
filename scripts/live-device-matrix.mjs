#!/usr/bin/env node
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = process.env.CHROME_PATH || undefined;
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2' };
const server = http.createServer((req,res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
const PAGES = ['', 'circuit-planner/', 'congress-project/', 'pioneer-school/', 'appointments/', 'documents/', 'journal/'];
const VIEWPORTS = [[320,800,'phone-compact'],[390,844,'phone'],[430,932,'phone-large'],[844,390,'landscape']];
const LANGS = ['ru','uk','en','pl','de'];
const browser = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox'] });
let failures = 0;

for (const [width,height,label] of VIEWPORTS) {
  for (const modulePath of PAGES) {
    const context = await browser.newContext({ viewport:{width,height}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${BASE}/${modulePath}`, { waitUntil:'networkidle' });
    await page.waitForTimeout(1200);
    const result = await page.evaluate(() => {
      const root = document.documentElement;
      /* Calendar day cells form a seven-column dense grid and qualify for the
         adjacent-target exception; their explicit `+` action is still audited
         and must be 44×44. Everything else is measured strictly. */
      const targets = [...document.querySelectorAll('button,select,input:not([type="hidden"]),[role="button"]')].filter((el) => {
        const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' &&
          !el.matches('.sr-only,[aria-hidden="true"],.day-cell') && !el.closest('[hidden]');
      }).map((el) => { const r=el.getBoundingClientRect(); return { id:el.id || String(el.className) || el.tagName, w:Math.round(r.width), h:Math.round(r.height) }; }).filter((x) => x.w < 44 || x.h < 44).slice(0,8);
      const unlabeled = [...document.querySelectorAll('button,a[href],select,input:not([type="hidden"])')].filter((el) => {
        const r=el.getBoundingClientRect(); if (!r.width || !r.height || el.closest('[hidden]')) return false;
        return !el.matches('.sr-only') && !(el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.textContent.trim() || (el.labels && el.labels.length));
      }).slice(0,8).map((el) => el.id || String(el.className) || el.tagName);
      return { overflow:root.scrollWidth-root.clientWidth, targets, unlabeled };
    });
    const ok = result.overflow <= 1 && !result.targets.length && !result.unlabeled.length && !errors.length;
    if (!ok) failures++;
    console.log(`${ok?'✓':'✗'} ${label} ${modulePath||'hub'} ${JSON.stringify({ ...result, errors:errors.slice(0,3) })}`);
    await context.close();
  }
}

for (const lang of LANGS) {
  const context = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  const page = await context.newPage();
  await page.addInitScript((value) => localStorage.setItem('cw-language', value), lang);
  for (const modulePath of PAGES) {
    await page.goto(`${BASE}/${modulePath}`, { waitUntil:'networkidle' });
    /* Hub SW (scope '/') may control this page before the module's own,
       narrower-scope SW registers; that registration's controllerchange
       then fires shared/update.js's location.reload() at an arbitrary
       moment. One retry after the reload settles is enough to observe
       the real DOM instead of failing on the transient navigation. */
    const readLabels = () => page.evaluate(() => [...document.querySelectorAll('[data-i18n]')].filter((el) => /^[-\w]+(?:\.[-\w]+)+$/.test(el.textContent.trim())).map((el) => el.textContent.trim()).slice(0,5));
    let raw;
    try {
      raw = await readLabels();
    } catch (err) {
      await page.waitForLoadState('networkidle').catch(() => {});
      raw = await readLabels();
    }
    if (raw.length) { failures++; console.log(`✗ locale ${lang} ${modulePath||'hub'} raw=${raw.join(',')}`); }
  }
  await context.close();
}

await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log(failures ? `\nDevice matrix failures: ${failures}` : '\nDevice/touch/runtime-localization matrix passed.');
process.exit(failures ? 1 : 0);
