#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-d-appointments.mjs
 *
 * ЧТО ЛОВИТ. Фаза D: canon Назначений переехал из localStorage(cw-appointments-v1)
 * в CWState('appointments'). Проверяет РЕАЛЬНЫЙ appointments/js/app.js внутри
 * jsdom-документа с минимальной, но полной разметкой (те же id, что в
 * appointments/index.html) поверх fake-indexeddb — не мок, настоящие
 * shared/db.js + shared/state.js.
 *
 * Общий примитив CWState (WRITTEN/REFUSED/FAILED, конверт ревизии,
 * cross-tab) уже покрыт check-c2-sender.mjs и check-state-envelope.mjs —
 * здесь НЕ повторяется. Проверяется то, что специфично для Назначений:
 * миграция A–D через собственный load()/save(), сохранность PNG-подписи,
 * read-only борта (.editor) при деградации, конфликт соседней вкладки.
 *
 *   npm i jsdom fake-indexeddb
 *   node scripts/check-d-appointments.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DB_SRC = read('shared/db.js');
const STATE_SRC = read('shared/state.js');
const APP_SRC = read('appointments/js/app.js');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
};

async function wipeDb() {
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase('circuit-workspace-db');
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => resolve();
  });
}

const SKELETON = `<!doctype html><html><body>
<aside class="editor">
  <button type="button" id="newLetterBtn"></button>
  <select id="docLanguage"></select>
  <input id="letterDate" type="date">
  <input id="congName" type="text" list="congList"><datalist id="congList"></datalist>
  <input id="coordinator" type="text">
  <input id="coordinatorAddress" type="text">
  <div data-list="elders"></div>
  <div data-list="servants"></div>
  <div data-list="removed"></div>
  <button type="button" id="signPickBtn"></button>
  <input id="signFile" type="file">
  <button type="button" id="signClearBtn"></button>
  <div id="signPreview"><img id="signPreviewImg"></div>
  <div id="signSizeRow"><input id="signSize" type="range"><span id="signSizeOut"></span></div>
  <span id="signStatus"></span>
  <span class="md-savestatus" id="saveStatus"></span>
</aside>
<main class="preview">
  <button type="button" id="printBtn"></button>
  <span id="moduleVersion"></span>
  <div id="letter">
    <span id="outSender"></span>
    <span id="outDate"></span>
    <span id="outCong"></span>
    <span id="outCoordinator"></span>
    <span id="outCoordinatorAddress"></span>
    <ul id="outElders"></ul>
    <ul id="outServants"></ul>
    <ul id="outRemoved"></ul>
    <span id="outSignName"></span>
    <span id="outSignCode"></span>
    <img id="outSignImage">
  </div>
</main>
</body></html>`;

/* Общий бэкенд localStorage с cross-tab-уведомлением — тот же приём, что и
   в check-c2-sender.mjs: реальный 'storage' event браузер шлёт ДРУГИМ
   окнам, не тому, что писало. */
function makeBackend() {
  return {
    store: {},
    tabs: [],
    notify(writer, key, oldValue, newValue) {
      this.tabs.forEach((t) => {
        if (t.name === writer) return;
        t.listeners.slice().forEach((fn) => { try { fn({ key, oldValue, newValue }); } catch (e) { /* noop */ } });
      });
    },
  };
}

function makeTab(name, backend, opts = {}) {
  const listeners = [];
  backend.tabs.push({ name, listeners });
  const dom = new JSDOM(SKELETON, { url: 'https://example.test/appointments/index.html', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(backend.store, k) ? backend.store[k] : null),
      setItem: (k, v) => {
        const old = Object.prototype.hasOwnProperty.call(backend.store, k) ? backend.store[k] : null;
        backend.store[k] = String(v);
        backend.notify(name, k, old, String(v));
      },
      removeItem: (k) => {
        const old = Object.prototype.hasOwnProperty.call(backend.store, k) ? backend.store[k] : null;
        delete backend.store[k];
        backend.notify(name, k, old, null);
      },
    },
  });
  w.addEventListener('storage', (e) => {}); // jsdom не шлёт кросс-окна сам — эмулируем ниже
  const realAdd = w.addEventListener.bind(w);
  w.addEventListener = function (type, fn) {
    if (type === 'storage') listeners.push(fn);
    return realAdd(type, fn);
  };
  w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
  const ctx = vm.createContext(w);
  ctx.self = w;
  // Реальные внешние скрипты, не относящиеся к предмету этого теста
  // (печать/язык интерфейса/отправитель/обновления) — намеренно НЕ
  // определены: все места вызова в app.js гвардированы `typeof X`/`self.X`
  // и корректно no-op'ают. CWPrint — исключение (используется без гварда
  // для служебного заголовка вкладки при печати), поэтому здесь минимальная
  // заглушка того же публичного контракта.
  ctx.CWPrint = { filename: function () {}, restore: function () {} };
  const run = (src) => vm.runInContext(src, ctx);
  if (!opts.noDb) run(DB_SRC);
  run(STATE_SRC);
  run(APP_SRC);
  // app.js вешает старт на DOMContentLoaded — jsdom документ уже 'complete'
  // к этому моменту, поэтому app.js сам вызвал start() синхронно при eval.
  return { window: w, document: w.document };
}

