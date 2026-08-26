/**
 * Circuit Workspace — shared/snapshots.js
 * История снимков состояния модуля. Фаза 4 трека «миграция на shared/db.js».
 *
 * ─── ЧТО ЭТО И ЗАЧЕМ ────────────────────────────────────────────────────────
 *
 * У двух модулей есть собственная страховка от неверного действия:
 *   • Клиндарий держит 15 контрольных точек (не чаще одной в 5 минут);
 *   • Конгрессы — 10 резервных копий перед необратимыми операциями.
 *
 * Обе лежали в localStorage, и обе хранят ПОЛНЫЙ блоб состояния. То есть
 * рядом с одним рабочим состоянием лежало ещё пятнадцать таких же — именно
 * они и съедали квоту в 5 МБ, из-за которой затевался весь трек. Фазы 2–3
 * вынесли рабочее состояние, эта фаза выносит его копии.
 *
 * Схема данных снимка НЕ меняется: внутри `payload` тот же блоб, что лежал
 * в массиве под старым ключом.
 *
 * ─── ПОЧЕМУ ЗАПИСЬ НА КАЖДЫЙ СНИМОК, А НЕ ОДИН МАССИВ ───────────────────────
 *
 * Старый код на каждую контрольную точку читал ВЕСЬ массив, разбирал его,
 * дописывал элемент и записывал обратно — то есть пятнадцать блобов
 * сериализовались туда-обратно ради одного нового. В хранилище это одна
 * запись: добавление не трогает соседей, а обрезка удаляет ровно лишние.
 *
 * ─── ПОЧЕМУ КЛЮЧ ПРЕФИКСОВАН МОДУЛЕМ ────────────────────────────────────────
 *
 * `id` = `<module>:<uid>`. Хранилище общее для всех модулей, а механизм
 * резервного копирования умеет отбирать записи ПО КЛЮЧУ. Префикс даёт ему
 * возможность положить в копию Клиндария только его снимки: без этого копия
 * одного модуля везла бы полные состояния соседнего, а это уже не «лишний
 * вес», а чужие данные в файле, который уезжает в почту.
 *
 * ─── ПОЧЕМУ СПИСОК ЖИВЁТ В ПАМЯТИ ───────────────────────────────────────────
 *
 * `snapshotIfDue()` Клиндария вызывается ВНУТРИ записи состояния и должен
 * синхронно ответить на вопрос «давно ли был прошлый снимок». Чтение
 * IndexedDB асинхронно, поэтому шапки снимков (без блоба) читаются один раз
 * при `init()` и дальше живут в памяти. Блобы при этом в память не
 * поднимаются: `init()` идёт КУРСОРОМ и берёт из каждой записи только шапку
 * (см. `CWDB.eachByIndex`). Иначе открытие модуля стоило бы десятков
 * мегабайт — ровно тот вес, ради выноса которого фаза и делается.
 *
 * ─── ОТКАЗ ЗАПИСИ НЕ ЛОМАЕТ РАБОТУ ──────────────────────────────────────────
 *
 * Снимок — страховка, а не данные. `add()` не бросает: ошибка уходит в
 * консоль, возвращается `null`. То же правило, что у `CWDocs.save()`: архив
 * не имеет права ронять действие, ради которого он ведётся. Вызывающий, для
 * которого снимок критичен (сброс приложения), обязан ДОЖДАТЬСЯ промиса и
 * проверить результат сам.
 *
 * ─── СТАРЫЙ КЛЮЧ УДАЛЯЕТСЯ, И ЭТО ОТЛИЧИЕ ОТ ФАЗ 2–3 ────────────────────────
 *
 * В фазах 2–3 прежний ключ модуля остался лежать нетронутым — он снимок «как
 * было до переезда», то есть обратимость. Здесь наоборот: ключ истории
 * удаляется, и удаляется СТРОГО после того, как все записи подтверждённо
 * легли в базу. Причина простая: не удалить его значит не освободить ничего,
 * а вся фаза затевалась ровно ради этого места. Риск ограничен — данные
 * пользователя (рабочее состояние) лежат отдельно и не трогаются вовсе;
 * откат версии модуля стоит истории отмен, но не данных.
 *
 * Перенос идемпотентен: у записей из старого массива ключ вычисляется из
 * модуля и времени снимка, поэтому две вкладки, стартовавшие одновременно,
 * положат одни и те же записи, а не два комплекта.
 */
