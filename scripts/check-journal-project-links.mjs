#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-project-links.mjs
 *
 * Фаза J7: проект района (CWJournal.projects — строка journalEntries с
 * type 'project', свой жизненный цикл) и доменный фасад связей
 * (CWJournal.links — проверка URN, концов, самосвязи, дубликатов, правила
 * «только чтение»). Отношения проекта — только строки journalLinks
 * (проект → цель), без копий текста и без денормализованных массивов.
 *
 *   node scripts/check-journal-project-links.mjs   (fake-indexeddb, acorn, acorn-walk)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

globalThis.self = globalThis;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

eval(read('shared/db.js'));
eval(read('journal/js/data.js'));
eval(read('journal/js/route.js'));
await CWDB.init();
const J = CWJournal;
const P = J.projects;
const L = J.links;
const raw = (id) => CWDB.journalEntries.get(id);
const allLinks = () => CWDB.journalLinks.getAll();

/* Данные */
const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const c2 = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-04' });
const north = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Северное', communityId: 'com_n' });
const lake = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Приозёрное' });
const grp = await J.nodes.add({ kind: 'pregroup', parentId: lake, label: 'Озёрная' });
const foreign = await J.nodes.add({ kind: 'congregation', parentId: c2, label: 'Чужое' });
const v = await J.visits.add({ nodeId: north, dateFrom: '2028-03-12', dateTo: '2028-03-17' });
const rec = await J.visitRecords.add(v, { type: 'note', body: 'Секретарь: карту территории обновят до конца служебного года' });
const vq = await J.visitRecords.add(v, { type: 'question', body: 'Вместимость зала Северного собрания?' });
const vtodo = await J.visitRecords.add(v, { type: 'todo', body: 'Уточнить вместимость зала' });
const standalone = await J.tasks.add({ nodeId: c, body: 'Согласовать дату с координаторами' });
const unrelated = await J.tasks.add({ nodeId: lake, body: 'Не связанная задача' });
const vForeign = await J.visits.add({ nodeId: foreign, dateFrom: '2028-01-10', dateTo: '2028-01-12' });
const recForeign = await J.visitRecords.add(vForeign, { type: 'note', body: 'чужой район' });

/* ═══ 1. Проект: создание и владелец ══════════════════════════════════ */
console.log('\n1. Проект: строка journalEntries, владелец — район');
const TITLE = 'Подготовка специального собрания';
const BODY = 'Специальное собрание проводится для трёх собраний сразу.\n## Открытые вопросы\n- Вместимость зала\n- Подвоз возвещателей';
const p1 = await P.add({ circuitId: c, title: '  ' + TITLE + '  ', body: BODY, status: 'completed', nodeId: lake, fields: { projectIds: ['x'] }, id: 'hack' });
const r1 = await raw(p1);
ok('type project, nodeId = circuitId = район', r1.type === 'project' && r1.nodeId === c && r1.circuitId === c);
ok('статус active, чужие поля вызывающего не приняты', r1.status === 'active' && !('fields' in r1) && r1.id !== 'hack');
ok('title обрезан, body сохранён как текст', r1.title === TITLE && r1.body === BODY);
ok('createdAt/updatedAt проставлены', !!r1.createdAt && !!r1.updatedAt);
ok('пустое название → отказ', (await rejects(() => P.add({ circuitId: c, title: '   ' }))) === 'journal-project-empty-title');
ok('район обязателен и должен быть районом', (await rejects(() => P.add({ circuitId: north, title: 'x' }))) === 'journal-project-invalid-circuit'
  && (await rejects(() => P.add({ title: 'x' }))) === 'journal-project-invalid-circuit');
const pNoBody = await P.add({ circuitId: c, title: 'Без описания', body: '   ' });
ok('пустое описание — поля body нет', !('body' in (await raw(pNoBody))));
const p2 = await P.add({ circuitId: c, title: 'Второй проект' });
const pOther = await P.add({ circuitId: c2, title: 'Проект другого района' });

