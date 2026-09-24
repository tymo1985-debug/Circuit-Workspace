/**
 * Журнал — разбор хэш-маршрута (J4a; проект — J7).
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
 *   #districts/<c>/project/<p>                              → проект района (J7)
 *
 * Неполный хвост (`…/visit` без id, неизвестный сегмент) сводится к
 * ближайшему валидному контексту — собранию на вкладке «Посещения» — а не
 * к пустому экрану. Существование самих id проверяет app.js по данным.
 * Проект: `…/project` без id или с лишним хвостом → район (normalized).
 * В хэше только id — ни названия, ни текста проекта.
 */
(function (global) {
  'use strict';

  var ROUTES = ['overview', 'districts', 'tasks', 'search', 'archive'];
  var DEFAULT_ROUTE = 'overview';
  var TASK_ID = /^[A-Za-z0-9._~@+-]{1,200}$/;

  function dec(s) {
    try { return decodeURIComponent(s); } catch (_) { return null; }
  }

  function parse(hash) {
    var raw = String(hash || '').replace(/^#/, '');
    var parts = raw.split('/');
    var route = ROUTES.indexOf(parts[0]) >= 0 ? parts[0] : DEFAULT_ROUTE;
    var state = { route: route, circuitId: null, congregationId: null, congTab: 'overview', visitId: null, projectId: null, taskId: null, normalized: false };
    if (route === 'tasks') {
      /* J9c: #tasks/<taskId> — ссылка на конкретную задачу (общий To Do).
         В адресе только id; кривой id или лишний хвост — нормализация к
         #tasks, без ошибки. */
      if (parts.length === 1) return state;
      var tid = parts[1] ? dec(parts[1]) : null;
      if (tid && TASK_ID.test(tid) && parts.length === 2) state.taskId = tid;
      else state.normalized = true;
      return state;
    }
    if (route !== 'districts') return state;

    state.circuitId = parts[1] ? dec(parts[1]) : null;
    if (!state.circuitId) return state;
    if (parts[2] === 'project') {
      var p = parts[3] ? dec(parts[3]) : null;
      if (p && parts.length === 4) state.projectId = p;
      else state.normalized = true;
      return state;
    }
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
    project: function (c, p) { return '#districts/' + enc(c) + '/project/' + enc(p); },
    task: function (id) { return typeof id === 'string' && TASK_ID.test(id) ? '#tasks/' + enc(id) : '#tasks'; },
  };

  global.CWJournalRoute = { parse: parse, build: build, ROUTES: ROUTES };
})(typeof self !== 'undefined' ? self : globalThis);
