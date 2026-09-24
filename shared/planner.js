/**
 * Circuit Workspace — shared/planner.js
 * Публичная граница Клиндария ТОЛЬКО ДЛЯ ЧТЕНИЯ (J9a, CWPlanner).
 *
 * ─── ЗАЧЕМ ──────────────────────────────────────────────────────────────────
 *
 * Канон Клиндария — один JSON-блоб в хранилище `state` общей базы (запись
 * `circuit-planner`, см. shared/state.js). Это ВНУТРЕННЯЯ модель модуля:
 * настройки, письма, формуляры, служебные годы. Другим модулям она не
 * контракт. Этот файл — единственное место вне Клиндария, которое знает, где
 * и в каком виде лежит блоб; наружу он отдаёт маленький нормализованный
 * список записей календаря:
 *
 *   { id, eventId, start, end, title, name, visitType, communityId }
 *
 *  - id        — `entries[].id` Клиндария (стабилен, в URN
 *                `cw:circuit-planner/entry/<id>`);
 *  - start/end — `YYYY-MM-DD`;
 *  - title     — текущий заголовок записи (иначе название события);
 *  - name      — название собрания: справочник (CWDirectory), иначе событие;
 *  - visitType — `congregation|group|pregroup` или '' (обычная запись);
 *  - communityId — id события, если это визит: для визитов id события
 *                Клиндария и id карточки CWDirectory совпадают
 *                (circuit-planner/app.js, `App.shared.directory.identity`).
 *
 * Ничего больше: ни настроек, ни текста писем, ни формуляра, ни заметок.
 *
 * O1 — полный список ОБЪЕКТОВ Клиндария (`listCommunities()`), отдельно от
 * записей календаря: источник — `events[]` того же блоба, а не `entries[]`.
 *
 *   { communityId, name, visitType }
 *
 *  - берутся только события с visitType `congregation|group|pregroup`;
 *    обычное событие (visitType '') и неизвестный тип — не объект;
 *  - объект есть в списке и без единого назначенного посещения;
 *  - уникальность — по id события (он же id карточки CWDirectory): у
 *    объекта с несколькими посещениями одна строка, дубликат id — первый;
 *  - name — справочник, иначе название события (как у записей);
 *  - порядок: name, затем communityId — детерминированно.
 * Пустой список значим только при status() 'ok' или 'empty' (канона нет —
 * Клиндарий ещё ничего не сохранял). 'idle' — ещё не прочитано, 'invalid' /
 * 'unavailable' — источник не прочитан: это НЕ «объектов ноль».
 *
 * ─── ГРАНИЦЫ ────────────────────────────────────────────────────────────────
 *
 *  - Только чтение. Файл НИЧЕГО не пишет: ни в базу, ни в localStorage, ни в
 *    кэш SW. Нормализованный список живёт в памяти вкладки и нигде не
 *    сохраняется.
 *  - Только канон: запись `state/circuit-planner`. Прежний ключ
 *    `service-year-planner-v9-4-2` и зеркало закрытия вкладки не читаются —
 *    их разбирает сам Клиндарий при своём запуске (shared/state.js).
 *  - Возвращаются замороженные КОПИИ: правка результата не меняет ни кэш
 *    здесь, ни данные Клиндария.
 *  - Живые изменения — по маячку `cw-state-rev:circuit-planner`, который
 *    CWState ставит после каждой записи канона (событие `storage` соседней
 *    вкладки), при возврате страницы из bfcache и по `CWDirectory.onChange()`
 *    (название собрания берётся из справочника — его правка в этой же
 *    вкладке тоже должна дойти). Опроса нет.
 *
 * `self` вместо `window` — файл единообразен с остальным общим слоем.
 */
