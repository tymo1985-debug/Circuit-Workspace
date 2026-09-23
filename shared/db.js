/**
 * Circuit Workspace — shared/db.js
 * Общий слой данных для всех модулей хаба, на IndexedDB.
 *
 * Схема сущности "community" (община/собрание) построена на основе
 * структуры events[] из Клиндария (Circuit-Planner v9.55.0) — см. аудит
 * в проектном документе, раздел 2.1. Это сделано намеренно, чтобы при
 * будущей миграции Клиндария на общий слой не потребовалось трансформировать
 * поля: id, name, color, address, schedule, visitType, contactName,
 * contactPhone, contactEmail, contactNote, congNumber, lat, lng, formLanguage.
 *
 * Модули подключают файл через <script src="../shared/db.js"></script>
 * и используют глобальный объект `CWDB`.
 *
 * СХЕМА v2 (12.08.2026) добавила хранилище `templates` — пользовательские
 * версии шаблонов документов. Апгрейд безопасен для существующих данных:
 * onupgradeneeded создаёт только недостающие хранилища и ничего не переносит.
 *
 * Пример использования:
 *   const all = await CWDB.communities.getAll();
 *   const id = await CWDB.communities.add({ name: 'Общ. Центр', address: '...' });
 *   await CWDB.communities.update(id, { phone: '+48...' });
 *   await CWDB.communities.remove(id);
 */
