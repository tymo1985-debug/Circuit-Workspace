#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-lazy-pdf.mjs
 *
 * Тяжёлая сторонняя библиотека, нужная только по кнопке, не грузится при
 * старте модуля. Всё, что модуль догружает по требованию, обязано лежать в
 * прекэше его service worker'а — и не должно возвращаться в разметку.
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
 * ─── ПОЧЕМУ ПРОВЕРКА ПЕРЕПИСАНА 29.08.2026 (находка N-3 повторного аудита) ──
 *
 * Первая редакция была зашита на один модуль:
 *
 *     const APP = read('circuit-planner/app.js');
 *
 * То есть зелёная строка «Ленивая догрузка ПДФ-стека» в сводке относилась к
 * Клиндарию и МОЛЧАЛА про Школу, которая грузит синхронно ~2,9 МБ ПДФ- и
 * Excel-стека — и стала самым тяжёлым модулем проекта именно после того, как
 * библиотеки переехали с CDN в репозиторий. Зелёная строка, отвечающая за
 * один модуль из пяти, хуже отсутствующей: она создаёт впечатление, что класс
 * закрыт целиком.
 *
 * Теперь проверка обходит ВСЕ модули из реестра `shared/version.js` и состоит
 * из двух частей:
 *   1) ХРАПОВИК: тяжёлой сторонней библиотеки в стартовой разметке быть не
 *      должно. Наследие перечислено в DEBT ниже — с причиной и адресом;
 *   2) МЕХАНИЗМ: у модуля, который уже перешёл на догрузку, списки читаются из
 *      его кода и сверяются с прекэшем, разметкой и точками выдачи.
 *
 * ─── ПОЧЕМУ ХРАПОВИК, А НЕ ЗАПРЕТ ──────────────────────────────────────────
 *
 * Перевод Школы на догрузку затрагивает пять трактов выдачи бумаг и делается
 * отдельным выпуском (N-3). Проверка, краснеющая до тех пор, заблокировала бы
 * выпуск N-1 — и её бы отключили в первый же день. Поэтому долг записан
 * явно, вслух и с причиной, а краснеет проверка на НОВОМ тяжёлом файле у
 * любого модуля. Список DEBT можно только СОКРАЩАТЬ: перевели Школу — убрали
 * запись, и храповик затянулся.
 *
 *   node scripts/check-lazy-pdf.mjs
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
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

/* --- Что считается тяжёлым ассетом -------------------------------------- */

/**
 * Признак — не размер сам по себе, а СТОРОННОСТЬ плюс размер.
 *
 * Собственный код модуля (`app.js`, `i18n/dict.js`) тоже бывает крупным —
 * у Клиндария 412 КБ, — но он нужен на старте по определению: без него нет
 * модуля. По кнопке догружают чужие библиотеки и шрифтовые бандлы, и только
 * их. Поэтому предмет проверки — `shared/vendor/**` и любой каталог `fonts/`.
 *
 * Порог 60 КБ отделяет стек выдачи бумаг от мелких плагинов, которые дешевле
 * подключить сразу, чем городить вокруг них догрузку.
 */
const THRESHOLD = 60 * 1024;
const isVendor = (p) => /(^|\/)(vendor|fonts)\//.test(p);

/**
 * Наследие на 29.08.2026 — тяжёлые файлы, УЖЕ стоящие в стартовой разметке.
 * СПИСОК ТОЛЬКО СОКРАЩАЕТСЯ. Добавить сюда новый файл вместо того, чтобы
 * завести догрузку, — значит отменить смысл проверки.
 *
 * pioneer-school: ~2,9 МБ ПДФ/Excel-стека, нужного только при выгрузке PDF,
 * импорте PDF и экспорте Excel. Разбирается при КАЖДОМ открытии модуля.
 * Закрывается переносом `App.pdf` в общий слой (`shared/pdfstack.js`) —
 * находка N-3 отчёта `docs/audit/02-recheck.md`, отдельный выпуск.
 */