/* ═══ 2. Правка и неизменяемость ═════════════════════════════════════ */
console.log('\n2. Правка и неизменяемость');
await sleep(5);
const upd = await P.update(p1, { title: 'Подготовка спецсобрания', body: BODY + '\n- Транспорт' });
ok('update title/body', upd.title === 'Подготовка спецсобрания' && upd.body.endsWith('- Транспорт'));
ok('updatedAt продвинулся', upd.updatedAt > r1.updatedAt);
ok('снятие описания удаляет поле физически', !('body' in (await P.update(pNoBody, { body: '' }))));
for (const [k, val] of [['type', 'note'], ['nodeId', lake], ['circuitId', c2]]) {
  ok(`${k} неизменяем`, (await rejects(() => P.update(p1, { [k]: val }))) === 'journal-project-immutable');
}
ok('тот же type — не ошибка', (await rejects(() => P.update(p1, { type: 'project' }))) === null);
for (const k of ['status', 'archivedAt', 'fields']) {
  ok(`${k} только через цикл`, (await rejects(() => P.update(p1, { [k]: k === 'fields' ? {} : 'archived' }))) === 'journal-project-use-lifecycle');
}
ok('пустое название в update → отказ', (await rejects(() => P.update(p1, { title: ' ' }))) === 'journal-project-empty-title');
ok('чужое поле → отказ', (await rejects(() => P.update(p1, { dueDate: '2028-01-01' }))) === 'journal-project-immutable');
ok('fields у живого проекта нет', !('fields' in (await raw(p1))));

/* ═══ 3. Общий фасад не обходит проект ═══════════════════════════════ */
console.log('\n3. Обход через CWJournal.entries закрыт');
const E = 'journal-project-use-facade';
ok('entries.add type:project', (await rejects(() => J.entries.add({ type: 'project', nodeId: c, circuitId: c, title: 'x' }))) === E);
ok('entries.update проекта', (await rejects(() => J.entries.update(p1, { status: 'completed' }))) === E);
const plain = await J.entries.add({ type: 'note', nodeId: c, circuitId: c, status: 'open', title: 'обычная' });
ok('entries.update: превращение записи в проект', (await rejects(() => J.entries.update(plain, { type: 'project' }))) === E);
ok('entries.remove проекта', (await rejects(() => J.entries.remove(p1))) === E);
ok('чтение через entries не ограничено', (await J.entries.get(p1))?.type === 'project');
await J.entries.remove(plain);

/* ═══ 4. Жизненный цикл ══════════════════════════════════════════════ */
console.log('\n4. Жизненный цикл active ↔ completed → archived');
ok('reopen активного → отказ', (await rejects(() => P.reopen(p2))) === 'journal-project-invalid-transition');
ok('complete', (await P.complete(p2)).status === 'completed');
ok('complete завершённого → отказ', (await rejects(() => P.complete(p2))) === 'journal-project-invalid-transition');
ok('завершённый — не архив', !(await raw(p2)).archivedAt);
const arc = await P.archive(p2);
ok('archive: status archived + archivedAt + statusBeforeArchive (enum)', arc.status === 'archived' && !!arc.archivedAt && arc.fields.statusBeforeArchive === 'completed');
ok('архивный — только чтение', (await rejects(() => P.update(p2, { title: 'x' }))) === 'journal-project-readonly');
ok('archive архивного → отказ', (await rejects(() => P.archive(p2))) === 'journal-project-invalid-transition');
const back = await P.unarchive(p2);
ok('unarchive → прежний статус completed', back.status === 'completed');
ok('archivedAt и fields удалены физически', !('archivedAt' in back) && !('fields' in back));
await P.reopen(p2);
await P.archive(p2);
ok('из active → archived → active', (await P.unarchive(p2)).status === 'active');
ok('unarchive неархивного → отказ', (await rejects(() => P.unarchive(p2))) === 'journal-project-invalid-transition');

