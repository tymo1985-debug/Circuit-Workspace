/**
 * Circuit Workspace — shared/archive.js
 * Архив завершённых единиц работы. Шаг A1 трека «Архив» (05.10.2026).
 * Проект схемы и обязанностей — docs/db-migration/05-archive-schema.md.
 *
 * ─── КТО ЧТО ДЕЛАЕТ ─────────────────────────────────────────────────────────
 *
 * Модуль-источник (Клиндарий, Конгрессы) строит конверт из СВОЕГО блоба и
 * пишет его через `CWArchive.put()`. Модуль Архив только показывает. Этот
 * файл — единственная точка входа в хранилище `archive` общей базы, и
 * устройство чужих блобов ему неизвестно: `payload` он не читает и не
 * разбирает, `display` хранит как есть.
 *
 * ─── ПОЧЕМУ СПИСОК ИСТОЧНИКОВ ЗАКРЫТЫЙ ──────────────────────────────────────
 *
 * `SOURCES` — не справка, а предохранитель. Копия модуля везёт его конверты
 * отбором по префиксу ключа (`{ store: 'archive', prefix: '<module>:' }` в
 * реестре shared/backup.js). Модуль, который начал бы архивировать без такой
 * строки в реестре, получил бы копии «без прошлых лет» — без единой ошибки.
 * Поэтому новый источник заводится в двух местах сразу, а сверку держит
 * scripts/check-backup.mjs.
 *
 * ─── ОТКАЗ ЗАПИСИ НЕ ГЛОТАЕТСЯ ──────────────────────────────────────────────
 *
 * В отличие от `CWDocs.save()` и `CWSnapshots.add()`. Там архив — побочный
 * след действия, которое уже случилось (письмо ушло адресату). Здесь запись
 * и есть действие: пользователь обязан узнать, что архивация не случилась.
 * Все методы отклоняют промис ошибкой с полем `code`:
 *   'unavailable' — общей базы или хранилища нет (честный отказ, а не пустой
 *                   список: «архива нет» и «архив пуст» — разные ответы);
 *   'invalid'     — конверт не той формы, `field` называет поле;
 *   'unconfirmed' — remove() без явного подтверждения.
 *
 * ─── РЕВИЗИИ ────────────────────────────────────────────────────────────────
 *
 * `id` = `<module>:<entity>:<sourceId>`. Повторная архивация того же объекта
 * пишет поверх: `revision` растёт, `firstArchivedAt` не двигается. Вычисление
 * идёт внутри одной readwrite-транзакции (`CWDB.archive.mutate`), поэтому две
 * вкладки не получат одинаковую следующую ревизию.
 */
