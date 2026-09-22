#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-carry-tasks.mjs
 *
 * Фаза J5: перенос «на следующее посещение» (CWJournal.carry) и единый
 * жизненный цикл задач (CWJournal.tasks). Один логический пункт — одна
 * строка journalEntries; история посещений — в touches[]; закрытие переноса
 * физически удаляет carryKey.
 *
 *   node scripts/check-journal-carry-tasks.mjs   (fake-indexeddb, acorn)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

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
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

eval(read('shared/db.js'));
eval(read('journal/js/data.js'));
await CWDB.init();
const J = CWJournal;
const C = J.carry;
const T = J.tasks;
const raw = (id) => CWDB.journalEntries.get(id);
const rowCount = async () => (await CWDB.journalEntries.getAll()).length;

const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-T' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Северное' });
const cong2 = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Южное' });
const grp = await J.nodes.add({ kind: 'group', parentId: cong, label: 'Группа' });
const v1 = await J.visits.add({ nodeId: cong, dateFrom: '2027-03-14', dateTo: '2027-03-19' });
const v2 = await J.visits.add({ nodeId: cong, dateFrom: '2027-11-08', dateTo: '2027-11-13' });
const v3 = await J.visits.add({ nodeId: cong, dateFrom: '2028-04-09', dateTo: '2028-04-14' });
const vOther = await J.visits.add({ nodeId: cong2, dateFrom: '2028-01-01', dateTo: '2028-01-02' });

/* ═══ 1. Пометка и физическое снятие ════════════════════════════════════ */
console.log('\n1. mark / unmark / физическое удаление carryKey');
const q = await J.visitRecords.add(v1, { type: 'question', body: 'Уточнить, как идёт изучение' });
const n0 = await rowCount();
const m = await C.mark(q);
ok('mark: carryKey = <nodeId>:open', m.carryKey === cong + ':open');
ok('mark: touches = [raised в посещении-источнике]', m.touches.length === 1 && m.touches[0].visitId === v1 && m.touches[0].action === 'raised' && !!m.touches[0].at);
ok('mark не создал новой строки', (await rowCount()) === n0);
ok('openForNode находит пункт', (await C.openForNode(cong)).map((r) => r.id).join() === q);
ok('повторный mark отклонён', (await rejects(() => C.mark(q))) === 'journal-carry-already-open');
const um = await C.unmark(q);
ok('unmark: поля carryKey НЕТ физически', !('carryKey' in um) && !('carryKey' in (await raw(q))));
ok('unmark: touches удалены физически', !('touches' in (await raw(q))));
ok('openForNode после unmark пуст', (await C.openForNode(cong)).length === 0);
await C.mark(q);
ok('само посещение переносить нельзя', (await rejects(() => C.mark(v1))) === 'journal-carry-not-eligible');
const plainNote = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'tmp' });
ok('перенос не касается записей вне посещения', (await rejects(() => C.mark(plainNote))) === 'journal-carry-not-eligible');
await J.nodes.remove(plainNote);

/* ═══ 2. Текущее посещение ≠ входящее ═══════════════════════════════════ */
console.log('\n2. Поднятый в V не считается входящим в V');
ok('incoming(v1) не содержит пункт, поднятый в v1', !(await C.incoming(v1)).some((r) => r.id === q));
ok('markedIn(v1) содержит его', (await C.markedIn(v1)).map((r) => r.id).join() === q);
ok('incoming(v2) содержит его (источник раньше)', (await C.incoming(v2)).map((r) => r.id).join() === q);
const vEarly = await J.visits.add({ nodeId: cong, dateFrom: '2026-01-01', dateTo: '2026-01-02' });
ok('incoming(посещение раньше источника) пуст', (await C.incoming(vEarly)).length === 0);
ok('touch из посещения раньше источника отклонён', (await rejects(() => C.touch(q, vEarly, 'kept'))) === 'journal-carry-not-incoming');
ok('touch из самого источника отклонён', (await rejects(() => C.touch(q, v1, 'deferred'))) === 'journal-carry-not-incoming');
ok('touch из посещения другого узла отклонён', (await rejects(() => C.touch(q, vOther, 'kept'))) === 'journal-carry-foreign-visit');
ok('touch с неизвестным посещением отклонён', (await rejects(() => C.touch(q, 'je_nope', 'kept'))) === 'journal-visit-not-found');
ok('неизвестное действие отклонено', (await rejects(() => C.touch(q, v2, 'raised'))) === 'journal-carry-invalid-action');

