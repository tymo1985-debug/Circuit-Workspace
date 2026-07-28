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
 * Пример использования:
 *   const all = await CWDB.communities.getAll();
 *   const id = await CWDB.communities.add({ name: 'Общ. Центр', address: '...' });
 *   await CWDB.communities.update(id, { phone: '+48...' });
 *   await CWDB.communities.remove(id);
 */
(function (global) {
  'use strict';

  const DB_NAME = 'circuit-workspace-db';
  const DB_VERSION = 1;

  /** Схема хранилищ: имя store → keyPath + индексы */
  const STORES = {
    communities: { keyPath: 'id', indexes: ['name', 'congNumber'] },
    people:      { keyPath: 'id', indexes: ['name', 'role', 'communityId'] },
    meetings:    { keyPath: 'id', indexes: ['communityId', 'start'] },
    roles:       { keyPath: 'id', indexes: ['name'] },
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

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => console.warn('CWDB: upgrade blocked — close other tabs of this app.');
    });
    return dbPromise;
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

      /** Добавить запись; если record.id не задан — генерируется автоматически. Возвращает id. */
      async add(record) {
        const store = await tx(storeName, 'readwrite');
        const payload = { id: record.id || uid(idPrefix), ...record };
        await promisifyRequest(store.add(payload));
        return payload.id;
      },

      /** Частично обновить запись по id (merge). Бросает ошибку, если записи нет. */
      async update(id, patch) {
        const store = await tx(storeName, 'readwrite');
        const current = await promisifyRequest(store.get(id));
        if (!current) throw new Error(`CWDB.${storeName}.update: record ${id} not found`);
        const merged = { ...current, ...patch, id };
        await promisifyRequest(store.put(merged));
        return merged;
      },

      /** Полностью заменить запись (put), либо создать, если не было. */
      async put(record) {
        const store = await tx(storeName, 'readwrite');
        const payload = { id: record.id || uid(idPrefix), ...record };
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
        const id = await CWDB.communities.add({
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
})(window);
