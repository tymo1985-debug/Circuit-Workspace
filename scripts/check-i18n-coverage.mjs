#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-i18n-coverage.mjs
 *
 * ЧТО ПРОВЕРЯЕТ. Покрытие ключей по языкам и видимость долга перевода.
 *
 * ЗАЧЕМ. `cong.alert.templates_move_failed` два дня пролежал заведённым только
 * по-русски, и заметить это можно было ровно одним способом — прочитать запись
 * в `TODO.md` и поверить ей. Записи в TODO протухают: к 28.08.2026 шесть штук
 * подряд разошлись с кодом. Долг локализации обязан считаться сканером, а не
 * помниться; это правило записано в самом TODO и здесь оно исполняется.
 *
 * ТРИ СЕКЦИИ, И ТОЛЬКО ОДНА МЕНЯЕТ КОД ВОЗВРАТА.
 *
 *   §1 ПРОВАЛ — частичное покрытие. Ключ есть в `ru` и ХОТЯ БЫ В ОДНОМ из
 *      остальных языков, но не во всех. Это подпись описки: переводчик или
 *      скрипт заполнил не все колонки. Сюда же лишний ключ — тот, что есть в
 *      каком-то языке, но отсутствует в `ru`: почти всегда опечатка в имени.
 *
 *   §2 ОТЧЁТ — ключ заведён ТОЛЬКО по-русски. Это законное переходное
 *      состояние проекта, а не поломка: `CWI18n.t()` падает в `FALLBACK='ru'`,
 *      строка видна по-русски, и сразу понятно, что перевода нет. Правило
 *      «не заполнять очевидным переводом, потом не отличить от вычитанного
 *      носителем» записано в шапке `circuit-planner/i18n/dict.js` и здесь
 *      уважается. Секция печатает готовый список на отдачу носителю.
 *
 *   §3 ОТЧЁТ — русская кириллица в значениях `en`/`pl`/`de`. Признак
 *      незаполненного перевода, замаскированного копией русского текста.
 *      Совпадение `uk` с `ru` признаком НЕ является: украинский законно
 *      совпадает в «Телефон», «Тема», «Урок {n}».
 *
 * ГРАНИЦЫ, ЧЕСТНО.
 * - §3 слеп к русскому тексту, положенному в `uk`: там кириллица законна.
 *   Единственный способ поймать такое — глаз носителя.
 * - Проверка ничего не говорит о КАЧЕСТВЕ перевода. Непохожая на русскую
 *   строка считается переведённой, даже если она бессмысленна.
 * - Словари загружаются исполнением файла с заглушкой `CWI18n`. Ключ,
 *   собранный в рантайме, а не записанный литералом, сюда не попадёт —
 *   инлайновые языковые таблицы в коде стережёт `check-inline-lang-tables.mjs`.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Языки проекта. Порядок — как в `shared/i18n.js`. */
const LANGS = ['ru', 'uk', 'en', 'pl', 'de'];
const BASE = 'ru';
/** Языки на латинице: русская кириллица в значении = перевода нет. */
const LATIN = ['en', 'pl', 'de'];
const CYRILLIC = /[А-Яа-яЁё]/;

/** Найти все словари, а не перечислять их по памяти: новый файл обязан
 *  попадать под проверку сам, без правки этого списка. */
async function findDictionaries() {
  const found = [];
  const roots = ['.', 'shared'];
  for (const base of roots) {
    let entries;
    try {
      entries = await readdir(join(ROOT, base), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = base === '.' ? join(entry.name, 'i18n') : join(base, 'i18n');
      if (base === 'shared' && entry.name !== 'i18n') continue;
      const target = base === 'shared' ? join('shared', 'i18n') : dir;
      let files;
      try {
        files = await readdir(join(ROOT, target));
      } catch {
        continue;
      }
      for (const file of files) {
        if (!file.endsWith('.js')) continue;
        const rel = join(target, file);
        if (!found.includes(rel)) found.push(rel);
      }
    }
  }
  return found.sort();
}

/** Слить bundle в накопитель по языкам: файл может звать register() по разу
 *  на язык (так устроен `pioneer-school/i18n/doc.js`), и плоский Object.assign
 *  затирал бы предыдущую порцию целиком. */
function mergeBundle(store, bundle) {
  if (!bundle || typeof bundle !== 'object') return;
  for (const [lang, table] of Object.entries(bundle)) {
    if (!table || typeof table !== 'object') continue;
    store[lang] = Object.assign(store[lang] || {}, table);
  }
}

async function loadDictionary(rel) {
  const src = await readFile(join(ROOT, rel), 'utf8');
  const store = {};
  const take = (a, b) => mergeBundle(store, b && typeof b === 'object' ? b : a);
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    CWI18n: { register: take, add: take, extend: take, merge: take },
  };
  ctx.self = ctx;
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: rel });
  if (!store[BASE]) throw new Error('словарь не отдал секцию ru — изменился способ регистрации?');
  return store;
}

