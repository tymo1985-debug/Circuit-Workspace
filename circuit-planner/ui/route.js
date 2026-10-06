// circuit-planner/ui/route.js
//
// «Маршрут посещений» — R1 (06.10.2026) список, R2 (06.10.2026) карта:
// ТОЛЬКО ПРОСМОТР. Идея и фазы
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
//  • Ничего не пишется: ни в канонический блоб, ни в localStorage/
//    sessionStorage, ни в IndexedDB. Черновик порядка появится только в R4
//    и только в sessionStorage.
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

  root.CPRoute = { collect, summarize, pathLength };

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

    function rowHtml(row) {
      const badge = row.hasCoords
        ? `<span class="route-n">${row.n}</span>`
        : `<span class="route-n route-n-off" aria-hidden="true">–</span>`;
      const typeLabel = row.visitType ? App.utils.visitTypeLabel(row.visitType) : '';
      const note = row.hasCoords ? '' : `<span class="small route-warn">${esc(t('route_no_coords'))}</span>`;
      const id = App.utils.escapeAttr(row.id);
      return `<div class="route-row${row.id === selectedId ? ' is-selected' : ''}" data-route-row="${id}">`
        + `<button type="button" class="route-pick md-state-layer" data-route-pick="${id}" aria-pressed="${row.id === selectedId}">`
        + `${badge}<span class="route-main"><span class="route-name">${esc(row.name)}</span>`
        + `<span class="small">${esc([typeLabel, range(row)].filter(Boolean).join(' · '))}</span>${note}</span></button>`
        + `<button type="button" class="route-cal md-btn md-btn-outlined md-state-layer" data-route-entry="${id}" title="${esc(t('route_open'))}" aria-label="${esc(t('route_open'))}: ${esc(row.name)}">📆</button></div>`;
    }

    function skeleton(host) {
      host.innerHTML = `<div class="md-card route-card">
        <div class="small route-sub">${esc(t('route_sub'))}</div>
        <label class="small route-year">${esc(t('route_year'))} <select id="routeYearSelect"></select></label>
        <div class="small route-summary" id="routeSummary"></div>
        <div class="route-layout">
          <div class="route-list" id="routeList"></div>
          <div class="route-map-pane" id="routeMapPane"><div class="route-map" id="routeMap"></div>
            <div class="small route-map-note" id="routeMapNote" hidden></div></div>
        </div></div>`;
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
      const pts = rows.filter((r) => r.hasCoords);
      const sig = year + '|' + pts.map((r) => [r.id, r.n, r.lat, r.lng].join(',')).join(';') + '|' + selectedId;
      if (sig === drawnSig) return;
      drawnSig = sig;
      pinsLayer.clearLayers(); lineLayer.clearLayers();
      if (!pts.length) { setMapNote(t('map_no_coords')); return; }
      if (!tileError) setMapNote('');
      if (pts.length > 1) L.polyline(pts.map((r) => [r.lat, r.lng]), { color: '#3b6fd8', weight: 3, opacity: 0.85 }).addTo(lineLayer);
      pts.forEach((r) => {
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
      list.innerHTML = rows.length ? rows.map(rowHtml).join('') : `<div class="md-empty">${esc(t('route_none'))}</div>`;
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
      rows = collect(stats.visitEntries, (id) => App.data.getEventById(id));
      if (selectedId && !rows.some((r) => r.id === selectedId)) selectedId = null;
      const sum = summarize(rows);
      const path = pathLength(rows, App.utils.haversineKm);
      $('routeSummary').textContent = rows.length
        ? [t('route_summary', { count: sum.count, missing: sum.missing }), path.legs ? t('route_km_straight', { km: Math.round(path.km).toLocaleString(App.utils.lang()), legs: path.legs }) : ''].filter(Boolean).join(' · ')
        : '';
      renderList();
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
      host.addEventListener('click', (e) => {
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
