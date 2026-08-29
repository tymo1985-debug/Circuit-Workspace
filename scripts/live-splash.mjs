#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-splash.mjs
 *
 * `background_color` манифеста сверяется с ИЗМЕРЕННЫМ фоном страницы.
 * НЕ ВХОДИТ В ГЕЙТ: нужен настоящий браузер — цвет складывается из каскада,
 * а не читается из одного правила.
 *
 * ─── ЗАЧЕМ ─────────────────────────────────────────────────────────────────
 *
 * 28.08.2026 замер показал, что ни один из шести манифестов не совпадал с
 * настоящим фоном: хаб объявлял `#140d28` при реальном `#f6f3fd`, и экран
 * запуска вспыхивал тёмным перед светлым приложением. Значения проставлены
 * по замеру. С тех пор цветной слой перевернули (`--md-*` стали источником
 * правды), и проверить, что значения не разъехались снова, можно только
 * замером — на глаз разница `#f6f3fd` и `#ece5f8` не видна.
 *
 * Замер снимается в СВЕТЛОЙ теме: `background_color` одно на все темы, а
 * светлая применяется, когда предпочтение не выражено.
 *
 *     node scripts/live-splash.mjs
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 8141;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const CHROME = process.env.CHROME_PATH || (() => {
  try {
    const dir = fs.readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d));
    if (dir) return path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
  } catch (e) { /* нет сборки Playwright */ }
  return undefined;
})();

const PAGES = [
  ['хаб', '/', 'manifest.json'],
  ['Клиндарий', '/circuit-planner/', 'circuit-planner/manifest.webmanifest'],
  ['Конгрессы', '/congress-project/', 'congress-project/manifest.json'],
  ['Школа', '/pioneer-school/', 'pioneer-school/manifest.json'],
  ['Назначения', '/appointments/', 'appointments/manifest.json'],
  ['Документы', '/documents/', 'documents/manifest.json'],
];

const hex = (rgb) => {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  return '#' + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let bad = 0;
for (const [name, url, manifest] of PAGES) {
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:' + PORT + url, { waitUntil: 'networkidle' });
  const measured = hex(await page.evaluate(() => {
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const transparent = /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(bodyBg);
    return transparent ? getComputedStyle(document.documentElement).backgroundColor : bodyBg;
  }));
  const declared = (JSON.parse(fs.readFileSync(path.join(ROOT, manifest), 'utf8')).background_color || '').toLowerCase();
  const same = declared === measured;
  if (!same) bad++;
  console.log((same ? '  ✓ ' : '  ✗ ') + name.padEnd(11)
    + 'манифест ' + declared + '   измерено ' + measured);
  await ctx.close();
}
await browser.close();
server.close();
console.log(bad
  ? '\nРасхождений: ' + bad + '. Экран запуска вспыхнёт чужим цветом — проставить измеренное.'
  : '\nЭкран запуска совпадает с фоном страницы у всех шести.');
process.exit(bad ? 1 : 0);
