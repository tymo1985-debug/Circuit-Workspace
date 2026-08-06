/**
 * Circuit Workspace — shared/backup.js
 * Резервное копирование хаба и отдельных модулей.
 *
 * ИЕРАРХИЯ. Копия хаба включает все модули и общие настройки; копия модуля —
 * только его данные. Модулю не нужно «доносить» свой кусок в хаб: все модули
 * живут на одном origin, поэтому страница хаба читает их хранилища напрямую и
 * собирает полную копию свежей в момент нажатия. Это и даёт нужную иерархию,
 * и заодно снимает главный риск такой схемы — архив, склеенный из кусков,
 * снятых в разное время.
 *
 * ПОЧЕМУ РЕЕСТР ДЕКЛАРАТИВНЫЙ, а не «модуль сам экспортирует себя». Модули —
 * отдельные страницы. Со страницы хаба их код не запущен и вызвать их функцию
 * экспорта нельзя. Поэтому модуль описывает не КАК выгружать, а ГДЕ лежат его
 * данные; обход и сериализацию делает один общий механизм. Новый модуль =
 * одна запись в MODULES, трогать логику не нужно.
 *
 * ФОРМАТ — один JSON с манифестом (см. snapshot() ниже). Версия формата
 * отделена от версий приложения: `formatVersion` меняется, только когда
 * меняется структура самого файла, и по нему при восстановлении решается,
 * понимаем ли мы этот файл вообще.
 *
 * ЧЕГО В КОПИИ НЕТ. PIN-код Клиндария (`syp-pin-hash`) исключён намеренно:
 * файл копии пользователь пересылает себе почтой и кладёт в облако, а хеш
 * замка в такой файл попадать не должен. После восстановления PIN остаётся
 * тот, что стоит на устройстве.
 */