/* ═══ 5. Порядок списков ═════════════════════════════════════════════ */
console.log('\n5. Детерминированный список');
await P.complete(pNoBody);
const order = (await P.byCircuit(c)).map((p) => p.id);
ok('byCircuit: только проекты района', order.length === 3 && !order.includes(pOther));
ok('active раньше completed, новые сверху', order[order.length - 1] === pNoBody && order.indexOf(p2) < order.indexOf(p1));
ok('повторный вызов — тот же порядок', JSON.stringify(order) === JSON.stringify((await P.byCircuit(c)).map((p) => p.id)));
ok('list(): все районы', (await P.list()).length === 4);

/* ═══ 6. Фасад связей: URN и концы ═══════════════════════════════════ */
console.log('\n6. CWJournal.links: проверки');
ok('parse journal:node', L.parse(J.urn.node(north))?.kind === 'node');
ok('parse cw:', L.parse('cw:circuit-planner/visit/v_1')?.module === 'circuit-planner');
for (const bad of ['', 'journal:node/', 'journal:thing/x', 'journal:node/a/b', 'journal:node/a b', 'cw:journal/entry/x', 'cw:Bad/kind/x', 'cw:mod/kind/', 'http://x', 'journal:entry/a|b']) {
  ok('битый URN отклонён: ' + JSON.stringify(bad), (await rejects(() => L.add({ from: J.urn.node(north), to: bad, rel: 'relates' }))) === 'journal-link-invalid-urn');
}
ok('неизвестный rel', (await rejects(() => L.add({ from: J.urn.node(north), to: J.urn.node(lake), rel: 'likes' }))) === 'journal-link-invalid-rel');
ok('отсутствующий локальный конец', (await rejects(() => L.add({ from: J.urn.node(north), to: J.urn.entry('je_none'), rel: 'relates' }))) === 'journal-link-missing-endpoint');
ok('самосвязь', (await rejects(() => L.add({ from: J.urn.node(north), to: J.urn.node(north), rel: 'relates' }))) === 'journal-link-self');
ok('оба конца внешние — отказ', (await rejects(() => L.add({ from: 'cw:a/b/c', to: 'cw:a/b/d', rel: 'external' }))) === 'journal-link-invalid-urn');
const gl = await L.add({ from: J.urn.node(north), to: J.urn.node(lake), rel: 'relates', label: 'Северное', title: 'x' });
const glRow = await L.get(gl);
ok('строка связи — только id/from/to/rel/createdAt', JSON.stringify(Object.keys(glRow).sort()) === JSON.stringify(['createdAt', 'from', 'id', 'rel', 'to']));
ok('id с префиксом jl_', /^jl_/.test(gl));
ok('дубликат — тот же id, без новой строки', (await L.add({ from: J.urn.node(north), to: J.urn.node(lake), rel: 'relates' })) === gl
  && (await allLinks()).length === 1);
const [d1, d2] = await Promise.all([
  L.add({ from: J.urn.node(lake), to: J.urn.node(north), rel: 'mentions' }),
  L.add({ from: J.urn.node(lake), to: J.urn.node(north), rel: 'mentions' }),
]);
ok('параллельный дубликат — одна строка', d1 === d2 && (await allLinks()).length === 2);
ok('outgoing/incoming/forRef/between', (await L.outgoing(J.urn.node(north))).length === 1 && (await L.incoming(J.urn.node(north))).length === 1
  && (await L.forRef(J.urn.node(north))).length === 2 && (await L.between(J.urn.node(north), J.urn.node(lake))).map((l) => l.id).join() === gl);
const ext = await L.add({ from: J.urn.node(north), to: 'cw:circuit-planner/visit/v_77', rel: 'external' });
ok('внешняя ссылка по синтаксису принята без чужого модуля', !!(await L.get(ext)) && typeof globalThis.App === 'undefined');
await L.remove(ext); await L.remove(gl); await L.remove(d1);
ok('remove', (await allLinks()).length === 0);
ok('remove отсутствующей — не ошибка', (await rejects(() => L.remove('jl_none'))) === null);
ok('связь проекта через общий add — отказ', (await rejects(() => L.add({ from: J.urn.entry(p1), to: J.urn.node(north), rel: 'covers' }))) === E
  && (await rejects(() => L.add({ from: J.urn.node(north), to: J.urn.entry(p1), rel: 'relates' }))) === E);
