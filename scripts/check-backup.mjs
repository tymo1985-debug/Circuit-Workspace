#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-backup.mjs
 *
 * Проверяет резервное копирование: что копия модуля везёт с собой те части
 * общего слоя, без которых её данные неполны, и что её восстановление
 * СЛИВАЕТ общий слой, а не заменяет его.
 *
 * ПОЧЕМУ ЭТА ПРОВЕРКА ЗДЕСЬ, хотя правило отбора в check-all.mjs говорит
 * «только то, что уже ломалось повторно». Это осознанное исключение, и вот
 * основание. Ошибка в этой области необратима: пользователь узнаёт о ней в
 * момент, когда восстанавливается после потери устройства, то есть когда
 * исправлять уже нечего. При этом ошибка бесшумна — копия сохраняется, файл
 * скачивается, никакого сообщения нет. Так и была устроена та, что нашлась
 * 12.08.2026: копия модуля не включала `cw-sender`, и восстановление на чистом
 * устройстве давало письма с пустой шапкой.
 *
 * Второе основание — реестр MODULES будет пополняться. Фаза 2 общего слоя
 * документов добавит туда хранилище `templates`, новые модули добавят себя.
 * Забыть объявить зависимость легко, а последствие — та же тихая потеря.
 * Поэтому проверка следит и за самим реестром: каждый модуль обязан ЯВНО
 * сказать, что ему нужно от общего слоя, пусть даже «ничего».
 *
 * Если решишь, что проверка лишняя — убери запись из CHECKS в check-all.mjs.
 *
 *   node scripts/check-backup.mjs
 *
 * Требует fake-indexeddb: npm install fake-indexeddb
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = 'circuit-workspace-db';

/* --- Окружение браузера, которого нет в Node ---------------------------- */
globalThis.self = globalThis;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = {};

/* shared/db.js подгружается ради ОДНОЙ константы — DB_VERSION общей базы.
   Читать её из живого файла, а не дублировать числом здесь: иначе проверка
   начнёт подтверждать саму себя и переживёт следующий подъём схемы. */
eval(readFileSync(join(ROOT, 'shared/db.js'), 'utf8'));
eval(readFileSync(join(ROOT, 'shared/backup.js'), 'utf8'));

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

/* --- Помощники IndexedDB ------------------------------------------------ */
const open = (name, version, build) => new Promise((res, rej) => {
  const r = indexedDB.open(name, version);
  if (build) r.onupgradeneeded = () => build(r.result);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const put = (db, store, rows) => new Promise((res, rej) => {
  const tx = db.transaction([store], 'readwrite');
  rows.forEach((row) => tx.objectStore(store).put(row));
  tx.oncomplete = res;
  tx.onerror = () => rej(tx.error);
});
const wipe = (name) => new Promise((res, rej) => {
  const r = indexedDB.deleteDatabase(name);
  r.onsuccess = () => res();
  r.onerror = () => rej(r.error);
  /* Соединение CWDB освобождается его же обработчиком onversionchange —
     если этого не случилось, молчать нельзя: следующий сценарий пойдёт по
     непочищенной базе и «пройдёт» по чужим данным. */
  r.onblocked = () => rej(new Error('deleteDatabase заблокирован: ' + name));
});
/* Открывается ли база ИМЕННО ТОЙ версией, которой её открывает рабочий код.
   Возвращает имя ошибки, а не bool: VersionError и любую другую надо различать. */
const opensAt = (name, version) => new Promise((res) => {
  const r = indexedDB.open(name, version);
  r.onsuccess = () => { r.result.close(); res('открылась'); };
  r.onerror = () => res((r.error && r.error.name) || 'ошибка');
  r.onblocked = () => res('blocked');
});
const versionOf = (name) => new Promise((res, rej) => {
  const r = indexedDB.open(name);
  r.onsuccess = () => { const v = r.result.version; r.result.close(); res(v); };
  r.onerror = () => rej(r.error);
});
/* Файл копии вокруг одной секции IndexedDB — минимум, который принимает restore(). */
const wrap = (sectionId, dbName, dump) => ({
  format: CWBackup.FORMAT,
  formatVersion: CWBackup.FORMAT_VERSION,
  scope: 'full',
  createdAt: new Date().toISOString(),
  app: { hub: '0.0.0', modules: {} },
  modules: [],
  sections: { [sectionId]: { local: {}, idb: { [dbName]: dump } } },
});
const store = (rowsIn, indexes) => ({ keyPath: 'id', autoIncrement: false, indexes: indexes || [], rows: rowsIn });

const rows = (name, store) => new Promise((res, rej) => {
  const r = indexedDB.open(name);
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains(store)) { db.close(); return res([]); }
    const q = db.transaction([store]).objectStore(store).getAll();
    q.onsuccess = () => { db.close(); res(q.result); };
    q.onerror = () => rej(q.error);
  };
  r.onerror = () => rej(r.error);
});

