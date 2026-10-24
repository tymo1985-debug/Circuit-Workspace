#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-csp.mjs
 * Content-Security-Policy страниц приложения (аудит 08, п.18; решение Алекса
 * 24.10.2026: «CSP — делать, по шагам»).
 *
 * ─── ЧТО ЭТО ЗАЩИЩАЕТ ───────────────────────────────────────────────────────
 * Данные лежат на устройстве, сервера нет. Путь для чужого кода один: текст
 * из импортированной копии, письма или анкеты, который попал в разметку
 * неэкранированным. Экранирование — первая линия; CSP — вторая: даже если
 * `<img onerror=…>` или `<script>` окажется в DOM, браузер его не исполнит,
 * потому что скрипты разрешены только из файлов приложения.
 *
 * ─── ПОЧЕМУ <meta>, А НЕ ЗАГОЛОВОК ─────────────────────────────────────────
 * GitHub Pages не даёт задавать HTTP-заголовки. В <meta> недоступны
 * `frame-ancestors`, `report-uri` и режим «только отчёт» — это известная
 * цена. Тег обязан стоять ПЕРВЫМ в <head>: политика действует только на то,
 * что загружается после неё.
 *
 * ─── ПОЧЕМУ style-src С 'unsafe-inline' ────────────────────────────────────
 * Атрибуты style="" живут в разметке и в шаблонах (~170 мест), а CSS печати
 * и подгонки плана вставляется строкой. Внедрённый стиль не исполняет код;
 * опасность — скрипты, и они закрыты без исключений.
 *
 * ─── ЧТО ПРОВЕРЯЕТСЯ ───────────────────────────────────────────────────────
 *  1. Каждая страница приложения несёт политику, совпадающую с POLICY, первой
 *     в <head>.
 *  2. В разметке нет inline-<script>, обработчиков on*= и `javascript:`.
 *  3. В JS приложения (без vendor) нет eval / new Function / Function(…) /
 *     setTimeout со строкой, а в строках-шаблонах — обработчиков on*=:
 *     innerHTML с `onclick="…"` под CSP молча перестаёт работать.
 *  4. pdf.js вызывается с isEvalSupported:false — иначе он сам пробует
 *     new Function и сыплет нарушениями политики в консоль.
 *
 * Новая внешняя служба (карта, геокодер) — дописать её в POLICY здесь И в
 * страницах (`node scripts/check-csp.mjs --write` переписывает тег во всех).
 *
 *   node scripts/check-csp.mjs [--write]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { simple } from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // data:/blob: — подписи, логотипы, превью PDF; тайлы — карта маршрута Клиндария.
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  // Координаты дома (хаб, Клиндарий) и дорожные расстояния (маршрут Клиндария).
  "connect-src 'self' https://nominatim.openstreetmap.org https://router.project-osrm.org",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
].join('; ');

export const PAGES = [
  'index.html',
  'circuit-planner/index.html',
  'congress-project/index.html',
  'pioneer-school/index.html',
  'pioneer-school/register.html',
  'appointments/index.html',
  'documents/index.html',
  'journal/index.html',
  'archive/index.html',
];

const TAG = `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`;
const TAG_RE = /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*">\n?/g;

const problems = [];
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

if (process.argv.includes('--write')) {
  for (const p of PAGES) {
    let html = read(p).replace(TAG_RE, '');
    html = html.replace(/<head>\n?/i, (m) => m + (m.endsWith('\n') ? '' : '\n') + TAG + '\n');
    writeFileSync(join(ROOT, p), html);
  }
  console.log(`политика записана в ${PAGES.length} страниц`);
}

/* 1–2. Разметка. */
for (const p of PAGES) {
  const html = read(p);
  const tags = html.match(TAG_RE) || [];
  if (tags.length !== 1) { problems.push(`${p}: тегов CSP ${tags.length}, нужен ровно один`); continue; }
  if (tags[0].trim() !== TAG) problems.push(`${p}: политика отличается от POLICY (запустить с --write)`);
  const head = html.slice(html.search(/<head>/i) + 6);
  const firstTag = head.match(/<(meta|script|link|style|title|base)\b[^>]*>/i);
  if (!firstTag || !/Content-Security-Policy/.test(firstTag[0])) problems.push(`${p}: CSP не первый тег <head> — то, что выше, ею не покрыто`);
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  const inline = [...body.matchAll(/<script\b([^>]*)>/gi)].filter((m) => !/\ssrc\s*=/.test(m[1]));
  if (inline.length) problems.push(`${p}: inline-<script> × ${inline.length} — вынести в файл`);
  const handlers = body.match(/<[a-z][^>]*\son[a-z]+\s*=/gi);
  if (handlers) problems.push(`${p}: обработчики on*= в разметке × ${handlers.length}`);
  if (/(href|src|action)\s*=\s*["']\s*javascript:/i.test(body)) problems.push(`${p}: адрес javascript:`);
}

/* 3. Код приложения. */
const SKIP = new Set(['node_modules', 'vendor', 'scripts', 'docs', '.git', 'fonts']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}
const ON_ATTR = /<[a-z][^<>]*\son[a-z]+\s*=/i;
let files = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (rel === 'shared/precache-manifest.js' || /i18n\/(dict|doc|common)\.js$/.test(rel)) continue;
  const src = readFileSync(file, 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: /^\s*(import|export)\b/m.test(src) ? 'module' : 'script', allowHashBang: true }); }
  catch (e) { problems.push(`${rel}: не разобран (${e.message})`); continue; }
  files++;
  const at = (n) => `${rel}:${src.slice(0, n.start).split('\n').length}`;
  simple(ast, {
    CallExpression(n) {
      const c = n.callee;
      if (c.type === 'Identifier' && (c.name === 'eval' || c.name === 'Function')) problems.push(`${at(n)}: ${c.name}(…) запрещён CSP`);
      const timer = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : '';
      if ((timer === 'setTimeout' || timer === 'setInterval') && n.arguments[0]
        && (n.arguments[0].type === 'Literal' || n.arguments[0].type === 'TemplateLiteral')) problems.push(`${at(n)}: ${timer} со строкой`);
      if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'getDocument'
        && !/isEvalSupported\s*:\s*false/.test(src.slice(n.start, n.end))) problems.push(`${at(n)}: pdf.js getDocument без isEvalSupported:false`);
      if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'setAttribute'
        && n.arguments[0] && n.arguments[0].type === 'Literal' && /^on[a-z]+$/i.test(String(n.arguments[0].value))) problems.push(`${at(n)}: setAttribute('${n.arguments[0].value}') — обработчик строкой`);
    },
    NewExpression(n) {
      if (n.callee.type === 'Identifier' && n.callee.name === 'Function') problems.push(`${at(n)}: new Function запрещён CSP`);
    },
    Literal(n) {
      if (typeof n.value === 'string' && ON_ATTR.test(n.value)) problems.push(`${at(n)}: обработчик on*= в строке разметки`);
    },
    TemplateElement(n) {
      if (ON_ATTR.test(n.value.cooked || '')) problems.push(`${at(n)}: обработчик on*= в шаблоне разметки`);
    },
  });
}

/* Сама политика: скрипты — без послаблений. */
if (/script-src[^;]*'unsafe-(inline|eval)'/.test(POLICY)) problems.push("POLICY: script-src с 'unsafe-inline'/'unsafe-eval' обнуляет смысл политики");

console.log(`CSP: страниц ${PAGES.length}, файлов кода ${files}`);
if (problems.length) {
  console.log(`\n✗ Нарушений: ${problems.length}`);
  problems.forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('✓ политика на месте, inline-кода и eval нет');
