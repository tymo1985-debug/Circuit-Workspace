#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-visit-records.mjs
 *
 * Фаза J4b: записи посещения (CWJournal.visitRecords) — заметка,
 * наблюдение, вопрос, задача. Строки journalEntries с fields.visitId;
 * пятого хранилища нет, схема не менялась.
 *
 * ПОЧЕМУ ОТДЕЛЬНО от check-journal-visits.mjs: там — жизненный цикл самого
 * посещения (J4a), здесь — содержимое посещения и граница общего фасада
 * для него (тот же класс обхода, что закрывали в J4a, теперь для детей).
 *
 *   node scripts/check-journal-visit-records.mjs   (fake-indexeddb, acorn)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* Разрезка 0.9.1: код экранов Журнала — js/app.js + js/app/*.js. Проверки
   UI идут по всему слою экранов; строки-переходники позднего связывания
   (function X() { return A.X.apply(...) }) — не реализация, отбрасываются. */
const JOURNAL_UI_FILES = ['journal/js/app/core.js', 'journal/js/app/districts.js', 'journal/js/app/visits.js',
  'journal/js/app/tasks.js', 'journal/js/app/projects.js', 'journal/js/app/search-archive.js', 'journal/js/app.js'];
const readJournalUi = () => JOURNAL_UI_FILES.map((f) => read(f)).join('\n')
  .replace(/^  function [\w$]+\(\) \{ return A\.[\w$]+\.apply\(this, arguments\); \}\n/gm, '');


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
const R = J.visitRecords;

const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-T' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Северное' });
const cong2 = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Южное' });
const v = await J.visits.add({ nodeId: cong, dateFrom: '2028-04-09', dateTo: '2028-04-14' });
const vOther = await J.visits.add({ nodeId: cong2, dateFrom: '2028-05-01', dateTo: '2028-05-02' });

/* ═══ 1. Создание ═══════════════════════════════════════════════════════ */
console.log('\n1. Создание записей посещения');
const ids = {};
for (const type of ['note', 'observation', 'question', 'todo']) {
  ids[type] = await R.add(v, { type, body: 'Текст ' + type, format: type === 'todo' ? undefined : 'paragraph' });
  const r = await R.get(ids[type]);
  ok(`${type}: создана, id je_, тип сохранён`, r && r.type === type && /^je_/.test(ids[type]));
}
const n1 = await R.get(ids.note);
ok('nodeId/circuitId взяты из посещения', n1.nodeId === cong && n1.circuitId === c);
ok('fields.visitId поставлен фасадом', n1.fields.visitId === v);
ok('status open у новой записи', n1.status === 'open');
ok('todo получает формат checklist', (await R.get(ids.todo)).fields.format === 'checklist');
ok('недопустимый тип отклонён', (await rejects(() => R.add(v, { type: 'project', body: 'x' }))) === 'journal-visit-record-invalid-type');
ok('тип visit отклонён', (await rejects(() => R.add(v, { type: 'visit', body: 'x' }))) === 'journal-visit-record-invalid-type');
ok('несуществующее посещение отклонено', (await rejects(() => R.add('je_nope', { type: 'note', body: 'x' }))) === 'journal-visit-not-found');
ok('обычная запись вместо посещения отклонена', (await rejects(() => R.add(ids.note, { type: 'note', body: 'x' }))) === 'journal-visit-not-found');
ok('пустой текст отклонён', (await rejects(() => R.add(v, { type: 'note', body: '   ' }))) === 'journal-visit-record-empty');
ok('неизвестный формат отклонён', (await rejects(() => R.add(v, { type: 'note', body: 'x', format: '<b>' }))) === 'journal-visit-record-invalid-format');
const forged = await R.add(v, { type: 'note', body: 'подделка', nodeId: cong2, circuitId: 'x', status: 'done', fields: { visitId: vOther, secret: 'копия' }, title: 't' });
const fr = await R.get(forged);
ok('подделать nodeId/circuitId/visitId/status нельзя — берётся из посещения',
  fr.nodeId === cong && fr.circuitId === c && fr.fields.visitId === v && fr.status === 'open');
ok('посторонние поля вызывающего не сохраняются (fields — только visitId/format/seq)',
  JSON.stringify(Object.keys(fr.fields).sort()) === JSON.stringify(['format', 'seq', 'visitId']) && fr.title === undefined);
await R.remove(forged);

/* ═══ 2. Выборка и порядок ══════════════════════════════════════════════ */
console.log('\n2. byVisit и порядок');
const other = await R.add(vOther, { type: 'note', body: 'чужое посещение' });
const list = await R.byVisit(v);
ok('byVisit изолирован по посещению', list.every((r) => r.fields.visitId === v) && !list.some((r) => r.id === other));
ok('порядок — порядок создания (seq)', list.map((r) => r.type).join() === 'note,observation,question,todo', list.map((r) => r.type).join());
ok('seq строго возрастает', list.every((r, i) => i === 0 || r.fields.seq > list[i - 1].fields.seq));
ok('byVisit не возвращает само посещение', !list.some((r) => r.type === 'visit'));
ok('byVisit неизвестного посещения — пусто', (await R.byVisit('je_nope')).length === 0);
await new Promise((r) => setTimeout(r, 5));
await R.update(ids.note, { body: 'изменено позже' });
ok('правка не меняет порядок', (await R.byVisit(v))[0].id === ids.note);

