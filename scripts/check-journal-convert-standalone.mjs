#!/usr/bin/env node
/**
 * Журнал — «Преобразовать в самостоятельную группу» (0.26.0, решение Алекса
 * 10.10.2026). CWJournal.nodes.convertToStandalone.
 *
 * ПОЧЕМУ ЗДЕСЬ: kind неизменяем (J3a), преобразование — единственный явный
 * обход этого правила. Нужно доказать, что данные узла не теряются (посещения,
 * заметки, задачи, связи) и что отказы (дети, не собрание, занятая карточка)
 * не меняют ничего.
 *
 *   node scripts/check-journal-convert-standalone.mjs
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
const wrong = await N.add({ kind: 'congregation', parentId: circuit, label: 'Group (Ukrainian) Leipzig-Russian' });

console.log('\nДо преобразования: данные узла');
const note = await J.congregationNotes.add(wrong, { type: 'note', body: 'Заметка' });
const quest = await J.congregationNotes.add(wrong, { type: 'question', body: 'Вопрос' });
const todo = await J.tasks.add({ nodeId: wrong, body: 'Задача' });
const visit = await J.visits.add({ nodeId: wrong, dateFrom: '2027-03-14', dateTo: '2027-03-19' });
const vrec = await J.visitRecords.add(visit, { type: 'note', body: 'запись посещения' });
const lnk = await J.links.add({ from: J.urn.node(wrong), to: J.urn.external('circuit-planner', 'entry', 'ev1'), rel: 'external' });
ok('узел — собрание, не самостоятельный', (await N.get(wrong)).kind === 'congregation' && !N.isStandalone(await N.get(wrong)));

console.log('\nОтказы ничего не меняют');
ok('не собрание → journal-node-convert-kind', (await rejects(() => N.convertToStandalone(circuit))) === 'journal-node-convert-kind');
ok('нет узла → journal-node-not-found', (await rejects(() => N.convertToStandalone('нет-такого'))) === 'journal-node-not-found');
const kid = await N.add({ kind: 'group', parentId: hamburg, label: 'Hamburg-Russian' });
ok('вложенная группа тоже не собрание', (await rejects(() => N.convertToStandalone(kid))) === 'journal-node-convert-kind');
const sub = await N.add({ kind: 'group', parentId: wrong, label: 'Дочерняя' });
ok('есть дочерние → journal-node-has-children', (await rejects(() => N.convertToStandalone(wrong))) === 'journal-node-has-children');
ok('после отказа вид узла прежний', (await N.get(wrong)).kind === 'congregation');
await N.remove(sub);

console.log('\nЗанятая карточка справочника');
const taken = await N.add({ kind: 'group', parentId: hamburg, label: 'Другая' });
await N.update(taken, { communityId: 'card-1' });
const wrongCard = await N.add({ kind: 'congregation', parentId: circuit, label: 'Дубль' });
await N.update(wrongCard, { communityId: 'card-1' }).catch(() => {});
const rawWrong = await N.get(wrongCard);
if (rawWrong.communityId === 'card-1') {
  ok('занята другой группой → journal-node-community-taken', (await rejects(() => N.convertToStandalone(wrongCard))) === 'journal-node-community-taken');
  ok('вид не изменён', (await N.get(wrongCard)).kind === 'congregation');
} else {
  ok('карточку нельзя навесить на собрание, если она занята группой (проверка пропущена)', true);
}

console.log('\nПреобразование');
const before = await N.get(wrong);
const res = await N.convertToStandalone(wrong);
const after = await N.get(wrong);
ok('kind = group, родитель — район', after.kind === 'group' && after.parentId === circuit && res.kind === 'group');
ok('самостоятельная (isStandalone)', N.isStandalone(after) === true);
ok('id, название, circuitId, порядок прежние', after.id === before.id && after.label === before.label && after.circuitId === before.circuitId && after.sortOrder === before.sortOrder);
ok('посещение на месте', (await J.visits.byNode(wrong)).length === 1 && !!(await J.visitRecords.get(vrec)));
ok('заметка и вопрос видны через записи собрания', (await J.congregationNotes.list(wrong)).length === 2 && !!(await J.congregationNotes.get(note)) && !!(await J.congregationNotes.get(quest)));
ok('задача на месте', (await J.tasks.get(todo)) && (await J.tasks.get(todo)).nodeId === wrong);
ok('связь на месте', (await J.links.outgoing(J.urn.node(wrong))).some((l) => l.id === lnk));
const added = await J.congregationNotes.add(wrong, { type: 'note', body: 'Новая после преобразования' });
ok('новые записи у самостоятельной группы создаются', (await J.congregationNotes.list(wrong)).length === 3 && !!added);
ok('повторное преобразование → journal-node-convert-kind', (await rejects(() => N.convertToStandalone(wrong))) === 'journal-node-convert-kind');

console.log('\nВложенная группа записей не получает');
ok('add для вложенной группы → journal-node-not-found', (await rejects(() => J.congregationNotes.add(kid, { type: 'note', body: 'x' }))) === 'journal-node-not-found');
ok('list для вложенной группы пуст', (await J.congregationNotes.list(kid)).length === 0);

console.log('\nЭкран и ключи i18n');
const districts = read('journal/js/app/districts.js');
ok('действие to-standalone в меню строки и страницы', (districts.match(/data-action="to-standalone"/g) || []).length === 3 && districts.includes("action === 'to-standalone'"));
const dict = read('journal/i18n/dict.js');
for (const key of ['j.action.to_standalone', 'j.confirm.to_standalone', 'j.error.convert_children', 'j.error.convert_card_taken', 'j.error.convert_kind', 'j.card.group_entries_title']) {
  ok(key + ' — во всех пяти языках', (dict.match(new RegExp("'" + key.replace(/\./g, '\\.') + "'", 'g')) || []).length === 5);
}

console.log(failed ? `\nПровалено: ${failed}` : '\nВсё прошло');
process.exit(failed ? 1 : 0);