/* --- 1. Реестр: каждый модуль объявил зависимости явно ------------------- */
console.log('\nРеестр модулей');
Object.keys(CWBackup.MODULES).forEach((id) => {
  const entry = CWBackup.MODULES[id];
  ok(id + ': объявлены зависимости от общего слоя',
    Array.isArray(entry.sharedLocal) && entry.sharedStores && typeof entry.sharedStores === 'object',
    'нужны поля sharedLocal (массив) и sharedStores (объект), пусть и пустые');
});

/* --- 2. Сценарий: копия модуля и её восстановление ----------------------- */
console.log('\nКопия модуля');

/* Общая база с данными ДВУХ модулей: так проверяется, что чужое уцелеет. */
let db = await open(DB, 1, (d) => {
  d.createObjectStore('templates', { keyPath: 'id' });
  d.createObjectStore('communities', { keyPath: 'id' });
  d.createObjectStore('state', { keyPath: 'id' });
  d.createObjectStore('snapshots', { keyPath: 'id' });
});
await put(db, 'templates', [
  { id: 'tpl_own', body: 'шаблон проверяемого модуля' },
  { id: 'tpl_neighbour', body: 'шаблон соседнего модуля' },
]);
await put(db, 'communities', [{ id: 'c1', name: 'Тестовое собрание' }]);
/* Состояние ДВУХ модулей в одном хранилище: ключ записи здесь — идентификатор
   модуля, поэтому выгрузка хранилища целиком означала бы, что копия одного
   модуля везёт состояние соседа и при восстановлении кладёт его поверх
   актуального. Слияние по ключу тут не спасает — оно и есть механизм затирания. */
await put(db, 'state', [
  { id: 'own-module', payload: '{"свой":1}', savedAt: 1 },
  { id: 'neighbour-module', payload: '{"соседний":1}', savedAt: 1 },
]);
/* Снимки истории (фаза 4): хранилище общее, ключ вида `<module>:<uid>`.
   Перечислить записи поимённо, как у `state`, здесь нельзя — они появляются и
   исчезают, — поэтому отбор идёт по префиксу ключа. Проверяется то же самое:
   в копию модуля не должно попасть чужое. Затирания тут не боятся (ключи не
   пересекаются), боятся веса и содержимого: снимок — это полное состояние
   модуля, а файл копии пользователь пересылает почтой. */
await put(db, 'snapshots', [
  { id: 'own-module:s1', module: 'own-module', at: 1, payload: '{"своя история":1}' },
  { id: 'neighbour-module:s1', module: 'neighbour-module', at: 1, payload: '{"чужая история":1}' },
]);
db.close();

