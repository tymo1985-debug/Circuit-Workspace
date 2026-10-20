#!/usr/bin/env node
/**
 * scripts/check-route.mjs — «Маршрут посещений», R1 список + R2 карта + R3 дорожные км
 * + R4 черновик порядка + R5 сравнение + R6 предложение порядка + R7 применение к календарю
 * (единственная запись в календарь — applyDraft) + R8 мобильные вкладки [Список]/[Карта]
 * + R9 полугодия + R10 перерывы, остановки, «из дома» (настройки маршрута — persistRoute).
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
ok(!/localStorage|indexedDB|CWDB\.|\.put\(|fetch\(|App\.actions\.(?!focusEntryFromHash)/.test(code), 'экран не трогает localStorage/IndexedDB/CWDB и сам не ходит в сеть');
const applyFn = (code.match(/function applyDraft\(\) \{[\s\S]*?\n    \}\n/) || [''])[0];
const persistFn = (code.match(/function persistRoute\(mutate\) \{[\s\S]*?\n    \}\n/) || [''])[0];
const outside = code.replace(applyFn, '').replace(persistFn, '');
ok(applyFn && persistFn && (code.match(/App\.store\.save\(/g) || []).length === 2 && applyFn.includes('App.store.save(') && persistFn.includes('App.store.save('), 'R7/R10: запись в блоб — только applyDraft (даты) и persistRoute (настройки маршрута)');
ok(!/App\.store\.(save|checkpointNow|flushNow|writeNow)\(|App\.state\.app\.entries/.test(outside), 'R7: вне двух точек записи нет записи и доступа к entries');
ok(/readOnly\(\)/.test(persistFn) && !/entries|\.start\s*=(?!=)|\.end\s*=(?!=)/.test(persistFn), 'R10: persistRoute — запрет в режиме только для чтения, записи календаря не трогает');
ok(!/\.start\s*=(?!=)|\.end\s*=(?!=)|App\.state\.app\.entries/.test(code.replace(applyFn, '')), 'R10: даты записей меняет только applyDraft');
ok(/checkpointNow\('route-apply'\)[\s\S]*App\.store\.save\(/.test(applyFn), 'R7: контрольная точка истории до записи');
ok(/checkpointNow\('route-apply'\)[\s\S]*\.then\(\(snapshotId\) => \{\s*if \(!snapshotId\) \{[^}]*route_apply_no_backup[^}]*return; \}/.test(applyFn), 'P2-3: без снятой контрольной точки даты не трогаются');
for (const k of ['route_apply_no_backup']) ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);
ok(/window\.confirm\(msg\)/.test(applyFn) && applyFn.indexOf('window.confirm') < applyFn.indexOf('checkpointNow'), 'R7: подтверждение до любой записи');
ok(/App\.store\.degraded \|\| App\.store\.conflict/.test(applyFn), 'R7: режим только для чтения/конфликт — запрет');
ok(/stale/.test(applyFn) && /e\.start !== c\.from\.start/.test(applyFn), 'R7: проверка «календарь не изменился» перед записью');
ok(!/flags\s*=|\.f302\s*=|\.letter\s*=|eventId\s*=/.test(applyFn) && /e\.start = c\.to\.start; e\.end = c\.to\.end;/.test(applyFn), 'R7: меняются только даты, собрание и флажки не трогаются');
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
ok(/routeRoadBtn'\)\) \{ fetchRoads\(0\)/.test(src) && (src.match(/fetchRoads\(/g) || []).length === 3, 'сеть только по кнопке (fetchRoads) и его дозапрос после пересчёта плана');
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

console.log('R5: сравнение «Календарь ↔ Черновик»');
ok(R.moved(base, R.applyOrder(base, ['c', 'a', 'b', 'd'])) === 3 && R.moved(base, R.applyOrder(base, [])) === 0, 'перемещено: позиции, отличные от календарных');
const A = [P(50, 14), P(51, 14), P(52, 14)], B = [P(50, 14), P(52, 14), P(51, 14)];
const many = G.runsMany([A, B], () => false);
const keysOf = (rs) => rs.flatMap((run) => run.slice(1).map((p, i) => G.legKey(run[i], p)));
const mk = keysOf(many);
ok(new Set(mk).size === mk.length && mk.length === 4, 'отрезки обоих порядков без повторов');
ok(G.runsMany([A, A], () => false).length === 1, 'одинаковые порядки — один проход');
ok(/fetchMissing\(lists, memo/.test(lsrc) && /runsMany\(lists/.test(lsrc), 'fetchMissing принимает несколько порядков');
ok(/dashArray/.test(src) && src.includes('function renderCompare'), 'пунктир календаря на карте и блок сравнения');
for (const k of ['route_cmp_title', 'route_cmp_cal', 'route_cmp_draft', 'route_cmp_diff', 'route_cmp_straight', 'route_cmp_road', 'route_cmp_moved', 'route_cmp_same', 'route_cmp_legend', 'route_cmp_partial', 'route_km']) {
  ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);
}

console.log('R6: предложение порядка');
const eu = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng);
const pt = (id, lat, extra) => ({ id, hasCoords: true, lat, lng: 0, ...extra });
const zig = [pt('a', 3), pt('b', 1), pt('c', 4), pt('d', 2)];
const o1 = R.optimize(zig, [], { lat: 0, lng: 0 }, eu);
ok(o1.changed && o1.order.join('') === 'bdac' && Math.abs(o1.after - 4) < 1e-9 && Math.abs(o1.before - 10) < 1e-9, 'зигзаг от дома → монотонный порядок, км 10 → 4');
const o2 = R.optimize(zig, ['a'], { lat: 0, lng: 0 }, eu);
ok(o2.order[0] === 'a', 'закреплённая строка остаётся в своём слоте');
const withNo = [pt('a', 3), { id: 'x', hasCoords: false }, pt('b', 1), pt('c', 2)];
const o3 = R.optimize(withNo, [], { lat: 0, lng: 0 }, eu);
ok(o3.order[1] === 'x' && o3.order.join('') === 'bxca', 'запись без координат остаётся в своём слоте');
const sorted = [pt('a', 1), pt('b', 2), pt('c', 3)];
const o4 = R.optimize(sorted, [], { lat: 0, lng: 0 }, eu);
ok(!o4.changed && o4.order.join('') === 'abc', 'оптимальный порядок не меняется');
ok(!R.optimize([pt('a', 1)], [], null, eu).changed && !R.optimize([pt('a', 1), pt('b', 2)], ['a'], null, eu).changed, 'меньше двух свободных — без изменений');
const many30 = Array.from({ length: 30 }, (_, i) => pt('p' + i, ((i * 7919) % 31) + 1));
const t0 = Date.now(); const o5 = R.optimize(many30, [], { lat: 0, lng: 0 }, eu);
ok(o5.after <= o5.before && Math.abs(o5.after - 31) < 1e-9 && Date.now() - t0 < 3000, '30 точек на прямой: оптимум найден быстро');
ok(new Set(o5.order).size === 30, 'перестановка без потерь и повторов');
ok(src.includes('function slotOf') && src.includes("t('route_was'"), 'в черновике — даты слота, свои даты — «в календаре»');
for (const k of ['route_opt_btn', 'route_opt_undo', 'route_opt_same', 'route_opt_done', 'route_was']) {
  ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);
}

console.log('R7: применение к календарю');
const cal = [{ id: 'a', start: '2026-10-05', end: '2026-10-11' }, { id: 'b', start: '2026-11-02', end: '2026-11-08' }, { id: 'c', start: '2026-12-07', end: '2026-12-13', sent302: true }, { id: 'd', start: '2027-01-11', end: '2027-01-17' }];
ok(R.pinPast(['c', 'a', 'b', 'd'], cal, ['a']).join('') === 'acbd', 'прошедшая строка возвращается на своё календарное место');
ok(R.pinPast(['d', 'c', 'b', 'a'], cal, ['a', 'b']).join('') === 'abdc', 'несколько прошедших — на местах, остальные по черновику');
ok(R.pinPast(['b', 'a'], cal.slice(0, 2), []).join('') === 'ba', 'без прошедших — порядок как есть');
const plan = R.applyPlan(cal, R.applyOrder(cal, ['a', 'c', 'b', 'd']));
ok(plan.length === 2 && plan[0].id === 'c' && plan[0].to.start === '2026-11-02' && plan[0].from.start === '2026-12-07' && plan[1].id === 'b' && plan[1].to.end === '2026-12-13', 'план: строки, чьи даты меняются, с датами слота');
ok(plan[0].sent302 === true && plan[1].sent302 === false, 'план: флажок «отправлено» передан для предупреждения');
ok(R.applyPlan(cal, R.applyOrder(cal, [])).length === 0, 'календарный порядок → нечего применять');
const sameDates = [{ id: 'x', start: '2026-10-05', end: '2026-10-11' }, { id: 'y', start: '2026-10-05', end: '2026-10-11' }];
ok(R.applyPlan(sameDates, R.applyOrder(sameDates, ['y', 'x'])).length === 0, 'одинаковые даты слотов — изменений нет');
const fl = R.collect([{ id: 'e1', eventId: 'a', start: '2026-11-02', end: '2026-11-08', flags: { f302: true, letter: false } }], (id) => events[id] || null);
ok(fl[0].sent302 === true && fl[0].sentLetter === false, 'collect переносит флажки «отправлено»');
for (const k of ['route_past', 'route_apply', 'route_apply_hint', 'route_apply_confirm', 'route_apply_line', 'route_apply_warn', 'route_apply_restore', 'route_apply_stale', 'route_apply_done']) {
  ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);
}

console.log('R8: мобильные вкладки');
const css = read('circuit-planner/style.css');
ok(/\.route-tabs\{display:none\}/.test(css) && /@media \(max-width:900px\)\{[^}]*\.route-tabs\{display:flex/.test(css.replace(/\n\s*/g, '').replace(/\/\*[^*]*\*\//g, '')), 'вкладки скрыты по умолчанию и видны только ≤900px');
ok(/data-view="list"\] \.route-map-pane\{display:none\}/.test(css) && /data-view="map"\] \.route-list\{display:none\}/.test(css), 'на узком экране виден ровно один блок');
ok(src.includes('role="tablist"') && /role="tab"/.test(src) && src.includes('aria-selected') && src.includes('ArrowRight'), 'доступность: tablist/tab, aria-selected, стрелки');
ok(/function setView[\s\S]*invalidateSize\(\)[\s\S]*fittedYear = null/.test(src), 'карта пересчитывает размер и точки при показе вкладки');
ok(!/sessionStorage\.setItem\([^)]*mobileView|localStorage/.test(code), 'выбор вкладки только в памяти');
for (const k of ['route_tab_list', 'route_tab_map']) ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);

