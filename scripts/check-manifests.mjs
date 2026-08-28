#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-manifests.mjs
 *
 * ЧТО ПРОВЕРЯЕТ. Манифесты хаба и модулей: область (`scope`), идентичность
 * (`id`), стартовый адрес и наличие файлов иконок.
 *
 * ГЛАВНОЕ, РАДИ ЧЕГО ЗАВЕДЕНА — ЛОВУШКА `id`. Два соседних члена манифеста
 * разрешаются от РАЗНЫХ баз, и это не интуитивно:
 *
 *   `scope`     → от адреса САМОГО МАНИФЕСТА. `"./"` в
 *                 `/Circuit-Workspace/documents/manifest.json` даёт
 *                 `/Circuit-Workspace/documents/` — то есть ровно то,
 *                 что ожидаешь.
 *   `id`        → от ORIGIN, а не от папки приложения. Спецификация W3C
 *                 говорит об этом прямо: `"../foo"`, `"foo"`, `"/foo"` и
 *                 `"./foo"` дают ОДИН И ТОТ ЖЕ идентификатор, и рекомендует
 *                 всегда писать ведущий `/`.
 *
 * Отсюда дефект, найденный 28.08.2026: `circuit-planner/manifest.webmanifest`
 * объявляет `"id": "./"`, и это КОРЕНЬ ORIGIN, а не папка Клиндария. Любое
 * второе приложение на том же origin с таким же `"./"` заявит ту же
 * идентичность. Ошибка молчаливая: ни консоли, ни предупреждения — просто
 * два приложения считаются одним.
 *
 * ЧТО ПРОВЕРЯЕТСЯ.
 *   §1 `scope` объявлен явно. Умолчание (start_url без имени файла) работает,
 *      но молча меняется вместе со start_url.
 *   §2 `id`, если объявлен, начинается с `/`. Относительная форма — ловушка
 *      выше. Отсутствие `id` — не ошибка: тогда идентичностью служит start_url.
 *   §3 `start_url` лежит внутри `scope` — иначе браузер отбрасывает `scope`
 *      целиком и молча берёт умолчание.
 *   §4 Файлы иконок и `apple-touch-icon` существуют на диске.
 *   §5 Каждая страница, ссылающаяся на манифест, ссылается на существующий.
 *
 * ГРАНИЦЫ, ЧЕСТНО.
 * - Проверка НЕ знает адреса развёртывания: в репозитории он нигде не записан.
 *   Поэтому она не может сказать, ПРАВИЛЬНЫЙ ли путь у `id`, — только что он
 *   не относительный. Отличить `/Circuit-Workspace/` от `/` может лишь тот,
 *   кто знает, где открыт хаб.
 * - Размеры иконок не сверяются с объявленными `sizes` — файл проверяется на
 *   существование, а не на содержимое.
 */

import { readdir, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const notes = [];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Найти манифесты обходом, а не списком: новый модуль обязан попадать сам. */
async function findManifests() {
  const found = [];
  const entries = await readdir(ROOT, { withFileTypes: true });
  const dirs = ['.', ...entries.filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'docs' && e.name !== 'scripts').map((e) => e.name)];
  for (const dir of dirs) {
    let files;
    try {
      files = await readdir(join(ROOT, dir));
    } catch {
      continue;
    }
    for (const file of files) {
      if (file === 'manifest.json' || file === 'manifest.webmanifest') {
        found.push(dir === '.' ? file : `${dir}/${file}`);
      }
    }
  }
  return found.sort();
}

/** Разрешить относительный путь от каталога манифеста. */
function underDir(rel, target) {
  const dir = dirname(rel) === '.' ? '' : dirname(rel);
  return join(ROOT, dir, target.replace(/^\.\//, '').split('?')[0].split('#')[0]);
}

const manifests = await findManifests();
if (!manifests.length) {
  console.error('Проверка манифестов: не найдено ни одного — сломан обход каталогов');
  process.exit(1);
}

console.log('Манифесты: область, идентичность, иконки\n');

for (const rel of manifests) {
  let data;
  try {
    data = JSON.parse(await readFile(join(ROOT, rel), 'utf8'));
  } catch (err) {
    errors.push(`${rel}: не разобран как JSON — ${err.message}`);
    console.log(`  ✗ ${rel}: не разобран`);
    continue;
  }

  const local = [];

  // §1 scope
  if (typeof data.scope !== 'string' || !data.scope) {
    local.push('нет scope — область задаётся умолчанием и молча поедет вслед за start_url');
  }

  // §2 id
  if ('id' in data) {
    if (typeof data.id !== 'string' || !data.id.startsWith('/')) {
      local.push(
        `id = ${JSON.stringify(data.id)} — разрешается от ORIGIN, а не от папки модуля, ` +
        'то есть указывает на корень сайта. Нужен путь с ведущим «/»'
      );
    }
  } else {
    notes.push(`${rel}: id не объявлен — идентичностью служит start_url (допустимо)`);
  }

  // §3 start_url внутри scope
  if (typeof data.start_url === 'string' && typeof data.scope === 'string' && data.scope) {
    const scopeDir = resolve(underDir(rel, data.scope));
    const startFile = resolve(underDir(rel, data.start_url));
    const rel2 = relative(scopeDir, startFile);
    if (rel2.startsWith('..')) {
      local.push(`start_url ${JSON.stringify(data.start_url)} вне scope ${JSON.stringify(data.scope)} — браузер отбросит scope целиком`);
    }
  }

  // §4 иконки существуют
  for (const icon of data.icons || []) {
    if (!icon || typeof icon.src !== 'string') continue;
    if (!(await exists(underDir(rel, icon.src)))) {
      local.push(`иконка не найдена на диске: ${icon.src}`);
    }
  }

  if (local.length) {
    console.log(`  ✗ ${rel}`);
    for (const line of local) {
      console.log(`      ${line}`);
      errors.push(`${rel}: ${line}`);
    }
  } else {
    console.log(`  ✓ ${rel.padEnd(38)} scope ${JSON.stringify(data.scope)}${'id' in data ? `, id ${JSON.stringify(data.id)}` : ''}`);
  }
}

/* §5 ссылки из разметки */
console.log('\nСсылки из разметки');
const pages = [];
for (const dir of ['.', ...(await readdir(ROOT, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules').map((e) => e.name)]) {
  let files;
  try {
    files = await readdir(join(ROOT, dir));
  } catch {
    continue;
  }
  for (const file of files) {
    if (file.endsWith('.html')) pages.push(dir === '.' ? file : `${dir}/${file}`);
  }
}

let linked = 0;
for (const page of pages) {
  const html = await readFile(join(ROOT, page), 'utf8');
  const m = html.match(/<link[^>]+rel=["']manifest["'][^>]*>/i);
  if (!m) continue;
  const href = (m[0].match(/href=["']([^"']+)["']/) || [])[1];
  if (!href) {
    errors.push(`${page}: <link rel="manifest"> без href`);
    console.log(`  ✗ ${page}: без href`);
    continue;
  }
  linked += 1;
  if (!(await exists(underDir(page, href)))) {
    errors.push(`${page}: манифест ${href} не существует`);
    console.log(`  ✗ ${page} → ${href} (нет файла)`);
  }
}
console.log(`  ✓ проверено ссылок: ${linked}`);

console.log('');
for (const note of notes) console.log(`Замечание: ${note}`);

if (errors.length) {
  console.error(`\nПроверка манифестов не пройдена:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`\nВсе ${manifests.length} манифестов в порядке.`);
}
