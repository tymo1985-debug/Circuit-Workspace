#!/usr/bin/env node
/**
 * scripts/check-route.mjs — «Маршрут посещений», R1 список + R2 карта + R3 дорожные км
 * + R4 черновик порядка + R5 сравнение + R6 предложение порядка + R7 применение к календарю
 * (единственная запись в календарь — applyDraft) + R8 мобильные вкладки [Список]/[Карта].
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
const outside = code.replace(applyFn, '');
ok(applyFn && (code.match(/App\.store\.save\(/g) || []).length === 1 && applyFn.includes('App.store.save('), 'R7: запись в блоб — только App.store.save() в applyDraft');
ok(!/App\.store\.(save|checkpointNow|flushNow|writeNow)\(|App\.state\.app\.entries/.test(outside), 'R7: вне applyDraft нет записи и доступа к entries');
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

if (failed) { console.error(`\nПровалено: ${failed}`); process.exit(1); }
console.log('\nOK');
