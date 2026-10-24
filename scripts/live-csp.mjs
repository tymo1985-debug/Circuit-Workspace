#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-csp.mjs
 * Живая проверка Content-Security-Policy (24.10.2026). Статика
 * (`check-csp.mjs`) видит теги и код; она не видит того, что браузер
 * откажется загрузить в работе: тайлы карты, воркер pdf.js, печать в новом
 * окне, шрифт из data:. Нарушение CSP молчит для пользователя — функция просто
 * не работает, — поэтому здесь ловится само событие `securitypolicyviolation`.
 *
 * Что делается: каждая страница открывается на телефоне и на компьютере, затем
 * по очереди нажимается каждая видимая безопасная кнопка (разрушительные —
 * «удалить», «сбросить» — пропускаются), плюс сквозные тракты: демо-конгресс →
 * печать плана и письма, карта маршрута Клиндария, анкета Школы.
 * Любое нарушение политики или необработанная ошибка — провал.
 *
 *   CHROME_PATH=/opt/pw-browsers/chromium node scripts/live-csp.mjs
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PORT = 8152;
const BASE = `http://127.0.0.1:${PORT}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const CHROME = process.env.CHROME_PATH || (() => {
  try {
    const dir = fs.readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d));
    if (dir) return ['chrome-linux64', 'chrome-linux'].map((sub) => path.join('/opt/pw-browsers', dir, sub, 'chrome')).find((p) => fs.existsSync(p));
  } catch (e) { /* сборки Playwright здесь нет */ }
  return undefined;
})();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) console.log('  ✓ ' + label);
  else { failed++; console.log('  ✗ ' + label + (extra ? '\n      ' + extra : '')); }
};

/* Нарушение пишется в window.__csp ещё до скриптов страницы; внешние запросы
   к картам и геокодеру подменяются ответом — сеть здесь не нужна, а политика
   проверяется на попытке запроса, не на ответе. */
const COLLECT = `window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => {
  window.__csp.push(e.violatedDirective + ' ← ' + (e.blockedURI || 'inline') + (e.sourceFile ? ' @' + e.sourceFile.split('/').slice(-2).join('/') + ':' + e.lineNumber : ''));
});`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function newCtx(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU', acceptDownloads: true });
  await ctx.addInitScript(COLLECT);
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route(/nominatim\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[{"lat":"50.08","lon":"14.42","display_name":"Praha"}]' }));
  await ctx.route(/router\.project-osrm\.org/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"code":"Ok","routes":[{"distance":1000,"duration":600,"legs":[{"distance":1000,"duration":600}]}]}' }));
  return ctx;
}
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('popup', (p) => { p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) errors.push('popup: ' + m.text().slice(0, 200)); }); });
  return errors;
}
const violations = (page) => page.evaluate(() => window.__csp || []).catch(() => []);

const PAGES = [['хаб', '/'], ['Клиндарий', '/circuit-planner/'], ['Конгрессы', '/congress-project/'], ['Школа', '/pioneer-school/'],
  ['анкета Школы', '/pioneer-school/register.html'], ['Назначения', '/appointments/'], ['Документы', '/documents/'], ['Журнал', '/journal/'], ['Архив', '/archive/']];
const SKIP = /удал|сброс|очист|delete|reset|clear|снять|убрать|выйти|назад|к модулям|←|импорт|import|восстанов|restore/i;

/* 1. Каждая кнопка первого экрана — на свежей странице. */
for (const [vw, vh, tag] of [[1440, 900, 'компьютер'], [390, 844, 'телефон']]) {
  console.log(`\n1. Кнопки первого экрана (${tag})`);
  for (const [name, url] of PAGES) {
    const ctx = await newCtx({ width: vw, height: vh });
    let page = await ctx.newPage(); let errors = watch(page);
    await page.goto(BASE + url, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    const base = [...await violations(page), ...errors];
    const list = await page.evaluate((src) => {
      const skip = new RegExp(src, 'i');
      return [...document.querySelectorAll('button, [role=button], a[href^="#"]')].map((el, i) => {
        const r = el.getBoundingClientRect();
        const label = (el.getAttribute('aria-label') || el.innerText || el.title || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return { i, label, vis: r.width > 0 && r.height > 0 && !el.disabled && !skip.test(label) };
      }).filter((b) => b.vis);
    }, SKIP.source);
    const bad = [];
    for (const b of list) {
      await page.close(); page = await ctx.newPage(); errors = watch(page);
      await page.goto(BASE + url, { waitUntil: 'networkidle' }); await page.waitForTimeout(200);
      const el = (await page.$$('button, [role=button], a[href^="#"]'))[b.i];
      if (!el) continue;
      try { await el.click({ timeout: 1500 }); } catch (e) { continue; }
      await page.waitForTimeout(350);
      const v = [...await violations(page), ...errors];
      if (v.length) bad.push(`«${b.label}»: ${[...new Set(v)].join(' | ')}`);
    }
    ok(`${name}: загрузка и ${list.length} кнопок без нарушений`, !base.length && !bad.length, [...base, ...bad].slice(0, 4).join('\n      '));
    await ctx.close();
  }
}

/* 2. Сквозные тракты: то, до чего первым экраном не дотянуться. */
console.log('\n2. Тракты');
{
  const ctx = await newCtx({ width: 1440, height: 900 });
  const page = await ctx.newPage(); const errors = watch(page);
  await page.goto(BASE + '/congress-project/', { waitUntil: 'networkidle' });
  await page.click('#emptyNewCongressBtn'); await page.click('#createCongressBtn');
  await page.waitForSelector('#tasksBody tr:has(.le) .le');
  await page.click('#tasksBody tr:has(.le) .le'); await page.waitForSelector('#letterDialog[open]');
  const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 4000 }).catch(() => null), page.click('#printLetterBtn')]);
  if (popup) await popup.waitForLoadState().catch(() => {});
  await page.waitForTimeout(600);
  const v = [...await violations(page), ...errors];
  ok('Конгрессы: демо-конгресс → письмо → печать', !v.length, v.join(' | '));
  await ctx.close();
}
{
  const ctx = await newCtx({ width: 1440, height: 900 });
  const page = await ctx.newPage(); const errors = watch(page);
  await page.goto(BASE + '/circuit-planner/', { waitUntil: 'networkidle' });
  const loaded = await page.evaluate(async () => {
    const s = document.createElement('script'); s.src = './vendor/leaflet.js';
    await new Promise((r, j) => { s.onload = r; s.onerror = j; document.head.appendChild(s); });
    const box = document.createElement('div'); box.style.cssText = 'width:300px;height:200px'; document.body.appendChild(box);
    const map = window.L.map(box).setView([50.08, 14.42], 12);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    await new Promise((r) => setTimeout(r, 800));
    return !!box.querySelector('img.leaflet-tile');
  }).catch((e) => String(e));
  const geo = await page.evaluate(() => fetch('https://nominatim.openstreetmap.org/search?q=x').then((r) => r.ok, () => false));
  const osrm = await page.evaluate(() => fetch('https://router.project-osrm.org/route/v1/driving/14,50;14.1,50.1').then((r) => r.ok, () => false));
  const v = [...await violations(page), ...errors];
  ok('Клиндарий: тайлы карты, геокодер и OSRM разрешены', loaded === true && geo && osrm && !v.length, `tiles=${loaded} geo=${geo} osrm=${osrm} ${v.join(' | ')}`);
  const blocked = await page.evaluate(() => fetch('https://example.com/').then(() => 'loaded', () => 'blocked'));
  const evil = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<img src="x" onerror="window.__pwned=1">'; document.body.appendChild(d); return new Promise((r) => setTimeout(() => r(!!window.__pwned), 300)); });
  ok('посторонний адрес и внедрённый onerror заблокированы', blocked === 'blocked' && evil === false, `fetch=${blocked} onerror=${evil}`);
  /* Контроль самого датчика: заблокированное обязано оставить след в __csp,
     иначе «нарушений нет» выше ничего не доказывало бы. */
  ok('датчик нарушений срабатывает', (await violations(page)).length >= 2);
  await ctx.close();
}

await browser.close(); server.close();
console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ CSP: нарушений нет, лишнее заблокировано');
process.exit(failed ? 1 : 0);