await J.nodes.archive(grp);
ok('новая связь с архивным узлом — отказ', (await rejects(() => L.add({ from: J.urn.node(north), to: J.urn.node(grp), rel: 'relates' }))) === 'journal-link-archived-endpoint');
await J.nodes.unarchive(grp);

/* ═══ 7. Проект → узлы ═══════════════════════════════════════════════ */
console.log('\n7. Проект → собрания/группы');
const ln1 = await P.link(p1, J.urn.node(north));
const lnRow = await L.get(ln1);
ok('канон: from = проект, to = узел, rel covers', lnRow.from === J.urn.entry(p1) && lnRow.to === J.urn.node(north) && lnRow.rel === 'covers');
await P.link(p1, J.urn.node(lake));
await P.link(p1, J.urn.node(grp));
ok('повторная связь — тот же id', (await P.link(p1, J.urn.node(north))) === ln1 && (await P.links(p1)).length === 3);
ok('сам район — не цель', (await rejects(() => P.link(p1, J.urn.node(c)))) === 'journal-project-invalid-target');
ok('узел другого района — отказ', (await rejects(() => P.link(p1, J.urn.node(foreign)))) === 'journal-link-cross-circuit');
ok('подпись справочника в связь не пишется', !JSON.stringify(await allLinks()).includes('Северное') && !JSON.stringify(await allLinks()).includes('com_n'));
ok('forTarget: проекты собрания', (await P.forTarget(J.urn.node(north))).map((p) => p.id).join() === p1);
ok('связанные узлы в related()', (await P.related(p1)).nodes.map((x) => x.node.id).sort().join() === [north, lake, grp].sort().join());
ok('unlink узла не удаляет узел', (await P.unlink(p1, J.urn.node(grp))) === 1 && !!(await J.nodes.get(grp)));
ok('unlink отсутствующей связи → 0', (await P.unlink(p1, J.urn.node(grp))) === 0);

/* ═══ 8. Проект → задачи, прогресс ══════════════════════════════════ */
console.log('\n8. Проект → задачи, прогресс');
await P.link(p1, J.urn.entry(standalone));
await P.link(p1, J.urn.entry(vtodo));
const t3 = await P.addTask(p1, { body: 'Написать письмо о переносе встречи', dueDate: '2028-03-28' });
const t3row = await raw(t3);
ok('addTask: обычная задача района, без fields.projectId', t3row.type === 'todo' && t3row.nodeId === c && !t3row.fields);
ok('addTask: связь проект → задача', (await L.between(J.urn.entry(p1), J.urn.entry(t3))).length === 1);
let pr = await P.progress(p1);
ok('прогресс 0 из 3', pr.done === 0 && pr.total === 3);
await J.tasks.complete(standalone);
await J.visitRecords.complete(vtodo);
pr = await P.progress(p1);
ok('complete через tasks/visitRecords → 2 из 3', pr.done === 2 && pr.total === 3);
await J.tasks.reopen(standalone);
ok('reopen → 1 из 3', (await P.progress(p1)).done === 1);
ok('прогресс нигде не хранится', !JSON.stringify(await raw(p1)).match(/progress|done|total/));
ok('несвязанная задача не считается', !(await P.related(p1)).tasks.some((x) => x.row.id === unrelated));
ok('удаление связанной задачи — отказ', (await rejects(() => J.tasks.remove(t3))) === 'journal-task-has-links');
ok('задача цела после отказа', !!(await raw(t3)));
ok('удаление связанного проекта — отказ', (await rejects(() => P.remove(p1))) === 'journal-project-has-links');
// Компенсация addTask: связь не записалась → только что созданная задача убрана.
const beforeCount = (await J.tasks.list()).length;
const origLink = P.link;
P.link = () => Promise.reject(new Error('journal-link-missing-endpoint'));
ok('addTask: сбой связи пробрасывается', (await rejects(() => P.addTask(p1, { body: 'полусостояние' }))) === 'journal-link-missing-endpoint');
P.link = origLink;
ok('addTask: несвязанная задача после сбоя не остаётся', (await J.tasks.list()).length === beforeCount);
ok('addTask в архивный проект — отказ', await (async () => { await P.archive(pNoBody); const e = await rejects(() => P.addTask(pNoBody, { body: 'x' })); await P.unarchive(pNoBody); return e === 'journal-project-readonly'; })());
await P.unlink(p1, J.urn.entry(t3));
ok('unlink задачи не удаляет задачу', !!(await raw(t3)) && (await P.progress(p1)).total === 2);

