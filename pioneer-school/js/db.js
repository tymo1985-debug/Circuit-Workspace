// db.js — единая точка доступа к IndexedDB для всего приложения
// Хранилища (object stores) соответствуют сущностям из ER-диаграммы.

const DB_NAME = 'pioneer-school-db';
const DB_VERSION = 2; // v2: добавлено хранилище 'registrations' (формуляр регистрации)

const STORES = [
  'meta',            // ключ-значение: school info, assignment, version
  'substitutes',     // заместители преподавателей (из S-257)
  'students',        // учащиеся / пионеры
  'classes',         // классы (если школа делится на несколько классов)
  'textbookOrder',   // расчёт и учёт заказа учебников
  'lessons',          // 18 уроков — расписание, буква, видео/чтение
  'practicalSessions', // 4 практических занятия
  'dailyReviews',    // повторение за день (5 записей)
  'afterSchool',     // S-253: notAttended[] / attendedOffList[]
  'documents',       // метаданные загруженных документов (S-257, S-256 и т.д.)
  'registrations'    // заполненные формуляры регистрации учащихся (register.html)
];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          if (name === 'meta') {
            db.createObjectStore(name, { keyPath: 'key' });
          } else {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
      });
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      // Освобождаем соединение, если другая вкладка запросит обновление схемы,
      // иначе она навсегда зависает в onblocked.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = (e) => {
      // Без сброса кэшированного промиса одна неудачная попытка открыть базу
      // делала всё приложение нерабочим до перезагрузки страницы.
      dbPromise = null;
      reject(e.target.error);
    };
    req.onblocked = () => console.warn(T('ps.db.obnovlenie_shemy_bazy_zablokirovano'));
  });
  return dbPromise.catch((error) => { dbPromise = null; throw error; });
}

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function tx(storeName, mode) {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

const DB = {
  uid,

  async getMeta(key, fallback = null) {
    const store = await tx('meta', 'readonly');
    return new Promise((resolve) => {
      const r = store.get(key);
      r.onsuccess = () => resolve(r.result ? r.result.value : fallback);
      r.onerror = () => resolve(fallback);
    });
  },

  async setMeta(key, value) {
    const store = await tx('meta', 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.put({ key, value, updatedAt: new Date().toISOString() });
      r.onsuccess = () => resolve(value);
      r.onerror = () => reject(r.error);
    });
  },

  async list(storeName) {
    const store = await tx(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  },

  async get(storeName, id) {
    const store = await tx(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const r = store.get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  },

  async put(storeName, obj) {
    if (!obj.id) obj.id = uid();
    obj.updatedAt = new Date().toISOString();
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.put(obj);
      r.onsuccess = () => resolve(obj);
      r.onerror = () => reject(r.error);
    });
  },

  async remove(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.delete(id);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  },

  async clearStore(storeName) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.clear();
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  },

  // Полный экспорт всей базы в один JSON-объект (резервная копия)
  async exportAll() {
    const dump = {};
    for (const s of STORES) {
      dump[s] = await this.list(s);
    }
    dump._exportedAt = new Date().toISOString();
    // Раньше здесь стояла жёсткая единица, хотя схема базы уже была версии 2 —
    // файл резервной копии сообщал о себе неверную версию.
    dump._version = DB_VERSION;
    return dump;
  },

  // Полное восстановление из JSON (перезаписывает существующие хранилища)
  async importAll(dump) {
    if (!dump || typeof dump !== 'object' || Array.isArray(dump)) {
      throw new Error(T('ps.db.fayl_ne_pohozh_na'));
    }
    const known = STORES.filter((s) => Array.isArray(dump[s]));
    if (!known.length) {
      throw new Error(T('ps.db.v_fayle_net_ni'));
    }
    const db = await openDB();
    for (const s of known) {
      // Раньше записи ставились в очередь через store.put() без ожидания
      // завершения транзакции, поэтому importAll резолвился ДО того, как данные
      // реально попадали в базу: следующий за импортом рендер читал старое
      // состояние, а ошибки записи терялись молча.
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(s, 'readwrite');
        const store = transaction.objectStore(s);
        store.clear();
        for (const item of dump[s]) {
          if (item && typeof item === 'object') store.put(item);
        }
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error(T('ps.db.import_store_failed', { store: s })));
      });
    }
    return true;
  },

  STORES
};

window.DB = DB;
