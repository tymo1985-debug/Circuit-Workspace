#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
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

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/__upgrade') { phase = 2; res.end('ok'); return; }
  let rel = pathname.replace(/^\/+/, '') || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  let body = fs.readFileSync(file);
  if (phase === 2 && (rel === 'shared/version.js' || rel === 'shared/release-manifest.js')) {
    let text = body.toString('utf8');
    for (const [id, versions] of Object.entries(NEXT)) text = text.replaceAll(versions[0], versions[1]);
    if (rel === 'shared/release-manifest.js') text = text.replace(/note: '[^']*'/g, "note: 'Synthetic live upgrade: verified changelog' ");
    body = Buffer.from(text);
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-update-live-'));
const context = await chromium.launchPersistentContext(profile, { executablePath: CHROME, headless: true });
const page = context.pages()[0];

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  for (const id of Object.keys(NEXT).filter((id) => id !== 'hub')) {
    await page.goto(base + id + '/index.html', { waitUntil: 'domcontentloaded' });
  }
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.getRegistrations().then((r) => r.length === 7));
  const before = await page.locator('#hubVersion').textContent();
  if (before !== 'v' + NEXT.hub[0]) throw new Error('unexpected baseline ' + before);

  await page.request.get(base + '__upgrade');
  await page.waitForTimeout(1000);
  if (!await page.locator('#cwUpdateBar .cw-update__apply').count()) await page.click('#hubUpdateBtn');
  await page.waitForSelector('#cwUpdateBar .cw-update__apply', { timeout: 30000 });
  const offered = await page.locator('#cwUpdateBar').innerText();
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

  for (const id of Object.keys(NEXT).filter((id) => id !== 'hub')) {
    const response = await page.goto(base + id + '/index.html', { waitUntil: 'domcontentloaded' });
    if (!response || !String(response.headers()['content-type']).includes('text/html')) throw new Error(id + ': navigation did not return HTML');
    await page.waitForTimeout(2800);
    if (await page.locator('#cwUpdateBar').count()) throw new Error(id + ': false open-Hub update banner after success');
    if (!await page.locator('body').count()) throw new Error(id + ': broken UI');
  }
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  if (!await page.locator('#hubVersion').count()) throw new Error('Hub return produced broken/plain-text UI');
  console.log(JSON.stringify({ pass: true, baseline: NEXT.hub[0], upgraded: NEXT.hub[1], registrations: versions, changelogShown: true, hardRefreshUsed: false, moduleReturnChecks: 6 }, null, 2));
} finally {
  await context.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
}