(function (global) {
  'use strict';

  var FORMAT = 'circuit-workspace-backup';
  var FORMAT_VERSION = 1;
  var LOG_KEY = 'cw-backup-log';

  /* Общий слой: настройки, не принадлежащие ни одному модулю. */
  var SHARED = {
    local: ['cw-lang', 'cw-doclang', 'cw-sender'],
    idb: ['circuit-workspace-db'],
  };

  /* Где лежат данные каждого модуля. Ключи вида `cw-lang:<id>` и
     `cw-doclang:<id>` добавляются автоматически — это выбор языка внутри
     модуля, он логично едет вместе с модулем, а не с общим слоем. */
  var MODULES = {
    'congress-project': {
      local: ['congress-pwa-v34-speakers', 'congress-pwa-v34-speakers-backups'],
      idb: [],
    },
    'circuit-planner': {
      local: [
        'service-year-planner-v9-4-2',
        'service-year-planner-v9-4-2-history',
        'service-year-planner-accent',
      ],
      idb: [],
    },
    'pioneer-school': {
      local: [],
      idb: ['pioneer-school-db'],
    },
    'appointments': {
      local: ['cw-appointments-v1'],
      idb: [],
    },
  };

  /* Никогда не попадает в файл копии, даже при полной выгрузке. */
  var EXCLUDE = ['syp-pin-hash'];

  function moduleKeys(id) {
    var entry = MODULES[id];
    if (!entry) return { local: [], idb: [] };
    var local = entry.local.concat(['cw-lang:' + id, 'cw-doclang:' + id]);
    return { local: local.filter(function (k) { return EXCLUDE.indexOf(k) < 0; }), idb: entry.idb };
  }

  /* --- localStorage ---------------------------------------------------- */
  function readLocal(keys) {
    var out = {};
    keys.forEach(function (key) {
      try {
        var value = global.localStorage.getItem(key);
        // null не пишем: отсутствие ключа и пустая строка — разные состояния,
        // и при восстановлении их нельзя перепутать.
        if (value !== null) out[key] = value;
      } catch (e) { /* приватный режим */ }
    });
    return out;
  }

  function writeLocal(map, knownKeys) {
    // Полное восстановление = замена: сначала убираем то, чего в копии нет,
    // иначе от прежнего состояния останутся «хвосты».
    knownKeys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) {
        try { global.localStorage.removeItem(key); } catch (e) { /* no-op */ }
      }
    });
    Object.keys(map).forEach(function (key) {
      if (EXCLUDE.indexOf(key) >= 0) return;
      try { global.localStorage.setItem(key, map[key]); } catch (e) {
        console.error('CWBackup: не удалось записать ключ ' + key, e);
      }
    });
  }

  /* --- IndexedDB -------------------------------------------------------- */
  function req(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function openExisting(name) {
    return new Promise(function (resolve, reject) {
      var r = global.indexedDB.open(name);
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      // Базы может не быть вовсе — тогда откроется пустая нулевой длины,
      // это нормально: в копию попадёт секция без хранилищ.
    });
  }

  function dumpDb(name) {
    return openExisting(name).then(function (db) {
      var storeNames = Array.prototype.slice.call(db.objectStoreNames);
      if (!storeNames.length) { db.close(); return null; }
      var out = { version: db.version, stores: {} };
      var tx = db.transaction(storeNames, 'readonly');
      return Promise.all(storeNames.map(function (storeName) {
        var store = tx.objectStore(storeName);
        var indexes = Array.prototype.slice.call(store.indexNames).map(function (i) {
          var idx = store.index(i);
          return { name: idx.name, keyPath: idx.keyPath, unique: idx.unique };
        });
        return req(store.getAll()).then(function (rows) {
          out.stores[storeName] = { keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes: indexes, rows: rows };
        });
      })).then(function () { db.close(); return out; });
    });
  }

  function restoreDb(name, dump) {
    if (!dump || !dump.stores) return Promise.resolve();
    return openExisting(name).then(function (db) {
      var current = db.version;
      var existing = Array.prototype.slice.call(db.objectStoreNames);
      db.close();
      var needed = Object.keys(dump.stores);
      var missing = needed.filter(function (s) { return existing.indexOf(s) < 0; });
      // Понижать версию IndexedDB нельзя — открываем не ниже текущей.
      // Если каких-то хранилищ нет, версию поднимаем, чтобы попасть в
      // onupgradeneeded и создать их по описанию из копии.
      var version = Math.max(current, dump.version || 1) + (missing.length ? 1 : 0);
      return new Promise(function (resolve, reject) {
        var r = global.indexedDB.open(name, version);
        r.onupgradeneeded = function () {
          var udb = r.result;
          needed.forEach(function (storeName) {
            if (udb.objectStoreNames.contains(storeName)) return;
            var meta = dump.stores[storeName];
            var store = udb.createObjectStore(storeName, {
              keyPath: meta.keyPath || undefined,
              autoIncrement: !!meta.autoIncrement,
            });
            (meta.indexes || []).forEach(function (idx) {
              try { store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique }); } catch (e) { /* уже есть */ }
            });
          });
        };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
        r.onblocked = function () {
          reject(new Error('IndexedDB заблокирована другой вкладкой — закройте остальные вкладки приложения.'));
        };
      });
    }).then(function (db) {
      var names = Object.keys(dump.stores).filter(function (s) { return db.objectStoreNames.contains(s); });
      if (!names.length) { db.close(); return; }
      var tx = db.transaction(names, 'readwrite');
      return Promise.all(names.map(function (storeName) {
        var store = tx.objectStore(storeName);
        return req(store.clear()).then(function () {
          return Promise.all((dump.stores[storeName].rows || []).map(function (row) {
            return req(store.put(row));
          }));
        });
      })).then(function () {
        return new Promise(function (resolve, reject) {
          tx.oncomplete = function () { db.close(); resolve(); };
          tx.onerror = function () { db.close(); reject(tx.error); };
        });
      });
    });
  }

  /* --- Сборка и разбор снимка ------------------------------------------ */
  function section(keys) {
    var out = { local: readLocal(keys.local) };
    if (!keys.idb.length) return Promise.resolve(out);
    return Promise.all(keys.idb.map(function (name) {
      return dumpDb(name).then(function (dump) { return { name: name, dump: dump }; });
    })).then(function (dumps) {
      out.idb = {};
      dumps.forEach(function (d) { if (d.dump) out.idb[d.name] = d.dump; });
      return out;
    });
  }

  /**
   * @param {string[]} [ids] — модули для выгрузки. Не переданы → все (копия хаба).
   * @returns {Promise<Object>} снимок с манифестом
   */
  function snapshot(ids) {
    var full = !ids || !ids.length;
    var list = full ? Object.keys(MODULES) : ids.filter(function (id) { return MODULES[id]; });
    // Общий слой (язык, отправитель, общая база) принадлежит хабу, поэтому
    // в копию отдельного модуля он не входит — модуль сохраняет только себя.
    var jobs = full ? [section(SHARED).then(function (s) { return { id: 'shared', data: s }; })] : [];
    list.forEach(function (id) {
      jobs.push(section(moduleKeys(id)).then(function (s) { return { id: id, data: s }; }));
    });
    return Promise.all(jobs).then(function (parts) {
      var sections = {};
      parts.forEach(function (p) { sections[p.id] = p.data; });
      var versions = {};
      list.forEach(function (id) {
        var reg = global.CW_MODULES && global.CW_MODULES[id];
        if (reg && reg.version) versions[id] = reg.version;
      });
      return {
        format: FORMAT,
        formatVersion: FORMAT_VERSION,
        scope: full ? 'full' : 'module',
        createdAt: new Date().toISOString(),
        app: { hub: global.CW_VERSION || '', modules: versions },
        modules: list,
        sections: sections,
      };
    });
  }

  /**
   * Проверка файла до того, как что-либо изменено на устройстве.
   * @returns {{ok: boolean, error?: string, snapshot?: Object}}
   */
  function inspect(raw) {
    var data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch (e) { return { ok: false, error: 'not-json' }; }
    if (!data || data.format !== FORMAT) return { ok: false, error: 'not-a-backup' };
    if (typeof data.formatVersion !== 'number' || data.formatVersion > FORMAT_VERSION) {
      return { ok: false, error: 'too-new', found: data.formatVersion };
    }
    if (!data.sections || typeof data.sections !== 'object') return { ok: false, error: 'no-sections' };
    return { ok: true, snapshot: data };
  }

  /**
   * Полное восстановление: заменяет данные всех секций, которые есть в файле.
   * Частичное восстановление намеренно не поддерживается — модули ссылаются на
   * общие настройки, и смесь «свежий модуль + старый общий слой» даёт
   * состояние, которого у пользователя никогда не было.
   */
  function restore(data) {
    var check = inspect(data);
    if (!check.ok) return Promise.reject(new Error(check.error));
    var snap = check.snapshot;
    var jobs = [];

    Object.keys(snap.sections).forEach(function (id) {
      var sec = snap.sections[id] || {};
      var keys = id === 'shared' ? SHARED : moduleKeys(id);
      var known = (keys.local || []).slice();
      // Ключи, которых нет в реестре (модуль из более новой версии), всё равно
      // восстанавливаем — терять чужие данные хуже, чем принести лишние.
      Object.keys(sec.local || {}).forEach(function (k) { if (known.indexOf(k) < 0) known.push(k); });
      writeLocal(sec.local || {}, known);
      Object.keys(sec.idb || {}).forEach(function (name) {
        jobs.push(restoreDb(name, sec.idb[name]));
      });
    });

    return Promise.all(jobs).then(function () { return snap; });
  }

  /* --- Журнал последних копий (для таблицы на главной) ------------------- */
  function readLog() {
    try { return JSON.parse(global.localStorage.getItem(LOG_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function note(ids, scope) {
    var log = readLog();
    var stamp = new Date().toISOString();
    ids.forEach(function (id) {
      log[id] = { at: stamp, scope: scope, version: (global.CW_MODULES && global.CW_MODULES[id] || {}).version || '' };
    });
    try { global.localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (e) { /* no-op */ }
    return log;
  }

  /* --- Файл ------------------------------------------------------------- */
  function filename(snap) {
    var date = snap.createdAt.slice(0, 10);
    var who = snap.scope === 'full' ? 'workspace' : snap.modules[0] || 'module';
    return 'circuit-workspace-backup-' + who + '-' + date + '.json';
  }

  function download(snap, name) {
    var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name || filename(snap);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.CWBackup = {
    FORMAT: FORMAT,
    FORMAT_VERSION: FORMAT_VERSION,
    MODULES: MODULES,
    EXCLUDE: EXCLUDE,

    snapshot: snapshot,
    inspect: inspect,
    restore: restore,
    download: download,
    filename: filename,
    log: readLog,

    /** Копия хаба: все модули + общий слой, одним файлом. */
    saveAll: function () {
      return snapshot().then(function (snap) {
        download(snap);
        note(snap.modules.concat(['shared']), 'full');
        return snap;
      });
    },

    /** Копия одного модуля. Общий слой в неё не входит — он принадлежит хабу. */
    saveModule: function (id) {
      if (!MODULES[id]) return Promise.reject(new Error('unknown-module:' + id));
      return snapshot([id]).then(function (snap) {
        download(snap);
        note([id], 'module');
        return snap;
      });
    },
  };
})(typeof self !== 'undefined' ? self : this);
