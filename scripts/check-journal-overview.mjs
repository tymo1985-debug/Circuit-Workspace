#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-overview.mjs
 *
 * Фаза O1 (данные живого Обзора), только чтение:
 *  - CWPlanner.listCommunities() — полный уникальный список объектов
 *    Клиндария из events[] канона: визиты без назначенных записей есть,
 *    несколько записей — одна строка, обычные/неизвестные типы исключены,
 *    замороженные копии без внутренних полей; прежние методы не изменились;
 *    подписка уведомляет о смене объектов; idle/invalid/unavailable
 *    отличимы от настоящего пустого списка;
 *  - CWJournal.overview.read() — районы, открытые задачи, перенос, активные
 *    проекты, посещения; архивный контекст исключён, порядок совпадает с
 *    рабочими экранами, id достаточно для существующего маршрута;
 *  - J8: при блокировке открытый текст не выходит;
 *  - ничего не пишется (база, localStorage), DB_VERSION = 6, новых
 *    хранилищ нет, опроса нет, Журнал не читает блоб Клиндария.
 *
 *   node scripts/check-journal-overview.mjs   (fake-indexeddb)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

globalThis.self = globalThis;
const mem = new Map();
const lsWrites = [];
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { lsWrites.push(k); mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
const bus = {};
globalThis.addEventListener = (type, fn) => { (bus[type] = bus[type] || []).push(fn); };
const fire = (type, ev) => (bus[type] || []).forEach((fn) => fn(ev));
let intervals = 0;
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (...a) => { intervals++; return realSetInterval(...a); };
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = { journal: { version: '0.0.0' }, 'circuit-planner': { version: '0.0.0' } };

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

eval(read('shared/db.js'));
eval(read('shared/directory.js'));
eval(read('shared/planner.js'));
eval(read('journal/js/crypto.js'));
eval(read('journal/js/data.js'));
eval(read('journal/js/route.js'));
await CWDB.init();
await CWDirectory.init();

const B = CWPlanner;
const J = CWJournal;
const MOD = 'circuit-planner';
const REV = 'cw-state-rev:circuit-planner';

/* ═══ 1. CWPlanner.listCommunities ═══════════════════════════════════════ */
console.log('\n1. CWPlanner: полный список объектов');
const EVENTS = [
  { id: 'evt_north', name: 'Северное', visitType: 'congregation', color: '#123', address: 'АДРЕС', contactPhone: 'ТЕЛЕФОН' },
  { id: 'evt_grp', name: 'Озёрная группа', visitType: 'group' },
  { id: 'evt_pre', name: 'Предгруппа Лес', visitType: 'pregroup' },
  { id: 'evt_idle', name: 'Без посещений', visitType: 'congregation' },
  { id: 'evt_plain', name: 'Обычное событие', visitType: '' },
  { id: 'evt_weird', name: 'Странный тип', visitType: 'circuit' },
  { id: 'evt_north', name: 'Дубликат id', visitType: 'group' },
];
const ENTRIES = [
  { id: 'e1', eventId: 'evt_north', start: '2028-03-13', end: '2028-03-18', note: 'ЗАМЕТКА' },
  { id: 'e2', eventId: 'evt_north', start: '2027-10-01', end: '2027-10-05' },
  { id: 'e3', eventId: 'evt_grp', start: '2028-03-20', end: '2028-03-22' },
  { id: 'e4', eventId: 'evt_pre', start: '2028-04-20', end: '2028-04-22' },
  { id: 'e5', eventId: 'evt_plain', start: '2028-03-14', end: '2028-03-14' },
  { id: 'e6', eventId: 'evt_weird', start: '2028-03-15', end: '2028-03-15' },
];
let rev = 0;
async function writePlanner(payload, signal = true) {
  rev++;
  await CWDB.state.put({ id: MOD, payload, savedAt: Date.now(), rev });
  if (signal) fire('storage', { key: REV, newValue: 'r' + rev });
  await tick();
}
const blob = (events, entries) => JSON.stringify({ settings: { emailBody: 'ПРИВАТНОЕ' }, serviceYears: {}, events, entries });

ok('до чтения: status idle — не «ноль объектов»', B.status() === 'idle' && B.ready() === false && B.listCommunities().length === 0);
const notes = [];
B.subscribe((e) => notes.push(e.status));
await B.init();
ok('нет канона → empty (настоящий пустой список)', B.status() === 'empty' && B.listCommunities().length === 0);
await writePlanner(blob(EVENTS, ENTRIES));
const cs = B.listCommunities();
const byId = Object.fromEntries(cs.map((c) => [c.communityId, c]));
ok('[1] congregation включён', byId.evt_north && byId.evt_north.visitType === 'congregation');
ok('[2] group включён', byId.evt_grp && byId.evt_grp.visitType === 'group');
ok('[3] pregroup включён', byId.evt_pre && byId.evt_pre.visitType === 'pregroup');
ok('[4] обычное событие исключено', !byId.evt_plain);
ok('[5] неизвестный visitType исключён', !byId.evt_weird);
ok('[6] объект без назначенного посещения есть', !!byId.evt_idle);
ok('[7] несколько записей / дубль id → одна строка', cs.filter((c) => c.communityId === 'evt_north').length === 1 && cs.length === 4, cs.length);
ok('[8] стабильный id = id события', byId.evt_north.communityId === 'evt_north' && B.getEntry('e1').communityId === 'evt_north');
ok('[9] только { communityId, name, visitType }', cs.every((c) => JSON.stringify(Object.keys(c).sort()) === '["communityId","name","visitType"]')
  && !/АДРЕС|ТЕЛЕФОН|ПРИВАТНОЕ|ЗАМЕТКА|color|entries/.test(JSON.stringify(cs)));
ok('[10] замороженные копии', cs.every(Object.isFrozen) && B.listCommunities()[0] !== cs[0]);
try { cs[0].name = 'ПОРЧА'; } catch (_) { /* strict */ }
ok('[10] правка копии не портит источник', !B.listCommunities().some((c) => c.name === 'ПОРЧА'));
ok('порядок детерминирован: name, затем id', JSON.stringify(cs.map((c) => c.communityId)) === JSON.stringify(['evt_idle', 'evt_grp', 'evt_pre', 'evt_north']));
/* Прежний публичный контракт — явные ожидания поведения на EVENTS/ENTRIES. */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const le = B.listEntries();
ok('[11] listEntries: все 6 записей, порядок start, затем id', same(le.map((e) => e.id), ['e2', 'e1', 'e5', 'e6', 'e3', 'e4']));
ok('[11] listEntries: копии заморожены, новые на каждый вызов', le.every(Object.isFrozen) && B.listEntries()[0] !== le[0]);
/* Дубль id события: записи — как прежде берут ПОСЛЕДНЕЕ событие с этим id
   (прежнее поведение listEntries, не меняется в O1). */
ok('[11] listEntries: визит — communityId/visitType, обычная и неизвестный тип — пусто',
  same(le.map((e) => [e.id, e.visitType, e.communityId]), [['e2', 'group', 'evt_north'], ['e1', 'group', 'evt_north'], ['e5', '', ''], ['e6', '', ''], ['e3', 'group', 'evt_grp'], ['e4', 'pregroup', 'evt_pre']]));
ok('[11] listEntries: без внутренних полей', !/ЗАМЕТКА|ПРИВАТНОЕ|note|settings/.test(JSON.stringify(le)));
ok('[12] getEntry(e1): точные значения', same(B.getEntry('e1'), { id: 'e1', eventId: 'evt_north', start: '2028-03-13', end: '2028-03-18', title: 'Дубликат id', name: 'Дубликат id', visitType: 'group', communityId: 'evt_north' }));
ok('[12] getEntry(e5): обычная запись', same(B.getEntry('e5'), { id: 'e5', eventId: 'evt_plain', start: '2028-03-14', end: '2028-03-14', title: 'Обычное событие', name: 'Обычное событие', visitType: '', communityId: '' }));
ok('[12] getEntry: копия заморожена', Object.isFrozen(B.getEntry('e1')) && B.getEntry('e1') !== B.getEntry('e1'));
ok('[12] getEntry: нет/мусор → null', ['nope', '', null, undefined, {}, 42].every((id) => B.getEntry(id) === null));
const c1r = B.candidates({ communityId: 'evt_north', dateFrom: '2028-03-14', dateTo: '2028-03-16' });
ok('[13] candidates: ранг собрание+пересечение, затем близость; обычные исключены',
  same(c1r.map((x) => [x.entry.id, x.score, x.identity, x.overlap, x.near, x.gapDays]), [['e1', 12, true, true, false, 0], ['e2', 8, true, false, false, 161], ['e3', 2, false, false, true, 4]]), JSON.stringify(c1r.map((x) => [x.entry.id, x.score, x.gapDays])));
ok('[13] candidates: typeMatch и копии', B.candidates({ dateFrom: '2028-03-20', dateTo: '2028-03-21', visitType: 'group' })[0].entry.id === 'e3'
  && B.candidates({ dateFrom: '2028-03-20', dateTo: '2028-03-21', visitType: 'group' })[0].score === 5 && c1r.every((x) => Object.isFrozen(x) && Object.isFrozen(x.entry)));
ok('[13] candidates без критериев — пусто; all — все записи, с обычными', B.candidates({}).length === 0 && B.candidates().length === 0
  && same(B.candidates({ all: true }).map((x) => x.entry.id).sort(), ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']));
ok('[13] candidates(evt_idle): у объекта без записей кандидатов нет', B.candidates({ communityId: 'evt_idle' }).length === 0);
ok('urlForEntry: контракт #calendar?entry=<id>', B.urlForEntry('e1') === '../circuit-planner/index.html#calendar?entry=e1'
  && B.urlForEntry('a b') === '../circuit-planner/index.html#calendar' && B.urlForEntry(null) === '../circuit-planner/index.html#calendar');
ok('isEntryId: синтаксис id', B.isEntryId('e1') && B.isEntryId('a.b_~@+-1') && !B.isEntryId('a b') && !B.isEntryId('') && !B.isEntryId(null) && !B.isEntryId('x'.repeat(201)));
ok('прежние поля API на месте', ['init', 'refresh', 'ready', 'status', 'isEntryId', 'listEntries', 'getEntry', 'candidates', 'urlForEntry', 'subscribe'].every((k) => typeof B[k] === 'function')
  && B.MODULE === 'circuit-planner' && B.REV_KEY === REV && same(B.VISIT_TYPES, ['congregation', 'group', 'pregroup']));
const e1 = B.getEntry('e1');
ok('[12] getEntry: прежний набор полей', JSON.stringify(Object.keys(e1).sort()) === JSON.stringify(['communityId', 'end', 'eventId', 'id', 'name', 'start', 'title', 'visitType']));
ok('[13] candidates all: обычные записи есть', B.candidates({ all: true }).some((x) => x.entry.id === 'e5'));

notes.length = 0;
await writePlanner(blob(EVENTS.concat([{ id: 'evt_new', name: 'Новое собрание', visitType: 'congregation' }]), ENTRIES));
ok('[14] новый объект без записи → уведомление подписчику', notes.length === 1 && notes[0] === 'ok' && B.listCommunities().some((c) => c.communityId === 'evt_new'));
notes.length = 0;
await writePlanner(blob(EVENTS.concat([{ id: 'evt_new', name: 'Новое собрание', visitType: 'congregation' }]), ENTRIES));
ok('[14] тот же канон → без лишнего уведомления', notes.length === 0);
notes.length = 0;
await writePlanner(blob(EVENTS, ENTRIES));
ok('[14] объект удалён → уведомление', notes.length === 1 && !B.listCommunities().some((c) => c.communityId === 'evt_new'));

await writePlanner('{not json');
ok('[15] invalid: список пуст, но статус invalid', B.status() === 'invalid' && B.listCommunities().length === 0);
await writePlanner(JSON.stringify({ entries: [] }));
ok('[15] не тот блоб → invalid', B.status() === 'invalid');
const realGet = CWDB.state.get;
CWDB.state.get = () => Promise.reject(new Error('boom'));
const realErr = console.error; console.error = () => {};
await B.refresh();
console.error = realErr;
CWDB.state.get = realGet;
ok('[15] unavailable отличим от пустого', B.status() === 'unavailable' && B.listCommunities().length === 0);
await writePlanner(blob([], []));
ok('[15] настоящий пустой список: status ok, 0 объектов', B.status() === 'ok' && B.listCommunities().length === 0);
await writePlanner(blob(EVENTS, ENTRIES));
ok('восстановлено после сбоя', B.status() === 'ok' && B.listCommunities().length === 4);

/* ═══ 2. CWJournal.overview ══════════════════════════════════════════════ */
console.log('\n2. CWJournal.overview.read()');
const CANARY = 'КАНАРЕЙКА-O1';
const c1 = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район А' });
const c2 = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район Б' });
const cArch = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Район Архив' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: c1, label: 'Собрание', communityId: 'evt_north' });
const grp = await J.nodes.add({ kind: 'group', parentId: cong, label: 'Группа' });
const congArch = await J.nodes.add({ kind: 'congregation', parentId: c2, label: 'Собрание в архиве' });
const congInArchCircuit = await J.nodes.add({ kind: 'congregation', parentId: cArch, label: 'Под архивным районом' });

const vOld = await J.visits.add({ nodeId: cong, dateFrom: '2027-10-01', dateTo: '2027-10-05' });
const vNew = await J.visits.add({ nodeId: cong, dateFrom: '2028-03-13', dateTo: '2028-03-18' });
const vGrp = await J.visits.add({ nodeId: grp, dateFrom: '2028-03-20', dateTo: '2028-03-22' });
const vSame = await J.visits.add({ nodeId: grp, dateFrom: '2028-03-13', dateTo: '2028-03-14' });
const vArch = await J.visits.add({ nodeId: cong, dateFrom: '2028-01-10', dateTo: '2028-01-12' });
const vInArchNode = await J.visits.add({ nodeId: congArch, dateFrom: '2028-02-01', dateTo: '2028-02-02' });
const vInArchCircuit = await J.visits.add({ nodeId: congInArchCircuit, dateFrom: '2028-02-05', dateTo: '2028-02-06' });

const tDueLate = await J.tasks.add({ nodeId: cong, body: 'Срок позже', dueDate: '2028-05-01' });
const tNoDue = await J.tasks.add({ nodeId: c1, body: 'Без срока' });
const tDueEarly = await J.tasks.add({ nodeId: grp, body: 'Срок раньше', dueDate: '2028-04-01' });
const tDone = await J.tasks.add({ nodeId: cong, body: 'Сделано' });
await J.tasks.complete(tDone);
const tArchNode = await J.tasks.add({ nodeId: congArch, body: 'Узел в архиве' });
const tArchVisit = await J.visitRecords.add(vArch, { type: 'todo', body: 'Задача архивного посещения' });
const tVisit = await J.visitRecords.add(vOld, { type: 'todo', body: 'Задача посещения' });
const tProt = await J.tasks.add({ nodeId: cong, body: 'Секрет ' + CANARY, dueDate: '2028-06-01' });

const q1 = await J.visitRecords.add(vOld, { type: 'question', body: 'Вопрос из старого' });
const q2 = await J.visitRecords.add(vNew, { type: 'note', body: 'Заметка из нового' });
const q3 = await J.visitRecords.add(vOld, { type: 'observation', body: 'Второй из старого' });
const qArch = await J.visitRecords.add(vArch, { type: 'question', body: 'Из архивного посещения' });
const qClosed = await J.visitRecords.add(vOld, { type: 'question', body: 'Будет закрыт' });
for (const id of [q1, q2, q3, qArch, qClosed]) await J.carry.mark(id);
await J.carry.touch(qClosed, vNew, 'closed');

const pActive = await J.projects.add({ circuitId: c1, title: 'Проект А' });
const pDone = await J.projects.add({ circuitId: c1, title: 'Проект завершён' });
await J.projects.complete(pDone);
const pArch = await J.projects.add({ circuitId: c2, title: 'Проект в архиве' });
await J.projects.archive(pArch);
const pInArchCircuit = await J.projects.add({ circuitId: cArch, title: 'Проект архивного района' });
const pB = await J.projects.add({ circuitId: c2, title: 'Проект Б' });

await J.visits.archive(vArch);
await J.nodes.archive(congArch);
await J.nodes.archive(cArch);
await J.visits.complete(vOld);

const tasksScreen = await J.tasks.list();
const beforeDump = await dump();
const lsBefore = lsWrites.length;
let ov = await J.overview.read();
const afterFirstDump = await dump();

ok('[16] районы — из Журнала', ov.circuits.map((c) => c.id).join() === [c1, c2].join());
ok('[17] архивный район исключён', !ov.circuits.some((c) => c.id === cArch));
const taskIds = ov.tasks.map((r) => r.id);
ok('[18] открытые задачи реальные', taskIds.includes(tDueLate) && taskIds.includes(tNoDue) && taskIds.includes(tDueEarly) && taskIds.includes(tVisit) && !taskIds.includes(tDone));
ok('[22] задачи архивного контекста исключены (узел, посещение)', !taskIds.includes(tArchNode) && !taskIds.includes(tArchVisit));
const screenOrder = tasksScreen.filter((r) => taskIds.includes(r.id)).map((r) => r.id);
ok('[19] порядок = порядок экрана «Задачи» (tasks.list)', JSON.stringify(taskIds) === JSON.stringify(screenOrder), taskIds.join() + ' / ' + screenOrder.join());
ok('[19] сроки раньше, без срока — после', taskIds.indexOf(tDueEarly) < taskIds.indexOf(tDueLate) && taskIds.indexOf(tDueLate) < taskIds.indexOf(tNoDue));
const carryIds = ov.carry.map((r) => r.id);
ok('[21] открытый перенос реальный, по источнику и seq', JSON.stringify(carryIds) === JSON.stringify([q1, q3, q2]), carryIds.join());
ok('[21] закрытый пункт не показан', !carryIds.includes(qClosed));
ok('[22] перенос из архивного посещения исключён', !carryIds.includes(qArch));
ok('[21] тот же канон, что carry.openForNode', (await J.carry.openForNode(cong)).map((r) => r.id).filter((id) => id !== qArch).sort().join() === carryIds.slice().sort().join());
const projIds = ov.projects.map((r) => r.id);
ok('[23] активные проекты реальные', projIds.includes(pActive) && projIds.includes(pB) && !projIds.includes(pDone));
ok('[24] архивный проект исключён', !projIds.includes(pArch));
ok('[25] проект архивного района исключён', !projIds.includes(pInArchCircuit));
ok('[23] порядок projects.sort', JSON.stringify(projIds) === JSON.stringify(J.projects.sort(ov.projects).map((r) => r.id)));
const vis = ov.visits.map((x) => x.visit.id);
ok('[26] посещения реальные, open и completed', vis.includes(vOld) && vis.includes(vNew) && vis.includes(vGrp));
ok('[22] архивное посещение и посещения архивного контекста исключены', !vis.includes(vArch) && !vis.includes(vInArchNode) && !vis.includes(vInArchCircuit));
ok('[27] порядок: по dateFrom, новые сверху', vis.length === 4 && vis[0] === vGrp && vis[3] === vOld && [vNew, vSame].every((id) => vis.indexOf(id) > 0 && vis.indexOf(id) < 3));
ok('[27] тот же порядок, что visits.byNode', JSON.stringify((await J.visits.byNode(grp)).map((v) => v.id)) === JSON.stringify(vis.filter((id) => id === vGrp || id === vSame)));
const again = (await J.overview.read()).visits.map((x) => x.visit.id);
ok('[27] повторное чтение — тот же порядок', JSON.stringify(again) === JSON.stringify(vis));
const itNew = ov.visits.find((x) => x.visit.id === vNew);
const itGrp = ov.visits.find((x) => x.visit.id === vGrp);
ok('[28] ids для маршрута: circuit/congregation/visit', itNew.circuitId === c1 && itNew.congregationId === cong && itNew.nodeKind === 'congregation'
  && CWJournalRoute.build.visit(itNew.circuitId, itNew.congregationId, itNew.visit.id) === '#districts/' + c1 + '/congregation/' + cong + '/visit/' + vNew);
ok('[28] посещение группы → собрание-родитель', itGrp.congregationId === cong && itGrp.nodeId === grp && itGrp.nodeKind === 'group');
ok('маршрут разбирается обратно', CWJournalRoute.parse(CWJournalRoute.build.visit(itNew.circuitId, itNew.congregationId, vNew)).visitId === vNew);

/* ═══ 3. J8 ═════════════════════════════════════════════════════════════ */
console.log('\n3. Граница J8');
await J.protection.setup('correct horse battery', tProt);
J.protection.lock();
ov = await J.overview.read();
const pRow = ov.tasks.find((r) => r.id === tProt);
ok('[20] заблокировано: защищённая задача есть, текста нет', pRow && J.protection.isLocked(pRow) && pRow.body === undefined);
ok('[20] ни канарейки, ни расшифровки в результате', !JSON.stringify(ov).includes(CANARY));
await J.protection.unlock('correct horse battery');
const ovU = await J.overview.read();
const uRow = ovU.tasks.find((r) => r.id === tProt);
ok('разблокировано: временная копия как у tasks.list (неперечислимый текст)', uRow && uRow.body.includes(CANARY) && !JSON.stringify(uRow).includes(CANARY));
J.protection.lock();

/* ═══ 4. Только чтение, без опроса, без нового хранилища ═════════════════ */
console.log('\n4. Границы');
await B.refresh();
ok('[29] чтение Обзора ничего не записало в базу', afterFirstDump === beforeDump);
const d1 = await dump();
await J.overview.read(); await B.refresh(); B.listCommunities();
ok('[29] повторное чтение базу не меняет', (await dump()) === d1);
ok('[32] localStorage не тронут чтением', lsWrites.length === lsBefore && ![...mem.keys()].some((k) => /journal|overview/i.test(k)), lsWrites.join());
ok('[30] DB_VERSION = 6', CWDB.DB_VERSION === 6);
const stores = [...(await new Promise((res) => { const r = indexedDB.open('circuit-workspace-db'); r.onsuccess = () => { res(r.result.objectStoreNames); r.result.close(); }; }))].sort();
ok('[29] новых хранилищ нет', JSON.stringify(stores) === JSON.stringify(['communities', 'documents', 'journalEntries', 'journalLinks', 'journalMeta', 'journalNodes', 'meetings', 'people', 'roles', 'snapshots', 'state', 'templates']), stores.join());
ok('[33] опроса нет', intervals === 0);
const plannerSrc = strip(read('shared/planner.js'));
ok('[33] CWPlanner: без таймеров и записи', !/setInterval|setTimeout|\.put\(|\.add\(|setItem|removeItem|caches\.|BroadcastChannel/.test(plannerSrc));
const dataSrc = strip(read('journal/js/data.js'));
const ovSrc = dataSrc.slice(dataSrc.indexOf('var overview = {'), dataSrc.indexOf('var TASK_ID'));
ok('[29/32] overview: только чтение', ovSrc.length > 100 && !/\.(put|add|update|mutate|remove|batch|setItem)\(|localStorage|sessionStorage|setInterval|setTimeout/.test(ovSrc));
ok('overview: одна функция read', JSON.stringify(Object.keys(J.overview)) === '["read"]');
const jsFiles = [];
(function walk(dir) {
  for (const f of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (f.isDirectory()) walk(dir + '/' + f.name);
    else if (f.name.endsWith('.js')) jsFiles.push(dir + '/' + f.name);
  }
})('journal/js');
const rawPlanner = jsFiles.filter((f) => /CWDB\.state|\.state\.get\(|service-year-planner|['"]circuit-planner['"]\s*\)/.test(strip(read(f))));
ok('[31] код Журнала не читает блоб Клиндария', rawPlanner.length === 0, rawPlanner.join());

async function dump() {
  const out = {};
  for (const s of ['journalNodes', 'journalEntries', 'journalLinks', 'journalMeta', 'state', 'communities']) {
    const rows = await CWDB[s].getAll();
    out[s] = rows.map((r) => JSON.stringify(r)).sort();
  }
  return JSON.stringify(out);
}

console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ O1: данные Обзора — только чтение, канон, J8 цел');
process.exit(failed ? 1 : 0);
