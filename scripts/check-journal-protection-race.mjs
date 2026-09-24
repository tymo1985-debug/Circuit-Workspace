#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-protection-race.mjs
 *
 * J8-H1: пути J8, которые после асинхронной криптографии пишут строку
 * journalEntries ЦЕЛИКОМ из прочитанной ранее копии (защита/первая настройка,
 * снятие защиты, правка защищённого текста), не должны молча затирать
 * параллельную правку метаданных — даже когда updatedAt обеих операций
 * совпал до миллисекунды.
 *
 * Детерминированно: часы заморожены (new Date() без аргументов — одна и та же
 * миллисекунда), а «соседняя вкладка» вклинивается ровно между чтением и
 * записью — внутри подменённого шифрования/расшифровки.
 *
 *   node scripts/check-journal-protection-race.mjs   (fake-indexeddb)
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
globalThis.addEventListener = () => {};
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = { journal: { version: '0.0.0' } };

/* Замороженные часы: new Date() без аргументов → FROZEN, пока frozen = true. */
const RealDate = Date;
let frozen = false;
const FROZEN = RealDate.parse('2028-03-10T10:00:00.000Z');
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0 && frozen) super(FROZEN); else super(...a); }
  static now() { return frozen ? FROZEN : RealDate.now(); }
};

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
eval(read('shared/todo.js'));
eval(read('journal/js/todo-provider.js'));
await CWDB.init();

const J = CWJournal;
const P = J.protection;
const C = CWJournalCrypto;
const PASS = 'correct horse battery';
const CANARY = 'CANARY-H1-' + Math.random().toString(16).slice(2) + '-Ѫ';
const raw = (id) => CWDB.journalEntries.get(id);

/* «Соседняя вкладка» вклинивается в следующий вызов шифрования/расшифровки. */
function interleave(method, fn) {
  const orig = C[method];
  C[method] = async (...a) => {
    C[method] = orig;
    const res = await orig.apply(C, a);
    await fn();
    return res;
  };
}

const circuit = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: circuit, label: 'Северное' });
/* Сейф заводится на отдельной записи — дальше проверяется обычный protect(). */
const seed = await J.entries.add({ type: 'note', nodeId: cong, circuitId: circuit, body: 'seed' });
await P.setup(PASS, seed);

frozen = true;

/* ═══ 1. protect ∥ смена статуса ═══════════════════════════════════════ */
console.log('\n1. protect ∥ status, та же миллисекунда');
{
  const t = await J.tasks.add({ nodeId: cong, body: 'Задача ' + CANARY });
  const before = await raw(t);
  interleave('encryptEntry', () => J.tasks.complete(t));
  const e = await rejects(() => P.protect(t));
  const after = await raw(t);
  ok('updatedAt действительно совпадает', after.updatedAt === before.updatedAt, before.updatedAt + ' / ' + after.updatedAt);
  ok('protect отказывает (конфликт)', e === 'journal-protected-conflict', e);
  ok('новый статус сохранён, строка не защищена', after.status === 'done' && !after.sec && after.body.includes(CANARY));
}

/* ═══ 2. protect ∥ срок задачи: добавить и снять ════════════════════════ */
console.log('\n2. protect ∥ dueDate');
{
  const t = await J.tasks.add({ nodeId: cong, body: 'Без срока' });
  interleave('encryptEntry', () => J.tasks.update(t, { dueDate: '2028-04-01' }));
  const e = await rejects(() => P.protect(t));
  const after = await raw(t);
  ok('добавленный срок не потерян (поля не было в снимке)', e === 'journal-protected-conflict' && after.dueDate === '2028-04-01' && !after.sec, e);
  const t2 = await J.tasks.add({ nodeId: cong, body: 'Со сроком', dueDate: '2028-05-01' });
  interleave('encryptEntry', () => J.tasks.update(t2, { dueDate: null }));
  const e2 = await rejects(() => P.protect(t2));
  const after2 = await raw(t2);
  ok('снятый срок не вернулся', e2 === 'journal-protected-conflict' && !('dueDate' in after2) && !after2.sec, e2);
}

/* ═══ 3. protect ∥ перенос и fields записи посещения ════════════════════ */
console.log('\n3. protect ∥ carryKey/touches/fields');
{
  frozen = false;
  const visit = await J.visits.add({ nodeId: cong, dateFrom: '2028-03-12', dateTo: '2028-03-17' });
  const q = await J.visitRecords.add(visit, { type: 'question', body: 'Вопрос' });
  const n = await J.visitRecords.add(visit, { type: 'note', body: 'Заметка', format: 'paragraph' });
  frozen = true;
  interleave('encryptEntry', () => J.carry.mark(q));
  const e = await rejects(() => P.protect(q));
  const aq = await raw(q);
  ok('отметка переноса (carryKey, touches) не потеряна', e === 'journal-protected-conflict' && 'carryKey' in aq && Array.isArray(aq.touches) && aq.touches.length === 1 && !aq.sec, e);
  interleave('encryptEntry', () => J.visitRecords.update(n, { format: 'list' }));
  const e2 = await rejects(() => P.protect(n));
  const an = await raw(n);
  ok('смена fields.format не потеряна', e2 === 'journal-protected-conflict' && an.fields.format === 'list' && !an.sec, e2);
}

