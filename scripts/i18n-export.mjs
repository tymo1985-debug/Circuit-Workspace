#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/i18n-export.mjs
 *
 * ЧТО ДЕЛАЕТ. Собирает строки всех словарей проекта в один JSON-файл для
 * перевода на заданный язык: ключ, файл словаря, русский оригинал,
 * украинский как второй источник, текущее значение и пустое поле перевода.
 * В начало файла вставлена инструкция для переводчика или ИИ.
 *
 * ЗАЧЕМ (решение Алекса 07.10.2026). Новый язык или дозаливка перевода
 * не должны требовать ручного обхода семи словарей. Файл отдаётся
 * переводчику целиком, возвращается с заполненным полем `translation`.
 * Обратная запись в словари пока ручная — скрипта импорта нет (решено
 * делать только экспорт).
 *
 * ЗАПУСК.
 *   node scripts/i18n-export.mjs <язык> [--all] [--out <файл>]
 *     <язык>   код языка: de, pl, en, uk или новый (например, cs)
 *     --all    все ключи; по умолчанию — только недостающие
 *     --out    путь файла; по умолчанию i18n-export-<язык>-<дата>.json
 *
 * «НЕДОСТАЮЩИЙ» КЛЮЧ — отсутствует в языке, пустой, либо для языка на
 * латинице содержит русскую кириллицу (копия русского вместо перевода; тот же
 * признак, что в check-i18n-coverage.mjs §3).
 *
 * ГРАНИЦЫ. Видит только словари в `*\/i18n/*.js` и `shared/i18n/*.js`.
 * Инлайновые языковые таблицы в коде модулей (их стережёт
 * check-inline-lang-tables.mjs) сюда не попадают — для нового языка их нужно
 * дополнить отдельно.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'ru';
const CYRILLIC = /[А-Яа-яЁё]/;
/** Языки, где кириллица в значении законна — для них признак не работает. */
const CYRILLIC_LANGS = ['ru', 'uk', 'be', 'bg', 'sr', 'mk'];
const PLACEHOLDER = /\{[A-Za-z0-9_.]+\}/g;

const INSTRUCTIONS = [
  'You are translating the user interface of Circuit Workspace, an offline app used by a',
  'circuit overseer of Jehovah\'s Witnesses to organise congregation visits, assemblies,',
  'pioneer school and service correspondence. Use the established terminology of',
  'Jehovah\'s Witnesses publications in the target language (e.g. circuit overseer,',
  'congregation, pioneer, service year, ministry).',
  '',
  'Rules:',
  '1. Fill ONLY the "translation" field of each entry. Do not change "key", "file",',
  '   "ru", "uk" or "current". Do not add or remove entries.',
  '2. Translate from "ru"; use "uk" only to resolve ambiguity.',
  '3. Keep every placeholder in curly braces exactly as written, e.g. {n}, {name},',
  '   {entity}. The list of required placeholders is in "placeholders".',
  '4. Do not translate brand and form names: PDF, S-302, S-255, EPUB, WhatsApp,',
  '   Google Maps, E-mail, Circuit Workspace. Keep emojis and symbols (📋, №, ·, →).',
  '5. Keep it as short as the Russian original: labels go on buttons and narrow',
  '   mobile screens. Match the capitalisation style of the target language.',
  '6. Address the user the way the original does (polite/neutral form).',
  '7. If "current" already holds a correct translation, copy it into "translation".',
  '8. Return the whole file as valid JSON, UTF-8, same structure.',
];

function parseArgs(argv) {
  const out = { lang: null, all: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--out') out.file = argv[++i];
    else if (!out.lang && /^[a-z]{2}$/.test(a)) out.lang = a;
    else throw new Error(`непонятный аргумент: ${a}`);
  }
  if (!out.lang) throw new Error('укажите код языка, например: node scripts/i18n-export.mjs de');
  if (out.lang === BASE) throw new Error('ru — язык оригинала, его не переводят');
  return out;
}

/** Тот же обход, что в check-i18n-coverage.mjs: новый словарь попадает сам. */
async function findDictionaries() {
  const found = [];
  const targets = [join('shared', 'i18n')];
  for (const entry of await readdir(ROOT, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'shared' && !entry.name.startsWith('.')
        && entry.name !== 'node_modules') {
      targets.push(join(entry.name, 'i18n'));
    }
  }
  for (const target of targets) {
    let files;
    try { files = await readdir(join(ROOT, target)); } catch { continue; }
    for (const file of files) if (file.endsWith('.js')) found.push(join(target, file));
  }
  return found.sort();
}

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
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: rel });
  if (!store[BASE]) throw new Error(`${rel}: словарь не отдал секцию ru`);
  return store;
}

function isMissing(value, lang) {
  if (typeof value !== 'string' || !value.trim()) return true;
  return !CYRILLIC_LANGS.includes(lang) && CYRILLIC.test(value);
}

const args = (() => {
  try { return parseArgs(process.argv.slice(2)); }
  catch (err) { console.error(`i18n-export: ${err.message}`); process.exit(1); }
})();

const entries = [];
let total = 0;
for (const rel of await findDictionaries()) {
  const dict = await loadDictionary(rel);
  const target = dict[args.lang] || {};
  for (const [key, ru] of Object.entries(dict[BASE])) {
    if (typeof ru !== 'string') continue;
    total++;
    const current = Object.prototype.hasOwnProperty.call(target, key) ? target[key] : null;
    if (!args.all && !isMissing(current, args.lang)) continue;
    entries.push({
      key,
      file: rel,
      placeholders: [...new Set(ru.match(PLACEHOLDER) || [])],
      ru,
      uk: dict.uk && typeof dict.uk[key] === 'string' ? dict.uk[key] : null,
      current,
      translation: '',
    });
  }
}

const now = new Date();
const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map((n) => String(n).padStart(2, '0')).join('-');   // местная дата, не UTC
const file = args.file || `i18n-export-${args.lang}-${date}.json`;
const payload = {
  format: 'circuit-workspace-i18n-export/1',
  targetLanguage: args.lang,
  sourceLanguage: BASE,
  mode: args.all ? 'all' : 'missing',
  exportedAt: date,
  instructions: INSTRUCTIONS,
  count: entries.length,
  entries,
};
await writeFile(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`i18n-export: ${entries.length} из ${total} строк → ${file}`);
