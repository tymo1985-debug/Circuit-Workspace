#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-versions.mjs
 *
 * Версия каждого модуля объявлена РОВНО В ОДНОМ месте — `shared/version.js`,
 * а весь остальной код её оттуда выводит.
 *
 * ─── ЧТО ИЗМЕНИЛОСЬ 28.08.2026 ─────────────────────────────────────────────
 *
 * Раньше проверка сверяла семь источников между собой: число дублировалось в
 * оболочках и в реестре, а расхождение ловилось здесь. Страховка работала, но
 * страховка — не то же самое, что единственный источник: при каждом выпуске
 * правились два-три места, и ошибка ловилась только если проверку запустили.
 *
 * Теперь дублей нет: четыре оболочки и два файла модулей переведены на
 * `importScripts('../shared/version.js')` по образцу Клиндария. Поэтому и
 * проверка мерит другое — не совпадение чисел, а **отсутствие литералов** и
 * наличие вывода из реестра. Сравнивать стало нечего, а вот вернуть литерал
 * обратно очень легко: именно это здесь и ловится.
 *
 * ─── ПОЧЕМУ ЭТО ВАЖНЕЕ, ЧЕМ ДЕДУП ──────────────────────────────────────────
 *
 * Побочный выигрыш приёма описан в `circuit-planner/sw.js`: браузер при
 * проверке обновления сверяет не только сам `sw.js`, но и импортированные им
 * скрипты. Значит ЛЮБОЙ выпуск, поднявший версию в реестре, сам инвалидирует
 * кэш модуля. Вернувшийся литерал тихо отнимает это свойство обратно.
 *
 *   node scripts/check-versions.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  \u2713 ' + label); return; }
  failed++;
  console.log('  \u2717 ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

/* --- 1. Реестр --------------------------------------------------------- */
console.log('\nРеестр версий');
const registrySrc = read('shared/version.js');
const registry = Object.fromEntries(
  [...registrySrc.matchAll(/'([^']+)':\s*\{[^}]*version:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
);
const shell = (registrySrc.match(/CW_VERSION\s*=\s*'([^']+)'/) || [])[1];
const semver = /^\d+\.\d+\.\d+$/;

ok('CW_VERSION объявлен и корректен', !!shell && semver.test(shell), shell);
const MODULES = ['congress-project', 'circuit-planner', 'pioneer-school', 'appointments', 'documents'];
MODULES.forEach((id) => {
  ok('реестр знает ' + id, !!registry[id] && semver.test(registry[id]), registry[id]);
});

/* --- 2. Литералов версии вне реестра нет ------------------------------- */
console.log('\nЕдинственный источник');

/* Файлы, которые раньше объявляли версию своим числом. Для каждого — как
   он обязан её выводить теперь. */
const DERIVED = [
  { file: 'service-worker.js', expect: /self\.CW_VERSION/, what: 'CW_VERSION' },
  { file: 'circuit-planner/sw.js', expect: /CW_MODULES\s*\[\s*'circuit-planner'\s*\]/, what: "CW_MODULES['circuit-planner']" },
  { file: 'circuit-planner/app.js', expect: /CW_MODULES\s*\[\s*'circuit-planner'\s*\]/, what: "CW_MODULES['circuit-planner']" },
  { file: 'congress-project/service-worker.js', expect: /CW_MODULES\s*\[\s*'congress-project'\s*\]/, what: "CW_MODULES['congress-project']" },
  { file: 'pioneer-school/sw.js', expect: /CW_MODULES\s*\[\s*'pioneer-school'\s*\]/, what: "CW_MODULES['pioneer-school']" },
  { file: 'pioneer-school/js/app.js', expect: /CW_MODULES\s*\[\s*'pioneer-school'\s*\]/, what: "CW_MODULES['pioneer-school']" },
  { file: 'appointments/sw.js', expect: /CW_MODULES\s*\[\s*'appointments'\s*\]/, what: "CW_MODULES['appointments']" },
  { file: 'documents/sw.js', expect: /CW_MODULES\s*\[\s*'documents'\s*\]/, what: "CW_MODULES['documents']" },
];

/* Литерал — это `APP_VERSION = '1.2.3'` или `version: '1.2.3'` с настоящим
   номером. Запасное значение (`: '0'`, `: ''`) литералом не считается: оно не
   номер версии, а поведение при неудавшемся импорте. */
const LITERAL = /(?:APP_VERSION\s*=|version\s*:)\s*'(\d+\.\d+\.\d+)'/g;

DERIVED.forEach((entry) => {
  if (!existsSync(join(ROOT, entry.file))) { ok(entry.file + ': файл на месте', false); return; }
  const src = read(entry.file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(entry.file + ': версия выводится из ' + entry.what, entry.expect.test(src),
    'вернулся литерал вместо вывода из реестра — выпуск перестанет сам инвалидировать кэш модуля');
  LITERAL.lastIndex = 0;
  const found = [...src.matchAll(LITERAL)].map((m) => m[1]);
  ok(entry.file + ': литерала версии нет', found.length === 0,
    'найдено: ' + found.join(', ') + '. Версия объявляется только в shared/version.js');
});

/* Импорт реестра обязателен там, где он единственный способ его получить. */
['congress-project/service-worker.js', 'pioneer-school/sw.js',
 'appointments/sw.js', 'documents/sw.js', 'circuit-planner/sw.js'].forEach((file) => {
  ok(file + ': реестр импортирован', /importScripts\([^)]*shared\/version\.js/.test(read(file)),
    'без importScripts у service worker нет доступа к CW_MODULES, и APP_VERSION станет запасным «0»');
});

/* --- 3. Версия не просачивается в разметку ----------------------------- */
console.log('\nВерсия не зашита в разметку');
ok('congress-project/index.html: версии нет в <title>',
  !/<title>[^<]*\bv\d+\.\d+(?:\.\d+)?[^<]*<\/title>/i.test(read('congress-project/index.html')),
  'заголовок правился бы вручную при каждом выпуске');

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : `\nВерсии объявлены в одном месте: хаб ${shell}; `
    + MODULES.map((id) => id + ' ' + registry[id]).join('; '));
process.exit(failed ? 1 : 0);
