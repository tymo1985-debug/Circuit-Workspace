#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-orphan-classes.mjs
 *
 * ЧТО ЛОВИТ. Класс, стоящий в разметке страницы, для которого во всей области
 * видимости этой страницы нет ни одного правила CSS.
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

console.log('');
if (failed) {
  console.log('Провалено: ' + failed);
  process.exit(1);
}
console.log('Классов без правил нет.');
