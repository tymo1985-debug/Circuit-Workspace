#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-todo-integration.mjs
 *
 * Фаза J9c: общий To Do только для чтения (shared/todo.js, CWTodo) и
 * поставщик задач Журнала (journal/js/todo-provider.js).
 *  - нормализация: одна строка todo — одна задача, ключ/ref/url стабильны;
 *  - статус/срок/mutable живые; перенос и проекты не дублируют задачу;
 *  - J8: у защищённой задачи text = null и при разблокированном Журнале,
 *    sec/шифротекст наружу не выходят;
 *  - ссылка #tasks/<id>: разбор, сборка, нормализация кривого id;
 *  - свежесть без опроса: подписка в вкладке, BroadcastChannel соседних,
 *    pageshow; сигнал без данных; ничего не пишется, localStorage пуст;
 *  - DB_VERSION = 6, новых хранилищ нет, копия Журнала прежняя.
 *
 *   node scripts/check-journal-todo-integration.mjs   (fake-indexeddb)
 */
import { readFileSync } from 'node:fs';
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
globalThis.removeEventListener = (type, fn) => { bus[type] = (bus[type] || []).filter((x) => x !== fn); };
const fire = (type, ev) => (bus[type] || []).forEach((fn) => fn(ev));
let intervals = 0;
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (...a) => { intervals++; return realSetInterval(...a); };
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = { journal: { version: '0.0.0' } };

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e && e.message; } };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

eval(read('shared/db.js'));
eval(read('shared/documents.js'));
eval(read('journal/js/crypto.js'));
eval(read('journal/js/data.js'));
eval(read('journal/js/route.js'));
eval(read('shared/todo.js'));
eval(read('journal/js/todo-provider.js'));
eval(read('shared/backup.js'));
await CWDB.init();

const J = CWJournal;
const T = CWTodo;
const R = CWJournalRoute;
const CANARY = 'CANARY-J9C-' + Math.random().toString(16).slice(2) + '-Ѫ';
const dump = async () => JSON.stringify(await Promise.all(['journalNodes', 'journalEntries', 'journalLinks', 'journalMeta', 'documents', 'templates', 'state'].map((n) => CWDB[n].getAll())));
let notified = 0;
T.subscribe(() => { notified++; });

/* ═══ 1. Нормализация ═══════════════════════════════════════════════════ */
console.log('\n1. Нормализация задач Журнала');
ok('поставщик один — Журнал', JSON.stringify(T.modules()) === '["journal"]');
const circuit = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: circuit, label: 'Северное' });
const tStand = await J.tasks.add({ nodeId: cong, body: 'Позвонить старейшинам', dueDate: '2028-03-10' });
const tNoDue = await J.tasks.add({ nodeId: circuit, body: 'Без срока' });
const visit = await J.visits.add({ nodeId: cong, dateFrom: '2028-03-12', dateTo: '2028-03-17' });
const tVisit = await J.visitRecords.add(visit, { type: 'todo', body: 'Проверить стенд' });
await J.visitRecords.add(visit, { type: 'note', body: 'Заметка — не задача' });
await T.init();
const all = T.list();
ok('три задачи, заметка не попала', all.length === 3, all.length);
const s1 = T.get('journal:' + tStand);
ok('DTO: ровно поля контракта', JSON.stringify(Object.keys(s1).sort()) === JSON.stringify(['dueDate', 'id', 'key', 'module', 'mutable', 'origin', 'protected', 'ref', 'status', 'text', 'url']));
ok('key/module/id/ref стабильны', s1.key === 'journal:' + tStand && s1.module === 'journal' && s1.id === tStand && s1.ref === 'journal:entry/' + tStand);
ok('url — через построитель маршрута', s1.url === '../journal/index.html#tasks/' + encodeURIComponent(tStand) && T.urlFor(s1.key) === s1.url);
ok('самостоятельная: open, срок, текст, mutable', s1.status === 'open' && s1.dueDate === '2028-03-10' && s1.text === 'Позвонить старейшинам' && s1.protected === false && s1.mutable === true);
ok('origin самостоятельной — только метаданные', s1.origin.kind === 'standalone' && s1.origin.nodeId === cong && s1.origin.circuitId === circuit && !('visitId' in s1.origin));
ok('без срока → dueDate null', T.get('journal:' + tNoDue).dueDate === null);
const sv = T.get('journal:' + tVisit);
ok('задача посещения: origin visit, visitId', sv.origin.kind === 'visit' && sv.origin.visitId === visit && sv.mutable === true);
ok('DTO и origin заморожены', Object.isFrozen(s1) && Object.isFrozen(s1.origin));
try { s1.text = 'ПОРЧА'; } catch (_) { /* strict */ }
ok('правка DTO ничего не меняет', T.get(s1.key).text === 'Позвонить старейшинам');
ok('кривые ключи → null', T.get('journal:nope') === null && T.get('bad') === null && T.urlFor('journal:a b') === null && T.urlFor('x') === null);