/* ═══ 3. Один пункт через несколько посещений ═══════════════════════════ */
console.log('\n3. Тот же пункт через несколько посещений');
const before = await rowCount();
await C.touch(q, v2, 'kept');
await C.touch(q, v2, 'deferred');
ok('в v2 пункт помечен дальше: markedIn(v2)', (await C.markedIn(v2)).map((r) => r.id).join() === q);
ok('после действия в v2 пункт всё ещё входящий в v2 (тронут здесь)', (await C.incoming(v2)).some((r) => r.id === q));
ok('stateIn(v2) = deferred', C.stateIn(await raw(q), v2) === 'deferred');
ok('в v3 тот же id — входящий', (await C.incoming(v3)).map((r) => r.id).join() === q);
ok('stateIn(v3) = pending', C.stateIn(await raw(q), v3) === 'pending');
await C.touch(q, v3, 'deferred');
ok('повтор того же действия в том же посещении — не дублируется', (await raw(q)).touches.filter((t) => t.visitId === v3).length === 1 && (await C.touch(q, v3, 'deferred')).touches.length === 4);
ok('ни одной новой строки за все посещения', (await rowCount()) === before);
const hist = (await raw(q)).touches;
ok('история по порядку: raised v1, kept v2, deferred v2, deferred v3',
  hist.map((t) => t.action + ':' + t.visitId).join() === ['raised:' + v1, 'kept:' + v2, 'deferred:' + v2, 'deferred:' + v3].join());
ok('fields.visitId не переписан (источник)', (await raw(q)).fields.visitId === v1);
ok('unmark пункта, тронутого другими посещениями, отклонён', (await rejects(() => C.unmark(q))) === 'journal-carry-has-history');
ok('в touches нет текста пользователя', hist.every((t) => JSON.stringify(Object.keys(t).sort()) === '["action","at","visitId"]'));

/* ═══ 4. Закрытие ═══════════════════════════════════════════════════════ */
console.log('\n4. Закрытие');
const closed = await C.touch(q, v3, 'closed');
ok('closed: carryKey физически удалён', !('carryKey' in closed) && !('carryKey' in (await raw(q))));
ok('closed: openForNode больше не возвращает', !(await C.openForNode(cong)).some((r) => r.id === q));
ok('closed: история сохранена (5 событий, последнее closed)', closed.touches.length === 5 && closed.touches[4].action === 'closed');
const reread = (await CWDB.journalEntries.getAll()).find((r) => r.id === q);
ok('повторное чтение из базы не «воскрешает» carryKey', !('carryKey' in reread));
ok('закрытый пункт остаётся видимым в v3 (тронут здесь), stateIn = closed', (await C.incoming(v3)).some((r) => r.id === q) && C.stateIn(reread, v3) === 'closed');
ok('закрытый не считается «помеченным» в v3', !(await C.markedIn(v3)).some((r) => r.id === q));
ok('touch закрытого отклонён', (await rejects(() => C.touch(q, v3, 'kept'))) === 'journal-carry-not-open');
ok('unmark закрытого отклонён', (await rejects(() => C.unmark(q))) === 'journal-carry-not-open');

/* ═══ 5. Статус посещения ═══════════════════════════════════════════════ */
console.log('\n5. Завершённое / архивное посещение не меняет перенос');
const q2 = await J.visitRecords.add(v2, { type: 'note', body: 'Второй пункт' });
await C.mark(q2);
await J.visits.complete(v3);
ok('touch в завершённом посещении отклонён', (await rejects(() => C.touch(q2, v3, 'kept'))) === 'journal-visit-readonly');
await J.visits.complete(v2);
ok('unmark в завершённом источнике отклонён', (await rejects(() => C.unmark(q2))) === 'journal-visit-readonly');
await J.visits.archive(v2);
ok('mark в архивном источнике отклонён', (await rejects(() => C.mark(q2))) === 'journal-visit-readonly');
await J.visits.unarchive(v2); await J.visits.reopen(v2); await J.visits.reopen(v3);

/* ═══ 6. Задача в переносе ══════════════════════════════════════════════ */
console.log('\n6. Задача в переносе сохраняет свой цикл');
const td = await J.visitRecords.add(v2, { type: 'todo', body: 'Взять контакт координатора' });
await J.visitRecords.complete(td);
await C.mark(td);
ok('перенесённая задача осталась done', (await raw(td)).status === 'done' && (await raw(td)).type === 'todo');
await C.touch(td, v3, 'deferred');
ok('после touch статус задачи не изменился', (await raw(td)).status === 'done');
ok('задача открыта для переноса в индексе', (await C.openForNode(cong)).some((r) => r.id === td));

