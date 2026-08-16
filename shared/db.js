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
  const DB_VERSION = 5;

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

  const CWDB = {
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

    /** Открыть соединение заранее (например, при загрузке хаба) */
    init: openDb,

    /**
     * Импорт из старой структуры events[] (Клиндарий) в communities.
     * Не удаляет существующие данные модуля — только копирует в общий слой.
     * @param {Array} legacyEvents — массив в формате events[] Клиндария
     */
    async importLegacyCommunities(legacyEvents) {
      const results = [];
      for (const ev of legacyEvents || []) {
        // put, а не add: повторный импорт того же набора раньше падал
        // на ConstraintError первой же существующей записи и оставлял
        // общий слой в наполовину импортированном состоянии.
        const id = await CWDB.communities.put({
          id: ev.id,
          name: ev.name || '',
          color: ev.color || '',
          address: ev.address || '',
          schedule: ev.schedule || '',
          visitType: ev.visitType || '',
          contactName: ev.contactName || '',
          contactPhone: ev.contactPhone || '',
          contactEmail: ev.contactEmail || '',
          contactNote: ev.contactNote || '',
          congNumber: ev.congNumber || '',
          lat: typeof ev.lat === 'number' ? ev.lat : null,
          lng: typeof ev.lng === 'number' ? ev.lng : null,
          formLanguage: ev.formLanguage || '',
        });
        results.push(id);
      }
      return results;
    },
  };

  global.CWDB = CWDB;
})(typeof self !== 'undefined' ? self : globalThis);