/* ═══ 2. Живые статус/срок/mutable и подписка ═══════════════════════════ */
console.log('\n2. Живые изменения в этой вкладке');
let n0 = notified;
await J.tasks.complete(tStand);
await tick();
ok('complete в Журнале → done без опроса', T.get('journal:' + tStand).status === 'done' && notified > n0);
await J.tasks.reopen(tStand);
await tick();
ok('reopen → open', T.get('journal:' + tStand).status === 'open');
await J.tasks.update(tNoDue, { dueDate: '2028-05-01' });
await tick();
ok('срок поставлен → виден', T.get('journal:' + tNoDue).dueDate === '2028-05-01');
await J.tasks.update(tNoDue, { dueDate: null });
await tick();
ok('срок снят → null', T.get('journal:' + tNoDue).dueDate === null);

/* ═══ 3. Одна строка — одна задача ══════════════════════════════════════ */
console.log('\n3. Без дублей: перенос и проекты');
await J.carry.mark(tVisit);
const project = await J.projects.add({ circuitId: circuit, title: 'Проект' });
await J.projects.link(project, J.urn.entry(tStand));
await tick();
const todoRows = (await CWDB.journalEntries.getAll()).filter((r) => r.type === 'todo').length;
ok('число задач = числу строк todo', T.list().length === todoRows && todoRows === 3, T.list().length + '/' + todoRows);
ok('ключи уникальны', new Set(T.list().map((x) => x.key)).size === T.list().length);
ok('перенос не дал второй задачи; связь проекта не скопирована', !/carryKey|touches|project|relates|journal:entry\/.*journal:entry/.test(JSON.stringify(T.get('journal:' + tVisit))) && !/Проект/.test(JSON.stringify(T.list())));

/* ═══ 4. mutable по жизненному циклу посещения ══════════════════════════ */
console.log('\n4. Закрытое посещение');
await J.visits.complete(visit);
await tick();
ok('закрытое посещение → mutable false', T.get('journal:' + tVisit).mutable === false);
ok('самостоятельная — по-прежнему mutable', T.get('journal:' + tStand).mutable === true);
ok('менять — только в Журнале: правило там же', (await rejects(() => J.tasks.complete(tVisit))) !== null);
await J.visits.reopen(visit);
await tick();
ok('посещение открыто снова → mutable true', T.get('journal:' + tVisit).mutable === true);

