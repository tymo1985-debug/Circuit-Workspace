#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-db.mjs
 *
 * Слой хранения Журнала (фаза J2): хранилища journalNodes/Entries/Links/Meta
 * в общей базе circuit-workspace-db, их индексы, фасад CWJournal, апгрейд
 * схемы 5→6 без потерь, участие в резервном копировании.
 *
 * ПОЧЕМУ ЗДЕСЬ, а не «когда сломается повторно»: подъём DB_VERSION и копия —
 * две необратимые области. Потерянную при апгрейде строку или затёртого
 * восстановлением соседа пользователь обнаружит, когда исправлять уже нечего.
 *
 *   node scripts/check-journal-db.mjs
 *
 * Требует fake-indexeddb.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DB = 'circuit-workspace-db';
const JOURNAL = ['journalNodes', 'journalEntries', 'journalLinks', 'journalMeta'];
const EXPECTED_INDEXES = {
  journalNodes: ['parentId', 'circuitId', 'kind', 'status', 'updatedAt'],
  journalEntries: ['nodeId', 'circuitId', 'type', 'status', 'updatedAt', 'dueDate', 'carryKey'],
  journalLinks: ['from', 'to', 'rel'],
  journalMeta: [],
};

globalThis.self = globalThis;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = {};

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

/* --- Помощники ------------------------------------------------------------ */
const open = (name, version, build) => new Promise((res, rej) => {
  const r = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
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
const describe = (name) => new Promise((res, rej) => {
  const r = indexedDB.open(name);
  r.onsuccess = () => {
    const db = r.result;
    const out = { version: db.version, stores: {} };
    const names = [...db.objectStoreNames];
    if (names.length) {
      const tx = db.transaction(names);
      names.forEach((n) => {
        const s = tx.objectStore(n);
        out.stores[n] = { keyPath: s.keyPath, indexes: [...s.indexNames].sort() };
      });
    }
    db.close();
    res(out);
  };
  r.onerror = () => rej(r.error);
});

/* Схема v5 — ровно та, что была до Журнала: берётся из ЖИВОГО shared/db.js
   (литерал STORES минус хранилища Журнала), а не переписывается здесь руками —
   иначе проверка апгрейда подтверждала бы саму себя. */
const dbSrc = read('shared/db.js');
const storesLiteral = dbSrc.slice(dbSrc.indexOf('const STORES = {') + 'const STORES = '.length,
  dbSrc.indexOf('};', dbSrc.indexOf('const STORES = {')) + 1);
// eslint-disable-next-line no-new-func
const ALL_STORES = new Function('return (' + storesLiteral + ');')();
const V5_STORES = Object.fromEntries(Object.entries(ALL_STORES).filter(([n]) => !JOURNAL.includes(n)));

/* ═══ 1. Апгрейд v5 → v6 на базе с данными ═════════════════════════════ */
console.log('\nАпгрейд схемы 5 → 6');
const SENTINELS = {};
{
  const d5 = await open(DB, 5, (db) => {
    Object.entries(V5_STORES).forEach(([name, def]) => {
      const s = db.createObjectStore(name, { keyPath: def.keyPath });
      (def.indexes || []).forEach((i) => s.createIndex(i, i, { unique: false }));
    });
  });
  for (const name of Object.keys(V5_STORES)) {
    SENTINELS[name] = [
      { id: `sentinel-${name}-1`, name: 'Страж ' + name, payload: { nested: [1, 2, 3], s: 'ё' }, module: 'x', at: 1 },
      { id: `sentinel-${name}-2`, name: 'Страж-2', flag: true },
    ];
    await put(d5, name, SENTINELS[name]);
  }
  d5.close();
}
const before = await describe(DB);
ok('исходная база действительно v5', before.version === 5, String(before.version));

eval(read('shared/db.js'));
eval(read('shared/backup.js'));
eval(read('journal/js/data.js'));

ok('CWDB.DB_VERSION = 6', CWDB.DB_VERSION === 6, String(CWDB.DB_VERSION));
await CWDB.init();
const after = await describe(DB);
ok('база поднята до v6', after.version === 6, String(after.version));

for (const name of Object.keys(V5_STORES)) {
  ok(`прежнее хранилище ${name} на месте`, !!after.stores[name]);
  ok(`индексы ${name} не изменились`,
    JSON.stringify(after.stores[name]?.indexes) === JSON.stringify(before.stores[name]?.indexes));
  const got = Object.fromEntries((await rows(DB, name)).map((r) => [r.id, r]));
  ok(`хранилище ${name} не очищено и строки не изменены`,
    Object.keys(got).length === SENTINELS[name].length
      && SENTINELS[name].every((r) => JSON.stringify(got[r.id]) === JSON.stringify(r)));
}

/* ═══ 2. Хранилища и индексы Журнала ════════════════════════════════════ */
console.log('\nХранилища и индексы Журнала');
for (const name of JOURNAL) {
  ok(`${name} создано, keyPath = id`, after.stores[name]?.keyPath === 'id');
  ok(`${name}: индексы ровно [${EXPECTED_INDEXES[name].join(', ')}]`,
    JSON.stringify(after.stores[name]?.indexes) === JSON.stringify([...EXPECTED_INDEXES[name]].sort()),
    JSON.stringify(after.stores[name]?.indexes));
}
ok('Журнал не завёл второй физической базы',
  !(await indexedDB.databases()).some((d) => /journal/i.test(d.name)));

/* ═══ 3. CRUD через CWJournal ═══════════════════════════════════════════ */
console.log('\nCRUD CWJournal');
const J = CWJournal;
const circuit = await J.nodes.add({ kind: 'circuit', label: 'EU-K-03', status: 'active', parentId: 'root' });
ok('узел: id с префиксом jn_', /^jn_/.test(circuit), circuit);
await J.nodes.update(circuit, { circuitId: circuit });
const cong = await J.nodes.add({ kind: 'congregation', parentId: circuit, circuitId: circuit, status: 'active', communityId: 'com_x', label: 'Северное' });
const grp = await J.nodes.add({ kind: 'group', parentId: cong, circuitId: circuit, status: 'archived', label: 'Группа' });
const n1 = await J.nodes.get(cong);
ok('узел: get возвращает запись', n1 && n1.label === 'Северное' && n1.communityId === 'com_x');
ok('узел: createdAt/updatedAt проставлены', !!n1.createdAt && !!n1.updatedAt);
await new Promise((r) => setTimeout(r, 5));
const upd = await J.nodes.update(cong, { label: 'Северное-2', id: 'подмена', createdAt: 'подмена' });
ok('узел: update сливает поля', upd.label === 'Северное-2' && upd.communityId === 'com_x');
ok('узел: update не подменяет id и createdAt', upd.id === cong && upd.createdAt === n1.createdAt);
ok('узел: update обновляет updatedAt', upd.updatedAt > n1.updatedAt);
ok('индекс parentId', (await J.nodes.byParent(circuit)).map((r) => r.id).join() === cong);
ok('индекс circuitId (узлы)', (await J.nodes.byCircuit(circuit)).length === 3);
ok('индекс status (узлы)', (await J.nodes.byStatus('archived')).map((r) => r.id).join() === grp);
await J.nodes.remove(grp);
ok('узел: remove', (await J.nodes.get(grp)) === null);

const e1 = await J.entries.add({ type: 'question', nodeId: cong, circuitId: circuit, status: 'open', carryKey: J.carryKeyFor(cong), touches: [] });
const e2 = await J.entries.add({ type: 'note', nodeId: cong, circuitId: circuit, status: 'open' });
const e3 = await J.entries.add({ type: 'todo', nodeId: circuit, circuitId: circuit, status: 'done', dueDate: '2028-03-28' });
ok('запись: id с префиксом je_', /^je_/.test(e1), e1);
ok('запись: get', (await J.entries.get(e2))?.type === 'note');
ok('индекс nodeId', (await J.entries.byNode(cong)).length === 2);
ok('индекс circuitId (записи)', (await J.entries.byCircuit(circuit)).length === 3);
ok('индекс type', (await J.entries.byType('todo')).map((r) => r.id).join() === e3);
ok('индекс status (записи)', (await J.entries.byStatus('done')).map((r) => r.id).join() === e3);

console.log('\ncarryKey');
ok('открытый пункт найден по "<nodeId>:open"', (await J.entries.openCarry(cong)).map((r) => r.id).join() === e1);
ok('запись без carryKey не возвращается', !(await J.entries.openCarry(cong)).some((r) => r.id === e2));
ok('чужой узел не видит пункт', (await J.entries.openCarry(circuit)).length === 0);
/* Закрытие = удаление поля. Через CWDB.put, т.к. update сливает и оставил бы поле. */
const closing = await J.entries.get(e1);
delete closing.carryKey;
closing.status = 'closed';
await CWDB.journalEntries.put(closing);
ok('после удаления carryKey пункт из выборки исчез', (await J.entries.openCarry(cong)).length === 0);
let boolRejected = false;
try { await CWDB.journalEntries.add({ id: 'je_bool', carryKey: true }); } catch (e) { boolRejected = true; }
const boolRow = await J.entries.get('je_bool');
ok('булево carryKey не попадает в индекс (невалидный ключ)',
  boolRejected || ((await CWDB.journalEntries.byIndex('carryKey', IDBKeyRange.lowerBound(''))).every((r) => r.id !== 'je_bool') && !!boolRow));
await J.entries.remove(e3);
ok('запись: remove', (await J.entries.get(e3)) === null);

const l1 = await J.links.add({ from: J.urn.entry(e2), to: J.urn.node(cong), rel: 'relates' });
await J.links.add({ from: J.urn.entry(e2), to: J.urn.external('circuit-planner', 'entry', 'x1'), rel: 'external' });
ok('связь: id с префиксом jl_', /^jl_/.test(l1));
ok('связь: createdAt', !!(await J.links.get(l1)).createdAt);
ok('индекс from', (await J.links.from(J.urn.entry(e2))).length === 2);
ok('индекс to', (await J.links.to(J.urn.node(cong))).map((r) => r.id).join() === l1);
ok('индекс rel', (await J.links.byRel('external')).length === 1);
await J.links.remove(l1);
ok('связь: remove', (await J.links.get(l1)) === null);

await J.meta.put({ id: 'jm_schema', schemaRev: 1 });
ok('meta: put/get', (await J.meta.get('jm_schema'))?.schemaRev === 1);
await J.meta.update('jm_schema', { schemaRev: 2 });
ok('meta: update', (await J.meta.get('jm_schema'))?.schemaRev === 2);

/* ═══ 4. Запрет localStorage / CWState ════════════════════════════════════ */
console.log('\nГраница хранения');
const jsFiles = readdirSync(join(ROOT, 'journal/js')).filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  const src = read('journal/js/' + f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(`journal/js/${f}: нет localStorage`, !/localStorage|sessionStorage/.test(src));
  ok(`journal/js/${f}: нет CWState`, !/CWState/.test(src));
}
const html = read('journal/index.html');
ok('journal/index.html не подключает shared/state.js', !/<script[^>]+shared\/state\.js/.test(html));
ok('shared/db.js подключён раньше js/data.js',
  html.indexOf('../shared/db.js') > -1 && html.indexOf('../shared/db.js') < html.indexOf('js/data.js'));
ok('в localStorage за весь прогон ничего не записано', mem.size === 0, [...mem.keys()].join(','));

/* ═══ 5. Реестр копий ════════════════════════════════════════════════════ */
console.log('\nРезервная копия');
const entry = CWBackup.MODULES.journal;
const declared = entry?.sharedStores?.[DB] || [];
ok('реестр: четыре хранилища Журнала + communities',
  JSON.stringify([...declared].sort()) === JSON.stringify([...JOURNAL, 'communities'].sort()), JSON.stringify(declared));
ok('реестр: никакого localStorage', entry.local.length === 0 && entry.sharedLocal.length === 0 && entry.idb.length === 0);
ok('реестр: templates/documents ещё не объявлены', !declared.includes('templates') && !declared.includes('documents'));

/* Соседи в общей базе до копии. */
await CWDB.communities.put({ id: 'com_x', name: 'Северное' });
await CWDB.state.put({ id: 'neighbour-module', payload: '{"сосед":1}' });
const snap = await CWBackup.snapshot(['journal']);
const dump = snap.sections?.shared?.idb?.[DB]?.stores || {};
ok('копия помечена partial', snap.sections?.shared?.partial === true);
ok('в копии все четыре хранилища Журнала', JOURNAL.every((n) => !!dump[n]));
ok('в копии communities', (dump.communities?.rows || []).some((r) => r.id === 'com_x'));
ok('в копии НЕТ чужого state', !dump.state);
ok('в копии нет прочих хранилищ', Object.keys(dump).every((n) => [...JOURNAL, 'communities'].includes(n)), Object.keys(dump).join());

/* После копии: своё испорчено, соседи и справочник пополнились. */
await J.nodes.update(cong, { label: 'испорчено' });
const lateNode = await J.nodes.add({ kind: 'pregroup', parentId: cong, circuitId: circuit, status: 'active', label: 'позже копии' });
await CWDB.communities.put({ id: 'com_foreign', name: 'Чужое собрание на устройстве' });
await CWDB.state.put({ id: 'neighbour-module', payload: '{"новее копии":1}' });
await CWBackup.restore(snap);
ok('восстановление вернуло свою строку', (await J.nodes.get(cong))?.label === 'Северное-2');
ok('слияние: строка Журнала, созданная после копии, уцелела', !!(await J.nodes.get(lateNode)));
ok('чужая строка communities уцелела', !!(await CWDB.communities.get('com_foreign')));
ok('state соседа не тронут', (await CWDB.state.get('neighbour-module'))?.payload === '{"новее копии":1}');
ok('прежние хранилища со стражами уцелели',
  (await rows(DB, 'templates')).some((r) => r.id === 'sentinel-templates-1'));

/* ═══ 6. Копия новее потолка схемы ══════════════════════════════════════ */
console.log('\nПотолок схемы');
let refusal = null;
try {
  await CWBackup.restore({
    ...snap,
    sections: { shared: { partial: true, local: {}, idb: { [DB]: {
      version: CWDB.DB_VERSION,
      stores: { journalNodes: dump.journalNodes, journalFutureStore: { keyPath: 'id', autoIncrement: false, indexes: [], rows: [{ id: 'x' }] } },
    } } } },
  });
} catch (e) { refusal = e && e.message; }
ok('копия с хранилищем из будущей схемы отклонена', refusal === 'backup-newer-schema', String(refusal));
ok('версия базы не превысила CWDB.DB_VERSION', (await describe(DB)).version === CWDB.DB_VERSION);
ok('отклонённое восстановление не тронуло Журнал', !!(await J.nodes.get(lateNode)));

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nХранение Журнала: все проверки пройдены.');
process.exit(failed ? 1 : 0);