const DEBT = {
  'pioneer-school': [
    '../shared/vendor/jspdf.umd.min.js',
    '../shared/vendor/pdf.min.js',
    '../shared/vendor/xlsx.full.min.js',
    '../shared/vendor/pdf-lib.min.js',
    '../shared/vendor/fontkit.umd.min.js',
    'js/export/fonts/dejavu-sans-subset.js',
    'js/export/fonts/dejavu-form-b64.js',
  ],
};

/* --- Модули берутся из реестра, а не из списка здесь --------------------- */
/* Зашитый список — ровно та ошибка, ради которой проверка переписана: новый
   модуль появился бы в проекте и не появился бы в проверке. */
const registry = read('shared/version.js');
const MODULES = [...registry.matchAll(/^\s*'([a-z-]+)':\s*\{\s*title:/gm)].map((m) => m[1])
  .filter((id) => existsSync(join(ROOT, id, 'index.html')));

console.log('\nМодули из реестра');
ok('реестр модулей прочитан', MODULES.length >= 5, 'найдено ' + MODULES.length
  + ' — разбор shared/version.js сломался, и проверка обходит не все модули');

const sizeOf = (p) => { try { return statSync(join(ROOT, p)).size; } catch (e) { return 0; } };
const fromModule = (id, src) => normalize(join(id, src)).split('\\').join('/');
const scriptsOf = (html) => [...html.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);

/* --- 1. Храповик: тяжёлого стороннего в стартовой разметке нет ----------- */
console.log('\nСтартовая загрузка модулей');

let debtBytes = 0;
MODULES.forEach((id) => {
  const html = read(id + '/index.html');
  const srcs = scriptsOf(html);
  const heavy = srcs
    .map((src) => ({ src, path: fromModule(id, src) }))
    .filter((f) => isVendor(f.path) && sizeOf(f.path) >= THRESHOLD);

  const allowed = DEBT[id] || [];
  const strangers = heavy.filter((f) => allowed.indexOf(f.src) < 0);
  const kb = (n) => Math.round(n / 1024) + ' КБ';
  const total = heavy.reduce((s, f) => s + sizeOf(f.path), 0);

  strangers.forEach((f) => {
    ok(id + ': ' + f.src + ' не в стартовой разметке', false,
      kb(sizeOf(f.path)) + ' сторонней библиотеки разбирается при каждом открытии модуля. '
      + 'Тяжёлый ассет, нужный по кнопке, подключается догрузкой (образец — App.pdf в '
      + 'circuit-planner/app.js), а не тегом <script>');
  });

  if (!heavy.length) {
    console.log('  ✓ ' + id + ': тяжёлого стороннего в стартовой разметке нет');
  } else if (!strangers.length) {
    /* НЕ провал: долг записан и назван. Но и не тишина — иначе список DEBT
       начнёт врать, а зелёная строка снова станет создавать впечатление,
       что класс закрыт целиком. */
    debtBytes += total;
    console.log('  · ' + id + ': ' + kb(total) + ' записанного долга ('
      + heavy.length + ' файлов) — см. DEBT и N-3');
  }

  /* Долг, который свели, а строку убрать забыли. */
  const stale = allowed.filter((src) => srcs.indexOf(src) < 0);
  if (stale.length) console.log('  · ' + id + ': сведены, можно убрать из DEBT: ' + stale.join(', '));
});
if (debtBytes) console.log('  · всего записанного долга: ' + Math.round(debtBytes / 1024) + ' КБ');

/* --- 2. Механизм догрузки у тех, кто на неё перешёл ---------------------- */
/* Модуль считается перешедшим, если в его коде есть блок `pdf: {` с путями.
   Список модулей здесь не зашит: перевели Школу — раздел начнёт проверять и
   её, ничего не правя. */

/** Найти блок `pdf: {` и вернуть его текст по балансу скобок. */
function pdfBlock(src) {
  const at = src.indexOf('pdf: {');
  if (at < 0) return null;
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(at, i + 1); }
  }
  return null;
}

const APP_FILES = ['app.js', 'js/app.js', 'js/main.js'];
const SW_FILES = ['sw.js', 'service-worker.js'];