(function (global) {
  'use strict';

  var STORE = 'snapshots';

  function lsGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsDel(key) {
    try { global.localStorage.removeItem(key); } catch (e) { /* приватный режим */ }
  }

  function uid() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * @param {Object} options
   * @param {string} options.module — идентификатор модуля; он же префикс ключей.
   * @param {number} options.limit — сколько снимков хранить (старые удаляются).
   * @param {string} [options.legacyKey] — ключ localStorage со старым массивом.
   * @param {function(string):Array} [options.readLegacy] — разбор старого
   *   массива в записи `{at, label, labelKey, meta, payload}`. Формат у модулей
   *   разный (у одного `{at,data}`, у другого `{date,label,data}`), поэтому
   *   разбор принадлежит модулю, а не общему слою.
   *
   * `label` — ГОТОВЫЙ текст подписи, `labelKey` — ключ локализации, из которого
   * этот текст получен. Хранятся оба, и это не избыточность: у записей, снятых
   * до 26.08.2026, ключа нет физически, поэтому рисовать список можно только
   * как `labelKey ? t(labelKey) : label`. Убрать запасную ветку нельзя никогда —
   * старые записи живут в базе и в резервных копиях пользователей. Ключ нужен
   * потому, что готовый текст замерзает на языке, который был в момент снимка:
   * копия, снятая при русском интерфейсе, оставалась русской и после перехода
   * на немецкий.
   */
  function create(options) {
    var moduleId = options.module;
    var limit = options.limit > 0 ? options.limit : 10;
    var legacyKey = options.legacyKey || '';
    var readLegacy = typeof options.readLegacy === 'function' ? options.readLegacy : null;

    var index = [];        // шапки снимков, СТАРЫЕ → НОВЫЕ (без payload)
    var usable = false;
    var ready = false;
    var chain = Promise.resolve();   // записи идут по очереди: обрезка не должна обгонять добавление

    function store() {
      return global.CWDB && global.CWDB[STORE] ? global.CWDB[STORE] : null;
    }

    function sortIndex() {
      index.sort(function (a, b) { return a.at - b.at; });
    }

    /** Удалить всё, что вышло за предел. Работает и по индексу в памяти, и в базе. */
    function trim() {
      var extra = index.length - limit;
      if (extra <= 0) return Promise.resolve();
      var doomed = index.slice(0, extra);
      index = index.slice(extra);
      var db = store();
      if (!db) return Promise.resolve();
      return Promise.all(doomed.map(function (item) {
        return db.remove(item.id).catch(function (e) {
          console.error('CWSnapshots: не удалось удалить старый снимок', e);
        });
      }));
    }

    /** Перенос старого массива из localStorage. Ключ стирается только после
     *  подтверждённой записи ВСЕХ снимков. */
    function migrateLegacy() {
      if (!legacyKey || !readLegacy) return Promise.resolve(false);
      var raw = lsGet(legacyKey);
      if (!raw) return Promise.resolve(false);
      var items;
      try { items = readLegacy(raw) || []; } catch (e) {
        /* Разобрать не смогли — ключ НЕ трогаем. Испорченная история лучше
           стёртой: её ещё можно достать руками из localStorage. */
        console.error('CWSnapshots: старая история не разобрана, ключ оставлен как есть', e);
        return Promise.resolve(false);
      }
      if (!items.length) { lsDel(legacyKey); return Promise.resolve(false); }
      var db = store();
      if (!db) return Promise.resolve(false);
      /* Ключ вычисляется из модуля и времени снимка, а не случайно: две
         вкладки, стартовавшие одновременно, положат одни и те же записи, а не
         два комплекта. */
      var known = {};
      index.forEach(function (item) { known[item.id] = true; });
      var jobs = items.map(function (item, i) {
        var at = Number(item.at) || Date.now();
        var record = {
          id: moduleId + ':legacy_' + at + '_' + i,
          module: moduleId,
          at: at,
          label: item.label || '',
          labelKey: item.labelKey || '',
          meta: item.meta || null,
          payload: String(item.payload == null ? '' : item.payload),
        };
        return db.put(record).then(function () {
          if (!known[record.id]) {
            index.push({ id: record.id, at: record.at, label: record.label, labelKey: record.labelKey, meta: record.meta });
            known[record.id] = true;
          }
        });
      });
      return Promise.all(jobs).then(function () {
        sortIndex();
        return trim();
      }).then(function () {
        lsDel(legacyKey);
        return true;
      }).catch(function (e) {
        /* Хотя бы одна запись не легла — ключ остаётся, перенос повторится
           при следующем запуске. Стереть его сейчас значило бы потерять то,
           что не доехало. */
        console.error('CWSnapshots: перенос старой истории не завершён, старый ключ оставлен', e);
        return false;
      });
    }

    return {
      /** Промис НИКОГДА не отклоняется: недоступная база — причина работать
       *  на прежнем ключе, а не отказ запуска модуля. */
      init: function () {
        if (ready) return Promise.resolve(usable);
        var db = store();
        if (!db) { ready = true; return Promise.resolve(false); }
        return db.eachByIndex('module', moduleId, function (record) {
          /* Из записи берём ТОЛЬКО шапку: payload остаётся в базе. */
          return { id: record.id, at: Number(record.at) || 0, label: record.label || '', labelKey: record.labelKey || '', meta: record.meta || null };
        }).then(function (heads) {
          index = heads;
          sortIndex();
          usable = true;
          ready = true;
          return migrateLegacy();
        }).then(function () {
          return usable;
        }).catch(function (e) {
          console.error('CWSnapshots: хранилище снимков недоступно, модуль работает на прежнем ключе', e);
          ready = true;
          usable = false;
          return false;
        });
      },

      available: function () { return usable; },

      /** Шапки снимков, НОВЫЕ → СТАРЫЕ. Копии: список наружу не редактируется. */
      list: function () {
        return index.slice().reverse().map(function (item) {
          return { id: item.id, at: item.at, label: item.label, labelKey: item.labelKey, meta: item.meta };
        });
      },

      /** Время последнего снимка, синхронно. 0 = снимков нет. */
      lastAt: function () { return index.length ? index[index.length - 1].at : 0; },

      count: function () { return index.length; },

      /**
       * Добавить снимок. Шапка попадает в индекс СРАЗУ, до подтверждения
       * записи: иначе `lastAt()` ещё несколько миллисекунд отвечал бы старым
       * значением, и интервальная проверка Клиндария наделала бы снимков
       * подряд. Не легло в базу — шапка убирается обратно.
       * @returns {Promise<string|null>} id снимка либо null при отказе.
       */
      add: function (entry) {
        var db = store();
        if (!usable || !db) return Promise.resolve(null);
        var record = {
          id: moduleId + ':' + uid(),
          module: moduleId,
          at: Number(entry && entry.at) || Date.now(),
          label: (entry && entry.label) || '',
          labelKey: (entry && entry.labelKey) || '',
          meta: (entry && entry.meta) || null,
          payload: String(entry && entry.payload == null ? '' : entry.payload),
        };
        index.push({ id: record.id, at: record.at, label: record.label, labelKey: record.labelKey, meta: record.meta });
        sortIndex();
        chain = chain.then(function () {
          return db.put(record).then(function () { return trim(); }).then(function () { return record.id; });
        }).catch(function (e) {
          console.error('CWSnapshots: снимок не сохранён', e);
          index = index.filter(function (item) { return item.id !== record.id; });
          return null;
        });
        return chain;
      },

      /** Полная запись со снимком состояния. `null` = записи нет. */
      get: function (id) {
        var db = store();
        if (!usable || !db) return Promise.resolve(null);
        return db.get(id).catch(function (e) {
          console.error('CWSnapshots: снимок не прочитан', e);
          return null;
        });
      },

      /** Удалить снимок. Ручная чистка; автолимит делает `add()`. */
      remove: function (id) {
        var db = store();
        if (!usable || !db) return Promise.resolve(false);
        index = index.filter(function (item) { return item.id !== id; });
        return db.remove(id).then(function () { return true; }).catch(function (e) {
          console.error('CWSnapshots: снимок не удалён', e);
          return false;
        });
      },
    };
  }

  global.CWSnapshots = { create: create, STORE: STORE };
})(typeof self !== 'undefined' ? self : this);
