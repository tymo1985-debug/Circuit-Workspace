#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-i18n-bridge.mjs
 *
 * Мост модуля к общей локализации живёт в одном месте — `CWI18n.bindModule()`.
 *
 * ─── ЗАЧЕМ ─────────────────────────────────────────────────────────────────
 *
 * До 29.08.2026 один и тот же код был написан четыре раза: константа `'__hub'`,
 * заполнение `<select>` из `CWI18n.LANGS`, значение «как в хабе», обработчик
 * `change`, подписка на `onChange`, заголовок вкладки с номером версии.
 * Различались только имя модуля, id селектора и ключ заголовка.
 *
 * Дубль стоил не «красоты». Документы звали `init({ selectEl })` — опции с
 * таким именем у `init()` нет и не было, аргумент молча игнорировался, и
 * `<select id="uiLanguage">` НИКОГДА не заполнялся. Проверено на релизной
 * сборке: ноль опций. Переключатель языка модуля стоял пустым, и заметить это
 * можно было только глазами — ни одна проверка не смотрит внутрь селектора.
 *
 * ─── ИСКЛЮЧЕНИЕ, КОТОРОЕ НЕ ОШИБКА ─────────────────────────────────────────
 *
 * `App.i18nBridge` Клиндария остаётся своим и здесь разрешён явно. Это не
 * мост, а зеркало: язык дублируется в `settings.language` модуля, есть карта
 * ближайших языков, `apply: false` (разметка без `data-i18n`, переводит
 * собственный `renderAll()`) и флаг против рекурсии. Свести его в общий слой
 * значило бы затащить туда частный случай одного модуля.
 *
 * Исключение записано СПИСКОМ, а не «пропускаем circuit-planner целиком»:
 * появится в нём второй самодельный мост — проверка его увидит.
 *
 *   node scripts/check-i18n-bridge.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* Комментарии вырезаются: в них литерал '__hub' и описание прежнего кода
   встречаются законно — иначе проверка ловила бы собственные объяснения. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

/* --- 1. Общий слой предоставляет мост ----------------------------------- */
console.log('\nОбщий слой');
const SHARED = read('shared/i18n.js');
ok('CWI18n.bindModule объявлен', /bindModule\s*:\s*function/.test(SHARED));
ok("HUB_VALUE объявлена в общем слое", /var HUB_VALUE\s*=\s*'__hub'/.test(SHARED),
  'иначе константа снова разъедется по модулям — она обязана совпадать, но ничем не связана');

/* --- 2. Модули пользуются мостом ---------------------------------------- */
console.log('\nМодули');
const BRIDGES = [
  { file: 'congress-project/js/i18n.js', module: 'congress-project' },
  { file: 'pioneer-school/js/i18n.js', module: 'pioneer-school' },
  { file: 'appointments/js/app.js', module: 'appointments' },
  { file: 'documents/js/app.js', module: 'documents' },
];
BRIDGES.forEach((b) => {
  if (!existsSync(join(ROOT, b.file))) { ok(b.file + ': файл на месте', false); return; }
  ok(b.module + ': зовёт CWI18n.bindModule', /bindModule\s*\(/.test(code(b.file)),
    'мост собран вручную — четыре копии одного кода расходятся молча');
});

/* --- 3. Самодельных мостов не осталось ---------------------------------- */
/* Признак самодельного моста — НЕ «строит select из CWI18n.LANGS»: так же
   устроены селектор языка ДОКУМЕНТОВ у Назначений (CWDocLang) и собственный
   селектор хаба, и оба законны. Первая версия проверки на этом и споткнулась.
   Настоящий признак у моста один: опция «наследовать от хаба». Без неё мост
   не мост, а с ней он обязан быть построен bindModule. Поэтому дальше
   проверяется ровно литерал '__hub'. */

/* --- 4. Литерал '__hub' только там, где разрешён ------------------------ */
console.log("Литерал '__hub'");
/* circuit-planner/app.js — единственное разрешённое место вне общего слоя,
   и разрешено оно ИМЕННО ЗДЕСЬ, списком: появится второй самодельный мост —
   проверка его увидит. */
const ALLOWED = new Set(['shared/i18n.js', 'circuit-planner/app.js']);
const SCAN = [
  'shared/i18n.js', 'circuit-planner/app.js',
  'congress-project/js/i18n.js', 'pioneer-school/js/i18n.js',
  'appointments/js/app.js', 'documents/js/app.js',
];
SCAN.forEach((file) => {
  if (!existsSync(join(ROOT, file))) return;
  const hits = (code(file).match(/'__hub'/g) || []).length;
  if (ALLOWED.has(file)) {
    console.log('  · ' + file + ': ' + hits + ' — разрешено явно (см. шапку)');
    return;
  }
  ok(file + ": литерала '__hub' нет", hits === 0,
    'константа живёт в общем слое как HUB_VALUE; копия обязана совпадать с ней, но ничем не связана');
});

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nМост локализации собран в одном месте.');
process.exit(failed ? 1 : 0);
