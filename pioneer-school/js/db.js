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
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
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
    dump._version = 1;
    return dump;
  },

  // Полное восстановление из JSON (перезаписывает существующие хранилища)
  async importAll(dump) {
    for (const s of STORES) {
      if (!dump[s]) continue;
      await this.clearStore(s);
      const store = await tx(s, 'readwrite');
      for (const item of dump[s]) {
        store.put(item);
      }
    }
    return true;
  },

  STORES
};

window.DB = DB;