/* ═══ 9. Проект → записи посещения, правило «только чтение» ══════════ */
console.log('\n9. Проект → записи посещения');
const vBefore = JSON.stringify(await raw(v));
const lr = await P.link(p1, J.urn.entry(rec));
ok('rel relates, канон направления', (await L.get(lr)).rel === 'relates' && (await L.get(lr)).from === J.urn.entry(p1));
ok('посещение-источник не изменилось', JSON.stringify(await raw(v)) === vBefore);
ok('запись осталась в своём посещении', (await raw(rec)).fields.visitId === v && !('projectIds' in (await raw(rec)).fields));
ok('related(): фрагмент с посещением-источником', (await P.related(p1)).items.some((x) => x.row.id === rec && x.visit && x.visit.id === v));
ok('запись другого района — отказ', (await rejects(() => P.link(p1, J.urn.entry(recForeign)))) === 'journal-link-cross-circuit');
ok('проект → проект — отказ', (await rejects(() => P.link(p1, J.urn.entry(p2)))) === 'journal-project-invalid-target');
ok('проект → сам себя — отказ', (await rejects(() => P.link(p1, J.urn.entry(p1)))) === 'journal-link-self');
await P.link(p1, J.urn.entry(v));
ok('проект → посещение', (await P.related(p1)).items.some((x) => x.row.id === v));
await J.visits.complete(v);
ok('закрытое посещение: новая связь с записью — отказ', (await rejects(() => P.link(p1, J.urn.entry(vq)))) === 'journal-visit-readonly');
ok('закрытое посещение: снять связь — отказ', (await rejects(() => P.unlink(p1, J.urn.entry(rec)))) === 'journal-visit-readonly');
ok('после отказа связь цела', (await L.between(J.urn.entry(p1), J.urn.entry(rec))).length === 1);
ok('закрытое посещение: связь с самим посещением не снимается', (await rejects(() => P.unlink(p1, J.urn.entry(v)))) === 'journal-visit-readonly');
await J.visits.archive(v);
ok('архивное посещение — тоже только чтение', (await rejects(() => P.unlink(p1, J.urn.entry(rec)))) === 'journal-visit-readonly');
await J.visits.unarchive(v);
await J.visits.reopen(v);
ok('после reopen связь снимается; запись не удалена', (await P.unlink(p1, J.urn.entry(rec))) === 1 && !!(await raw(rec)));
await P.unlink(p1, J.urn.entry(v));
await P.link(p1, J.urn.entry(rec));
ok('удаление связанной записи посещения — отказ', (await rejects(() => J.visitRecords.remove(rec))) === 'journal-visit-record-has-links');
ok('удаление посещения со связанной записью — отказ', (await rejects(() => J.visits.remove(v))) !== null);
const lnP2 = await P.link(p2, J.urn.node(north));
await P.archive(p2);
ok('архивный проект: связи не меняются', (await rejects(() => P.link(p2, J.urn.node(lake)))) === 'journal-project-readonly'
  && (await rejects(() => P.unlink(p2, J.urn.node(north)))) === 'journal-project-readonly');
await P.unarchive(p2);
await P.unlink(p2, J.urn.node(north));
ok('лишняя связь p2 снята', !(await L.get(lnP2)));

