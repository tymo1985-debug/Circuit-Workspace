/**
 * Circuit Workspace — shared/directory.js (CWDirectory)
 *
 * Общий справочник собраний поверх хранилища `CWDB.communities`.
 * Модули к хранилищу напрямую не ходят — только через этот слой.
 *
 * ── ГРАНИЦА (решение Алекса 16.08.2026), нарушать нельзя ──────────────────
 * Здесь живёт ИДЕНТИФИКАЦИЯ собрания: название, номер, адрес, контакт.
 * Здесь НЕ живёт то, как собрание выглядит в конкретном модуле: цвет метки,
 * расписание встреч, тип визита, язык формуляра. Это свойства представления,
 * а не собрания: соседнему модулю зелёный цвет и «Ср 19:00» не значат ничего,
 * а название и номер — значат.
 * Разбор — `docs/db-migration/02-communities-audit.md`.
 *
 * `lat`/`lng` попали СЮДА намеренно: это машинная форма адреса, а не отдельное
 * свойство. Держать адрес в общем слое, а координаты в модуле — значит завести
 * рассинхрон, ради устранения которого справочник и заводится.
 *
 * ── СИНХРОННОЕ ЧТЕНИЕ ПОСЛЕ init() ───────────────────────────────────────
 * Отрисовка Клиндария синхронна, а IndexedDB — нет. Поэтому весь справочник
 * кэшируется в память при `init()`, а `all()`/`get()`/`byName()` отвечают из
 * кэша. Тот же приём и по той же причине, что в `CWSender` и `CWTemplates`.
 * До `init()` кэш пуст, и это НЕ то же самое, что «справочник пустой» —
 * смотреть `ready`.
 *
 * ── СОСЕДНИЕ ВКЛАДКИ ─────────────────────────────────────────────────────
 * Запись в IndexedDB НЕ порождает события `storage`. Поэтому после каждой
 * успешной записи обновляется маячок `cw-directory-rev` в localStorage, и
 * соседка по нему перечитывает базу. Без маячка две вкладки разошлись бы
 * молча — ровно тот отказ, который ловили в фазе 2 (см. AGENTS.md).
 */