/* ═══ 7. Задачи: самостоятельные ════════════════════════════════════════ */
console.log('\n7. Самостоятельные задачи');
const s1 = await T.add({ nodeId: grp, body: 'Позвонить координатору', dueDate: '2028-05-01' });
const r1 = await raw(s1);
ok('задача узла: type todo, open, circuitId от узла, без visitId', r1.type === 'todo' && r1.status === 'open' && r1.circuitId === c && r1.nodeId === grp && !r1.fields);
ok('задача района допустима', !!(await T.add({ nodeId: c, body: 'Задача района' })));
ok('несуществующий узел отклонён', (await rejects(() => T.add({ nodeId: 'nope', body: 'x' }))) === 'journal-task-invalid-node');
ok('пустой текст отклонён', (await rejects(() => T.add({ nodeId: grp, body: ' ' }))) === 'journal-visit-record-empty');
ok('неверный срок отклонён', (await rejects(() => T.add({ nodeId: grp, body: 'x', dueDate: '2028-02-30' }))) === 'journal-task-invalid-due');
await new Promise((r) => setTimeout(r, 5));
const e1 = await T.update(s1, { body: 'Позвонить координатору группы', dueDate: '2028-04-20' });
ok('update: body и срок', e1.body === 'Позвонить координатору группы' && e1.dueDate === '2028-04-20' && e1.createdAt === r1.createdAt && e1.updatedAt > r1.updatedAt);
const e2 = await T.update(s1, { dueDate: null });
ok('снятие срока удаляет поле физически', !('dueDate' in e2) && !('dueDate' in (await raw(s1))));
ok('update запрещённого поля отклонён', (await rejects(() => T.update(s1, { status: 'done' }))) === 'journal-task-immutable'
  && (await rejects(() => T.update(s1, { nodeId: cong }))) === 'journal-task-immutable');
ok('complete / reopen', (await T.complete(s1)).status === 'done' && (await T.reopen(s1)).status === 'open');
ok('повторный reopen отклонён', (await rejects(() => T.reopen(s1))) === 'journal-task-invalid-transition');

/* ═══ 8. Единый список и порядок ════════════════════════════════════════ */
console.log('\n8. Единый список задач и порядок');
const a = await T.add({ nodeId: cong, body: 'Без срока' });
const b = await T.add({ nodeId: cong, body: 'Поздний срок', dueDate: '2028-09-01' });
const d = await T.add({ nodeId: cong, body: 'Ранний срок', dueDate: '2028-03-01' });
const all = await T.list();
ok('в списке и задачи посещения, и самостоятельные', all.some((r) => r.id === td) && all.some((r) => r.id === s1));
const openIds = all.filter((r) => r.status === 'open').map((r) => r.id);
ok('открытые: со сроком раньше, ранний первым, без срока в конце',
  openIds.indexOf(d) < openIds.indexOf(b) && openIds.indexOf(b) < openIds.indexOf(a));
ok('выполненные идут после открытых', all.findIndex((r) => r.status === 'done') > all.map((r) => r.status).lastIndexOf('open'));
await new Promise((r) => setTimeout(r, 5));
await T.complete(a);
ok('выполненные: свежие первыми', (await T.list()).filter((r) => r.status === 'done')[0].id === a);
ok('порядок детерминирован (два чтения равны)', (await T.list()).map((r) => r.id).join() === (await T.list()).map((r) => r.id).join());

/* ═══ 9. Задача посещения и экран «Задачи» ══════════════════════════════ */
console.log('\n9. Задача завершённого посещения — только чтение и через tasks');
const vt = await J.visitRecords.add(v3, { type: 'todo', body: 'Задача посещения' });
ok('задача посещения видна в tasks.list', (await T.list()).some((r) => r.id === vt));
ok('в открытом посещении tasks.update меняет срок', (await T.update(vt, { dueDate: '2028-04-30' })).dueDate === '2028-04-30');
await J.visits.complete(v3);
ok('isMutable = false', (await T.isMutable(vt)) === false);
for (const [label, fn] of [['complete', () => T.complete(vt)], ['update', () => T.update(vt, { body: 'x' })], ['remove', () => T.remove(vt)]]) {
  ok(`tasks.${label} в завершённом посещении отклонён`, (await rejects(fn)) === 'journal-visit-readonly');
}
ok('самостоятельная задача остаётся изменяемой', (await T.isMutable(s1)) === true && (await T.complete(s1)).status === 'done');
await J.visits.reopen(v3);