(function (global) {
  'use strict';

  var STORE = 'archive';
  var FORMAT = 1;

  /* Источник → допустимые сущности. Менять только вместе с реестром
     shared/backup.js (см. шапку). Школа добавится сюда же, когда до неё
     дойдёт задача В. */
  var SOURCES = Object.freeze({
    'circuit-planner': Object.freeze(['serviceYear']),
    'congress-project': Object.freeze(['congress']),
  });

  function fail(code, detail, field) {
    var e = new Error('CWArchive: ' + code + (detail ? ': ' + detail : ''));
    e.code = code;
    if (field) e.field = field;
    return e;
  }

  function db() {
    var cw = global.CWDB;
    return cw && cw[STORE] ? cw : null;
  }

  var ready = null;

  /**
   * Открыть базу и убедиться, что хранилище есть.
   * Без базы — отказ `unavailable`, а не пустой результат.
   */
  function init() {
    if (ready) return ready;
    var cw = db();
    if (!cw) return Promise.reject(fail('unavailable', 'CWDB не подключён'));
    ready = Promise.resolve()
      .then(function () { return cw.init(); })
      .then(function (conn) {
        if (conn && conn.objectStoreNames && !conn.objectStoreNames.contains(STORE)) {
          throw fail('unavailable', 'в базе нет хранилища ' + STORE);
        }
        return true;
      })
      .catch(function (e) {
        ready = null;   // следующая попытка открывает заново, а не отдаёт старый отказ
        if (e && e.code) throw e;
        var wrapped = fail('unavailable', e && e.message);
        wrapped.cause = e;
        throw wrapped;
      });
    return ready;
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }
  function nonEmptyString(v) {
    return typeof v === 'string' && v.trim() !== '';
  }

  function makeId(module, entity, sourceId) {
    return module + ':' + entity + ':' + sourceId;
  }

  /**
   * Проверка формы. Бросает `invalid` с именем поля. Значения не чинит и не
   * приводит: молча превращённое число в строку спрятало бы ошибку модуля.
   */
  function validate(env) {
    if (!isPlainObject(env)) throw fail('invalid', 'конверт не объект', 'envelope');
    var entities = Object.prototype.hasOwnProperty.call(SOURCES, env.module) ? SOURCES[env.module] : null;
    if (!entities) throw fail('invalid', 'неизвестный модуль ' + env.module, 'module');
    if (entities.indexOf(env.entity) < 0) throw fail('invalid', 'сущность ' + env.entity + ' не принадлежит ' + env.module, 'entity');
    if (!nonEmptyString(env.sourceId)) throw fail('invalid', 'sourceId — непустая строка', 'sourceId');
    if (!Number.isInteger(env.serviceYear)) throw fail('invalid', 'serviceYear — целое число (год начала)', 'serviceYear');
    if (env.entity === 'serviceYear' && env.sourceId !== String(env.serviceYear)) {
      throw fail('invalid', 'у служебного года sourceId обязан совпадать с serviceYear', 'sourceId');
    }
    var id = makeId(env.module, env.entity, env.sourceId);
    if (env.id !== undefined && env.id !== id) throw fail('invalid', 'id ' + env.id + ' не совпадает с ' + id, 'id');
    if (env.format !== undefined && env.format !== FORMAT) throw fail('invalid', 'формат ' + env.format + ' не поддерживается', 'format');
    if (!nonEmptyString(env.title)) throw fail('invalid', 'title — непустая строка', 'title');
    if (env.sourceVersion !== undefined && typeof env.sourceVersion !== 'string') throw fail('invalid', 'sourceVersion — строка', 'sourceVersion');

    if (!isPlainObject(env.display) || !Array.isArray(env.display.sections)) {
      throw fail('invalid', 'display.sections — массив', 'display');
    }
    env.display.sections.forEach(function (sec, i) {
      if (!isPlainObject(sec) || !Array.isArray(sec.rows)) throw fail('invalid', 'display.sections[' + i + '].rows — массив', 'display');
    });
    if (env.summary !== undefined && !isPlainObject(env.summary)) throw fail('invalid', 'summary — объект', 'summary');
    if (!isPlainObject(env.payload)) throw fail('invalid', 'payload — объект с данными для восстановления', 'payload');
    if (env.docRefs !== undefined) {
      if (!Array.isArray(env.docRefs) || !env.docRefs.every(nonEmptyString)) {
        throw fail('invalid', 'docRefs — массив непустых строк', 'docRefs');
      }
    }
    return id;
  }

  /**
   * Записать конверт. Повторная запись того же объекта — поверх, с ростом
   * `revision`; `firstArchivedAt` берётся из уже лежащей записи.
   * @returns {Promise<Object>} записанный конверт
   */
  function put(envelope) {
    var id;
    try { id = validate(envelope); } catch (e) { return Promise.reject(e); }
    return init().then(function () {
      var now = new Date().toISOString();
      return db()[STORE].mutate(id, function (current) {
        return {
          id: id,
          module: envelope.module,
          entity: envelope.entity,
          sourceId: envelope.sourceId,
          serviceYear: envelope.serviceYear,
          title: envelope.title,
          archivedAt: now,
          firstArchivedAt: current && current.firstArchivedAt ? current.firstArchivedAt : now,
          revision: current && Number.isInteger(current.revision) ? current.revision + 1 : 1,
          format: FORMAT,
          sourceVersion: envelope.sourceVersion || '',
          display: envelope.display,
          summary: envelope.summary || {},
          payload: envelope.payload,
          docRefs: (envelope.docRefs || []).slice(),
        };
      });
    });
  }

  function get(id) {
    return init().then(function () { return db()[STORE].get(id); });
  }

  function has(id) {
    return get(id).then(function (rec) { return !!rec; });
  }

  /* Лёгкая строка списка: всё, кроме payload. Курсором — чтобы список годов
     не поднимал в память данные всех архивированных лет. */
  function light(rec) {
    var out = {};
    Object.keys(rec).forEach(function (k) { if (k !== 'payload') out[k] = rec[k]; });
    return out;
  }

  /**
   * @param {{module?: string, serviceYear?: number}} [filter]
   * @returns {Promise<Object[]>} конверты без payload; новые годы сверху,
   *   внутри года — последние записи сверху.
   */
  function list(filter) {
    var f = filter || {};
    if (f.module !== undefined && !Object.prototype.hasOwnProperty.call(SOURCES, f.module)) {
      return Promise.reject(fail('invalid', 'неизвестный модуль ' + f.module, 'module'));
    }
    if (f.serviceYear !== undefined && !Number.isInteger(f.serviceYear)) {
      return Promise.reject(fail('invalid', 'serviceYear — целое число', 'serviceYear'));
    }
    return init().then(function () {
      var store = db()[STORE];
      var pick = function (rec) {
        if (f.module !== undefined && rec.module !== f.module) return undefined;
        if (f.serviceYear !== undefined && rec.serviceYear !== f.serviceYear) return undefined;
        return light(rec);
      };
      if (f.serviceYear !== undefined) return store.eachByIndex('serviceYear', f.serviceYear, pick);
      var modules = f.module !== undefined ? [f.module] : Object.keys(SOURCES);
      return Promise.all(modules.map(function (m) { return store.eachByIndex('module', m, pick); }))
        .then(function (parts) { return [].concat.apply([], parts); });
    }).then(function (rows) {
      return rows.sort(function (a, b) {
        if (a.serviceYear !== b.serviceYear) return b.serviceYear - a.serviceYear;
        return a.archivedAt < b.archivedAt ? 1 : a.archivedAt > b.archivedAt ? -1 : 0;
      });
    });
  }

  /** Служебные годы, где есть конверты, новые сверху. */
  function years() {
    return list().then(function (rows) {
      var seen = {};
      rows.forEach(function (r) { seen[r.serviceYear] = true; });
      return Object.keys(seen).map(Number).sort(function (a, b) { return b - a; });
    });
  }

  /**
   * Удалить конверт. Только по подтверждению в интерфейсе: без
   * `{ confirmed: true }` отказ `unconfirmed`, чтобы случайный вызов из кода
   * не стёр архивный год молча.
   * @returns {Promise<boolean>} был ли конверт
   */
  function remove(id, options) {
    if (!options || options.confirmed !== true) {
      return Promise.reject(fail('unconfirmed', 'удаление конверта требует { confirmed: true }'));
    }
    return init().then(function () {
      var store = db()[STORE];
      return store.get(id).then(function (rec) {
        if (!rec) return false;
        return store.remove(id).then(function () { return true; });
      });
    });
  }

  global.CWArchive = {
    FORMAT: FORMAT,
    SOURCES: SOURCES,
    makeId: makeId,
    init: init,
    put: put,
    get: get,
    has: has,
    list: list,
    years: years,
    remove: remove,
  };
})(typeof self !== 'undefined' ? self : this);
