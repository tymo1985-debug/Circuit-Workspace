#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-local-today.mjs
 *
 * «Сегодня» берётся по местному времени, а не по UTC (аудит 03, P2-2).
 *
 * ПОЧЕМУ В ГЕЙТЕ. `new Date().toISOString().slice(0, 10)` — самая короткая
 * запись «сегодня», и она неверна: дата по UTC. С 00:00 до 02:00 летом (зимой
 * до 01:00) по Берлину/Праге/Варшаве ставилась вчерашняя дата — в письме,
 * в «отправлено», в имени файла копии. Дефект тихий и проявляется только
 * ночью, поэтому по ходу работы не виден. Класс уже повторялся в трёх модулях.
 *
 * Проверяется три вещи:
 *   1. `CWDates` из `shared/dates.js` отдаёт ЛОКАЛЬНУЮ дату (прогон в дочернем
 *      процессе с TZ=Europe/Berlin и TZ=America/Los_Angeles на моменте, где
 *      локальная и UTC-даты различаются);
 *   2. в коде нет «сегодня» через `new Date(...).toISOString().slice(0, 10)`
 *      (и substring/substr/split) — также `now.toISOString().slice(...)`;
 *   3. каждый модуль, использующий `CWDates`, подключает `shared/dates.js` в
 *      разметке (прекэш проверяет check-shared-precache.mjs).
 *
 * ЧЕГО НЕ ЛОВИТ. Двухшаговую запись (`const iso = new Date().toISOString();`
 * … `iso.slice(0, 10)` в другом месте). Круговую проверку даты
 * (`d.toISOString().slice(0, 10) === s`, где `d` — переменная) проверка
 * намеренно пропускает: это не «сегодня».
 *
 *   node scripts/check-local-today.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'scripts/check-local-today.mjs';

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

/* --- 1. Хелпер отдаёт местную дату ------------------------------------- */
console.log('\nЛокальная дата в общем слое');
const helperPath = join(ROOT, 'shared/dates.js');
ok('shared/dates.js на месте', existsSync(helperPath));
if (!existsSync(helperPath)) process.exit(1);

/* Моменты подобраны так, чтобы местная дата и дата по UTC различались. */
const CASES = [
  { tz: 'Europe/Berlin', at: '2026-06-30T22:30:00Z', want: '2026-07-01' },
  { tz: 'Europe/Berlin', at: '2026-01-15T23:30:00Z', want: '2026-01-16' },
  { tz: 'America/Los_Angeles', at: '2026-07-01T02:00:00Z', want: '2026-06-30' },
];
const probe = `
  const src = require('node:fs').readFileSync(process.argv[1], 'utf8');
  const sandbox = { self: {} };
  new Function('self', src)(sandbox.self);
  const D = sandbox.self.CWDates;
  const out = { d: D.fromDate(new Date(process.argv[2])), bad: D.fromDate(new Date('x')), today: D.today() };
  console.log(JSON.stringify(out));
`;
for (const c of CASES) {
  const r = spawnSync(process.execPath, ['-e', probe, helperPath, c.at], {
    env: { ...process.env, TZ: c.tz }, encoding: 'utf8',
  });
  let got = null;
  try { got = JSON.parse(r.stdout); } catch { /* ниже будет провал */ }
  ok(`${c.tz}: ${c.at} → ${c.want}`, !!got && got.d === c.want, r.stderr || (got && got.d));
  if (got) {
    ok(`${c.tz}: неверная дата → пусто`, got.bad === '');
    ok(`${c.tz}: today() — формат YYYY-MM-DD`, /^\d{4}-\d{2}-\d{2}$/.test(got.today));
  }
}

/* --- 2. «Сегодня» через UTC в коде запрещено --------------------------- */
console.log('\n«Сегодня» не через toISOString().slice(0, 10)');
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'fonts', 'docs', 'fixtures']);
const EXT = /\.(js|mjs|html)$/;

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out); continue; }
    if (EXT.test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}
const files = walk(ROOT, []).filter((f) => relative(ROOT, f).split(sep).join('/') !== SELF);

/* Приёмник — `new Date(...)` (аргументы с одним уровнем скобок: Date.now()) или
   переменная с именем today/now/current…, затем toISOString() и обрезка. */
const CUT = String.raw`\.toISOString\(\)\s*\.\s*(?:slice|substring|substr|split)\b`;
const BANNED = [
  new RegExp(String.raw`new\s+Date\((?:[^()]|\([^()]*\))*\)\s*` + CUT),
  new RegExp(String.raw`\b(?:today|now|current)\w*\s*` + CUT, 'i'),
];

const hits = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.length > 5000) return; // data-файл: правило «Что не читать»
    if (BANNED.some((re) => re.test(line))) {
      hits.push(relative(ROOT, f).split(sep).join('/') + ':' + (i + 1));
    }
  });
}
ok('нет «сегодня» по UTC (' + files.length + ' файлов)', hits.length === 0,
  hits.length ? 'использовать CWDates.today()/fromDate(): ' + hits.join(', ') : undefined);

/* --- 3. Потребитель CWDates подключает shared/dates.js ----------------- */
console.log('\nПодключение shared/dates.js');
const MODULES = ['congress-project', 'circuit-planner', 'pioneer-school', 'appointments', 'documents', 'journal', 'archive'];
for (const m of MODULES) {
  const used = files.some((f) => relative(ROOT, f).startsWith(m + sep) && !f.endsWith('.html')
    && /\bCWDates\b/.test(readFileSync(f, 'utf8')));
  if (!used) continue;
  const htmlPath = join(ROOT, m, 'index.html');
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
  ok(m + ': разметка подключает shared/dates.js', /shared\/dates\.js/.test(html));
}

console.log('');
process.exit(failed ? 1 : 0);
