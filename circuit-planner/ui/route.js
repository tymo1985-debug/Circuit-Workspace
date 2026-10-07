// circuit-planner/ui/route.js
//
// «Маршрут посещений» — R1 (06.10.2026) список, R2 (06.10.2026) карта,
// R3 (06.10.2026) дорожные км/время, R4 (06.10.2026) ручной черновик порядка,
// R5 (06.10.2026) сравнение «Календарь ↔ Черновик», R6 (06.10.2026)
// «Предложить оптимальный порядок», R7 (06.10.2026) «Применить к календарю»,
// R8 (06.10.2026) мобильная раскладка [Список]/[Карта].
// Календарь не меняется никогда: ТОЛЬКО ПРОСМОТР и черновик сессии. Идея и фазы
// R1–R8 — IDEAS.md. Календарь остаётся первичным; этот экран ничего не
// планирует и не пишет: он показывает уже назначенные посещения служебного
// года в календарном порядке и отмечает те, у которых нет координат.
//
// Файл из двух слоёв (как ui/archive-year.js).
//
//  1. `window.CPRoute` — ЧИСТАЯ логика без DOM и без App: собрать строки
//     маршрута из записей календаря. Её гоняет scripts/check-route.mjs.
//  2. Часть `CPParts` — экран `#route`. Единственная точка входа из app.js —
//     `App.ui.routeRender()` в конце `renderAll()`.
//
// ИНВАРИАНТЫ
//  • Запись в КАНОНИЧЕСКИЙ блоб — только R7, только функция applyDraft(), только
//    по явному нажатию и window.confirm, после контрольной точки
//    истории (`App.store.checkpointNow('route-apply')`). Кроме неё этот файл
//    пишет лишь черновик R4 в sessionStorage (ключ `cp.route.draft.<год>`,
//    функции draftRead/draftWrite). localStorage/IndexedDB — нет; кэш
//    дорожных отрезков R3 — целиком в ui/route-legs.js.
//  • Данные — `App.data.getServiceYearStats(year).visitEntries`: записи
//    календаря, у которых событие имеет visitType. Координаты — из события
//    (`getEventById` отдаёт копию, слитую со справочником).
//  • Запись без координат НЕ скрывается: она в списке с пометкой.
//  • R2: карта на Leaflet модуля (vendor/leaflet.*, прекэш SW, как ui/map.js).
//    Нумерованные точки и ПРЯМЫЕ линии в календарном порядке; километры —
//    по прямой (haversine), не дорожные (это R3). Тайлы OSM — сеть; офлайн
//    список и сводка работают, на карте — уведомление. Маркеры — divIcon,
//    без PNG. Карта создаётся один раз; перерисовка точек — только при
//    смене данных, «вписать» — только при первом показе и смене года.
//  • R3: дом (settings.homeLat/homeLng) — точка 0, только если координаты
//    заданы; без них маршрут как в R2. Дом входит и в км по прямой.
//    Дорожные км/время — CPRouteLegs (OSRM): кэш показывается сам, сеть —
//    только по кнопке. Линии на карте остаются прямыми (геометрия дорог не
//    запрашивается). Нет дорожных данных — отрезок по прямой, с пометкой.
//  • R4: «Изменить порядок» → ↑↓ и 🔒 (закрепить на месте) в черновике.
//    Черновик = { on, order: [id записи], locks: [id] } в sessionStorage,
//    живёт до закрытия вкладки, в календарь и блоб НЕ пишется (это R7).
//    Закреплённая строка не двигается, и ↑↓ соседей перепрыгивают её.
//    Записи календаря, которых нет в черновике, дописываются в конец в
//    календарном порядке; исчезнувшие — молча выпадают. Номера, линия на
//    карте и километры идут по порядку черновика, пока он показан.
//  • R5: пока черновик существует — блок сравнения: км по прямой и по
//    дорогам для обоих порядков, разница, сколько посещений перемещено.
//    В режиме черновика на карте под его линией — пунктир календарного
//    порядка. Кнопка «по дорогам» дозапрашивает отрезки обоих порядков
//    одним проходом (общие отрезки — один раз). Ничего нового не пишется.
//  • R6: решение Алекса 06.10.2026 — «Optimized» меняет ТОЛЬКО порядок в
//    занятых слотах: недели и даты календаря не трогаются, посещение
//    переезжает в другой слот. Поэтому в режиме черновика строка показывает
//    даты СЛОТА (calRows[n−1]); собственные даты посещения — второй строкой
//    «в календаре: …», если оно сдвинулось. Закреплённые 🔒 и записи без
//    координат остаются в своих слотах. Цель — сумма км по ПРЯМОЙ от дома
//    (дорожные отрезки есть только для уже запрошенных пар, N² в кэше не
//    бывает). Результат — обычный черновик R4: его можно править руками,
//    сравнивать (R5) и откатить «Вернуть прежний».
//  • R7: решения Алекса 06.10.2026. (1) Применение ПЕРЕНОСИТ ДАТЫ записей:
//    запись остаётся со своим собранием, заметками, формуляром и связью с
//    Журналом (по id записи); меняются только start/end на даты слота,
//    notified60 сбрасывается, как в редакторе календаря. (2) Флажки «S-302
//    отправлен»/«Письмо отправлено» НЕ трогаются — в подтверждении такие
//    посещения перечислены с просьбой отправить заново. (3) Прошедшие
//    посещения (конец раньше сегодня) всегда стоят на месте: в черновике,
//    в оптимизации и при применении. Перед записью — проверка, что даты
//    записей не изменились с момента подтверждения; режим только для
//    чтения / конфликт вкладок — применение запрещено. После применения
//    черновик удаляется: календарь теперь и есть этот порядок. Откат —
//    «История изменений» (контрольная точка снята перед записью).
//  • R8: ≤900px (та же точка, что у карты собраний) вместо «карта над списком»
//    — две вкладки [Список]/[Карта], виден один блок. Выбор вкладки — только
//    в памяти. Карта, созданная в скрытом блоке, не знает своего размера:
//    при первом показе вкладки — invalidateSize и перепривязка к точкам.
//    Шире 900px вкладки скрыты, оба блока видны рядом, как раньше.
(function (root) {
  'use strict';

  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  /**
   * entries — записи календаря; getEvent(id) → событие | null.
   * Возвращает строки в календарном порядке (start, end, id) с номерами 1…N.
   * Запись с невалидной датой начала пропускается — её нечем упорядочить.
   */
  function collect(entries, getEvent) {
    const rows = [];
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      if (!entry || typeof entry !== 'object' || !ISO.test(String(entry.start || ''))) return;
      const ev = (typeof getEvent === 'function' ? getEvent(entry.eventId) : null) || {};
      rows.push({
        id: String(entry.id || ''),
        eventId: String(entry.eventId || ''),
        name: String(ev.name || entry.title || ''),
        visitType: String(ev.visitType || ''),
        start: entry.start,
        end: ISO.test(String(entry.end || '')) ? entry.end : entry.start,
        sent302: !!(entry.flags && entry.flags.f302),
        sentLetter: !!(entry.flags && entry.flags.letter),
        hasCoords: isNum(ev.lat) && isNum(ev.lng),
        lat: isNum(ev.lat) ? ev.lat : null,
        lng: isNum(ev.lng) ? ev.lng : null,
      });
    });
    rows.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1
      : a.end < b.end ? -1 : a.end > b.end ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    rows.forEach((row, i) => { row.n = i + 1; });
    return rows;
  }

  function summarize(rows) {
    const missing = rows.filter((r) => !r.hasCoords).length;
    return { count: rows.length, missing, withCoords: rows.length - missing };
  }

  /**
   * Длина по прямой между соседними точками С КООРДИНАТАМИ (записи без
   * координат пропускаются, линия идёт к следующей известной точке).
   * dist(lat1,lng1,lat2,lng2) → км. Возвращает { km, legs }.
   */
  function pathLength(rows, dist) {
    const pts = (rows || []).filter((r) => r && r.hasCoords);
    let km = 0;
    for (let i = 1; i < pts.length; i++) km += dist(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    return { km, legs: Math.max(0, pts.length - 1) };
  }

  /**
   * Точки маршрута: дом (если задан числами) как точка 0, затем строки с
   * координатами в календарном порядке.
   */
  function points(rows, home) {
    const pts = (rows || []).filter((r) => r && r.hasCoords);
    return home && isNum(home.lat) && isNum(home.lng)
      ? [{ id: '', n: 0, home: true, hasCoords: true, lat: home.lat, lng: home.lng, name: String(home.name || '') }].concat(pts)
      : pts;
  }

  /**
   * R4: строки в порядке черновика. order — id записей; неизвестные id
   * отбрасываются, строки вне order дописываются в конец в календарном
   * порядке. Номера n пересчитываются; входные объекты не меняются.
   */
  function applyOrder(rows, order) {
    const byId = new Map((rows || []).map((r) => [r.id, r]));
    const seen = new Set();
    const out = [];
    (Array.isArray(order) ? order : []).forEach((id) => {
      const r = byId.get(id);
      if (r && !seen.has(id)) { seen.add(id); out.push(r); }
    });
    (rows || []).forEach((r) => { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } });
    return out.map((r, i) => Object.assign({}, r, { n: i + 1 }));
  }

  /**
   * R4: сдвинуть id на шаг dir (−1 вверх, +1 вниз) — обмен с ближайшей
   * НЕзакреплённой строкой; закреплённые остаются на своих местах.
   * Закреплённую саму не двигаем. Нечего менять → тот же порядок (копия).
   */
  function move(order, locks, id, dir) {
    const lk = new Set(locks || []);
    const a = (order || []).slice();
    const i = a.indexOf(id);
    if (i < 0 || lk.has(id) || (dir !== 1 && dir !== -1)) return a;
    let j = i + dir;
    while (j >= 0 && j < a.length && lk.has(a[j])) j += dir;
    if (j < 0 || j >= a.length) return a;
    a[i] = a[j]; a[j] = id;
    return a;
  }

  /** R5: сколько строк черновика стоит не на своей календарной позиции. */
  function moved(calRows, draftRows) {
    const pos = new Map((calRows || []).map((r, i) => [r.id, i]));
    return (draftRows || []).reduce((n, r, i) => n + (pos.has(r.id) && pos.get(r.id) !== i ? 1 : 0), 0);
  }

  /**
   * R6: предложить порядок с минимальной суммой км по прямой.
   * rows — строки В ТЕКУЩЕМ порядке (id, lat, lng, hasCoords); locks — id
   * закреплённых; home — {lat,lng} | null; dist(a,b) → км по точкам {lat,lng}.
   * Свободные = не закреплены И с координатами; остальные стоят в своих
   * слотах. Переставляются только свободные между свободными слотами.
   * Детерминированно: два старта (текущий порядок и жадный «ближайший
   * сосед») + локальный поиск (обмен, разворот отрезка, перенос одного).
   * → { order: [id], before, after, changed } (км, сумма от дома по строкам с
   * координатами в порядке слотов).
   */
  function optimize(rows, locks, home, dist) {
    const list = Array.isArray(rows) ? rows : [];
    const lk = new Set(locks || []);
    const isFree = (r) => r.hasCoords && !lk.has(r.id);
    const slots = [];
    list.forEach((r, i) => { if (isFree(r)) slots.push(i); });
    const ids0 = list.map((r) => r.id);
    const hasHome = home && isNum(home.lat) && isNum(home.lng);
    const cost = (seq) => {
      let km = 0, prev = hasHome ? home : null;
      for (const r of seq) { if (!r.hasCoords) continue; if (prev) km += dist(prev, r); prev = r; }
      return km;
    };
    const build = (free) => { const out = list.slice(); slots.forEach((si, k) => { out[si] = free[k]; }); return out; };
    const before = cost(list);
    if (slots.length < 2) return { order: ids0, before, after: before, changed: false };

    const start = slots.map((si) => list[si]);
    // Жадный старт: идём по слотам, в свободный ставим ближайшего к предыдущей точке.
    const greedy = (() => {
      const pool = start.slice(), free = [];
      let prev = hasHome ? home : null;
      list.forEach((r, i) => {
        if (slots.includes(i)) {
          let bi = 0;
          if (prev) { let bd = Infinity; pool.forEach((c, j) => { const d = dist(prev, c); if (d < bd - 1e-12) { bd = d; bi = j; } }); }
          const pick = pool.splice(bi, 1)[0]; free.push(pick); prev = pick;
        } else if (r.hasCoords) prev = r;
      });
      return free;
    })();

    const improve = (free0) => {
      let free = free0.slice(), best = cost(build(free));
      for (let pass = 0; pass < 60; pass++) {
        let improved = false;
        const tryFree = (cand) => { const c = cost(build(cand)); if (c < best - 1e-9) { best = c; free = cand; improved = true; return true; } return false; };
        const n = free.length;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const sw = free.slice(); sw[i] = free[j]; sw[j] = free[i]; tryFree(sw);
          const rv = free.slice(0, i).concat(free.slice(i, j + 1).reverse(), free.slice(j + 1)); tryFree(rv);
        }
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const mv = free.slice(); const [x] = mv.splice(i, 1); mv.splice(j, 0, x); tryFree(mv);
        }
        if (!improved) break;
      }
      return { free, cost: best };
    };

    const a = improve(start), b = improve(greedy);
    const win = b.cost < a.cost - 1e-9 ? b : a;
    if (!(win.cost < before - 1e-9)) return { order: ids0, before, after: before, changed: false };
    const order = build(win.free).map((r) => r.id);
    return { order, before, after: win.cost, changed: order.join('\u0001') !== ids0.join('\u0001') };
  }

  /**
   * R7: прошедшие строки — на своих календарных местах. order — полный
   * порядок id (после applyOrder); past — id прошедших. Остальные заполняют
   * свободные места в порядке order.
   */
  function pinPast(order, calRows, past) {
    const ps = new Set(past || []);
    if (!ps.size) return (order || []).slice();
    const res = (calRows || []).map((r) => (ps.has(r.id) ? r.id : null));
    const rest = (order || []).filter((id) => !ps.has(id));
    let k = 0;
    for (let i = 0; i < res.length; i++) if (res[i] === null) res[i] = rest[k++];
    return res.filter((id) => id != null);
  }

  /**
   * R7: что изменит применение. Слот i = даты calRows[i]; строка draftRows[i]
   * переезжает в него. → [{ id, name, from:{start,end}, to:{start,end},
   * sent302, sentLetter }] только для строк, чьи даты реально меняются.
   */
  function applyPlan(calRows, draftRows) {
    const out = [];
    (draftRows || []).forEach((row, i) => {
      const slot = (calRows || [])[i];
      if (!slot || (slot.start === row.start && slot.end === row.end)) return;
      out.push({ id: row.id, name: row.name, from: { start: row.start, end: row.end }, to: { start: slot.start, end: slot.end }, sent302: !!row.sent302, sentLetter: !!row.sentLetter });
    });
    return out;
  }

  root.CPRoute = { collect, summarize, pathLength, points, applyOrder, move, moved, optimize, pinPast, applyPlan };

  /* ═══════════════════════ Интерфейс ═══════════════════════ */

  (root.CPParts = root.CPParts || []).push(function (App) {
    const t = (k, v) => App.utils.t(k, v || {});
    const esc = (s) => App.utils.escapeHtml(s);
    const $ = (id) => document.getElementById(id);
    let bound = false;
    let year = null;           // выбранный служебный год; только в памяти вкладки
    let rows = [];
    let selectedId = null;     // подсветка строки/точки; только в памяти
    let map = null, pinsLayer = null, lineLayer = null, tileLayer = null;
    let drawnSig = '', fittedYear = null, tileError = false, leafletPromise = null;
    let pts = [];              // точки маршрута (дом + строки с координатами)
    const legMemo = new Map(); // кэш дорожных отрезков в памяти вкладки
    let legByRow = new Map();  // id строки → отрезок, ведущий в неё
    let roadState = '';        // '' | 'busy' | 'offline' | 'failed'
    let roadProgress = [0, 0], loadedSig = '';
    const Legs = () => root.CPRouteLegs;
    let calRows = [];          // строки в календарном порядке
    let calPts = [], draftPts = null; // R5: точки обоих порядков (draftPts — если черновик есть)
    let draft = null, draftYear = null; // R4: { on, order, locks } | null
    let focusAfter = null;     // [id, селектор] — вернуть фокус после перерисовки
    let optNote = '', optUndo = null; // R6: итог последнего предложения; откат (только в памяти)
    let mobileView = 'list';   // R8: 'list' | 'map' (≤900px); только в памяти
    let resizeBound = false;
    let pastIds = new Set();   // R7: прошедшие записи — всегда на месте
    const effLocks = () => (draft ? draft.locks : []).concat(Array.from(pastIds).filter((id) => !(draft && draft.locks.includes(id))));

    // R4: черновик — ЕДИНСТВЕННАЯ запись экрана, только sessionStorage.
    const draftKey = (y) => 'cp.route.draft.' + y;
    function draftRead(y) {
      try {
        const v = JSON.parse(root.sessionStorage.getItem(draftKey(y)) || 'null');
        if (!v || !Array.isArray(v.order)) return null;
        return { on: !!v.on, order: v.order.map(String), locks: Array.isArray(v.locks) ? v.locks.map(String) : [] };
      } catch (_) { return null; }
    }
    function draftWrite(y, d) {
      try {
        if (d) root.sessionStorage.setItem(draftKey(y), JSON.stringify({ on: d.on, order: d.order, locks: d.locks }));
        else root.sessionStorage.removeItem(draftKey(y));
      } catch (_) { /* приватный режим и т. п.: черновик живёт только в памяти */ }
    }

    const currentYear = () => App.utils.getServiceYearForDate(new Date());
    const yearsList = () => {
      const set = new Set(Object.keys(App.state.app.serviceYears || {}).map(Number).filter(Number.isInteger));
      set.add(currentYear());
      return Array.from(set).sort((a, b) => b - a);
    };

    function loadLeaflet() {
      if (window.L) return Promise.resolve(window.L);
      if (leafletPromise) return leafletPromise;
      leafletPromise = new Promise((resolve, reject) => {
        if (!$('cpLeafletCss')) {
          const link = document.createElement('link');
          link.id = 'cpLeafletCss'; link.rel = 'stylesheet'; link.href = './vendor/leaflet.css';
          document.head.appendChild(link);
        }
        const existing = document.querySelector('script[src="./vendor/leaflet.js"]');
        const script = existing || document.createElement('script');
        script.addEventListener('load', () => (window.L ? resolve(window.L) : reject(new Error('leaflet'))));
        script.addEventListener('error', () => { leafletPromise = null; reject(new Error('leaflet load failed')); });
        if (!existing) { script.src = './vendor/leaflet.js'; document.head.appendChild(script); }
      });
      return leafletPromise;
    }

    function range(row) {
      const d = (iso) => App.utils.prettyDate(App.utils.parseLocalDate(iso));
      return row.end && row.end !== row.start ? `${d(row.start)} – ${d(row.end)}` : d(row.start);
    }

    function fmtKm(km) { return Math.round(km).toLocaleString(App.utils.lang()); }
    function fmtDur(min) {
      const total = Math.round(min);
      const h = Math.floor(total / 60), m = total % 60;
      return h ? t('route_dur', { h, m }) : t('route_dur_min', { m });
    }
    function legText(leg) {
      if (!leg) return '';
      return '↳ ' + (leg.road ? t('route_leg_road', { km: fmtKm(leg.km), time: fmtDur(leg.min) }) : t('route_leg_straight', { km: fmtKm(leg.km) }));
    }

    function homeRowHtml(home) {
      return `<div class="route-row route-row-home"><div class="route-pick route-pick-static">`
        + `<span class="route-n route-n-home" aria-hidden="true">⌂</span><span class="route-main"><span class="route-name">${esc(t('route_home'))}</span>`
        + (home.name ? `<span class="small">${esc(home.name)}</span>` : '') + `</span></div></div>`;
    }

    // R6: в режиме черновика строка показывает даты СЛОТА (позиция n), а не свои.
    function slotOf(row) {
      if (!(draft && draft.on)) return row;
      const slot = calRows[row.n - 1];
      return slot && slot.id !== row.id ? slot : row;
    }

    function rowHtml(row) {
      const badge = row.hasCoords
        ? `<span class="route-n">${row.n}</span>`
        : `<span class="route-n route-n-off" aria-hidden="true">–</span>`;
      const typeLabel = row.visitType ? App.utils.visitTypeLabel(row.visitType) : '';
      const leg = legByRow.get(row.id);
      const note = row.hasCoords
        ? (leg ? `<span class="small route-leg${leg.road ? '' : ' is-straight'}">${esc(legText(leg))}</span>` : '')
        : `<span class="small route-warn">${esc(t('route_no_coords'))}</span>`;
      const id = App.utils.escapeAttr(row.id);
      return `<div class="route-row${row.id === selectedId ? ' is-selected' : ''}" data-route-row="${id}">`
        + `<button type="button" class="route-pick md-state-layer" data-route-pick="${id}" aria-pressed="${row.id === selectedId}">`
        + `${badge}<span class="route-main"><span class="route-name">${esc(row.name)}</span>`
        + `<span class="small">${esc([typeLabel, range(slotOf(row))].filter(Boolean).join(' · '))}</span>`
        + (slotOf(row) !== row ? `<span class="small route-was">${esc(t('route_was', { range: range(row) }))}</span>` : '')
        + `${note}</span></button>`
        + (draft && draft.on ? draftCtl(row) : `<button type="button" class="route-cal md-btn md-btn-outlined md-state-layer" data-route-entry="${id}" title="${esc(t('route_open'))}" aria-label="${esc(t('route_open'))}: ${esc(row.name)}">📆</button>`)
        + `</div>`;
    }

    function draftCtl(row) {
      const id = App.utils.escapeAttr(row.id);
      const order = rows.map((r) => r.id);
      const past = pastIds.has(row.id);
      const locked = past || draft.locks.includes(row.id);
      const locks = effLocks();
      const can = (dir) => move(order, locks, row.id, dir).join('\u0001') !== order.join('\u0001');
      const b = (dir, sym, key) => `<button type="button" class="route-mv md-btn md-btn-outlined md-state-layer" data-route-move="${dir}" data-id="${id}"${can(dir) ? '' : ' disabled'} title="${esc(t(key))}" aria-label="${esc(t(key))}: ${esc(row.name)}">${sym}</button>`;
      return `<span class="route-ctl">${b(-1, '↑', 'route_up')}${b(1, '↓', 'route_down')}`
        + (past
          ? `<button type="button" class="route-mv route-lock md-btn md-btn-outlined md-state-layer is-locked" disabled aria-pressed="true" title="${esc(t('route_past'))}" aria-label="${esc(t('route_past'))}: ${esc(row.name)}">🔒</button></span>`
          : `<button type="button" class="route-mv route-lock md-btn md-btn-outlined md-state-layer${locked ? ' is-locked' : ''}" data-route-lock="${id}" aria-pressed="${locked}" title="${esc(t(locked ? 'route_unlock' : 'route_lock'))}" aria-label="${esc(t(locked ? 'route_unlock' : 'route_lock'))}: ${esc(row.name)}">${locked ? '🔒' : '🔓'}</button></span>`);
    }

    function renderDraftBar() {
      const bar = $('routeDraftBar');
      if (!bar) return;
      const btn = (act, key, primary) => `<button type="button" class="md-btn ${primary ? 'md-btn-tonal' : 'md-btn-outlined'} md-state-layer route-draft-btn" data-route-draft="${act}">${esc(t(key))}</button>`;
      if (!rows.length) { bar.innerHTML = ''; return; }
      const canOpt = rows.filter((r) => r.hasCoords).length > 1;
      const optBtn = canOpt ? btn('optimize', 'route_opt_btn', false) : '';
      const undoBtn = optUndo ? btn('opt-undo', 'route_opt_undo', false) : '';
      const status = optNote ? `<span class="small route-opt-note" role="status">${esc(optNote)}</span>` : '';
      if (draft && draft.on) {
        const ro = !!(App.store.degraded || App.store.conflict);
        const applyBtn = applyPlan(calRows, rows).length
          ? `<button type="button" class="md-btn md-btn-filled md-state-layer route-draft-btn" data-route-draft="apply"${ro ? ' disabled aria-disabled="true"' : ''} title="${esc(t(ro ? 'msg_storage_readonly' : 'route_apply_hint'))}">${esc(t('route_apply'))}</button>`
          : '';
        bar.innerHTML = `<span class="small route-draft-note">${esc(t('route_draft_note'))}</span>`
          + btn('view', 'route_draft_view', false) + optBtn + undoBtn + btn('reset', 'route_draft_reset', false) + applyBtn + status;
      } else {
        bar.innerHTML = btn('edit', draft ? 'route_draft_open' : 'route_draft_edit', true)
          + optBtn + undoBtn + (draft ? btn('reset', 'route_draft_reset', false) : '') + status;
      }
    }

    /* R7: ЕДИНСТВЕННАЯ запись этого файла в канонический блоб. */
    function applyDraft() {
      if (!draft || !draft.on) return;
      if (App.store.degraded || App.store.conflict) { App.utils.toast(t('msg_storage_readonly')); return; }
      const plan = applyPlan(calRows, rows);
      if (!plan.length) return;
      const d = (iso) => App.utils.prettyDate(App.utils.parseLocalDate(iso));
      const rng = (x) => (x.end && x.end !== x.start ? `${d(x.start)} – ${d(x.end)}` : d(x.start));
      const lines = plan.map((c) => t('route_apply_line', { name: c.name, from: rng(c.from), to: rng(c.to) }));
      const sent = plan.filter((c) => c.sent302 || c.sentLetter)
        .map((c) => `• ${c.name}: ${[c.sent302 ? t('s302') : '', c.sentLetter ? t('letter_short') : ''].filter(Boolean).join(', ')}`);
      const msg = [t('route_apply_confirm', { n: plan.length }), '', ...lines]
        .concat(sent.length ? ['', t('route_apply_warn'), ...sent] : [])
        .concat(['', t('route_apply_restore')]).join('\n');
      if (!window.confirm(msg)) return;
      const applyYear = year;
      try { App.store.flushNow('snapshot'); } catch (_) { /* не фатально */ }
      /* Аудит 03, P2-3 — тот же контракт, что у A5 (archive-year.js,
         backupFirst): подтверждение обещает откат через «Историю изменений»,
         значит без снятой контрольной точки даты не трогаем вовсе. */
      App.store.checkpointNow('route-apply').catch(() => null).then((snapshotId) => {
        if (!snapshotId) { App.utils.toast(t('route_apply_no_backup')); return; }
        const entries = App.state.app.entries || [];
        const byId = new Map(entries.map((e) => [e.id, e]));
        // Календарь мог измениться, пока ждали снимок, — тогда не пишем ничего.
        const stale = plan.some((c) => { const e = byId.get(c.id); return !e || e.start !== c.from.start || e.end !== c.from.end; });
        if (stale) { App.utils.toast(t('route_apply_stale')); render(); return; }
        plan.forEach((c) => {
          const e = byId.get(c.id);
          if (e.start !== c.to.start) e.notified60 = false;
          e.start = c.to.start; e.end = c.to.end;
        });
        App.store.save();
        draft = null; optNote = ''; optUndo = null;
        draftWrite(applyYear, null);
        App.utils.toast(t('route_apply_done', { n: plan.length }));
        App.ui.renderAll();
      });
    }

    function draftOptimize() {
      const cur = draft ? applyOrder(calRows, draft.order) : calRows;
      const res = optimize(cur, effLocks(), home(), (a, b) => App.utils.haversineKm(a.lat, a.lng, b.lat, b.lng));
      if (!res.changed) { optNote = t('route_opt_same'); optUndo = null; render(); return; }
      optUndo = draft ? { order: draft.order.slice(), on: draft.on, existed: true } : { existed: false };
      draft = draft || { on: true, order: [], locks: [] };
      draft.on = true; draft.order = res.order;
      optNote = t('route_opt_done', { before: fmtKm(res.before), after: fmtKm(res.after), diff: fmtKm(res.before - res.after) });
      draftWrite(year, draft);
      render();
    }

    function draftOptUndo() {
      if (!optUndo) return;
      if (optUndo.existed) { draft.order = optUndo.order; draft.on = optUndo.on; draftWrite(year, draft); }
      else { draft = null; draftWrite(year, null); }
      optUndo = null; optNote = '';
      render();
    }

    function draftAction(act) {
      if (act === 'optimize') { draftOptimize(); return; }
      if (act === 'apply') { applyDraft(); return; }
      if (act === 'opt-undo') { draftOptUndo(); return; }
      optNote = ''; optUndo = null;
      if (act === 'edit') {
        draft = draft || { on: true, order: calRows.map((r) => r.id), locks: [] };
        draft.on = true;
      } else if (act === 'view' && draft) {
        draft.on = false;
      } else if (act === 'reset') {
        draft = null;
      }
      draftWrite(year, draft);
      render();
    }

    function draftMove(id, dir) {
      if (!draft || !draft.on) return;
      optNote = ''; optUndo = null;
      draft.order = move(rows.map((r) => r.id), effLocks(), id, dir);
      draftWrite(year, draft);
      focusAfter = [id, `[data-route-move="${dir}"]`];
      render();
    }

    function draftLock(id) {
      if (!draft || !draft.on || pastIds.has(id)) return;
      optNote = ''; optUndo = null;
      draft.locks = draft.locks.includes(id) ? draft.locks.filter((x) => x !== id) : draft.locks.concat(id);
      draftWrite(year, draft);
      focusAfter = [id, '[data-route-lock]'];
      render();
    }

    function restoreFocus() {
      if (!focusAfter) return;
      const [id, sel] = focusAfter;
      focusAfter = null;
      const row = document.querySelector(`[data-route-row="${CSS.escape(id)}"]`);
      if (!row) return;
      const el = row.querySelector(sel + ':not([disabled])') || row.querySelector('[data-route-move]:not([disabled])') || row.querySelector('[data-route-lock]');
      if (el) el.focus();
    }

    function skeleton(host) {
      host.innerHTML = `<div class="md-card route-card">
        <div class="small route-sub">${esc(t('route_sub'))}</div>
        <label class="small route-year">${esc(t('route_year'))} <select id="routeYearSelect"></select></label>
        <div class="route-draft-bar" id="routeDraftBar"></div>
        <div class="small route-summary" id="routeSummary"></div>
        <div class="route-road"><span class="small" id="routeRoad"></span>
          <button type="button" class="md-btn md-btn-outlined md-state-layer route-road-btn" id="routeRoadBtn" hidden title="${esc(t('route_road_privacy'))}">${esc(t('route_road_btn'))}</button></div>
        <div class="route-compare" id="routeCompare" hidden></div>
        <div class="route-tabs" id="routeTabs" role="tablist" aria-label="${esc(t('screen_route'))}">
          <button type="button" role="tab" class="md-btn md-btn-outlined md-state-layer route-tab" id="routeTabList" data-route-tab="list" aria-controls="routeList">${esc(t('route_tab_list'))}</button>
          <button type="button" role="tab" class="md-btn md-btn-outlined md-state-layer route-tab" id="routeTabMap" data-route-tab="map" aria-controls="routeMapPane">${esc(t('route_tab_map'))}</button></div>
        <div class="route-layout" id="routeLayout" data-view="list">
          <div class="route-list" id="routeList"></div>
          <div class="route-map-pane" id="routeMapPane"><div class="route-map" id="routeMap"></div>
            <div class="small route-map-note" id="routeMapNote" hidden></div></div>
        </div></div>`;
    }

    // R8: показать вкладку. Карта, жившая в скрытом блоке, пересчитывает размер.
    function setView(view, focus) {
      mobileView = view === 'map' ? 'map' : 'list';
      const layout = $('routeLayout');
      if (!layout) return;
      layout.dataset.view = mobileView;
      [['list', 'routeTabList'], ['map', 'routeTabMap']].forEach(([v, id]) => {
        const b = $(id);
        if (!b) return;
        const on = v === mobileView;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle('is-active', on);
        if (on && focus) b.focus();
      });
      if (mobileView === 'map') {
        requestAnimationFrame(() => {
          if (!map) { ensureMap(); return; }
          map.invalidateSize();
          fittedYear = null; drawnSig = ''; drawMap();
        });
      }
    }

    function setMapNote(text) {
      const n = $('routeMapNote');
      if (!n) return;
      n.hidden = !text; n.textContent = text || '';
    }

    function pinIcon(row, active) {
      return L.divIcon({ className: 'route-pin' + (active ? ' is-active' : ''), html: `<span>${row.n}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    }

    function drawMap() {
      if (!map) return;
      const ghost = draft && draft.on && moved(calRows, rows) ? calPts : null;
      const sig = year + '|' + pts.map((r) => [r.id, r.n, r.lat, r.lng].join(',')).join(';') + '|' + selectedId
        + '|' + (ghost ? ghost.map((r) => r.id).join(',') : '');
      if (sig === drawnSig) return;
      drawnSig = sig;
      pinsLayer.clearLayers(); lineLayer.clearLayers();
      if (!pts.some((r) => !r.home)) { setMapNote(t('map_no_coords')); return; }
      if (!tileError) setMapNote('');
      if (ghost && ghost.length > 1) L.polyline(ghost.map((r) => [r.lat, r.lng]), { color: '#7a7f8c', weight: 2, opacity: 0.8, dashArray: '6 6', interactive: false }).addTo(lineLayer);
      if (pts.length > 1) L.polyline(pts.map((r) => [r.lat, r.lng]), { color: '#3b6fd8', weight: 3, opacity: 0.85 }).addTo(lineLayer);
      pts.forEach((r) => {
        if (r.home) {
          L.marker([r.lat, r.lng], { icon: L.divIcon({ className: 'route-pin is-home', html: '<span>⌂</span>', iconSize: [28, 28], iconAnchor: [14, 14] }), keyboard: false, title: t('route_home') })
            .bindTooltip(esc(t('route_home'))).addTo(pinsLayer);
          return;
        }
        const m = L.marker([r.lat, r.lng], { icon: pinIcon(r, r.id === selectedId), keyboard: true, title: `${r.n}. ${r.name}`, zIndexOffset: r.id === selectedId ? 1000 : 0 });
        m.bindTooltip(`${r.n}. ${esc(r.name)}`);
        m.on('click', () => select(r.id, false));
        m.addTo(pinsLayer);
      });
      if (fittedYear !== year) {
        fittedYear = year;
        if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 10);
        else map.fitBounds(pts.map((r) => [r.lat, r.lng]), { padding: [28, 28] });
      }
    }

    function ensureMap() {
      const el = $('routeMap');
      if (!el) return;
      loadLeaflet().then(() => requestAnimationFrame(() => {
        if (!map) {
          map = L.map(el, { attributionControl: true });
          map.setView([50.5, 12.5], 5);
          tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
          tileLayer.on('tileerror', () => { if (!tileError) { tileError = true; setMapNote(t('map_offline_notice')); } });
          tileLayer.on('load', () => { if (tileError) { tileError = false; setMapNote(''); drawnSig = ''; drawMap(); } });
          tileLayer.addTo(map);
          lineLayer = L.layerGroup().addTo(map);
          pinsLayer = L.layerGroup().addTo(map);
        }
        map.invalidateSize();
        drawMap();
      })).catch(() => setMapNote(t('map_offline_notice')));
    }

    function select(id, fromList) {
      selectedId = selectedId === id && fromList ? null : id;
      renderList();
      drawMap();
      const row = rows.find((r) => r.id === selectedId);
      if (map && row && row.hasCoords) map.panTo([row.lat, row.lng]);
      if (!fromList && selectedId) {
        const el = document.querySelector(`[data-route-row="${CSS.escape(selectedId)}"]`);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      }
    }

    function renderList() {
      const list = $('routeList');
      if (!list) return;
      const h = pts.length && pts[0].home ? pts[0] : null;
      list.innerHTML = rows.length ? (h ? homeRowHtml(h) : '') + rows.map(rowHtml).join('') : `<div class="md-empty">${esc(t('route_none'))}</div>`;
    }

    function home() {
      const s = App.state.app.settings || {};
      return { lat: s.homeLat, lng: s.homeLng, name: typeof s.homeAddress === 'string' ? s.homeAddress : '' };
    }

    const memoGet = (k) => { const r = legMemo.get(k); return r && typeof r.km === 'number' ? r : null; };
    const totalsOf = (list) => (Legs() && list && list.length > 1 ? Legs().totals(list, memoGet, App.utils.haversineKm) : null);
    // Порядки для дорожного расчёта и кэша: показанный + (R5) второй, если есть черновик.
    function orderLists() {
      const lists = [pts];
      if (draftPts) lists.push(draft && draft.on ? calPts : draftPts);
      return lists.filter((l) => l && l.length > 1);
    }

    function computeLegs() {
      legByRow = new Map();
      if (!Legs() || pts.length < 2) return null;
      const tot = totalsOf(pts);
      tot.legs.forEach((leg, i) => { if (!pts[i + 1].home) legByRow.set(pts[i + 1].id, leg); });
      return tot;
    }

    function renderSummary() {
      const sumEl = $('routeSummary'), roadEl = $('routeRoad'), btn = $('routeRoadBtn');
      if (!sumEl) return;
      const tot = computeLegs();
      const sum = summarize(rows);
      const path = pathLength(pts, App.utils.haversineKm);
      sumEl.textContent = rows.length
        ? [t('route_summary', { count: sum.count, missing: sum.missing }), path.legs ? t('route_km_straight', { km: fmtKm(path.km), legs: path.legs }) : ''].filter(Boolean).join(' · ')
        : '';
      let road = '';
      if (tot && tot.roadLegs) {
        road = tot.complete
          ? t('route_road', { km: fmtKm(tot.km), time: fmtDur(tot.min) })
          : t('route_road_partial', { done: tot.roadLegs, legs: tot.count, km: fmtKm(tot.km) });
      }
      if (roadState === 'busy') road = t('route_road_busy', { done: roadProgress[0], total: roadProgress[1] });
      else if (roadState === 'offline') road = [road, t('route_road_offline')].filter(Boolean).join(' · ');
      else if (roadState === 'failed') road = [road, t('route_road_failed')].filter(Boolean).join(' · ');
      roadEl.textContent = road;
      const lists = orderLists();
      btn.hidden = !lists.length || lists.every((l) => totalsOf(l).complete);
      btn.disabled = roadState === 'busy';
      renderCompare();
    }

    // R5: таблица «Календарь ↔ Черновик». Только чтение, считает из памяти.
    function renderCompare() {
      const box = $('routeCompare');
      if (!box) return;
      if (!draftPts || !rows.length) { box.hidden = true; box.innerHTML = ''; return; }
      const draftRows = draft.on ? rows : applyOrder(calRows, draft.order);
      const n = moved(calRows, draftRows);
      const sA = pathLength(calPts, App.utils.haversineKm), sB = pathLength(draftPts, App.utils.haversineKm);
      const rA = totalsOf(calPts), rB = totalsOf(draftPts);
      const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±');
      const dKm = (v) => sign(Math.round(v)) + t('route_km', { km: fmtKm(Math.abs(v)) });
      const dMin = (v) => `${sign(Math.round(v))}${fmtDur(Math.abs(v))}`;
      const road = (r) => (!r || !r.roadLegs ? '—'
        : r.complete ? t('route_leg_road', { km: fmtKm(r.km), time: fmtDur(r.min) })
          : `≈ ${t('route_km', { km: fmtKm(r.km) })} · ${t('route_cmp_partial', { done: r.roadLegs, legs: r.count })}`);
      const roadDiff = rA && rB && rA.complete && rB.complete ? `${dKm(rB.km - rA.km)} · ${dMin(rB.min - rA.min)}` : '—';
      const cls = (v) => (Math.round(v) < 0 ? ' is-better' : Math.round(v) > 0 ? ' is-worse' : '');
      box.hidden = false;
      box.innerHTML = `<table class="route-cmp small"><caption>${esc(t('route_cmp_title'))}</caption>`
        + `<thead><tr><th scope="col"></th><th scope="col">${esc(t('route_cmp_cal'))}</th><th scope="col">${esc(t('route_cmp_draft'))}</th><th scope="col">${esc(t('route_cmp_diff'))}</th></tr></thead><tbody>`
        + `<tr><th scope="row">${esc(t('route_cmp_straight'))}</th><td>${esc(t('route_km', { km: fmtKm(sA.km) }))}</td><td>${esc(t('route_km', { km: fmtKm(sB.km) }))}</td><td class="route-cmp-d${cls(sB.km - sA.km)}">${esc(dKm(sB.km - sA.km))}</td></tr>`
        + `<tr><th scope="row">${esc(t('route_cmp_road'))}</th><td>${esc(road(rA))}</td><td>${esc(road(rB))}</td><td class="route-cmp-d${roadDiff === '—' ? '' : cls(rB.km - rA.km)}">${esc(roadDiff)}</td></tr>`
        + `</tbody></table><div class="small route-cmp-foot">${esc(n ? t('route_cmp_moved', { n }) : t('route_cmp_same'))}`
        + (draft.on && n ? ` · ${esc(t('route_cmp_legend'))}` : '') + `</div>`;
    }

    // Подтянуть сохранённые отрезки для текущих точек (без сети).
    function loadCachedLegs() {
      if (!Legs()) return;
      const keys = [];
      orderLists().forEach((l) => { for (let i = 1; i < l.length; i++) keys.push(Legs().legKey(l[i - 1], l[i])); });
      if (!keys.length) return;
      const sig = keys.join('|');
      if (sig === loadedSig) return;
      loadedSig = sig;
      const need = keys.filter((k) => !legMemo.has(k));
      if (!need.length) return;
      Legs().loadMany(need).then((found) => {
        if (!found.size) return;
        found.forEach((v, k) => { if (!legMemo.has(k)) legMemo.set(k, v); });
        renderSummary(); renderList();
      });
    }

    function fetchRoads() {
      if (!Legs() || roadState === 'busy' || pts.length < 2) return;
      if (navigator.onLine === false) { roadState = 'offline'; renderSummary(); return; }
      roadState = 'busy'; roadProgress = [0, 0];
      renderSummary();
      const snapshot = orderLists().map((l) => l.slice());
      Legs().fetchMissing(snapshot, legMemo, (done, total) => {
        roadProgress = [done, total]; renderSummary(); renderList();
      }).then((res) => {
        roadState = res.offline ? 'offline' : res.failed ? 'failed' : '';
        renderSummary(); renderList();
      }, () => { roadState = 'failed'; renderSummary(); });
    }

    function render() {
      const host = $('routeRoot');
      if (!host || App.state.selectedScreen !== 'route') return;
      if (!$('routeList')) skeleton(host);
      const years = yearsList();
      if (!years.includes(year)) year = years.includes(App.state.selectedYear) ? App.state.selectedYear : currentYear();
      const select_ = $('routeYearSelect');
      select_.innerHTML = years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${esc(App.utils.serviceYearLabel(y))}</option>`).join('');
      const stats = App.data.getServiceYearStats(year);
      calRows = collect(stats.visitEntries, (id) => App.data.getEventById(id));
      if (draftYear !== year) { draftYear = year; draft = draftRead(year); optNote = ''; optUndo = null; }
      const todayIso = App.utils.iso(new Date());
      pastIds = new Set(calRows.filter((r) => r.end < todayIso).map((r) => r.id));
      if (draft) {
        // Черновик сверяется с календарём: выпавшие id убираются из порядка
        // и замков, новые записи дописываются в конец.
        const ids = new Set(calRows.map((r) => r.id));
        draft.locks = draft.locks.filter((id) => ids.has(id));
        draft.order = pinPast(applyOrder(calRows, draft.order).map((r) => r.id), calRows, pastIds);
      }
      rows = draft && draft.on ? applyOrder(calRows, draft.order) : calRows;
      calPts = points(calRows, home());
      draftPts = draft ? points(applyOrder(calRows, draft.order), home()) : null;
      if (selectedId && !rows.some((r) => r.id === selectedId)) selectedId = null;
      pts = points(rows, home());
      if (roadState !== 'busy') roadState = '';
      setView(mobileView, false);
      renderDraftBar();
      renderSummary();
      renderList();
      restoreFocus();
      loadCachedLegs();
      ensureMap();
    }

    function bind() {
      if (bound) return;
      const host = $('routeRoot');
      if (!host) return;
      bound = true;
      host.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'routeYearSelect') { year = Number(e.target.value); selectedId = null; render(); }
      });
      host.addEventListener('keydown', (e) => {
        const tab = e.target && e.target.closest && e.target.closest('[data-route-tab]');
        if (!tab || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End')) return;
        e.preventDefault();
        setView(e.key === 'ArrowLeft' || e.key === 'Home' ? 'list' : 'map', true);
      });
      if (!resizeBound) {
        resizeBound = true;
        let timer = null;
        window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { if (map && App.state.selectedScreen === 'route') map.invalidateSize(); }, 150); });
      }
      host.addEventListener('click', (e) => {
        const tabBtn = e.target.closest && e.target.closest('[data-route-tab]');
        if (tabBtn) { setView(tabBtn.dataset.routeTab, false); return; }
        if (e.target && e.target.closest && e.target.closest('#routeRoadBtn')) { fetchRoads(); return; }
        const da = e.target.closest && e.target.closest('[data-route-draft]');
        if (da) { draftAction(da.dataset.routeDraft); return; }
        const mv = e.target.closest && e.target.closest('[data-route-move]');
        if (mv) { if (!mv.disabled) draftMove(mv.dataset.id, Number(mv.dataset.routeMove)); return; }
        const lk = e.target.closest && e.target.closest('[data-route-lock]');
        if (lk) { draftLock(lk.dataset.routeLock); return; }
        const cal = e.target.closest && e.target.closest('[data-route-entry]');
        if (cal) {
          if (App.actions.focusEntryFromHash('#calendar?entry=' + encodeURIComponent(cal.dataset.routeEntry))) App.ui.renderAll();
          return;
        }
        const pick = e.target.closest && e.target.closest('[data-route-pick]');
        if (pick) select(pick.dataset.routePick, true);
      });
    }

    App.ui.routeRender = function () { bind(); render(); };
  });
})(window);