/* ═══ 3. Правка ═════════════════════════════════════════════════════════ */
console.log('\n3. Правка');
const before = await R.get(ids.question);
await new Promise((r) => setTimeout(r, 5));
const u = await R.update(ids.question, { body: 'Строка 1\nСтрока 2', format: 'list' });
ok('body/format сохранены', u.body === 'Строка 1\nСтрока 2' && u.fields.format === 'list');
ok('id/createdAt сохранены, updatedAt продвинулся', u.id === before.id && u.createdAt === before.createdAt && u.updatedAt > before.updatedAt);
ok('fields.visitId/seq сохранены при смене формата', u.fields.visitId === v && u.fields.seq === before.fields.seq);
ok('смена типа в пределах note/observation/question', (await R.update(ids.question, { type: 'observation' })).type === 'observation');
await R.update(ids.question, { type: 'question' });
for (const [label, patch, err] of [
  ['nodeId', { nodeId: cong2 }, 'journal-visit-record-immutable'],
  ['circuitId', { circuitId: 'x' }, 'journal-visit-record-immutable'],
  ['fields (visitId)', { fields: { visitId: vOther } }, 'journal-visit-record-immutable'],
  ['status', { status: 'done' }, 'journal-visit-record-immutable'],
  ['title', { title: 'x' }, 'journal-visit-record-immutable'],
  ['тип → todo через update', { type: 'todo' }, 'journal-visit-record-invalid-type'],
  ['тип → visit', { type: 'visit' }, 'journal-visit-record-invalid-type'],
  ['пустой body', { body: '' }, 'journal-visit-record-empty'],
  ['формат checklist у текста', { format: 'checklist' }, 'journal-visit-record-invalid-format'],
]) {
  ok(`update отклоняет: ${label}`, (await rejects(() => R.update(ids.question, patch))) === err);
}
ok('после отказов запись не изменилась', JSON.stringify(await R.get(ids.question)).includes('"visitId":"' + v + '"'));
ok('update задачи: формат менять нельзя', (await rejects(() => R.update(ids.todo, { format: 'paragraph' }))) === 'journal-visit-record-invalid-format');
ok('update задачи: тип менять нельзя', (await rejects(() => R.update(ids.todo, { type: 'note' }))) === 'journal-visit-record-invalid-type');

/* ═══ 4. Задачи ═════════════════════════════════════════════════════════ */
console.log('\n4. Задача: open ↔ done, превращение');
ok('open → done', (await R.complete(ids.todo)).status === 'done');
ok('повторное complete отклонено', (await rejects(() => R.complete(ids.todo))) === 'journal-visit-record-invalid-transition');
ok('done → open', (await R.reopen(ids.todo)).status === 'open');
ok('complete у заметки отклонён', (await rejects(() => R.complete(ids.note))) === 'journal-visit-record-invalid-transition');
const conv = await R.add(v, { type: 'note', body: 'станет задачей', format: 'heading2' });
const cv = await R.convertToTodo(conv);
ok('convertToTodo: todo/open/checklist, текст и привязка сохранены',
  cv.type === 'todo' && cv.status === 'open' && cv.fields.format === 'checklist' && cv.body === 'станет задачей' && cv.fields.visitId === v);
ok('повторное превращение отклонено', (await rejects(() => R.convertToTodo(conv))) === 'journal-visit-record-invalid-type');

/* ═══ 5. Редактируемость по статусу посещения ═══════════════════════════ */
console.log('\n5. Завершённое / архивное посещение — только чтение');
await J.visits.complete(v);
for (const [label, fn] of [
  ['add', () => R.add(v, { type: 'note', body: 'x' })], ['update', () => R.update(ids.note, { body: 'x' })],
  ['complete', () => R.complete(ids.todo)], ['convertToTodo', () => R.convertToTodo(ids.note)], ['remove', () => R.remove(ids.note)],
]) {
  ok(`completed: ${label} отклонён`, (await rejects(fn)) === 'journal-visit-readonly');
}
ok('completed: чтение работает', (await R.byVisit(v)).length === 5);
await J.visits.archive(v);
ok('archived: add отклонён', (await rejects(() => R.add(v, { type: 'note', body: 'x' }))) === 'journal-visit-readonly');
ok('archived: update отклонён', (await rejects(() => R.update(ids.note, { body: 'x' }))) === 'journal-visit-readonly');
await J.visits.unarchive(v);
await J.visits.reopen(v);
ok('после reopen снова редактируемо', (await R.update(ids.note, { body: 'снова можно' })).body === 'снова можно');

