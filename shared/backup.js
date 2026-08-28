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
  /* Общая база. Названа отдельной константой, потому что у неё, в отличие от
     баз модулей, есть известный этому коду потолок версии — CWDB.DB_VERSION. */
  var SHARED_DB = 'circuit-workspace-db';

  /* Предохранительные снимки перед восстановлением живут в ОТДЕЛЬНОЙ базе.
     Причина жёсткая: полное восстановление заменяет общую базу целиком, то
     есть снимок, положенный в её хранилище `snapshots`, был бы стёрт ровно
     тем действием, от которого страхует. Отдельная база не входит ни в один
     реестр копий, и достать её не может ничто, кроме явного удаления. */
  var GUARD_DB = 'circuit-workspace-guard';
  var GUARD_STORE = 'guards';
  var GUARD_LIMIT = 3;

  /* Сколько ждём базу, прежде чем признать её занятой другой вкладкой.
     Апгрейд здесь только заводит пустые хранилища и укладывается в миллисекунды;
     всё, что дольше, — это `blocked`, о котором браузер мог и не сообщить. */
  var OPEN_TIMEOUT_MS = 4000;

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
      /* С 15.08.2026 (фаза 3) данные модуля лежат в хранилище `state` общей
         базы. Запись адресная — см. предупреждение ниже: ключ там это
         идентификатор модуля, и выгрузка хранилища целиком означала бы, что
         копия Конгрессов при восстановлении затирает состояние Клиндария. */
      /* Резервные копии модуля (10 шт.) с 16.08.2026 (фаза 4) лежат в
         хранилище `snapshots` общей базы, а не в localStorage. Отбор по
         префиксу ключа: хранилище общее, и без отбора копия Конгрессов везла
         бы полные состояния Клиндария. */
      sharedStores: { 'circuit-workspace-db': ['templates', 'documents', { store: 'state', ids: ['congress-project'] }, { store: 'snapshots', prefix: 'congress-project:' }] },
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
      /* Контрольные точки истории (15 шт.) с 16.08.2026 (фаза 4) лежат в
         хранилище `snapshots` общей базы. Отбор по префиксу ключа — см.
         предупреждение ниже. До фазы 4 они ехали ключом
         `service-year-planner-v9-4-2-history`; ключ оставлен в `local`, потому
         что при недоступной базе модуль по-прежнему пишет туда. */
      /* С 16.08.2026 (фаза 5, шаг 3) модуль зеркалит собрания в общий
         справочник `communities`. Без него копия модуля восстановилась бы с
         пустым справочником — бесшумно, ровно как это было с `cw-sender`.
         Хранилище выгружается целиком: ключ записи — собственный id собрания,
         без префикса модуля, поэтому адресный отбор здесь неприменим. Копия
         одного модуля везёт и чужие карточки; при восстановлении секция
         `partial` СЛИВАЕТСЯ, поэтому чужого она не стирает — тот же
         осознанный размен, что у `documents`. */
      sharedStores: { 'circuit-workspace-db': ['templates', 'documents', 'communities', { store: 'state', ids: ['circuit-planner'] }, { store: 'snapshots', prefix: 'circuit-planner:' }] },
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

     ⚠️ ХРАНИЛИЩЕ `snapshots` ОТБИРАЕТСЯ ПО ПРЕФИКСУ КЛЮЧА. Ключ там —
     `<module>:<uid>`, то есть модуль виден прямо в ключе, и перечислять
     записи поимённо (как у `state`) невозможно: они появляются и исчезают.
     Форма `{ store, prefix }` решает ровно этот случай. Затирания здесь не
     боятся — ключи у модулей не пересекаются, — но снимок это полный блоб
     состояния, и без отбора копия одного модуля увозила бы полтора десятка
     чужих состояний в файле, который пользователь пересылает почтой.

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
          var f = byDb[name] || (byDb[name] = { ids: [], prefixes: [] });
          (st.ids || []).forEach(function (key) { if (f.ids.indexOf(key) < 0) f.ids.push(key); });
          if (st.prefix && f.prefixes.indexOf(st.prefix) < 0) f.prefixes.push(st.prefix);
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
   * @param {Object<string, {ids: string[], prefixes: string[]}>} [rowFilters] —
   *   для перечисленных хранилищ взять только записи, чей ключ либо назван
   *   поимённо (`ids`), либо начинается с одного из префиксов (`prefixes`).
   *   Нужно там, где ключ принадлежит конкретному модулю: у `state` это сам
   *   идентификатор модуля, у `snapshots` — префикс ключа.
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
          var byId = wanted && wanted.ids && wanted.ids.length ? wanted.ids : null;
          var byPrefix = wanted && wanted.prefixes && wanted.prefixes.length ? wanted.prefixes : null;
          if ((byId || byPrefix) && store.keyPath) {
            rows = rows.filter(function (r) {
              if (!r) return false;
              var key = String(r[store.keyPath]);
              if (byId && byId.indexOf(r[store.keyPath]) >= 0) return true;
              if (!byPrefix) return false;
              return byPrefix.some(function (p) { return key.slice(0, p.length) === p; });
            });
          }
          out.stores[storeName] = { keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes: indexes, rows: rows };
        });
      })).then(function () { db.close(); return out; });
    });
  }

  /**
   * Потолок версии, выше которой поднимать базу нельзя.
   *
   * ЗАЧЕМ. Понизить версию IndexedDB невозможно. База, поднятая
   * восстановлением выше той версии, которой её открывает рабочий код,
   * перестаёт открываться НАВСЕГДА: данные на диске целы, приложение их
   * больше не видит, а пользователь встречает это ровно в момент
   * восстановления после потери устройства.
   *
   * Для общей базы потолок известен точно — CWDB.DB_VERSION (публикуется
   * shared/db.js). Для баз модулей их собственная константа этому коду
   * недоступна (она объявлена внутри модуля, например
   * pioneer-school/js/db.js), поэтому потолком служит схема, на которой
   * снята сама копия: выше неё подниматься незачем ни при каком раскладе.
   */
  function versionCeiling(name, dump, current) {
    if (name === SHARED_DB && global.CWDB && typeof global.CWDB.DB_VERSION === 'number') {
      return global.CWDB.DB_VERSION;
    }
    return Math.max(current, dump.version || 1);
  }

  /**
   * Завести хранилища общей базы штатным путём ПЕРЕД восстановлением.
   *
   * ЗАЧЕМ. Единственная причина поднимать версию при восстановлении — попасть
   * в onupgradeneeded и создать недостающие хранилища. Но CWDB умеет делать
   * ровно это и делает правильно: своей схемой и своей версией. Позвав его
   * первым, мы в подавляющем большинстве случаев получаем `missing` пустым, и
   * версию трогать не приходится вовсе.
   *
   * Соединение НЕ закрывается намеренно: CWDB кэширует промис открытия, и
   * закрытие снаружи оставило бы кэш с мёртвым соединением. Апгрейду это не
   * мешает — у CWDB есть onversionchange, он освобождает базу сам.
   *
   * Отказ проглатывается: если базу подготовить не удалось, восстановление
   * пойдёт прежним путём, а потолок выше всё равно не даст сломать базу.
   */
  function prepareSchema(name) {
    if (name !== SHARED_DB || !global.CWDB || typeof global.CWDB.init !== 'function') {
      return Promise.resolve();
    }
    try {
      /* Предел ожидания обязателен: CWDB.init() на своём onblocked только пишет
         в консоль и НИКОГДА не отклоняет промис. Без гонки с таймером занятая
         база подвесила бы восстановление навсегда, показывая «Работаю…». */
      return Promise.race([
        Promise.resolve(global.CWDB.init()).then(function () {}, function () {}),
        new Promise(function (resolve) { setTimeout(resolve, OPEN_TIMEOUT_MS); }),
      ]);
    } catch (e) { return Promise.resolve(); }
  }

  /**
   * @param {string} name — имя базы
   * @param {Object} dump — секция из файла копии
   * @param {boolean} [merge] — слияние вместо замены: строки дописываются
   *   поверх существующих по ключу, `clear()` не вызывается. Нужен для
   *   частичной секции общего слоя: восстановление копии ОДНОГО модуля не
   *   имеет права стирать данные соседей из общей базы.
   */
  /**
   * ФАЗА A восстановления одной базы: подготовить схему, проверить потолок,
   * ОТКРЫТЬ базу и вернуть соединение. Ни одной записи здесь не делается.
   *
   * Здесь же ловится «база занята другой вкладкой»: у пользователя PWA хаба и
   * модуль часто открыты одновременно, и до 28.08.2026 такой отказ наступал
   * уже после того, как localStorage был переписан из файла, — оставляя
   * настройки из копии рядом с нетронутой базой, то есть состояние, которого
   * у человека никогда не было.
   */
  function openForRestore(name, dump) {
    if (!dump || !dump.stores) return Promise.resolve(null);
    return prepareSchema(name).then(function () {
      return openExisting(name);
    }).then(function (db) {
      var current = db.version;
      var existing = Array.prototype.slice.call(db.objectStoreNames);
      db.close();
      var needed = Object.keys(dump.stores);
      var missing = needed.filter(function (s) { return existing.indexOf(s) < 0; });

      /* ВЕРСИЯ БАЗЫ ПОСЛЕ ВОССТАНОВЛЕНИЯ (исправлено 28.08.2026).
         Прежняя формула была `max(current, dump.version) + (missing?1:0)` и
         содержала необратимый дефект: копия, снятая на устройстве со схемой 5,
         поднимала базу до 6, после чего shared/db.js, открывающий её версией 5,
         получал VersionError навсегда. Та же формула убивала и базу Школы:
         «призрачная» база v1 + копия v2 давали 3 при DB_VERSION модуля 2.

         Номер версии из файла копии в вычислении не участвует вовсе, и это не
         упрощение. Хранилища создаются по ОПИСАНИЮ из `dump.stores`, а не по
         номеру версии; поднимать версию нужно ровно затем, чтобы попасть в
         onupgradeneeded, и только когда чего-то не хватает. Побочный выигрыш:
         копия, снятая на уже сломанной этим дефектом базе (version 6),
         спокойно восстанавливается в здоровую базу версии 5. */
      var version = missing.length ? current + 1 : current;

      /* Выше потолка не поднимаемся: лучше честный отказ, чем база, которую
         приложение больше никогда не откроет. Сюда попадает копия, где есть
         хранилище, неизвестное схеме этой версии приложения. */
      if (version > versionCeiling(name, dump, current)) {
        return Promise.reject(new Error('backup-newer-schema'));
      }

      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = null;
        var done = function (fn, arg) {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          fn(arg);
        };
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
        r.onsuccess = function () {
          /* Отказались по таймеру, а база всё-таки открылась позже — соединение
             надо закрыть, иначе оно останется висеть и заблокирует следующего. */
          if (settled) { try { r.result.close(); } catch (e) { /* no-op */ } return; }
          done(resolve, r.result);
        };
        r.onerror = function () { done(reject, r.error); };
        r.onblocked = function () { done(reject, new Error('db-blocked')); };
        /* Браузер сообщает о блокировке не всегда (замороженная вкладка вообще
           не отвечает), поэтому у ожидания есть предел. Без него восстановление
           молча висело бы навсегда — а на экране в этот момент «Работаю…». */
        if (version > current) {
          timer = setTimeout(function () { done(reject, new Error('db-blocked')); }, OPEN_TIMEOUT_MS);
        }
      });
    });
  }

  /**
   * Записать данные в УЖЕ ОТКРЫТУЮ базу. Отделено от открытия намеренно:
   * порядок «сначала открыть все базы, потом писать» — единственное, что даёт
   * восстановлению шанс отказаться, не оставив систему в состоянии, которого
   * у пользователя никогда не было (см. restore()).
   */
  function writeDb(db, dump, merge) {
    var names = Object.keys(dump.stores).filter(function (s) { return db.objectStoreNames.contains(s); });
    if (!names.length) { db.close(); return Promise.resolve(); }
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
  }

  /** Открыть и сразу записать. Оставлено для точечных вызовов и читаемости. */
  function restoreDb(name, dump, merge) {
    if (!dump || !dump.stores) return Promise.resolve();
    return openForRestore(name, dump).then(function (db) {
      if (!db) return;
      return writeDb(db, dump, merge);
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

    /* СХЕМА ОБЩЕЙ БАЗЫ ПРОВЕРЯЕТСЯ ЗДЕСЬ, а не в restoreDb, потому что здесь
       ещё ничего не изменено на устройстве — это единственное место, где
       отказ бесплатен. restoreDb свой потолок тоже держит, но там отказ уже
       застаёт localStorage переписанным.
       Условие строгое: копия из более новой схемы означает, что приложение на
       этом устройстве старее файла, и правильный ответ — «сначала обновите»,
       а не попытка разобраться. */
    var ceiling = global.CWDB && global.CWDB.DB_VERSION;
    if (typeof ceiling === 'number') {
      var found = null;
      Object.keys(data.sections).forEach(function (id) {
        var idb = (data.sections[id] || {}).idb || {};
        var dump = idb[SHARED_DB];
        if (dump && typeof dump.version === 'number' && dump.version > ceiling) {
          found = dump.version;
        }
      });
      if (found !== null) return { ok: false, error: 'schema-too-new', found: found };
    }

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

    /* ПОРЯДОК ОПЕРАЦИЙ — не деталь реализации, а требование корректности
       (исправлено 28.08.2026). Раньше localStorage переписывался синхронно в
       обходе секций, а задания IndexedDB копились и выполнялись потом. Любой
       отказ базы — занята другой вкладкой, потолок версии, ошибка транзакции —
       заставал систему с настройками и легаси-ключами из файла рядом с
       нетронутой базой. Хаб честно показывал «не удалось», но откатывать было
       уже нечего.

       Теперь три фазы:
         A. открыть ВСЕ базы (здесь же ловится «занята» и потолок версии) —
            ни одной записи;
         B. записать данные в базы по очереди;
         C. и только потом localStorage.

       Полной атомарности это не даёт и не может дать: IndexedDB и localStorage
       разные хранилища без общей транзакции. Но подавляющее большинство
       отказов — именно отказы ОТКРЫТИЯ, и они теперь наступают до первой
       записи, когда откатывать ещё нечего. */
    var dbPlan = [];
    var localPlan = [];

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
      localPlan.push({ map: sec.local || {}, known: known });
      Object.keys(sec.idb || {}).forEach(function (name) {
        dbPlan.push({ name: name, dump: sec.idb[name], merge: partial });
      });
    });

    var opened = [];
    var closeAll = function () {
      opened.forEach(function (item) {
        if (item.db) { try { item.db.close(); } catch (e) { /* no-op */ } }
      });
    };

    /* Фаза A. Последовательно, а не Promise.all: две базы, открываемые
       одновременно, могут заблокировать друг друга апгрейдом, и разбирать
       такой отказ было бы нечем. */
    return dbPlan.reduce(function (chain, job) {
      return chain.then(function () {
        return openForRestore(job.name, job.dump).then(function (db) {
          opened.push({ db: db, job: job });
        });
      });
    }, Promise.resolve()).catch(function (e) {
      closeAll();
      throw e;
    }).then(function () {
      /* Фаза B. */
      return opened.reduce(function (chain, item) {
        return chain.then(function () {
          if (!item.db) return;
          var db = item.db;
          item.db = null;            // writeDb закрывает соединение сам
          return writeDb(db, item.job.dump, item.job.merge);
        });
      }, Promise.resolve()).catch(function (e) {
        closeAll();
        throw e;
      });
    }).then(function () {
      /* Фаза C. */
      localPlan.forEach(function (item) { writeLocal(item.map, item.known); });
      return snap;
    });
  }

  /* --- Предохранительный снимок перед восстановлением --------------------
   *
   * ЗАЧЕМ ОТДЕЛЬНАЯ БАЗА. Хаб перед восстановлением выгружает текущее
   * состояние файлом. Но `download()` создаёт `<a download>` и кликает по
   * нему — браузер вправе отказать молча: блокировка автозагрузок, iOS Safari
   * в режиме PWA, нет места, пользователь отменил диалог. Функция ничего не
   * возвращает и не бросает, поэтому обещанный откат мог просто не
   * существовать — ровно в тот момент, когда он единственный.
   *
   * Почему не хранилище `snapshots` общей базы, где уже есть механизм: полное
   * восстановление ЗАМЕНЯЕТ общую базу целиком, то есть стёрло бы снимок тем
   * самым действием, от которого он страхует. Отдельная база не входит ни в
   * один реестр копий и не попадает под замену.
   */
  function guardOpen() {
    return new Promise(function (resolve, reject) {
      var r = global.indexedDB.open(GUARD_DB, 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(GUARD_STORE)) {
          db.createObjectStore(GUARD_STORE, { keyPath: 'id' });
        }
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.onblocked = function () { reject(new Error('db-blocked')); };
    });
  }

  function guardSave(snap) {
    var record = { id: 'restore:' + new Date().toISOString(), at: Date.now(), payload: snap };
    return guardOpen().then(function (db) {
      var tx = db.transaction([GUARD_STORE], 'readwrite');
      var store = tx.objectStore(GUARD_STORE);
      return req(store.put(record)).then(function () {
        /* Держим только последние GUARD_LIMIT: снимок — это полный слепок всех
           модулей, и хранить их без предела значит съесть место у самих данных. */
        return req(store.getAllKeys());
      }).then(function (keys) {
        var extra = keys.sort().slice(0, Math.max(0, keys.length - GUARD_LIMIT));
        return Promise.all(extra.map(function (k) { return req(store.delete(k)); }));
      }).then(function () {
        return new Promise(function (resolve, reject) {
          tx.oncomplete = function () { db.close(); resolve(record.id); };
          tx.onerror = function () { db.close(); reject(tx.error); };
        });
      });
    }).catch(function (e) {
      /* Не легло — не повод отменять восстановление: файл мог сохраниться.
         Вызывающий видит null и решает сам, что сказать пользователю. */
      console.error('CWBackup: предохранительный снимок не сохранён', e);
      return null;
    });
  }

  /** Шапки предохранительных снимков, НОВЫЕ → СТАРЫЕ. */
  function guardList() {
    return guardOpen().then(function (db) {
      if (!db.objectStoreNames.contains(GUARD_STORE)) { db.close(); return []; }
      var store = db.transaction([GUARD_STORE], 'readonly').objectStore(GUARD_STORE);
      return req(store.getAll()).then(function (all) {
        db.close();
        return all.map(function (r) { return { id: r.id, at: r.at }; })
          .sort(function (a, b) { return b.at - a.at; });
      });
    }).catch(function (e) {
      console.error('CWBackup: список предохранительных снимков недоступен', e);
      return [];
    });
  }

  /** Полный снимок по id — годится прямо для download() и для restore(). */
  function guardGet(id) {
    return guardOpen().then(function (db) {
      var store = db.transaction([GUARD_STORE], 'readonly').objectStore(GUARD_STORE);
      return req(store.get(id)).then(function (rec) {
        db.close();
        return rec ? rec.payload : null;
      });
    }).catch(function (e) {
      console.error('CWBackup: предохранительный снимок не прочитан', e);
      return null;
    });
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

    /** Предохранительный снимок перед восстановлением. Живёт в отдельной базе,
     *  поэтому переживает даже полную замену общей — см. комментарий выше. */
    guard: {
      DB: GUARD_DB,
      save: guardSave,
      list: guardList,
      get: guardGet,
    },
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