(function (global) {
  'use strict';

  var STORE = 'communities';
  var REV_KEY = 'cw-directory-rev';

  /* Поля общей карточки. Всё, чего здесь нет, принадлежит модулю. */
  var FIELDS = ['name', 'congNumber', 'address',
                'contactName', 'contactPhone', 'contactEmail', 'contactNote'];

  var cache = [];          // массив записей
  var index = null;        // id → запись
  var ready = false;
  var listeners = [];
  var ownRev = '';

  function db() {
    return global.CWDB && global.CWDB[STORE] ? global.CWDB[STORE] : null;
  }

  function lsGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* квота/приватный режим */ }
  }

  function str(value) {
    return String(value == null ? '' : value).trim();
  }

  /** Нормализация названия для сравнения: регистр и лишние пробелы не значимы. */
  function normName(value) {
    return str(value).replace(/\s+/g, ' ').toLowerCase();
  }

  /**
   * Разбор строки вида «Warszawa-Ukraiński-Południe (19588)» на пару.
   * Нужен Конгрессам, где номер вшит прямо в название (см. аудит §3).
   *
   * ⚠️ Это ДОГАДКА, а не разбор: скобки в конце названия не обязаны быть
   * номером собрания. Функция чистая и ничего сама не применяет — результат
   * обязан подтверждать человек. Автоматически расщеплять нельзя.
   */
  function parseName(value) {
    var raw = str(value);
    var m = raw.match(/^(.*?)\s*\((\d{3,})\)\s*$/);
    if (!m) return { name: raw, congNumber: '' };
    return { name: str(m[1]), congNumber: m[2] };
  }

  function normalize(raw, previous) {
    var record = {};
    var source = raw || {};
    var before = previous || {};
    record.id = str(source.id) || (before.id || '');
    FIELDS.forEach(function (field) {
      record[field] = str(source[field] !== undefined ? source[field] : before[field]);
    });
    var lat = source.lat !== undefined ? source.lat : before.lat;
    var lng = source.lng !== undefined ? source.lng : before.lng;
    record.lat = typeof lat === 'number' ? lat : null;
    record.lng = typeof lng === 'number' ? lng : null;

    /* Кто знает про эту запись. Удаление в одном модуле не имеет права
       стирать запись, на которую ссылается соседний: модуль лишь уходит из
       списка, а запись исчезает, когда список опустел. */
    var sources = [];
    (before.sources || []).concat(source.sources || []).forEach(function (item) {
      var id = str(item);
      if (id && sources.indexOf(id) < 0) sources.push(id);
    });
    record.sources = sources;
    record.createdAt = before.createdAt || source.createdAt || Date.now();
    record.updatedAt = Date.now();
    return record;
  }

  function reindex() {
    index = Object.create(null);
    cache.forEach(function (record) { index[record.id] = record; });
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { console.warn('CWDirectory: подписчик упал', e); }
    }
  }

  function bumpRev() {
    ownRev = String(Date.now()) + ':' + Math.random().toString(36).slice(2, 8);
    lsSet(REV_KEY, ownRev);
  }

  function reload() {
    var store = db();
    if (!store) return Promise.resolve(false);
    return store.getAll().then(function (rows) {
      cache = (rows || []).filter(function (row) { return row && row.id; });
      cache.sort(function (a, b) {
        return normName(a.name).localeCompare(normName(b.name));
      });
      reindex();
      ready = true;
      return true;
    }).catch(function (error) {
      console.error('CWDirectory: не удалось прочитать справочник', error);
      /* Пустой кэш при недоступной базе — это «не знаем», а не «пусто».
         ready остаётся false, чтобы вызывающий мог отличить одно от другого. */
      return false;
    });
  }

  var CWDirectory = {
    FIELDS: FIELDS,
    STORE: STORE,
    REV_KEY: REV_KEY,

    /** Загрузить справочник в память. Звать один раз при старте модуля. */
    init: function () {
      if (!db()) {
        console.warn('CWDirectory: CWDB недоступен — справочник не подключён');
        return Promise.resolve(false);
      }
      ownRev = lsGet(REV_KEY) || '';
      return reload();
    },

    /** Прочитан ли справочник. false = «ещё не знаем», не «пусто». */
    get ready() { return ready; },

    /** @returns {Array} копии записей — вызывающий не может испортить кэш. */
    all: function () {
      return cache.map(function (record) { return Object.assign({}, record); });
    },

    /** @returns {Object|null} копия записи */
    get: function (id) {
      var found = index && index[str(id)];
      return found ? Object.assign({}, found) : null;
    },

    /** Поиск по названию без учёта регистра и лишних пробелов. */
    byName: function (name) {
      var needle = normName(name);
      if (!needle) return null;
      for (var i = 0; i < cache.length; i++) {
        if (normName(cache[i].name) === needle) return Object.assign({}, cache[i]);
      }
      return null;
    },

    /** Названия для автодополнения (datalist Конгрессов). */
    names: function () {
      return cache.map(function (record) { return record.name; })
                  .filter(function (name) { return !!name; });
    },

    /**
     * Создать или обновить запись. Поля, которых нет в FIELDS, отбрасываются —
     * это и есть защита границы: модуль физически не может протащить сюда
     * свой цвет или расписание, даже передав их по ошибке.
     *
     * @param {Object} patch — должен содержать `id` и `name`
     * @param {string} [moduleId] — кто пишет; попадёт в `sources`
     */
    upsert: function (patch, moduleId) {
      var store = db();
      if (!store) return Promise.resolve(null);
      var id = str(patch && patch.id);
      if (!id) return Promise.reject(new Error('CWDirectory.upsert: нужен id'));
      var previous = index && index[id] ? index[id] : null;
      var input = Object.assign({}, patch);
      if (moduleId) input.sources = [moduleId];
      var record = normalize(input, previous);
      return store.put(record).then(function () {
        if (previous) {
          for (var i = 0; i < cache.length; i++) {
            if (cache[i].id === id) { cache[i] = record; break; }
          }
        } else {
          cache.push(record);
          cache.sort(function (a, b) { return normName(a.name).localeCompare(normName(b.name)); });
        }
        reindex();
        bumpRev();
        notify();
        return Object.assign({}, record);
      }).catch(function (error) {
        console.error('CWDirectory: запись не удалась', error);
        return null;
      });
    },

    /**
     * Убрать модуль из записи. Запись стирается ЦЕЛИКОМ только когда её
     * больше не знает ни один модуль — иначе удаление события в Клиндарии
     * унесло бы собрание из-под ссылок соседнего модуля.
     *
     * @returns {Promise<'removed'|'detached'|'missing'|null>}
     */
    detach: function (id, moduleId) {
      var store = db();
      if (!store) return Promise.resolve(null);
      var key = str(id);
      var record = index && index[key];
      if (!record) return Promise.resolve('missing');

      var rest = (record.sources || []).filter(function (item) { return item !== moduleId; });
      if (rest.length) {
        var updated = Object.assign({}, record, { sources: rest, updatedAt: Date.now() });
        return store.put(updated).then(function () {
          for (var i = 0; i < cache.length; i++) {
            if (cache[i].id === key) { cache[i] = updated; break; }
          }
          reindex(); bumpRev(); notify();
          return 'detached';
        }).catch(function (error) {
          console.error('CWDirectory: отвязка не удалась', error);
          return null;
        });
      }
      return store.remove(key).then(function () {
        cache = cache.filter(function (item) { return item.id !== key; });
        reindex(); bumpRev(); notify();
        return 'removed';
      }).catch(function (error) {
        console.error('CWDirectory: удаление не удалось', error);
        return null;
      });
    },

    /** Разбор «Название (номер)». Результат подтверждает человек — см. выше. */
    parseName: parseName,

    /** @returns {Function} отписка */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    /** Только для проверок и живых прогонов. */
    _reload: reload,
  };

  /* Соседняя вкладка написала в базу — событие приходит только на маячок,
     поэтому справочник перечитывается целиком. */
  global.addEventListener('storage', function (event) {
    if (!event || event.key !== REV_KEY || !event.newValue) return;
    if (event.newValue === ownRev) return;          // наша же запись
    ownRev = event.newValue;
    reload().then(function (ok) { if (ok) notify(); });
  });

  global.CWDirectory = CWDirectory;
})(typeof self !== 'undefined' ? self : this);
