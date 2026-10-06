#!/usr/bin/env node
/**
 * scripts/check-route.mjs — «Маршрут посещений», R1 список + R2 карта + R3 дорожные км
 * + R4 черновик порядка (календарь не меняется).
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
const flat = (a, b, c, d) => Math.abs(a - c) + Math.abs(b - d);
const pl = R.pathLength([{ hasCoords: true, lat: 0, lng: 0 }, { hasCoords: false }, { hasCoords: true, lat: 1, lng: 2 }, { hasCoords: true, lat: 1, lng: 5 }], flat);
ok(pl.km === 6 && pl.legs === 2, 'длина по прямой: точки без координат пропущены, переездов N−1');
ok(R.pathLength([], flat).legs === 0 && R.pathLength([{ hasCoords: true, lat: 1, lng: 1 }], flat).km === 0, 'ноль/одна точка → 0 км, 0 переездов');

console.log('Подключение');
ok(/id: 'route'[^}]*nav_route/.test(read('circuit-planner/app.js')), 'пункт route в navItems');
ok(/route:'screen_route'/.test(read('circuit-planner/app.js')), 'заголовок экрана route');
ok(read('circuit-planner/index.html').includes('id="routeRoot"') && read('circuit-planner/index.html').includes('ui/route.js'), 'секция и скрипт в index.html');
ok(read('circuit-planner/sw.js').includes("'./ui/route.js'"), 'ui/route.js в APP_SHELL_URLS');
const dict = read('circuit-planner/i18n/dict.js');
for (const k of ['nav_route', 'screen_route', 'route_sub', 'route_year', 'route_summary', 'route_none', 'route_no_coords', 'route_open', 'route_km_straight']) {
  ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);
}
const code = src.replace(/\/\/.*$/gm, '');
ok(!/localStorage|indexedDB|CWDB\.|\.put\(|fetch\(|App\.store|App\.actions\.(?!focusEntryFromHash)/.test(code), 'экран не пишет в блоб/localStorage/IndexedDB и сам не ходит в сеть');
ok((code.match(/sessionStorage/g) || []).length === 3 && /function draftRead[\s\S]*sessionStorage\.getItem/.test(code) && /function draftWrite[\s\S]*sessionStorage\.(setItem|removeItem)/.test(code), 'R4: sessionStorage — только в draftRead/draftWrite');
ok(src.includes("'./vendor/leaflet.js'") && !/marker-icon|\.png/.test(src.replace(/tile\.openstreetmap\.org[^']*/g, '')), 'R2: локальный Leaflet, маркеры без PNG');
ok(read('circuit-planner/sw.js').includes('leaflet.js'), 'R2: Leaflet в прекэше SW (офлайн-инициализация)');

console.log('R3: дом и дорожные отрезки');
const H = R.points([{ id: 'x', hasCoords: false }, { id: 'y', hasCoords: true, lat: 1, lng: 1 }], { lat: 0, lng: 0, name: 'Praha' });
ok(H.length === 2 && H[0].home && H[0].n === 0 && H[1].id === 'y', 'дом — точка 0, строки без координат пропущены');
ok(R.points([{ id: 'y', hasCoords: true, lat: 1, lng: 1 }], { lat: null, lng: null }).length === 1, 'дом без координат не добавляется');
ok(R.pathLength(H, flat).legs === 1 && R.pathLength(H, flat).km === 2, 'км по прямой учитывают дом');

