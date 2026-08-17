#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-i18n-placeholders.mjs
 *
 * Переменные в переводе обязаны совпадать с русским исходником.
 *
 * ЗАЧЕМ. Подстановка значений в i18n и в шаблонах документов идёт по именам:
 * `{n}`, `{count}`, `{lang}` в словарях и `{{sender.name}}`, `{{school.place}}`
 * в письмах. Потеря или опечатка в имени НЕ роняет приложение и не даёт ни
 * одной ошибки в консоли — строка просто выходит к человеку без числа, без
 * имени или с голым `{count}` посреди письма. Носитель языка при этом не
 * виноват: он видит текст, а не механику подстановки.
 *
 * Проверка появилась 17.08.2026 после заливки 1583 переведённых ячеек: до неё
 * ни один из пяти прогонов check-all не замечал перевод `'ещё {n} стр.'` →
 * `'noch Seiten'`. Проверено на заведомо сломанном входе — падает.
 *
 * ЧТО СЧИТАЕТСЯ РАСХОЖДЕНИЕМ: разный НАБОР имён (с учётом кратности) между
 * `ru` и любым другим языком. Порядок внутри строки не проверяется намеренно:
 * переставлять переменные в предложении переводчику можно и нужно.
 *
 * ГРАНИЦЫ. Ключи, которых в языке нет вовсе, пропускаются — это законное
 * состояние «ждёт носителя», CWI18n.t() отдаёт русский запасной вариант.
 * Проверяется только то, что уже переведено.
 *
 *   node scripts/check-i18n-placeholders.mjs
 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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

/** `{{двойные}}` ловим раньше `{одинарных}`, иначе получим два ложных имени. */
const PH = /\{\{[A-Za-z0-9_.]+\}\}|\{[A-Za-z0-9_.]+\}/g;

/** Мультимножество имён переменных, отсортированное — сравниваем как строку. */
function names(str) {
  return (String(str).match(PH) || []).sort().join(' ');
}

/** Исполняем файл в песочнице: разбор регулярками сломался бы на экранировании. */
function loadDict(file) {
  const store = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    CWI18n: {
      register(obj) {
        for (const [lang, map] of Object.entries(obj)) {
          store[lang] = Object.assign(store[lang] || {}, map);
        }
      },
    },
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(`${ROOT}/${file}`, 'utf8'), sandbox, { filename: file });
  return store;
}

console.log('1. Словари интерфейса и документов');
let checked = 0;
for (const file of DICTS) {
  const dict = loadDict(file);
  const ru = dict.ru || {};
  const bad = [];
  for (const [lang, map] of Object.entries(dict)) {
    if (lang === 'ru') continue;
    for (const [key, value] of Object.entries(map)) {
      if (!(key in ru)) continue;
      if (!String(value).trim()) continue;   // «ждёт носителя» — законно
      checked++;
      const want = names(ru[key]);
      const got = names(value);
      if (want !== got) bad.push(`${lang}/${key}: ожидалось «${want || '—'}», в переводе «${got || '—'}»`);
    }
  }
  ok(file, bad.length === 0, bad.slice(0, 5).join('; ') + (bad.length > 5 ? ` …и ещё ${bad.length - 5}` : ''));
}

// Порог — страховка от «песочница ничего не загрузила и проверка прошла
// вхолостую», а не смысловое правило. На 17.08.2026 переведённых значений
// было около 4900; опускать порог без явной причины нельзя.
ok('переведённых значений проверено', checked > 3000, String(checked));

console.log('\n2. Шаблоны писем (shared/templates/builtin.js)');
{
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(`${ROOT}/shared/templates/builtin.js`, 'utf8'), sandbox,
    { filename: 'builtin.js' });
  const templates = sandbox.CW_BUILTIN_TEMPLATES || [];
  ok('шаблоны загрузились', templates.length > 0, String(templates.length));

  const bad = [];
  let bodies = 0;
  for (const tpl of templates) {
    const langs = Object.entries(tpl.translations || {})
      .filter(([, t]) => t && String(t.body || '').trim());
    if (langs.length < 2) continue;      // одноязычный шаблон сравнивать не с чем
    // Эталон — первый непустой язык: у писем нет обязательного «исходного»
    // языка, у Конгрессов оригинал украинский, у Школы русский.
    const [baseLang, base] = langs[0];
    const want = names(base.body);
    for (const [lang, t] of langs.slice(1)) {
      bodies++;
      const got = names(t.body);
      if (want !== got) {
        bad.push(`${tpl.id} ${lang} против ${baseLang}: ожидалось «${want}», в переводе «${got}»`);
      }
    }
  }
  ok('тела писем сверены', bodies > 0, String(bodies));
  ok('переменные писем совпадают', bad.length === 0, bad.join('; '));
}

console.log(`\nИтого: ${pass} пройдено, ${fail} провалено\n`);
process.exit(fail ? 1 : 0);
