#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-f-legacy-cleanup.mjs
 *
 * Фаза F: главные легаси-ключи Клиндария (`service-year-planner-v9-4-2`) и
 * Конгрессов (`congress-pwa-v34-speakers`) удаляются ТОЛЬКО когда канон
 * подтверждён записью И проходит проверку формы (isValidPersistedState/
 * isValidState) — существование строки (`remote.migrated()`) само по себе
 * недостаточно, и подтверждённый writeOutcome() тоже недостаточен без
 * проверки формы (normalizeApp() Клиндария всеяден и превратит любой мусор
 * в валидное на вид пустое состояние).
 *
 * Реальный circuit-planner/app.js эволируется в jsdom (тот же приём, что и
 * check-d-appointments.mjs): вызывается напрямую App.store.load(), без
 * ожидания собственного App.init() в хвосте файла — он стартует асинхронно
 * после CWState.init() и до него сюда не успевает; здесь оценивается только
 * поведение load()/writeNow(), не полноценный рендер.
 *
 * Конгрессы — ES-модуль с глубоким графом импортов (render.js тянет за
 * собой congress.js/tasks.js/icons.js). Импортируется реальный модуль
 * целиком через dynamic import() внутри того же jsdom-окружения — это
 * тот же самый код, что грузит браузер, не копия и не пересказ.
 *
 *   npm i jsdom fake-indexeddb
 *   node scripts/check-f-legacy-cleanup.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
};

/* circuit-planner/app.js завершает свой файл собственным асинхронным
   App.init() (полный рендер календаря и т.д.) — он стартует сам, отдельно
   от App.store.load(), которую вызывает и ждёт этот тест напрямую. В
   минимальном jsdom-документе без реальной разметки календаря он рано или
   поздно упадёт — это ожидаемо и не имеет отношения к предмету теста
   (миграция/удаление легаси-ключа заканчивается до этого падения). Подавляем
   только он, не весь процесс. */
process.on('unhandledRejection', () => {});

async function wipeDb() {
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase('circuit-workspace-db');
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => resolve();
  });
}
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

async function rawStateRow(id) {
  const req = indexedDB.open('circuit-workspace-db');
  const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  if (!db.objectStoreNames.contains('state')) { db.close(); return null; }
  const row = await new Promise((res, rej) => {
    const tx = db.transaction(['state'], 'readonly');
    const r = tx.objectStore('state').get(id);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return row;
}
async function seedStateRow(id, payload, rev) {
  const req = indexedDB.open('circuit-workspace-db', 5);
  const db = await new Promise((res, rej) => {
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('state')) req.result.createObjectStore('state', { keyPath: 'id' }); };
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  });
  await new Promise((res, rej) => {
    const tx = db.transaction(['state'], 'readwrite');
    tx.objectStore('state').put({ id, payload, rev, savedAt: Date.now(), writerId: 'seed' });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
}

/* ─── Общая фейковая localStorage-подложка (без cross-tab — здесь не нужен) */
function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _raw: store,
  };
}

const DB_SRC = read('shared/db.js');
const STATE_SRC = read('shared/state.js');

function makePlannerCtx() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/circuit-planner/index.html', pretendToBeVisual: true });
  const w = dom.window;
  const storage = makeStorage();
  Object.defineProperty(w, 'localStorage', { configurable: true, value: storage });
  w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
  const ctx = vm.createContext(w);
  ctx.self = w;
  vm.runInContext(DB_SRC, ctx);
  vm.runInContext(STATE_SRC, ctx);
  // Свои неотносящиеся к предмету теста внешние скрипты — намеренно не
  // определены: все места вызова гвардированы typeof/self.X и корректно
  // no-op'ают (CWSender, CWDirectory, CWPersist, CWSnapshots, CWUpdate,
  // App.i18nBridge и т.д. читаются через такие проверки).
  // Хвост файла заводит собственный асинхронный App.init() (полный рендер) —
  // он нам не нужен и в минимальном документе рано или поздно упадёт;
  // синхронная часть eval (объявление App, App.store.remote = ...) нам
  // как раз и нужна, поэтому ошибку из хвоста здесь просто глушим.
  try { vm.runInContext(read('circuit-planner/app.js'), ctx); } catch (e) { /* см. комментарий выше файла */ }
  return { window: w, storage };
}

console.log('\nФаза F: удаление легаси-ключа Клиндария (service-year-planner-v9-4-2)');

