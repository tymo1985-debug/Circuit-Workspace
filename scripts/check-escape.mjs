#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-escape.mjs
 *
 * Экранирование значения перед подстановкой в разметку живёт в ОДНОМ месте и
 * действительно срабатывает там, где результат уходит в разметку.
 *
 * ─── ПОЧЕМУ ЭТО В ГЕЙТЕ ────────────────────────────────────────────────────
 *
 * До 28.08.2026 функция существовала в шести редакциях, и они РАСХОДИЛИСЬ:
 * три экранировали апостроф, три нет. Расхождение опаснее дубля: код,
 * написанный в расчёте на строгую редакцию, при переносе в соседний модуль
 * молча оказывался на слабой. А значение, подставленное в атрибут с
 * одинарными кавычками, без экранирования апострофа разрывает атрибут.
 *
 * Седьмая редакция появится тихо — кто-то напишет местный `esc()` и не
 * заметит, что общий уже есть. Проверка ловит именно это.
 *
 * Вторая половина — про `CWTemplates.render()`. Значения приходят из
 * пользовательских данных, а два пути попадания внешние: восстановление копии
 * (файл ездит почтой) и импорт PDF. Результат html-шаблона уходит в
 * `innerHTML` и в `document.write` окна печати, а оно того же origin, с
 * доступом к `opener`. Название собрания вида `<img src=x onerror="…">`
 * исполнялось при первом же предпросмотре письма.
 *
 *   node scripts/check-escape.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

/* --- 1. Общая функция существует и экранирует надмножество -------------- */
console.log('\nОбщая функция экранирования');
const escPath = join(ROOT, 'shared/escape.js');
ok('shared/escape.js на месте', existsSync(escPath));
if (!existsSync(escPath)) process.exit(1);

const ctx = vm.createContext({ self: {} });
vm.runInContext(readFileSync(escPath, 'utf8'), ctx, { filename: 'shared/escape.js' });
const CWEscape = ctx.self.CWEscape;
ok('CWEscape.html объявлен', typeof CWEscape?.html === 'function');
ok('CWEscape.attr объявлен', typeof CWEscape?.attr === 'function');

/* Набор — объединение того, что экранировали все шесть прежних редакций.
   Апостроф здесь ключевой: без него значение в `title='…'` разрывает атрибут. */
const MUST = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
Object.keys(MUST).forEach((ch) => {
  ok('экранирует ' + JSON.stringify(ch), CWEscape.html(ch) === MUST[ch], CWEscape.html(ch));
});
ok('амперсанд обрабатывается первым',
  CWEscape.html('<') === '&lt;',
  'иначе &lt; превращается в &amp;lt; и на экране появляется сам текст');
ok('пустое значение не даёт "null"/"undefined"',
  CWEscape.html(null) === '' && CWEscape.html(undefined) === '');
ok('реальная атака обезврежена',
  CWEscape.html('<img src=x onerror="alert(1)">').indexOf('<') < 0);

/* --- 2. Седьмой редакции нет -------------------------------------------- */
console.log('\nМестных редакций не осталось');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'scripts', 'vendor']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js') || p.endsWith('.html')) out.push(p);
  }
  return out;
}
/* Признак собственной реализации — таблица замен прямо в коде: подстрока
   `&amp;` рядом с `&lt;`. Искать по имени функции бессмысленно: они звались
   escapeHtml, escapeText, esc — и следующая назовётся ещё как-нибудь. */
const OWN = /&amp;[\s\S]{0,120}&lt;/;
walk(ROOT).forEach((file) => {
  const rel = relative(ROOT, file);
  if (rel === 'shared/escape.js') return;           // единственное законное место
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (!OWN.test(src)) return;
  ok(rel + ': нет своей таблицы замен', false,
    'экранирование живёт в shared/escape.js; местная редакция разойдётся с ней молча');
});
if (!failed) console.log('  ✓ ни одного местного набора замен вне общего слоя');

/* --- 3. Шаблоны: значения экранируются там, где результат идёт в разметку */
console.log('\nПодстановка в html-шаблон');
const tplCtx = vm.createContext({ self: {}, console });
vm.runInContext(readFileSync(escPath, 'utf8'), tplCtx, { filename: 'shared/escape.js' });
/* Реестр пространств лежит отдельным файлом и на живой странице подключается
   рядом. Без него движок по правилу 1 вернул бы токен как есть, и проверка
   «значение обезврежено» прошла бы просто потому, что подстановки не было. */
vm.runInContext(readFileSync(join(ROOT, 'shared/templates/namespaces.js'), 'utf8'), tplCtx, { filename: 'shared/templates/namespaces.js' });
vm.runInContext(readFileSync(join(ROOT, 'shared/templates.js'), 'utf8'), tplCtx, { filename: 'shared/templates.js' });
const CWTemplates = tplCtx.self.CWTemplates;
ok('CWTemplates доступен', typeof CWTemplates?.render === 'function');

const EVIL = '<img src=x onerror="alert(1)">';
/* Пространство берётся РЕАЛЬНОЕ (`sender` объявлено в shared/templates/namespaces.js):
   на выдуманном движок по правилу 1 вернул бы токен как есть, и проверка
   «значение обезврежено» прошла бы просто потому, что подстановки не было. */
const data = { sender: { name: EVIL } };
const plain = CWTemplates.render('{{sender.name}}', data);
const safe = CWTemplates.render('{{sender.name}}', data, { escape: true });
ok('без флага поведение прежнее', plain.indexOf('<img') >= 0,
  'текстовые шаблоны прогоняют результат через экранирование сами; двойное дало бы &amp; на бумаге');
ok('с флагом значение обезврежено', safe.indexOf('<img') < 0 && safe.indexOf('&lt;img') >= 0, safe);
ok('шаблон при этом НЕ тронут',
  CWTemplates.render('<b>{{sender.name}}</b>', data, { escape: true }).indexOf('<b>') === 0,
  'шаблон — авторская разметка пользователя, экранируются только значения');

/* --- 4. Вызывающие, чей результат идёт в разметку, флаг ставят ---------- */
console.log('\nВызывающие с выводом в разметку');
const CALLERS = [
  { file: 'circuit-planner/app.js', fn: 'substitutePlaceholders',
    why: 'результат уходит в innerHTML предпросмотра и в document.write окна печати (тот же origin, доступ к opener)' },
  { file: 'documents/js/app.js', fn: 'renderPreview',
    why: 'результат уходит в innerHTML предпросмотра' },
];
CALLERS.forEach((c) => {
  const src = readFileSync(join(ROOT, c.file), 'utf8');
  /* Ищется КАЖДЫЙ вызов render() в файле, и рядом с ним — флаг. Привязка к
     имени функции не годится: она встречается и в комментариях, и первое
     вхождение может оказаться не тем. */
  let checked = 0;
  let bare = 0;
  const CALL = /CWTemplates\.render\s*\(/g;
  let hit;
  while ((hit = CALL.exec(src)) !== null) {
    checked++;
    const tail = src.slice(hit.index, hit.index + 300);
    if (!/escape/.test(tail.slice(0, tail.indexOf(';') + 1 || 300))) bare++;
  }
  ok(c.file + ': каждый render() просит экранирование', checked > 0 && bare === 0,
    'вызовов ' + checked + ', без флага ' + bare + '. ' + c.why);
});

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nЭкранирование сведено в один слой и применяется там, где нужно.');
process.exit(failed ? 1 : 0);