/* ═══ 10. Удаление по всему дереву J3–J7 ═════════════════════════════ */
console.log('\n10. Безопасное удаление (обе стороны связи)');
ok('узел со связью (to) не удаляется', (await rejects(() => J.nodes.remove(lake))) !== null);
const leaf = await J.nodes.add({ kind: 'group', parentId: north, label: 'Лист' });
await P.link(p2, J.urn.node(leaf));
ok('лист со связью проекта не удаляется', (await rejects(() => J.nodes.remove(leaf))) === 'journal-node-has-links');
await P.unlink(p2, J.urn.node(leaf));
ok('после отвязки лист удаляется', (await rejects(() => J.nodes.remove(leaf))) === null);
ok('проект со связью (from) не удаляется', (await rejects(() => P.remove(p1))) === 'journal-project-has-links');
ok('после отказа проект и цели целы', !!(await raw(p1)) && !!(await raw(standalone)) && !!(await J.nodes.get(north)));
ok('проект без связей удаляется', (await rejects(() => P.remove(pNoBody))) === null && !(await raw(pNoBody)));
// Висячих локальных URN не остаётся.
const locals = new Set([...(await CWDB.journalNodes.getAll()).map((n) => J.urn.node(n.id)), ...(await CWDB.journalEntries.getAll()).map((e) => J.urn.entry(e.id))]);
ok('нет висячих локальных ссылок', (await allLinks()).every((l) => [l.from, l.to].every((u) => !u.startsWith('journal:') || locals.has(u))));

/* ═══ 11. J6: поиск и архив ═══════════════════════════════════════════ */
console.log('\n11. Поиск и архив');
const S = J.search;
let res = await S.run('спецсобрания');
ok('проект ищется по title', res.results.some((r) => r.id === p1 && r.kind === 'project'));
ok('проект ищется по body', (await S.run('подвоз возвещателей')).results.some((r) => r.id === p1));
ok('текст связанной записи НЕ делает проект найденным', !(await S.run('карту территории')).results.some((r) => r.id === p1));
ok('маршрут проекта из результата', CWJournalRoute.build.project(c, p1) === '#districts/' + encodeURIComponent(c) + '/project/' + encodeURIComponent(p1));
await P.archive(p2);
ok('архивный проект исключён по умолчанию', !(await S.run('второй проект')).results.some((r) => r.id === p2));
ok('includeArchive находит архивный проект', (await S.run('второй проект', { includeArchive: true })).results.some((r) => r.id === p2 && r.archived));
const arch = await J.archive.list();
ok('архив: проект виден как project', arch.some((it) => it.kind === 'project' && it.id === p2));
ok('завершённый проект — не в архиве', await (async () => { await P.complete(p1); const l = await J.archive.list(); await P.reopen(p1); return !l.some((it) => it.id === p1); })());
await J.archive.restore(arch.find((it) => it.id === p2));
ok('восстановление из архива → projects.unarchive', (await raw(p2)).status === 'active' && !('archivedAt' in (await raw(p2))));
ok('после восстановления снова ищется', (await S.run('второй проект')).results.some((r) => r.id === p2));

/* ═══ 12. Маршрут ═════════════════════════════════════════════════════ */
console.log('\n12. Маршрут проекта');
const R = CWJournalRoute.parse;
const rp = R('#districts/c1/project/je_1');
ok('#districts/<c>/project/<p>', rp.route === 'districts' && rp.circuitId === 'c1' && rp.projectId === 'je_1' && !rp.congregationId && !rp.normalized);
ok('…/project без id → район, нормализация', R('#districts/c1/project').normalized && !R('#districts/c1/project').projectId);
ok('лишний хвост → нормализация', R('#districts/c1/project/p/x').normalized && !R('#districts/c1/project/p/x').projectId);
ok('build ↔ parse (кодирование)', R(CWJournalRoute.build.project('c 1', 'p/1')).projectId === 'p/1');
ok('посещение/собрание не задеты', R('#districts/c1/congregation/n1/visit/v1').visitId === 'v1' && R('#districts/c1/congregation/n1/visit/v1').projectId === null);

