#!/usr/bin/env node
/**
 * Журнал — «Изменить вид и место» (0.30.0, решение Алекса 22.10.2026).
 * CWJournal.nodes.inspectRelocate / relocate.
 *
 * ПОЧЕМУ ЗДЕСЬ: kind/parentId неизменяемы через update (J3a), relocate —
 * второй явный обход (после convertToStandalone). Нужно доказать, что
 * данные узла не теряются, изменение обратимо, а отказы (дети, записи у
 * вложенной группы, чужой район, архив, занятая карточка) ничего не меняют.
 *
 *   node scripts/check-journal-relocate.mjs
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


const C = await N.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const C2 = await N.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'Другой район' });
const duis = await N.add({ kind: 'congregation', parentId: C, label: 'Duisburg' });
const kassel = await N.add({ kind: 'congregation', parentId: C, label: 'Kassel' });
const other = await N.add({ kind: 'congregation', parentId: C2, label: 'Чужое собрание' });
const hh = await N.add({ kind: 'congregation', parentId: C, label: 'Group (Ukrainian) Hamburg-Russian-West', communityId: 'ev-hh' });
const kid = await N.add({ kind: 'group', parentId: duis, label: 'Группа Север' });

console.log('\nДанные узла до изменения');
const note = await J.congregationNotes.add(hh, { type: 'note', body: 'Заметка' });
const todo = await J.tasks.add({ nodeId: hh, body: 'Задача' });
const visit = await J.visits.add({ nodeId: hh, dateFrom: '2027-03-14', dateTo: '2027-03-19' });
const vrec = await J.visitRecords.add(visit, { type: 'question', body: 'На следующее' });
await J.carry.mark(vrec);
const lnk = await J.links.add({ from: J.urn.node(hh), to: J.urn.external('circuit-planner', 'entry', 'ev1'), rel: 'external' });
const ids = async () => (await J.entries.byNode(hh)).map((e) => e.id).sort().join();
const before = await ids();

console.log('\nПроверка (только чтение)');
const p1 = await N.inspectRelocate(hh, { kind: 'group', parentId: C });
ok('собрание → самостоятельная группа: без помех', p1.blockers.length === 0 && !p1.nested, p1.blockers.join());
ok('счётчики: посещение, запись посещения, задача, заметка, перенос, связь', p1.counts.visits === 1 && p1.counts.records === 1 && p1.counts.tasks === 1
  && p1.counts.notes === 1 && p1.counts.carry === 1 && p1.counts.links === 1, JSON.stringify(p1.counts));
ok('карточка справочника свободна', p1.community === 'free');
ok('проверка ничего не записала', (await N.get(hh)).kind === 'congregation' && (await ids()) === before);
ok('то же самое → journal-node-relocate-same', (await N.inspectRelocate(hh, { kind: 'congregation', parentId: C })).blockers.includes('journal-node-relocate-same'));
ok('чужой район → journal-node-relocate-parent', (await N.inspectRelocate(hh, { kind: 'group', parentId: other })).blockers.includes('journal-node-relocate-parent'));
ok('собрание под собранием → journal-node-relocate-parent', (await N.inspectRelocate(hh, { kind: 'congregation', parentId: duis })).blockers.includes('journal-node-relocate-parent'));
ok('группа под группой → journal-node-relocate-parent', (await N.inspectRelocate(hh, { kind: 'group', parentId: kid })).blockers.includes('journal-node-relocate-parent'));
ok('вид «район» → journal-node-relocate-kind', (await N.inspectRelocate(hh, { kind: 'circuit', parentId: J.ROOT_PARENT })).blockers.includes('journal-node-relocate-kind'));
ok('с заметками во вложенную группу → journal-node-has-notes', (await N.inspectRelocate(hh, { kind: 'group', parentId: duis })).blockers.includes('journal-node-has-notes'));
ok('собрание с группами перестаёт быть собранием → journal-node-has-children', (await N.inspectRelocate(duis, { kind: 'group', parentId: C })).blockers.includes('journal-node-has-children'));
ok('relocate с помехой — отказ, ничего не меняется', (await rejects(() => N.relocate(duis, { kind: 'group', parentId: C }))) === 'journal-node-has-children' && (await N.get(duis)).kind === 'congregation');

console.log('\nСобрание → самостоятельная группа (случай Hamburg)');
const r1 = await N.relocate(hh, { kind: 'group', parentId: C }, { expect: p1.signature });
let n = await N.get(hh);
ok('стал самостоятельной группой', n.kind === 'group' && n.parentId === C && N.isStandalone(n) && r1.kind === 'group');
ok('посещения, записи, задачи, перенос не тронуты', (await ids()) === before && (await J.visits.byNode(hh)).length === 1 && (await J.carry.openForNode(hh)).length === 1);
ok('связь и карточка справочника на месте', (await J.links.from(J.urn.node(hh))).some((l) => l.id === lnk) && n.communityId === 'ev-hh');
ok('заметка видна (самостоятельная группа ведёт записи)', (await J.congregationNotes.list(hh)).some((r) => r.id === note));
ok('устаревшая подпись → journal-node-changed', (await rejects(() => N.relocate(hh, { kind: 'congregation', parentId: C }, { expect: p1.signature }))) === 'journal-node-changed');

console.log('\nОбратно и дальше');
await N.relocate(hh, { kind: 'congregation', parentId: C });
ok('группа → снова собрание (обратимо)', (await N.get(hh)).kind === 'congregation' && (await ids()) === before);
await N.relocate(kid, { kind: 'pregroup', parentId: duis });
ok('группа → предгруппа того же собрания', (await N.get(kid)).kind === 'pregroup' && (await N.get(kid)).parentId === duis);
await N.relocate(kid, { kind: 'pregroup', parentId: kassel });
n = await N.get(kid);
ok('перенос под другое собрание района, circuitId тот же', n.parentId === kassel && n.circuitId === C);
await N.relocate(kid, { kind: 'group', parentId: C });
ok('вложенная → самостоятельная группа', N.isStandalone(await N.get(kid)));
await N.relocate(kid, { kind: 'congregation', parentId: C });
ok('группа → собрание', (await N.get(kid)).kind === 'congregation');
ok('теперь у Duisburg нет детей — может стать группой', (await N.inspectRelocate(duis, { kind: 'group', parentId: C })).blockers.length === 0);

console.log('\nКарточка справочника (R2) и архив');
const g2 = await N.add({ kind: 'group', parentId: C, label: 'Другая группа', communityId: 'ev-x' });
const cx = await N.add({ kind: 'congregation', parentId: C, label: 'Собрание с той же карточкой', communityId: 'ev-x' });
ok('карточку уже держит группа → journal-node-community-taken', (await N.inspectRelocate(cx, { kind: 'group', parentId: C })).blockers.includes('journal-node-community-taken'));
ok('…а собранием остаться можно (собрание делит карточку)', (await N.inspectRelocate(g2, { kind: 'congregation', parentId: C })).blockers.length === 0);
await N.archive(kassel);
ok('архивное собрание как новое место → journal-node-relocate-parent', (await N.inspectRelocate(g2, { kind: 'group', parentId: kassel })).blockers.includes('journal-node-relocate-parent'));
await N.archive(g2);
ok('архивный узел → journal-node-archived', (await N.inspectRelocate(g2, { kind: 'congregation', parentId: C })).blockers.includes('journal-node-archived'));
ok('update по-прежнему не меняет kind/parentId', (await rejects(() => N.update(cx, { kind: 'group' }))) === 'journal-immutable-kind'
  && (await rejects(() => N.update(cx, { parentId: duis }))) === 'journal-immutable-parent');

console.log('\nЭкран и ключи i18n');
const districts = read('journal/js/app/districts.js');
ok('пункт «Изменить вид и место» в меню строки и страницы', (districts.match(/data-action="relocate"/g) || []).length >= 2 && districts.includes("action === 'relocate'"));
ok('старый пункт «Преобразовать» заменён', !districts.includes('data-action="to-standalone"'));
ok('экран меняет только через nodes.relocate, с подписью и копией', /CWJournal\.nodes\.relocate\([^)]*expect/.test(districts) && /downloadRelocateCopy\(plan\)[\s\S]{0,400}nodes\.relocate/.test(districts));
const dict = read('journal/i18n/dict.js');
for (const key of ['j.action.relocate', 'j.relocate.title', 'j.relocate.apply', 'j.error.has_notes', 'j.error.relocate_parent']) {
  ok(key + ' — во всех пяти языках', (dict.match(new RegExp("'" + key.replace(/\./g, '\\.') + "'", 'g')) || []).length === 5);
}

console.log(failed ? `\nПровалено: ${failed}` : '\nВсё прошло');
process.exit(failed ? 1 : 0);