/* ═══ 4. protect ∥ произвольное поле общего фасада ══════════════════════ */
console.log('\n4. protect ∥ новое поле через общий фасад');
{
  const note = await J.entries.add({ type: 'note', nodeId: cong, circuitId: circuit, body: 'Обычная заметка' });
  interleave('encryptEntry', () => J.entries.update(note, { pinned: true }));
  const e = await rejects(() => P.protect(note));
  const an = await raw(note);
  ok('поле, которого не было в снимке, не стёрто', e === 'journal-protected-conflict' && an.pinned === true && !an.sec, e);
}

/* ═══ 5. unprotect ∥ метаданные ═════════════════════════════════════════ */
console.log('\n5. unprotect ∥ status');
{
  const t = await J.tasks.add({ nodeId: cong, body: 'Защищённая ' + CANARY });
  await P.protect(t);
  interleave('decryptEntry', () => J.tasks.complete(t));
  const e = await rejects(() => P.unprotect(t));
  const at = await raw(t);
  ok('unprotect отказывает', e === 'journal-protected-conflict', e);
  ok('новый статус сохранён, строка по-прежнему защищена, открытого текста нет', at.status === 'done' && !!at.sec && !('body' in at) && !('title' in at));
}

/* ═══ 6. правка защищённого текста ∥ метаданные ═════════════════════════ */
console.log('\n6. Правка защищённого текста ∥ status/dueDate');
{
  const t = await J.tasks.add({ nodeId: cong, body: 'Исходный ' + CANARY });
  await P.protect(t);
  interleave('encryptEntry', () => J.tasks.complete(t));
  const e = await rejects(() => J.tasks.update(t, { body: 'Новый ' + CANARY }));
  const at = await raw(t);
  ok('правка текста отказывает', e === 'journal-protected-conflict', e);
  ok('статус соседа сохранён', at.status === 'done' && !!at.sec);
  ok('текст прежний (новый не записан ценой чужих метаданных)', (await C.decryptEntry(C.session.key(), t, at.sec)).body === 'Исходный ' + CANARY);
  await J.tasks.reopen(t);
  const p = await J.projects.add({ circuitId: circuit, title: 'Проект ' + CANARY });
  await P.protect(p);
  interleave('encryptEntry', () => J.projects.complete(p));
  const e2 = await rejects(() => J.projects.update(p, { title: 'Другое ' + CANARY }));
  const ap = await raw(p);
  ok('правка защищённого проекта ∥ смена статуса: конфликт, статус цел', e2 === 'journal-protected-conflict' && ap.status === 'completed' && !!ap.sec, e2);
}

/* ═══ 7. Без конкуренции — всё как прежде (часы тоже заморожены) ═══════ */
console.log('\n7. Без конкуренции');
{
  const t = await J.tasks.add({ nodeId: cong, body: 'Спокойная ' + CANARY, dueDate: '2028-06-01' });
  ok('protect', (await rejects(() => P.protect(t))) === null && !!(await raw(t)).sec);
  ok('правка текста', (await rejects(() => J.tasks.update(t, { body: 'Правка ' + CANARY }))) === null && (await J.tasks.get(t)).body === 'Правка ' + CANARY);
  ok('метаданные защищённой — как прежде', (await rejects(() => J.tasks.update(t, { dueDate: '2028-07-01' }))) === null && (await raw(t)).dueDate === '2028-07-01');
  ok('unprotect', (await rejects(() => P.unprotect(t))) === null && (await raw(t)).body === 'Правка ' + CANARY && !(await raw(t)).sec);
  frozen = false;
  const n2 = await J.entries.add({ type: 'note', nodeId: cong, circuitId: circuit, body: 'Первая настройка' });
  await CWDB.journalMeta.remove('crypto:v1');
  for (const r of await CWDB.journalEntries.getAll()) if (r.sec) await CWDB.journalEntries.remove(r.id);
  P.lock();
  ok('первая настройка (setup) — как прежде', (await rejects(() => P.setup(PASS, n2))) === null && !!(await raw(n2)).sec);
  frozen = true;
}

/* ═══ 8. Канарейка, J9b, J9c ════════════════════════════════════════════ */
console.log('\n8. Канарейка, J9b, J9c');
const rows = await CWDB.journalEntries.getAll();
ok('ни одна строка с sec не хранит title/body', rows.filter((r) => r.sec).every((r) => !('title' in r) && !('body' in r)));
ok('канарейки нет рядом с sec', !rows.filter((r) => r.sec).some((r) => JSON.stringify(r).includes(CANARY)));
{
  frozen = false;
  const p = await J.projects.add({ circuitId: circuit, title: 'Проект с письмом' });
  await CWDocs.save({ templateId: 'sys.journal.project.letter', context: 'journal.project.letter', title: 't', lang: 'ru', format: 'text', body: 'Письмо', ref: J.documents.ref(p), reason: 'manual' });
  ok('J9b: проект со снимком не защищается', (await rejects(() => P.protect(p))) === 'journal-protect-has-documents' && !(await raw(p)).sec);
  const t = await J.tasks.add({ nodeId: cong, body: 'Для To Do ' + CANARY });
  await P.protect(t);
  await CWTodo.init();
  const dto = CWTodo.get('journal:' + t);
  ok('J9c: защищённая задача в To Do — text null', !!dto && dto.text === null && dto.protected === true && !JSON.stringify(dto).includes(CANARY));
}

console.log(failed ? `\n✗ check-journal-protection-race: ${failed} провал(ов)` : '\n✓ check-journal-protection-race: всё прошло');
process.exit(failed ? 1 : 0);
