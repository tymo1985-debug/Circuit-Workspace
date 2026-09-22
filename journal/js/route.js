/**
 * Журнал — разбор хэш-маршрута (J4a).
 *
 * Чистая функция без DOM: вынесена из app.js, чтобы маршрут проверялся
 * тестом (scripts/check-journal-visits.mjs) — роутер по-прежнему один,
 * app.js только вызывает CWJournalRoute.parse().
 *
 *   #districts                                              → список районов
 *   #districts/<c>                                          → район
 *   #districts/<c>/congregation/<n>                         → собрание, «Обзор»
 *   #districts/<c>/congregation/<n>/visits                  → собрание, «Посещения»
 *   #districts/<c>/congregation/<n>/visit/<v>               → посещение
 *
 * Неполный хвост (`…/visit` без id, неизвестный сегмент) сводится к
 * ближайшему валидному контексту — собранию на вкладке «Посещения» — а не
 * к пустому экрану. Существование самих id проверяет app.js по данным.
 */
(function (global) {
  'use strict';

  var ROUTES = ['overview', 'districts', 'tasks', 'search', 'archive'];
  var DEFAULT_ROUTE = 'overview';

  function dec(s) {
    try { return decodeURIComponent(s); } catch (_) { return null; }
  }

  function parse(hash) {
    var raw = String(hash || '').replace(/^#/, '');
    var parts = raw.split('/');
    var route = ROUTES.indexOf(parts[0]) >= 0 ? parts[0] : DEFAULT_ROUTE;
    var state = { route: route, circuitId: null, congregationId: null, congTab: 'overview', visitId: null, normalized: false };
    if (route !== 'districts') return state;

    state.circuitId = parts[1] ? dec(parts[1]) : null;
    if (!state.circuitId) return state;
    if (parts[2] !== 'congregation' || !parts[3]) return state;
    state.congregationId = dec(parts[3]);
    if (!state.congregationId) return state;

    if (parts[4] === 'visits' && parts.length === 5) {
      state.congTab = 'visits';
    } else if (parts[4] === 'visit') {
      var v = parts[5] ? dec(parts[5]) : null;
      if (v && parts.length === 6) state.visitId = v;
      else { state.congTab = 'visits'; state.normalized = true; }
    } else if (parts.length > 4) {
      state.congTab = 'visits';
      state.normalized = true;
    }
    return state;
  }

  function enc(s) { return encodeURIComponent(s); }
  var build = {
    circuit: function (c) { return '#districts/' + enc(c); },
    congregation: function (c, n) { return '#districts/' + enc(c) + '/congregation/' + enc(n); },
    visits: function (c, n) { return '#districts/' + enc(c) + '/congregation/' + enc(n) + '/visits'; },
    visit: function (c, n, v) { return '#districts/' + enc(c) + '/congregation/' + enc(n) + '/visit/' + enc(v); },
  };

  global.CWJournalRoute = { parse: parse, build: build, ROUTES: ROUTES };
})(typeof self !== 'undefined' ? self : globalThis);