/* Берём первый модуль, которому реально что-то нужно от общего слоя. */
const subject = Object.keys(CWBackup.MODULES).find((id) => (CWBackup.MODULES[id].sharedLocal || []).length);
if (!subject) {
  console.log('  ! ни один модуль не объявил зависимости — сценарий пропущен');
} else {
  /* Хранилище общей базы подмешиваем на время проверки: пока ни один модуль
     от неё не зависит, но фаза 2 это изменит, и механизм должен работать
     заранее, а не «когда понадобится». */
  CWBackup.MODULES[subject].sharedStores = { [DB]: ['templates', { store: 'state', ids: ['own-module'] }, { store: 'snapshots', prefix: 'own-module:' }] };

  mem.set('cw-sender', JSON.stringify({ name: 'Тест Тестович' }));
  mem.set('cw-lang', 'pl');

  const snap = await CWBackup.snapshot([subject]);
  const shared = snap.sections.shared || {};
  ok(subject + ': копия модуля включает общий слой', !!snap.sections.shared);
  ok('секция помечена частичной (partial)', shared.partial === true);
  ok('объявленные ключи попали в копию',
    (CWBackup.MODULES[subject].sharedLocal || []).every((k) => shared.local && shared.local[k] !== undefined));
  ok('глобальный язык хаба НЕ захвачен', !shared.local || shared.local['cw-lang'] === undefined);
  ok('объявленное хранилище попало в копию', (shared.idb?.[DB]?.stores?.templates?.rows || []).length === 2);
  ok('необъявленное хранилище НЕ попало', !shared.idb?.[DB]?.stores?.communities);
  const stateRows = shared.idb?.[DB]?.stores?.state?.rows || [];
  ok('адресное хранилище: своя запись в копии', stateRows.some((r) => r.id === 'own-module'));
  ok('адресное хранилище: ЧУЖОЙ записи в копии нет', !stateRows.some((r) => r.id === 'neighbour-module'),
    'ключ записи здесь — модуль, и чужая строка при восстановлении затёрла бы его состояние целиком');

  const snapRows = shared.idb?.[DB]?.stores?.snapshots?.rows || [];
  ok('отбор по префиксу: свои снимки в копии', snapRows.some((r) => r.id === 'own-module:s1'));
  ok('отбор по префиксу: ЧУЖИХ снимков в копии нет', !snapRows.some((r) => r.id === 'neighbour-module:s1'),
    'снимок — это полное состояние модуля; без отбора копия увозила бы чужие данные в файле, который уходит почтой');

  /* Портим состояние и восстанавливаем: сосед обязан уцелеть. */
  mem.set('cw-sender', JSON.stringify({ name: 'испорчено' }));
  /* Без указания версии: восстановление заводит схему общей базы штатным путём
     (CWDB.init), поэтому база законно стоит на DB_VERSION, а не на единице. */
  db = await open(DB);
  await put(db, 'templates', [{ id: 'tpl_own', body: 'испорчено' }, { id: 'tpl_late', body: 'появился позже копии' }]);
  /* Сосед поработал уже ПОСЛЕ того, как сделана копия. Восстановление копии
     проверяемого модуля не должно откатить его состояние. */
  await put(db, 'state', [{ id: 'neighbour-module', payload: '{"новее копии":1}', savedAt: 2 }]);
  db.close();

  await CWBackup.restore(snap);
  console.log('\nВосстановление копии модуля');
  ok('свои данные восстановлены', JSON.parse(mem.get('cw-sender')).name === 'Тест Тестович');
  ok('глобальный язык хаба не тронут', mem.get('cw-lang') === 'pl');
  const t = Object.fromEntries((await rows(DB, 'templates')).map((r) => [r.id, r]));
  ok('своё хранилище восстановлено', t.tpl_own?.body === 'шаблон проверяемого модуля');
  ok('ЧУЖИЕ записи уцелели', !!t.tpl_neighbour && !!t.tpl_late,
    'восстановление копии одного модуля не имеет права стирать данные соседей');
  ok('необъявленное хранилище уцелело', (await rows(DB, 'communities')).length === 1);
  const st = Object.fromEntries((await rows(DB, 'state')).map((r) => [r.id, r]));
  ok('состояние соседнего модуля не тронуто восстановлением', st['neighbour-module']?.payload === '{"новее копии":1}',
    'копия одного модуля не имеет права откатывать состояние другого');
  const sn = Object.fromEntries((await rows(DB, 'snapshots')).map((r) => [r.id, r]));
  ok('снимки соседнего модуля уцелели', !!sn['neighbour-module:s1'],
    'слияние восстанавливает свои записи и не трогает чужие ключи');
}

