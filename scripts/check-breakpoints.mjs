#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-breakpoints.mjs
 *
 * Новая контрольная точка адаптива берётся из реестра
 * `docs/design-tokens/03-breakpoints.md`. Старые живут, пока их не тронут.
 *
 * ─── ПОЧЕМУ ХРАПОВИК, А НЕ ЗАПРЕТ ──────────────────────────────────────────
 *
 * На 29.08.2026 в проекте 21 разное значение (отчёт предполагал семь).
 * Проверка, требующая свести их разом, была бы требованием переверстать пять
 * модулей за один заход — то есть её бы отключили в первый же день. Поэтому
 * список наследия зафиксирован ниже как есть, а краснеет проверка только на
 * НОВОМ числе за пределами реестра.
 *
 * Список наследия можно только СОКРАЩАТЬ. Свёл `767` к `900` — убери строку.
 * Так реестр приходит в проект по мере касания кода, а не рывком.
 *
 * ─── ЧТО ЗДЕСЬ ОПАСНО НА САМОМ ДЕЛЕ ────────────────────────────────────────
 *
 * Не количество значений, а соседство близких: `767` и `768`, `1200` и `1201`,
 * `1100` и `1101`. Между ними лежит полоса шириной в один пиксель, где часть
 * компонентов уже перестроилась, а часть ещё нет. Устройства такой ширины не
 * бывает — а окна браузера бывают любые. Поэтому такие пары проверка называет
 * отдельно, даже пока они в наследии.
 *
 *   node scripts/check-breakpoints.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Реестр. Совпадает с docs/design-tokens/03-breakpoints.md. */
const REGISTRY = [600, 900, 1200, 1600];

/**
 * Наследие на 29.08.2026 — значения, уже существующие в коде.
 * СПИСОК ТОЛЬКО СОКРАЩАЕТСЯ. Добавить сюда новое число вместо того, чтобы
 * взять из реестра, — значит отменить смысл проверки.
 */
const LEGACY = [420, 560, 680, 700, 720, 760, 767, 768, 820, 860,
                1000, 1100, 1101, 1180, 1201, 1240, 1280];

/** Пары, различающиеся на пиксель: полоса, которую никто не рисовал. */
const NEIGHBOURS = [[767, 768], [1100, 1101], [1200, 1201]];

const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'scripts', 'vendor']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.css') || p.endsWith('.html')) out.push(p);
  }
  return out;
}

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

/* Только медиазапросы: `max-width` у элемента — это размер, а не точка
   адаптива, и путать их значило бы ловить вёрстку карточек. */
const MEDIA = /@media[^{]*?\((?:max|min)-width:\s*(\d+)px/g;

const found = new Map();          // значение → Set(файлов)
walk(ROOT).forEach((file) => {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  let m;
  MEDIA.lastIndex = 0;
  while ((m = MEDIA.exec(src)) !== null) {
    const value = Number(m[1]);
    if (!found.has(value)) found.set(value, new Set());
    found.get(value).add(rel);
  }
});

console.log('\nРеестр контрольных точек');
ok('документ реестра на месте', existsSync(join(ROOT, 'docs/design-tokens/03-breakpoints.md')));
ok('в коде вообще есть медиазапросы', found.size > 0,
  'разбор ничего не нашёл — проверка перестала проверять');

console.log('  · реестр: ' + REGISTRY.join(', '));
console.log('  · всего значений в коде: ' + found.size);

/* --- Новые значения ----------------------------------------------------- */
console.log('\nНовые значения');
const allowed = new Set([...REGISTRY, ...LEGACY]);
const strangers = [...found.keys()].filter((v) => !allowed.has(v)).sort((a, b) => a - b);
strangers.forEach((v) => {
  ok(v + 'px: значение из реестра', false,
    'встречается в ' + [...found.get(v)].join(', ') + '\n      '
    + 'новая контрольная точка обязана быть одной из: ' + REGISTRY.join(', ')
    + '. Если это точка ВНУТРИ компонента (привязана к содержимому, а не к экрану) — '
    + 'см. раздел «Чего реестр не решает» в docs/design-tokens/03-breakpoints.md');
});
if (!strangers.length) console.log('  ✓ новых значений за пределами реестра нет');

/* --- Список наследия не растёт ----------------------------------------- */
console.log('\nСписок наследия');
const stale = LEGACY.filter((v) => !found.has(v));
if (stale.length) {
  /* Не провал: значение свели, а строку убрать забыли. Сказать об этом
     стоит — иначе список наследия начнёт врать и перестанет быть мерой. */
  console.log('  · сведены, можно убрать из LEGACY: ' + stale.join(', '));
}
const live = LEGACY.filter((v) => found.has(v));
console.log('  · осталось свести: ' + (live.length ? live.join(', ') : 'ничего'));

/* --- Соседние значения -------------------------------------------------- */
console.log('\nЗначения, различающиеся на пиксель');
NEIGHBOURS.forEach(([a, b]) => {
  if (found.has(a) && found.has(b)) {
    console.log('  · ' + a + '/' + b + ' — полоса в один пиксель, где раскладка не определена: '
      + [...new Set([...found.get(a), ...found.get(b)])].join(', '));
  }
});

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nНовых контрольных точек за пределами реестра нет.');
process.exit(failed ? 1 : 0);
