#!/usr/bin/env node
/**
 * check-context-budget.mjs — храповик расхода AI-контекста.
 *
 * Заведена 30.08.2026 по итогам `docs/context/01-ai-context-audit.md`:
 * `AGENTS.md` вырос до 413 КБ и читался перед каждой задачей, из-за чего
 * мелкая правка обходилась в ~186 000 токенов служебного чтения. Без храповика
 * файл вырастет обратно за несколько месяцев — история туда дописывается
 * естественным ходом работы, и никто не заметит момент.
 *
 * Проверяет три вещи:
 *   1. Размер `AGENTS.md`: предупреждение после 16 КБ, провал после 20 КБ.
 *   2. Новые чрезмерно большие `.md` и `.js` вне известных исключений.
 *   3. Data-only файлы, не покрытые `.aiignore`.
 *
 * ⚠️ ЕДИНИЦА ИЗМЕРЕНИЯ — СИМВОЛЫ, НЕ БАЙТЫ (решение Алекса, 30.08.2026).
 * Контекст модели расходуется по символам/токенам, а кириллица в UTF-8
 * занимает 2 байта на символ: байтовый порог урезал бы русский текст ровно
 * вдвое против английского при одинаковой реальной стоимости.
 *
 * РЕШЕНИЕ ГЕЙТ ПРИНИМАЕТ ПО СИМВОЛАМ. Размер в байтах печатается рядом
 * СПРАВОЧНО — чтобы цифры сходились с `ls`/`du` и потом не возникало путаницы,
 * что именно измеряется. Формат вывода:
 *     AGENTS.md: 12.0K chars / 18.6 KB UTF-8 — OK
 * Байты ни на что не влияют и в сравнениях не участвуют.
 *
 * Коды возврата: 0 — прошло (в том числе с предупреждениями), 1 — провал.
 * Предупреждение НЕ возвращает 2: двойка в `check-all.mjs` означает «проверка
 * не выполнена», и смешивать с ней «файл растёт» нельзя — потеряется сигнал.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KB = 1024;

/** Пороги для AGENTS.md, в СИМВОЛАХ. Менять только с явной записанной
 *  причиной — как порог check-doclang.mjs (150 → 120 при легальном похудении
 *  словаря 09.08.2026). Иначе проверка перестанет ловить то, ради чего
 *  заведена. */
const AGENTS_WARN = 16 * KB;
const AGENTS_FAIL = 20 * KB;

/** Порог «подозрительно большой файл» для новых .md и .js. */
const MD_WARN = 40 * KB;
const JS_WARN = 150 * KB;

/** Известные крупные файлы: архивы истории, аудиты и монолиты, про которые мы
 *  уже знаем. Появление НОВОГО имени вне этого списка — то, что проверка ловит.
 *  Пополнять осознанно: каждая строка здесь — согласие, что файл большой. */
const KNOWN_LARGE = new Set([
  'CHANGELOG.md',
  'TODO.md',
  'IDEAS.md',
  'ARCHITECTURE.md',
  'circuit-planner/app.js',
  'circuit-planner/i18n/dict.js',
  'pioneer-school/i18n/dict.js',
  'congress-project/i18n/dict.js',
  'shared/backup.js',
  'shared/db.js',
]);

/** Каталоги, где большие файлы — норма по назначению. */
const LARGE_OK_DIRS = ['docs/journal', 'docs/audit', 'docs/design-system',
  'docs/context', 'docs/changelog', 'docs/todo-archive', 'docs/db-migration',
  'docs/documents', 'docs/print', 'docs/design-tokens'];

const SKIP_DIRS = new Set(['.git', 'node_modules', '.github']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full).split(sep).join('/'));
  }
  return out;
}

/** Data-only признак — тот же, что описан в AGENTS.md «❌ Что не читать»:
 *  путь в vendor/ или fonts/, минифицированный вывод, растр, либо строка
 *  длиннее 5000 символов / присваивание window.*_B64. Последние два требуют
 *  чтения файла, поэтому читаем только .js и только если он крупный. */