/* ═══ 10. Удаление и связи ══════════════════════════════════════════════ */
console.log('\n10. Удаление и связи');
const lk = await J.links.add({ from: J.urn.node(cong), to: J.urn.entry(s1), rel: 'mentions' });
ok('задача со связью (to) не удаляется', (await rejects(() => T.remove(s1))) === 'journal-task-has-links');
await J.links.remove(lk);
ok('задача без связей удаляется', (await rejects(() => T.remove(s1))) === null && (await raw(s1)) === null);
ok('закрытый пункт с историей не удаляется через visitRecords (закрытие ≠ удаление)', (await rejects(() => J.visitRecords.remove(q))) === 'journal-carry-has-history');
ok('перенесённая задача с историей не удаляется через tasks', (await rejects(() => T.remove(td))) === 'journal-carry-has-history');
ok('посещение с записями не удаляется', (await rejects(() => J.visits.remove(v1))) === 'journal-visit-has-entries');
const vEmpty = await J.visits.add({ nodeId: cong, dateFrom: '2028-10-01', dateTo: '2028-10-02' });
const q3 = await J.visitRecords.add(vEarly, { type: 'note', body: 'для касания' });
await C.mark(q3);
await C.touch(q3, vEmpty, 'kept');
ok('посещение, на которое ссылается история переноса, не удаляется', (await rejects(() => J.visits.remove(vEmpty))) === 'journal-visit-has-carry');
ok('узел с записями не удаляется', (await rejects(() => J.nodes.remove(cong))) !== null);

/* ═══ 11. Обход через общий фасад ═══════════════════════════════════════ */
console.log('\n11. Обход через CWJournal.entries закрыт');
ok('entries.add todo отклонён', (await rejects(() => J.entries.add({ type: 'todo', nodeId: cong, circuitId: c, status: 'open', body: 'x' }))) === 'journal-task-use-facade');
ok('entries.add с carryKey отклонён', (await rejects(() => J.entries.add({ type: 'note', nodeId: cong, circuitId: c, status: 'open', carryKey: cong + ':open' }))) === 'journal-carry-use-facade');
ok('entries.add с touches отклонён', (await rejects(() => J.entries.add({ type: 'note', nodeId: cong, circuitId: c, status: 'open', touches: [] }))) === 'journal-carry-use-facade');
const sx = await T.add({ nodeId: cong, body: 'самостоятельная' });
const sxBefore = JSON.stringify(await raw(sx));
ok('entries.update задачи отклонён', (await rejects(() => J.entries.update(sx, { status: 'done' }))) === 'journal-task-use-facade');
ok('entries.remove задачи отклонён', (await rejects(() => J.entries.remove(sx))) === 'journal-task-use-facade');
ok('задача не изменилась после попыток', JSON.stringify(await raw(sx)) === sxBefore);
const plain = await J.entries.add({ type: 'note', nodeId: cong, circuitId: c, status: 'open', body: 'обычная' });
ok('entries.update → type todo отклонён', (await rejects(() => J.entries.update(plain, { type: 'todo' }))) === 'journal-task-use-facade');
ok('entries.update → carryKey отклонён', (await rejects(() => J.entries.update(plain, { carryKey: cong + ':open' }))) === 'journal-carry-use-facade');
ok('entries.update записи посещения (carryKey) — фасад записи посещения', (await rejects(() => J.entries.update(q2, { carryKey: null }))) === 'journal-visit-record-use-facade');
ok('обычная запись по-прежнему работает', (await J.entries.update(plain, { body: 'обычная 2' })).body === 'обычная 2' && (await rejects(() => J.entries.remove(plain))) === null);

/* ═══ 12. Граница J8 и UI ═══════════════════════════════════════════════ */
console.log('\n12. Граница J8 / UI');
{
  const rows = await CWDB.journalEntries.getAll();
  const withText = rows.filter((r) => typeof r.body === 'string');
  ok('текст не дублируется в fields/touches', withText.every((r) => !JSON.stringify(r.fields || {}).includes(r.body) && !JSON.stringify(r.touches || []).includes(r.body)));
  ok('journalMeta без текста', (await CWDB.journalMeta.getAll()).every((m) => !withText.some((r) => JSON.stringify(m).includes(r.body))));
  ok('в localStorage ничего не записано', mem.size === 0, [...mem.keys()].join());
  const acorn = await import('acorn');
  const walk = await import('acorn-walk');
  const src = read('journal/js/app.js');
  let rawDb = 0;
  walk.full(acorn.parse(src, { ecmaVersion: 2022 }), (n) => {
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'CWDB') rawDb++;
  });
  ok('app.js без прямого CWDB', rawDb === 0, String(rawDb));
  ok('app.js не трогает carryKey/touches напрямую', !/\.carryKey\s*=|\.touches\s*=|delete\s+\w+\.carryKey/.test(src));
  ok('app.js использует CWJournal.carry и CWJournal.tasks',
    ['carry.mark(', 'carry.unmark(', 'carry.touch(', 'carry.incoming(', 'carry.markedIn(', 'tasks.add(', 'tasks.update(', 'tasks.complete(', 'tasks.reopen(', 'tasks.remove(', 'tasks.list('].every((m) => src.includes(m)));
}

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nПеренос и задачи: все проверки пройдены.');
process.exit(failed ? 1 : 0);
