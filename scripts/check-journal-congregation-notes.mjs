#!/usr/bin/env node
/**
 * Журнал — вкладка «Записи» собрания (0.17.0).
 * Маршрут #districts/<c>/congregation/<n>/entries, фасад
 * CWJournal.congregationNotes (та же форма строки и те же правила, что у
 * записей района: создание, правка, смена вида, удаление без связей,
 * J8-защита, архивное собрание/район), непересечение с districtNotes,
 * разметка вкладок собрания (у каждой кнопки есть назначение).
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

console.log('\nМаршрут вкладки «Записи» собрания');
const st = R.parse('#districts/c1/congregation/n1/entries');
ok('…/entries → congTab entries', st.congTab === 'entries' && st.congregationId === 'n1' && st.circuitId === 'c1' && !st.normalized);
ok('build ↔ parse', R.parse(R.build.congEntries('c1', 'n1')).congTab === 'entries');
ok('лишний хвост — нормализация', R.parse('#districts/c1/congregation/n1/entries/x').normalized === true);
ok('«Посещения» и «Обзор» не задеты', R.parse('#districts/c1/congregation/n1/visits').congTab === 'visits' && R.parse('#districts/c1/congregation/n1').congTab === 'overview');
ok('вкладка района «Записи» не задета', R.parse('#districts/c1/entries').districtTab === 'entries');

console.log('\nЗаписи собрания (CWJournal.congregationNotes)');
const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Praha' });
const grp = await J.nodes.add({ kind: 'group', parentId: cong, label: 'Группа' });
const CN = J.congregationNotes;
const n1 = await CN.add(cong, { type: 'note', body: 'Заметка собрания\nвторая строка' });
const q1 = await CN.add(cong, { type: 'question', body: 'Вопрос собрания' });
ok('две записи собрания', (await CN.list(cong)).length === 2);
const row = await CN.get(n1);
ok('строка: nodeId = собрание, circuitId = район, без visitId', row.nodeId === cong && row.circuitId === c && !row.fields && row.status === 'open');
ok('текст с переносом строки сохранён', row.body === 'Заметка собрания\nвторая строка');
ok('пустой текст — отказ', (await rejects(() => CN.add(cong, { type: 'note', body: '  ' }))) === 'journal-cong-note-empty');
ok('чужой тип — отказ', (await rejects(() => CN.add(cong, { type: 'todo', body: 'x' }))) === 'journal-cong-note-invalid-type');
ok('район — не собрание, отказ', (await rejects(() => CN.add(c, { type: 'note', body: 'x' }))) === 'journal-node-not-found');
ok('группа — не собрание, отказ', (await rejects(() => CN.add(grp, { type: 'note', body: 'x' }))) === 'journal-node-not-found');
await CN.update(q1, { type: 'note', body: 'Теперь заметка' });
const q1r = await CN.get(q1);
ok('смена вида и текста', q1r.type === 'note' && q1r.body === 'Теперь заметка');
ok('неизменяемые поля — отказ', (await rejects(() => CN.update(q1, { nodeId: c }))) === 'journal-cong-note-immutable');

console.log('\nФасады района и собрания не пересекаются');
const d1 = await J.districtNotes.add(c, { type: 'note', body: 'Заметка района' });
ok('записи района не видны фасаду собрания', (await CN.list(c)).length === 0 && (await CN.get(d1)) === null);
ok('записи собрания не видны фасаду района', (await J.districtNotes.list(c)).length === 1 && (await J.districtNotes.get(n1)) === null);
ok('правка записи района через фасад собрания — отказ', (await rejects(() => CN.update(d1, { body: 'x' }))) === 'journal-cong-note-not-found');
ok('districtNotes по-прежнему отказывает собранию', (await rejects(() => J.districtNotes.add(cong, { type: 'note', body: 'x' }))) === 'journal-node-not-found');
const grpNote = await J.entries.add({ type: 'note', nodeId: grp, circuitId: c, status: 'open', body: 'группа' });
ok('запись группы не видна фасаду собрания', (await CN.get(grpNote)) === null && (await CN.list(grp)).length === 0);
const legacy = await J.entries.add({ type: 'question', nodeId: cong, circuitId: c, status: 'open', body: 'прежняя строка' });
ok('строка собрания той же формы читается фасадом (совместимость)', !!(await CN.get(legacy)));
await J.entries.remove(legacy);
const v = await J.visits.add({ nodeId: cong, dateFrom: '2026-10-01', dateTo: '2026-10-03' });
const vr = await J.visitRecords.add(v, { type: 'note', body: 'запись посещения' });
ok('запись посещения не видна фасаду собрания', (await CN.get(vr)) === null && (await CN.list(cong)).every((r) => r.id !== vr));

console.log('\nУдаление и связи');
const pid = await J.projects.add({ circuitId: c, title: 'Проект' });
await J.projects.link(pid, J.urn.entry(n1));
ok('со связью — отказ', (await rejects(() => CN.remove(n1))) === 'journal-cong-note-has-links');
await J.projects.unlink(pid, J.urn.entry(n1));
await CN.remove(n1);
ok('без связи — удалено', (await CN.get(n1)) === null);

console.log('\nЗащита (J8)');
const P = J.protection;
await P.setup('очень-длинная-фраза', q1);
const raw = await CWDB.journalEntries.get(q1);
ok('защищённая строка без открытого текста', !!raw.sec && !('body' in raw));
await CN.update(q1, { body: 'Новый секрет' });
const raw2 = await CWDB.journalEntries.get(q1);
ok('правка защищённой — только шифротекст', !!raw2.sec && !('body' in raw2) && raw2.sec.iv !== raw.sec.iv);
ok('раскрытая копия читается', (await CN.get(q1)).body === 'Новый секрет');
P.lock('manual');
ok('заблокировано: текст не раскрыт', (await CN.get(q1)).body === undefined);
ok('заблокировано: правка текста — отказ', !!(await rejects(() => CN.update(q1, { body: 'x' }))));
await P.unlock('очень-длинная-фраза');

console.log('\nАрхив');
await J.nodes.archive(cong);
ok('архивное собрание — новые записи отказ', (await rejects(() => CN.add(cong, { type: 'note', body: 'x' }))) === 'journal-cong-note-readonly');
await J.nodes.unarchive(cong);
await J.nodes.archive(c);
ok('архивный район — новые записи собрания отказ', (await rejects(() => CN.add(cong, { type: 'note', body: 'x' }))) === 'journal-cong-note-readonly');
await J.nodes.unarchive(c);
ok('после восстановления — снова можно', !!(await CN.add(cong, { type: 'note', body: 'снова' })));

console.log('\nРазметка и экран');
const html = read('journal/index.html');
const toolbar = html.slice(html.indexOf('id="congregationDetailView"'), html.indexOf('id="congOverviewPanel"'));
const tabs = [...toolbar.matchAll(/data-cong-tab="([a-z]+)"/g)].map((m) => m[1]);
ok('вкладки собрания: обзор, посещения, записи, задачи, архив (J10)', tabs.join(',') === 'overview,visits,entries,tasks,archive');
ok('ни одной отключённой кнопки-заглушки во вкладках собрания', !/<button[^>]*disabled[^>]*>/.test(toolbar));
ok('«Задачи» и «Архив» собрания — свои вкладки (J10), не ссылки на район', !/data-cong-link=/.test(toolbar) && html.includes('id="congTasksPanel"') && html.includes('id="congArchivePanel"'));
ok('панель «Записи» собрания есть', html.includes('id="congEntriesPanel"') && html.includes('id="congNotesList"'));
const prot = read('journal/js/app/protection.js');
ok('J8: список записей собрания очищается при блокировке', prot.includes("'congNotesList'"));
const app = read('journal/js/app.js');
ok('FAB на вкладке «Записи» собрания создаёт заметку', app.includes("'new-congregation-note'"));
const core = read('journal/js/app/core.js');
ok('найденная запись собрания ведёт во вкладку «Записи»', core.includes('build.congEntries'));
ok('коды ошибок фасада собрания переведены', ['empty', 'invalid-type', 'immutable', 'not-found', 'has-links', 'readonly'].every((k) => core.includes("'journal-cong-note-" + k + "'")));

console.log(failed ? `\n${failed} проверок не прошло.` : '\nЗаписи собрания в порядке.');
process.exit(failed ? 1 : 0);
