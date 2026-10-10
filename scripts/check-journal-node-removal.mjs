#!/usr/bin/env node
/**
 * Журнал — удаление узла вместе с содержимым (0.24.0, решение Алекса
 * 10.10.2026). CWJournal.nodes.inspectRemoval / removeWithContents.
 *
 * ПОЧЕМУ ЗДЕСЬ: операция необратимо стирает пользовательские записи. Отказы
 * (дети, посещения, проекты, связи с ними) и атомарность — единственное, что
 * отделяет «убрать ошибочный узел» от потери данных; проверяется слой данных,
 * а не кнопка.
 *
 *   node scripts/check-journal-node-removal.mjs
 *
 * Требует fake-indexeddb.
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
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = { journal: { version: '0.0.0' } };

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e && e.message; } };

eval(read('shared/db.js'));
eval(read('shared/documents.js'));
eval(read('journal/js/crypto.js'));
eval(read('journal/js/data.js'));
await CWDB.init();

const J = CWJournal;
const N = J.nodes;

const circuit = await N.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const hamburg = await N.add({ kind: 'congregation', parentId: circuit, label: 'Hamburg' });

/* Узел, заведённый ошибочно как собрание (как в реальном случае). */
const wrong = await N.add({ kind: 'congregation', parentId: circuit, label: 'Group (Ukrainian) Hamburg-Russian-West' });
const wrongRef = J.urn.node(wrong);

console.log('\nПустой узел');
const plain = await N.add({ kind: 'congregation', parentId: circuit, label: 'Пустой' });
const planPlain = await N.inspectRemoval(plain);
ok('план: ни записей, ни связей, без препятствий', !planPlain.entries.length && !planPlain.links.length && !planPlain.blockers.length);
const plainErr = await rejects(() => N.removeWithContents(plain));
ok('removeWithContents пустого узла работает', plainErr === null && !(await N.get(plain)), plainErr);

console.log('\nРазбор содержимого');
const note = await J.congregationNotes.add(wrong, { type: 'note', body: 'Заметка' });
const quest = await J.congregationNotes.add(wrong, { type: 'question', body: 'Вопрос' });
const todo = await J.tasks.add({ nodeId: wrong, body: 'Задача' });
const other = await J.congregationNotes.add(hamburg, { type: 'note', body: 'Чужая заметка' });
await J.links.add({ from: J.urn.entry(note), to: J.urn.entry(other), rel: 'mentions' });
await J.links.add({ from: wrongRef, to: J.urn.external('circuit-planner', 'entry', 'ev1'), rel: 'external' });
const plan = await N.inspectRemoval(wrong);
ok('счётчики: 1 заметка, 1 вопрос, 1 задача', plan.counts.notes === 1 && plan.counts.questions === 1 && plan.counts.todos === 1);
ok('связи: обе (запись → чужая запись, узел → внешняя)', plan.counts.links === 2 && plan.links.length === 2);
ok('защищённых нет, препятствий нет', plan.counts.protectedCount === 0 && !plan.blockers.length);
ok('inspectRemoval ничего не меняет', (await J.congregationNotes.list(wrong)).length === 2 && (await N.get(wrong)));
ok('старый путь по-прежнему отказывает', (await rejects(() => N.remove(wrong))) === 'journal-node-has-entries');

console.log('\nОтказы (план показывает препятствие, удаление не выполняется)');
const kid = await N.add({ kind: 'group', parentId: wrong, label: 'Дочерняя' });
ok('дети → journal-node-has-children', (await N.inspectRemoval(wrong)).blockers.includes('journal-node-has-children')
  && (await rejects(() => N.removeWithContents(wrong))) === 'journal-node-has-children');
await N.remove(kid);

const visit = await J.visits.add({ nodeId: wrong, dateFrom: '2027-03-14', dateTo: '2027-03-19' });
ok('посещение → journal-node-has-visits', (await rejects(() => N.removeWithContents(wrong))) === 'journal-node-has-visits');
const vrec = await J.visitRecords.add(visit, { type: 'note', body: 'запись посещения' });
const planV = await N.inspectRemoval(wrong);
ok('запись посещения → journal-node-has-visit-records', planV.blockers.includes('journal-node-has-visit-records') && planV.blockers.includes('journal-node-has-visits'));
await J.visitRecords.remove(vrec);
await J.visits.remove(visit);
ok('после снятия посещения препятствий нет', !(await N.inspectRemoval(wrong)).blockers.length);