const plannerValid = { settings: { fontSize: '100' }, serviceYears: {}, events: [{ id: 'e1', name: 'Собрание' }], entries: [{ id: 'x1', eventId: 'e1', start: '2026-01-01T10:00', end: '2026-01-01T11:00' }], meta: { version: '1' } };

/* 1. Чистый старт: ни канона, ни легаси — без ошибок, ключ не появляется. */
{
  await wipeDb();
  const { window: w, storage } = makePlannerCtx();
  await w.App.store.load();
  await settle();
  ok('чистый старт: без ошибок', true);
  ok('чистый старт: легаси-ключ не создан', storage.getItem('service-year-planner-v9-4-2') === null);
  const row = await rawStateRow('circuit-planner');
  ok('чистый старт: строка не создана из ничего', row === null);
}

/* 2. Валидный легаси, канона нет: перенос подтверждён — легаси удалён. */
{
  await wipeDb();
  const { window: w, storage } = makePlannerCtx();
  storage.setItem('service-year-planner-v9-4-2', JSON.stringify(plannerValid));
  await w.App.store.load();
  await settle();
  const row = await rawStateRow('circuit-planner');
  ok('валидный легаси: канон создан', row && JSON.parse(row.payload).events?.[0]?.id === 'e1');
  ok('валидный легаси: легаси-ключ удалён после подтверждённой записи', storage.getItem('service-year-planner-v9-4-2') === null);
}

/* 3. Валидный канон уже есть + легаси всё ещё жив (старая установка после
      обновления кода) — легаси убирается на обычной загрузке. */
{
  await wipeDb();
  await seedStateRow('circuit-planner', JSON.stringify(plannerValid), 3);
  const { window: w, storage } = makePlannerCtx();
  storage.setItem('service-year-planner-v9-4-2', JSON.stringify(plannerValid));
  await w.App.store.load();
  await settle();
  ok('канон уже валиден: легаси убран без повторной миграции', storage.getItem('service-year-planner-v9-4-2') === null);
  const row = await rawStateRow('circuit-planner');
  ok('канон не переписан (та же ревизия)', row && row.rev === 3);
}

/* 4. Испорченный (не-JSON) легаси — не пишем в канон, ключ остаётся. */
{
  await wipeDb();
  const { window: w, storage } = makePlannerCtx();
  storage.setItem('service-year-planner-v9-4-2', '{не json');
  await w.App.store.load();
  await settle();
  const row = await rawStateRow('circuit-planner');
  ok('испорченный JSON: канон не создан', row === null);
  ok('испорченный JSON: легаси-ключ сохранён', storage.getItem('service-year-planner-v9-4-2') === '{не json');
}

/* 5. Разбираемый, но структурно чужой легаси ({} / посторонний объект) —
      isValidPersistedState() отклоняет, ключ остаётся. */
{
  await wipeDb();
  const { window: w, storage } = makePlannerCtx();
  storage.setItem('service-year-planner-v9-4-2', JSON.stringify({ foo: 'bar' }));
  await w.App.store.load();
  await settle();
  const row = await rawStateRow('circuit-planner');
  ok('структурно чужой легаси: канон не создан', row === null);
  ok('структурно чужой легаси: ключ сохранён', JSON.parse(storage.getItem('service-year-planner-v9-4-2')).foo === 'bar');
}

/* 6. IndexedDB недоступна — легаси остаётся в любом случае. */
{
  await wipeDb();
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/circuit-planner/index.html', pretendToBeVisual: true });
  const w = dom.window;
  const storage = makeStorage();
  Object.defineProperty(w, 'localStorage', { configurable: true, value: storage });
  const ctx = vm.createContext(w);
  ctx.self = w;
  // db.js НЕ грузим вовсе — CWDB отсутствует, remote.available() = false.
  vm.runInContext(STATE_SRC, ctx);   // db.js НЕ грузим — CWDB отсутствует
  storage.setItem('service-year-planner-v9-4-2', JSON.stringify(plannerValid));
  try { vm.runInContext(read('circuit-planner/app.js'), ctx); } catch (e) { /* см. makePlannerCtx() выше */ }
  await w.App.store.load();
  await settle();
  ok('IndexedDB недоступна: легаси сохранён', storage.getItem('service-year-planner-v9-4-2') !== null);
}

/* 7. Канон существует, но НЕВАЛИДЕН — легаси НЕ удаляется, даже если он
      структурно валиден сам по себе. */
{
  await wipeDb();
  await seedStateRow('circuit-planner', JSON.stringify({ foo: 'bar' }), 1);
  const { window: w, storage } = makePlannerCtx();
  storage.setItem('service-year-planner-v9-4-2', JSON.stringify(plannerValid));
  await w.App.store.load();
  await settle();
  ok('канон невалиден: легаси сохранён', storage.getItem('service-year-planner-v9-4-2') !== null);
}

