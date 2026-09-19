/**
 * Circuit Workspace — shared/sender.js
 * Единственное место, где живут данные отправителя: имя, код района, адрес,
 * телефоны и почта человека, от которого уходят все документы экосистемы.
 *
 * ЗАЧЕМ ОН ПОЯВИЛСЯ. До него одни и те же данные лежали в трёх местах:
 * в настройках писем Конгрессов, в настройках Клиндария (своя копия, без кода
 * района) и в Назначениях, которые читали чужой ключ Конгрессов напрямую.
 * Последнее особенно плохо: модуль лез во внутреннее хранилище соседа, то есть
 * зависел от его схемы данных и от того, открывали ли его вообще.
 *
 * ПРАВИЛО: ни один модуль не читает хранилище другого модуля. Общее живёт в
 * общем слое, своё — у себя.
 *
 * ИМЕНА ПОЛЕЙ намеренно нейтральные (name/code/address/phone1/phone2/email), а
 * не скопированные из какого-то одного модуля.
 *
 * ─── ФАЗА C2: КАНОН ПЕРЕЕХАЛ В ОБЩУЮ БАЗУ ──────────────────────────────────
 *
 * Прежний ключ `cw-sender` в localStorage писала любая вкладка независимо —
 * запись «побеждала» просто тем, что была последней, и без единого признака,
 * что где-то рядом та же запись правится параллельно. Разъезд отправителя
 * между двумя открытыми модулями был реальным, а не теоретическим случаем.
 *
 * Канон теперь — запись `shared:sender` в хранилище `state` общей базы
 * (`shared/state.js`, тот же механизм, что уже несёт данные Клиндария и
 * Конгрессов): ревизии, отказ соседней вкладке, ушедшей вперёд, зеркало на
 * закрытие вкладки, восстановление из копии. Двоеточие в идентификаторе не
 * пересекается с идентификаторами модулей (`circuit-planner`,
 * `congress-project` и т.д.) — они приходят из имён папок и двоеточия не
 * содержат, поэтому не пересекаются ни ключи записей, ни производные ключи
 * `cw-state-mirror:` / `cw-state-rev:`.
 *
 * ПРЕЖНИЙ КЛЮЧ НЕ УДАЛЯЕТСЯ И БОЛЬШЕ НЕ ПИШЕТСЯ. Он остаётся дореформенным
 * снимком — обратимость версии: откат приложения возвращает пользователя к
 * данным, которые были до переезда. Он используется РОВНО дважды: (1) как
 * вход одноразовой миграции при первом запуске после обновления, если канон
 * ещё пуст; (2) как то, что показывает шапку письма, пока канон недостижим
 * (деградация) — не как записываемый запасной путь, а только для того, чтобы
 * несломанный документ печатался прежним текстом, а не пустым.
 *
 * ─── СИНХРОННОЕ ЧТЕНИЕ, ОТЛОЖЕННАЯ ЗАПИСЬ ───────────────────────────────────
 *
 * `get()` после `ready()` синхронен: единственная синхронная поверхность
 * чтения — память. `set()` тоже синхронен — двигает память и возвращает новое
 * значение сразу, запись в канон уходит отложенно и коалесцированно. Ни одно
 * из полусотни мест, вызывающих `set()` на `oninput`, менять не пришлось.
 *
 * Свой минимальный планировщик, а не `shared/persist.js`: тот подключён не на
 * всех шести страницах (хаб, Назначения, Документы и Школа обходятся без
 * него), и втягивать его туда ради тридцати строк дебаунса означало бы тащить
 * в фазу C2 их прекэш и проверки. Один планировщик здесь на все шесть.
 *
 * ПОДТВЕРЖДЁННЫЙ РУБЕЖ (`baseline`) отделён от памяти намеренно. «Есть
 * незаписанные изменения» — вопрос о ДАННЫХ (память разошлась с тем, что
 * подтверждено каноном), а не о планировщике: таймер мог уже сработать, а
 * запись — провалиться. Рубеж двигает только подтверждённый `written`;
 * `refused` и `failed` не двигают его никогда, иначе экран показал бы
 * «сохранено» для записи, которой не было.
 *
 * ─── ДЕГРАДАЦИЯ ─────────────────────────────────────────────────────────────
 *
 * Канон недоступен — экземпляр ЛИПКО уходит в режим только для чтения: ни
 * записи в канон, ни отката в localStorage. Запасной путь в прежний ключ был
 * бы хуже отказа: две линии данных, расходящиеся молча. Память при этом
 * заполняется из прежнего ключа, если он есть, — чтобы шапка документа на
 * сломанном устройстве печаталась прежней, а не пустой.
 *
 * ─── СОСЕДНЯЯ ВКЛАДКА ────────────────────────────────────────────────────────
 *
 * Чистая память (нет своей неподтверждённой правки) — чужое состояние
 * принимается, рубеж и память двигаются на него. Есть своя неподтверждённая
 * правка — чужое ОТКЛОНЯЕТСЯ (`CWState.onForeign` получает `false`): канон на
 * диске остаётся чужим, наша правка остаётся в памяти, конфликт защёлкивается
 * до следующей успешной записи или перезагрузки. Тихого last-write-wins нет
 * ни в одну сторону.
 *
 * `self` вместо `window` — файл можно безопасно подключать и через
 * importScripts() в service worker'е, как shared/version.js.
 */
