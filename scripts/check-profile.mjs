#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-profile.mjs
 *
 * Фаза 4 общих настроек (23.10.2026): поведенческие проверки общего профиля
 * (shared/profile.js) — второго экземпляра движка записи из shared/sender.js
 * (`CWRecord`). Реальный код CWDB/CWState/CWSender/CWProfile поверх
 * fake-indexeddb, «вкладки» — отдельные vm-контексты с общим localStorage,
 * который рассылает 'storage' соседям (как в check-c2-sender.mjs).
 *
 * Что проверяется:
 *   A. пустой первый запуск — ни одной записи (как у отправителя);
 *   B. adopt() пишет в пустой профиль, подтверждает запись, второй adopt()
 *      занятый профиль не трогает;
 *   C. числовые поля: координаты — числа или null, мусор отбрасывается;
 *   D. соседняя вкладка видит правку;
 *   E. профиль и отправитель — разные записи (`shared:sender` не меняется);
 *   F. без CWState — режим только для чтения, set() не двигает память.
 *
 * Требует fake-indexeddb.
 */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
let indexedDB, IDBKeyRange;
try { ({ indexedDB, IDBKeyRange } = await import('fake-indexeddb')); } catch (e) {
  console.log('SKIP: fake-indexeddb не установлен'); process.exit(2);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SRC = ['shared/db.js', 'shared/state.js', 'shared/sender.js', 'shared/profile.js'].map(read);

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

function makeBackend() {
  return { store: {}, tabs: [], notify(writer, key, oldValue, newValue) {
    this.tabs.forEach((t) => { if (t.name !== writer) t.listeners.slice().forEach((fn) => fn({ key, oldValue, newValue })); });
  } };
}
function makeTab(name, backend, opts = {}) {
  const listeners = [];
  backend.tabs.push({ name, listeners });
  const has = (k) => Object.prototype.hasOwnProperty.call(backend.store, k);
  const ctx = {
    console, setTimeout, clearTimeout, Date, Promise, Math, JSON, String, Object, Array, isFinite,
    crypto: globalThis.crypto, indexedDB, IDBKeyRange,
    localStorage: {
      getItem: (k) => (has(k) ? backend.store[k] : null),
      setItem: (k, v) => { const o = has(k) ? backend.store[k] : null; backend.store[k] = String(v); backend.notify(name, k, o, String(v)); },
      removeItem: (k) => { const o = has(k) ? backend.store[k] : null; delete backend.store[k]; backend.notify(name, k, o, null); },
      key: (i) => Object.keys(backend.store)[i] || null,
      get length() { return Object.keys(backend.store).length; },
    },
    addEventListener: (type, fn) => { if (type === 'storage') listeners.push(fn); },
    removeEventListener: () => {},
  };
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  SRC.forEach((src, i) => { if (opts.noState && i < 2) return; vm.runInContext(src, ctx); });
  return ctx;
}
const resetDb = () => new Promise((res, rej) => {
  const r = indexedDB.deleteDatabase('circuit-workspace-db');
  r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
});
const rawGet = (id) => new Promise((res, rej) => {
  const r = indexedDB.open('circuit-workspace-db');
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains('state')) { db.close(); return res(null); }
    const g = db.transaction(['state'], 'readonly').objectStore('state').get(id);
    g.onsuccess = () => { db.close(); res(g.result || null); };
    g.onerror = () => { db.close(); rej(g.error); };
  };
  r.onerror = () => rej(r.error);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nA: пустой первый запуск');
await resetDb();
{
  const tab = makeTab('a', makeBackend());
  ok('CWProfile создан поверх CWRecord', !!tab.CWProfile && !!tab.CWRecord);
  await tab.CWProfile.ready();
  const p = tab.CWProfile.get();
  ok('поля пустые, координаты null', p.overseerName === '' && p.homeLat === null && p.homeLng === null && p.mailMethod === '');
  ok('ни одной записи в базе', (await rawGet('shared:profile')) === null);
  ok('status = writable', tab.CWProfile.status() === 'writable');
}

console.log('\nB: adopt()');
await resetDb();
{
  const tab = makeTab('b', makeBackend());
  const taken = await tab.CWProfile.adopt({ overseerName: 'Алекс', wifeName: 'Лидия', homeAddress: 'Praha', homeLat: 50.08, homeLng: 14.42, mailMethod: 'owa' });
  ok('adopt в пустой профиль подтверждён', taken === true);
  const row = await rawGet('shared:profile');
  const payload = row && JSON.parse(row.payload);
  ok('запись shared:profile в базе', !!payload && payload.overseerName === 'Алекс' && payload.homeLat === 50.08 && payload.mailMethod === 'owa');
  const again = await tab.CWProfile.adopt({ overseerName: 'Другой' });
  ok('второй adopt занятый профиль не трогает', again === false && tab.CWProfile.get().overseerName === 'Алекс');
  ok('adopt пустого — false без записи', (await tab.CWProfile.adopt({ homeLat: null, overseerName: '  ' })) === false);
}

console.log('\nC: числовые поля');
await resetDb();
{
  const tab = makeTab('c', makeBackend());
  await tab.CWProfile.ready();
  tab.CWProfile.set({ homeLat: 'x', homeLng: NaN });
  ok('строка/NaN в координату не принимаются', tab.CWProfile.get().homeLat === null && tab.CWProfile.get().homeLng === null);
  tab.CWProfile.set({ homeLat: 48.2, homeLng: 16.37, homeAddress: 'Wien' });
  ok('числа принимаются', tab.CWProfile.get().homeLat === 48.2 && tab.CWProfile.get().homeLng === 16.37);
  tab.CWProfile.set({ homeLat: null });
  ok('null сбрасывает координату', tab.CWProfile.get().homeLat === null);
  tab.CWProfile.set({ overseerName: 5 });
  ok('число в строковое поле не принимается', tab.CWProfile.get().overseerName === '');
  await wait(2600);
  const row = await rawGet('shared:profile');
  ok('отложенная запись дошла до базы', !!row && JSON.parse(row.payload).homeAddress === 'Wien' && tab.CWProfile.dirty() === false);
}

console.log('\nD/E: соседняя вкладка; отправитель отдельно');
await resetDb();
{
  const backend = makeBackend();
  const t1 = makeTab('d1', backend);
  const t2 = makeTab('d2', backend);
  await Promise.all([t1.CWProfile.ready(), t2.CWProfile.ready(), t1.CWSender.ready()]);
  t1.CWProfile.set({ wifeName: 'Лидия' });
  await wait(2600);
  ok('вторая вкладка увидела правку', t2.CWProfile.get().wifeName === 'Лидия');
  ok('shared:sender не создан правкой профиля', (await rawGet('shared:sender')) === null);
  ok('отправитель пуст', t1.CWSender.isEmpty());
}

console.log('\nF: без CWState — только чтение');
{
  const tab = makeTab('f', makeBackend(), { noState: true });
  await tab.CWProfile.ready();
  tab.CWProfile.set({ overseerName: 'X' });
  ok('status = degraded, set() не двигает память', tab.CWProfile.status() === 'degraded' && tab.CWProfile.get().overseerName === '');
}

if (failed) { console.log('\n✗ Провалов: ' + failed); process.exit(1); }
console.log('\nПрофиль: движок записи общий с отправителем, поля и перенос — в порядке.');
process.exit(0);
