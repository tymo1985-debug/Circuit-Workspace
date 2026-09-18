/**
 * Circuit Workspace — shared/state.js
 * Состояние модуля в общей базе. Фаза 2 трека «миграция на shared/db.js».
 *
 * ─── ЧТО ЭТО ────────────────────────────────────────────────────────────────
 *
 * Один модуль — одна запись в хранилище `state` общей базы: тот же JSON-блоб,
 * что раньше лежал в localStorage под ключом модуля. Схема данных при этом НЕ
 * меняется: разбор блоба на записи (`events[]` → `communities`) — фаза 5, и
 * смешивать её с переездом нельзя. Здесь меняется только место хранения:
 * снимается лимит в 5 МБ, из-за которого модуль однажды упирался в квоту
 * посреди работы.
 *
 * Пара к `shared/persist.js`: тот решает КОГДА писать, этот — КУДА.
 *
 * ─── ГЛАВНАЯ ТРУДНОСТЬ: ЗАПИСЬ ПРИ ЗАКРЫТИИ ВКЛАДКИ ─────────────────────────
 *
 * `pagehide` синхронен и промис ждать не умеет — а запись в IndexedDB
 * асинхронна. Значит последняя правка перед закрытием уедет в никуда, причём
 * бесшумно: пользователь видел её на экране, а после перезапуска её нет. Это
 * было названо обязательным условием фазы 2 ещё в аудите.
 *
 * РЕШЕНИЕ — СИНХРОННОЕ ЗЕРКАЛО. На закрытии блоб пишется в localStorage под
 * `cw-state-mirror:<module>` вместе с отметкой времени. При следующей загрузке
 * зеркало сверяется с записью в базе, и если оно новее — оно и есть истина:
 * содержимое уезжает в базу, зеркало стирается. То есть localStorage остаётся
 * в схеме, но не как хранилище, а как записка «вот это не успело доехать».
 *
 * ПОЧЕМУ НЕ ПИСАТЬ ЗЕРКАЛО ВСЕГДА. Тогда переезд не дал бы ничего: квота
 * упиралась бы в те же 5 МБ. Зеркало живёт от закрытия вкладки до следующей
 * загрузки и стирается сразу после сверки.
 *
 * ─── ВТОРАЯ ТРУДНОСТЬ: СОСЕДНЯЯ ВКЛАДКА ─────────────────────────────────────
 *
 * Запись в IndexedDB НЕ порождает событие `storage`, а синхронизация между
 * вкладками в Клиндарии построена именно на нём. Молча потерять её при
 * переезде было бы легко: в одной вкладке работает, в двух — расходятся, и
 * никакой ошибки. Поэтому после каждой успешной записи в базу обновляется
 * маячок `cw-state-rev:<module>` — крошечное значение в localStorage,
 * единственная задача которого разбудить соседнюю вкладку. Соседка по
 * событию перечитывает базу.
 *
 * ─── ЧТО ОСТАЁТСЯ В СТАРОМ КЛЮЧЕ ────────────────────────────────────────────
 *
 * Прежний ключ модуля (`service-year-planner-v9-4-2` и т.п.) в фазе 2 НЕ
 * удаляется и не переписывается. Он остаётся снимком «как было до переезда» —
 * это и есть обратимость фазы: откат версии возвращает пользователя к своим
 * данным. Удаление — отдельное решение, после того как переезд отработает у
 * живого пользователя. Ключ Клиндария нельзя менять категорически.
 *
 * `self` вместо `window` — файл единообразен с остальным общим слоем.
 */
