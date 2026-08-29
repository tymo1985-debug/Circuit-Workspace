#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-run.mjs
 *
 * Живой прогон шести страниц в Chromium. НЕ ВХОДИТ В ГЕЙТ и намеренно:
 * `check-all.mjs` обязан работать на любой машине без браузера, а здесь нужен
 * Chromium и `playwright-core`. Запускается вручную перед выдачей файлов.
 *
 * ─── ЗАЧЕМ ─────────────────────────────────────────────────────────────────
 *
 * `check-all.mjs` — статика. Она не открывает страницу и потому не видит
 * пустой рендер, сломанную вёрстку и ошибки в консоли. Правило Алекса от
 * 10.08.2026: перед КАЖДОЙ выдачей файлов изменённые модули (плюс хаб, если
 * трогали `shared/*`) прогоняются вживую.
 *
 * Снимается ровно тот минимум, что записан в AGENTS.md:
 *   - страница реально отрисовалась — мерится `innerText.trim().length`,
 *     а не факт `goto()` без исключения;
 *   - пусто в `console` по `error` и в `pageerror`;
 *   - пусто в `requestfailed` (внешних CDN в проекте больше нет, подменять
 *     нечего — если появятся, их надо будет исключать здесь явно);
 *   - скриншот на мобильной ширине 430×900 — вёрстку смотреть глазами.
 *
 * ─── ЗАПУСК ────────────────────────────────────────────────────────────────
 *
 *     npm i playwright-core
 *     node scripts/live-run.mjs            # только отчёт
 *     node scripts/live-run.mjs --shots    # плюс скриншоты в shots/
 *
 * Путь к браузеру задаётся переменной CHROME_PATH; по умолчанию берётся
 * сборка Playwright, если она лежит в системе. Прогон поднимает свой
 * http-сервер: `file://` не годится — service worker и модули по нему не
 * работают.
 *
 * Прогон закончился не нулём находок — сначала чинить, потом собирать архив.
 * Если прогнать не удалось (любая причина) — сказать об этом прямо и назвать
 * проверку статической, не выдавая её за полную.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PORT = 8137;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

/* Путь к Chromium. Явная переменная важнее «умного» поиска: молча взятый
   не тот браузер дал бы прогон, которому нельзя верить. */
const CHROME = process.env.CHROME_PATH || (() => {
  const guess = '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(guess).find((d) => /^chromium-\d+$/.test(d));
    if (dir) return path.join(guess, dir, 'chrome-linux', 'chrome');
  } catch (e) { /* сборки Playwright здесь нет */ }
  return undefined;   // playwright-core поищет сам и внятно откажет
})();

const PAGES = [
  ['хаб', '/'],
  ['Клиндарий', '/circuit-planner/'],
  ['Конгрессы', '/congress-project/'],
  ['Школа', '/pioneer-school/'],
  ['Назначения', '/appointments/'],
  ['Документы', '/documents/'],
];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox'],
});

const shots = process.argv.includes('--shots');
let bad = 0;
for (const [name, url] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], pageErrors = [], failed = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
  await page.goto('http://127.0.0.1:' + PORT + url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(700);
  const len = await page.evaluate(() => document.body.innerText.trim().length);
  const ver = await page.evaluate(() => {
    const el = document.querySelector('[data-version], .cw-version, #version, .app-version');
    return el ? el.textContent.trim() : '';
  });
  if (shots) {
    await page.screenshot({ path: 'shots/' + name + '.png', fullPage: false });
  }
  const ok = len > 0 && !errors.length && !pageErrors.length && !failed.length;
  if (!ok) bad++;
  console.log(
    (ok ? '  ✓ ' : '  ✗ ') + name.padEnd(12) +
    'текст: ' + String(len).padStart(5) +
    '  console.error: ' + errors.length +
    '  pageerror: ' + pageErrors.length +
    '  requestfailed: ' + failed.length +
    (ver ? '  версия: ' + ver : '')
  );
  errors.forEach((e) => console.log('      console: ' + e.slice(0, 200)));
  pageErrors.forEach((e) => console.log('      pageerror: ' + e.slice(0, 200)));
  failed.forEach((e) => console.log('      failed: ' + e.slice(0, 200)));
  await ctx.close();
}
await browser.close();
server.close();
console.log(bad ? '\nСТРАНИЦ С НАХОДКАМИ: ' + bad : '\nВсе шесть страниц чисты.');
process.exit(bad ? 1 : 0);
