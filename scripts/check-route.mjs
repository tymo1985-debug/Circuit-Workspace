#!/usr/bin/env node
/**
 * scripts/check-route.mjs — «Маршрут посещений», этап R1 (только просмотр).
 * Гоняет чистую логику `CPRoute` из circuit-planner/ui/route.js и проверяет
 * подключение экрана (меню, разметка, SW, ключи словаря на 5 языках).
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

const src = read('circuit-planner/ui/route.js');
const win = { CPParts: [] };
vm.runInNewContext(src, { window: win });
const R = win.CPRoute;

console.log('Логика CPRoute');
const events = { a: { name: 'Berlin', visitType: 'congregation', lat: 52.5, lng: 13.4 }, b: { name: 'Kassel', visitType: 'group' } };
const rows = R.collect([
  { id: 'e3', eventId: 'a', start: '2026-11-02', end: '2026-11-08' },
  { id: 'e1', eventId: 'b', start: '2026-10-05', end: '2026-10-11' },
  { id: 'bad', eventId: 'a', start: 'xx' },
  null,
], (id) => events[id] || null);
ok(rows.length === 2, 'запись с невалидной датой и null пропущены');
ok(rows[0].name === 'Kassel' && rows[0].n === 1 && rows[1].n === 2, 'календарный порядок и номера 1…N');
ok(rows[0].hasCoords === false && rows[1].hasCoords === true, 'отсутствие координат помечено, запись не скрыта');
const s = R.summarize(rows);
ok(s.count === 2 && s.missing === 1 && s.withCoords === 1, 'сводка: всего, без координат');
ok(R.collect(undefined, null).length === 0, 'пустой вход → пустой список');

console.log('Подключение');
ok(/id: 'route'[^}]*nav_route/.test(read('circuit-planner/app.js')), 'пункт route в navItems');
ok(/route:'screen_route'/.test(read('circuit-planner/app.js')), 'заголовок экрана route');
ok(read('circuit-planner/index.html').includes('id="routeRoot"') && read('circuit-planner/index.html').includes('ui/route.js'), 'секция и скрипт в index.html');
ok(read('circuit-planner/sw.js').includes("'./ui/route.js'"), 'ui/route.js в APP_SHELL_URLS');
const dict = read('circuit-planner/i18n/dict.js');
for (const k of ['nav_route', 'screen_route', 'route_sub', 'route_year', 'route_summary', 'route_none', 'route_no_coords', 'route_open']) {
  ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);
}
ok(!/localStorage|sessionStorage|indexedDB|CWDB\.|\.put\(|fetch\(/.test(src.replace(/\/\/.*$/gm, '')), 'R1 ничего не пишет и не ходит в сеть');

if (failed) { console.error(`\nПровалено: ${failed}`); process.exit(1); }
console.log('\nOK');
