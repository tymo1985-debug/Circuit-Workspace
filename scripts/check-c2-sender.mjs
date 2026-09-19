#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-c2-sender.mjs
 *
 * Фаза C2: поведенческие проверки shared/sender.js на реальном коде поверх
 * fake-indexeddb — CWDB/CWState/CWSender берутся из файлов как есть, не
 * дублируются. Каждый сценарий — отдельная "вкладка": свой vm-контекст с
 * общим fake-indexeddb (одна и та же база данных) и общим самодельным
 * localStorage, который, в отличие от Map, реально рассылает событие
 * 'storage' другим вкладкам при записи — иначе кросс-вкладочные тесты (H/I)
 * нечем было бы проверить.
 *
 * Что здесь идёт по СТАТИЧЕСКОМУ признаку (zero legacy writes), а что —
 * поведенчески, разделено согласно check-degraded.mjs: то, что браузер
 * реально не даст сделать (клавиатура, фокус), проверяется живым прогоном;
 * здесь — контракт данных.
 *
 *   node scripts/check-c2-sender.mjs
 *
 * Требует fake-indexeddb: npm install fake-indexeddb
 */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DB_SRC = read('shared/db.js');
const STATE_SRC = read('shared/state.js');
const SENDER_SRC = read('shared/sender.js');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

/* --- Самодельный кросс-вкладочный localStorage --------------------------
   Настоящий браузер шлёт 'storage' всем ДРУГИМ окнам, кроме того, что писало.
   Обычный общий объект этого не делает — событие не долетело бы до соседней
   вкладки, и CWState.onForeign() было бы нечем проверить. */
function makeBackend() {
  return {
    store: {},
    tabs: [],
    notify(writer, key, oldValue, newValue) {
      this.tabs.forEach((t) => {
        if (t.name === writer) return;
        t.listeners.slice().forEach((fn) => {
          try { fn({ key, oldValue, newValue }); } catch (e) { console.error('CWState тестового стенда: слушатель упал', e); }
        });
      });
    },
  };
}