(function (global) {
  'use strict';

  var MODULE = 'circuit-planner';
  var REV_KEY = 'cw-state-rev:' + MODULE;
  var ENTRY_ID = /^[A-Za-z0-9._~@+-]{1,200}$/;
  var ISO = /^\d{4}-\d{2}-\d{2}$/;
  var VISIT_TYPES = ['congregation', 'group', 'pregroup'];
  var PAGE = '../circuit-planner/index.html';
  var NEAR_DAYS = 14;

  var entries = [];          // нормализованные, замороженные
  var communities = [];      // объекты Клиндария (O1), нормализованные, замороженные
  var byId = Object.create(null);
  var state = 'idle';        // idle | ok | empty | invalid | unavailable
  var signature = '';
  var loading = null;
  var seq = 0;
  var listeners = [];
  var bound = false;

  function validIso(s) {
    if (typeof s !== 'string' || !ISO.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function dayNum(s) { return Math.round(Date.parse(s + 'T00:00:00Z') / 86400000); }
  function str(v) { return typeof v === 'string' ? v : ''; }

  function directoryName(id) {
    try {
      var D = global.CWDirectory;
      if (!D || !D.ready || typeof D.get !== 'function') return '';
      var r = D.get(id);
      return r && String(r.name || '').trim() ? String(r.name) : '';
    } catch (e) { return ''; }
  }

  /** Блоб → объекты Клиндария (события-визиты), по одному на id события. */
  function normalizeCommunities(app) {
    var seen = Object.create(null);
    var out = [];
    app.events.forEach(function (ev) {
      if (!ev || typeof ev !== 'object') return;
      var id = str(ev.id);
      if (!ENTRY_ID.test(id) || seen[id]) return;
      if (VISIT_TYPES.indexOf(ev.visitType) < 0) return;
      seen[id] = true;
      out.push(Object.freeze({
        communityId: id,
        name: directoryName(id) || str(ev.name),
        visitType: ev.visitType,
      }));
    });
    out.sort(function (a, b) {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return a.communityId < b.communityId ? -1 : a.communityId > b.communityId ? 1 : 0;
    });
    return out;
  }

  /** Блоб → нормализованный список; не тот блоб → null. */
  function normalize(app) {
    if (!app || typeof app !== 'object' || Array.isArray(app)) return null;
    if (!Array.isArray(app.entries) || !Array.isArray(app.events)) return null;
    var events = Object.create(null);
    app.events.forEach(function (ev) {
      if (ev && typeof ev === 'object' && str(ev.id)) events[ev.id] = ev;
    });
    var seen = Object.create(null);
    var out = [];
    app.entries.forEach(function (en) {
      if (!en || typeof en !== 'object') return;
      var id = str(en.id);
      if (!ENTRY_ID.test(id) || seen[id]) return;
      if (!validIso(en.start) || !validIso(en.end)) return;
      seen[id] = true;
      var eventId = str(en.eventId);
      var ev = eventId ? events[eventId] : null;
      var visitType = ev && VISIT_TYPES.indexOf(ev.visitType) >= 0 ? ev.visitType : '';
      var name = (visitType && directoryName(eventId)) || (ev ? str(ev.name) : '');
      var title = str(en.title).trim() ? str(en.title) : name;
      out.push(Object.freeze({
        id: id,
        eventId: eventId,
        start: en.start,
        end: en.end < en.start ? en.start : en.end,
        title: title,
        name: name,
        visitType: visitType,
        communityId: visitType ? eventId : '',
      }));
    });
    out.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    return out;
  }

  function notify() {
    listeners.slice().forEach(function (fn) {
      try { fn({ status: state }); } catch (e) { console.error('CWPlanner: подписчик упал', e); }
    });
  }

  function apply(my, nextState, list, comms) {
    if (my !== seq) return false;              // ответ устаревшего чтения
    comms = comms || [];
    var map = Object.create(null);
    list.forEach(function (e) { map[e.id] = e; });
    // Подпись включает объекты: их смена без смены записей тоже уведомляет.
    var sig = nextState + '|' + JSON.stringify(list) + '|' + JSON.stringify(comms);
    var changed = sig !== signature;
    entries = list;
    communities = comms;
    byId = map;
    state = nextState;
    signature = sig;
    if (changed) notify();
    return true;
  }

  /** Прочитать канон заново. Никогда не отклоняется. */
  function read() {
    var my = ++seq;
    var store = global.CWDB && global.CWDB.state;
    if (!store || typeof store.get !== 'function') return Promise.resolve(apply(my, 'unavailable', []));
    return Promise.resolve().then(function () { return store.get(MODULE); }).then(function (record) {
      if (!record || typeof record.payload !== 'string') return apply(my, 'empty', []);
      var parsed;
      try { parsed = JSON.parse(record.payload); } catch (e) { return apply(my, 'invalid', []); }
      var list = normalize(parsed);
      return list ? apply(my, 'ok', list, normalizeCommunities(parsed)) : apply(my, 'invalid', []);
    }, function (error) {
      console.error('CWPlanner: канон Клиндария не прочитан', error);
      return apply(my, 'unavailable', []);
    });
  }

  function copy(e) { return e ? Object.freeze(Object.assign({}, e)) : null; }

  function bind() {
    if (bound || typeof global.addEventListener !== 'function') return;
    bound = true;
    global.addEventListener('storage', function (event) {
      if (event && event.key === REV_KEY) read();
    });
    global.addEventListener('pageshow', function (event) {
      if (event && event.persisted) read();
    });
    var D = global.CWDirectory;
    if (D && typeof D.onChange === 'function') D.onChange(function () { read(); });
  }

  var CWPlanner = {
    MODULE: MODULE,
    REV_KEY: REV_KEY,
    VISIT_TYPES: VISIT_TYPES.slice(),

    /** Первое чтение канона (повторный вызов — тот же промис). */
    init: function () {
      if (!loading) loading = read();
      return loading;
    },
    /** Перечитать канон (без опроса — по явной просьбе вызывающего). */
    refresh: function () { loading = read(); return loading; },
    ready: function () { return state !== 'idle'; },
    /** 'ok' | 'empty' (записи нет) | 'invalid' | 'unavailable' | 'idle'. */
    status: function () { return state; },

    isEntryId: function (id) { return typeof id === 'string' && ENTRY_ID.test(id); },
    listEntries: function () { return entries.map(copy); },
    getEntry: function (id) { return typeof id === 'string' && byId[id] ? copy(byId[id]) : null; },
    /**
     * O1: полный уникальный список объектов Клиндария (собрание/группа/
     * предгруппа) — замороженные копии { communityId, name, visitType }.
     * Не зависит от назначенных посещений. Пустой список — «объектов нет»
     * ТОЛЬКО при status() 'ok'/'empty'; при 'idle'/'invalid'/'unavailable'
     * — неизвестно (см. заголовок файла).
     */
    listCommunities: function () { return communities.map(copy); },

    /**
     * Кандидаты для посещения: { communityId, dateFrom, dateTo, visitType, all }.
     * Без `all` — только визиты Клиндария, совпавшие по собранию, по датам
     * или близкие по датам (±14 дней). Ранг — собрание, затем даты, затем тип.
     * Ни один кандидат не выбирается автоматически: выбор — за человеком.
     */
    candidates: function (criteria) {
      var c = criteria || {};
      var hasRange = validIso(c.dateFrom) && validIso(c.dateTo);
      var from = hasRange ? dayNum(c.dateFrom) : 0;
      var to = hasRange ? dayNum(c.dateTo) : 0;
      var out = [];
      entries.forEach(function (e) {
        if (!c.all && !e.visitType) return;
        var identity = !!(c.communityId && e.communityId && e.communityId === c.communityId);
        var gap = null, overlap = false, near = false;
        if (hasRange) {
          var s = dayNum(e.start), en = dayNum(e.end);
          overlap = s <= to && en >= from;
          gap = overlap ? 0 : (s > to ? s - to : from - en);
          near = !overlap && gap <= NEAR_DAYS;
        }
        var typeMatch = !!(c.visitType && e.visitType === c.visitType);
        if (!c.all && !identity && !overlap && !near) return;
        out.push({
          entry: e,
          identity: identity, overlap: overlap, near: near, typeMatch: typeMatch,
          gapDays: gap,
          score: (identity ? 8 : 0) + (overlap ? 4 : near ? 2 : 0) + (typeMatch ? 1 : 0),
        });
      });
      out.sort(function (a, b) {
        if (a.score !== b.score) return b.score - a.score;
        var ga = a.gapDays === null ? Infinity : a.gapDays, gb = b.gapDays === null ? Infinity : b.gapDays;
        if (ga !== gb) return ga - gb;
        return a.entry.start < b.entry.start ? -1 : a.entry.start > b.entry.start ? 1 : 0;
      });
      return out.map(function (x) {
        return Object.freeze({ entry: copy(x.entry), identity: x.identity, overlap: x.overlap, near: x.near,
          typeMatch: x.typeMatch, gapDays: x.gapDays, score: x.score });
      });
    },

    /** Глубокая ссылка на запись (контракт Клиндария `#calendar?entry=<id>`). */
    urlForEntry: function (id) {
      return PAGE + '#calendar' + (typeof id === 'string' && ENTRY_ID.test(id) ? '?entry=' + encodeURIComponent(id) : '');
    },

    /** Подписка на смену канона; возвращает отписку. */
    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      bind();
      return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
    },
  };

  global.CWPlanner = CWPlanner;
})(typeof self !== 'undefined' ? self : this);
