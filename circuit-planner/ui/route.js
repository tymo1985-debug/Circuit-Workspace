// circuit-planner/ui/route.js
//
// «Маршрут посещений» — этап R1 (06.10.2026): ТОЛЬКО ПРОСМОТР. Идея и фазы
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
//  • Новых зависимостей нет, сеть не нужна — экран работает офлайн.
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

  root.CPRoute = { collect, summarize };

  /* ═══════════════════════ Интерфейс ═══════════════════════ */

  (root.CPParts = root.CPParts || []).push(function (App) {
    const t = (k, v) => App.utils.t(k, v || {});
    const esc = (s) => App.utils.escapeHtml(s);
    let bound = false;
    let year = null;           // выбранный служебный год; только в памяти вкладки

    const currentYear = () => App.utils.getServiceYearForDate(new Date());
    const yearsList = () => {
      const set = new Set(Object.keys(App.state.app.serviceYears || {}).map(Number).filter(Number.isInteger));
      set.add(currentYear());
      return Array.from(set).sort((a, b) => b - a);
    };

    function range(row) {
      const d = (iso) => App.utils.prettyDate(App.utils.parseLocalDate(iso));
      return row.end && row.end !== row.start ? `${d(row.start)} – ${d(row.end)}` : d(row.start);
    }

    function rowHtml(row) {
      const badge = row.hasCoords
        ? `<span class="route-n">${row.n}</span>`
        : `<span class="route-n route-n-off" aria-hidden="true">–</span>`;
      const typeLabel = row.visitType ? App.utils.visitTypeLabel(row.visitType) : '';
      const note = row.hasCoords ? '' : `<div class="small route-warn">${esc(t('route_no_coords'))}</div>`;
      return `<button type="button" class="route-row md-state-layer" data-route-entry="${App.utils.escapeAttr(row.id)}" aria-label="${esc(t('route_open'))}: ${esc(row.name)}">`
        + `${badge}<span class="route-main"><span class="route-name">${esc(row.name)}</span>`
        + `<span class="small">${esc([typeLabel, range(row)].filter(Boolean).join(' · '))}</span>${note}</span></button>`;
    }

    function render() {
      const host = document.getElementById('routeRoot');
      if (!host) return;
      if (App.state.selectedScreen !== 'route') return;
      const years = yearsList();
      if (!years.includes(year)) year = years.includes(App.state.selectedYear) ? App.state.selectedYear : currentYear();
      const stats = App.data.getServiceYearStats(year);
      const rows = collect(stats.visitEntries, (id) => App.data.getEventById(id));
      const sum = summarize(rows);
      const options = years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${esc(App.utils.serviceYearLabel(y))}</option>`).join('');
      host.innerHTML = `<style>
        .route-row{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--md-outline-variant);padding:10px 4px;cursor:pointer;color:inherit;font:inherit}
        .route-n{flex:0 0 28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;background:var(--md-primary-container,#e8def8)}
        .route-n-off{background:none;border:1px dashed var(--md-outline-variant)}
        .route-main{display:flex;flex-direction:column;gap:2px;min-width:0}
        .route-name{font-weight:600}
        .route-warn{color:var(--md-error,#b3261e)}
      </style>
      <div class="md-card">
        <div class="small" style="margin-bottom:10px">${esc(t('route_sub'))}</div>
        <label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:10px">${esc(t('route_year'))}
          <select id="routeYearSelect">${options}</select></label>
        ${rows.length
          ? `<div class="small" style="margin-bottom:6px">${esc(t('route_summary', { count: sum.count, missing: sum.missing }))}</div><div id="routeList">${rows.map(rowHtml).join('')}</div>`
          : `<div class="md-empty">${esc(t('route_none'))}</div>`}
      </div>`;
    }

    function bind() {
      if (bound) return;
      const host = document.getElementById('routeRoot');
      if (!host) return;
      bound = true;
      host.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'routeYearSelect') { year = Number(e.target.value); render(); }
      });
      host.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-route-entry]') : null;
        if (!btn) return;
        if (App.actions.focusEntryFromHash('#calendar?entry=' + encodeURIComponent(btn.dataset.routeEntry))) App.ui.renderAll();
      });
    }

    App.ui.routeRender = function () { bind(); render(); };
  });
})(window);
