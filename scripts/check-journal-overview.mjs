#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-overview.mjs
 *
 * O2 (разделы 5–7): живой экран Обзора в jsdom — сводка из Журнала и
 * CWPlanner.listCommunities() (idle/invalid/unavailable ≠ 0), превью ≤ 3 с
 * полными счётчиками и существующими маршрутами, фикстура J1 удалена, FAB
 * Обзора скрыт, свежесть без опроса (записи, узлы, Клиндарий, блокировка),
 * гонки поколений (уход с маршрута, блокировка поверх раскрытой отрисовки),
 * сигнал изменений узлов тем же каналом cw-journal.
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

/* ═══ 5. O2: живой Обзор (jsdom, отдельное окно и отдельная база) ═══════ */
console.log('\n5. O2: экран Обзора');
{
  const { JSDOM } = await import('jsdom');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  const html = read('journal/index.html');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { url: 'http://localhost/journal/index.html#overview', pretendToBeVisual: true, runScripts: 'outside-only' });
  const W = dom.window;
  W.indexedDB = new IDBFactory();
  W.IDBKeyRange = IDBKeyRange;
  Object.defineProperty(W, 'crypto', { value: globalThis.crypto, configurable: true });
  W.structuredClone = globalThis.structuredClone;
  W.BroadcastChannel = undefined;
  let wIntervals = 0;
  const realWSetInterval = W.setInterval;
  W.setInterval = (...a) => { wIntervals++; return realWSetInterval(...a); };
  W.alert = () => {}; W.confirm = () => true;
  if (!W.HTMLDialogElement.prototype.showModal) { W.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; W.HTMLDialogElement.prototype.close = function () { this.open = false; }; }
  const errors = [];
  W.console.error = (...a) => { errors.push(a.map(String).join(' ')); };
  const srcs = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
    .filter((src) => !/theme\.js|update\.js|nav\.js/.test(src));
  const evalSrc = (src) => W.eval(read(src.startsWith('../') ? src.slice(3) : 'journal/' + src) + '\n//# sourceURL=' + src);
  // Слой данных — сразу; экраны — после сида и после собственного
  // DOMContentLoaded jsdom, чтобы запуск приложения был ровно один (ниже).
  const split = srcs.indexOf('js/app/core.js');
  srcs.slice(0, split).forEach(evalSrc);
  const doc = W.document;
  const $ = (sel) => doc.querySelector(sel);
  const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  const settle = async () => { for (let i = 0; i < 6; i++) await wait(30); };
  const WJ = W.CWJournal, R = W.CWJournalRoute;
  await W.CWDB.init();

  // Сид: два района (один архивный), собрание, группа, посещения, задачи, перенос, проекты.
  const TXT = 'ЗАЩИЩЁННЫЙ-ТЕКСТ-O2';
  const cA = await WJ.nodes.add({ kind: 'circuit', parentId: WJ.ROOT_PARENT, label: 'Район Живой' });
  const cB = await WJ.nodes.add({ kind: 'circuit', parentId: WJ.ROOT_PARENT, label: 'Район Второй' });
  const cX = await WJ.nodes.add({ kind: 'circuit', parentId: WJ.ROOT_PARENT, label: 'Район Архивный' });
  const cg = await WJ.nodes.add({ kind: 'congregation', parentId: cA, label: 'Собрание Липовое' });
  const gp = await WJ.nodes.add({ kind: 'group', parentId: cg, label: 'Группа Ручей' });
  const v1 = await WJ.visits.add({ nodeId: cg, dateFrom: '2027-10-04', dateTo: '2027-10-09' });
  const v2 = await WJ.visits.add({ nodeId: cg, dateFrom: '2028-03-13', dateTo: '2028-03-18' });
  const v3 = await WJ.visits.add({ nodeId: gp, dateFrom: '2028-04-10', dateTo: '2028-04-11' });
  const v4 = await WJ.visits.add({ nodeId: cg, dateFrom: '2026-05-01', dateTo: '2026-05-02' });
  const taskIds = [];
  for (let i = 1; i <= 5; i++) taskIds.push(await WJ.tasks.add({ nodeId: cg, body: 'Задача номер ' + i, dueDate: '2028-0' + i + '-10' }));
  const carryIds = [];
  for (let i = 1; i <= 4; i++) { const id = await WJ.visitRecords.add(v1, { type: 'question', body: 'Вопрос номер ' + i }); await WJ.carry.mark(id); carryIds.push(id); }
  const pr = await WJ.projects.add({ circuitId: cA, title: 'Проект Живой' });
  await WJ.nodes.archive(cX);
  const tProt = await WJ.tasks.add({ nodeId: cg, body: TXT, dueDate: '2028-01-01' });
  await WJ.protection.setup('correct horse battery', tProt);
  const cProt = carryIds[0];
  await WJ.protection.protect(cProt);
  WJ.protection.lock();

  const PBLOB = (events) => JSON.stringify({ settings: {}, serviceYears: {}, events, entries: [
    { id: 'pe1', eventId: 'ev_c1', start: '2028-03-13', end: '2028-03-18' },
    { id: 'pe2', eventId: 'ev_c1', start: '2027-10-01', end: '2027-10-05' },
    { id: 'pe3', eventId: 'ev_plain', start: '2028-03-14', end: '2028-03-14' },
  ] });
  const PEVENTS = [
    { id: 'ev_c1', name: 'С1', visitType: 'congregation' }, { id: 'ev_c2', name: 'С2', visitType: 'congregation' },
    { id: 'ev_g1', name: 'Г1', visitType: 'group' }, { id: 'ev_p1', name: 'П1', visitType: 'pregroup' },
    { id: 'ev_plain', name: 'Обычное', visitType: '' },
  ];
  await W.CWDB.state.put({ id: 'circuit-planner', payload: PBLOB(PEVENTS), savedAt: Date.now(), rev: 1 });

  const stats = () => [...doc.querySelectorAll('#overviewStats .j-ovstat')].map((x) => x.querySelector('.j-ovstat__value').textContent);
  const rows = (id) => [...doc.querySelectorAll('#' + id + ' .j-row')];
  const ov = () => $('#route-overview').outerHTML;

  // Состояния Клиндария ДО первого чтения: idle не равен нулю.
  await wait(20);
  srcs.slice(split).forEach(evalSrc);
  const A = W.CWJournalApp;
  ok('[7] до чтения Клиндарий idle', W.CWPlanner.status() === 'idle');
  A.renderOverview();
  ok('[7] idle → «…», не 0', [...doc.querySelectorAll('#overviewStats .j-ovstat__value')].slice(1).every((x) => x.textContent === '…'));
  doc.dispatchEvent(new W.Event('DOMContentLoaded'));
  await settle();
  ok('маршрут по умолчанию — Обзор', !$('#route-overview').hidden);
  const st = stats();
  ok('[1] районы — из Журнала (архивный не считается)', st[0] === '2', st.join());
  ok('[2–4] собрания/группы/предгруппы — из listCommunities()', st[1] === '2' && st[2] === '1' && st[3] === '1', st.join());
  ok('[5] обычная запись календаря не считается, посещения не дублируют', st[1] === '2');
  ok('районы → #districts; объекты → Клиндарий', $('#overviewStats a.j-ovstat').getAttribute('href') === '#districts'
    && [...doc.querySelectorAll('#overviewStats a.j-ovstat')].slice(1).every((a) => a.getAttribute('href') === '../circuit-planner/index.html#calendar'));
  ok('статистики — с доступным именем', [...doc.querySelectorAll('#overviewStats .j-ovstat')].every((a) => /: /.test(a.getAttribute('aria-label') || '')));

  // Задачи
  const tr = rows('overviewTasks');
  const LOCKED = A.t('j.locked.title');
  ok('[16] задачи реальные', tr.length && tr.every((r) => (/Задача номер/.test(r.textContent) || r.textContent.includes(LOCKED))));
  ok('[17] превью ≤ 3', tr.length === 3);
  ok('[18] счётчик — полный', $('#overviewTasksCount').textContent === '6');
  ok('[19] «Все» → #tasks', $('#overviewTasksSec a.j-sec__more').getAttribute('href') === '#tasks');
  ok('[20] строка → #tasks/<id>', tr.every((r) => /^#tasks\/[^/]+$/.test(r.getAttribute('href'))) && tr[0].getAttribute('href') === R.build.task(tProt));
  ok('[21/47] заблокировано: текста нет в DOM, есть подпись', !ov().includes(TXT) && tr[0].textContent.includes(LOCKED));
  // Перенос
  const cr = rows('overviewCarry');
  ok('[22] перенос реальный', cr.length && cr.slice(1).every((r) => /Вопрос номер/.test(r.textContent)));
  ok('[23] превью ≤ 3, счётчик полный', cr.length === 3 && $('#overviewCarryCount').textContent === '4');
  ok('[24] строка → существующий маршрут посещения', cr.every((r) => r.getAttribute('href') === R.build.visit(cA, cg, v1)));
  ok('[25] у переноса нет «Все»', !$('#overviewCarrySec .j-sec__more'));
  ok('[26] защищённый перенос не раскрыт', !ov().includes('Вопрос номер 1') && cr[0].textContent.includes(LOCKED));
  // Проекты
  const pRows = rows('overviewProjects');
  ok('[27] проекты реальные', pRows.length === 1 && pRows[0].textContent.includes('Проект Живой') && $('#overviewProjectsCount').textContent === '1');
  pRows[0].click();
  ok('[28] ссылка проекта прежняя', W.location.hash === R.build.project(cA, pr));
  W.location.hash = '#overview'; await settle();
  ok('[29] общий рендер проектов доступен экранам района', typeof A.buildOverviewProjects === 'function' && /renderProjectRows\(box, list\)/.test(read('journal/js/app/projects.js')));
  // Посещения
  const vr = rows('overviewVisits');
  ok('[30] посещения реальные', vr.length && /Собрание Липовое|Группа Ручей/.test(vr[0].textContent));
  ok('[31] превью ≤ 3, новые сверху', vr.length === 3 && vr[0].textContent.includes('Группа Ручей') && $('#overviewVisitsCount').textContent === '4');
  ok('[32] маршруты посещений — существующие', vr[0].getAttribute('href') === R.build.visits(cA, cg) && vr[1].getAttribute('href') === R.build.visit(cA, cg, v2));
  ok('[33] выдуманных счётчиков нет', !/запис(ей|и)\b|\d+ задач/.test(vr.map((r) => r.textContent).join(' ')));
  ok('[34] «История» нет', !ov().includes('j.link.history') && !$('#overviewVisitsSec .j-sec__more'));
  // FAB
  ok('[35] FAB Обзора скрыт', $('#fab').hidden === true);
  W.location.hash = '#tasks'; await settle();
  ok('[36] FAB задач прежний', $('#fab').hidden === false && $('#fabLabel').getAttribute('data-i18n') === 'j.fab.new_task');
  W.location.hash = '#districts'; await settle();
  ok('[36] FAB районов прежний', $('#fab').hidden === false && $('#fabLabel').getAttribute('data-i18n') === 'j.fab.new_circuit');
  W.location.hash = '#overview'; await settle();
  ok('[35] снова Обзор — FAB скрыт', $('#fab').hidden === true);

  // Свежесть
  await WJ.tasks.add({ nodeId: cg, body: 'Новая живая задача' });
  await settle();
  ok('[41] запись Журнала → Обзор обновился', $('#overviewTasksCount').textContent === '7');
  await WJ.nodes.add({ kind: 'circuit', parentId: WJ.ROOT_PARENT, label: 'Район Третий' });
  await settle();
  ok('[42] узел Журнала → Обзор обновился (районы)', stats()[0] === '3', stats().join());
  await W.CWDB.state.put({ id: 'circuit-planner', payload: PBLOB(PEVENTS.concat([{ id: 'ev_c3', name: 'С3', visitType: 'congregation' }])), savedAt: Date.now(), rev: 2 });
  W.dispatchEvent(Object.assign(new W.Event('storage'), { key: W.CWPlanner.REV_KEY }));
  await settle();
  ok('[40] Клиндарий → Обзор обновился', stats()[1] === '3', stats().join());
  await WJ.protection.unlock('correct horse battery');
  await settle();
  ok('[43] разблокировка → текст виден', ov().includes(TXT) && ov().includes('Вопрос номер 1'));
  WJ.protection.lock();
  ok('[46] блокировка: текст убран сразу, до чтения', !ov().includes(TXT) && !ov().includes('Вопрос номер 1'));
  await settle();
  ok('[43] блокировка → перерисовано без текста', !ov().includes(TXT) && rows('overviewTasks').length === 3);

  // Гонки: A — уход с маршрута; B — разблокированная отрисовка, обогнанная блокировкой.
  const realRead = WJ.overview.read;
  let gate = null, release = null;
  WJ.overview.read = async function () { const d = await realRead.apply(this, arguments); if (gate) await gate; return d; };
  gate = new Promise((r) => { release = r; });
  const before = $('#overviewTasks').innerHTML + '|' + $('#overviewTasksCount').textContent;
  const pending = A.renderOverview();
  await WJ.tasks.add({ nodeId: cg, body: 'Задача после ухода' });
  W.location.hash = '#tasks'; await wait(40);
  gate = null; release(); await pending; await settle();
  ok('[45] уход с маршрута до конца чтения → старый результат не вставлен', $('#overviewTasks').innerHTML + '|' + $('#overviewTasksCount').textContent === before);
  W.location.hash = '#overview'; await settle();
  await WJ.protection.unlock('correct horse battery');
  await settle();
  gate = new Promise((r) => { release = r; });
  const stale = A.renderOverview();           // раскрытое чтение ждёт
  await wait(40);
  gate = null;
  WJ.protection.lock();                       // новая отрисовка без текста
  await settle();
  release(); await stale; await settle();
  ok('[46] старая разблокированная отрисовка не вернула текст', !ov().includes(TXT) && !ov().includes('Вопрос номер 1'));
  WJ.overview.read = realRead;

  // Состояния Клиндария и сбой Журнала
  const P = W.CWPlanner;
  await W.CWDB.state.remove('circuit-planner');
  await P.refresh(); await settle();
  ok('[6] Клиндарий пуст (empty) → настоящие нули', P.status() === 'empty' && stats().slice(1).join() === '0,0,0', stats().join());
  await W.CWDB.state.put({ id: 'circuit-planner', payload: '{испорчено', savedAt: Date.now(), rev: 3 });
  await P.refresh(); await settle();
  ok('[8] invalid → не 0', P.status() === 'invalid' && stats().slice(1).every((x) => x === '—'), stats().join());
  const realGet = W.CWDB.state.get;
  W.CWDB.state.get = () => Promise.reject(new Error('boom'));
  await P.refresh(); await settle();
  W.CWDB.state.get = realGet;
  ok('[9] unavailable → не 0', P.status() === 'unavailable' && stats().slice(1).every((x) => x === '—'));
  ok('[7] idle показывается как «…»', read('journal/js/app/overview.js').includes("status === 'idle' ? '…' : '—'"));
  WJ.overview.read = () => Promise.reject(new Error('read failed'));
  await A.renderOverview();
  ok('сбой чтения Журнала → «—» и подсказка, не нули', stats()[0] === '—' && $('#overviewTasksCount').textContent === '—'
    && $('#overviewTasks').textContent.includes(W.CWJournalApp.t('j.overview.unavailable')));
  WJ.overview.read = realRead;
  await A.renderOverview();
  ok('после сбоя — снова реальные данные', stats()[0] === '3');

  // Пусто
  errors.length = errors.filter((e) => !/не прочитан|read failed|boom|не собран/.test(e)).length;
  ok('ошибок консоли нет (кроме намеренных сбоев)', errors.length === 0, errors.join(' | '));
  ok('[44] опроса нет (окно)', wIntervals === 0);
  ok('[50] Обзор ничего не хранит в localStorage', ![...Array(W.localStorage.length).keys()].map((i) => W.localStorage.key(i)).some((k) => /overview|journal/i.test(k)));
  dom.window.close();
}

/* ═══ 6. O2: разметка, маршруты, подписки (статически) ══════════════════ */
console.log('\n6. O2: статические границы');
{
  const html = read('journal/index.html');
  const sec = html.slice(html.indexOf('id="route-overview"'), html.indexOf('</section>', html.indexOf('id="route-overview"')));
  ok('[10] EU-K-03 и выдуманные числа удалены', !/EU-K-03|14 собраний|3 группы|1 предгруппа/.test(html));
  ok('верхнеуровневый Обзор не назван статической фикстурой', !/ОБЗОР[\s\S]{0,10}статическая фикстура/i.test(html));
  const dict = read('journal/i18n/dict.js');
  ok('словарь: старые примеры фикстуры Обзора удалены', !/EU-K-03|Уточнить, как идёт изучение/.test(dict));
  const projSrc = read('journal/js/app/projects.js');
  ok('projects.js: строка проекта не описана как фикстура J1', !/фикстур[аы] J1/i.test(projSrc));
  ok('[11] выдуманные вопросы удалены', !/изучение с семьёй|расписании группы Озёрная|новый координатор/.test(html));
  ok('[12] выдуманные задачи удалены', !/письмо о переносе встречи|встречи со старейшинами|адрес зала у секретаря/.test(html));
  ok('[13] выдуманные посещения удалены', !/Западное — весна 2028|Северное — осень 2027|6 записей|11 записей/.test(html));
  ok('[14] «Недавно изменённые» удалены', !/recent_edits|мысли по организации|вчера, 21:40|сегодня, 09:14/.test(html));
  ok('[15] кнопок без действия в Обзоре нет', !/<button/.test(sec) && (sec.match(/j-sec__more/g) || []).length === 1 && /<a class="j-sec__more" href="#tasks"/.test(sec));
  ok('в Обзоре нет строк-фикстур и стрелок', !/j-row"|<svg/.test(sec));
  ok('удалённые ключи нигде не используются', !/j\.link\.history|j\.section\.recent_edits|j\.fab\.new_entry/.test(html + read('journal/js/app.js') + read('journal/js/app/overview.js')));
  ok('новые ключи на пяти языках', ['j.overview.stat.congregations', 'j.overview.stat.groups', 'j.overview.stat.pregroups', 'j.overview.empty_carry', 'j.overview.empty_tasks', 'j.overview.empty_visits', 'j.overview.unavailable']
    .every((k) => (dict.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 5));
  const R2 = CWJournalRoute;
  ok('[37] пустой хэш → Обзор', R2.parse('').route === 'overview' && R2.parse('#').route === 'overview');
  ok('[38] неизвестный маршрут → Обзор', R2.parse('#nope').route === 'overview' && R2.parse('#overview').route === 'overview');
  ok('[39] внутренний обзор собрания не тронут', R2.parse('#districts/c1/congregation/n1').congTab === 'overview' && R2.parse('#districts/c1/congregation/n1/visits').congTab === 'visits');
  ok('глубокие ссылки прежние', R2.build.task('t1') === '#tasks/t1' && R2.build.project('c', 'p') === '#districts/c/project/p'
    && R2.build.visit('c', 'n', 'v') === '#districts/c/congregation/n/visit/v' && R2.build.visits('c', 'n') === '#districts/c/congregation/n/visits');
  const app = strip(read('journal/js/app.js'));
  ok('[35] fabSpecFor(overview) → null', /state\.route === 'overview'\) return null;/.test(app));
  ok('справочник → renderOverview, одного пути', !/renderOverviewProjects/.test(app + strip(read('journal/js/app/protection.js'))) && (app.match(/renderOverview\(\)/g) || []).length >= 3);
  const ovSrc = strip(read('journal/js/app/overview.js'));
  ok('[40] подписка на Клиндарий', /CWPlanner\.subscribe\(onSourceChange\)/.test(ovSrc));
  ok('[41/42] подписка на изменения Журнала', /CWJournal\.integration\.onChange\(onSourceChange\)/.test(ovSrc));
  ok('[43] смена блокировки → renderOverview', /st\.route === 'overview'\) renderOverview\(\)/.test(strip(read('journal/js/app/protection.js'))));
  ok('[44/50] Обзор: без таймеров, хранилищ, CWDB и сырого Клиндария', !/setInterval|setTimeout|localStorage|sessionStorage|CWDB|indexedDB|state\/circuit-planner|listEntries/.test(ovSrc));
  ok('[45/46] вставка — только текущим поколением на #overview', /gen === overviewRenderSeq && parseHash\(\)\.route === 'overview'/.test(ovSrc) && (ovSrc.match(/if \(!isCurrent\(gen\)\) return;/g) || []).length === 2);
  const sw = read('journal/sw.js');
  const at = (src) => html.indexOf('<script src="' + src + '"');
  ok('overview.js: после protection.js, до app.js; в прекэше', at('js/app/protection.js') < at('js/app/overview.js') && at('js/app/overview.js') < at('js/app.js') && sw.includes("'./js/app/overview.js'"));
}

/* ═══ 7. Сигнал узлов (O2) ════════════════════════════════════════════ */
console.log('\n7. Сигнал изменений узлов');
{
  let n = 0;
  const off = J.integration.onChange(() => { n++; });
  const id = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Сигнал' });
  await tick();
  ok('[42] узел: add → уведомление', n >= 1);
  n = 0; await J.nodes.update(id, { label: 'Сигнал 2' }); await tick();
  ok('[42] узел: update → уведомление', n >= 1);
  n = 0; await J.nodes.archive(id); await tick();
  ok('[42] узел: archive → уведомление', n >= 1);
  n = 0; await J.nodes.unarchive(id); await tick();
  ok('[42] узел: unarchive → уведомление', n >= 1);
  n = 0; await J.nodes.remove(id); await tick();
  ok('[42] узел: remove → уведомление', n >= 1);
  off();
  const dsrc = strip(read('journal/js/data.js'));
  ok('один канал cw-journal, метка без данных', (dsrc.match(/new global\.BroadcastChannel\(/g) || []).length === 1 && /postMessage\(\{ kind: k, rev: rev \}\)/.test(dsrc) && /CHANGE_KINDS = \['entries', 'nodes'\]/.test(dsrc));
}

async function dump() {
  const out = {};
  for (const s of ['journalNodes', 'journalEntries', 'journalLinks', 'journalMeta', 'state', 'communities']) {
    const rows = await CWDB[s].getAll();
    out[s] = rows.map((r) => JSON.stringify(r)).sort();
  }
  return JSON.stringify(out);
}

console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ O1/O2: данные и живой Обзор — только чтение, канон, J8 цел');
process.exit(failed ? 1 : 0);
