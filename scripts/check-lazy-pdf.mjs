#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-lazy-pdf.mjs
 *
 * Всё, что Клиндарий догружает по требованию, обязано лежать в прекэше его
 * service worker'а — и не должно возвращаться в стартовую разметку.
 *
 * ─── ЗАЧЕМ ─────────────────────────────────────────────────────────────────
 *
 * 29.08.2026 десять файлов ПДФ-стека (~3,4 МБ) убраны из `<script>` в
 * `circuit-planner/index.html` и переведены на `App.pdf.ensure()`. Кэш снимал
 * загрузку по сети, но не снимал разбор и компиляцию — эту цену телефон
 * платил при каждом открытии модуля.
 *
 * Правка создала связь, которую больше ничто не сторожит: файл, который
 * догружается из JS, невидим для `check-shared-precache.mjs` (тот разбирает
 * разметку). Убери такой файл из прекэша — и всё будет работать ровно до
 * первой выдачи PDF без сети. Отказ отложенный и тихий: у того, кто правил,
 * файл лежит в браузерном кэше.
 *
 * Обратная сторона тоже проверяется: вернувшийся в разметку `<script>` молча
 * отменил бы всю правку, и модуль снова стал бы разбирать 3,4 МБ на старте.
 *
 *   node scripts/check-lazy-pdf.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

const APP = read('circuit-planner/app.js');
const HTML = read('circuit-planner/index.html');
const SW = read('circuit-planner/sw.js');

/* --- 1. Списки читаются из кода, а не дублируются здесь ----------------- */
console.log('\nСписки догрузки');

/* Берётся блок App.pdf целиком, из него — все строковые пути. Разбирать
   объект по имени поля хрупко: добавят четвёртый набор и забудут про него
   здесь. Всё, что перечислено внутри блока, считается догружаемым. */
const start = APP.indexOf('    pdf: {');
const end = APP.indexOf('\n    utils: {', start);
ok('блок App.pdf найден', start > 0 && end > start,
  'ленивая догрузка исчезла или переехала — проверка потеряла предмет');
if (start < 0 || end < start) process.exit(1);

const block = APP.slice(start, end);
const files = [...block.matchAll(/'([^']*\.js)'/g)].map((m) => m[1]);
ok('в списках есть файлы', files.length >= 8, 'найдено ' + files.length);

/* Путь в коде — относительно circuit-planner/. Приводим к пути от корня
   монорепо, чтобы сверить и с диском, и с прекэшем. */
const fromRoot = (p) => normalize(join('circuit-planner', p)).split('\\').join('/');

files.forEach((src) => {
  ok(src + ': файл существует', existsSync(join(ROOT, fromRoot(src))), fromRoot(src));
});

/* --- 2. Всё догружаемое лежит в прекэше --------------------------------- */
console.log('\nПрекэш service worker\'а');
files.forEach((src) => {
  /* Сверка по имени файла, а не по строке пути: прекэш записан с `../` и
     `./`, и сравнение строк ловило бы форму записи вместо сути — та же
     причина, что в check-shared-precache.mjs. */
  const name = src.split('/').pop();
  ok(src + ': в прекэше', SW.includes(name),
    'догружается по требованию, но не кэшируется — выдача PDF умрёт при первой '
    + 'попытке без сети, а у того, кто правил, файл будет в браузерном кэше');
});

/* --- 3. В разметку они не вернулись ------------------------------------- */
console.log('\nСтартовая разметка');
files.forEach((src) => {
  const name = src.split('/').pop();
  const tag = new RegExp('<script[^>]*src\\s*=\\s*["\'][^"\']*' + name.replace(/\./g, '\\.') + '["\']', 'i');
  ok(src + ': нет тега в разметке', !tag.test(HTML),
    'вернулся в стартовую разметку — модуль снова разбирает его при каждом открытии, '
    + 'и вся ленивая догрузка отменена');
});

/* --- 4. Точки выдачи действительно ждут стек ---------------------------- */
console.log('\nТочки выдачи');
const BUILDERS = ['buildVisitPdfDoc', 'buildLetterPdfDoc', 'buildS302Pdf'];
BUILDERS.forEach((fn) => {
  /* Считаем ВЫЗОВЫ (не объявление) и требуем, чтобы перед каждым в пределах
     нескольких строк стояло ожидание стека. Иначе первый же новый тракт
     выдачи вызовет сборщик на неподготовленном стеке и получит тост
     «модуль ещё не загрузился» вместо бумаги. */
  const calls = [...APP.matchAll(new RegExp('(?:this|App\\.ui)\\.' + fn + '\\s*\\(', 'g'))];
  let bare = 0;
  calls.forEach((m) => {
    /* Ищем подготовку не в окне фиксированной длины, а от НАЧАЛА объемлющей
       функции: обработчик отправки письма готовит стек за шесть десятков строк
       до вызова, и короткое окно объявило бы его незащищённым. Границей служит
       ближайший назад признак начала функции — обработчик события или объявление
       метода объекта с отступом в шесть пробелов. */
    const head = APP.slice(0, m.index);
    const bounds = [
      head.lastIndexOf('addEventListener('),
      head.lastIndexOf('\n      async '),
      ...[...head.matchAll(/\n      [a-zA-Z][\w]*\s*\(/g)].map((x) => x.index),
    ].filter((i) => i >= 0);
    const from = bounds.length ? Math.max(...bounds) : Math.max(0, m.index - 400);
    if (!/App\.pdf\.ensure\(/.test(APP.slice(from, m.index))) bare += 1;
  });
  ok(fn + ': каждый вызов после App.pdf.ensure()', calls.length > 0 && bare === 0,
    'вызовов ' + calls.length + ', без подготовки стека ' + bare);
});

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nЛенивая догрузка ПДФ-стека связана с прекэшем и разметкой.');
process.exit(failed ? 1 : 0);
