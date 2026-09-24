/**
 * Circuit Workspace — shared/todo.js
 * Общий To Do: публичная граница ТОЛЬКО ДЛЯ ЧТЕНИЯ над задачами модулей
 * (J9c, CWTodo).
 *
 * ─── ЗАЧЕМ ──────────────────────────────────────────────────────────────────
 *
 * Будущий общий экран задач (и любой модуль) видит задачи владельцев через
 * одну маленькую форму, не зная их внутренних моделей. Данные и правила
 * остаются у владельца: CWTodo ничего не хранит, не меняет и не умеет
 * расшифровывать. Сейчас единственный реальный поставщик — Журнал
 * (journal/js/todo-provider.js); выдуманных поставщиков нет.
 *
 * ─── КОНТРАКТ ЗАДАЧИ (CONTRACT = 1) ─────────────────────────────────────────
 *
 *   {
 *     key,        'module:id' — глобально уникален
 *     module,     владелец ('journal')
 *     id,         родной id у владельца
 *     ref,        канонический адрес у владельца (Журнал: journal:entry/<id>)
 *     status,     'open' | 'done'
 *     dueDate,    'YYYY-MM-DD' | null
 *     text,       открытый текст ИЛИ null — всегда null, если protected
 *     protected,  true — текст у владельца зашифрован; сюда он не попадает
 *     mutable,    можно ли сейчас менять у владельца (менять — только там)
 *     origin,     мелкие метаданные владельца: только строки/null/boolean
 *     url         ссылка на задачу в модуле-владельце
 *   }
 *
 * Объекты — замороженные копии; нормализация отбрасывает всё лишнее (в т.ч.
 * любые поля шифротекста), а для protected принудительно ставит text: null.
 *
 * ─── ПОСТАВЩИК ──────────────────────────────────────────────────────────────
 *
 *   CWTodo.register({
 *     module:    'имя-модуля',
 *     list:      () => Promise<Array<{ id, status, dueDate, text, protected,
 *                                      mutable, origin }>>,
 *     ref:       (id) => string,
 *     urlFor:    (id) => string,
 *     subscribe: (onChange) => unsubscribe      // необязательно
 *   })
 *
 * ─── СВЕЖЕСТЬ ───────────────────────────────────────────────────────────────
 *
 * Без опроса: подписка поставщика (в этой вкладке и соседних), возврат
 * страницы из bfcache (pageshow.persisted) и явный refresh(). Никаких копий
 * задач — ни в localStorage, ни в базе, ни в кэше SW.
 *
 * Жизненный цикл чтения: до первого init()/refresh() мост ленив — сигналы
 * поставщиков чтения не запускают. После старта ни один сигнал не теряется:
 * чтение идёт одним «насосом» — пришёл сигнал (или новый поставщик) во время
 * чтения, ставится флаг dirty, и по окончании текущего прохода делается ещё
 * один с актуальным набором поставщиков. Пачка сигналов за один проход
 * сливается в один повтор. Промис init()/refresh() разрешается, когда
 * состояние устоялось (dirty снят).
 */