function isDataOnly(path) {
  if (/(^|\/)vendor\//.test(path)) return 'vendor';
  if (/(^|\/)fonts\//.test(path) && path.endsWith('.js')) return 'шрифт';
  if (/\.min\.(js|css)$/.test(path)) return 'минифицирован';
  if (/\.(png|jpe?g|ico|webp|woff2?|ttf)$/.test(path)) return 'растр/шрифт';
  if (path.endsWith('.js')) {
    let size = 0;
    try { size = statSync(join(ROOT, path)).size; } catch { return null; }
    if (size < 100 * KB) return null;
    const text = readFileSync(join(ROOT, path), 'utf8');
    if (/window\.[A-Z0-9_]+_B64\s*=\s*'/.test(text)) return 'base64';
    if (text.split('\n').some((l) => l.length > 5000)) return 'строка >5000 симв.';
  }
  return null;
}

function parseAiignore() {
  const p = join(ROOT, '.aiignore');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** Очень маленький матчер: нам хватает `**`, `*` и точного пути. Полноценный
 *  glob тянуть незачем — список в .aiignore короткий и пишется руками.
 *  Семантика как в .gitignore: шаблон БЕЗ слеша применяется к имени файла на
 *  любом уровне вложенности (`*.png` обязан ловить `documents/icons/x.png`),
 *  шаблон СО слешем — к пути от корня. Без этой развилки первый же прогон
 *  объявил непокрытыми 30 иконок, которые в списке есть. */
function covered(path, patterns) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return patterns.some((pat) => {
    const rx = new RegExp('^' + pat
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0000/g, '.*') + '$');
    return pat.includes('/') ? rx.test(path) : rx.test(base);
  });
}

let failed = false;
let warned = 0;

// ── 1. Размер AGENTS.md ────────────────────────────────────────────────────
const agentsPath = join(ROOT, 'AGENTS.md');
if (!existsSync(agentsPath)) {
  console.log('  ПРОВАЛ: AGENTS.md отсутствует');
  failed = true;
} else {
  const text = readFileSync(agentsPath, 'utf8');
  const chars = text.length;
  const bytes = Buffer.byteLength(text, 'utf8');
  // Решение — по символам; байты справочно. Единица названа в самой строке,
  // чтобы из вывода было видно, что с чем сравнивалось.
  const fmt = `${(chars / KB).toFixed(1)}K chars / ${(bytes / KB).toFixed(1)} KB UTF-8`;
  if (chars > AGENTS_FAIL) {
    console.log(`  ПРОВАЛ: AGENTS.md: ${fmt} — превышен жёсткий порог ${AGENTS_FAIL / KB}K chars.`);
    console.log('          Историю переносить в docs/journal/, а не дописывать сюда.');
    failed = true;
  } else if (chars > AGENTS_WARN) {
    console.log(`  ⚠ AGENTS.md: ${fmt} — выше мягкого порога ${AGENTS_WARN / KB}K chars.`);
    console.log('    Файл читается перед каждой задачей. Пора выносить в docs/journal/.');
    warned++;
  } else {
    console.log(`  ✓ AGENTS.md: ${fmt} — OK (пороги ${AGENTS_WARN / KB}K warn / ${AGENTS_FAIL / KB}K fail, по символам)`);
  }
}

// ── 2. Новые чрезмерно большие .md и .js ───────────────────────────────────
const files = walk(ROOT);
const bigNew = [];
for (const f of files) {
  if (KNOWN_LARGE.has(f)) continue;
  if (LARGE_OK_DIRS.some((d) => f.startsWith(d + '/'))) continue;
  if (!/\.(md|js)$/.test(f)) continue;
  if (isDataOnly(f)) continue;
  const chars = readFileSync(join(ROOT, f), 'utf8').length;
  const limit = f.endsWith('.md') ? MD_WARN : JS_WARN;
  if (chars > limit) bigNew.push([f, chars, limit]);
}
if (bigNew.length) {
  console.log(`\n  ⚠ Крупные файлы вне известного списка: ${bigNew.length}`);
  for (const [f, chars, limit] of bigNew) {
    const b = Buffer.byteLength(readFileSync(join(ROOT, f), 'utf8'), 'utf8');
    console.log(`    ${f}: ${(chars / KB).toFixed(1)}K chars / ${(b / KB).toFixed(1)} KB UTF-8 (порог ${limit / KB}K chars)`);
  }
  console.log('    Либо разрезать, либо осознанно добавить в KNOWN_LARGE этой проверки.');
  warned++;
} else {
  console.log('  ✓ Новых чрезмерно больших .md/.js нет');
}

// ── 3. Data-only файлы вне .aiignore ───────────────────────────────────────
const patterns = parseAiignore();
if (!patterns) {
  console.log('\n  ПРОВАЛ: .aiignore отсутствует — список «что не читать» потерян');
  failed = true;
} else {
  const uncovered = [];
  for (const f of files) {
    const kind = isDataOnly(f);
    if (kind && !covered(f, patterns)) uncovered.push([f, kind]);
  }
  if (uncovered.length) {
    console.log(`\n  ⚠ Data-only файлы вне .aiignore: ${uncovered.length}`);
    for (const [f, kind] of uncovered.slice(0, 12)) console.log(`    ${f} — ${kind}`);
    if (uncovered.length > 12) console.log(`    …и ещё ${uncovered.length - 12}`);
    console.log('    Дописать шаблон в .aiignore, иначе файл однажды прочитают целиком.');
    warned++;
  } else {
    console.log('  ✓ Все data-only файлы покрыты .aiignore');
  }
}

console.log('');
if (failed) {
  console.log('Бюджет контекста превышен.');
  process.exit(1);
}
console.log(warned
  ? `Провалов нет, но есть предупреждения: ${warned}. Разобрать до того, как станет провалом.`
  : 'Бюджет контекста в норме.');
process.exit(0);
