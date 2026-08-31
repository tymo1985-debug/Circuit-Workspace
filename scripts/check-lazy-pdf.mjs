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

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { parse } from 'acorn';
import { ancestor } from 'acorn-walk';

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
 * Наследие — тяжёлые файлы, которым РАЗРЕШЕНО стоять в стартовой разметке.
 *
 * ПУСТ С 30.08.2026, ХРАПОВИК ЗАТЯНУТ. Единственная запись — 2913 КБ Школы
 * пионеров, семь файлов ПДФ/Excel-стека — снята вместе с переводом модуля на
 * догрузку (находка N-3 отчёта `docs/audit/02-recheck.md`). С этого момента
 * любой новый тяжёлый файл в стартовой разметке любого модуля краснит гейт.
 *
 * Добавить сюда файл вместо того, чтобы завести догрузку, — значит отменить
 * смысл проверки. Список можно только сокращать.
 */
const DEBT = {};

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
const pagesOf = (id) => readdirSync(join(ROOT, id)).filter((f) => f.endsWith('.html')).sort();

/* --- 1. Храповик: тяжёлого стороннего в стартовой разметке нет ----------- */
console.log('\nСтартовая загрузка модулей');

let debtBytes = 0;
MODULES.forEach((id) => {
  const allowed = DEBT[id] || [];
  let heavyTotal = 0;
  let heavyCount = 0;

  /* Все страницы модуля, а не только index.html: тракт выдачи может жить и на
     второй странице — так у Школы жила выгрузка PDF публичной анкеты
     (register.html), и храповик её не видел. */
  pagesOf(id).forEach((page) => {
    const heavy = scriptsOf(read(id + '/' + page))
      .map((src) => ({ src, path: fromModule(id, src) }))
      .filter((f) => isVendor(f.path) && sizeOf(f.path) >= THRESHOLD);

    heavy.forEach((f) => {
      heavyTotal += sizeOf(f.path);
      heavyCount += 1;
      if (allowed.indexOf(f.src) >= 0) return;
      ok(id + '/' + page + ': ' + f.src + ' не в стартовой разметке', false,
        Math.round(sizeOf(f.path) / 1024) + ' КБ сторонней библиотеки разбирается при каждом '
        + 'открытии страницы. Тяжёлый ассет, нужный по кнопке, подключается догрузкой '
        + '(образец — shared/pdfstack.js), а не тегом <script>');
    });
  });

  if (!heavyCount) {
    console.log('  ✓ ' + id + ': тяжёлого стороннего в стартовой разметке нет');
  } else if (allowed.length) {
    /* НЕ провал: долг записан и назван. Но и не тишина — иначе список DEBT
       начнёт врать, а зелёная строка снова станет создавать впечатление,
       что класс закрыт целиком. */
    debtBytes += heavyTotal;
    console.log('  · ' + id + ': ' + Math.round(heavyTotal / 1024) + ' КБ записанного долга ('
      + heavyCount + ' файлов) — см. DEBT');
  }

  /* Долг, который свели, а строку убрать забыли. */
  const inMarkup = new Set(pagesOf(id).flatMap((page) => scriptsOf(read(id + '/' + page))));
  const stale = allowed.filter((src) => !inMarkup.has(src));
  if (stale.length) console.log('  · ' + id + ': сведены, можно убрать из DEBT: ' + stale.join(', '));
});
if (debtBytes) console.log('  · всего записанного долга: ' + Math.round(debtBytes / 1024) + ' КБ');

/* --- 2. Механизм догрузки у тех, кто на него перешёл --------------------- */

