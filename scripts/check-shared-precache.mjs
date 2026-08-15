#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-shared-precache.mjs
 *
 * Один вопрос: если страница модуля подключает файл общего слоя, лежит ли этот
 * файл в прекэше его service worker'а.
 *
 * ЗАЧЕМ ЭТА ПРОВЕРКА СУЩЕСТВУЕТ. Класс багов уже срабатывал и обошёлся дорого.
 * 10.08.2026 выяснилось, что `circuit-planner/index.html` не подключал
 * `shared/version.js`: на интерфейс это не влияло вообще, поэтому выглядело
 * косметикой, — но `shared/backup.js` читает оттуда версии, и ВСЕ резервные
 * копии, сделанные из Клиндария, месяцами уезжали с пустой версией. Ошибка
 * бесшумная, а обнаруживается в момент восстановления, то есть когда
 * восстанавливать уже нечем.
 *
 * Здесь ловится вторая половина той же ошибки: файл подключён в разметке, но
 * забыт в прекэше. Онлайн всё работает, и заметить нечего; офлайн (а модули
 * этого проекта — офлайн-приложения) страница поднимается без него. Для
 * `shared/persist.js` это означало бы, что офлайн запись состояния идёт по
 * запасному пути — то есть тот самый разряд отказов, который виден не сразу.
 *
 * ЧТО ПРОВЕРЯЕТСЯ НЕ БУКВОЙ, А СМЫСЛОМ. Пути в разметке (`../shared/x.js`) и
 * в прекэше (`'../shared/x.js'`) сравниваются по ИМЕНИ ФАЙЛА: у Клиндария и
 * Конгрессов списки записаны по-разному, и сверка строк давала бы ложные
 * срабатывания на форме записи, а не на сути.
 *
 * ЧЕГО ПРОВЕРКА НЕ ДЕЛАЕТ. Она не смотрит собственные файлы модуля и внешние
 * CDN: первые уже покрыты обычным аудитом ассетов, вторые кэшируются по
 * отдельным правилам и в прекэш попадают не всегда намеренно.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Модуль → его разметка и его service worker. */
const MODULES = [
  { id: 'congress-project', html: 'congress-project/index.html', sw: 'congress-project/service-worker.js' },
  { id: 'circuit-planner',  html: 'circuit-planner/index.html',  sw: 'circuit-planner/sw.js' },
  { id: 'pioneer-school',   html: 'pioneer-school/index.html',   sw: 'pioneer-school/sw.js' },
  { id: 'appointments',     html: 'appointments/index.html',     sw: 'appointments/sw.js' },
  { id: 'documents',        html: 'documents/index.html',        sw: 'documents/sw.js' },
];

/**
 * Пара, которую нельзя разрывать: модуль, подключающий левый файл, обязан
 * подключать и правый. Проверяется по разметке, а не по прекэшу — забывают
 * обычно именно в разметке.
 *
 * `backup.js` читает `CW_VERSION`/`CW_MODULES` при сборке снимка. Без
 * `version.js` копия уезжает без единственного признака, по которому потом
 * отличают, из какой версии она сделана.
 */
const REQUIRED_PAIRS = [['backup.js', 'version.js']];

let failures = 0;
let checked = 0;

function shared(list) {
  return list.filter((p) => p.includes('shared/')).map((p) => basename(p));
}

console.log('Прекэш общего слоя\n');

for (const mod of MODULES) {
  const htmlPath = join(ROOT, mod.html);
  const swPath = join(ROOT, mod.sw);
  if (!existsSync(htmlPath) || !existsSync(swPath)) {
    console.log(`  ⚠ ${mod.id}: нет ${!existsSync(htmlPath) ? mod.html : mod.sw} — пропущено`);
    continue;
  }
  const html = readFileSync(htmlPath, 'utf8');
  const sw = readFileSync(swPath, 'utf8');

  /* Разметка: и <script src>, и <link href> — общий слой это не только js. */
  const inHtml = shared([
    ...[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...html.matchAll(/<link[^>]+href=["']([^"']+)["']/g)].map((m) => m[1]),
  ]);

  /* SW: любые строковые литералы с shared/ — и в списке прекэша, и в
     importScripts. Второе тоже считается подключением: у Клиндария версия
     приезжает именно так.
     ⚠ Класс символов ОБЯЗАН запрещать перевод строки. Без `\n` в нём разбор
     цепляется за апостроф внутри русского комментария («service worker'а») и
     склеивает половину файла в одну «строку» — style.css при этом
     «пропадает», и проверка падает на ровном месте. Поймано на первом же
     прогоне этой проверки. */
  const inSw = shared([...sw.matchAll(/['"]([^'"\n]*shared\/[^'"\n]+)['"]/g)].map((m) => m[1]));

  const missing = [...new Set(inHtml)].filter((f) => !inSw.includes(f));
  checked++;
  if (missing.length) {
    failures++;
    console.log(`  ✗ ${mod.id}: подключено в разметке, но нет в прекэше — ${missing.join(', ')}`);
  } else {
    console.log(`  ✓ ${mod.id}: все ${new Set(inHtml).size} файла(ов) общего слоя в прекэше`);
  }

  for (const [needs, dep] of REQUIRED_PAIRS) {
    if (inHtml.includes(needs) && !inHtml.includes(dep)) {
      failures++;
      console.log(`  ✗ ${mod.id}: подключает ${needs}, но не подключает ${dep} — копии уедут без версий`);
    }
  }
}

console.log('');
if (failures) {
  console.log(`Провалов: ${failures}. Выпускать нельзя.`);
  process.exit(1);
}
console.log(`Проверено модулей: ${checked}. Расхождений нет.`);