/* --- 3. Полная копия хаба по-прежнему заменяет целиком ------------------- */
console.log('\nПолная копия хаба');
const full = await CWBackup.snapshot();
ok('без пометки partial', full.sections.shared.partial === undefined);
ok('берёт общую базу целиком', !!full.sections.shared.idb?.[DB]?.stores?.communities);
db = await open(DB);
await put(db, 'templates', [{ id: 'tpl_stale', body: 'мусор' }]);
db.close();
await CWBackup.restore(full);
ok('восстановление убирает лишние записи', !(await rows(DB, 'templates')).some((r) => r.id === 'tpl_stale'));

/* --- 4. Версия формата -------------------------------------------------- */
console.log('\nФормат файла');
ok('формат не ниже 2 — частичная секция требует нового номера', CWBackup.FORMAT_VERSION >= 2,
  'иначе прежний код примет файл и сотрёт ключи, которых в частичной секции нет');
ok('файлы прежнего формата всё ещё читаются', CWBackup.inspect({ ...full, formatVersion: 1 }).ok);

/* --- 5. Потолок версии базы при восстановлении (C-1) --------------------
 *
 * ПОЧЕМУ ЭТО ПРОВЕРЯЕТСЯ. Понизить версию IndexedDB невозможно. Если
 * восстановление откроет базу версией выше той, которой её открывает рабочий
 * код, то рабочий код получит VersionError НАВСЕГДА: данные на диске целы, а
 * приложение их больше не видит. Пользователь встречает этот отказ ровно
 * тогда, когда восстанавливается после потери устройства.
 *
 * Три сценария ниже воспроизведены на fake-indexeddb и падали на коде до
 * 28.08.2026: версия вычислялась как `max(current, dump.version) + (missing?1:0)`,
 * то есть копия со схемой 5 поднимала базу до 6 при DB_VERSION = 5.
 */
console.log('\nПотолок версии базы');

const SCHEMA = CWDB && CWDB.DB_VERSION;
ok('shared/db.js публикует DB_VERSION наружу', typeof SCHEMA === 'number' && SCHEMA >= 1,
  'без публичной константы механизм копирования не знает, выше какой отметки поднимать базу нельзя');

const SCHOOL = 'pioneer-school-db';

/* 5.1. База устройства СТАРЕЕ копии. Копия снята на устройстве со схемой
   DB_VERSION, у восстанавливающего база отстала (кэш-фёрст service worker мог
   оставить старый shared/db.js). После восстановления база обязана открываться
   той версией, которой её открывает CWDB. */
await wipe(DB);
let d = await open(DB, 3, (x) => {
  x.createObjectStore('templates', { keyPath: 'id' });
  x.createObjectStore('communities', { keyPath: 'id' });
});
d.close();
await CWBackup.restore(wrap('shared', DB, {
  version: SCHEMA,
  stores: {
    templates: store([{ id: 'tpl_from_copy', body: 'из копии' }]),
    /* Хранилища нет в базе устройства — именно эта ветка и поднимала версию. */
    snapshots: store([{ id: 'own:s1', module: 'own', at: 1 }],
      [{ name: 'module', keyPath: 'module', unique: false }]),
  },
}));
ok('база старее копии: после восстановления открывается версией CWDB',
  await opensAt(DB, SCHEMA) === 'открылась',
  'версия базы превысила DB_VERSION — CWDB больше не откроет её никогда');
ok('база старее копии: данные из копии на месте',
  (await rows(DB, 'templates')).some((r) => r.id === 'tpl_from_copy'));
ok('база старее копии: недостающее хранилище создано',
  (await rows(DB, 'snapshots')).some((r) => r.id === 'own:s1'));

/* 5.2. То же для базы модуля. Её версию общий слой не знает (она объявлена в
   pioneer-school/js/db.js), поэтому потолок здесь берётся из самой копии:
   выше схемы, на которой копия снята, подниматься незачем.
   Исходное состояние — «призрачная» база v1 без хранилищ: ровно такую создаёт
   openExisting(), когда копию хаба снимают на устройстве, где Школу ни разу
   не открывали. */
