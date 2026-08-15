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
 *
 * ЗАВИСИМОСТИ ОТ ОБЩЕГО СЛОЯ (`sharedLocal` / `sharedStores`, добавлено
 * 12.08.2026). Копия модуля по-прежнему не тащит с собой весь общий слой — он
 * принадлежит хабу. Но часть общего слоя ВХОДИТ В САМИ ДАННЫЕ модуля, и без
 * неё копия неполна: письма Конгрессов, Клиндария и Назначений печатают блок
 * отправителя из `cw-sender`, который живёт в общем слое. До этой правки
 * копия модуля его не включала — восстановление на чистом устройстве давало
 * письма с пустой шапкой, причём молча.
 *
 * Поэтому модуль объявляет, какие части общего слоя нужны его данным, и они
 * попадают в его копию отдельной секцией с пометкой `partial: true`.
 *
 * ⚠️ ЧАСТИЧНАЯ СЕКЦИЯ ВОССТАНАВЛИВАЕТСЯ СЛИЯНИЕМ, А НЕ ЗАМЕНОЙ. Это не
 * оптимизация, а требование корректности: общий слой делят все модули, и
 * восстановление копии одного модуля не имеет права стирать данные соседей.
 * Полная копия хаба по-прежнему заменяет всё — там это и требуется.
 *
 * ФОРМАТ ПОДНЯТ ДО 2 именно из-за этой секции. Прежний код, увидев в файле
 * `sections.shared` рядом с одним модулем, восстановил бы его как полную
 * замену общего слоя и удалил бы ключи, которых в частичной секции нет.
 * Версия 2 для него «слишком новая» — он честно откажется и ничего не тронет.
 * Файлы версии 1 читаются как раньше.
 */
