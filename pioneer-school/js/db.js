// db.js — единая точка доступа к IndexedDB для всего приложения
// Хранилища (object stores) соответствуют сущностям из ER-диаграммы.

const DB_NAME = 'pioneer-school-db';
const DB_VERSION = 2; // v2: добавлено хранилище 'registrations' (формуляр регистрации).
// Ф1 (школы) схему НЕ меняет — см. «ШКОЛЫ» ниже. Поднимать версию нельзя без
// сверки с потолком версии в shared/backup.js.

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

/* ---------- ШКОЛЫ (Ф1, 14.11.2026) ----------

   В году несколько школ, ПОСЛЕДОВАТЕЛЬНО, у каждой свой язык. Каждая запись
   модуля принадлежит ровно одной школе.

   КАК ПРИВЯЗАНО. Схема базы НЕ меняется (версия остаётся 2): ключ записи
   получает префикс школы — `<schoolId>|<id>`, в самой записи лежит `schoolId`.
   Почему не новое хранилище и не индекс: подъём версии базы модуля ломает
   восстановление копий хаба между версиями (потолок версии, shared/backup.js),
   а у двух хранилищ ключи фиксированные (`textbookOrder` 'main', `lessons` по
   ключу урока) — без префикса вторая школа перезаписала бы первую.

   Слой ПРОЗРАЧНЫЙ: модули по-прежнему зовут DB.list/get/put/remove/getMeta с
   «короткими» id и работают внутри выбранной школы, ничего о школах не зная.
   Наружу id отдаётся без префикса.

   Глобальное (не принадлежит школе): реестр школ, выбранная школа, набор
   столбцов учащихся и выбор столбцов экспорта — `GLOBAL_META`.

   ПЕРЕХОД. Запись без префикса — наследие одной школы: текущие данные при
   первом запуске, СТАРАЯ копия при восстановлении (своя кнопка модуля или
   копия хаба — обе пишут записи как есть). Такие записи при открытии базы
   переезжают в «Школу 1» (ensureSchools). Шаг идемпотентен: повторный запуск
   ничего не меняет.

   Завершённая школа — только чтение: запись в неё отклоняется здесь же,
   ошибкой с code = 'PS_READONLY' (интерфейс дополнительно гасит поля). */
const SCOPE_SEP = '|';
const SCOPED_STORES = STORES.filter((name) => name !== 'meta');
const GLOBAL_META = ['schools', 'currentSchoolId', 'studentColumns', 'studentExportColumns'];
const scope = { schools: [], currentId: null };

function isGlobalMeta(key) { return GLOBAL_META.includes(key); }
function physicalKey(schoolId, id) { return schoolId + SCOPE_SEP + id; }
function schoolRange(schoolId) { return IDBKeyRange.bound(schoolId + SCOPE_SEP, schoolId + SCOPE_SEP + '￿'); }
function isScopedKey(key) { return typeof key === 'string' && key.indexOf(SCOPE_SEP) > 0; }
function logicalId(key) {
  const s = String(key);
  const i = s.indexOf(SCOPE_SEP);
  return i > 0 ? s.slice(i + 1) : s;
}
function toLogical(record) {
  if (!record || typeof record !== 'object') return record || null;
  return { ...record, id: logicalId(record.id) };
}
function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('transaction aborted'));
  });
}
function schoolOrder(a, b) {
  return (a.year || 0) - (b.year || 0) || (a.number || 0) - (b.number || 0)
    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}
function defaultSchoolLanguage() {
  try {
    if (typeof PSDocLang !== 'undefined' && typeof PSDocLang.get === 'function') return PSDocLang.get() || 'ru';
  } catch (e) { /* язык документа ещё не поднят */ }
  return 'ru';
}
function newSchool(number, language) {
  const now = new Date();
  return {
    id: 'school-' + now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    number,
    year: now.getFullYear(),
    language: language || defaultSchoolLanguage(),
    stage: 1,
    completed: false,
    createdAt: now.toISOString(),
    completedAt: null
  };
}

/* Реестр школ и перенос наследия. Две транзакции намеренно: чтение целиком,
   затем запись целиком — без await внутри транзакции (старый Safari закрывает
   её на первом же микротаске). */
