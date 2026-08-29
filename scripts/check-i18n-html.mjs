#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-i18n-html.mjs
 *
 * Перевод, уходящий в `innerHTML`, обязан быть экранирован.
 *
 * ─── ЗАЧЕМ (29.08.2026, находка N-7 повторного аудита) ─────────────────────
 *
 * `CWI18n.apply()` намеренно не трогает `innerHTML`: перевод не должен уметь
 * вставлять разметку. Но модули строят куски интерфейса шаблонными строками, и
 * там перевод уходил в `innerHTML` сырым — в Клиндарии тридцать пять мест.
 *
 * Пока в словарях нет ни `<`, ни `&`, это ничего не ломает. Но словарь правят
 * НОСИТЕЛИ ЯЗЫКА, а не программисты, и первое же «M&K» или «<Не выбрано>» в
 * польском или немецком развалило бы разметку молча и только на одном языке —
 * то есть у того, кто правил, всё работало бы.
 *
 * ─── ПОЧЕМУ РАЗБОР, А НЕ ПОСТРОЧНЫЙ ПОИСК ──────────────────────────────────
 *
 * Первая редакция искала строкой и дала два ложных срабатывания из трёх:
 * `esc(p.name || t("..."))` — экранирование стоит не вплотную к вызову, а
 * `confirm(t("..."))` в Конгрессах попал под подозрение только потому, что
 * лежит в одной строке с чужим `innerHTML`: их код записан длинными
 * однострочниками, и «строка» там не единица смысла.
 *
 * Поэтому разбор настоящий. Ищется присваивание `X.innerHTML = …`, и внутри
 * ЕГО ВЫРАЖЕНИЯ — вызовы перевода, не обёрнутые в экранирование. Обёртка
 * засчитывается на любой глубине аргумента, что и снимает оба ложных случая.
 *
 * ЗАОДНО ЛОВИТСЯ СОСЕДНИЙ КЛАСС: `${…}` внутри ОБЫЧНОЙ строки (одинарные или
 * двойные кавычки) не подставляется — пользователь видит `${t("...")}`
 * буквально. Разбор это видит, построчный поиск — нет.
 *
 *   node scripts/check-i18n-html.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import * as acorn from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

/**
 * Ключи, чей перевод СОДЕРЖИТ разметку намеренно. Экранировать их значило бы
 * показать пользователю `<strong>` текстом. Подставляемые в них значения
 * экранируются по отдельности — проверено при заведении списка.
 * Список должен оставаться коротким: разметка в словаре — исключение.
 */
const MARKUP_KEYS = new Set(['cp.vf_language_note', 'cp.vf_language_mismatch',
  'vf_language_note', 'vf_language_mismatch']);

/** Имена, которые считаются экранированием. */
const SAFE = new Set(['esc', 'escapeHtml', 'tEsc', 'escapeAttr']);
/** Имена, которые считаются вызовом перевода. */
const T_NAMES = new Set(['t', 'tr_', 'tEsc']);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'scripts', 'vendor', 'shots']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js') || p.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Имя вызываемого: `t` → 't', `App.utils.t` → 't', `CWEscape.html` → 'html'. */
function calleeName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) return calleeName(node.property);
  return null;
}

/** Первый строковый аргумент вызова — ключ перевода. */
function firstString(node) {
  const a = node.arguments && node.arguments[0];
  return a && a.type === 'Literal' && typeof a.value === 'string' ? a.value : null;
}

/** Обход поддерева с переносом флага «мы внутри экранирования». */
function scan(node, safe, hits) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'CallExpression') {
    const name = calleeName(node.callee);
    if (!safe && T_NAMES.has(name) && name !== 'tEsc') {
      const key = firstString(node);
      if (!MARKUP_KEYS.has(key)) hits.push({ key: key || '?', start: node.start });
    }
    const nowSafe = safe || SAFE.has(name) || name === 'html';
    if (node.callee) scan(node.callee, safe, hits);
    (node.arguments || []).forEach((a) => scan(a, nowSafe, hits));
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((v) => scan(v, safe, hits));
    else if (value && typeof value.type === 'string') scan(value, safe, hits);
  }
}

/** Разобрать как модуль, при отказе — как скрипт. Проект смешанный. */
function parse(code) {
  const opts = { ecmaVersion: 2022, allowReturnOutsideFunction: true, locations: true };
  try { return acorn.parse(code, { ...opts, sourceType: 'module' }); }
  catch (e) { return acorn.parse(code, { ...opts, sourceType: 'script' }); }
}

/** Инлайновые скрипты из разметки: у хаба весь код живёт там. */
function sources(file) {
  const code = readFileSync(file, 'utf8');
  if (file.endsWith('.js')) return [{ code, offset: 0 }];
  const out = [];
  for (const m of code.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    out.push({ code: m[1], offset: m.index + m[0].indexOf(m[1]) });
  }
  return out;
}

console.log('\nПеревод в разметке');

let assignments = 0;
let raw = 0;
let literalHoles = 0;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  for (const part of sources(file)) {
    let tree;
    try { tree = parse(part.code); }
    catch (e) {
      ok(rel + ': разбирается', false, e.message + ' — проверка не смогла осмотреть файл');
      continue;
    }
    const line = (pos) => part.code.slice(0, pos).split('\n').length
      + (file.endsWith('.js') ? 0 : part.code.slice(0, 0).length);

    /* 1. innerHTML = … */
    const visit = (node) => {
      if (!node || typeof node.type !== 'string') return;
      if (node.type === 'AssignmentExpression'
        && node.left.type === 'MemberExpression'
        && calleeName(node.left) === 'innerHTML') {
        assignments++;
        const hits = [];
        scan(node.right, false, hits);
        hits.forEach((h) => {
          raw++;
          console.log('  ✗ ' + rel + ':' + line(h.start) + ' — перевод «' + h.key
            + '» уходит в innerHTML сырым\n'
            + '      вставлять перевод в разметку можно только экранированным '
            + '(в Клиндарии — App.utils.tEsc, в Конгрессах — esc(t(…))), '
            + 'либо ставить текст в textContent');
        });
      }
      /* 2. `${…}` в обычной строке — подстановки не будет, пользователь
            увидит выражение буквально. */
      if (node.type === 'Literal' && typeof node.value === 'string'
        && /\$\{[^}]*\b(?:t|tr_)\(/.test(node.value)) {
        literalHoles++;
        console.log('  ✗ ' + rel + ':' + line(node.start)
          + ' — `${…}` внутри обычной строки, а не шаблонной\n'
          + '      подстановки не будет: пользователь увидит выражение как есть. '
          + 'Нужны обратные кавычки');
      }
      for (const key of Object.keys(node)) {
        if (key === 'start' || key === 'end' || key === 'loc') continue;
        const value = node[key];
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value.type === 'string') visit(value);
      }
    };
    visit(tree);
  }
}

ok('присваивания innerHTML найдены', assignments > 0,
  'разбор ничего не нашёл — проверка перестала проверять');
failed += raw + literalHoles;
if (!raw) console.log('  ✓ незаэкранированного перевода в разметке нет');
if (!literalHoles) console.log('  ✓ подстановок в обычных строках нет');
console.log('  · осмотрено присваиваний innerHTML: ' + assignments);

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nПеревод доезжает до разметки экранированным.');
process.exit(failed ? 1 : 0);