function makeTab(name, backend, opts) {
  opts = opts || {};
  const listeners = [];
  backend.tabs.push({ name, listeners });
  const ctx = {
    console, setTimeout, clearTimeout, Date, Promise, Math, JSON, String, Object, Array,
    crypto: globalThis.crypto,
    indexedDB, IDBKeyRange,
    localStorage: {
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
    addEventListener: (type, fn) => { if (type === 'storage') listeners.push(fn); },
    removeEventListener: () => {},
  };
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  if (!opts.noDb) vm.runInContext(DB_SRC, ctx);
  if (!opts.noState) vm.runInContext(STATE_SRC, ctx);
  vm.runInContext(SENDER_SRC, ctx);
  return ctx;
}

const resetDb = () => new Promise((res, rej) => {
  const r = indexedDB.deleteDatabase('circuit-workspace-db');
  r.onsuccess = () => res();
  r.onerror = () => rej(r.error);
  r.onblocked = () => rej(new Error('deleteDatabase заблокирован'));
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const rawStateGet = () => new Promise((res, rej) => {
  const r = indexedDB.open('circuit-workspace-db');
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains('state')) { db.close(); return res(null); }
    const tx = db.transaction(['state'], 'readonly');
    const g = tx.objectStore('state').get('shared:sender');
    g.onsuccess = () => { db.close(); res(g.result || null); };
    g.onerror = () => { db.close(); rej(g.error); };
  };
  r.onerror = () => rej(r.error);
});
const rawStatePut = (row) => new Promise((res, rej) => {
  const r = indexedDB.open('circuit-workspace-db');
  r.onsuccess = () => {
    const db = r.result;
    const tx = db.transaction(['state'], 'readwrite');
    tx.objectStore('state').put(row);
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  };
  r.onerror = () => rej(r.error);
});
const blankPayload = (over) => JSON.stringify(Object.assign({ name: '', code: '', address: '', phone1: '', phone2: '', email: '' }, over || {}));

async function main() {
  console.log('\nA: канон + легаси — побеждает канон');
  await resetDb();
  {
    const backend = makeBackend();
    const boot = makeTab('boot', backend);
    await boot.CWSender.ready();
    await rawStatePut({ id: 'shared:sender', payload: blankPayload({ name: 'Canon', code: 'C' }), rev: 3, savedAt: Date.now(), writerId: 'seed' });
    backend.store['cw-sender'] = JSON.stringify({ name: 'Legacy', code: 'X' });
    const tab = makeTab('t1', backend);
    await tab.CWSender.ready();
    ok('канон побеждает над легаси', tab.CWSender.get().name === 'Canon' && tab.CWSender.get().code === 'C');
    ok('лишней записи не произошло (rev остался 3)', (await rawStateGet()).rev === 3);
  }

  console.log('\nB: легаси мигрирует в канон, подтверждённо');
  await resetDb();
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend);
    backend.store['cw-sender'] = JSON.stringify({ name: 'FromLegacy', code: 'L1' });
    await tab.CWSender.ready();
    ok('память отражает перенесённые данные', tab.CWSender.get().name === 'FromLegacy');
    const raw = await rawStateGet();
    ok('канонической строке присвоена rev=1', !!raw && raw.rev === 1);
    ok('содержимое канона совпадает с легаси', JSON.parse(raw.payload).name === 'FromLegacy');
    ok('dirty() снят после подтверждённого переноса', tab.CWSender.dirty() === false);
    ok('status writable', tab.CWSender.status() === 'writable');
  }

  console.log('\nC: ни канона, ни легаси — пусто, без лишней ревизии');
  await resetDb();
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend);
    await tab.CWSender.ready();
    ok('isEmpty() true', tab.CWSender.isEmpty() === true);
    ok('строка не создана', (await rawStateGet()) === null);
    ok('status writable', tab.CWSender.status() === 'writable');
  }

  console.log('\nD: база недоступна — деградация, легаси только для показа');
  await resetDb();
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend, { noDb: true });
    backend.store['cw-sender'] = JSON.stringify({ name: 'LegacyOnly' });
    await tab.CWSender.ready();
    ok('status degraded', tab.CWSender.status() === 'degraded');
    ok('память показывает легаси (шапка не пустая)', tab.CWSender.get().name === 'LegacyOnly');
    const before = tab.CWSender.get();
    const after = tab.CWSender.set({ name: 'ShouldNotChange' });
    ok('set() — no-op в деградации', after.name === before.name);
  }

  console.log('\nE: set() -> WRITTEN двигает рубеж');
  await resetDb();
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend);
    await tab.CWSender.ready();
    tab.CWSender.set({ name: 'Alex' });
    ok('dirty сразу после set()', tab.CWSender.dirty() === true);
    await wait(700);
    ok('dirty снят после отложенной записи (WRITTEN)', tab.CWSender.dirty() === false);
    ok('status writable', tab.CWSender.status() === 'writable');
    const raw = await rawStateGet();
    ok('канон rev=1 совпадает с памятью', raw.rev === 1 && JSON.parse(raw.payload).name === 'Alex');
  }

  console.log('\nF: FAILED (нет mutate) — липкая деградация');
  await resetDb();
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend);
    await tab.CWSender.ready();
    tab.CWDB.state.mutate = undefined; // технический отказ смешанного кэша
    tab.CWSender.set({ name: 'WillFail' });
    await wait(700);
    ok('status degraded после FAILED', tab.CWSender.status() === 'degraded');
    const before = tab.CWSender.get();
    tab.CWSender.set({ name: 'IgnoredAfterDegrade' });
    ok('set() no-op после защёлки', tab.CWSender.get().name === before.name);
  }

  console.log('\nG: REFUSED — конфликт защёлкнут, канон на диске не тронут');
  await resetDb();
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend);
    await tab.CWSender.ready();
    tab.CWSender.set({ name: 'Local' });
    await rawStatePut({ id: 'shared:sender', payload: blankPayload({ name: 'External' }), rev: 1, savedAt: Date.now(), writerId: 'ext' });
    await wait(700);
    ok('status conflict после REFUSED', tab.CWSender.status() === 'conflict');
    ok('правка в памяти цела', tab.CWSender.get().name === 'Local');
    const raw = await rawStateGet();
    ok('канон на диске не затёрт отказанной записью', JSON.parse(raw.payload).name === 'External' && raw.rev === 1);
  }

  console.log('\nH/I: соседняя вкладка — чистая принимает, грязная отклоняет');
  await resetDb();
  {
    const backend = makeBackend();
    const tabClean = makeTab('clean', backend);
    const tabDirty = makeTab('dirty', backend);
    await Promise.all([tabClean.CWSender.ready(), tabDirty.CWSender.ready()]);
    tabDirty.CWSender.set({ name: 'MyEdit' });
    await rawStatePut({ id: 'shared:sender', payload: blankPayload({ name: 'Remote' }), rev: 1, savedAt: Date.now(), writerId: 'ext' });
    const revKey = tabClean.CWState.REV_PREFIX + 'shared:sender';
    backend.notify('__external__', revKey, null, 'ext-rev-1');
    backend.store[revKey] = 'ext-rev-1';
    await wait(100);
    ok('чистая вкладка приняла чужое состояние', tabClean.CWSender.get().name === 'Remote' && tabClean.CWSender.status() === 'writable');
    ok('грязная вкладка отклонила чужое, сохранила свою правку', tabDirty.CWSender.get().name === 'MyEdit' && tabDirty.CWSender.status() === 'conflict');
  }

  console.log('\nadopt(): пустой канон принимает, занятый и деградированный — отказывают');
  await resetDb();
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend);
    const taken = await tab.CWSender.adopt({ name: 'Seeded', address: 'Addr' });
    ok('пустой канон принимает seed (true)', taken === true);
    ok('память отражает seed', tab.CWSender.get().name === 'Seeded');
    const raw = await rawStateGet();
    ok('подтверждённая каноническая строка существует', !!raw && JSON.parse(raw.payload).name === 'Seeded');

    const tab2 = makeTab('t2', backend);
    const taken2 = await tab2.CWSender.adopt({ name: 'ShouldBeRefused' });
    ok('занятый канон отказывает (false)', taken2 === false);
    ok('канон не тронут отказанным adopt()', tab2.CWSender.get().name === 'Seeded');
  }
  await resetDb();
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend, { noDb: true });
    ok('деградация всегда отказывает', (await tab.CWSender.adopt({ name: 'X' })) === false);
  }
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend);
    ok('пустой seed — короткий путь false', (await tab.CWSender.adopt({})) === false);
  }

  console.log('\nПространство имён: mirror/rev, без коллизии с id модулей');
  {
    const backend = makeBackend();
    const tab = makeTab('t1', backend);
    const inst = tab.CWState.create('shared:sender');
    ok('mirror-ключ', inst.keys.mirror === 'cw-state-mirror:shared:sender');
    ok('rev-ключ', inst.keys.rev === 'cw-state-rev:shared:sender');
  }

  console.log('\nСтатика: ноль продакшен-записей в прежний ключ');
  {
    ok('sender.js не пишет LEGACY_KEY/cw-sender', !/localStorage\.setItem\(LEGACY_KEY/.test(SENDER_SRC) && !SENDER_SRC.includes("setItem('cw-sender'"));
    ok('CWSender.adopt() возвращает Promise (async)', /adopt: function \(seed\) \{[\s\S]{0,150}return Promise\.resolve\(false\);[\s\S]{0,300}return init\(\)\.then/.test(SENDER_SRC));
    ok('STATE_ID канон — shared:sender', /var STATE_ID = 'shared:sender';/.test(SENDER_SRC));
  }

  console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nВсе сценарии C2 sender прошли.');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
