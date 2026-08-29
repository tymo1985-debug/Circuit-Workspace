#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-orphan-classes.mjs
 *
 * ЧТО ЛОВИТ. Проверка двусторонняя:
 *   1) класс в разметке страницы, для которого во всей области видимости этой
 *      страницы нет ни одного правила CSS;
 *   2) правило в `shared/style.css`, для которого нет ни одного потребителя —
 *      добавлено 29.08.2026, см. второй раздел файла.
 *
 * ЗАЧЕМ. 28.08.2026 при перекройке главного экрана вместе с ненужным блоком
 * стилей были вырезаны `.cw-btn`, `.cw-btn svg`, `.cw-btn--primary`,
 * `.cw-backup__table`, `.cw-backup__never` и `.cw-backup__status`. Разметка
 * осталась прежней, страница открылась, ошибок не было. Но `.cw-btn`
 * провалился на общее правило из `shared/style.css` (другой радиус, другой
 * вес шрифта и никакого ограничения размера иконки), значки развернулись на
 * свои 24px, подписи сломались на две строки, а главная кнопка перестала
 * быть главной — `.cw-btn--primary` не существовал вовсе. Ни одна из десяти
 * проверок гейта этого не увидела: переменные все объявлены, версии сходятся,
 * словари целы.
 *
 * Второй источник той же поломки — молчаливая подстановка в патч-скрипте:
 * блок `<details>` не добавился, потому что его якорь был удалён предыдущей
 * заменой. Такие потери не видны в диффе, если диффа никто не читает глазами.
 *
 * ГРАНИЦЫ. Проверка НЕ утверждает, что вёрстка правильная — только что для
 * класса вообще существует правило. Класс, для которого правило есть в
 * `shared/style.css`, считается покрытым: провал `.cw-btn` на общий стиль
 * этой проверкой не ловится и ловиться не должен (это законный приём).
 * Ловится случай, когда правила нет НИГДЕ.
 *
 * ИСКЛЮЧЕНИЯ. Классы, которые ставятся скриптом и служат только зацепкой для
 * него (`js-*`), и классы, заведомо приходящие из общего слоя без стилей,
 * перечислены в IGNORE ниже.
 *
 *   node scripts/check-orphan-classes.mjs
 *
 * Коды возврата: 0 — чисто; 1 — есть класс без единого правила.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Пока проверяем хаб: это единственная страница, чьи стили живут инлайном
   в самой разметке, и потому единственная, где вырезанный блок не оставляет
   следа в отдельном .css-файле. Модули добавляются сюда по мере надобности. */
const PAGES = [
  { html: 'index.html', css: ['index.html', 'shared/style.css', 'shared/update.js', 'shared/theme.js'] },
];

const IGNORE = new Set(['cw-sr-only']);

let failed = 0;

for (const page of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, page.html), 'utf8');

  const used = new Set();
  for (const m of html.matchAll(/\sclass="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls) used.add(cls);
  }
  /* Классы, которые скрипт страницы навешивает сам: их в атрибутах нет,
     но правила для них обязаны существовать — именно так пропало бы
     состояние карточки. */
  for (const m of html.matchAll(/classList\.add\('([a-z0-9-]+)'/g)) used.add(m[1]);
  for (const m of html.matchAll(/className = '([^']+)'/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls) used.add(cls);
  }
  for (const m of html.matchAll(/'(cw-[a-z0-9-]+__[a-z0-9-]+(?:--[a-z0-9-]+)?)'/g)) used.add(m[1]);
  for (const m of html.matchAll(/'cw-syscard--' \+ level/g)) {
    ['ok', 'warn', 'alert'].forEach((l) => used.add('cw-syscard--' + l));
  }
  for (const m of html.matchAll(/'cw-rib__pad--' \+ \(/g)) {
    ['live', 'ok', 'warn', 'alert'].forEach((l) => used.add('cw-rib__pad--' + l));
  }

  const css = page.css.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const declared = new Set();
  for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) declared.add(m[1]);

  /* Имена, оборванные на дефисе, — это префиксы из конкатенации в скрипте
     ('cw-syscard--' + level). Сами варианты добавлены выше явным списком. */
  const orphans = [...used]
    .filter((c) => !c.endsWith('-'))
    .filter((c) => !declared.has(c) && !IGNORE.has(c))
    .sort();

  console.log(page.html + ': классов в разметке ' + used.size + ', правил найдено для ' + (used.size - orphans.length));
  if (orphans.length) {
    failed += orphans.length;
    orphans.forEach((c) => console.log('  ✗ .' + c + ' — используется, но правила нет ни в одном файле страницы'));
  } else {
    console.log('  ✓ для каждого класса есть хотя бы одно правило');
  }
}

