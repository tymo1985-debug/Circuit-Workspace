#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-css-vars.mjs
 *
 * ЧТО ЛОВИТ. Переменную вида `var(--x)`, которая на странице нигде не
 * объявлена.
 *
 * ЗАЧЕМ. Неразрешимая `var()` НЕ откатывается к значению по умолчанию —
 * она делает всё объявление недействительным на этапе вычисления. Свойство
 * берётся так, будто его не писали: `border-color` уходит в `currentColor`,
 * то есть в цвет текста. Именно так в «Документах» 24.08.2026 `--line` стоял
 * в двенадцати правилах и не был объявлен нигде: все рамки модуля рисовались
 * чёрными — в тёмной теме невидимыми, в светлой просто «жирнее, чем у
 * соседей». Глазом от замысла не отличить, в консоли пусто, ни один прежний
 * чек этого не видел.
 *
 * Второй случай того же класса — `.ui-lang select` Конгрессов: `var(--card,#fff)`
 * и `var(--accent,#6a45c9)` при необъявленных `--card`/`--accent`. Здесь
 * запасное значение есть, поэтому вёрстка не разваливается — но реальным
 * значением НАВСЕГДА становится запасное, то есть селект был белым всегда,
 * в том числе на тёмной шапке. Такие места выводятся отдельной секцией:
 * это не поломка, а замороженный хардкод мимо палитры.
 *
 *   node scripts/check-css-vars.mjs
 *
 * Коды возврата: 0 — чисто; 1 — есть использование без объявления.
 * Секция «есть запасное значение» кода возврата НЕ меняет: там ничего не
 * сломано, это материал для глаз.
 *
 * ОБЛАСТЬ ВИДИМОСТИ — СТРАНИЦА, А НЕ РЕПОЗИТОРИЙ. Переменная разрешается в
 * браузере на живой странице, поэтому считать надо по каждой странице
 * отдельно: объявление, лежащее в соседнем модуле, не помогает. Область
 * страницы = `shared/*` (его подключают все) + все файлы каталога модуля.
 * Каталог берётся целиком, а не по `src`/`href`: файлы модулей импортируют
 * друг друга (в Конгрессах 14 ES-модулей), и разбор графа импортов дал бы
 * тот же ответ дороже.
 *
 * JS РАЗБИРАЕТСЯ КАК ТЕКСТ — И ЭТО НЕ ЛЕНЬ. CSS в проекте не только в `.css`:
 * `ensureCalendarViewStyles()` Клиндария, `plan-fit.js` и `printing.js`
 * Конгрессов, полоса обновления в `shared/update.js` вставляют стили строкой.
 * Оттуда же берутся и объявления: `style.setProperty('--cw-topbar-h', …)`
 * в Клиндарии — единственный источник этой переменной, и без учёта JS
 * проверка объявила бы её пропавшей.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/** Страницы приложения. Отдельная страница модуля (`register.html`) своей
 *  записи не требует: она лежит в том же каталоге и подключает те же файлы. */
const PAGES = [
  { title: 'Хаб', dir: '' },
  { title: 'Назначения', dir: 'appointments' },
  { title: 'Клиндарий', dir: 'circuit-planner' },
  { title: 'Конгрессы', dir: 'congress-project' },
  { title: 'Документы', dir: 'documents' },
  { title: 'Школа пионеров', dir: 'pioneer-school' },
];

const EXTS = ['.css', '.html', '.js'];
/* `vendor` — чужие библиотеки, положенные в репозиторий как есть (28.08.2026).
   Их переменные объявляет сама библиотека в рантайме: pdf.js, например,
   выставляет `--scale-factor` на контейнере из JS. Разбирать их как код
   модуля значит требовать объявления того, чем мы не управляем, и получать
   красный гейт на месте, где ничего не сломано. Область проверки — код
   проекта, а не всё, что лежит в его папках. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'scripts', 'vendor']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

/** Комментарии `/* … *​/` вырезаются до разбора: в них лежат примеры кода и
 *  отключённые правила, и без этого проверка ловила бы собственную
 *  документацию. Строчные `//` НЕ трогаем — в JS они неотличимы от `https://`
 *  внутри строки, а цена ошибки здесь выше цены пропуска. */
function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Использования: `var(--x)` и `var(--x, запасное)`. Запоминаем, встретилось
 *  ли имя хоть раз БЕЗ запасного значения — именно такое место ломается. */
function collectUsed(text, file, into) {
  const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,?)/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    const hasFallback = m[2] === ',';
    if (!into.has(name)) into.set(name, { bare: false, files: new Set() });
    const rec = into.get(name);
    if (!hasFallback) rec.bare = true;
    rec.files.add(file);
  }
}

/** Объявления: `--x:` в CSS и в строках JS, плюс `setProperty('--x', …)`. */
function collectDeclared(text, into) {
  let m;
  const asProperty = /(--[A-Za-z0-9_-]+)\s*:/g;
  while ((m = asProperty.exec(text))) into.add(m[1]);
  const asSetProperty = /setProperty\(\s*['"`](--[A-Za-z0-9_-]+)/g;
  while ((m = asSetProperty.exec(text))) into.add(m[1]);
}

const sharedFiles = walk(join(ROOT, 'shared'));

let broken = 0;
let frozen = 0;

for (const page of PAGES) {
  const pageFiles = page.dir
    ? walk(join(ROOT, page.dir))
    : readdirSync(ROOT)
        .filter((n) => EXTS.some((e) => n.endsWith(e)))
        .map((n) => join(ROOT, n));

  const files = [...sharedFiles, ...pageFiles];
  const used = new Map();
  const declared = new Set();

  for (const file of files) {
    const text = stripBlockComments(readFileSync(file, 'utf8'));
    collectUsed(text, relative(ROOT, file), used);
    collectDeclared(text, declared);
  }

  const missing = [...used.entries()].filter(([name]) => !declared.has(name));
  const bare = missing.filter(([, rec]) => rec.bare);
  const withFallback = missing.filter(([, rec]) => !rec.bare);

  broken += bare.length;
  frozen += withFallback.length;

  const mark = bare.length ? '✗' : '✓';
  console.log(
    `${mark} ${page.title}: использовано ${used.size}, ` +
      `объявлено ${declared.size}, без объявления ${missing.length}`
  );

  for (const [name, rec] of bare) {
    console.log(`    ✗ ${name} — объявления нет, запасного значения нет`);
    for (const f of rec.files) console.log(`         ${f}`);
  }
  for (const [name, rec] of withFallback) {
    console.log(`    · ${name} — объявления нет, всегда берётся запасное значение`);
    for (const f of rec.files) console.log(`         ${f}`);
  }
}

console.log('');
if (broken) {
  console.log(
    `Переменных без объявления и без запасного значения: ${broken}. ` +
      'Свойства с ними недействительны — цвет берётся из currentColor, ' +
      'размер из значения по умолчанию.'
  );
  process.exit(1);
}
if (frozen) {
  console.log(
    `Провалов нет. Переменных, у которых всегда срабатывает запасное ` +
      `значение: ${frozen} — посмотреть глазами, не хардкод ли это мимо палитры.`
  );
  process.exit(0);
}
console.log('Все использованные CSS-переменные объявлены.');
process.exit(0);