console.log('R9: полугодия служебного года');
const hb1 = R.halfBounds(2026, 1), hb2 = R.halfBounds(2026, 2);
ok(hb1.from === '2026-09-01' && hb1.to === '2027-03-01' && hb2.from === '2027-03-01' && hb2.to === '2027-09-01', 'границы: сент–февр и март–авг, «до» не входит');
ok(hb1.to === hb2.from, 'полугодия смыкаются без разрыва и пересечения');
const hm = R.halfMonths(2026, 1), hm2 = R.halfMonths(2026, 2);
ok(hm.map((m) => m.m + 1).join() === '9,10,11,12,1,2' && hm[0].y === 2026 && hm[5].y === 2027 && hm2.map((m) => m.m + 1).join() === '3,4,5,6,7,8' && hm2[0].y === 2027, 'месяцы полугодий и их календарные годы');
const ho = (d) => R.halfOf(d);
ok(ho('2026-09-01').year === 2026 && ho('2026-09-01').half === 1 && ho('2027-02-28').year === 2026 && ho('2027-02-28').half === 1, 'halfOf: 1 сент и 28 февр — первое полугодие');
ok(ho('2027-03-01').year === 2026 && ho('2027-03-01').half === 2 && ho('2027-08-31').half === 2 && ho('2027-09-01').year === 2027 && ho('2027-09-01').half === 1, 'halfOf: 1 март и 31 авг — второе; 1 сент следующего года — новый год');
ok(R.monthSlot('2026-09-15') === 0 && R.monthSlot('2027-02-01') === 5 && R.monthSlot('2027-03-10') === 0 && R.monthSlot('2027-08-10') === 5, 'номер месяца в полугодии 0…5 (цвет)');
const ev9 = { a: { name: 'A', lat: 1, lng: 1 } };
const ents = [
  { id: 'h1a', eventId: 'a', start: '2026-09-07', end: '2026-09-13' },
  { id: 'h1b', eventId: 'a', start: '2027-02-22', end: '2027-02-28' },
  { id: 'h2a', eventId: 'a', start: '2027-03-01', end: '2027-03-07' },
  { id: 'h2b', eventId: 'a', start: '2027-08-23', end: '2027-08-29' },
];
const c1 = R.collect(ents, (id) => ev9[id], hb1), c2 = R.collect(ents, (id) => ev9[id], hb2);
ok(c1.map((r) => r.id).join() === 'h1a,h1b' && c2.map((r) => r.id).join() === 'h2a,h2b', 'collect с range: запись попадает ровно в одно полугодие');
ok(c2[0].n === 1 && c2[1].n === 2, 'номера 1…N считаются внутри полугодия');
ok(R.collect(ents, (id) => ev9[id]).length === 4, 'без range collect работает как раньше');
ok(R.collect([{ id: 'x', eventId: 'a', start: '2027-02-27', end: '2027-03-05' }], (id) => ev9[id], hb1).length === 1, 'визит на стыке февраль/март относится к полугодию по дате НАЧАЛА');
ok(/function scope\(\)|const scope = \(\) => year \+ '\.' \+ half/.test(src) && !/draftWrite\(year|draftRead\(year/.test(src), 'черновик хранится по ключу «год.полугодие»');
ok(/halfBounds\(year, half\)/.test(src) && /renderHalfButtons/.test(src) && /renderLegend/.test(src), 'экран: срез по полугодию, переключатель, легенда');
ok(/function drawArrows[\s\S]*map\.project/.test(src) && /zoomend/.test(src), 'стрелки направления считаются в проекции карты и обновляются при масштабировании');
ok(!/sessionStorage\.setItem\([^)]*half/.test(code) && !/localStorage/.test(code), 'выбор полугодия только в памяти');
for (const k of ['route_half', 'route_half_1', 'route_half_2', 'route_none_half', 'route_leg_avg']) ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);

console.log('R10: перерывы, остановки, «из дома»');
{
  const d2 = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng); // координаты = км на плоскости
  const H = { lat: 0, lng: 0, name: 'Praha' };
  const RU = R.normRules();
  const V = (id, lat, lng, extra) => Object.assign({ id, name: id, visitType: 'congregation', hasCoords: lat != null, lat, lng, route: null }, extra || {});
  ok(RU.homeKm === 12 && RU.awayKm === 60 && RU.homeMin === 30 && RU.gapDays === 2 && RU.hoursPerDay === 1, 'правила по умолчанию: 12 км, 60 км, 30 мин, 2 дня, 1 ч/день');
  const nr = R.normRules({ homeKm: '15', awayKm: 5, gapDays: 2.6, hoursPerDay: -1, homeMin: 'x' });
  ok(nr.homeKm === 15 && nr.awayKm === 15 && nr.gapDays === 3 && nr.hoursPerDay === 1 && nr.homeMin === 30, 'правила: строки → числа, мусор → умолчание, «точно в разъезде» не ближе дома');
  ok(R.normRoute(null) === null && R.normRoute({ base: 'auto', after: 'auto' }) === null && R.normRoute({ base: 'zzz' }) === null, 'route: всё авто/мусор → поле не хранится');
  const nro = R.normRoute({ base: 'stay', after: 'nope', future: 1 });
  ok(nro.base === 'stay' && nro.after === 'auto' && nro.future === 1, 'route: допустимые значения, будущие ключи сохраняются');
  const ng = R.normGaps({ '2026-12-21..2026-12-27': 'home', '2026-01-01..x': 'home', '2027-01-01..2027-01-04': 'maybe', '2027-02-01..2027-02-03': 'stay' });
  ok(Object.keys(ng).join() === '2026-12-21..2026-12-27,2027-02-01..2027-02-03', 'ручные решения: только ключ-период и home|stay');

  const cl = (v, road) => R.classify(v, H, RU, d2, road ? () => road : null);
  ok(cl(V('a', 10, 0)).mode === 'home' && cl(V('a', 10, 0)).how === 'km', '≤ 12 км — из дома');
  ok(cl(V('a', 10, 0, { visitType: 'group' })).mode === 'home' && cl(V('a', 10, 0, { visitType: 'pregroup' })).mode === 'home', 'группы и предгруппы — по тем же правилам');
  ok(cl(V('a', 70, 0)).mode === 'away' && cl(V('a', 70, 0)).how === 'km', '≥ 60 км — в разъезде');
  ok(cl(V('a', 30, 0)).mode === 'away' && cl(V('a', 30, 0)).how === 'ask', 'серая зона без дорог — «❓», считается в разъезде');
  ok(cl(V('a', 30, 0), 25).mode === 'home' && cl(V('a', 30, 0), 45).mode === 'away' && cl(V('a', 30, 0), 25).how === 'road', 'серая зона: решает время по дороге ≤ 30 мин');
  ok(cl(V('a', 300, 0, { route: { base: 'home' } })).mode === 'home' && cl(V('a', 5, 0, { route: { base: 'away' } })).mode === 'away', 'ручной выбор в шаблоне сильнее расстояния');
  ok(cl(V('a', null, null)).mode === 'off', 'посещение без координат — линия мимо');
  const X = (id, lat, lng, route) => ({ id, name: id, visitType: '', hasCoords: lat != null, lat, lng, route: route || null });
  ok(cl(X('u', null, null)).mode === 'home' && cl(X('u', null, null)).how === 'noaddr', 'событие без адреса (отпуск, Free week) — дома');
  ok(cl(X('k', 5, 0)).mode === 'home' && cl(X('k', 200, 0)).mode === 'away', 'конгресс в Праге — дома; вне — точка маршрута');
  ok(cl(X('u', null, null, { base: 'stay' })).mode === 'stay' && cl(X('u', null, null, { base: 'ignore' })).mode === 'ignore' && cl(X('u', null, null, { base: 'away' })).mode === 'off', 'остаюсь / не влияет / точка без адреса');
  ok(R.classify(V('a', 30, 0), null, RU, d2, null).how === 'nohome', 'без дома — всё в разъезде');

  const sl = (s, e) => ({ start: s, end: e });
  const ids = (p) => p.path.map((x) => (x.home ? 'H' : x.id)).join(' ');
  const P = (visits, slots, extras, more) => R.plan(Object.assign({ visits, slots, extras: R.extrasRows(extras || []), home: H, dist: d2 }, more || {}));
  const A = V('A', 300, 0), B = V('B', 300, 50);
  let p = P([A, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-06', '2026-10-11')]);
  ok(ids(p) === 'H A B' && p.gaps[0].free === 1 && p.gaps[0].why === 'short' && !p.gaps[0].show, '1 свободный день — напрямую, строки перерыва нет');
  p = P([A, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-20', '2026-10-25')], [{ id: 'x:u', eventId: 'u', name: 'Urlaub', start: '2026-10-08', end: '2026-10-12' }]);
  ok(ids(p) === 'H A H B' && p.gaps[0].why === 'event' && p.gaps[0].show && p.gaps[0].between[0].name === 'Urlaub', 'отпуск в перерыве — через дом');
  ok(p.gaps[0].key === '2026-10-05..2026-10-19' && p.gaps[0].free === 15, 'ключ перерыва — период свободных дней');
  p = P([A, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-20', '2026-10-25')], [{ id: 'x:f', eventId: 'f', name: 'Free week', start: '2026-10-08', end: '2026-10-12', route: { base: 'stay' } }]);
  ok(ids(p) === 'H A B' && p.gaps[0].decision === 'stay' && p.gaps[0].why === 'event', 'Free week «остаюсь, где был» — напрямую');
  p = P([A, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-20', '2026-10-25')], [{ id: 'x:f', eventId: 'f', name: 'Free week', start: '2026-10-06', end: '2026-10-08', route: { base: 'stay' } }, { id: 'x:u', eventId: 'u', name: 'Urlaub', start: '2026-10-10', end: '2026-10-12' }]);
  ok(p.gaps[0].decision === 'home', '«дома» сильнее «остаюсь» в одном перерыве');

  // «Hamburg → конгресс в Германии»: дом далеко от обоих — остаёмся; длинный перерыв — домой.
  const Hh = V('Hh', 600, 0), K = X('K', 500, 100);
  p = P([Hh], [sl('2026-09-28', '2026-10-04')], [{ id: 'x:K', eventId: 'K', name: 'Kongress', start: '2026-10-11', end: '2026-10-11', lat: 500, lng: 100 }]);
  ok(ids(p) === 'H Hh x:K' && p.gaps[0].free === 6 && p.gaps[0].why === 'budget' && p.gaps[0].decision === 'stay' && p.gaps[0].approx, '6 свободных дней, крюк ≫ 6 ч — остаёмся (оценка по прямой)');
  ok(p.gaps[0].budgetMin === 360 && p.gaps[0].extraMin > 360 && p.gaps[0].show, 'бюджет = свободные дни × 1 ч; строка перерыва показана');
  p = P([Hh], [sl('2026-09-28', '2026-10-04')], [{ id: 'x:K', eventId: 'K', name: 'Kongress', start: '2026-11-08', end: '2026-11-08', lat: 500, lng: 100 }]);
  ok(p.gaps[0].free === 34 && p.gaps[0].decision === 'home' && ids(p) === 'H Hh H x:K', 'длинный перерыв — бюджет больше крюка — домой');
  const road = (a, b) => d2(a, b); // «дорожные минуты» = км: точные данные
  p = P([Hh], [sl('2026-09-28', '2026-10-04')], [{ id: 'x:K', eventId: 'K', name: 'Kongress', start: '2026-10-11', end: '2026-10-11', lat: 500, lng: 100 }], { roadMin: road });
  ok(!p.gaps[0].approx && Math.abs(p.gaps[0].extraMin - (600 + Math.hypot(500, 100) - Math.hypot(100, 100))) < 1e-9, 'с дорожными данными крюк считается по ним, без пометки «≈»');
  // Почти по пути (Plzeň → Wien): крюк мал — домой.
  const Pl = V('Pl', 90, 0), Wi = V('Wi', -10, 250);
  p = P([Pl, Wi], [sl('2026-12-14', '2026-12-20'), sl('2026-12-25', '2026-12-31')], [], { roadMin: road });
  ok(p.gaps[0].free === 4 && p.gaps[0].decision === 'home' && !p.gaps[0].ask, 'дом почти по пути — домой');
  // Спорная зона: крюк ≈ бюджет.
  const S1 = V('S1', 100, 0), S2 = V('S2', 100, 10);
  p = P([S1, S2], [sl('2026-10-01', '2026-10-04'), sl('2026-10-09', '2026-10-11')], [], { roadMin: road, rules: { hoursPerDay: 0.85 } });
  ok(p.gaps[0].ask && p.gaps[0].why === 'budget', 'крюк в пределах 50–150 % бюджета — «❓ решите сами»');
  // Ручной выбор и шаблон.
  const key = p.gaps[0].key;
  p = P([S1, S2], [sl('2026-10-01', '2026-10-04'), sl('2026-10-09', '2026-10-11')], [], { roadMin: road, rules: { hoursPerDay: 0.85 }, gaps: { [key]: 'stay' } });
  ok(p.gaps[0].decision === 'stay' && p.gaps[0].manual === 'stay' && !p.gaps[0].ask && ids(p) === 'H S1 S2', 'ручной выбор сильнее правила и снимает «❓»');
  p = P([A, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-20', '2026-10-25')], [{ id: 'x:u', eventId: 'u', name: 'Urlaub', start: '2026-10-08', end: '2026-10-12' }], { gaps: { '2026-10-05..2026-10-19': 'stay' } });
  ok(ids(p) === 'H A B' && p.gaps[0].auto === 'home', 'ручное «остаться» перекрывает даже отпуск');
  const At = V('At', 300, 0, { route: { after: 'onward' } });
  p = P([At, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-20', '2026-10-25')], [{ id: 'x:u', eventId: 'u', name: 'Urlaub', start: '2026-10-08', end: '2026-10-12' }]);
  ok(p.gaps[0].why === 'template' && p.gaps[0].decision === 'stay', 'шаблон «после: сразу дальше» сильнее события в перерыве');
  const Ah = V('Ah', 300, 0, { route: { after: 'home' } });
  p = P([Ah, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-06', '2026-10-11')]);
  ok(p.gaps[0].decision === 'home' && p.gaps[0].show && ids(p) === 'H Ah H B', 'шаблон «после: домой» даже при коротком перерыве');
  // Посещение «из дома» между разъездами, поездка туда-обратно, возврат в конце.
  const Pr = V('Pr', 5, 0);
  p = P([A, Pr, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-06', '2026-10-11'), sl('2026-10-13', '2026-10-18')]);
  ok(ids(p) === 'H A H B' && p.trips.length === 1 && p.trips[0][1].id === 'Pr' && p.gaps[0].why === 'event', 'посещение «из дома» в перерыве — возврат домой и поездка туда-обратно');
  ok(Math.abs(R.planKm(p, d2) - (300 + 300 + Math.hypot(300, 50) + 10)) < 1e-9, 'км плана: цепочка с возвратами + поездки из дома');
  p = P([A, Pr], [sl('2026-09-28', '2026-10-04'), sl('2026-10-06', '2026-10-11')]);
  ok(ids(p) === 'H A H' && p.tail, 'после последней точки событие «дома» — возврат домой в конце');
  p = P([A, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-06', '2026-10-11')]);
  ok(!p.tail && ids(p) === 'H A B', 'без событий после — возврата в конце нет (как раньше)');
  // Посещение без координат занимает дни перерыва.
  const Off = V('Off', null, null);
  p = P([A, Off, B], [sl('2026-09-01', '2026-09-06'), sl('2026-09-07', '2026-09-13'), sl('2026-09-14', '2026-09-20')]);
  ok(p.gaps[0].free === 0 && p.gaps[0].why === 'short' && ids(p) === 'H A B', 'дни посещения без координат не считаются свободными');
  // Остановка внутри недели посещения и порядок точек.
  p = P([A, B], [sl('2026-09-28', '2026-10-04'), sl('2026-10-06', '2026-10-11')], [{ id: 'x:K', eventId: 'K', name: 'K', start: '2026-10-04', end: '2026-10-04', lat: 250, lng: 0 }]);
  ok(ids(p) === 'H A x:K B', 'конгресс в воскресенье посещения — точка между посещениями');
  const lists = R.planLists(P([Hh, V('Q', 30, 0)], [sl('2026-09-28', '2026-10-04'), sl('2026-10-20', '2026-10-25')]));
  ok(lists.some((l) => l.length === 2 && l[0].home && l[1].id === 'Q') && lists.some((l) => l.length === 3 && l[1].home) && lists.some((l) => l.length === 2 && l[0].id === 'Hh' && l[1].id === 'Q'), 'дорожные запросы: спорные «из дома?» и сравнение «через дом / напрямую»');
  ok(R.plan({ visits: [A, B], slots: [sl('2026-09-01', '2026-09-06'), sl('2026-09-08', '2026-09-13')], dist: d2 }).path.length === 2 && R.plan({ visits: [A], slots: [] }).path.length === 0 && R.plan({}).path.length === 0, 'без дома, без дат и без данных — без падений');
  ok(R.extrasRows([{ id: 'e', eventId: 'u', start: '2026-10-01', end: '2026-10-03' }, { id: 'w', eventId: 'u', start: '2026-10-01', end: '2026-10-03' }, { id: 'z', start: 'bad' }]).length === 1, 'событие из записи и недели с теми же датами — один раз; мусор мимо');

  // Оптимизация с ценой плана: посещение «из дома» закреплено, поездки группируются вокруг отпуска.
  const O1 = V('o1', 300, 0), O2 = V('o2', -300, 0), O3 = V('o3', 300, 10), O4 = V('o4', -300, 10);
  const oslots = [sl('2026-09-07', '2026-09-13'), sl('2026-09-15', '2026-09-20'), sl('2026-10-05', '2026-10-11'), sl('2026-10-13', '2026-10-18')];
  const oex = R.extrasRows([{ id: 'x:u', eventId: 'u', name: 'Urlaub', start: '2026-09-22', end: '2026-10-03' }]);
  const cost = (seq) => R.planKm(R.plan({ visits: seq, slots: oslots, extras: oex, home: H, dist: d2 }), d2);
  const res = R.optimize([O1, O2, O3, O4], [], H, d2, cost);
  const ord = res.order.join(' ');
  ok(res.changed && res.after < res.before && (ord === 'o1 o3 o2 o4' || ord === 'o3 o1 o2 o4' || ord === 'o2 o4 o1 o3' || ord === 'o4 o2 o1 o3' || ord === 'o1 o3 o4 o2' || ord === 'o3 o1 o4 o2' || ord === 'o2 o4 o3 o1' || ord === 'o4 o2 o3 o1'), 'цена плана: соседние посещения — в одной поездке, отпуск делит поездки');
}

console.log('R10: данные и подключение');
{
  const app = read('circuit-planner/app.js');
  ok(/\.\.\.this\.routeField\(item\.route\)/.test(app) && /routeField\(route\) \{[\s\S]{0,300}normRoute/.test(app), 'нормализация событий сохраняет route (через CPRoute.normRoute)');
  ok(/out\.routeRules = CR\.normRules\(out\.routeRules\)/.test(app) && /out\.routeGaps = CR\.normGaps\(out\.routeGaps\)/.test(app), 'настройки: routeRules/routeGaps чистятся, отсутствие — «по умолчанию»');
  ok(/getRouteExtras\(from, to\) \{[\s\S]*?ev\.visitType[\s\S]*?serviceYears/.test(app), 'App.data.getRouteExtras: не-визитные записи и недели');
  ok(/eventRouteBaseSelect[\s\S]*eventRouteAfterSelect/.test(app) && /routeField\(Object\.assign\(\{\}, index >= 0 \? App\.state\.app\.events\[index\]\.route : null/.test(app), 'редактор события: поля маршрута, прежний route не теряется при сохранении');
  const html = read('circuit-planner/index.html');
  ok(html.includes('id="eventRouteBaseSelect"') && html.includes('id="eventRouteAfterSelect"') && ['auto', 'home', 'away', 'stay', 'ignore'].every((v) => html.includes(`value="${v}"`)) && html.includes('value="onward"'), 'разметка редактора: base и after со всеми значениями');
  ok(R.collect([{ id: 'r', eventId: 'a', start: '2026-10-05', end: '2026-10-11' }], () => ({ name: 'A', visitType: 'group', lat: 1, lng: 1, route: { base: 'home' } }))[0].route.base === 'home', 'collect переносит route шаблона');
  for (const k of ['route_from_home', 'route_ask_base', 'route_ask_home', 'route_ask_away', 'route_stop', 'route_gap_title', 'route_gap_events', 'route_gap_home', 'route_gap_stay',
    'route_gap_why_manual', 'route_gap_why_template', 'route_gap_why_event', 'route_gap_why_short', 'route_gap_why_budget', 'route_gap_approx', 'route_gap_ask', 'route_gap_to_home',
    'route_gap_btn_auto', 'route_gap_btn_home', 'route_gap_btn_stay', 'route_end_home', 'route_sum_returns', 'route_sum_trips', 'route_legend_via_home', 'route_legend_from_home',
    'route_rules', 'route_rules_hint', 'route_rule_homeKm', 'route_rule_awayKm', 'route_rule_homeMin', 'route_rule_gapDays', 'route_rule_hoursPerDay', 'route_rules_manual',
    'route_rules_stale', 'route_rules_reset', 'route_cfg', 'route_cfg_hint', 'route_cfg_base', 'route_cfg_auto', 'route_cfg_base_home', 'route_cfg_base_away', 'route_cfg_base_stay',
    'route_cfg_base_ignore', 'route_cfg_after', 'route_cfg_after_home', 'route_cfg_after_onward']) {
    ok(dict.split(`'cp.${k}':`).length - 1 === 5, `ключ cp.${k} во всех 5 языках`);
  }
  for (const m of src.matchAll(/t\('(route_[a-zA-Z_]+)'\s*[,)]/g)) if (dict.split(`'cp.${m[1]}':`).length - 1 !== 5) ok(false, `ключ cp.${m[1]} из route.js во всех 5 языках`);
}

if (failed) { console.error(`\nПровалено: ${failed}`); process.exit(1); }
console.log('\nOK');
