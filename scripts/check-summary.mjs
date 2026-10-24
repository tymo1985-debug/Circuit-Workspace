#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-summary.mjs
 *
 * Договор сводок модулей для «Сегодня» хаба (shared/summary.js, Ф5
 * визуального аудита 24.10.2026). Проверяет статически:
 *  - общий файл на месте и подключён там, где пишут и читают сводку;
 *  - Клиндарий и Конгрессы публикуют сводку под своим id и с полями договора;
 *  - хаб читает данные модулей ТОЛЬКО через CWSummary — не лезет в их базы
 *    и ключи (инвариант ARCHITECTURE.md, раздел 6);
 *  - сводка не попала в резервную копию (она производная).
 *
 *   node scripts/check-summary.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++; console.log('  ✗ ' + label + (extra ? '\n      ' + extra : ''));
};

console.log('\nСводки модулей для хаба');
ok('shared/summary.js на месте', existsSync(join(ROOT, 'shared/summary.js')));
const lib = read('shared/summary.js');
ok('ключ cw-summary: и версия формата объявлены', /PREFIX = 'cw-summary:'/.test(lib) && /VERSION = \d+/.test(lib));

for (const [page, label] of [['index.html', 'хаб'], ['circuit-planner/index.html', 'Клиндарий'], ['congress-project/index.html', 'Конгрессы']]) {
  ok(label + ': summary.js подключён', read(page).includes('shared/summary.js'));
}
for (const [sw, label] of [['service-worker.js', 'хаб'], ['circuit-planner/sw.js', 'Клиндарий'], ['congress-project/service-worker.js', 'Конгрессы']]) {
  ok(label + ': summary.js в прекэше worker’а', read(sw).includes('shared/summary.js'));
}

const planner = read('circuit-planner/app.js');
ok("Клиндарий публикует 'circuit-planner' { visits }", /CWSummary\.publish\('circuit-planner', \{ visits \}\)/.test(planner));
ok('Клиндарий: поля посещения title/start/end', /return \{ title: [^}]*start: entry\.start, end: entry\.end \}/.test(planner));
const congress = read('congress-project/js/state.js');
ok('Конгрессы публикуют "congress-project" { congresses }', /CWSummary\.publish\("congress-project",\{congresses:list\}\)/.test(congress));
ok('Конгрессы: поля name/place/date/responseDeadline', /name:c\.name\|\|"",place:c\.place\|\|"",date:c\.date,responseDeadline:/.test(congress));

const hub = read('hub.js');
ok('хаб читает сводки через CWSummary.read', /CWSummary\.read\('circuit-planner'\)/.test(hub) && /CWSummary\.read\('congress-project'\)/.test(hub));
ok('хаб не читает базы и ключи модулей', !/service-year-planner|congress-pwa|getRecord\(['"]state|['"]state['"]\s*\)/.test(hub));

ok('сводка не входит в резервную копию', !read('shared/backup.js').includes('cw-summary'));

if (failed) { console.log('\n✗ Сводки: ' + failed + ' нарушений'); process.exit(1); }
console.log('\n✓ Договор сводок соблюдён');
