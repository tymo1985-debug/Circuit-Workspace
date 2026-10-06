#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-cp-sw.mjs
 *
 * Живой прогон service worker'а Клиндария (Chromium, 430×900, чистый origin).
 * Обязателен после правки circuit-planner/sw.js и shared/version.js в части
 * обновления (аудит 03, фаза 2). check-*.mjs читают код как текст и таких
 * отказов не видят — они проявляются только в браузере.
 *
 * Проверяет:
 *  P1-1  файлы на сервере изменились без нового worker'а → страница остаётся
 *        целиком старой, документ не уходит в сеть (нет ревалидации/preload);
 *  P1-2  новая версия с недоставленным файлом прекэша → install проваливается,
 *        активной остаётся прежняя; после восстановления ставится целиком;
 *  после «Обновить» новая разметка и новые скрипты приходят вместе, старый
 *        кэш удалён;
 *  офлайн: три входа (index.html, ./, ?source=pwa) без ошибок и сбойных
 *        запросов.
 *
 *   CHROME_PATH=/путь/к/chrome node scripts/live-cp-sw.mjs   (playwright-core)
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const cur = fs.readFileSync(path.join(ROOT, 'shared/version.js'), 'utf8').match(/'circuit-planner':\s*\{[^}]*version: '([^']+)'/)[1];
const state = { htmlNew: false, jsNew: false, ver: cur, broken: null };
const docHits = [];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  if (rel === 'circuit-planner/index.html' && req.headers['sec-fetch-dest'] === 'document') docHits.push({ preload: !!req.headers['service-worker-navigation-preload'] });
  if (state.broken && rel === state.broken) { res.writeHead(404); res.end(); return; }
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file, 'utf8');
  if (rel === 'shared/version.js') body = body.replace(`version: '${cur}'`, `version: '${state.ver}'`);
  if (rel === 'circuit-planner/index.html' && state.htmlNew) body = body.replace('<head>', '<head><meta name="x-marker" content="new">');
  if (rel === 'circuit-planner/app.js' && state.jsNew) body += '\nwindow.__jsMarker = "new";\n';
  const isText = /\.(html|js|css|webmanifest)$/.test(rel);
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(isText ? body : fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/circuit-planner/`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sw-'));
const ctx = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROME_PATH || undefined, headless: true });
const page = ctx.pages()[0];
await page.setViewportSize({ width: 430, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const out = {};
const fail = (m) => { throw new Error(m + '\n' + JSON.stringify(out, null, 2)); };
const markers = () => page.evaluate(() => ({ html: !!document.querySelector('meta[name="x-marker"]'), js: window.__jsMarker === 'new' }));
const swInfo = () => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration('./');
  const ask = (w) => w ? new Promise((resolve) => { const ch = new MessageChannel(); const t = setTimeout(() => resolve('timeout'), 2000); ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data.version); }; w.postMessage({ type: 'CW_VERSION' }, [ch.port2]); }) : null;
  return { active: await ask(reg.active), waiting: await ask(reg.waiting), installing: !!reg.installing, preload: reg.navigationPreload ? (await reg.navigationPreload.getState()).enabled : null };
});
const waitInstallSettled = () => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration('./');
  try { await reg.update(); } catch (e) { return 'update-rejected: ' + e.message; }
  const w = reg.installing; if (!w) return reg.waiting ? 'waiting' : 'none';
  return new Promise((resolve) => { const done = () => { if (w.state === 'installed' || w.state === 'redundant' || w.state === 'activated') resolve(w.state); }; w.addEventListener('statechange', done); done(); });
});

try {
  // 1. Прогрев
  await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration('./'))?.active);
  await page.reload({ waitUntil: 'networkidle' });
  out.warm = await swInfo();
  if (out.warm.active !== cur) fail('warm: active not ' + cur);
  if (out.warm.preload !== false) fail('navigation preload still enabled');

  // 2. P1-1: файлы на сервере изменились БЕЗ подъёма версии — два открытия
  state.htmlNew = true; state.jsNew = true; docHits.length = 0;
  for (let i = 0; i < 2; i++) { await page.goto(base + 'index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(800); }
  await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
  out.p11_noBump = await markers();
  out.p11_docNetworkHits = docHits.length;
  if ((out.p11_noBump.html || out.p11_noBump.js)) fail('P1-1: mixed/new generation served without new worker');
  if (docHits.length) fail('P1-1: cached navigation still hits network (revalidation/preload)');

  // 3. P1-2: новая версия, один файл прекэша недоставлен
  const v2 = cur.replace(/\d+$/, (n) => +n + 1);
  state.ver = v2; state.broken = 'circuit-planner/ui/route.js';
  out.p12_brokenInstall = await waitInstallSettled();
  out.p12_afterBroken = await swInfo();
  if (out.p12_brokenInstall !== 'redundant') fail('P1-2: install with missing precache file did not fail');
  if (out.p12_afterBroken.waiting || out.p12_afterBroken.active !== cur) fail('P1-2: broken version became waiting/active');
  await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
  out.p12_pageStillOld = await markers();
  if (out.p12_pageStillOld.html || out.p12_pageStillOld.js) fail('P1-2: page changed after failed install');

  // 4. Сеть восстановлена — та же версия ставится целиком и ждёт «Обновить»
  state.broken = null;
  out.p12_retry = await waitInstallSettled();
  out.afterRetry = await swInfo();
  if (out.afterRetry.waiting !== v2 || out.afterRetry.active !== cur) fail('retry: expected waiting ' + v2);
  await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
  out.beforeApply = await markers();
  if (out.beforeApply.html || out.beforeApply.js) fail('page switched before apply');

  // 5. Применение обновления — новый документ и новые скрипты вместе
  await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration('./'); reg.waiting.postMessage({ type: 'SKIP_WAITING' }); });
  await page.waitForFunction(async (v) => { const reg = await navigator.serviceWorker.getRegistration('./'); return reg.active && !reg.waiting; }, v2);
  await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
  out.afterApply = { ...(await markers()), sw: await swInfo() };
  if (!out.afterApply.html || !out.afterApply.js || out.afterApply.sw.active !== v2) fail('after apply: generation not switched as a whole');
  out.cachesAfterApply = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('syp-')));
  if (out.cachesAfterApply.some((k) => k.includes('-v' + cur + '-'))) fail('old cache left');

  // 6. Офлайн: полный старт модуля без сети
  await ctx.setOffline(true);
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  errors.length = 0;
  for (const u of ['index.html', '', '?source=pwa']) {
    const resp = await page.goto(base + u, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const ver = await page.locator('#cwModuleVersion').textContent().catch(() => null);
    out['offline_' + (u || 'root')] = { status: resp && resp.status(), ver, markers: await markers() };
    if (ver !== 'v' + v2) fail('offline start failed for ' + (u || './'));
  }
  out.offlineFailedRequests = failed.filter((u) => u.startsWith(base.replace('/circuit-planner/', '')) ).filter((u) => !/tile|openstreetmap/.test(u));
  out.offlinePageErrors = errors;
  if (out.offlineFailedRequests.length) fail('offline: same-origin requests failed');
  if (errors.length) fail('offline: page errors');
  await ctx.setOffline(false);
  console.log(JSON.stringify({ pass: true, ...out }, null, 2));
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
