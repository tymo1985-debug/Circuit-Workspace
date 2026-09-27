#!/usr/bin/env node
/**
 * Журнал — вкладки района и записи уровня района (0.16.0).
 * Маршрут #districts/<c>/<tab>, фасад CWJournal.districtNotes (создание,
 * правка, смена вида, удаление без связей, J8-защита, архивный район),
 * разметка вкладок (каждая кнопка имеет назначение и свою панель).
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
eval(read('journal/js/route.js'));
await CWDB.init();

const J = CWJournal;
const R = CWJournalRoute;

console.log('\nМаршрут вкладок района');
ok('#districts/c1 → обзор', R.parse('#districts/c1').districtTab === 'overview');
for (const tab of ['congregations', 'entries', 'tasks', 'archive']) {
  const st = R.parse('#districts/c1/' + tab);
  ok('#districts/c1/' + tab, st.districtTab === tab && st.circuitId === 'c1' && !st.normalized);
  ok('build ↔ parse: ' + tab, R.parse(R.build.circuitTab('c1', tab)).districtTab === tab);
}
ok('build overview — без хвоста', R.build.circuitTab('c1', 'overview') === '#districts/c1');
ok('лишний хвост вкладки — нормализация', R.parse('#districts/c1/tasks/x').normalized === true);
ok('собрание и проект не задеты', R.parse('#districts/c1/congregation/n1').congregationId === 'n1' && R.parse('#districts/c1/project/p1').projectId === 'p1');

console.log('\nЗаписи района (CWJournal.districtNotes)');
const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Hamburg' });
const n1 = await J.districtNotes.add(c, { type: 'note', body: 'Заметка района\nвторая строка' });
const q1 = await J.districtNotes.add(c, { type: 'question', body: 'Вопрос района' });
let list = await J.districtNotes.list(c);
ok('две записи района', list.length === 2);
const row = await J.districtNotes.get(n1);
ok('строка: nodeId = circuitId, без visitId', row.nodeId === c && row.circuitId === c && !row.fields && row.status === 'open');
ok('текст с переносом строки сохранён', row.body === 'Заметка района\nвторая строка');
ok('пустой текст — отказ', (await rejects(() => J.districtNotes.add(c, { type: 'note', body: '  ' }))) === 'journal-district-note-empty');
ok('чужой тип — отказ', (await rejects(() => J.districtNotes.add(c, { type: 'todo', body: 'x' }))) === 'journal-district-note-invalid-type');
ok('не район — отказ', (await rejects(() => J.districtNotes.add(cong, { type: 'note', body: 'x' }))) === 'journal-node-not-found');
await J.districtNotes.update(q1, { type: 'note', body: 'Теперь заметка' });
const q1r = await J.districtNotes.get(q1);
ok('смена вида и текста', q1r.type === 'note' && q1r.body === 'Теперь заметка');
ok('неизменяемые поля — отказ', (await rejects(() => J.districtNotes.update(q1, { nodeId: cong }))) === 'journal-district-note-immutable');
ok('запись собрания не видна фасаду', (await J.districtNotes.list(cong)).length === 0);
const congNote = await J.entries.add({ type: 'note', nodeId: cong, circuitId: c, status: 'open', body: 'собрание' });
ok('get() чужой записи — null', (await J.districtNotes.get(congNote)) === null);
ok('правка чужой записи — отказ', (await rejects(() => J.districtNotes.update(congNote, { body: 'x' }))) === 'journal-district-note-not-found');
ok('счётчики экрана: entries.byCircuit видит записи района', (await J.entries.byCircuit(c)).filter((e) => e.nodeId === c && e.type === 'note').length === 2);

console.log('\nУдаление и связи');
const pid = await J.projects.add({ circuitId: c, title: 'Проект' });
await J.projects.link(pid, J.urn.entry(n1));
ok('со связью — отказ', (await rejects(() => J.districtNotes.remove(n1))) === 'journal-district-note-has-links');
await J.projects.unlink(pid, J.urn.entry(n1));
await J.districtNotes.remove(n1);
ok('без связи — удалено', (await J.districtNotes.get(n1)) === null);

console.log('\nЗащита (J8)');
const P = J.protection;
await P.setup('очень-длинная-фраза', q1);
const raw = await CWDB.journalEntries.get(q1);
ok('защищённая строка без открытого текста', !!raw.sec && !('body' in raw));
await J.districtNotes.update(q1, { body: 'Новый секрет' });
const raw2 = await CWDB.journalEntries.get(q1);
ok('правка защищённой — только шифротекст', !!raw2.sec && !('body' in raw2) && raw2.sec.iv !== raw.sec.iv);
ok('раскрытая копия читается', (await J.districtNotes.get(q1)).body === 'Новый секрет');
P.lock('manual');
ok('заблокировано: текст не раскрыт', (await J.districtNotes.get(q1)).body === undefined);
ok('заблокировано: правка текста — отказ', !!(await rejects(() => J.districtNotes.update(q1, { body: 'x' }))));
await P.unlock('очень-длинная-фраза');

console.log('\nАрхивный район');
await J.nodes.archive(c);
ok('новые записи в архивном районе — отказ', (await rejects(() => J.districtNotes.add(c, { type: 'note', body: 'x' }))) === 'journal-district-note-readonly');
await J.nodes.unarchive(c);

console.log('\nРазметка вкладок');
const html = read('journal/index.html');
const tabs = [...html.matchAll(/data-district-tab="([a-z]+)"/g)].map((m) => m[1]);
ok('пять вкладок с назначением', tabs.join(',') === 'overview,congregations,entries,tasks,archive');
for (const tab of tabs) ok('панель для «' + tab + '»', new RegExp('data-district-panel="[^"]*\\b' + tab + '\\b').test(html));
ok('«Открыть» у записей района не отключена', /id="districtEntriesOpen"(?![^>]*disabled)/.test(html));
ok('диалог записи района есть', html.includes('id="noteDialog"'));
const prot = read('journal/js/app/protection.js');
ok('J8: список записей района очищается при блокировке', prot.includes("'districtNotesList'") && prot.includes("'noteDialog'"));

console.log(failed ? `\n${failed} проверок не прошло.` : '\nВкладки района и записи уровня района в порядке.');
process.exit(failed ? 1 : 0);