/* ═══ 13. Граница J8: никаких копий открытого текста ══════════════════ */
console.log('\n13. Граница J8');
const linkDump = JSON.stringify(await allLinks());
const secrets = ['спецсобрани', 'Открытые вопросы', 'Согласовать дату', 'Секретарь', 'карту территории', 'Уточнить вместимость'];
ok('в journalLinks нет текста проекта/задач/записей', secrets.every((s) => !linkDump.includes(s)));
ok('строки связей — ровно 5 полей', (await allLinks()).every((l) => Object.keys(l).length === 5));
ok('journalMeta пуст', (await CWDB.journalMeta.getAll()).length === 0);
ok('в localStorage ничего не записано', mem.size === 0, [...mem.keys()].join());
const entriesDump = await CWDB.journalEntries.getAll();
ok('нет projectIds/linkedItems/копий ссылок ни в одной записи', !JSON.stringify(entriesDump).match(/projectIds|linkedItems|linkedProjects|projectId/));
ok('проект держит текст только в title/body', entriesDump.filter((e) => e.type === 'project').every((e) => !e.fields || JSON.stringify(e.fields) === '{}' || Object.keys(e.fields).every((k) => k === 'statusBeforeArchive')));

/* ═══ 14. Граница UI ↔ данные ═════════════════════════════════════════ */
console.log('\n14. Граница UI');
{
  const src = read('journal/js/app.js');
  let rawDb = 0, projectLiteral = 0, rawLinkWrite = 0;
  walk.full(acorn.parse(src, { ecmaVersion: 2022 }), (n) => {
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'CWDB') rawDb++;
    if (n.type === 'Property' && n.key && (n.key.name === 'type' || n.key.value === 'type') && n.value.type === 'Literal' && n.value.value === 'project') projectLiteral++;
    if (n.type === 'MemberExpression' && n.property && n.property.name === 'links' && n.object.type === 'Identifier' && n.object.name === 'CWJournal') rawLinkWrite++;
  });
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok('app.js не обращается к CWDB', rawDb === 0, String(rawDb));
  ok('app.js не создаёт type:project в обход фасада', projectLiteral === 0, String(projectLiteral));
  ok('app.js не пишет связи мимо CWJournal.projects', rawLinkWrite === 0, String(rawLinkWrite));
  ok('операции проекта через CWJournal.projects.*', ['projects.add(', 'projects.update(', 'projects.complete(', 'projects.archive(', 'projects.unarchive(', 'projects.remove(', 'projects.link(', 'projects.unlink(', 'projects.addTask('].every((m) => src.includes(m)));
  ok('app.js/data.js без localStorage', !/localStorage|sessionStorage/.test(code) && !/localStorage|sessionStorage/.test(read('journal/js/data.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  ok('нет денормализованных projectIds/linkedItems', !/projectIds|linkedItems/.test(code) && !/projectIds|linkedItems/.test(read('journal/js/data.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  ok('маршрут проекта — через CWJournalRoute.build.project', src.includes('CWJournalRoute.build.project('));
  ok('«Связать» в редакторе посещения активировано', /data-cmd="link" disabled>/.test(read('journal/index.html')) && src.includes('openRecordProjectPicker(editor.draft.id)'));
}

/* ═══ 15. Регрессии фасадов J4–J6 ═════════════════════════════════════ */
console.log('\n15. Регрессии J4–J6');
ok('J4: посещение через entries — отказ', (await rejects(() => J.entries.add({ type: 'visit', nodeId: north }))) === 'journal-visit-use-facade');
ok('J4b: запись посещения через entries — отказ', (await rejects(() => J.entries.add({ type: 'note', nodeId: north, fields: { visitId: v } }))) === 'journal-visit-record-use-facade');
ok('J5: задача через entries — отказ', (await rejects(() => J.entries.add({ type: 'todo', nodeId: c }))) === 'journal-task-use-facade');
ok('J5: перенос через entries — отказ', (await rejects(() => J.entries.update(rec, { carryKey: 'x' }))) !== null);
ok('J6: archive.list по-прежнему узлы/посещения', await (async () => { await J.nodes.archive(grp); const l = await J.archive.list(); await J.nodes.unarchive(grp); return l.some((it) => it.kind === 'node' && it.id === grp); })());

console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ J7: проекты и связи — все проверки пройдены');
process.exit(failed ? 1 : 0);