/* ═══ 5. J8 ═════════════════════════════════════════════════════════════ */
console.log('\n5. Граница J8');
const tProt = await J.tasks.add({ nodeId: cong, body: 'Секрет ' + CANARY, dueDate: '2028-04-01' });
await J.protection.setup('correct horse battery', tProt);
await tick();
const sp = T.get('journal:' + tProt);
ok('защищённая: protected=true, text=null', sp.protected === true && sp.text === null);
ok('метаданные защищённой видны (срок/статус)', sp.dueDate === '2028-04-01' && sp.status === 'open');
ok('ни канарейки, ни sec/ct/iv в DTO', !JSON.stringify(T.list()).includes(CANARY) && !/"sec"|"ct"|"iv"|"wrap"/.test(JSON.stringify(T.list())));
ok('разблокировано: Журнал раскрывает текст сам', J.protection.isUnlocked() && (await J.tasks.get(tProt)).body.includes(CANARY));
await T.refresh();
ok('разблокировано: мост текста НЕ отдаёт', T.get('journal:' + tProt).text === null && !JSON.stringify(T.list()).includes(CANARY));
ok('граница интеграции тоже', (await J.integration.task(tProt)).text === null && !JSON.stringify(await J.integration.tasks()).includes(CANARY));
const todoSrc = strip(read('shared/todo.js'));
ok('общий слой не умеет расшифровывать', !/decrypt|CWJournalCrypto|protection|unlock|subtle/.test(todoSrc));
ok('поставщик читает только границу интеграции', !/CWDB|tasks\.get|tasks\.list|revealing|protection/.test(strip(read('journal/js/todo-provider.js'))));
J.protection.lock();

