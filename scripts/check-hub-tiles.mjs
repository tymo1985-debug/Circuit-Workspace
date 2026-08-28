#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-hub-tiles.mjs
 *
 * ЧТО ЛОВИТ. Расхождение между плитками рабочего яруса на главном экране и
 * реестром модулей `CW_MODULES` в `shared/version.js`: плитку без записи в
 * реестре, запись в реестре без плитки, плитку без `data-module`, плитку без
 * слота `data-module-version`, а также ссылку плитки на несуществующий файл.
 *
 * ЗАЧЕМ. Версии на плитках проставляются в рантайме по `data-module`
 * (index.html: обход `Object.keys(CW_MODULES)`). Промах ключа не роняет
 * страницу и не пишет в консоль: `querySelector` возвращает null, функция
 * молча выходит, и плитка остаётся БЕЗ номера версии — ровно то состояние,
 * из-за которого номера когда-то вписывали в разметку руками и они отставали
 * от реальности. Обратная сторона — модуль, добавленный в реестр, но забытый
 * на главной: он существует, обновляется, попадает в резервную копию, и его
 * просто некуда открыть.
 *
 * Отдельный повод для этой проверки — раскладка. С 28.08.2026 рёбра шины
 * строятся скриптом по ФАКТИЧЕСКОМУ числу плиток, а число колонок широкого
 * экрана считается от него же (правило «ряда из одной плитки не бывает»).
 * Значит, число плиток стало входными данными раскладки, и рассогласование
 * с реестром теперь портит не только подпись, но и геометрию платы.
 *
 *   node scripts/check-hub-tiles.mjs
 *
 * Коды возврата: 0 — чисто; 1 — есть расхождение.
 *
 * ПОЧЕМУ РЕГУЛЯРКИ, А НЕ jsdom. Проверять надо ИСХОДНУЮ разметку, а не
 * результат её исполнения: скрипт страницы как раз и сглаживает такие
 * промахи молчанием. Плюс jsdom не нужен как зависимость там, где хватает
 * разбора атрибутов.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUB = path.join(ROOT, 'index.html');
const VERSION = path.join(ROOT, 'shared', 'version.js');

const problems = [];
const notes = [];

const html = fs.readFileSync(HUB, 'utf8');
const versionSrc = fs.readFileSync(VERSION, 'utf8');

/* --- Реестр модулей ------------------------------------------------------
   version.js — обычный скрипт, присваивающий self.CW_MODULES. Исполнять его
   ради одного объекта незачем: достаточно вытащить ключи верхнего уровня. */
const registryBlock = versionSrc.slice(versionSrc.indexOf('CW_MODULES'));
const registry = [...registryBlock.matchAll(/^\s{2}'([a-z0-9-]+)':\s*\{/gm)].map((m) => m[1]);

if (!registry.length) {
  problems.push('не удалось прочитать CW_MODULES из shared/version.js');
}

/* --- Плитки рабочего яруса ----------------------------------------------
   Границы яруса берём по секции: системные карточки (резервное копирование
   и будущие настройки) модулями не являются и в реестре их быть не должно. */
// Ищем именно РАЗМЕТКУ секции, а не имя класса: те же имена встречаются выше
// в блоке стилей, и поиск по голому 'cw-tier--work' вырезал бы кусок CSS.
const tierStart = html.indexOf('class="cw-tier cw-tier--work"');
const tierEnd = html.indexOf('class="cw-tier cw-tier--system"');
if (tierStart === -1 || tierEnd === -1 || tierEnd < tierStart) {
  problems.push('в index.html не найдены секции ярусов (cw-tier--work / cw-tier--system)');
}

const tierHtml = html.slice(Math.max(tierStart, 0), tierEnd === -1 ? html.length : tierEnd);
const links = [...tierHtml.matchAll(/<a\s+class="cw-tile-link"[\s\S]*?<\/a>/g)].map((m) => m[0]);

const tiles = links.map((markup) => ({
  markup,
  module: (markup.match(/data-module="([^"]+)"/) || [])[1] || null,
  href: (markup.match(/href="([^"]+)"/) || [])[1] || null,
  hasVersionSlot: markup.includes('data-module-version'),
}));

if (!tiles.length) problems.push('в рабочем ярусе не найдено ни одной плитки');

for (const tile of tiles) {
  if (!tile.module) {
    problems.push('плитка без data-module (href=' + (tile.href || '?') + ')');
    continue;
  }
  if (!tile.hasVersionSlot) {
    problems.push(tile.module + ': нет слота data-module-version — версия не проставится');
  }
  if (!registry.includes(tile.module)) {
    problems.push(tile.module + ': плитка есть, записи в CW_MODULES нет — версия останется пустой');
  }
  if (tile.href && !fs.existsSync(path.join(ROOT, tile.href))) {
    problems.push(tile.module + ': ссылка ведёт на несуществующий файл ' + tile.href);
  }
}

const onBoard = tiles.map((t) => t.module).filter(Boolean);
for (const id of registry) {
  if (!onBoard.includes(id)) {
    problems.push(id + ': есть в CW_MODULES, но плитки на главной нет — модуль негде открыть');
  }
}

/* --- Раскладка -----------------------------------------------------------
   Повторяем правило страницы и показываем, как ляжет плата: это не проверка,
   а материал для глаз при добавлении модуля. */
const wideCols = (n) => (n % 4 === 1 ? 3 : 4);
const rowSizes = (total, cols) => {
  const sizes = [];
  for (let left = total; left > 0; left -= cols) sizes.push(Math.min(cols, left));
  if (cols >= 3 && sizes.length > 1 && sizes[sizes.length - 1] === 1) {
    sizes[sizes.length - 2] -= 1;
    sizes[sizes.length - 1] = 2;
  }
  return sizes;
};

const n = onBoard.length;
if (n) {
  const cols = wideCols(n);
  const sizes = rowSizes(n, cols);
  notes.push('модулей ' + n + ' → ' + cols + ' колонки, ряды ' + sizes.join('+'));
  if (sizes.length > 1 && sizes[sizes.length - 1] === 1) {
    problems.push('раскладка вырождается: последний ряд из одной плитки при ' + n + ' модулях');
  }
}

/* --- Вывод --------------------------------------------------------------- */
console.log('Плитки хаба и реестр модулей\n');
console.log('  Реестр CW_MODULES: ' + registry.join(', '));
console.log('  Плитки на главной: ' + onBoard.join(', '));
notes.forEach((note) => console.log('  ' + note));
console.log('');

if (problems.length) {
  console.log('Расхождения:');
  problems.forEach((p) => console.log('  ✗ ' + p));
  console.log('\nПровалено: ' + problems.length);
  process.exit(1);
}

console.log('  ✓ каждая плитка есть в реестре и наоборот');
console.log('  ✓ у каждой плитки есть слот версии и существующая ссылка');
console.log('  ✓ раскладка не вырождается в ряд из одной плитки');
console.log('\nРасхождений нет.');