(function (global) {
  'use strict';

  var CONTRACT = 1;
  var MODULE_RE = /^[a-z][a-z0-9-]{0,39}$/;
  var ID_RE = /^[A-Za-z0-9._~@+-]{1,200}$/;
  var ISO = /^\d{4}-\d{2}-\d{2}$/;

  var providers = [];
  var items = [];
  var byKey = Object.create(null);
  var state = 'idle';            // idle | ok | partial | empty
  var failed = [];
  var loading = null;
  var seq = 0;
  var started = false;           // init()/refresh() уже звали — сигналы не ленивы
  var dirty = false;             // нужен ещё проход чтения
  var pump = null;               // промис текущей серии проходов
  var listeners = [];
  var bound = false;
  var signature = '';

  function validIso(s) {
    if (typeof s !== 'string' || !ISO.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function plainOrigin(o) {
    var out = {};
    if (!o || typeof o !== 'object') return Object.freeze(out);
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v === null || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
    });
    return Object.freeze(out);
  }

  function normalize(p, raw) {
    try { return normalizeRow(p, raw); } catch (e) { return null; }
  }
  function normalizeRow(p, raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = raw.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) return null;
    var prot = raw.protected === true;
    return Object.freeze({
      key: p.module + ':' + id,
      module: p.module,
      id: id,
      ref: String(p.ref(id)),
      status: raw.status === 'done' ? 'done' : 'open',
      dueDate: validIso(raw.dueDate) ? raw.dueDate : null,
      text: prot ? null : (typeof raw.text === 'string' ? raw.text : ''),
      protected: prot,
      mutable: raw.mutable === true,
      origin: plainOrigin(raw.origin),
      url: String(p.urlFor(id)),
    });
  }

  function notify() {
    listeners.slice().forEach(function (fn) {
      try { fn({ status: state }); } catch (e) { console.error('CWTodo: подписчик упал', e); }
    });
  }

  function read() {
    var my = ++seq;
    return Promise.all(providers.map(function (p) {
      return Promise.resolve().then(function () { return p.list(); }).then(function (rows) {
        return { p: p, rows: Array.isArray(rows) ? rows : null };
      }, function (error) {
        console.error('CWTodo: поставщик ' + p.module + ' не ответил', error);
        return { p: p, rows: null };
      });
    })).then(function (results) {
      if (my !== seq) return false;
      var next = [];
      var map = Object.create(null);
      var bad = [];
      results.forEach(function (r) {
        if (!r.rows) { bad.push(r.p.module); return; }
        r.rows.forEach(function (raw) {
          var it = normalize(r.p, raw);
          if (it && !map[it.key]) { map[it.key] = it; next.push(it); }
        });
      });
      var nextState = bad.length ? 'partial' : (next.length ? 'ok' : 'empty');
      var sig = nextState + '|' + JSON.stringify(next);
      items = next;
      byKey = map;
      failed = bad;
      state = nextState;
      if (sig !== signature) { signature = sig; notify(); }
      return true;
    });
  }

  /* Запросить актуальное состояние. До старта — ничего (ленивость). Во
     время чтения — только флаг: насос сделает ещё один проход. */
  function request() {
    if (!started) return Promise.resolve(false);
    dirty = true;
    if (!pump) {
      var loop = function () {
        if (!dirty) { pump = null; return true; }
        dirty = false;
        return read().then(loop, function (e) {
          console.error('CWTodo: чтение не удалось', e);
          return loop();
        });
      };
      pump = Promise.resolve().then(loop);
    }
    return pump;
  }

  function bindPage() {
    if (bound || typeof global.addEventListener !== 'function') return;
    bound = true;
    global.addEventListener('pageshow', function (e) { if (e && e.persisted) CWTodo.refresh(); });
  }

  var CWTodo = {
    CONTRACT: CONTRACT,

    /** Подключить поставщика (один на модуль). */
    register: function (p) {
      if (!p || !MODULE_RE.test(p.module || '') || typeof p.list !== 'function'
        || typeof p.ref !== 'function' || typeof p.urlFor !== 'function') {
        throw new TypeError('CWTodo.register: нужен { module, list, ref, urlFor }');
      }
      if (providers.some(function (x) { return x.module === p.module; })) {
        throw new Error('CWTodo.register: поставщик ' + p.module + ' уже подключён');
      }
      var entry = { module: p.module, list: p.list, ref: p.ref, urlFor: p.urlFor };
      providers.push(entry);
      if (typeof p.subscribe === 'function') p.subscribe(request);
      /* Поставщик пришёл во время или после старта — войдёт в следующий
         проход (текущий мог захватить прежний список поставщиков). */
      request();
    },
    modules: function () { return providers.map(function (p) { return p.module; }); },

    /** Первое чтение (повторный вызов — тот же промис). */
    init: function () {
      bindPage();
      started = true;
      if (!loading) loading = request();
      return loading;
    },
    /** Перечитать всех поставщиков (во время чтения — ещё один проход). */
    refresh: function () { bindPage(); started = true; return request(); },
    /** 'idle' | 'ok' | 'empty' | 'partial' (какой-то поставщик не ответил). */
    status: function () { return state; },
    failed: function () { return failed.slice(); },

    list: function () { return items.slice(); },
    /** По ключу 'module:id' или null. */
    get: function (key) { return typeof key === 'string' && byKey[key] ? byKey[key] : null; },
    /** Ссылка на задачу у владельца по ключу (без обращения к данным). */
    urlFor: function (key) {
      var m = typeof key === 'string' ? /^([a-z][a-z0-9-]{0,39}):(.+)$/.exec(key) : null;
      if (!m || !ID_RE.test(m[2])) return null;
      var p = providers.filter(function (x) { return x.module === m[1]; })[0];
      return p ? String(p.urlFor(m[2])) : null;
    },

    /** Подписка на изменение списка; возвращает отписку. */
    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      bindPage();
      return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
    },
  };

  global.CWTodo = CWTodo;
})(typeof self !== 'undefined' ? self : this);