const partial = [];   // §1
const orphan = [];    // §1: ключ есть в языке, но не в ru
const ruOnly = [];    // §2
const cyrillic = [];  // §3

const dicts = await findDictionaries();
if (!dicts.length) {
  console.error('Проверка покрытия: не найдено ни одного словаря — сломан обход каталогов');
  process.exit(1);
}

console.log('Покрытие словарей по языкам\n');

for (const rel of dicts) {
  let dict;
  try {
    dict = await loadDictionary(rel);
  } catch (err) {
    console.error(`  ✗ ${rel}: ${err.message}`);
    partial.push(`${rel}: словарь не загружен — ${err.message}`);
    continue;
  }

  const present = LANGS.filter((l) => dict[l] && typeof dict[l] === 'object');
  const others = present.filter((l) => l !== BASE);
  const keys = Object.keys(dict[BASE]);

  let filePartial = 0;
  let fileRuOnly = 0;
  let fileCyr = 0;

  for (const key of keys) {
    const has = others.filter((l) => key in dict[l]);
    if (has.length === 0) {
      fileRuOnly += 1;
      ruOnly.push({ file: rel, key, text: dict[BASE][key] });
    } else if (has.length !== others.length) {
      filePartial += 1;
      partial.push(`${rel}: ${key} — есть в ${['ru', ...has].join('/')}, нет в ${others.filter((l) => !has.includes(l)).join('/')}`);
    }
  }

  for (const lang of others) {
    for (const key of Object.keys(dict[lang])) {
      if (!(key in dict[BASE])) orphan.push(`${rel}: ${key} есть в ${lang}, но не в ru`);
    }
  }

  for (const lang of LATIN) {
    if (!dict[lang]) continue;
    for (const [key, value] of Object.entries(dict[lang])) {
      if (CYRILLIC.test(String(value))) {
        fileCyr += 1;
        cyrillic.push(`${rel}: ${key} [${lang}] — ${JSON.stringify(String(value).slice(0, 60))}`);
      }
    }
  }

  const marks = [];
  if (filePartial) marks.push(`частичных ${filePartial}`);
  if (fileRuOnly) marks.push(`только ru — ${fileRuOnly}`);
  if (fileCyr) marks.push(`кириллица в латинице — ${fileCyr}`);
  const mark = filePartial ? '✗' : marks.length ? '·' : '✓';
  console.log(`  ${mark} ${rel.padEnd(34)} ключей ${String(keys.length).padStart(4)}, языков ${present.length}${marks.length ? '  — ' + marks.join(', ') : ''}`);
}

/* ── §1 ─────────────────────────────────────────────────────────────────── */
console.log('\n§1. Частичное покрытие и лишние ключи (провал)');
if (partial.length || orphan.length) {
  for (const line of [...partial, ...orphan]) console.log(`  ✗ ${line}`);
} else {
  console.log('  ✓ нет: каждый ключ покрыт либо всеми языками, либо только русским');
}

/* ── §2 ─────────────────────────────────────────────────────────────────── */
console.log('\n§2. Заведены только по-русски — на отдачу носителю (не провал)');
if (ruOnly.length) {
  for (const item of ruOnly) {
    console.log(`  · ${item.file}`);
    console.log(`    ${item.key}`);
    console.log(`    ru: ${JSON.stringify(item.text)}`);
  }
  console.log(`\n  Итого ${ruOnly.length}. Заполнять «очевидным» переводом нельзя:`);
  console.log('  потом не отличить от вычитанного носителем (правило из шапки dict.js).');
} else {
  console.log('  ✓ нет');
}

/* ── §3 ─────────────────────────────────────────────────────────────────── */
console.log('\n§3. Русский текст в значениях en/pl/de (не провал)');
if (cyrillic.length) {
  for (const line of cyrillic) console.log(`  · ${line}`);
  console.log(`\n  Итого ${cyrillic.length}.`);
} else {
  console.log('  ✓ нет');
}

console.log('');
if (partial.length || orphan.length) {
  console.error(`Проверка покрытия не пройдена: ${partial.length + orphan.length} расхождений.`);
  process.exitCode = 1;
} else {
  const debt = ruOnly.length + cyrillic.length;
  console.log(
    debt
      ? `Покрытие целостно. Долг перевода: ${debt} (см. §2 и §3) — это долг, а не поломка.`
      : 'Покрытие целостно, долга перевода нет.'
  );
}