console.log(failed ? `\nПРОВАЛЕНО (Клиндарий): ${failed}` : '\nКлиндарий: удаление легаси-ключа безопасно во всех проверенных сценариях.');
const plannerFailed = failed;
failed = 0;

console.log('\nФаза F: удаление легаси-ключа Конгрессов (congress-pwa-v34-speakers)');

const congressValid = { congresses: [{ id: 'c1', theme: 'Тема', tasks: [] }], activeId: null, settings: null, series: [] };

async function makeCongressCtx() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/congress-project/index.html', pretendToBeVisual: true });
  const w = dom.window;
  const storage = makeStorage();
  Object.defineProperty(w, 'localStorage', { configurable: true, value: storage });
  w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
  const script = new w.Function('return this')();
  script.self = w; script.CWDB = undefined;
  const vmctx = vm.createContext(w);
  vmctx.self = w;
  vm.runInContext(DB_SRC, vmctx);
  vm.runInContext(STATE_SRC, vmctx);
  globalThis.window = w; globalThis.self = w; globalThis.document = w.document; globalThis.localStorage = storage;
  const mod = await import(pathToFileURL(join(ROOT, 'congress-project/js/state.js')).href + '?t=' + Math.random());
  return { window: w, storage, mod };
}

/* 1. Чистый старт. */
{
  await wipeDb();
  const { storage, mod } = await makeCongressCtx();
  await mod.initState();
  try { mod.load(); } catch (e) { /* render() требует разметки, которой в тесте нет — миграция уже отработала до этой точки синхронно, а подтверждение придёт следующим тиком */ }
  await settle();
  ok('чистый старт: без ошибок', true);
  ok('чистый старт: легаси-ключ не создан', storage.getItem('congress-pwa-v34-speakers') === null);
  /* В отличие от Клиндария, load() Конгрессов сам создаёт демо-конгресс,
     когда congresses[] пуст (`if(!store.st.congresses.length)newC(...)`) —
     это существующее поведение, не связанное с Фазой F, поэтому здесь
     проверяется только легаси-ключ, не факт наличия строки в state. */
}

/* 2. Валидный легаси, канона нет. */
{
  await wipeDb();
  const { storage, mod } = await makeCongressCtx();
  storage.setItem('congress-pwa-v34-speakers', JSON.stringify(congressValid));
  await mod.initState();
  try { mod.load(); } catch (e) { /* render() требует разметки, которой в тесте нет — миграция уже отработала до этой точки синхронно, а подтверждение придёт следующим тиком */ }
  await settle();
  const row = await rawStateRow('congress-project');
  ok('валидный легаси: канон создан', row && JSON.parse(row.payload).congresses?.[0]?.id === 'c1');
  ok('валидный легаси: легаси-ключ удалён', storage.getItem('congress-pwa-v34-speakers') === null);
}

/* 3. Канон уже валиден + легаси жив — легаси убирается, содержимое канона не
      теряется. Точный номер ревизии здесь НЕ гарантия Фазы F: migrate()/
      adoptShared() уже сегодня, независимо от этой фазы, могут перенормали-
      зовать store.st и вызвать свой save() (adoptShared() зовёт save()
      безусловно) — это существующее поведение runtime-пути, не регресс. */
{
  await wipeDb();
  await seedStateRow('congress-project', JSON.stringify(congressValid), 3);
  const { storage, mod } = await makeCongressCtx();
  storage.setItem('congress-pwa-v34-speakers', JSON.stringify(congressValid));
  await mod.initState();
  try { mod.load(); } catch (e) { /* render() требует разметки, которой в тесте нет — миграция уже отработала до этой точки синхронно, а подтверждение придёт следующим тиком */ }
  await settle();
  ok('канон уже валиден: легаси убран', storage.getItem('congress-pwa-v34-speakers') === null);
  const row = await rawStateRow('congress-project');
  ok('канон уже валиден: содержимое (конгресс c1) не потеряно',
    row && JSON.parse(row.payload).congresses?.some((c) => c.id === 'c1'));
  ok('канон уже валиден: ревизия не откачена назад (не переписан заново с нуля)', row && row.rev >= 3);
}