const proj = await J.projects.add({ circuitId: circuit, title: 'Проект' });
await J.projects.link(proj, wrongRef);
ok('связь с проектом → journal-node-has-foreign-links', (await rejects(() => N.removeWithContents(wrong))) === 'journal-node-has-foreign-links');
await J.projects.unlink(proj, wrongRef);
const hv = await J.visits.add({ nodeId: hamburg, dateFrom: '2027-04-01', dateTo: '2027-04-02' });
const hrec = await J.visitRecords.add(hv, { type: 'note', body: 'x' });
const lnk = await J.links.add({ from: J.urn.entry(note), to: J.urn.entry(hrec), rel: 'mentions' });
ok('связь записи узла с записью посещения → journal-node-has-foreign-links', (await rejects(() => N.removeWithContents(wrong))) === 'journal-node-has-foreign-links');
await J.links.remove(lnk);
ok('после снятия связей препятствий нет', !(await N.inspectRemoval(wrong)).blockers.length);

console.log('\nЗащищённая запись удаляется без ключа и считается отдельно');
await J.protection.setup('очень длинная тестовая фраза 123');
await J.protection.protect(note);
J.protection.lock();
const planProt = await N.inspectRemoval(wrong);
ok('protectedCount = 1', planProt.counts.protectedCount === 1);

console.log('\nПодпись плана: изменение состава → отказ');
const signature = planProt.signature;
const extra = await J.congregationNotes.add(wrong, { type: 'note', body: 'Появилась позже' });
ok('expect со старой подписью → journal-node-changed', (await rejects(() => N.removeWithContents(wrong, { expect: signature }))) === 'journal-node-changed');
ok('после отказа ничего не удалено', (await J.congregationNotes.list(wrong)).length === 3 && !!(await N.get(wrong)));
void extra;

console.log('\nУдаление');
const fresh = await N.inspectRemoval(wrong);
const counts = await N.removeWithContents(wrong, { expect: fresh.signature });
ok('вернулись счётчики', counts.notes === 2 && counts.questions === 1 && counts.todos === 1);
ok('узел удалён', !(await N.get(wrong)));
ok('записи узла удалены', (await J.entries.byNode(wrong)).length === 0);
ok('связи узла и его записей удалены', (await J.links.incoming(wrongRef)).length === 0 && (await J.links.outgoing(wrongRef)).length === 0
  && (await J.links.outgoing(J.urn.entry(note))).length === 0);
ok('соседние данные не тронуты (запись Hamburg, посещение, район)', !!(await J.congregationNotes.get(other)) && !!(await J.visits.get(hv)) && !!(await N.get(circuit)) && !!(await N.get(hamburg)));
ok('повторное удаление → journal-node-not-found', (await rejects(() => N.removeWithContents(wrong))) === 'journal-node-not-found');

console.log('\nПовторный импорт возможен: узла с этим communityId больше нет');
const again = await N.add({ kind: 'group', parentId: hamburg, label: 'Group (Ukrainian) Hamburg-Russian-West' });
ok('группа с тем же названием создаётся родителем Hamburg', (await N.get(again)).kind === 'group' && (await N.get(again)).parentId === hamburg);

console.log('\nЭкран: подтверждение, счётчики, копия до удаления, ключи i18n');
const districts = read('journal/js/app/districts.js');
ok('оба места удаления идут через deleteNode', !/nodes\.remove\(node\.id\)\.then/.test(districts) && (districts.match(/deleteNode\(node\)/g) || []).length >= 2);
ok('копия скачивается ДО removeWithContents', districts.indexOf('downloadNodeExport(plan);') > 0
  && districts.indexOf('downloadNodeExport(plan);') < districts.indexOf('removeWithContents(node.id'));
const dict = read('journal/i18n/dict.js');
for (const key of ['j.confirm.delete_contents', 'j.error.node_has_visits', 'j.error.node_has_other', 'j.error.node_foreign_links', 'j.error.node_changed']) {
  ok(key + ' — во всех пяти языках', (dict.match(new RegExp("'" + key.replace(/\./g, '\\.') + "'", 'g')) || []).length === 5);
}
const core = read('journal/js/app/core.js');
ok('коды отказов сопоставлены сообщениям', ['journal-node-has-visits', 'journal-node-has-visit-records', 'journal-node-has-other-entries', 'journal-node-has-foreign-links', 'journal-node-changed'].every((c) => core.includes("'" + c + "'")));

console.log(failed ? `\nПровалено: ${failed}` : '\nВсё прошло');
process.exit(failed ? 1 : 0);