/* ═══ 6. Ссылка #tasks/<id> ═════════════════════════════════════════════ */
console.log('\n6. Ссылка на задачу');
ok('разбор #tasks/<id>', R.parse('#tasks/' + encodeURIComponent(tStand)).taskId === tStand && R.parse('#tasks/' + tStand).route === 'tasks');
ok('#tasks — без задачи', R.parse('#tasks').taskId === null && !R.parse('#tasks').normalized);
for (const bad of ['#tasks/', '#tasks/a b', '#tasks/a/b', '#tasks/%E0%A4%A', '#tasks/<img>', '#tasks/' + 'x'.repeat(201)]) {
  const st = R.parse(bad);
  ok('кривой хвост → нормализация: ' + JSON.stringify(bad.slice(0, 24)), st.route === 'tasks' && st.taskId === null && st.normalized === true);
}
ok('построитель: id кодируется, кривой → #tasks', R.build.task('je_1.a') === '#tasks/je_1.a' && R.build.task('a b') === '#tasks' && R.build.task(null) === '#tasks');
ok('в адресе только id', !/Позвонить|body|text/.test(T.get('journal:' + tStand).url));
const appSrc = read('journal/js/app.js');
const tasksSrc = read('journal/js/app/tasks.js');
ok('маршрут: нормализация → #tasks, иначе renderTasks(taskId)', /if \(state\.normalized\) \{ location\.replace\(CWJournalRoute\.build\.task\(null\)\); return; \}\s*renderTasks\(state\.taskId\);/.test(appSrc));
ok('экран: фокус по сравнению данных, без селектора по id', /all\.filter\(function \(r\) \{ return r\.id === focusId; \}\)/.test(tasksSrc) && !/querySelector\([^)]*focusId/.test(tasksSrc));
ok('экран: защищённая закрытая → обычная разблокировка', /if \(isLockedRow\(focusTask\)\) requestUnlock\(\);/.test(tasksSrc));
ok('экран: нет задачи → обычный #tasks', /if \(focusId && !focusTask && mine === tasksRenderSeq\) \{[\s\S]*?location\.replace\(CWJournalRoute\.build\.task\(null\)\);/.test(tasksSrc));

/* ═══ 7. Свежесть: соседняя вкладка, bfcache ═══════════════════════════ */
console.log('\n7. Свежесть без опроса');
const seen = [];
const spy = new BroadcastChannel('cw-journal');
spy.onmessage = (e) => seen.push(e.data);
await J.tasks.update(tNoDue, { body: 'Текст ' + CANARY });
await tick(80);
ok('запись → сообщение соседним вкладкам', seen.length >= 1);
ok('сообщение без данных (ни id, ни текста)', seen.every((m) => JSON.stringify(Object.keys(m).sort()) === '["kind","rev"]' && !JSON.stringify(m).includes(CANARY) && !JSON.stringify(m).includes(tNoDue)));
/* Соседняя вкладка изменила базу (строка пишется мимо этой вкладки) и шлёт сигнал. */
const other = new BroadcastChannel('cw-journal');
const raw = await CWDB.journalEntries.get(tStand);
await CWDB.journalEntries.put({ ...raw, status: 'done', updatedAt: new Date().toISOString() });
ok('без сигнала — прежнее значение (нет опроса)', T.get('journal:' + tStand).status === 'open');
other.postMessage({ kind: 'entries', rev: 'x' });
await tick(80);
ok('сигнал соседней вкладки → мост обновлён', T.get('journal:' + tStand).status === 'done');
await CWDB.journalEntries.put({ ...raw, status: 'open', updatedAt: new Date().toISOString() });
fire('pageshow', { persisted: true });
await tick(80);
ok('возврат из bfcache → обновлено', T.get('journal:' + tStand).status === 'open');
ok('без setInterval', intervals === 0);
spy.close(); other.close();

/* ═══ 7b. Жизненный цикл чтения: гонки старта ════════════════════════ */
console.log('\n7b. Гонки первого чтения (отдельный экземпляр CWTodo)');
const freshTodo = () => { const box = {}; new Function('self', read('shared/todo.js'))(box); return box.CWTodo; };
const defer = () => { let res; const p = new Promise((r) => { res = r; }); return { p, res }; };
const row = (id, status) => ({ id, status, dueDate: null, text: 't', protected: false, mutable: true, origin: {} });
function fakeProvider(module) {
  const pv = { module, calls: 0, data: [], gate: null, signal: null };
  pv.api = {
    module,
    list: () => { pv.calls++; const snap = pv.data.slice(); if (pv.gate) { const g = pv.gate; pv.gate = null; return g.p.then(() => snap); } return Promise.resolve(snap); },
    ref: (id) => module + ':ref/' + id,
    urlFor: (id) => '#' + id,
    subscribe: (fn) => { pv.signal = fn; return () => {}; },
  };
  return pv;
}
{
  /* 1. Сигнал во время первого чтения: первый проход вернёт старый снимок. */
  const X = freshTodo();
  const A = fakeProvider('alpha');
  A.data = [row('a1', 'open')];
  X.register(A.api);
  const g = defer(); A.gate = g;
  const initP = X.init();
  await tick(5);
  A.data = [row('a1', 'done')];
  A.signal(); A.signal(); A.signal();
  g.res();
  await initP;
  ok('сигнал во время первого чтения не потерян: новое состояние без ручного refresh', X.get('alpha:a1')?.status === 'done', X.get('alpha:a1')?.status);
  ok('пачка сигналов слита в один повтор (2 чтения)', A.calls === 2, A.calls);
  ok('после устаканивания — тишина (нет лишних чтений)', (await tick(40), A.calls === 2));
}
{
  /* 2. Поставщик зарегистрирован во время первого чтения. */
  const X = freshTodo();
  const A = fakeProvider('alpha');
  const B = fakeProvider('beta');
  A.data = [row('a1', 'open')];
  B.data = [row('b1', 'open')];
  X.register(A.api);
  const g = defer(); A.gate = g;
  const initP = X.init();
  await tick(5);
  X.register(B.api);
  g.res();
  await initP;
  ok('поздний поставщик вошёл в итог без ручного refresh', !!X.get('alpha:a1') && !!X.get('beta:b1') && X.list().length === 2, X.list().map((x) => x.key).join());
  ok('повтор регистрации — отказ', (() => { try { X.register(B.api); return false; } catch (e) { return true; } })());
}
{
  /* 3. До первого init() мост ленив: сигнал чтения не запускает. */
  const X = freshTodo();
  const A = fakeProvider('alpha');
  X.register(A.api);
  A.signal(); A.signal();
  await tick(20);
  ok('до init() сигнал не читает (ленивость)', A.calls === 0 && X.status() === 'idle');
  await X.init();
  ok('init() читает один раз', A.calls === 1 && !!X.get('alpha:a1') === false && X.status() === 'empty');
}
{
  /* 4. Перекрывающиеся refresh — одна серия, итог последний. */
  const X = freshTodo();
  const A = fakeProvider('alpha');
  A.data = [row('a1', 'open')];
  X.register(A.api);
  await X.init();
  const g = defer(); A.gate = g;
  const r1 = X.refresh();
  await tick(5);
  A.data = [row('a1', 'done')];
  const r2 = X.refresh();
  g.res();
  await Promise.all([r1, r2]);
  ok('перекрывающиеся refresh: одна серия, итог — последнее состояние', r1 === r2 && X.get('alpha:a1').status === 'done' && A.calls === 3, A.calls);
}
ok('жизненный цикл без опроса и без state-проверки', !/setInterval|setTimeout/.test(todoSrc) && !/state !== 'idle'/.test(todoSrc) && /dirty = true;/.test(todoSrc));

/* ═══ 8. Только чтение, ничего не хранится ══════════════════════════════ */
console.log('\n8. Только чтение');
const before = await dump();
await T.refresh(); T.list(); T.get('journal:' + tStand); await J.integration.tasks(); await J.integration.task(tStand);
ok('мост и граница ничего не пишут в базу', (await dump()) === before);
ok('localStorage не тронут за весь прогон', lsWrites.length === 0 && mem.size === 0, lsWrites.join());
ok('у моста нет методов изменения', ['complete', 'reopen', 'update', 'remove', 'add', 'setDue', 'protect', 'unprotect'].every((m) => !(m in T)));
ok('в общем слое нет записи/хранилищ', !/\.(put|add|update|remove|delete|clear|setItem|mutate|batch)\(|indexedDB|caches\./.test(todoSrc));
ok('граница интеграции без методов изменения', JSON.stringify(Object.keys(J.integration).sort()) === JSON.stringify(['CHANNEL', 'isTaskId', 'onChange', 'task', 'tasks']));
ok('DB_VERSION = 6', CWDB.DB_VERSION === 6);
const stores = [...(await new Promise((res) => { const r = indexedDB.open('circuit-workspace-db'); r.onsuccess = () => { res(r.result.objectStoreNames); r.result.close(); }; }))].sort();
ok('новых хранилищ нет', JSON.stringify(stores) === JSON.stringify(['communities', 'documents', 'journalEntries', 'journalLinks', 'journalMeta', 'journalNodes', 'meetings', 'people', 'roles', 'snapshots', 'state', 'templates']), stores.join());
const reg = CWBackup.MODULES.journal;
ok('копия Журнала прежняя', JSON.stringify(reg.restoreReplace['circuit-workspace-db'].slice().sort()) === JSON.stringify(['journalEntries', 'journalLinks', 'journalMeta', 'journalNodes'])
  && JSON.stringify(reg.local) === '[]' && JSON.stringify(reg.sharedLocal) === '[]');
ok('в копии нет следов моста', !/cw-journal|CWTodo/.test(JSON.stringify(await CWBackup.snapshot(['journal']))));

/* ═══ 9. Подключение и прекэш ═══════════════════════════════════════════ */
console.log('\n9. Оболочка Журнала');
const html = read('journal/index.html').replace(/<!--[\s\S]*?-->/g, '');
const sw = read('journal/sw.js');
const at = (src) => html.indexOf('<script src="' + src + '"');
ok('todo.js и поставщик подключены после data.js и route.js', at('js/route.js') < at('../shared/todo.js') && at('../shared/todo.js') < at('js/todo-provider.js') && at('js/data.js') < at('js/todo-provider.js'));
ok('в прекэше', sw.includes("'../shared/todo.js'") && sw.includes("'./js/todo-provider.js'"));

console.log(failed ? `\n✗ check-journal-todo-integration: ${failed} провал(ов)` : '\n✓ check-journal-todo-integration: всё прошло');
process.exit(failed ? 1 : 0);