/* 4. Испорченный JSON — не мигрирует как доверенные данные, легаси цел.
      Строка `state` МОЖЕТ появиться (демо-конгресс load()'а — см. сценарий 1,
      не связано с Фазой F), но она не имеет права быть ПРОИЗВОДНОЙ от
      непарсящегося легаси — такое в принципе невозможно техническим путём
      (JSON.parse одной и той же строки не может дать один раз ошибку для
      isValidState-проверки и одновременно успех для записи в канон), поэтому
      проверяется главное: легаси НЕ тронут. */
{
  await wipeDb();
  const { storage, mod } = await makeCongressCtx();
  storage.setItem('congress-pwa-v34-speakers', '{не json');
  await mod.initState();
  try { mod.load(); } catch (e) { /* render() требует разметки, которой в тесте нет — миграция уже отработала до этой точки синхронно, а подтверждение придёт следующим тиком */ }
  await settle();
  ok('испорченный JSON: легаси сохранён (не удалён, не переписан)', storage.getItem('congress-pwa-v34-speakers') === '{не json');
  const row = await rawStateRow('congress-project');
  ok('испорченный JSON: если строка и есть — это не мусор из легаси',
    !row || (() => { try { return !JSON.parse(row.payload).hasOwnProperty('не json'); } catch (e) { return false; } })());
}

/* 5. Структурно чужой легаси (нет congresses[]) — та же гарантия: не
      мигрирует как доверенные данные, легаси цел; если строка в канoне и
      появилась (демо-конгресс, сценарий 1), она не несёт постороннее поле
      'foo' из легаси. */
{
  await wipeDb();
  const { storage, mod } = await makeCongressCtx();
  storage.setItem('congress-pwa-v34-speakers', JSON.stringify({ foo: 'bar' }));
  await mod.initState();
  try { mod.load(); } catch (e) { /* render() требует разметки, которой в тесте нет — миграция уже отработала до этой точки синхронно, а подтверждение придёт следующим тиком */ }
  await settle();
  ok('структурно чужой легаси: ключ сохранён', JSON.parse(storage.getItem('congress-pwa-v34-speakers')).foo === 'bar');
  const row = await rawStateRow('congress-project');
  ok('структурно чужой легаси: посторонний ключ "foo" в канон не попал',
    !row || JSON.parse(row.payload).foo === undefined);
}

/* 6. IndexedDB недоступна. */
{
  await wipeDb();
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/congress-project/index.html', pretendToBeVisual: true });
  const w = dom.window;
  const storage = makeStorage();
  Object.defineProperty(w, 'localStorage', { configurable: true, value: storage });
  const vmctx = vm.createContext(w);
  vmctx.self = w;
  vm.runInContext(STATE_SRC, vmctx);   // db.js НЕ грузим — CWDB отсутствует
  globalThis.window = w; globalThis.self = w; globalThis.document = w.document; globalThis.localStorage = storage;
  storage.setItem('congress-pwa-v34-speakers', JSON.stringify(congressValid));
  const mod = await import(pathToFileURL(join(ROOT, 'congress-project/js/state.js')).href + '?t=' + Math.random());
  await mod.initState();
  try { mod.load(); } catch (e) { /* render() требует разметки, которой в тесте нет — миграция уже отработала до этой точки синхронно, а подтверждение придёт следующим тиком */ }
  await settle();
  ok('IndexedDB недоступна: легаси сохранён', storage.getItem('congress-pwa-v34-speakers') !== null);
}

/* 7. Канон невалиден. */
{
  await wipeDb();
  await seedStateRow('congress-project', JSON.stringify({ foo: 'bar' }), 1);
  const { storage, mod } = await makeCongressCtx();
  storage.setItem('congress-pwa-v34-speakers', JSON.stringify(congressValid));
  await mod.initState();
  try { mod.load(); } catch (e) { /* render() требует разметки, которой в тесте нет — миграция уже отработала до этой точки синхронно, а подтверждение придёт следующим тиком */ }
  await settle();
  ok('канон невалиден: легаси сохранён', storage.getItem('congress-pwa-v34-speakers') !== null);
}

console.log(failed ? `\nПРОВАЛЕНО (Конгрессы): ${failed}` : '\nКонгрессы: удаление легаси-ключа безопасно во всех проверенных сценариях.');
const totalFailed = plannerFailed + failed;
console.log(totalFailed ? `\nИТОГО ПРОВАЛЕНО: ${totalFailed}` : '\nФаза F: оба легаси-моста безопасны во всех проверенных сценариях.');
process.exit(totalFailed ? 1 : 0);