/* ═══ ОБРАТНАЯ СТОРОНА: правило без потребителя ═══════════════════════════
 *
 * ЗАЧЕМ. Всё выше ищет класс без правила. Обратный случай — правило в общем
 * слое, которым никто не пользуется, — гейт до 29.08.2026 не видел вовсе:
 * раздел 5.6 `shared/style.css` (`.md-table-wrap`, `.md-table--cards`)
 * существовал вхолостую месяцами и нашёлся ГЛАЗАМИ при аудите, а не
 * проверкой. Спящий компонент опаснее лишнего килобайта: следующий, кто
 * будет решать задачу, которую этот компонент решает, о нём не узнает и
 * напишет свой — так и появляются шесть редакций одного кода.
 *
 * ─── ТРИ СОСТОЯНИЯ, А НЕ ДВА ───────────────────────────────────────────────
 *
 *   применяется в модулях        — норма, ничего не печатается;
 *   есть только в превью         — компонент задокументирован и предъявлен,
 *     но ни один модуль его не взял. Это НЕ провал: каталог дизайн-системы
 *     на то и каталог. Печатается счётчиком — чтобы список не рос молча;
 *   нет нигде, даже в превью     — мёртвое правило. Ратчет ниже.
 *
 * ─── ПОЧЕМУ ХРАПОВИК ───────────────────────────────────────────────────────
 *
 * На 29.08.2026 таких правил 39. Требовать вычистить их разом значило бы
 * тронуть общий слой целиком одним заходом — правка, которую нельзя
 * проверить живым прогоном осмысленно. Поэтому список зафиксирован, а
 * краснеет проверка на НОВОМ мёртвом правиле. Список только СОКРАЩАЕТСЯ:
 * применили компонент или удалили — убрали строку.
 */

const SHARED_CSS = 'shared/style.css';

/** Каталог дизайн-системы: использование здесь — документация, не применение. */
const PREVIEW = 'docs/design-system';

/**
 * Мёртвые правила на 29.08.2026 — объявлены в общем слое и не встречаются
 * нигде, включая превью. СПИСОК ТОЛЬКО СОКРАЩАЕТСЯ.
 */
const DEAD = new Set([
  'cw-btn--accent', 'cw-badge--soon', 'cw-muted',
  'md-display-large', 'md-display-medium', 'md-display-small',
  'md-headline-large', 'md-headline-medium', 'md-body-large', 'md-label-small',
  'md-icon', 'md-icon-sm', 'md-icon-lg',
  'md-btn-elevated', 'md-fab', 'md-fab-extended',
  'md-card-filled', 'md-card-elevated',
  'md-list', 'md-list-item',
  'md-topbar', 'md-nav-rail', 'md-nav-rail-item', 'md-nav-indicator',
  'md-nav-label', 'md-nav-bottom', 'md-nav-bottom-item',
  'md-hidden', 'md-flex', 'md-gap-sm', 'md-gap-md',
  'md-shell__body--rail', 'md-page--narrow', 'md-toolbar--sticky',
  'md-formgrid--3', 'md-sheet--drawer',
  'u-truncate', 'u-print-only', 'u-no-print',
]);

console.log('\n' + SHARED_CSS + ': правила без потребителя');

/* Селекторы берём только из СЕЛЕКТОРНОЙ части правил: точка внутри блока
   объявлений — это дробное число (`.5rem`), а не класс. */
const sharedCss = fs.readFileSync(path.join(ROOT, SHARED_CSS), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const declaredShared = new Set();
for (const block of sharedCss.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
  for (const m of block[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) declaredShared.add(m[1]);
}

/* Использование ищем словами по всей разметке и всему JS: класс может
   собираться конкатенацией и в атрибуте не встречаться ни разу. Ложное
   «используется» здесь дешевле ложного «мёртвое». */
const SKIP = new Set(['node_modules', '.git', 'shots', 'vendor', 'fonts']);
const usedInCode = new Set();
const usedInPreview = new Set();
(function collect(dir, inPreview) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    const rel = path.relative(ROOT, p).split(path.sep).join('/');
    if (entry.isDirectory()) { collect(p, inPreview || rel.startsWith(PREVIEW)); continue; }
    if (!/\.(html|js)$/.test(p)) continue;
    const bag = inPreview ? usedInPreview : usedInCode;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/[\w-]+/g)) bag.add(m[0]);
  }
})(ROOT, false);

const unusedShared = [...declaredShared].filter((c) => !usedInCode.has(c));
const onlyPreview = unusedShared.filter((c) => usedInPreview.has(c)).sort();
const nowhere = unusedShared.filter((c) => !usedInPreview.has(c)).sort();

console.log('  · объявлено классов: ' + declaredShared.size
  + ', применяется в модулях: ' + (declaredShared.size - unusedShared.length));
console.log('  · только в каталоге дизайн-системы: ' + onlyPreview.length
  + ' — задокументированы, ни одним модулем не взяты');

const newlyDead = nowhere.filter((c) => !DEAD.has(c));
newlyDead.forEach((c) => {
  failed++;
  console.log('  ✗ .' + c + ' — правило есть, потребителя нет нигде, включая каталог\n'
    + '      спящий компонент не найдёт следующий, кто будет решать ту же задачу, '
    + 'и напишет свой; либо применить, либо удалить, либо предъявить в ' + PREVIEW);
});
if (!newlyDead.length) console.log('  ✓ новых мёртвых правил нет');

/* Правило свели, а строку из DEAD убрать забыли: не провал, но списку нельзя
   давать врать — иначе он перестанет быть мерой. */
const revived = [...DEAD].filter((c) => !nowhere.includes(c)).sort();
if (revived.length) console.log('  · ожили или удалены, можно убрать из DEAD: ' + revived.join(', '));
console.log('  · осталось разобрать: ' + nowhere.filter((c) => DEAD.has(c)).length);

console.log('');
if (failed) {
  console.log('Провалено: ' + failed);
  process.exit(1);
}
console.log('Классы и правила сходятся в обе стороны.');