const lsrc = read('circuit-planner/ui/route-legs.js');
const lwin = {};
vm.runInNewContext(lsrc, { window: lwin, Date, setTimeout, clearTimeout });
const G = lwin.CPRouteLegs;
const P = (lat, lng) => ({ lat, lng });
ok(G.legKey(P(50.123456, 14.5), P(50, 14)) === '50.12346,14.5>50,14', 'ключ отрезка: направленный, округление 1e-5');
ok(G.buildUrl([P(50, 14), P(51, 15)]) === 'https://router.project-osrm.org/route/v1/driving/14,50;15,51?overview=false&alternatives=false&steps=false', 'URL OSRM: lng,lat; без геометрии');
const parsed = G.parse({ code: 'Ok', routes: [{ legs: [{ distance: 12500, duration: 600 }, { distance: 1000, duration: 60 }] }] }, 3);
ok(parsed && parsed[0].km === 12.5 && parsed[0].min === 10 && parsed[1].min === 1, 'разбор ответа: м→км, с→мин');
ok(G.parse({ code: 'NoRoute' }, 2) === null && G.parse({ code: 'Ok', routes: [{ legs: [{}] }] }, 2) === null && G.parse({ code: 'Ok', routes: [{ legs: [] }] }, 2) === null, 'битый/неполный ответ → null');
const line = Array.from({ length: 30 }, (_, i) => P(50 + i * 0.1, 14));
const all = G.runs(line, () => false);
ok(all.length === 2 && all[0].length === 25 && all[1].length === 6 && all[1][0] === all[0][24], 'нарезка ≤25 точек с перекрытием в одну');
const knownKey = G.legKey(line[1], line[2]);
const gaps = G.runs(line.slice(0, 5), (k) => k === knownKey);
ok(gaps.length === 2 && gaps[0].length === 2 && gaps[1].length === 3, 'запрашиваются только недостающие участки');
ok(G.runs([P(1, 1), P(1, 1)], () => false).length === 0, 'совпадающие точки не запрашиваются');
const tot = G.totals([P(0, 0), P(0, 1), P(0, 1), P(0, 3)], (k) => (k === G.legKey(P(0, 0), P(0, 1)) ? { km: 5, min: 7 } : null), flat);
ok(tot.count === 3 && tot.roadLegs === 2 && !tot.complete && tot.km === 7 && tot.min === 7 && tot.legs[2].road === false, 'сводка: дороги + прямая для недостающих, 0 км для совпадающих');
ok(/indexedDB\.open\(DB_NAME/.test(lsrc) && lsrc.includes("const DB_NAME = 'cp-route-legs'") && !/CWDB\.|localStorage|sessionStorage/.test(lsrc.replace(/\/\/.*$/gm, '')), 'кэш — отдельная база cp-route-legs, не CWDB/блоб');
ok(read('circuit-planner/sw.js').includes("'./ui/route-legs.js'") && read('circuit-planner/index.html').includes('ui/route-legs.js'), 'route-legs.js в прекэше SW и в index.html');
ok(/fetchRoads\(\)/.test(src) && /routeRoadBtn/.test(src), 'сеть только по кнопке (fetchRoads)');
for (const k of ['route_home', 'route_road', 'route_road_partial', 'route_road_btn', 'route_road_busy', 'route_road_offline', 'route_road_failed', 'route_road_privacy', 'route_leg_road', 'route_leg_straight', 'route_dur', 'route_dur_min']) {
  ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);
}

console.log('R4: черновик порядка');
const base = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }].map((r, i) => ({ ...r, n: i + 1 }));
const ao = R.applyOrder(base, ['c', 'zzz', 'a', 'c']);
ok(ao.map((r) => r.id).join('') === 'cabd' && ao.map((r) => r.n).join('') === '1234', 'порядок черновика: неизвестные/повторы отброшены, новые в конце, номера пересчитаны');
ok(base[2].n === 3, 'исходные строки не мутируются');
ok(R.applyOrder(base, null).map((r) => r.id).join('') === 'abcd', 'без порядка — календарный');
const O = ['a', 'b', 'c', 'd'];
ok(R.move(O, [], 'c', -1).join('') === 'acbd' && R.move(O, [], 'a', -1).join('') === 'abcd' && R.move(O, [], 'd', 1).join('') === 'abcd', '↑↓ и границы');
ok(R.move(O, ['b'], 'c', -1).join('') === 'cbad', 'закреплённая строка перепрыгивается и остаётся на месте');
ok(R.move(O, ['b'], 'b', 1).join('') === 'abcd' && R.move(O, ['a'], 'b', -1).join('') === 'abcd', 'закреплённую не двигаем; за закреплённой у края хода нет');
ok(O.join('') === 'abcd', 'move не мутирует вход');
ok(src.includes("'cp.route.draft.' + y"), 'ключ черновика — по служебному году');
for (const k of ['route_draft_edit', 'route_draft_open', 'route_draft_view', 'route_draft_reset', 'route_draft_note', 'route_up', 'route_down', 'route_lock', 'route_unlock']) {
  ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);
}

if (failed) { console.error(`\nПровалено: ${failed}`); process.exit(1); }
console.log('\nOK');