await wipe(SCHOOL);
d = await open(SCHOOL);
d.close();
await CWBackup.restore(wrap('pioneer-school', SCHOOL, {
  version: 2,
  stores: { students: store([{ id: 's1', name: 'Учащийся' }]) },
}));
ok('база модуля: открывается собственной версией модуля после восстановления',
  await opensAt(SCHOOL, 2) === 'открылась',
  'pioneer-school/js/db.js открывает базу версией 2 — подняв её выше, восстановление убивает модуль');
ok('база модуля: данные восстановлены', (await rows(SCHOOL, 'students')).length === 1);

/* 5.3. Копия содержит хранилище, которого нет в схеме приложения. Создать его
   можно только подняв версию выше DB_VERSION — то есть сломав базу. Механизм
   обязан отказаться ДО того, как что-либо изменено, и назвать причину. */
await wipe(DB);
d = await open(DB, SCHEMA, (x) => { x.createObjectStore('templates', { keyPath: 'id' }); });
await put(d, 'templates', [{ id: 'keep', body: 'было до восстановления' }]);
d.close();
let refusal = null;
try {
  await CWBackup.restore(wrap('shared', DB, {
    version: SCHEMA,
    stores: {
      templates: store([{ id: 'tpl_from_copy', body: 'из копии' }]),
      futureStore: store([{ id: 'f1' }]),
    },
  }));
} catch (e) { refusal = e && e.message; }
ok('копия с неизвестным хранилищем отклонена внятной причиной',
  refusal === 'backup-newer-schema', refusal === null ? 'восстановление прошло молча' : refusal);
ok('отклонённое восстановление не тронуло данные',
  (await rows(DB, 'templates')).some((r) => r.id === 'keep'));
ok('отклонённое восстановление не подняло версию базы', await versionOf(DB) === SCHEMA);

/* 5.4. Копия, снятая более новой версией приложения, отсекается ещё разбором
   файла — до подтверждения пользователем и до первой записи. Сообщение то же,
   что и для слишком нового formatVersion: «сначала обновите приложение». */
const tooNew = wrap('shared', DB, { version: SCHEMA + 1, stores: { templates: store([{ id: 't1' }]) } });
const verdict = CWBackup.inspect(tooNew);
ok('inspect отклоняет копию с более новой схемой базы', verdict.ok === false && verdict.error === 'schema-too-new',
  'разбор файла — единственное место, где отказ ещё ничего не изменил на устройстве');
ok('inspect по-прежнему принимает копию со схемой не выше текущей',
  CWBackup.inspect(wrap('shared', DB, { version: SCHEMA, stores: { templates: store([]) } })).ok === true);

/* 5.5. Регрессия: штатное восстановление (все хранилища на месте) версию базы
   не трогает вовсе. Это и есть подавляющее большинство реальных случаев. */
await wipe(DB);
d = await open(DB, SCHEMA, (x) => { x.createObjectStore('templates', { keyPath: 'id' }); });
d.close();
await CWBackup.restore(wrap('shared', DB, {
  version: SCHEMA,
  stores: { templates: store([{ id: 'tpl_plain', body: 'штатный путь' }]) },
}));
ok('штатное восстановление не поднимает версию базы', await versionOf(DB) === SCHEMA);
ok('штатное восстановление положило данные', (await rows(DB, 'templates')).some((r) => r.id === 'tpl_plain'));

/* --- 6. Порядок восстановления и предохранительный снимок (H-1, H-2) ----
 *
 * ПОЧЕМУ ЭТО ПРОВЕРЯЕТСЯ. IndexedDB и localStorage — разные хранилища без
 * общей транзакции, полной атомарности между ними не бывает. Но отказ базы
 * не имеет права оставлять localStorage уже переписанным: получилось бы
 * состояние, которого у пользователя никогда не было — настройки из файла
 * рядом с нетронутой базой, — и откатывать его нечем.
 *
 * До 28.08.2026 `restore()` писал localStorage синхронно в обходе секций, а
 * задания IndexedDB копил на потом. Сценарий 6.1 падал.
 */
console.log('\nПорядок восстановления');