const tick = (n = 1) => new Promise((r) => { let i = 0; const step = () => (++i >= n ? r() : setTimeout(step, 0)); step(); });
const settle = () => new Promise((r) => setTimeout(r, 30));   // одного tick мало для цепочки init().then(...).then(...)

console.log('\nФаза D: Назначения — миграция и хранение');

/* A: канон + легаси — канон побеждает, легаси не читается. */
{
  await wipeDb();
  const backend = makeBackend();
  backend.store['cw-appointments-v1'] = JSON.stringify({ congregation: 'Легаси', coordinator: 'Легаси К' });
  // Канон кладём СЫРЫМ путём, до создания какой-либо вкладки — иначе сама
  // вкладка первой прочитает легаси и смигрирует его раньше, чем мы успеем
  // положить канон (это и была ошибка первой версии этого сценария).
  await new Promise((resolve, reject) => {
    const openReq = indexedDB.open('circuit-workspace-db', 5);
    openReq.onupgradeneeded = () => {
      const d = openReq.result;
      if (!d.objectStoreNames.contains('state')) d.createObjectStore('state', { keyPath: 'id' });
    };
    openReq.onsuccess = () => {
      const d = openReq.result;
      const tx = d.transaction(['state'], 'readwrite');
      tx.objectStore('state').put({ id: 'appointments', payload: JSON.stringify({ date: '2026-01-01', congregation: 'Канон', coordinator: 'Иванов', coordinatorAddress: '', knownCongregations: [], lists: { elders: [''], servants: [''], removed: [''] }, signature: { image: '', heightMm: 18 } }), rev: 1, savedAt: Date.now(), writerId: 'seed' });
      tx.oncomplete = () => { d.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    openReq.onerror = () => reject(openReq.error);
  });
  const tab = makeTab('a-canon', backend);
  await settle();
  ok('канон побеждает легаси (congName)', tab.document.getElementById('congName').value === 'Канон', tab.document.getElementById('congName').value);
  ok('канон побеждает легаси (coordinator)', tab.document.getElementById('coordinator').value === 'Иванов');
}

/* B: легаси есть, канона нет — перенос, подпись цела. */
{
  await wipeDb();
  const backend = makeBackend();
  backend.store['cw-appointments-v1'] = JSON.stringify({
    date: '2026-02-02', congregation: 'Тест', coordinator: 'Петров', coordinatorAddress: 'ул.1',
    knownCongregations: ['Тест'], lists: { elders: ['А'], servants: [''], removed: [''] },
    signature: { image: 'data:image/png;base64,AAAA', heightMm: 20 },
  });
  const tab = makeTab('b', backend);
  await settle();
  ok('легаси перенесён — поле заполнено', tab.document.getElementById('coordinator').value === 'Петров');
  const st = tab.window.CWState.create('appointments');
  const row = await st.init();
  ok('канон создан из легаси', typeof row === 'string' && JSON.parse(row).coordinator === 'Петров');
  ok('подпись доехала байт в байт', JSON.parse(row).signature.image === 'data:image/png;base64,AAAA');
  ok('легаси-ключ НЕ переписан', JSON.parse(backend.store['cw-appointments-v1']).congregation === 'Тест');
}

/* C: ни канона, ни легаси — пусто, ни одной строки в базе. */
{
  await wipeDb();
  const backend = makeBackend();
  const tab = makeTab('c', backend);
  await settle();
  const st = tab.window.CWState.create('appointments');
  const row = await st.init();
  ok('пустой старт — канона нет вовсе', row === null, row);
}

/* D: CWDB недоступен — read-only, борт заблокирован. Деградация всплывает
   ЛЕНИВО, на первой попытке записи (тот же контракт, что у congress-project/
   js/state.js) — проактивно при !usable ничего не блокируется. */
{
  await wipeDb();
  const backend = makeBackend();
  const tab = makeTab('d', backend, { noDb: true });
  await settle();
  const congName = tab.document.getElementById('congName');
  congName.value = 'Правка без базы';
  congName.dispatchEvent(new tab.window.Event('input', { bubbles: true }));
  await settle(); await new Promise((r) => setTimeout(r, 500)); await settle();
  const status = tab.document.getElementById('saveStatus');
  ok('деградация: saveStatus в состоянии error', status.dataset.state === 'error', status.dataset.state);
  ok('деградация: борт заблокирован (.editor input disabled)', congName.disabled === true);
}

/* E: обычное сохранение — WRITTEN, статус "сохранено". */
{
  await wipeDb();
  const backend = makeBackend();
  const tab = makeTab('e', backend);
  await settle();
  const congName = tab.document.getElementById('congName');
  congName.value = 'Новое собрание';
  congName.dispatchEvent(new tab.window.Event('input', { bubbles: true }));
  await settle(); await new Promise((r) => setTimeout(r, 500)); await settle();
  const status = tab.document.getElementById('saveStatus');
  ok('WRITTEN: статус "сохранено"', status.dataset.state === 'saved', status.dataset.state);
  const st = tab.window.CWState.create('appointments');
  const row = await st.init();
  ok('WRITTEN: канон содержит новое значение', JSON.parse(row).congregation === 'Новое собрание');
}

/* F: FAILED — технический отказ на записи, read-only. */
{
  await wipeDb();
  const backend = makeBackend();
  const tab = makeTab('f', backend);
  await settle();
  tab.window.CWDB.state.mutate = undefined;   // имитируем смешанный кэш/отказ
  const congName = tab.document.getElementById('congName');
  congName.value = 'Правка при отказе';
  congName.dispatchEvent(new tab.window.Event('input', { bubbles: true }));
  await settle(); await new Promise((r) => setTimeout(r, 500)); await settle();
  const status = tab.document.getElementById('saveStatus');
  ok('FAILED: статус НЕ "сохранено"', status.dataset.state !== 'saved', status.dataset.state);
  ok('FAILED: борт заблокирован после отказа', congName.disabled === true);
}

/* G/H/I: соседняя вкладка — чистая принимает, грязная отклоняет и хранит правку. */
{
  await wipeDb();
  const backend = makeBackend();
  const tabClean = makeTab('g-clean', backend);
  const tabDirty = makeTab('g-dirty', backend);
  await settle();

  // "Внешняя" запись напрямую в базу + маячок ревизии — без прохода через
  // сами вкладки, чтобы не зависеть от гонки их собственных debounce-таймеров.
  const stProbe = tabClean.window.CWState.create('appointments');
  await stProbe.init();
  const revKey = tabClean.window.CWState.create('appointments').keys.rev;

  const dirtyCong = tabDirty.document.getElementById('congName');
  dirtyCong.value = 'Правка в другой вкладке';
  dirtyCong.dispatchEvent(new tabDirty.window.Event('input', { bubbles: true }));
  await settle();

  const req = indexedDB.open('circuit-workspace-db');
  const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  await new Promise((res, rej) => {
    const tx = db.transaction(['state'], 'readwrite');
    tx.objectStore('state').put({ id: 'appointments', payload: JSON.stringify({ date: '2026-03-03', congregation: 'Внешнее', coordinator: '', coordinatorAddress: '', knownCongregations: [], lists: { elders: [''], servants: [''], removed: [''] }, signature: { image: '', heightMm: 18 } }), rev: 1, savedAt: Date.now(), writerId: 'ext' });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
  backend.notify('external-writer', revKey, backend.store[revKey] || null, 'ext-rev-1');
  await settle();

  ok('чистая вкладка приняла внешнее состояние', tabClean.document.getElementById('congName').value === 'Внешнее',
    tabClean.document.getElementById('congName').value);
  ok('грязная вкладка отклонила — своя правка на месте', dirtyCong.value === 'Правка в другой вкладке', dirtyCong.value);
  ok('грязная вкладка: конфликт показан', tabDirty.document.getElementById('saveStatus').dataset.state === 'dirty',
    tabDirty.document.getElementById('saveStatus').dataset.state);
}

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nФаза D (Назначения): миграция, WRITTEN/REFUSED/FAILED, cross-tab, деградация, подпись — всё на месте.');
process.exit(failed ? 1 : 0);
