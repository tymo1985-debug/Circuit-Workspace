#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-i18n-dupes.mjs
 *
 * Один ключ не должен встречаться в языковом блоке дважды.
 *
 * ЗАЧЕМ. Словари — обычные объектные литералы, а в них побеждает ПОСЛЕДНЕЕ
 * значение. Второй экземпляр ключа не даёт ни ошибки разбора, ни строчки в
 * консоли: приложение просто показывает не тот текст. Это уже случалось —
 * на стыке двух источников (атрибуты `data-i18n` разметки и старый объект
 * I18N из app.js) четыре ключа Клиндария совпали по имени при разном смысле,
 * и подпись поля «Тема письма» молча подменялась текстом самого письма
 * (см. шапку circuit-planner/i18n/dict.js).
 *
 * Рецидив 17.08.2026: вынося зашитые подписи разметки в словарь, добавили
 * `cp.holidays_toggle`, который уже жил на 292 строки выше. Значения совпали,
 * поэтому не сломалось ничего — но ни одна из шести проверок гейта дубль не
 * увидела, и в следующий раз тексты могли не совпасть. Отсюда эта проверка.
 *
 * ПОЧЕМУ НЕ ПЕСОЧНИЦА. Остальные проверки исполняют словарь в `vm` и получают
 * готовый объект — а в нём дубля уже НЕТ по определению: JS схлопнул его при
 * разборе. Поймать можно только в исходном тексте, до вычисления литерала,
 * поэтому здесь построчный разбор файла.
 *
 * ГРАНИЦЫ. Одноимённые ключи в РАЗНЫХ языковых блоках — это норма и есть
 * смысл словаря. Проверяется повтор внутри одного блока `register({ <lang>: {`.
 * Совпадение имени в разных ФАЙЛАХ (`shared/i18n/common.js` против словаря
 * модуля) — отдельный вопрос: там побеждает тот, кто зарегистрировался
 * последним, и это ловится не здесь.
 *
 *   node scripts/check-i18n-dupes.mjs
 */

import { readFileSync } from 'node:fs';

const ROOT = '.';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
};

const DICTS = [
  'shared/i18n/common.js',
  'appointments/i18n/dict.js',
  'circuit-planner/i18n/dict.js',
  'congress-project/i18n/dict.js',
  'documents/i18n/dict.js',
  'pioneer-school/i18n/dict.js',
  'pioneer-school/i18n/doc.js',
];

/** Начало языкового блока: `global.CWI18n.register({ uk: {` (или self./window.). */
const BLOCK = /^\s*(?:global|self|window)\.CWI18n\.register\(\{\s*([A-Za-z-]+)\s*:/;
/** Строка вида `    'ключ': '…',` — ключ в одинарных кавычках в начале строки. */
const KEY = /^\s*'([^']+)'\s*:/;

console.log('1. Повторы ключей внутри языкового блока');
let totalKeys = 0;

for (const file of DICTS) {
  const lines = readFileSync(`${ROOT}/${file}`, 'utf8').split('\n');
  const dupes = [];
  let lang = null;
  let seen = new Map();

  const closeBlock = () => {
    for (const [key, at] of seen) {
      if (at.length > 1) dupes.push(`${lang}/${key} (строки ${at.join(', ')})`);
    }
  };

  lines.forEach((line, i) => {
    const b = BLOCK.exec(line);
    if (b) {
      if (lang) closeBlock();
      lang = b[1];
      seen = new Map();
      return;
    }
    if (!lang) return;
    const k = KEY.exec(line);
    if (!k) return;
    totalKeys++;
    const at = seen.get(k[1]) || [];
    at.push(i + 1);
    seen.set(k[1], at);
  });
  if (lang) closeBlock();

  ok(file, dupes.length === 0, dupes.slice(0, 5).join('; ') + (dupes.length > 5 ? ` …и ещё ${dupes.length - 5}` : ''));
}

// Порог — страховка от «разбор сломался и проверка прошла вхолостую», а не
// смысловое правило. На 18.08.2026 ключей во всех словарях было около 9700.
ok('ключей разобрано', totalKeys > 6000, String(totalKeys));

console.log(`\nИтог: пройдено ${pass}, провалено ${fail}`);
process.exit(fail ? 1 : 0);