async function ensureSchools(db) {
  const rt = db.transaction(STORES, 'readonly');
  const metaStore = rt.objectStore('meta');
  const [schoolsRec, currentRec, metaKeys, ...storeKeys] = await Promise.all([
    reqP(metaStore.get('schools')),
    reqP(metaStore.get('currentSchoolId')),
    reqP(metaStore.getAllKeys()),
    ...SCOPED_STORES.map((name) => reqP(rt.objectStore(name).getAllKeys()))
  ]);

  let schools = (schoolsRec && Array.isArray(schoolsRec.value) ? schoolsRec.value : [])
    .filter((s) => s && s.id).sort(schoolOrder);
  let currentId = currentRec ? currentRec.value : null;
  let registryChanged = false;

  const legacyMeta = metaKeys.filter((k) => !isScopedKey(k) && !isGlobalMeta(k));
  const legacyStores = SCOPED_STORES.filter((name, i) => storeKeys[i].some((k) => !isScopedKey(k)));

  if (!schools.length) {
    schools = [newSchool(1)];
    registryChanged = true;
  }

  if (legacyMeta.length || legacyStores.length) {
    const target = (schools.find((s) => s.number === 1) || schools[0]).id;
    const rt2 = db.transaction(['meta', ...legacyStores], 'readonly');
    const [metaRows, ...storeRows] = await Promise.all([
      Promise.all(legacyMeta.map((k) => reqP(rt2.objectStore('meta').get(k)))),
      ...legacyStores.map((name) => reqP(rt2.objectStore(name).getAll()))
    ]);
    const wt = db.transaction(['meta', ...legacyStores], 'readwrite');
    const meta = wt.objectStore('meta');
    metaRows.forEach((row, i) => {
      meta.delete(legacyMeta[i]);
      if (row) meta.put({ ...row, key: physicalKey(target, legacyMeta[i]) });
    });
    legacyStores.forEach((name, i) => {
      const store = wt.objectStore(name);
      (storeRows[i] || []).forEach((row) => {
        if (!row || isScopedKey(row.id)) return;
        store.delete(row.id);
        store.put({ ...row, id: physicalKey(target, row.id), schoolId: target });
      });
    });
    await txDone(wt);
  }

  if (!schools.some((s) => s.id === currentId)) {
    const open = schools.filter((s) => !s.completed);
    currentId = (open[open.length - 1] || schools[schools.length - 1]).id;
    registryChanged = true;
  }

  if (registryChanged) {
    const wt = db.transaction('meta', 'readwrite');
    const now = new Date().toISOString();
    wt.objectStore('meta').put({ key: 'schools', value: schools, updatedAt: now });
    wt.objectStore('meta').put({ key: 'currentSchoolId', value: currentId, updatedAt: now });
    await txDone(wt);
  }

  scope.schools = schools;
  scope.currentId = currentId;
}

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
  }).then(async (db) => { await ensureSchools(db); return db; });
  return dbPromise.catch((error) => { dbPromise = null; throw error; });
}

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function tx(storeName, mode) {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function isSchoolReadOnly(schoolId) {
  const school = scope.schools.find((s) => s.id === schoolId);
  return !!(school && school.completed);
}

function assertWritable(schoolId) {
  if (!isSchoolReadOnly(schoolId)) return;
  const error = new Error(T('ps.school.readonly_error'));
  error.code = 'PS_READONLY';
  throw error;
}

async function rawList(storeName) {
  const store = await tx(storeName, 'readonly');
  return reqP(store.getAll()).then((rows) => rows || []);
}

async function rawPutMeta(key, value) {
  const store = await tx('meta', 'readwrite');
  return reqP(store.put({ key, value, updatedAt: new Date().toISOString() }));
}

// Набор операций над одной школой. DB — над выбранной, DB.inSchool(id) — над
// любой (повторное приглашение пишет в другую школу, чем открыта на экране).
function scopedApi(getSchoolId) {
  return {
    async getMeta(key, fallback = null) {
      const store = await tx('meta', 'readonly');
      const k = isGlobalMeta(key) ? key : physicalKey(getSchoolId(), key);
      return new Promise((resolve) => {
        const r = store.get(k);
        r.onsuccess = () => resolve(r.result ? r.result.value : fallback);
        r.onerror = () => resolve(fallback);
      });
    },

    async setMeta(key, value) {
      await openDB();
      const global = isGlobalMeta(key);
      if (!global) assertWritable(getSchoolId());
      const store = await tx('meta', 'readwrite');
      const k = global ? key : physicalKey(getSchoolId(), key);
      return new Promise((resolve, reject) => {
        const r = store.put({ key: k, value, updatedAt: new Date().toISOString() });
        r.onsuccess = () => resolve(value);
        r.onerror = () => reject(r.error);
      });
    },

    async list(storeName) {
      if (storeName === 'meta') return rawList('meta');
      const store = await tx(storeName, 'readonly');
      return new Promise((resolve, reject) => {
        const r = store.getAll(schoolRange(getSchoolId()));
        r.onsuccess = () => resolve((r.result || []).map(toLogical));
        r.onerror = () => reject(r.error);
      });
    },

    async get(storeName, id) {
      const store = await tx(storeName, 'readonly');
      return new Promise((resolve, reject) => {
        const r = store.get(physicalKey(getSchoolId(), id));
        r.onsuccess = () => resolve(toLogical(r.result));
        r.onerror = () => reject(r.error);
      });
    },

    async put(storeName, obj) {
      await openDB();
      const schoolId = getSchoolId();
      assertWritable(schoolId);
      if (!obj.id) obj.id = uid();
      obj.id = logicalId(obj.id);
      obj.updatedAt = new Date().toISOString();
      obj.schoolId = schoolId;
      const store = await tx(storeName, 'readwrite');
      return new Promise((resolve, reject) => {
        const r = store.put({ ...obj, id: physicalKey(schoolId, obj.id) });
        r.onsuccess = () => resolve(obj);
        r.onerror = () => reject(r.error);
      });
    },

    async remove(storeName, id) {
      await openDB();
      const schoolId = getSchoolId();
      assertWritable(schoolId);
      const store = await tx(storeName, 'readwrite');
      return new Promise((resolve, reject) => {
        const r = store.delete(physicalKey(schoolId, id));
        r.onsuccess = () => resolve(true);
        r.onerror = () => reject(r.error);
      });
    },

    // Очищает хранилище ТОЛЬКО выбранной школы — соседние школы не трогаются.
    async clearStore(storeName) {
      await openDB();
      const schoolId = getSchoolId();
      assertWritable(schoolId);
      const store = await tx(storeName, 'readwrite');
      return new Promise((resolve, reject) => {
        const r = store.delete(schoolRange(schoolId));
        r.onsuccess = () => resolve(true);
        r.onerror = () => reject(r.error);
      });
    }
  };
}

const DB = {
  uid,

  ...scopedApi(() => scope.currentId),

  inSchool(schoolId) { return scopedApi(() => schoolId); },

  // ---------- Реестр школ ----------
  async ready() { await openDB(); return true; },
  schools() { return scope.schools.map((s) => ({ ...s })); },
  currentSchool() {
    const school = scope.schools.find((s) => s.id === scope.currentId);
    return school ? { ...school } : null;
  },
  isReadOnly(schoolId) { return isSchoolReadOnly(schoolId || scope.currentId); },

  async saveSchools(list) {
    await openDB();
    const clean = list.map((s) => ({ ...s })).sort(schoolOrder);
    await rawPutMeta('schools', clean);
    scope.schools = clean;
    return this.schools();
  },

  async setCurrentSchool(schoolId) {
    await openDB();
    if (!scope.schools.some((s) => s.id === schoolId)) throw new Error('unknown school: ' + schoolId);
    await rawPutMeta('currentSchoolId', schoolId);
    scope.currentId = schoolId;
    return this.currentSchool();
  },

  // Полный экспорт всей базы в один JSON-объект (резервная копия): ВСЕ школы,
  // ключи как в базе (с префиксом школы), реестр школ — в meta.
  async exportAll() {
    const dump = {};
    for (const s of STORES) {
      dump[s] = await rawList(s);
    }
    dump._exportedAt = new Date().toISOString();
    // Раньше здесь стояла жёсткая единица, хотя схема базы уже была версии 2 —
    // файл резервной копии сообщал о себе неверную версию.
    dump._version = DB_VERSION;
    // Ключи записей несут префикс школы (Ф1). В копиях до Ф1 метки нет — их
    // записи при восстановлении переезжают в «Школу 1» (ensureSchools).
    dump._scoped = 1;
    return dump;
  },

  // Полное восстановление из JSON (перезаписывает существующие хранилища).
  // Старая копия (одна школа, ключи без префикса) после записи переводится в
  // «Школу 1» тем же шагом, что и данные при первом запуске.
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
    await ensureSchools(db);
    return true;
  },

  STORES,
  SCOPE_SEP
};

window.DB = DB;