(function (global) {
  'use strict';

  var STORE = 'state';
  var MIRROR_PREFIX = 'cw-state-mirror:';
  var REV_PREFIX = 'cw-state-rev:';

  /* Сколько ждём базу при запуске. Модуль не может начать отрисовку, пока не
     знает своих данных, поэтому ожидание здесь блокирует старт — и именно
     поэтому у него обязан быть предел. Заблокированное обновление схемы
     (открыта вкладка со старой версией) иначе означало бы не «медленно», а
     «приложение не открылось вообще». По истечении срока работаем на прежнем
     ключе: данные пользователя на месте, переезд повторится в следующий раз. */
  var OPEN_TIMEOUT_MS = 4000;

  function lsGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { global.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function lsDel(key) {
    try { global.localStorage.removeItem(key); } catch (e) { /* приватный режим */ }
  }

  function create(moduleId) {
    var mirrorKey = MIRROR_PREFIX + moduleId;
    var revKey = REV_PREFIX + moduleId;

    var cache = null;        // последний известный блоб (строка) или null
    var ready = false;       // init() отработал
    var usable = false;      // база доступна и ей можно пользоваться
    var hadRecord = false;   // в базе уже была запись — значит переезд состоялся раньше
    var ownRev = null;       // маячок, который поставили мы сами
    var inFlight = null;     // текущая запись
    var queued = null;       // последняя нагрузка, ждущая своей очереди (last-wins)
    /* Подписка на `storage` ставится РОВНО ОДИН РАЗ (29.08.2026, находка N-6).
       Второй вызов onForeign() прежде вешал второй слушатель, и каждая чужая
       запись читалась из базы дважды, а обработчик модуля вызывался дважды —
       для перерисовки списка это двойная работа, для обработчика с побочным
       действием могло быть и хуже. Такой же флаг уже стоит в shared/i18n.js. */
    var foreignBound = false;
    var foreignCallbacks = [];

    function db() {
      return global.CWDB && global.CWDB[STORE] ? global.CWDB[STORE] : null;
    }

    function readMirror() {
      var raw = lsGet(mirrorKey);
      if (!raw) return null;
      try {
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.payload !== 'string') return null;
        return { at: Number(parsed.at) || 0, payload: parsed.payload };
      } catch (e) {
        /* Битое зеркало — не повод падать: в базе лежит предыдущее состояние,
           и оно заведомо целое. */
        console.error('CWState: зеркало не разобрано, игнорируем', e);
        return null;
      }
    }

    function bumpRev() {
      ownRev = String(Date.now()) + '.' + Math.random().toString(36).slice(2, 8);
      lsSet(revKey, ownRev);
    }

    /* Запись в базу с очередью. Без очереди две быстрые записи ушли бы в базу
       параллельно, и порядок их завершения не гарантирован — на диске могла
       бы остаться более старая. Здесь одновременно идёт максимум одна, а
       ждущая всегда одна и та же: самая свежая. */
    function put(payload) {
      if (inFlight) { queued = payload; return inFlight; }
      var store = db();
      if (!store) return Promise.resolve(false);
      inFlight = store.put({ id: moduleId, payload: payload, savedAt: Date.now() })
        .then(function () {
          hadRecord = true;
          bumpRev();
          /* Зеркало сыграло свою роль: то, что оно везло, теперь в базе. */
          lsDel(mirrorKey);
          return true;
        })
        .catch(function (error) {
          /* Не смогли записать в базу — кладём в зеркало, чтобы правка не
             пропала. Зеркало прочитается при следующей загрузке. */
          console.error('CWState: запись в базу не удалась, состояние ушло в зеркало', error);
          writeMirror(payload);
          return false;
        })
        .then(function (ok) {
          inFlight = null;
          if (queued !== null) { var next = queued; queued = null; put(next); }
          return ok;
        });
      return inFlight;
    }

    function writeMirror(payload) {
      cache = payload;
      return lsSet(mirrorKey, JSON.stringify({ at: Date.now(), payload: payload }));
    }

    return {
      /**
       * Прочитать состояние до старта модуля. Возвращает промис, который
       * НИКОГДА не отклоняется: отказ базы — это не ошибка приложения, а
       * причина остаться на прежнем ключе.
       */
      init: function () {
        if (ready) return Promise.resolve(cache);
        var store = db();
        if (!store) { ready = true; return Promise.resolve(null); }

        var mirror = readMirror();
        var timeout = new Promise(function (resolve) {
          global.setTimeout(function () { resolve('timeout'); }, OPEN_TIMEOUT_MS);
        });

        return Promise.race([store.get(moduleId).catch(function (e) { return e; }), timeout])
          .then(function (record) {
            if (record === 'timeout' || record instanceof Error) {
              console.error('CWState: база недоступна, модуль работает на прежнем ключе', record);
              ready = true;
              return null;
            }
            usable = true;
            ownRev = lsGet(revKey);
            hadRecord = !!(record && typeof record.payload === 'string');

            var fromDb = hadRecord ? record.payload : null;
            var savedAt = hadRecord ? Number(record.savedAt) || 0 : 0;

            /* Зеркало новее записи — значит вкладку закрыли раньше, чем запись
               дошла до базы. Истина в зеркале. */
            if (mirror && mirror.at > savedAt) {
              cache = mirror.payload;
              ready = true;
              put(cache);            // догоняем базу и стираем зеркало
              return cache;
            }
            if (mirror) lsDel(mirrorKey);   // зеркало устарело, база свежее
            cache = fromDb;
            ready = true;
            return cache;
          });
      },

      /** Состояние из базы, синхронно. `null` = записи не было, модуль должен
       *  прочитать свой прежний ключ и перенести его через `write()`. */
      get: function () { return cache; },

      /** База доступна и переезд возможен. */
      available: function () { return usable; },

      /** В базе УЖЕ была запись на момент запуска — то есть переезд состоялся
       *  раньше и повторять его не нужно. */
      migrated: function () { return hadRecord; },

      /** Асинхронная запись. Вызывающему ждать не нужно и не следует. */
      write: function (payload) {
        cache = payload;
        if (!usable) return Promise.resolve(false);
        return put(payload);
      },

      /**
       * Синхронная запись на пути закрытия вкладки. Зеркало ложится сразу,
       * запись в базу заводится следом — успеет так успеет: если не успеет,
       * зеркало прочитается при следующей загрузке.
       */
      writeSync: function (payload) {
        if (!usable) return false;
        var ok = writeMirror(payload);
        put(payload);
        return ok;
      },

      /** Писала ли в базу другая вкладка после нашей последней записи. */
      foreignWrote: function () {
        var current = lsGet(revKey);
        return !!current && current !== ownRev;
      },

      /**
       * Подписка на запись из соседней вкладки. Событие `storage` приходит
       * только на маячок, поэтому состояние перечитывается из базы.
       *
       * Слушатель ставится один раз на экземпляр, а обработчики копятся в
       * списке: повторный вызов добавляет получателя, но не вторую подписку.
       */
      onForeign: function (callback) {
        if (typeof callback === 'function') foreignCallbacks.push(callback);
        if (foreignBound) return;
        foreignBound = true;
        global.addEventListener('storage', function (event) {
          if (event.key !== revKey || !event.newValue) return;
          if (event.newValue === ownRev) return;      // наша же запись
          ownRev = event.newValue;
          var store = db();
          if (!store) return;
          store.get(moduleId).then(function (record) {
            if (!record || typeof record.payload !== 'string') return;
            cache = record.payload;
            foreignCallbacks.forEach(function (cb) { cb(record.payload); });
          }).catch(function (error) { console.error('CWState: чтение после чужой записи не удалось', error); });
        });
      },

      /** Только для проверок. */
      keys: { mirror: mirrorKey, rev: revKey },
    };
  }

  global.CWState = { create: create, STORE: STORE, MIRROR_PREFIX: MIRROR_PREFIX, REV_PREFIX: REV_PREFIX };
})(typeof self !== 'undefined' ? self : this);