/**
 * ЧЕМ ЗАМЕНЕНЫ ПРЕЖНИЕ ОПОЗНАВАТЕЛЬНЫЕ ПРИЗНАКИ (30.08.2026).
 *
 * Механизм переехал в общий слой (`shared/pdfstack.js`), и старые приметы
 * исчезли: блока `pdf: {` в коде Клиндария больше нет, а у Школы его не было
 * никогда. Было → стало:
 *
 *   блок `pdf: {` по балансу скобок  → `SETS: {` рядом с `CWPdfStack`;
 *   имена сборщиков `build\w*Pdf\w*` → они же ПЛЮС имена, которые определяют
 *                                      сами лениво догружаемые файлы модуля;
 *   граница функции по отступу       → разбор acorn.
 *
 * Последнее — не украшательство. Прежняя граница искалась по строке из шести
 * пробелов: это разметка `circuit-planner/app.js` и ничья больше. На файле
 * Школы, где обработчики лежат на двух пробелах, она молча объявляла бы
 * защищённым что угодно — то есть проверка бы замолчала ровно там, где её
 * впервые применили ко второму модулю.
 */

const LOADER = 'shared/pdfstack.js';
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const BUILDER = /^build\w*Pdf\w*$/;

/** Текст блока от `marker` до парной скобки. */
function block(src, marker, open, close) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  let depth = 0;
  for (let i = src.indexOf(open, at); i >= 0 && i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) { depth--; if (!depth) return src.slice(at, i + 1); }
  }
  return null;
}

/** Имя объемлющей функции — для правила «а это сам сборщик». */
function functionName(fn, parents) {
  if (fn.id && fn.id.name) return fn.id.name;
  const idx = parents.indexOf(fn);
  const parent = idx > 0 ? parents[idx - 1] : null;
  if (!parent) return null;
  if (parent.type === 'Property' && parent.key) return parent.key.name || parent.key.value;
  if (parent.type === 'MethodDefinition' && parent.key) return parent.key.name;
  if (parent.type === 'VariableDeclarator' && parent.id) return parent.id.name;
  return null;
}

/* Модуль считается перешедшим, если хоть одна его страница подключает общий
   загрузчик. Список модулей здесь не зашит: подключил новый модуль — раздел
   начнёт проверять и его, ничего не правя. */
const LAZY = MODULES.filter((id) => pagesOf(id)
  .some((page) => scriptsOf(read(id + '/' + page)).some((s) => s.endsWith('pdfstack.js'))));

console.log('');
ok('хотя бы один модуль перешёл на догрузку', LAZY.length > 0,
  'ни одна страница не подключает ' + LOADER + ' — догрузка исчезла, переехала '
  + 'или разбор разметки сломался');

