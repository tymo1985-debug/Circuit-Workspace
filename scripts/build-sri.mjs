#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/build-sri.mjs
 *
 * Считает `integrity` для внешних скриптов, подключённых с CDN.
 *
 * ─── ЗАЧЕМ ─────────────────────────────────────────────────────────────────
 *
 * Семь тегов в трёх файлах разметки тянут код с cdnjs и jsdelivr без единого
 * атрибута `integrity`. Это единственный путь, которым в приложение может
 * попасть чужой код: компрометация CDN или подмена на пути (чужая сеть в
 * гостинице, кафе) даёт исполнение произвольного кода с полным доступом к
 * обеим базам и localStorage — адреса, телефоны, почта собраний, весь архив
 * писем. Усугубляет то, что оба service worker'а кладут ответ CDN в свой
 * кэш: подменённый один раз файл остаётся в офлайн-кэше навсегда.
 *
 * ─── ПОЧЕМУ ХЕШИ НЕЛЬЗЯ ВЗЯТЬ ИЗ npm ───────────────────────────────────────
 *
 * `integrity` обязан совпасть с БАЙТАМИ, которые отдаёт CDN. jsdelivr по пути
 * `/npm/` раздаёт содержимое пакета как есть, а cdnjs пересобирает свою копию
 * сам. Совпадение байтов вероятно, но не гарантировано, а цена ошибки —
 * браузер откажется исполнять скрипт, и выгрузка PDF умрёт в двух модулях.
 * Поэтому хеш считается по скачанному файлу, а не по копии из node_modules.
 *
 * ─── КАК ПОЛЬЗОВАТЬСЯ ──────────────────────────────────────────────────────
 *
 *   node scripts/build-sri.mjs            — напечатать готовые теги
 *   node scripts/build-sri.mjs --check    — сверить хеши с теми, что уже в разметке
 *   node scripts/build-sri.mjs --lock     — обновить scripts/sri-lock.json
 *
 * Нужна сеть. Скрипт ничего не правит: вывод копируется в разметку руками
 * либо передаётся тому, кто готовит выпуск. Так же устроен
 * build-pdf-font-subset.mjs — разовые инструменты не трогают файлы сами.
 *
 * ПОСЛЕ ПРАВКИ РАЗМЕТКИ: `crossorigin="anonymous"` обязателен рядом с
 * `integrity`, иначе браузер не сможет проверить ответ и просто заблокирует
 * скрипт. И помнить: SRI НЕ защищает `pdf.worker.min.js` — он подставляется
 * строкой в `GlobalWorkerOptions.workerSrc`, а не тегом `<script>`. Его надо
 * класть локально, отдельным шагом.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Где какой тег живёт — чтобы вывод можно было приложить к файлу, не ища. */
const TAGS = [
  { file: 'circuit-planner/index.html', url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' },
  { file: 'circuit-planner/index.html', url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js' },
  { file: 'circuit-planner/index.html', url: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js' },
  { file: 'circuit-planner/index.html', url: 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js' },
  { file: 'pioneer-school/index.html', url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' },
  { file: 'pioneer-school/index.html', url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js' },
  { file: 'pioneer-school/index.html', url: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' },
  { file: 'pioneer-school/register.html', url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' },
];

function sri(buf) {
  return 'sha384-' + createHash('sha384').update(buf).digest('base64');
}

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

const check = process.argv.includes('--check');
const lock = process.argv.includes('--lock');
const locked = {};
let failed = 0;
const seen = new Map();

for (const tag of TAGS) {
  let hash = seen.get(tag.url);
  if (!hash) {
    try {
      hash = sri(await fetchBytes(tag.url));
    } catch (e) {
      console.log('  ✗ ' + tag.url + ' — ' + e.message);
      failed++;
      continue;
    }
    seen.set(tag.url, hash);
  }

  locked[tag.url] = hash;

  if (check) {
    const html = readFileSync(join(ROOT, tag.file), 'utf8');
    const idx = html.indexOf(tag.url);
    const around = idx < 0 ? '' : html.slice(idx, html.indexOf('>', idx) + 1);
    const has = around.includes(hash);
    console.log((has ? '  ✓ ' : '  ✗ ') + tag.file + ' · ' + tag.url.split('/').pop());
    if (!has) {
      failed++;
      console.log('      ожидалось integrity="' + hash + '"');
    }
  } else {
    console.log('<!-- ' + tag.file + ' -->');
    console.log('<script src="' + tag.url + '" integrity="' + hash + '" crossorigin="anonymous"></script>');
  }
}

if (check) {
  console.log(failed ? `\nРасхождений: ${failed}` : '\nВсе integrity совпадают с тем, что отдаёт CDN.');
}

if (lock) {
  if (failed) {
    console.log('\nЗамок НЕ обновлён: часть файлов не скачалась, записывать неполный набор нельзя.');
  } else {
    writeFileSync(join(ROOT, 'scripts/sri-lock.json'), JSON.stringify(locked, null, 2) + '\n');
    console.log('\nscripts/sri-lock.json обновлён, адресов: ' + Object.keys(locked).length);
    console.log('Теперь проставить те же хеши в разметке — теги напечатаны выше.');
  }
}
process.exit(failed ? 1 : 0);