/* 6.1. Отказ базы не оставляет localStorage переписанным.
   Отказ вызывается тем же способом, что и в 5.3, — неизвестным хранилищем:
   это единственный отказ, который можно воспроизвести детерминированно, не
   подменяя реализацию IndexedDB. */
await wipe(DB);
let d6 = await open(DB, SCHEMA, (x) => { x.createObjectStore('templates', { keyPath: 'id' }); });
d6.close();
mem.set('cw-sender', JSON.stringify({ name: 'ДоВосстановления' }));
let orderRefusal = null;
try {
  await CWBackup.restore({
    format: CWBackup.FORMAT,
    formatVersion: CWBackup.FORMAT_VERSION,
    scope: 'full',
    createdAt: new Date().toISOString(),
    app: { hub: '0.0.0', modules: {} },
    modules: [],
    sections: {
      shared: {
        local: { 'cw-sender': JSON.stringify({ name: 'ИзКопии' }) },
        idb: { [DB]: { version: SCHEMA, stores: {
          templates: store([{ id: 'tpl_x' }]),
          futureStore: store([{ id: 'f1' }]),
        } } },
      },
    },
  });
} catch (e) { orderRefusal = e && e.message; }
ok('отказ базы: восстановление отклонено', orderRefusal === 'backup-newer-schema', String(orderRefusal));
ok('отказ базы: localStorage НЕ переписан из файла',
  JSON.parse(mem.get('cw-sender')).name === 'ДоВосстановления',
  'localStorage пишется только после успешной записи всех баз — иначе откатывать нечем');

/* 6.2. Успешное восстановление localStorage всё-таки пишет — иначе фаза C
   могла бы «пройти» просто потому, что её выкинули. */
await wipe(DB);
d6 = await open(DB, SCHEMA, (x) => { x.createObjectStore('templates', { keyPath: 'id' }); });
d6.close();
await CWBackup.restore({
  format: CWBackup.FORMAT,
  formatVersion: CWBackup.FORMAT_VERSION,
  scope: 'full',
  createdAt: new Date().toISOString(),
  app: { hub: '0.0.0', modules: {} },
  modules: [],
  sections: {
    shared: {
      local: { 'cw-sender': JSON.stringify({ name: 'ИзКопии' }) },
      idb: { [DB]: { version: SCHEMA, stores: { templates: store([{ id: 'tpl_ok' }]) } } },
    },
  },
});
ok('успешное восстановление: localStorage переписан', JSON.parse(mem.get('cw-sender')).name === 'ИзКопии');
ok('успешное восстановление: база записана', (await rows(DB, 'templates')).some((r) => r.id === 'tpl_ok'));

/* 6.3. Предохранительный снимок переживает полное восстановление.
   Это и есть причина, по которой он лежит в отдельной базе, а не в хранилище
   `snapshots` общей: полная копия заменяет общую базу целиком и стёрла бы
   снимок ровно тем действием, от которого он страхует. */
console.log('\nПредохранительный снимок');
const before = await CWBackup.snapshot();
const guardId = await CWBackup.guard.save(before);
ok('снимок сохранён', typeof guardId === 'string' && guardId.indexOf('restore:') === 0, String(guardId));
ok('снимок лежит НЕ в общей базе', CWBackup.guard.DB !== DB,
  'иначе полное восстановление стёрло бы его тем же действием, от которого он страхует');

await CWBackup.restore(before);
const guards = await CWBackup.guard.list();
ok('снимок пережил полное восстановление', guards.some((g) => g.id === guardId));
const restored = await CWBackup.guard.get(guardId);
ok('снимок читается целиком и годен к восстановлению',
  !!restored && CWBackup.inspect(restored).ok === true,
  'снимок обязан быть тем же форматом, что файл копии, — иначе откатиться им нельзя');

/* 6.4. Предел числа снимков: слепок весит как все данные разом. */
for (let i = 0; i < 4; i++) await CWBackup.guard.save(before);
const many = await CWBackup.guard.list();
ok('число предохранительных снимков ограничено', many.length <= 3, 'снимков ' + many.length);

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nВсе проверки резервного копирования пройдены.');
process.exit(failed ? 1 : 0);