let mechanisms = 0;
MODULES.forEach((id) => {
  const appPath = APP_FILES.map((f) => id + '/' + f).find((p) => existsSync(join(ROOT, p)));
  if (!appPath) return;
  const APP = read(appPath);
  const block = pdfBlock(APP);
  if (!block) return;

  const files = [...block.matchAll(/'([^']*\.js)'/g)].map((m) => m[1]);
  if (!files.length) return;
  mechanisms += 1;

  console.log('\nДогрузка: ' + id);
  const HTML = read(id + '/index.html');
  const swPath = SW_FILES.map((f) => id + '/' + f).find((p) => existsSync(join(ROOT, p)));
  ok('service worker найден', !!swPath, 'догружаемые файлы негде проверить на прекэш');
  const SW = swPath ? read(swPath) : '';

  ok('в списках догрузки есть файлы', files.length >= 8, 'найдено ' + files.length);

  files.forEach((src) => {
    const rel = fromModule(id, src);
    ok(src + ': файл существует', existsSync(join(ROOT, rel)), rel);
    /* Сверка по имени файла, а не по строке пути: прекэш записан с `../` и
       `./`, и сравнение строк ловило бы форму записи вместо сути — та же
       причина, что в check-shared-precache.mjs. */
    const name = src.split('/').pop();
    ok(src + ': в прекэше', SW.includes(name),
      'догружается по требованию, но не кэшируется — выдача PDF умрёт при первой '
      + 'попытке без сети, а у того, кто правил, файл будет в браузерном кэше');
    const tag = new RegExp('<script[^>]*src\\s*=\\s*["\'][^"\']*' + name.replace(/\./g, '\\.') + '["\']', 'i');
    ok(src + ': нет тега в разметке', !tag.test(HTML),
      'вернулся в стартовую разметку — модуль снова разбирает его при каждом открытии, '
      + 'и вся ленивая догрузка отменена');
  });

  /* --- Точки выдачи действительно ждут стек ----------------------------- */
  /* Имена сборщиков НЕ зашиты: они собираются из самих вызовов. Зашитый
     список пропустил бы первый же новый тракт выдачи — а именно он и вызвал бы
     сборщик на неподготовленном стеке, получив тост «модуль ещё не загрузился»
     вместо бумаги. */
  const calls = [...APP.matchAll(/(?:this|App\.ui)\.(build\w*Pdf\w*)\s*\(/g)];
  const builders = [...new Set(calls.map((m) => m[1]))];
  ok('сборщики PDF найдены', builders.length > 0,
    'ни одного вызова build*Pdf* — либо тракты выдачи переименованы, либо разбор сломался');

  builders.forEach((fn) => {
    let bare = 0;
    const own = calls.filter((m) => m[1] === fn);
    own.forEach((m) => {
      /* Подготовку ищем не в окне фиксированной длины, а от НАЧАЛА объемлющей
         функции: обработчик отправки письма готовит стек за шесть десятков
         строк до вызова, и короткое окно объявило бы его незащищённым.
         Границей служит ближайший назад признак начала функции. */
      const head = APP.slice(0, m.index);
      const bounds = [
        head.lastIndexOf('addEventListener('),
        head.lastIndexOf('\n      async '),
        ...[...head.matchAll(/\n      [a-zA-Z][\w]*\s*\(/g)].map((x) => x.index),
      ].filter((i) => i >= 0);
      const from = bounds.length ? Math.max(...bounds) : Math.max(0, m.index - 400);
      if (!/\.pdf\.ensure\(/.test(APP.slice(from, m.index))) bare += 1;
    });
    ok(fn + ': каждый вызов после pdf.ensure()', bare === 0,
      'вызовов ' + own.length + ', без подготовки стека ' + bare);
  });
});

/* Механизм обязан существовать хотя бы у одного модуля: если разбор блока
   `pdf: {` однажды сломается, вся вторая половина проверки замолчит, а сводка
   останется зелёной — ровно тот отказ, ради которого проверка переписана. */
console.log('');
ok('механизм догрузки найден хотя бы у одного модуля', mechanisms > 0,
  'ни одного блока `pdf: {` — догрузка исчезла, переехала или разбор сломался');

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nТяжёлые ассеты догружаются по требованию; долг записан явно.');
process.exit(failed ? 1 : 0);
