#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || undefined;
const current = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'shared/version.js'), 'utf8'), { self: current });
const bumpPatch = (version) => {
  const parts = String(version).split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) throw new Error('invalid current version ' + version);
  parts[2]++;
  return parts.join('.');
};
const NEXT = {
  hub: [current.CW_VERSION, bumpPatch(current.CW_VERSION)],
};
for (const [id, meta] of Object.entries(current.CW_MODULES || {})) NEXT[id] = [meta.version, bumpPatch(meta.version)];
let phase = 1;
const synthetic = (rel, buf) => {
  let text = buf.toString('utf8');
  for (const [, versions] of Object.entries(NEXT)) text = text.replaceAll(versions[0], versions[1]);
  if (rel === 'shared/release-manifest.js') text = text.replace(/note: '[^']*'/g, "note: 'Synthetic live upgrade: verified changelog' ");
  return Buffer.from(text);
};
let foreignFetches = 0;

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/__upgrade') { phase = 2; res.end('ok'); return; }
  if (pathname === '/foreign-sw.js') {
    foreignFetches++;
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(`const FOREIGN_VERSION=${phase};self.addEventListener('install',()=>{});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});`);
    return;
  }
  if (pathname === '/__foreign_fetches') { res.end(String(foreignFetches)); return; }
  let rel = pathname.replace(/^\/+/, '') || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  let body = fs.readFileSync(file);
  if (phase === 2 && (rel === 'shared/version.js' || rel === 'shared/release-manifest.js')) body = synthetic(rel, body);
  /* Синтетический выпуск меняет два файла — значит, и их хеши в манифесте,
     как сделал бы build-precache-manifest.mjs при настоящем выпуске. */
  if (phase === 2 && rel === 'shared/precache-manifest.js') {
    let text = body.toString('utf8');
    for (const f of ['shared/version.js', 'shared/release-manifest.js']) {
      const served = synthetic(f, fs.readFileSync(path.join(ROOT, f)));
      const sum = crypto.createHash('sha256').update(served).digest('hex').slice(0, 16);
      text = text.replace(new RegExp('("' + f.replace(/[.]/g, '\\.') + '": )"[0-9a-f]+"'), '$1"' + sum + '"');
    }
    body = Buffer.from(text);
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
/* waitForFunction() не ждёт промис из предиката — промис сам по себе
   «истинен», и ожидание проходило мгновенно. Поэтому опрос из Node: каждая
   проба — отдельный evaluate, а страница модуля после первой активации может
   сама перезагрузиться (смена controller) — такая проба просто повторяется. */
const settled = async (p, all) => {
  const until = Date.now() + 60000;
  for (;;) {
    const ok = await p.evaluate(async (everyScope) => {
      const regs = (await navigator.serviceWorker.getRegistrations()).filter((r) => everyScope
        ? !r.scope.endsWith('/Weather-App-Claude/')
        /* Регистрация ИМЕННО этой области: getRegistration() без своей
           регистрации вернёт регистрацию хаба (область «/» шире). */
        : r.scope === new URL('./', location.href).href);
      return regs.length > 0 && regs.every((r) => r.active && !r.installing && !r.waiting);
    }, !!all).catch(() => false);
    if (ok) { await p.waitForLoadState('load').catch(() => {}); await p.waitForTimeout(300); return; }
    if (Date.now() > until) throw new Error('service worker install did not settle');
    await p.waitForTimeout(250);
  }
};
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-update-live-'));
const context = await chromium.launchPersistentContext(profile, { executablePath: CHROME, headless: true });
const page = context.pages()[0];

try {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('/foreign-sw.js', { scope: '/Weather-App-Claude/', updateViaCache: 'none' });
    while (!reg.active) await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const foreignPage = await context.newPage();
  await foreignPage.goto(base + 'Weather-App-Claude/index.html', { waitUntil: 'domcontentloaded' });
  await foreignPage.reload({ waitUntil: 'domcontentloaded' });
  await foreignPage.waitForFunction(() => !!navigator.serviceWorker.controller);
  /* Версия A прогрета, только если установка каждого модуля дошла до конца
     до ухода со страницы: регистрацию, чья первая установка ещё идёт,
     Chromium при уходе клиента может снять, и тогда модуль ставится с нуля
     уже в фазе B — замер обновления (аудит 04) мерил бы первую установку. */
  for (const id of Object.keys(NEXT).filter((id) => id !== 'hub')) {
    await page.goto(base + id + '/index.html', { waitUntil: 'domcontentloaded' });
    await settled(page);
  }
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.getRegistrations().then((r) => r.length === 8));
  /* Базовая версия A считается прогретой, только когда все восемь установок
     завершились: иначе хвост первой установки попадает в замер обновления. */
  await settled(page, true);
  const primed = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).filter((r) => !r.scope.endsWith('/Weather-App-Claude/') && r.active).length);
  if (primed !== Object.keys(NEXT).length) throw new Error('baseline: ' + primed + ' of ' + Object.keys(NEXT).length + ' workers active');
  const before = await page.locator('#hubVersion').textContent();
  if (before !== 'v' + NEXT.hub[0]) throw new Error('unexpected baseline ' + before);

  await page.request.get(base + '__upgrade');
  await page.evaluate(() => {
    window.__foreignUpdateCalls = 0;
    const originalUpdate = ServiceWorkerRegistration.prototype.update;
    ServiceWorkerRegistration.prototype.update = function () {
      if (this.scope.endsWith('/Weather-App-Claude/')) window.__foreignUpdateCalls++;
      return originalUpdate.call(this);
    };
  });
  await page.waitForTimeout(1000);
  if (!await page.locator('#cwUpdateBar .cw-update__apply').count()) await page.click('#hubUpdateBtn');
  await page.waitForSelector('#cwUpdateBar .cw-update__apply', { timeout: 30000 });
  const offered = await page.locator('#cwUpdateBar').innerText();
  const bannerBox = await page.locator('#cwUpdateBar').boundingBox();
  if (!bannerBox || bannerBox.x < 0 || bannerBox.x + bannerBox.width > 430 || bannerBox.y < 0 || bannerBox.y + bannerBox.height > 900) {
    throw new Error('mobile update banner is outside 430x900 viewport: ' + JSON.stringify(bannerBox));
  }
  if (offered.includes('Version-only')) throw new Error('technical cascade leaked into update banner: ' + offered);
  const foreignUpdateCalls = await page.evaluate(() => window.__foreignUpdateCalls);
  if (foreignUpdateCalls !== 0) throw new Error('foreign service worker was checked by Hub');
  if (offered.includes('Weather-App-Claude') || offered.includes('foreign-sw')) throw new Error('foreign scope leaked into update banner: ' + offered);
  if (!offered.includes('Synthetic live upgrade')) {
    const waiting = await page.evaluate(async () => Promise.all((await navigator.serviceWorker.getRegistrations()).map((reg) => new Promise((resolve) => {
      if (!reg.waiting) { resolve({ scope: reg.scope, waiting: false }); return; }
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve({ scope: reg.scope, error: 'timeout' }), 2500);
      channel.port1.onmessage = (event) => { clearTimeout(timer); resolve({ scope: reg.scope, data: event.data }); };
      reg.waiting.postMessage({ type: 'CW_VERSION' }, [channel.port2]);
    }))));
    throw new Error('new changelog is absent before apply: ' + offered + '\n' + JSON.stringify(waiting));
  }
  const foreignApply = await page.evaluate(async () => {
    const reg = (await navigator.serviceWorker.getRegistrations()).find((item) => item.scope.endsWith('/Weather-App-Claude/'));
    await reg.update();
    await new Promise((resolve, reject) => {
      if (reg.waiting) { resolve(); return; }
      const timer = setTimeout(() => reject(new Error('foreign waiting timeout')), 5000);
      reg.addEventListener('updatefound', () => reg.installing.addEventListener('statechange', () => {
        if (reg.waiting) { clearTimeout(timer); resolve(); }
      }));
    });
    const result = await CWUpdate.applyAll([{ scope: reg.scope, reg }]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { stillWaiting: !!reg.waiting, results: result.results };
  });
  if (!foreignApply.stillWaiting || foreignApply.results.length) throw new Error('foreign worker received apply: ' + JSON.stringify(foreignApply));

  await page.click('#cwUpdateBar .cw-update__apply');
  await page.waitForFunction((version) => document.querySelector('#hubVersion')?.textContent === 'v' + version, NEXT.hub[1], { timeout: 30000 });

  const versions = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return Promise.all(regs.map((reg) => new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve({ scope: reg.scope, error: 'timeout' }), 3000);
      channel.port1.onmessage = (event) => { clearTimeout(timer); resolve({ scope: reg.scope, ...event.data }); };
      reg.active.postMessage({ type: 'CW_VERSION' }, [channel.port2]);
    })));
  });
  for (const [id, pair] of Object.entries(NEXT)) {
    const found = versions.find((v) => v.module === id);
    if (!found || found.version !== pair[1]) throw new Error(`${id}: active=${JSON.stringify(found)}, expected=${pair[1]}`);
  }
  /* Аудит 04, вариант A: каждая установка пишет в свой кэш итог — что
     перенесено, что скачано. Синтетический выпуск меняет два файла, значит
     скачаны могут быть только они; всё остальное обязано переехать из
     прежнего кэша. Сетевой лог для этого не годится: хаб ревалидирует свою
     оболочку в фоне при каждом открытии, и это не установка. */
  const installs = await page.evaluate(async (release) => {
    const out = [];
    for (const name of await caches.keys()) {
      if (!name.includes(release)) continue;
      const cache = await caches.open(name);
      const key = (await cache.keys()).find((k) => k.url.endsWith('/__cw-precache-revs.json'));
      out.push(key ? { name, ...(await (await cache.match(key)).json()), revs: undefined } : { name, missing: true });
    }
    return out;
  }, NEXT.hub[1]);
  const precacheReport = installs.map((i) => ({ cache: i.name, copied: i.copied, fetched: i.fetched }));
  if (installs.length < 8 || installs.some((i) => i.missing)) throw new Error('precache install record missing: ' + JSON.stringify(precacheReport));
  const extra = installs.flatMap((i) => (i.fetched || []).filter((f) => f !== 'shared/version.js' && f !== 'shared/release-manifest.js').map((f) => i.name + ': ' + f));
  if (extra.length) throw new Error('update re-downloaded unchanged precached files (audit 04, A): ' + extra.join(', '));
  if (installs.reduce((n, i) => n + (i.copied || 0), 0) < 300) throw new Error('copy-forward did not happen: ' + JSON.stringify(precacheReport));

  /* Каждая регистрация обязана держать ОДИН script URL с `?cw-release=<новый>`
     и не иметь лишнего installing/waiting. Иной URL у той же регистрации —
     повторная установка того же кода; до 07.10.2026 она давала ложную полосу
     «открыть Hub» (~40% прогонов) и зависание навигации к модулю. */
  const assertSingleWorker = async (label) => {
    const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((reg) => ({
      scope: reg.scope, active: reg.active && reg.active.scriptURL, waiting: reg.waiting && reg.waiting.scriptURL, installing: reg.installing && reg.installing.scriptURL,
    })));
    const ours = regs.filter((r) => !r.scope.endsWith('/Weather-App-Claude/'));
    const bad = ours.filter((r) => r.waiting || r.installing || !r.active || new URL(r.active).searchParams.get('cw-release') !== NEXT.hub[1]);
    if (bad.length) throw new Error(label + ': duplicate/unversioned worker: ' + JSON.stringify(bad));
  };
  await assertSingleWorker('after apply');

  for (const id of Object.keys(NEXT).filter((id) => id !== 'hub')) {
    const response = await page.goto(base + id + '/index.html', { waitUntil: 'domcontentloaded' });
    if (!response || !String(response.headers()['content-type']).includes('text/html')) throw new Error(id + ': navigation did not return HTML');
    await page.waitForTimeout(2800);
    if (await page.locator('#cwUpdateBar').count()) throw new Error(id + ': false open-Hub update banner after success');
    if (!await page.locator('body').count()) throw new Error(id + ': broken UI');
  }
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  if (!await page.locator('#hubVersion').count()) throw new Error('Hub return produced broken/plain-text UI');
  await page.waitForTimeout(2000);
  await assertSingleWorker('after module returns');
  if (await page.locator('#cwUpdateBar').count()) throw new Error('Hub: update banner again after a completed update');
  console.log(JSON.stringify({ pass: true, baseline: NEXT.hub[0], upgraded: NEXT.hub[1], registrations: versions, changelogShown: true, precache: precacheReport, technicalChangesHidden: true, mobileBannerViewport: '430x900', foreignScopeIgnored: true, foreignSkipWaitingBlocked: true, hardRefreshUsed: false, moduleReturnChecks: 6, singleWorkerPerScope: true }, null, 2));
} finally {
  await context.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
}
