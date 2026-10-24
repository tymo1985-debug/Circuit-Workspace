#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-type-scale.mjs
 *
 * Новый размер шрифта берётся из шкалы `docs/design-tokens/04-type-scale.md`
 * (визуальный аудит 24.10.2026, фаза Ф2): 11 · 12 · 14 · 16 · 20 · 24 · 32 px.
 * У Клиндария rem масштабируется настройкой «Размер шрифта», поэтому там
 * те же ступени записываются в rem: .6875 · .75 · .875 · 1 · 1.25 · 1.5 · 2.
 *
 * Храповик по образцу check-breakpoints.mjs: значения, которые уже есть в
 * коде, перечислены в LEGACY и живут, пока их не тронут; краснеет проверка
 * только на НОВОМ размере вне шкалы. Свести все размеры разом значило бы
 * переверстать семь модулей за один заход.
 *
 * СПИСОК НАСЛЕДИЯ ТОЛЬКО СОКРАЩАЕТСЯ. Свёл последние `13px` к 12 или 14 —
 * убери строку; проверка сама напомнит, если значение исчезло из кода.
 *
 * Чего проверка не видит: размеры, которые JS собирает строкой (печатные
 * документы, PDF, стили календаря в circuit-planner/ui/*.js). Бумага — фаза
 * Ф6, у неё своя шкала.
 *
 *   node scripts/check-type-scale.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Шкала. Совпадает с docs/design-tokens/04-type-scale.md. */
const SCALE_PX = [11, 12, 14, 16, 20, 24, 32];
const SCALE_REM = [0.6875, 0.75, 0.875, 1, 1.25, 1.5, 2];

/**
 * Наследие на 24.10.2026 — после Ф2, где дробные (10.5, 12.5, 13.5 …) и
 * случайные rem уже сведены к шкале.
 *  - 13, 15 px — самые частые; сводятся по модулю вместе с Ф4 (оболочка),
 *    потому что меняют плотность списков и требуют живого прогона экрана;
 *  - 8, 9, 10 px — плотная сетка календаря Клиндария и счётчики Школы;
 *  - 18, 22, 28, 36, 44, 45, 57 px — заголовки модулей и крупные цифры, а
 *    также классы .md-display-* / .md-headline-* из шкалы MD3 в общем слое.
 */
const LEGACY_PX = [8, 9, 10, 13, 15, 18, 22, 28, 36, 44, 45, 57];
const LEGACY_REM = [];

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

/* `font-size: N` и шорткат `font: [вес] N/…`. em и clamp() не трогаем:
   это размер относительно родителя, а не ступень шкалы. */
const SIZE = /font-size:\s*([\d.]+)(px|rem)\b|font:\s*(?:\d{3}\s+)?([\d.]+)(px|rem)\b/g;

const found = { px: new Map(), rem: new Map() };
walk(ROOT).forEach((file) => {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  let m;
  SIZE.lastIndex = 0;
  while ((m = SIZE.exec(src)) !== null) {
    const value = Number(m[1] ?? m[3]);
    const unit = m[2] ?? m[4];
    const bag = found[unit];
    if (!bag.has(value)) bag.set(value, new Set());
    bag.get(value).add(rel);
  }
});

console.log('\nШкала размеров шрифта');
ok('документ шкалы на месте', existsSync(join(ROOT, 'docs/design-tokens/04-type-scale.md')));
ok('в коде вообще есть размеры шрифта', found.px.size > 0,
  'разбор ничего не нашёл — проверка перестала проверять');
console.log('  · шкала: ' + SCALE_PX.join(', ') + ' px');

console.log('\nНовые размеры');
let strangers = 0;
for (const [unit, scale, legacy] of [['px', SCALE_PX, LEGACY_PX], ['rem', SCALE_REM, LEGACY_REM]]) {
  const allowed = new Set([...scale, ...legacy]);
  [...found[unit].keys()].filter((v) => !allowed.has(v)).sort((a, b) => a - b).forEach((v) => {
    strangers++;
    ok(v + unit + ': ступень шкалы', false,
      'встречается в ' + [...found[unit].get(v)].join(', ') + '\n      '
      + 'размер шрифта обязан быть одним из: ' + scale.join(', ') + ' ' + unit);
  });
}
if (!strangers) console.log('  ✓ новых размеров вне шкалы нет');

console.log('\nСписок наследия');
const stale = [
  ...LEGACY_PX.filter((v) => !found.px.has(v)).map((v) => v + 'px'),
  ...LEGACY_REM.filter((v) => !found.rem.has(v)).map((v) => v + 'rem'),
];
ok('в наследии нет значений, которых уже нет в коде', !stale.length,
  'убери из LEGACY: ' + stale.join(', ') + ' — список только сокращается');

if (failed) { console.log('\n✗ Шкала шрифта: ' + failed + ' нарушений'); process.exit(1); }
console.log('\n✓ Шкала шрифта соблюдена');