(function (global) {
  'use strict';

  /* Прежний ключ. ТОЛЬКО ЧТЕНИЕ — ни одной записи после фазы C2. */
  var LEGACY_KEY = 'cw-sender';

  /* Идентификатор канонической записи в общем хранилище `state`. */
  var STATE_ID = 'shared:sender';

  /* Порядок = порядок строк в шапке документа. */
  var FIELDS = ['name', 'code', 'address', 'phone1', 'phone2', 'email'];

  /* Окно ожидания и потолок отложенной записи — те же значения, что у
     `CWPersist` (см. комментарий выше про свой планировщик). */
  var DELAY_MS = 400;
  var MAX_DELAY_MS = 2000;

  var WRITTEN = 'written';
  var REFUSED = 'refused';
  var FAILED = 'failed';

  var listeners = [];
  var statusListeners = [];

  var cache = null;          // нормализованная запись в памяти
  var baseline = null;       // подтверждённый канон, либо null (канон не читан)
  var state = null;          // экземпляр CWState
  var readyPromise = null;
  var degradedLatch = false;
  var conflict = false;      // канон ушёл вперёд, наша правка не принята

  var timer = null;
  var deadline = null;
  var pendingWrite = false;

  /* --- служебное ------------------------------------------------------- */

  function blank() {
    var out = {};
    FIELDS.forEach(function (f) { out[f] = ''; });
    return out;
  }

  /* Приводим что угодно к полному набору строковых полей: подсунутый мусор
     не должен превращаться в undefined посреди готового документа. */
  function normalize(raw) {
    var out = blank();
    if (!raw || typeof raw !== 'object') return out;
    FIELDS.forEach(function (f) {
      if (typeof raw[f] === 'string') out[f] = raw[f];
    });
    return out;
  }

  function isEmptyRecord(record) {
    if (!record) return true;
    return FIELDS.every(function (f) { return !String(record[f] || '').trim(); });
  }

  /* Сериализация с ФИКСИРОВАННЫМ порядком полей. Не украшение: сравнение
     «память == подтверждённый рубеж» и запись «уже содержит это» внутри
     CWState идут по строке, и порядок ключей, зависящий от истории объекта,
     делал бы одинаковые записи разными. */
  function encode(record) {
    var out = {};
    FIELDS.forEach(function (f) { out[f] = record[f]; });
    return JSON.stringify(out);
  }

  function decode(payload) {
    if (typeof payload !== 'string' || !payload) return null;
    try {
      var parsed = JSON.parse(payload);
      if (!parsed || typeof parsed !== 'object') return null;
      return normalize(parsed);
    } catch (e) { return null; }
  }

  /** Прежний ключ — ТОЛЬКО чтение. Записи в него в этом файле нет вовсе. */
  function readLegacy() {
    var raw;
    try { raw = global.localStorage.getItem(LEGACY_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return normalize(parsed);
    } catch (e) { return null; }
  }

  function latch(reason) {
    if (degradedLatch) return;
    degradedLatch = true;
    console.warn('CWSender: канон недоступен, запись остановлена (' + reason + ')');
  }

  function isDegraded() {
    return degradedLatch || !!(state && state.degraded());
  }

  /** Есть ли в памяти правка, ещё не подтверждённая каноном. */
  function isDirty() {
    var base = baseline || blank();
    return encode(cache || blank()) !== encode(base);
  }

  function status() {
    if (isDegraded()) return 'degraded';
    if (conflict) return 'conflict';
    return 'writable';
  }

  function notify() {
    var value = CWSender.get();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](value); } catch (e) { console.warn('CWSender listener failed', e); }
    }
  }

  function notifyStatus() {
    var st = status();
    for (var i = 0; i < statusListeners.length; i++) {
      try { statusListeners[i](st); } catch (e) { console.warn('CWSender status listener failed', e); }
    }
  }

  /* --- отложенная запись ------------------------------------------------ */

  function clearTimer() {
    if (timer !== null) { global.clearTimeout(timer); timer = null; }
  }

  function schedule() {
    pendingWrite = true;
    var now = Date.now();
    if (deadline === null) deadline = now + MAX_DELAY_MS;
    clearTimer();
    timer = global.setTimeout(onTimer, Math.min(DELAY_MS, Math.max(0, deadline - now)));
  }

  function onTimer() {
    timer = null;
    if (!pendingWrite) { deadline = null; return; }
    flush('debounce');
  }

  /**
   * Итог записи. ЕДИНСТВЕННОЕ место, где двигается подтверждённый рубеж.
   * @param {string} outcome — 'written' | 'refused' | 'failed'
   * @param {Object} record  — нагрузка, к которой относится итог
   */
  function applyOutcome(outcome, record) {
    if (outcome === WRITTEN) {
      /* Рубеж двигается на ЗАПИСАННУЮ нагрузку, а не на текущую память:
         пользователь мог продолжить печатать, пока запись шла, и его новые
         буквы подтверждёнными не стали. */
      baseline = record;
      conflict = false;
    } else if (outcome === REFUSED) {
      /* Канон ушёл вперёд в соседней вкладке. Ничего не записано, рубеж на
         месте, правка в памяти цела — конфликт защёлкнут до перезаписи. */
      conflict = true;
    } else {
      latch('failed');
    }
  }

  function flush(reason) {
    clearTimer();
    deadline = null;
    pendingWrite = false;
    if (!state || isDegraded()) return;
    var record = cache || blank();
    var payload = encode(record);
    if (reason === 'unload') {
      /* Путь закрытия вкладки синхронен, промис ждать не умеет. CWState
         кладёт синхронное зеркало в localStorage и заводит запись следом —
         не успеет, так подхватится при следующей загрузке. */
      applyOutcome(state.writeSyncOutcome(payload), record);
      notifyStatus();
      return;
    }
    state.writeOutcome(payload).then(function (outcome) {
      applyOutcome(outcome, record);
      notifyStatus();
    });
  }

  if (global.addEventListener) {
    var onHide = function () { if (pendingWrite) flush('unload'); };
    global.addEventListener('pagehide', onHide);
    global.addEventListener('beforeunload', onHide);
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'hidden') onHide();
      });
    }
  }

  /* --- соседняя вкладка -------------------------------------------------- */

  function bindForeign() {
    state.onForeign(function (payload) {
      if (isDegraded()) return;         // липкая деградация — не оживает
      var incoming = decode(payload);
      if (!incoming) return;            // чужой мусор не применяем и не ломаемся
      if (isDirty()) {
        /* У нас есть неподтверждённая правка. Возврат ровно `false` говорит
           CWState вернуть baseRev назад: канон на диске остаётся чужим, наша
           правка остаётся в памяти, а следующая запись честно получит отказ.
           Тихого last-write-wins здесь нет ни в одну сторону. */
        conflict = true;
        notifyStatus();
        return false;
      }
      cache = incoming;
      baseline = incoming;
      conflict = false;
      notify();
      notifyStatus();
    });
  }

  /* --- запуск ------------------------------------------------------------ */

  function start() {
    var legacy = readLegacy();

    if (!global.CWState || typeof global.CWState.create !== 'function') {
      /* Смешанное поколение кэша: новый sender.js рядом со старой оболочкой
         без общего состояния. Канона нет — значит только чтение. */
      cache = legacy || blank();
      baseline = null;
      latch('no-state');
      notify();
      notifyStatus();
      return Promise.resolve();
    }

    state = global.CWState.create(STATE_ID);
    bindForeign();

    return state.init().then(function (payload) {
      /* СЛУЧАЙ D: канон недоступен или его нельзя проверить. Прежний ключ
         годится только показать шапку — записываемым запасом он НЕ становится. */
      if (state.degraded()) {
        cache = legacy || blank();
        baseline = null;
        latch(state.degradedReason() || 'init');
        notify();
        notifyStatus();
        return;
      }

      var canonical = decode(payload);

      /* СЛУЧАЙ A: канон есть. Он и побеждает — прежний ключ при этом не
         читается в данные и не удаляется. */
      if (canonical) {
        cache = canonical;
        baseline = canonical;
        notify();
        notifyStatus();
        return;
      }

      /* СЛУЧАЙ B: канона нет, прежний ключ есть. Разовый перенос. Успешным
         он считается ТОЛЬКО после подтверждённой записи: до неё рубеж не
         двигается, и следующий запуск повторит перенос. */
      if (legacy && !isEmptyRecord(legacy)) {
        cache = legacy;
        notify();
        return state.writeOutcome(encode(legacy)).then(function (outcome) {
          applyOutcome(outcome, legacy);
          notifyStatus();
        });
      }

      /* СЛУЧАЙ C: нет ни канона, ни прежнего ключа. Пустое состояние и НИ
         ОДНОЙ записи: ревизия из ничего сделала бы первый запуск на новом
         устройстве неотличимым от переезда. */
      cache = blank();
      baseline = blank();
      notify();
      notifyStatus();
    });
  }

  function init() {
    if (!readyPromise) readyPromise = start();
    return readyPromise;
  }

  var CWSender = {
    FIELDS: FIELDS,

    /** Идентификатор канонической записи. Нужен проверкам и реестру копий. */
    STATE_ID: STATE_ID,

    /** Прежний ключ. Экспортирован как ВХОД миграции — писать в него нельзя. */
    LEGACY_KEY: LEGACY_KEY,

    /**
     * Готовность sender: канон прочитан, память заполнена, миграция (если
     * она была нужна) завершена. До разрешения этого промиса `get()` вернёт
     * пустую запись — вызывать его раньше не следует.
     * @returns {Promise<void>}
     */
    init: init,
    ready: init,

    /** @returns {Object} копия — вызывающий не может испортить кэш. */
    get: function () {
      var value = cache || blank();
      var copy = {};
      FIELDS.forEach(function (f) { copy[f] = value[f]; });
      return copy;
    },

    /**
     * Частичное обновление: передавать можно одно поле. Синхронно двигает
     * память и синхронно же возвращает новое значение — запись в канон уходит
     * отложенно. В режиме только для чтения память не двигается вовсе.
     */
    set: function (patch) {
      if (isDegraded()) return CWSender.get();
      var next = cache || blank();
      var changed = false;
      FIELDS.forEach(function (f) {
        if (patch && typeof patch[f] === 'string' && patch[f] !== next[f]) {
          next[f] = patch[f];
          changed = true;
        }
      });
      if (!changed) return CWSender.get();
      cache = next;
      notify();
      schedule();
      return CWSender.get();
    },

    isEmpty: function () { return isEmptyRecord(cache || blank()); },

    /** Есть ли в памяти правка, не подтверждённая каноном. */
    dirty: isDirty,

    /**
     * Одноразовый перенос данных модуля в общий слой — ТЕПЕРЬ АСИНХРОННЫЙ.
     *
     * Вызывается модулем при загрузке со своими прежними данными. Пишет их
     * ТОЛЬКО если общая запись ещё пуста (порядок открытия модулей не важен,
     * повторный вызов ничего не портит), и разрешается `true` ТОЛЬКО после
     * подтверждённой канонической записи — раньше этого момента вызывающий
     * не имеет права удалять свою копию: неподтверждённый перенос должен
     * повториться при следующем запуске, а не потерять данные молча.
     *
     * @returns {Promise<boolean>} true — канон принял данные, записал их и
     *   подтвердил; модулю можно удалять свою копию.
     */
    adopt: function (seed) {
      var incoming = normalize(seed);
      if (isEmptyRecord(incoming)) return Promise.resolve(false);
      return init().then(function () {
        if (isDegraded()) return false;               // СЛУЧАЙ D — фиксировать нечем
        if (!isEmptyRecord(cache || blank())) return false;  // канон уже занят
        if (!state) return false;
        cache = incoming;
        notify();
        return state.writeOutcome(encode(incoming)).then(function (outcome) {
          applyOutcome(outcome, incoming);
          notifyStatus();
          return outcome === WRITTEN;
        });
      });
    },

    /** @returns {Function} отписка */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    /** 'writable' | 'conflict' | 'degraded'. Для UI-поверхностей записи. */
    status: status,

    /** @returns {Function} отписка */
    onStatusChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      statusListeners.push(fn);
      return function () {
        var i = statusListeners.indexOf(fn);
        if (i >= 0) statusListeners.splice(i, 1);
      };
    },
  };

  global.CWSender = CWSender;
})(typeof self !== 'undefined' ? self : this);