LAZY.forEach((id) => {
  console.log('\nДогрузка: ' + id);
  const pages = pagesOf(id);
  const markup = pages.map((f) => read(id + '/' + f)).join('\n');
  const inMarkup = new Set(pages.flatMap((f) => scriptsOf(read(id + '/' + f))));

  const swPath = ['sw.js', 'service-worker.js'].map((f) => id + '/' + f).find((f) => existsSync(join(ROOT, f)));
  ok('service worker найден', !!swPath, 'догружаемые файлы негде проверить на прекэш');
  const SW = swPath ? read(swPath) : '';

  /* Сам загрузчик крошечный, но без него не стартует ни один тракт выдачи. */
  /* Ищется ИМЕННО общий загрузчик, а не подстрока «pdfstack.js»: у Школы
     рядом лежит собственный js/pdfstack.js с наборами, и по короткой
     подстроке проверка проходила бы даже с выпавшим общим слоем — дыра
     найдена прогоном на сломанном входе 30.08.2026. */
  ok(LOADER + ': в прекэше', /['"][^'"]*shared\/pdfstack\.js['"]/.test(SW),
    'офлайн-запуск оставит модуль без единой кнопки выдачи бумаги');

  /* Найдено живым прогоном 31.08.2026, не статикой: файл лежал в прекэше
     (проверка выше проходила), но тег в разметке отсутствовал — при переносе
     N-3 на новый HEAD был подключён только собственный js/pdfstack.js
     модуля, а общий shared/pdfstack.js забыт. LAZY определяет модуль как
     перешедший по ЛЮБОМУ файлу, оканчивающемуся на pdfstack.js — то же имя
     совпадение позволило считать общий загрузчик подключённым, хотя
     подключён был только локальный. Проверка ниже сверяет ИМЕННО общий
     загрузчик, а не факт присутствия чего-то похожего по имени. */
  ok(LOADER + ': тег в разметке', /['"][^'"]*shared\/pdfstack\.js['"]/.test(markup),
    'CWPdfStack не появится в странице ни при каком ensure() — набор будет '
    + 'висеть на первом же script() без исполнителя');

  /* --- Где лежат списки ------------------------------------------------- */
  /* Файл ищется по СОДЕРЖИМОМУ среди собственных скриптов модуля, а не по
     имени: у Клиндария наборы лежат в app.js, у Школы — в отдельном
     js/pdfstack.js, и зашитый список пропустил бы третий вариант. */
  const ownScripts = [...inMarkup]
    .filter((src) => src.endsWith('.js') && !src.startsWith('../'))
    .map((src) => fromModule(id, src))
    .filter((f) => existsSync(join(ROOT, f)));

  const cfgPath = ownScripts.find((f) => {
    const src = read(f);
    return src.includes('SETS: {') && src.includes('CWPdfStack');
  });
  ok('конфигурация наборов найдена', !!cfgPath,
    'ни один собственный скрипт модуля не содержит SETS рядом с CWPdfStack — '
    + 'списки переименованы, переехали или разбор сломался');
  if (!cfgPath) return;
  console.log('  · списки читаются из ' + cfgPath);

  const CFG = read(cfgPath);
  const files = [...new Set([
    ...[...(block(CFG, 'SETS: {', '{', '}') || '').matchAll(/'([^']*\.js)'/g)].map((m) => m[1]),
    ...[...(block(CFG, 'FONTS: [', '[', ']') || '').matchAll(/'([^']*\.js)'/g)].map((m) => m[1]),
  ])];

  /* Порог — страховка от «разбор ничего не нашёл», а не смысловое правило.
     Прежние 8 были рассчитаны на единственный тогда модуль; теперь проверка
     идёт по каждому отдельно, и порог обязан помещаться в самый маленький
     набор (у Школы их четыре, минимальный из двух файлов). Опускать ниже
     трёх без такой же явной причины нельзя. */
  ok('в списках догрузки есть файлы', files.length >= 3, 'найдено ' + files.length);

  files.forEach((src) => {
    const rel = fromModule(id, src);
    ok(src + ': файл существует', existsSync(join(ROOT, rel)), rel);
    /* Сверка по ИМЕНИ файла, а не по строке пути: прекэш записан с `../` и
       `./`, и сравнение строк ловило бы форму записи вместо сути — та же
       причина, что в check-shared-precache.mjs. */
    const name = src.split('/').pop();
    ok(src + ': в прекэше', SW.includes(name),
      'догружается по требованию, но не кэшируется — выдача PDF умрёт при первой '
      + 'попытке без сети, а у того, кто правил, файл будет в браузерном кэше');
    const tag = new RegExp('<script[^>]*src\\s*=\\s*["\'][^"\']*' + name.replace(/\./g, '\\.') + '["\']', 'i');
    ok(src + ': нет тега в разметке', !tag.test(markup),
      'вернулся в стартовую разметку — модуль снова разбирает его при каждом открытии, '
      + 'и вся ленивая догрузка отменена');
  });

  /* --- Имена, которых до догрузки в странице просто нет ------------------ */
  /* Собираются из самих лениво загружаемых файлов модуля, а не из списка:
     зашитый список пропустил бы первый же новый тракт выдачи — а именно он и
     позвал бы сборщик на неподготовленном стеке. */
  const lazyNames = new Set();
  files.filter((src) => !src.startsWith('../')).forEach((src) => {
    const rel = fromModule(id, src);
    if (!existsSync(join(ROOT, rel))) return;
    /* Отступ перед `window.X =` допускается: у Клиндария экспорт
       PdfGenerator стоит внутри IIFE и сдвинут на два пробела, и
       якорь строго по началу строки его молча терял. */
    for (const m of read(rel).matchAll(/^\s*(?:window|self)\.(\w+)\s*=/gm)) lazyNames.add(m[1]);
  });
  if (lazyNames.size) console.log('  · лениво определяемые имена: ' + [...lazyNames].join(', '));

  /* --- Точки выдачи действительно ждут стек ------------------------------ */
  const eager = ownScripts.filter((f) => !files.some((src) => fromModule(id, src) === f));
  let guarded = 0;
  const bare = [];

  eager.forEach((path) => {
    const src = read(path);
    let ast;
    try {
      ast = parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
    } catch (err) {
      ok(path + ': разбирается acorn', false, err.message);
      return;
    }

    const hits = [];
    ancestor(ast, {
      Identifier(node, state, parents) {
        if (lazyNames.has(node.name)) hits.push({ node, parents: [...parents] });
      },
      MemberExpression(node, state, parents) {
        if (!node.property || node.computed) return;
        /* Имена сборщиков собираются из самих вызовов, а не берутся из
           списка: зашитый список пропустил бы первый же новый тракт. */
        if (BUILDER.test(node.property.name || '')) { hits.push({ node, parents: [...parents] }); return; }
        /* И отдельно — `window.PdfGenerator`. Обходчик acorn-walk НЕ заходит
           в имя свойства при точечном доступе, поэтому визитёр Identifier
           выше видит только `PdfExport.foo`, но не `window.PdfExport`. Без
           этой ветки половина обращений к лениво определяемым именам была бы
           невидима — и правило ниже проверяло бы их отсутствие. */
        if (lazyNames.has(node.property.name)) hits.push({ node, parents: [...parents] });
      },
    });

    hits.forEach(({ node, parents }) => {
      const idx = parents.indexOf(node);
      const parent = idx > 0 ? parents[idx - 1] : null;
      const grand = idx > 1 ? parents[idx - 2] : null;

      /* Объявление самого имени (`window.PdfExport = PdfExport`, `const
         PdfExport = {...}`) точкой выдачи не является. */
      if (parent && parent.type === 'AssignmentExpression' && parent.left === node) return;
      if (parent && parent.type === 'VariableDeclarator' && parent.id === node) return;
      if (parent && parent.type === 'MemberExpression' && parent.property === node
          && grand && grand.type === 'AssignmentExpression' && grand.left === parent) return;

      const fn = [...parents].reverse().find((n) => FUNCTION_TYPES.has(n.type));
      if (!fn) {
        const line = src.slice(0, node.start).split('\n').length;
        bare.push(path + ':' + line + ' (вне функции)');
        return;
      }

      /* Граница — НАЧАЛО объемлющей функции, а не окно фиксированной длины:
         обработчик отправки письма готовит стек за шесть десятков строк до
         вызова, и короткое окно объявляло бы его незащищённым — первая же
         редакция этой проверки на этом и споткнулась. */
      if (/\.ensure\s*\(/.test(src.slice(fn.start, node.start))) { guarded += 1; return; }

      /* Второй способ быть защищённым: имя используется внутри сборщика,
         каждый вызов которого проверен этим же правилом. Так у Клиндария
         window.PdfGenerator живёт внутри buildVisitPdfDoc(). */
      if (BUILDER.test(functionName(fn, parents) || '')) { guarded += 1; return; }

      const line = src.slice(0, node.start).split('\n').length;
      bare.push(path + ':' + line + ' — ' + (node.name || node.property.name));
    });
  });

  ok('точки выдачи бумаги найдены', guarded + bare.length > 0,
    'ни одной ссылки на лениво определяемое имя и ни одного вызова build*Pdf* — '
    + 'тракты выдачи переименованы либо разбор сломался, и правило ниже '
    + 'проверяло бы пустоту');
  console.log('  · защищённых точек выдачи: ' + guarded);
  ok('каждая точка выдачи идёт после ensure()', bare.length === 0,
    'без подготовки стека: ' + bare.join('; '));
});

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nТяжёлые ассеты догружаются по требованию; долг сведён, храповик затянут.');
process.exit(failed ? 1 : 0);