(function (global) {
  'use strict';

  var FORMAT = 'circuit-workspace-backup';
  var FORMAT_VERSION = 2;
  var LOG_KEY = 'cw-backup-log';

  /* Общий слой: настройки, не принадлежащие ни одному модулю. */
  var SHARED = {
    local: ['cw-lang', 'cw-doclang', 'cw-sender'],
    idb: ['circuit-workspace-db'],
  };

  /* Где лежат данные каждого модуля. Ключи вида `cw-lang:<id>` и
     `cw-doclang:<id>` добавляются автоматически — это выбор языка внутри
     модуля, он логично едет вместе с модулем, а не с общим слоем.

     `sharedLocal` / `sharedStores` — части общего слоя, БЕЗ КОТОРЫХ ДАННЫЕ
     МОДУЛЯ НЕПОЛНЫ. Критерий один: попадает ли это в готовый документ или в
     поведение самого модуля. Если да — едет вместе с копией модуля.

     Что сюда сознательно НЕ входит:
       • `cw-lang` и `cw-doclang` без суффикса — это глобальный выбор языка,
         принадлежащий хабу. У модуля уже есть свои `cw-lang:<id>` и
         `cw-doclang:<id>`; затащив сюда глобальные, копия одного модуля
         переписывала бы язык всего приложения.
       • общая база целиком — модулю нужны конкретные хранилища, а не всё
         подряд; иначе копия Конгрессов таскала бы справочник собраний. */
  var MODULES = {
    'congress-project': {
      local: ['congress-pwa-v34-speakers', 'congress-pwa-v34-speakers-backups'],
      idb: [],
      /* Блок отправителя печатается в шапке каждого письма участнику,
         а с 12.08.2026 в общей базе лежат и сами шаблоны писем.
         С 15.08.2026 модуль пишет и снимки выданных писем (`documents`):
         без них копия Конгрессов восстановилась бы с пустым архивом. */
      sharedLocal: ['cw-sender'],
      sharedStores: { 'circuit-workspace-db': ['templates', 'documents'] },
    },
    'circuit-planner': {
      local: [
        'service-year-planner-v9-4-2',
        'service-year-planner-v9-4-2-history',
        'service-year-planner-accent',
      ],
      idb: [],
      /* Подпись под письмом собранию и подстановка `{sender}` в шаблонах,
         а с 12.08.2026 в общей базе лежат и сами письма, памятки и обращения.
         С 13.08.2026 добавлен архив выданных документов (`documents`): без него
         восстановленный модуль показывал бы визиты, о которых «никогда ничего
         не отправляли», хотя письма ушли. */
      sharedLocal: ['cw-sender'],
      /* С 15.08.2026 (фаза 2 переезда на общую базу) САМИ ДАННЫЕ МОДУЛЯ лежат
         в хранилище `state` общей базы, а не в localStorage. Без него копия
         модуля уехала бы с одним лишь дореформенным снимком под старым ключом:
         внешне полноценный файл, внутри — состояние на день переезда. Ровно
         тот бесшумный отказ, что уже случался с `cw-sender` и с архивом
         Конгрессов, и выясняется он в момент восстановления. */
      sharedStores: { 'circuit-workspace-db': ['templates', 'documents', { store: 'state', ids: ['circuit-planner'] }] },
    },
    'pioneer-school': {
      local: [],
      idb: ['pioneer-school-db'],
      /* С фазой 6 (14.08.2026) у модуля появилось письмо учащемуся, и запись
         перестала быть пустой: письмо печатает шапку отправителя из `cw-sender`,
         берёт текст из общего хранилища шаблонов и кладёт снимок в архив.
         Копия без них восстановилась бы бесшумно испорченной — с пустой шапкой
         и системным текстом вместо отредактированного.
         Анкета, бланк и формуляры по-прежнему от общего слоя не зависят. */
      sharedLocal: ['cw-sender'],
      sharedStores: { 'circuit-workspace-db': ['templates', 'documents'] },
    },
    /* «Документы» — единственный модуль без собственных данных: он редактирует
       общее хранилище шаблонов, поэтому его копия состоит ровно из него.
       Пустые local/idb здесь не забывчивость, а факт. */
    'documents': {
      local: [],
      idb: [],
      sharedLocal: [],
      sharedStores: { 'circuit-workspace-db': ['templates', 'documents'] },
    },
    'appointments': {
      local: ['cw-appointments-v1'],
      idb: [],
      /* Письмо о назначении подписывается районным надзирателем. */
      sharedLocal: ['cw-sender'],
      sharedStores: {},
    },
  };

  /* ⚠️ ХРАНИЛИЩЕ `state` — ЕДИНСТВЕННОЕ, ГДЕ ВЫГРУЖАТЬ ЦЕЛИКОМ НЕЛЬЗЯ.
     Ключ записи в нём — идентификатор модуля, то есть у каждого модуля ровно
     одна запись. Слияние при восстановлении здесь не спасает, как спасает в
     остальных хранилищах: оно кладёт строки поверх существующих ПО КЛЮЧУ, и
     недельной давности копия Клиндария затёрла бы этой строкой актуальное
     состояние соседнего модуля целиком. Поэтому запись объявляется адресно —
     `{ store: 'state', ids: [<module>] }`, и в копию едет только своя.

     ⚠️ АРХИВ ДОКУМЕНТОВ ВЫГРУЖАЕТСЯ ХРАНИЛИЩЕМ ЦЕЛИКОМ. Механизм умеет брать
     отдельные store общей базы, но не отдельные записи внутри store — поэтому
     в копии Клиндария едут и снимки документов Конгрессов. Это осознанный
     размен: секция помечена `partial` и при восстановлении СЛИВАЕТСЯ, значит
     лишнее ничего не затирает, а вот выборочная выгрузка потребовала бы
     фильтра по полю в общем слое. Занесено в IDEAS.md; менять только вместе с
     проверкой check-backup.mjs. */

  /* Никогда не попадает в файл копии, даже при полной выгрузке. */
  var EXCLUDE = ['syp-pin-hash'];

  /**
   * Объединённые зависимости от общего слоя для набора модулей.
   * @returns {{local: string[], stores: Object<string, string[]>}}
   */
  function sharedDeps(ids) {
    var local = [];
    var stores = {};
    var filters = {};
    ids.forEach(function (id) {
      var entry = MODULES[id];
      if (!entry) return;
      (entry.sharedLocal || []).forEach(function (k) {
        if (local.indexOf(k) < 0 && EXCLUDE.indexOf(k) < 0) local.push(k);
      });
      var declared = entry.sharedStores || {};
      Object.keys(declared).forEach(function (dbName) {
        var list = stores[dbName] || (stores[dbName] = []);
        (declared[dbName] || []).forEach(function (st) {
          /* Две формы записи: строка — хранилище целиком; объект
             `{store, ids}` — только перечисленные записи. Вторая нужна там,
             где ключ записи принадлежит конкретному модулю (`state`). */
          var name = typeof st === 'string' ? st : st && st.store;
          if (!name) return;
          if (list.indexOf(name) < 0) list.push(name);
          var byDb = filters[dbName] || (filters[dbName] = {});
          if (typeof st === 'string') { byDb[name] = null; return; }   // целиком побеждает
          if (byDb[name] === null) return;                              // уже объявлено целиком
          var ids = byDb[name] || (byDb[name] = []);
          (st.ids || []).forEach(function (key) { if (ids.indexOf(key) < 0) ids.push(key); });
        });
      });
    });
    return { local: local, stores: stores, filters: filters };
  }

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

  /**
   * @param {string} name — имя базы
   * @param {string[]} [only] — выгрузить только эти хранилища (для частичной
   *   секции общего слоя). Не передан → вся база.
   * @param {Object<string, string[]>} [rowFilters] — для перечисленных хранилищ
   *   взять только записи с этими ключами. Нужно там, где ключ принадлежит
   *   конкретному модулю (`state`) и чужую запись брать нельзя.
   */
  function dumpDb(name, only, rowFilters) {
    return openExisting(name).then(function (db) {
      var storeNames = Array.prototype.slice.call(db.objectStoreNames);
      if (only && only.length) {
        storeNames = storeNames.filter(function (s) { return only.indexOf(s) >= 0; });
      }
      if (!storeNames.length) { db.close(); return null; }
      var out = { version: db.version, stores: {} };
      var tx = db.transaction(storeNames, 'readonly');
      return Promise.all(storeNames.map(function (storeName) {
        var store = tx.objectStore(storeName);
        var indexes = Array.prototype.slice.call(store.indexNames).map(function (i) {
          var idx = store.index(i);
          return { name: idx.name, keyPath: idx.keyPath, unique: idx.unique };
        });
        var wanted = rowFilters && rowFilters[storeName];
        return req(store.getAll()).then(function (rows) {
          if (wanted && wanted.length && store.keyPath) {
            rows = rows.filter(function (r) { return r && wanted.indexOf(r[store.keyPath]) >= 0; });
          }
          out.stores[storeName] = { keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes: indexes, rows: rows };
        });
      })).then(function () { db.close(); return out; });
    });
  }

  /**
   * @param {string} name — имя базы
   * @param {Object} dump — секция из файла копии
   * @param {boolean} [merge] — слияние вместо замены: строки дописываются
   *   поверх существующих по ключу, `clear()` не вызывается. Нужен для
   *   частичной секции общего слоя: восстановление копии ОДНОГО модуля не
   *   имеет права стирать данные соседей из общей базы.
   */
  function restoreDb(name, dump, merge) {
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
        var rows = dump.stores[storeName].rows || [];
        var write = function () {
          return Promise.all(rows.map(function (row) { return req(store.put(row)); }));
        };
        return merge ? write() : req(store.clear()).then(write);
      })).then(function () {
        return new Promise(function (resolve, reject) {
          tx.oncomplete = function () { db.close(); resolve(); };
          tx.onerror = function () { db.close(); reject(tx.error); };
        });
      });
    });
  }

  /* --- Сборка и разбор снимка ------------------------------------------ */
  /**
   * @param {{local: string[], idb: string[], stores?: Object}} keys
   *   `stores` — если задан, из каждой базы выгружаются только перечисленные
   *   хранилища (частичная секция общего слоя).
   */
  function section(keys) {
    var out = { local: readLocal(keys.local) };
    var dbs = keys.idb || [];
    if (!dbs.length) return Promise.resolve(out);
    return Promise.all(dbs.map(function (name) {
      var only = keys.stores && keys.stores[name];
      var rowFilters = keys.filters && keys.filters[name];
      return dumpDb(name, only, rowFilters).then(function (dump) { return { name: name, dump: dump }; });
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
    // Полная копия забирает общий слой целиком. Копия модуля — только то, без
    // чего её собственные данные неполны (см. sharedLocal/sharedStores):
    // блок отправителя печатается в письмах, и терять его молча нельзя.
    // Секция помечается `partial`, чтобы при восстановлении сработало слияние,
    // а не замена общего слоя.
    var jobs = [];
    if (full) {
      jobs.push(section(SHARED).then(function (s) { return { id: 'shared', data: s }; }));
    } else {
      var deps = sharedDeps(list);
      var dbs = Object.keys(deps.stores);
      if (deps.local.length || dbs.length) {
        jobs.push(section({ local: deps.local, idb: dbs, stores: deps.stores, filters: deps.filters })
          .then(function (s) { s.partial = true; return { id: 'shared', data: s }; }));
      }
    }
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
      // Частичная секция общего слоя из копии модуля: слияние, не замена.
      // Общий слой делят все модули — восстановление копии Клиндария не имеет
      // права стереть отправителя или шаблоны, нужные Конгрессам.
      var partial = id === 'shared' && sec.partial === true;
      var keys = id === 'shared' ? SHARED : moduleKeys(id);
      var known = partial ? [] : (keys.local || []).slice();
      if (!partial) {
        // Ключи, которых нет в реестре (модуль из более новой версии), всё равно
        // восстанавливаем — терять чужие данные хуже, чем принести лишние.
        Object.keys(sec.local || {}).forEach(function (k) { if (known.indexOf(k) < 0) known.push(k); });
      }
      writeLocal(sec.local || {}, known);
      Object.keys(sec.idb || {}).forEach(function (name) {
        jobs.push(restoreDb(name, sec.idb[name], partial));
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