/* ═══ 6. Удаление и связи ═══════════════════════════════════════════════ */
console.log('\n6. Удаление');
const tmp = await R.add(v, { type: 'observation', body: 'удалить' });
ok('обычная запись удаляется', (await rejects(() => R.remove(tmp))) === null && (await R.get(tmp)) === null);
const lkFrom = await J.links.add({ from: J.urn.entry(ids.observation), to: J.urn.node(cong), rel: 'relates' });
ok('запись со связью (from) не удаляется', (await rejects(() => R.remove(ids.observation))) === 'journal-visit-record-has-links');
await J.links.remove(lkFrom);
const lkTo = await J.links.add({ from: J.urn.node(cong), to: J.urn.entry(ids.observation), rel: 'mentions' });
ok('запись со связью (to) не удаляется', (await rejects(() => R.remove(ids.observation))) === 'journal-visit-record-has-links');
ok('после отказа запись цела', !!(await R.get(ids.observation)));
await J.links.remove(lkTo);
ok('visits.remove отказывает, пока есть записи J4b', (await rejects(() => J.visits.remove(v))) === 'journal-visit-has-entries');
ok('R.get/remove на посещении и обычной записи — not-found',
  (await R.get(v)) === null && (await rejects(() => R.remove(v))) === 'journal-visit-record-not-found');

/* ═══ 7. Обход через общий фасад закрыт ═════════════════════════════════ */
console.log('\n7. Обход через CWJournal.entries');
const E = 'journal-visit-record-use-facade';
ok('entries.add с fields.visitId отклонён', (await rejects(() => J.entries.add({ type: 'note', nodeId: cong, circuitId: c, status: 'open', body: 'x', fields: { visitId: v } }))) === E);
const snap = JSON.stringify(await R.get(ids.note));
for (const [label, patch] of [['body', { body: 'обход' }], ['status', { status: 'done' }], ['nodeId', { nodeId: cong2 }], ['fields', { fields: {} }]]) {
  ok(`entries.update(запись посещения) отклонён: ${label}`, (await rejects(() => J.entries.update(ids.note, patch))) === E);
}
ok('после попыток обхода запись не изменилась', JSON.stringify(await R.get(ids.note)) === snap);
ok('entries.remove(запись посещения) отклонён', (await rejects(() => J.entries.remove(ids.note))) === E && !!(await R.get(ids.note)));
const plain = await J.entries.add({ type: 'note', nodeId: cong, circuitId: c, status: 'open', body: 'обычная' });
ok('entries.update обычной записи с fields.visitId («приписать») отклонён', (await rejects(() => J.entries.update(plain, { fields: { visitId: v } }))) === E);
ok('обычная запись: update работает', (await J.entries.update(plain, { body: 'обычная 2' })).body === 'обычная 2');
ok('обычная запись: remove работает', (await rejects(() => J.entries.remove(plain))) === null);
ok('обычная запись не попала в byVisit', !(await R.byVisit(v)).some((r) => r.id === plain));
ok('J4a-граница цела: entries.add(type:visit) отклонён', (await rejects(() => J.entries.add({ type: 'visit', nodeId: cong }))) === 'journal-visit-use-facade');

/* ═══ 8. Граница J8 и UI ════════════════════════════════════════════════ */
console.log('\n8. Граница J8 / UI');
{
  const all = await J.entries.getAll();
  const kids = all.filter((r) => r.fields && r.fields.visitId);
  ok('текст только в body: fields без строк длиннее id/enum',
    kids.every((r) => Object.entries(r.fields).every(([k, val]) => ['visitId', 'format', 'seq'].includes(k))));
  ok('текст записи не дублируется в fields',
    kids.every((r) => !JSON.stringify(r.fields).includes(r.body)));
  ok('journalMeta не содержит текста записей',
    (await J.meta.get('jm_any')) === null && (await CWDB.journalMeta.getAll()).every((m) => !kids.some((r) => JSON.stringify(m).includes(r.body))));
  ok('в localStorage за прогон ничего не записано', mem.size === 0, [...mem.keys()].join());

  const acorn = await import('acorn');
  const walk = await import('acorn-walk');
  const src = readJournalUi();
  let rawDb = 0;
  walk.full(acorn.parse(src, { ecmaVersion: 2022 }), (n) => {
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'CWDB') rawDb++;
  });
  ok('app.js не обращается к CWDB напрямую', rawDb === 0, String(rawDb));
  ok('app.js мутирует записи посещения только через visitRecords',
    !/entries\.(add|update|remove)\(/.test(src)
      && ['visitRecords.add(', 'visitRecords.update(', 'visitRecords.remove(', 'visitRecords.complete(', 'visitRecords.reopen(', 'visitRecords.convertToTodo(']
        .every((m) => src.includes(m)));
  ok('app.js не хранит HTML: innerHTML записей собирается только через esc()',
    /esc\(r\.body\)/.test(src) && !/innerHTML\s*=\s*r\.body/.test(src));
  ok('app.js без localStorage', !/localStorage/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
}

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nЗаписи посещения: все проверки пройдены.');
process.exit(failed ? 1 : 0);