(function (global) {
  'use strict';

  const DB_NAME = 'circuit-workspace-db';
  const DB_VERSION = 6;

  /** Схема хранилищ: имя store → keyPath + индексы */
  const STORES = {
    communities: { keyPath: 'id', indexes: ['name', 'congNumber'] },
    people:      { keyPath: 'id', indexes: ['name', 'role', 'communityId'] },
    meetings:    { keyPath: 'id', indexes: ['communityId', 'start'] },
    roles:       { keyPath: 'id', indexes: ['name'] },
    /* Пользовательские версии шаблонов документов (v2, 12.08.2026).
       Системные тексты лежат в коде — shared/templates/builtin.js; сюда
       попадает ТОЛЬКО то, что пользователь изменил сам. Отсутствие записи —
       не пустота, а «пользователь этот шаблон не трогал», и тогда действует
       системный текст. Поэтому «восстановить оригинал» = удалить запись.
       Работать с этим хранилищем напрямую модули не должны: единственная
       точка входа — CWTemplates (shared/templates.js). */
    templates:   { keyPath: 'id', indexes: ['context', 'module'] },
    /* Архив выданных документов (v3, 13.08.2026). Запись появляется только в
       момент, когда документ ПОКИНУЛ приложение: печать, выгрузка PDF,
       отправка письма, либо явное «сохранить». Предпросмотр и черновое
       редактирование сюда не попадают — иначе архив превращается в шум из
       почти одинаковых записей.
       `body` хранится уже подставленным: именно это делает историю
       неизменной. Шаблон потом можно править сколько угодно — то, что ушло
       людям, останется как ушло.
       `entityKey` — плоская склейка `module:entity:id`. Индекс по вложенному
       `ref.module` формально возможен, но плоский ключ надёжнее переживает
       восстановление копии, где вложенный объект мог прийти неполным.
       Работать напрямую модули не должны: точка входа — CWDocs
       (shared/documents.js). */
    documents:   { keyPath: 'id', indexes: ['entityKey', 'module', 'createdAt', 'templateId'] },
    /* Состояние модуля целиком (v4, 15.08.2026) — одна запись на модуль:
       `{ id: '<module>', payload: '<JSON>', savedAt }`. Это переезд из
       localStorage, а НЕ смена модели данных: внутри `payload` лежит тот же
       блоб, что лежал под ключом модуля. Разбор блоба на записи
       (`events[]` → `communities`) — отдельная фаза, и смешивать её с
       переездом нельзя: у переезда цена ошибки уже максимальная.
       Индексов нет намеренно: искать внутри блоба всё равно нечем, а лишний
       индекс пришлось бы поддерживать при каждой записи.
       Работать напрямую модули не должны: точка входа — CWState
       (shared/state.js), он же держит синхронное зеркало на закрытие вкладки. */
    state:       { keyPath: 'id' },
    /* История снимков состояния (v5, 16.08.2026) — то, что раньше лежало в
       localStorage: контрольные точки Клиндария и резервные копии Конгрессов.
       Именно эти два набора и упирались в квоту: пятнадцать и десять полных
       блобов состояния рядом с самим состоянием.
       Ключ записи ПРЕФИКСОВАН модулем (`<module>:<uid>`) намеренно: механизм
       резервного копирования умеет отбирать записи по ключу, и префикс даёт
       ему возможность взять в копию модуля только его снимки, не таща чужие.
       Индекс `module` — для выборки, `at` — чтобы обрезать самые старые не
       вычитывая всё хранилище целиком.
       Работать напрямую модули не должны: точка входа — CWSnapshots
       (shared/snapshots.js). */
    snapshots:   { keyPath: 'id', indexes: ['module', 'at'] },
    /* Журнал (v6, фаза J2). Четыре собственных хранилища модуля, нормализованные
       строки вместо блоба в `state`: у Журнала поиск, связи, архив и (J8)
       шифрование ПО ЗАПИСЯМ, а блоб в `state` к тому же зеркалится CWState в
       localStorage — для защищённых записей это недопустимо.
       Апгрейд 5→6 чисто аддитивный: общий обработчик ниже создаёт только
       отсутствующие хранилища и не трогает существующие.
       Индексы — только по полям с валидными ключами IndexedDB: булево значение
       ключом не является, поэтому «открыт на следующее посещение» хранится
       строкой-селектором `carryKey = '<nodeId>:open'`, а у закрытых записей
       поле отсутствует (такие записи в индекс не попадают вовсе).
       Работать напрямую модули не должны: точка входа — CWJournal
       (journal/js/data.js). */
    journalNodes:   { keyPath: 'id', indexes: ['parentId', 'circuitId', 'kind', 'status', 'updatedAt'] },
    journalEntries: { keyPath: 'id', indexes: ['nodeId', 'circuitId', 'type', 'status', 'updatedAt', 'dueDate', 'carryKey'] },
    journalLinks:   { keyPath: 'id', indexes: ['from', 'to', 'rel'] },
    journalMeta:    { keyPath: 'id' },
  };

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        Object.keys(STORES).forEach((storeName) => {
          if (db.objectStoreNames.contains(storeName)) return;
          const { keyPath, indexes } = STORES[storeName];
          const store = db.createObjectStore(storeName, { keyPath });
          (indexes || []).forEach((idx) => {
            try { store.createIndex(idx, idx, { unique: false }); } catch (e) { /* index exists */ }
          });
        });
      };

      req.onsuccess = () => {
        const db = req.result;
        // Если другая вкладка запросит апгрейд схемы — освобождаем соединение,
        // иначе она навсегда зависнет в onblocked.
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => {
        // Без сброса кэшированного промиса одна неудачная попытка открыть базу
        // делала CWDB нерабочим до перезагрузки страницы.
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => console.warn('CWDB: обновление схемы заблокировано — закройте другие вкладки приложения.');
    });
    return dbPromise.catch((error) => { dbPromise = null; throw error; });
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function tx(storeName, mode) {
    return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
  }

  function promisifyRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** Фабрика стандартного CRUD-набора для одного store */
  function makeCrud(storeName, idPrefix) {
    return {
      /** Вернуть все записи store */
      async getAll() {
        const store = await tx(storeName, 'readonly');
        return promisifyRequest(store.getAll());
      },

      /** Вернуть одну запись по id, либо null */
      async get(id) {
        const store = await tx(storeName, 'readonly');
        const result = await promisifyRequest(store.get(id));
        return result === undefined ? null : result;
      },

      /**
       * Все записи, у которых значение индексируемого поля равно value.
       * Нужна архиву документов: выбирать историю одной сущности перебором
       * всего хранилища значит вычитывать чужие письма ради своих.
       * Несуществующий индекс — это ошибка схемы, а не пустой результат,
       * поэтому она пробрасывается наружу, а не глотается.
       */
      async byIndex(indexName, value) {
        const store = await tx(storeName, 'readonly');
        return promisifyRequest(store.index(indexName).getAll(value));
      },

      /**
       * Перебор записей по индексу КУРСОРОМ, с отбором нужного на лету.
       * Возвращает массив значений, которые вернул `visit(record)`
       * (`undefined` пропускается).
       *
       * Зачем это рядом с `byIndex`, который делает то же самое одной строкой:
       * `getAll()` материализует ВСЕ записи разом, а в хранилище `snapshots`
       * запись — это полный блоб состояния модуля. Список из пятнадцати таких
       * записей нужен ради даты и подписи, а стоил бы десятков мегабайт в
       * памяти на телефоне. Курсор отдаёт записи по одной, и вызывающий
       * оставляет себе только шапку.
       */
      async eachByIndex(indexName, value, visit) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readonly');
          const out = [];
          const req = transaction.objectStore(storeName).index(indexName).openCursor(IDBKeyRange.only(value));
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            const picked = visit(cursor.value);
            if (picked !== undefined) out.push(picked);
            cursor.continue();
          };
          transaction.oncomplete = () => resolve(out);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error || new Error(`CWDB.${storeName}.eachByIndex: транзакция прервана`));
        });
      },

      /** Добавить запись; если record.id не задан — генерируется автоматически. Возвращает id. */
      async add(record) {
        const store = await tx(storeName, 'readwrite');
        // id ставится ПОСЛЕ спреда: при { id: ..., ...record } объект с явным
        // полем id: undefined затирал сгенерированный ключ, и store.add падал.
        const payload = { ...record, id: record.id || uid(idPrefix) };
        await promisifyRequest(store.add(payload));
        return payload.id;
      },

      /** Частично обновить запись по id (merge). Бросает ошибку, если записи нет. */
      async update(id, patch) {
        // get и put выполняются внутри ОДНОЙ транзакции, без await между ними:
        // ожидание промиса между двумя запросами — известная ловушка IndexedDB,
        // транзакция может успеть закрыться, и put упадёт с TransactionInactiveError.
        const db = await openDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          let merged = null;
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            const current = getReq.result;
            if (!current) {
              transaction.abort();
              reject(new Error(`CWDB.${storeName}.update: запись ${id} не найдена`));
              return;
            }
            merged = { ...current, ...patch, id };
            store.put(merged);
          };
          transaction.oncomplete = () => resolve(merged);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error || new Error('CWDB.update: транзакция прервана'));
        });
      },

      /** Полностью заменить запись (put), либо создать, если не было. */
      async put(record) {
        const store = await tx(storeName, 'readwrite');
        const payload = { ...record, id: record.id || uid(idPrefix) };
        await promisifyRequest(store.put(payload));
        return payload.id;
      },

      /**
       * Атомарное чтение-изменение-запись: `get`, вычисление и `put` внутри
       * ОДНОЙ readwrite-транзакции.
       *
       * ЗАЧЕМ ОТДЕЛЬНО ОТ `update()`. `update()` принимает готовый патч, то
       * есть значение вычислено ДО транзакции. Для номера ревизии этого мало:
       * две вкладки прочитали бы `rev = N` и обе записали бы `N + 1`, и на
       * диске остался бы один из двух вариантов без всякого признака, что
       * второй потерян. Здесь вычисление происходит внутри транзакции, а
       * IndexedDB упорядочивает readwrite-транзакции с пересекающейся областью
       * в пределах базы — в том числе из разных вкладок. Поэтому одинаковый
       * следующий `rev` получить нельзя.
       *
       * `fn(current)` ОБЯЗАНА БЫТЬ СИНХРОННОЙ. Любое ожидание промиса между
       * `get` и `put` закрывает транзакцию — та же ловушка, что описана у
       * `update()`, только здесь её легче не заметить.
       *
       * @param {IDBValidKey} id
       * @param {(current: Object|null) => (Object|undefined)} fn
       *        `current` — текущая запись или `null`, если её нет.
       *        Возврат `undefined` = не писать ничего; транзакция при этом
       *        завершается УСПЕШНО, и промис отдаёт текущую запись.
       *        Исключение из `fn` прерывает транзакцию: частичной записи не
       *        бывает, промис отклоняется этим же исключением.
       * @returns {Promise<Object|null>} записанная (или оставшаяся) запись.
       */
      async mutate(id, fn) {
        if (typeof fn !== 'function') {
          throw new TypeError(`CWDB.${storeName}.mutate: нужна функция fn(current)`);
        }
        const db = await openDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          let result = null;
          let failure = null;
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            const current = getReq.result === undefined ? null : getReq.result;
            let next;
            try {
              next = fn(current);
            } catch (error) {
              // Прерываем ДО put: записи не было, откатывать нечего.
              failure = error;
              transaction.abort();
              return;
            }
            if (next === undefined) { result = current; return; }
            // id ставится ПОСЛЕ спреда — как в add()/put(): вернуть из fn чужой
            // или пустой id и молча переехать на другой ключ нельзя.
            result = { ...next, id };
            store.put(result);
          };
          // Ошибка самого get прерывает транзакцию — ловим её причину, чтобы
          // наружу ушла она, а не безымянный abort.
          getReq.onerror = () => { failure = failure || getReq.error; };
          // Только oncomplete: put.onsuccess означает «запрос принят», а не
          // «транзакция зафиксирована». Разница и есть правдивый статус.
          transaction.oncomplete = () => resolve(result);
          transaction.onerror = () => reject(failure || transaction.error);
          transaction.onabort = () => reject(
            failure || transaction.error || new Error(`CWDB.${storeName}.mutate: транзакция прервана`)
          );
        });
      },

      /** Удалить запись по id */
      async remove(id) {
        const store = await tx(storeName, 'readwrite');
        await promisifyRequest(store.delete(id));
      },

      /** Удалить все записи store (с осторожностью) */
      async clear() {
        const store = await tx(storeName, 'readwrite');
        await promisifyRequest(store.clear());
      },
    };
  }

  /**
   * Атомарный пакет ЗАРАНЕЕ ВЫЧИСЛЕННЫХ операций над несколькими хранилищами
   * в ОДНОЙ readwrite-транзакции (Журнал J8, 23.09.2026).
   *
   * ЗАЧЕМ. Защита записи Журнала пишет две строки в два хранилища (метаданные
   * сейфа + зашифрованная строка), и состояние «одна записана, другая нет»
   * необратимо: шифротекст без ключа — потеря, ключ без строки — пустой
   * сейф. `mutate()` держит одно хранилище, здесь — несколько.
   *
   * ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: функций обратного вызова. Всё вычисляется ДО
   * вызова (включая шифрование — асинхронное, а значит закрыло бы
   * транзакцию); внутри только детерминированные put/add/delete и
   * декларативные предусловия. Операции выполняются строго по порядку.
   *
   * @param {Array<{type: 'put'|'add'|'delete'|'expect', store: string,
   *   value?: Object, key?: IDBValidKey, match?: Object|null}>} ops
   *   put    — store.put(value), ключ — value.id (обязателен);
   *   add    — store.add(value): ключ занят → ConstraintError → откат пакета;
   *   delete — store.delete(key);
   *   expect — ничего не пишет, только предусловие по `match`.
   *   match  — предусловие к ТЕКУЩЕЙ строке с тем же ключом: `null` — строки
   *            быть не должно; объект — строка есть, и каждое перечисленное
   *            поле совпадает по JSON-представлению (`undefined` = поля нет).
   *            Несовпадение → Error('cwdb-batch-precondition') с `opIndex`,
   *            весь пакет откатывается.
   * @returns {Promise<number>} число операций — только после oncomplete.
   */
  const BATCH_TYPES = ['put', 'add', 'delete', 'expect'];
  function batchMatches(current, match) {
    if (match === null) return current === undefined;
    if (current === undefined) return false;
    return Object.keys(match).every((k) => JSON.stringify(current[k]) === JSON.stringify(match[k]));
  }
  async function runBatch(ops) {
    if (!Array.isArray(ops) || !ops.length) throw new TypeError('CWDB.batch: нужен непустой массив операций');
    const stores = [];
    ops.forEach((op, i) => {
      if (!op || !STORES[op.store]) throw new TypeError(`CWDB.batch: операция ${i}: неизвестное хранилище`);
      if (BATCH_TYPES.indexOf(op.type) === -1) throw new TypeError(`CWDB.batch: операция ${i}: неизвестный тип`);
      if ((op.type === 'put' || op.type === 'add') && (!op.value || typeof op.value !== 'object' || op.value.id === undefined)) {
        throw new TypeError(`CWDB.batch: операция ${i}: нужна запись с явным id`);
      }
      if ((op.type === 'delete' || op.type === 'expect') && op.key === undefined) throw new TypeError(`CWDB.batch: операция ${i}: нужен key`);
      if (op.type === 'expect' && op.match === undefined) throw new TypeError(`CWDB.batch: операция ${i}: expect без match`);
      if (stores.indexOf(op.store) < 0) stores.push(op.store);
    });
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(stores, 'readwrite');
      let failure = null;
      const fail = (error) => {
        if (!failure) failure = error;
        try { transaction.abort(); } catch (_) { /* уже прерывается */ }
      };
      const step = (i) => {
        if (failure || i >= ops.length) return;
        const op = ops[i];
        const store = transaction.objectStore(op.store);
        const key = op.type === 'put' || op.type === 'add' ? op.value.id : op.key;
        const write = () => {
          let r;
          try {
            if (op.type === 'put') r = store.put(op.value);
            else if (op.type === 'add') r = store.add(op.value);
            else r = store.delete(key);
          } catch (error) { fail(error); return; }
          r.onsuccess = () => step(i + 1);
          r.onerror = () => { failure = failure || r.error; };
        };
        if (op.match === undefined) { write(); return; }
        const g = store.get(key);
        g.onsuccess = () => {
          if (!batchMatches(g.result, op.match)) {
            const error = new Error('cwdb-batch-precondition');
            error.opIndex = i;
            error.store = op.store;
            fail(error);
            return;
          }
          if (op.type === 'expect') step(i + 1); else write();
        };
        g.onerror = () => { failure = failure || g.error; };
      };
      // Только oncomplete — «зафиксировано», а не «запрос принят» (как у mutate).
      transaction.oncomplete = () => resolve(ops.length);
      transaction.onerror = () => reject(failure || transaction.error);
      transaction.onabort = () => reject(failure || transaction.error || new Error('CWDB.batch: транзакция прервана'));
      step(0);
    });
  }

  const CWDB = {
    /**
     * Версия схемы общей базы — ПУБЛИЧНО (28.08.2026).
     *
     * ЗАЧЕМ НАРУЖУ. Механизм резервного копирования открывает ту же базу
     * своими руками и обязан знать потолок: понизить версию IndexedDB
     * невозможно, поэтому база, поднятая восстановлением выше DB_VERSION,
     * перестаёт открываться через CWDB НАВСЕГДА. Данные на диске целы,
     * приложение их больше не видит. До публикации константы shared/backup.js
     * этого потолка не знал и поднимал версию на единицу выше версии из файла
     * копии — см. shared/backup.js, restoreDb().
     *
     * Читать значение, а не дублировать числом: дубль переживёт следующий
     * подъём схемы и будет молча врать.
     */
    DB_VERSION: DB_VERSION,

    /** Общины / собрания. Схема см. в шапке файла — совместима с events[] Клиндария. */
    communities: makeCrud('communities', 'com'),
    /** Люди (контакты, докладчики, служители и т.п.) */
    people: makeCrud('people', 'per'),
    /** Встречи / визиты, привязанные к общинам */
    meetings: makeCrud('meetings', 'mtg'),
    /** Роли / должности, на которые могут ссылаться people */
    roles: makeCrud('roles', 'role'),
    /** Пользовательские версии шаблонов документов. Через CWTemplates, не напрямую. */
    templates: makeCrud('templates', 'tpl'),
    /** Архив выданных документов. Через CWDocs (shared/documents.js), не напрямую. */
    documents: makeCrud('documents', 'doc'),
    /** Состояние модуля одним блобом. Через CWState (shared/state.js), не напрямую. */
    state: makeCrud('state', 'st'),
    /** История снимков состояния. Через CWSnapshots (shared/snapshots.js), не напрямую. */
    snapshots: makeCrud('snapshots', 'snap'),
    /** Журнал: дерево район → собрание → группа. Через CWJournal, не напрямую. */
    journalNodes: makeCrud('journalNodes', 'jn'),
    /** Журнал: универсальные рабочие записи. Через CWJournal, не напрямую. */
    journalEntries: makeCrud('journalEntries', 'je'),
    /** Журнал: типизированные связи по URN. Через CWJournal, не напрямую. */
    journalLinks: makeCrud('journalLinks', 'jl'),
    /** Журнал: служебные записи модуля (схема, в J8 — крипто-материал). */
    journalMeta: makeCrud('journalMeta', 'jm'),

    /** Открыть соединение заранее (например, при загрузке хаба) */
    init: openDb,

    /** Атомарный пакет заранее вычисленных операций (J8). См. runBatch() выше. */
    batch: runBatch,

    /**
     * Импорт из старой структуры events[] (Клиндарий) в communities.
     * Не удаляет существующие данные модуля — только копирует в общий слой.
     *
     * ⚠️ ПЕРЕНОСЯТСЯ ТОЛЬКО ПОЛЯ ИДЕНТИФИКАЦИИ (решение Алекса 16.08.2026).
     * `color`, `schedule`, `visitType`, `formLanguage` НАМЕРЕННО отброшены:
     * это свойства представления собрания в конкретном модуле, а не самого
     * собрания. До 16.08.2026 функция копировала их тоже — и была готовой
     * ловушкой: выглядела штатным путём миграции и при первом же вызове
     * занесла бы в общий слой ровно то, что решено там не держать.
     * Граница и обоснование — docs/db-migration/02-communities-audit.md.
     *
     * Предпочтительный путь — CWDirectory.upsert() (shared/directory.js).
     * Эта функция остаётся как разовый импорт для служебных сценариев.
     *
     * @param {Array} legacyEvents — массив в формате events[] Клиндария
     * @param {string} [moduleId] — кто импортирует; попадёт в sources[]
     */
    async importLegacyCommunities(legacyEvents, moduleId) {
      const results = [];
      for (const ev of legacyEvents || []) {
        // put, а не add: повторный импорт того же набора раньше падал
        // на ConstraintError первой же существующей записи и оставлял
        // общий слой в наполовину импортированном состоянии.
        const id = await CWDB.communities.put({
          id: ev.id,
          name: ev.name || '',
          congNumber: ev.congNumber || '',
          address: ev.address || '',
          contactName: ev.contactName || '',
          contactPhone: ev.contactPhone || '',
          contactEmail: ev.contactEmail || '',
          contactNote: ev.contactNote || '',
          lat: typeof ev.lat === 'number' ? ev.lat : null,
          lng: typeof ev.lng === 'number' ? ev.lng : null,
          sources: moduleId ? [moduleId] : [],
        });
        results.push(id);
      }
      return results;
    },
  };

  global.CWDB = CWDB;
})(typeof self !== 'undefined' ? self : globalThis);
