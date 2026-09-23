#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-protection.mjs
 *
 * Защита записей Журнала (J8): шифрование при хранении, граница хранения,
 * блокировка, атомарность, поиск, резервная копия и восстановление.
 *
 * ПОЧЕМУ В ГЕЙТЕ СРАЗУ: ошибка здесь не «ломает экран», а молча оставляет
 * открытый текст на диске или делает шифротекст нечитаемым навсегда. Обе
 * вещи пользователь обнаружит, когда исправлять уже нечего. Проверки —
 * поведением на настоящем Web Crypto (Node) и fake-indexeddb, не grep'ом.
 *
 * Сквозной приём — уникальная «канарейка»: после защиты её буквального
 * значения не должно быть ни в одной постоянной сериализации (строки базы,
 * связи, meta, localStorage, копия модуля, полная копия, предохранительный
 * снимок).
 *
 *   node scripts/check-journal-protection.mjs
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
eval(read('journal/js/crypto.js'));
eval(read('journal/js/data.js'));
eval(read('shared/backup.js'));
await CWDB.init();

const J = CWJournal;
const P = J.protection;
const C = CWJournalCrypto;
const DB = 'circuit-workspace-db';
const JOURNAL = ['journalNodes', 'journalEntries', 'journalLinks', 'journalMeta'];
const raw = (id) => CWDB.journalEntries.get(id);
const dumpJournal = async () => {
  const out = {};
  for (const s of JOURNAL.concat(['communities'])) out[s] = await CWDB[s].getAll();
  return JSON.stringify(out);
};
const CANARY = 'CANARY-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('') + '-Ѫ';
const PASS_A = 'correct horse battery';
const PASS_B = 'другая фраза 2026';
const hasCanary = (s) => typeof s === 'string' && s.includes(CANARY);

/* ═══ 0. Мир ═══════════════════════════════════════════════════════════ */
const circuit = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: circuit, label: 'Северное' });
const visit = await J.visits.add({ nodeId: cong, dateFrom: '2026-03-01', dateTo: '2026-03-05' });
const recNote = await J.visitRecords.add(visit, { type: 'note', body: 'обычная заметка' });
const recTodo = await J.visitRecords.add(visit, { type: 'todo', body: 'перенос ' + CANARY });
const task = await J.tasks.add({ nodeId: circuit, body: 'задача ' + CANARY, dueDate: '2026-04-01' });
const plainTask = await J.tasks.add({ nodeId: circuit, body: 'открытая задача' });
const project = await J.projects.add({ circuitId: circuit, title: 'Проект ' + CANARY, body: '## План\n- ' + CANARY });
const bareProject = await J.projects.add({ circuitId: circuit, title: 'Без описания' });
await J.projects.link(project, J.urn.node(cong));
await CWDB.communities.put({ id: 'com_local', name: 'Справочник' });

/* ═══ 1. Примитивы и форма ═════════════════════════════════════════════ */
console.log('\n1. Примитивы');
const bytes = crypto.getRandomValues(new Uint8Array(33));
ok('base64url туда-обратно', C.unb64u(C.b64u(bytes)).every((b, i) => b === bytes[i]));
ok('base64url: отказ на «+/=» и мусоре', ['ab+c', 'ab/c', 'abc=', 'a', '', 'ä'].every((s) => { try { C.unb64u(s); return false; } catch (e) { return true; } }));
ok('base64url: неканонический хвост — отказ', (() => { try { C.unb64u('AB'); return false; } catch (e) { return true; } })());
ok('Web Crypto — родной (crypto.subtle), сторонних библиотек нет', !/import |require\(/.test(read('journal/js/crypto.js')));

/* ═══ 2. Первая защита ════════════════════════════════════════════════ */
console.log('\n2. Первая настройка');
ok('до защиты: состояние off', (await P.status()).state === 'off');
ok('открытие Журнала сейф не заводит', (await CWDB.journalMeta.get('crypto:v1')) === null);

let before = await dumpJournal();
ok('короткая фраза — отказ', (await rejects(() => P.setup('short', project))) === 'journal-vault-weak-passphrase');
ok('…ноль изменений', (await dumpJournal()) === before);

const realEncrypt = C.encryptEntry;
C.encryptEntry = async () => { throw new Error('boom-encrypt'); };
ok('сбой шифрования до транзакции — ошибка', (await rejects(() => P.setup(PASS_A, project))) === 'boom-encrypt');
C.encryptEntry = realEncrypt;
ok('…ноль изменений (ни сейфа, ни строки)', (await dumpJournal()) === before);

/* Прерывание самой транзакции: строку меняют между чтением и записью —
   предусловие пакета срывается ПОСЛЕ того, как add сейфа уже поставлен. */
C.encryptEntry = async (k, id, pl) => {
  const s = await realEncrypt(k, id, pl);
  await CWDB.journalEntries.update(project, { updatedAt: '2099-01-01T00:00:00.000Z' });
  return s;
};
ok('прерванная транзакция первой настройки — конфликт', (await rejects(() => P.setup(PASS_A, project))) === 'journal-protected-conflict');
C.encryptEntry = realEncrypt;
ok('…сейф откатился вместе со строкой', (await CWDB.journalMeta.get('crypto:v1')) === null);
ok('…строка осталась открытой и целой', (await raw(project)).title === 'Проект ' + CANARY && !('sec' in (await raw(project))));
ok('…сессия не открылась', !P.isUnlocked());

const projBefore = await raw(project);
await P.setup(PASS_A, project);
const vault = await CWDB.journalMeta.get('crypto:v1');
const projRow = await raw(project);
ok('сейф crypto:v1 заведён', !!vault && C.validateVault(vault) === null);
ok('сейф: PBKDF2/SHA-256/600000, соль 16 байт', vault.kdf.alg === 'PBKDF2' && vault.kdf.hash === 'SHA-256'
  && vault.kdf.iterations === 600000 && C.unb64u(vault.kdf.salt).length === 16);
ok('сейф: обёртка AES-GCM, iv 12 байт', vault.wrap.alg === 'AES-GCM' && C.unb64u(vault.wrap.iv).length === 12);
ok('сейф без текста', !hasCanary(JSON.stringify(vault)));
ok('проект: sec {v:1, AES-GCM}', projRow.sec && projRow.sec.v === 1 && projRow.sec.alg === 'AES-GCM');
ok('проект: ни title, ни body', !('title' in projRow) && !('body' in projRow));
ok('проект: метаданные целы', ['type', 'status', 'nodeId', 'circuitId', 'createdAt'].every((k) => projRow[k] === projBefore[k]));
ok('после настройки — разблокировано', P.isUnlocked());

/* ═══ 3. Блокировка и разблокировка ════════════════════════════════════ */
console.log('\n3. Блокировка');
const view = await J.projects.get(project);
ok('разблокировано: копия с текстом', view.title === 'Проект ' + CANARY && view.body.includes(CANARY));
ok('копия: текст не перечислим (JSON/спред/assign)', !hasCanary(JSON.stringify(view)) && !hasCanary(JSON.stringify({ ...view })) && !('title' in Object.assign({}, view)));
P.lock();
const locked = await J.projects.get(project);
ok('заблокировано: текста нет', locked.title === undefined && locked.body === undefined && P.isLocked(locked));
before = await dumpJournal();
ok('неверная фраза — отказ', (await rejects(() => P.unlock('wrong phrase!'))) === 'journal-vault-unlock-failed');
ok('…остаётся заблокировано, ноль изменений', !P.isUnlocked() && (await dumpJournal()) === before);

const tamper = async (patch, label) => {
  await CWDB.journalMeta.put({ ...vault, wrap: { ...vault.wrap, ...patch } });
  const snap = await dumpJournal();
  ok(label, (await rejects(() => P.unlock(PASS_A))) === 'journal-vault-unlock-failed' && !P.isUnlocked());
  ok('…ноль изменений', (await dumpJournal()) === snap);
  await CWDB.journalMeta.put(vault);
};
const flip = (s) => { const b = C.unb64u(s); b[0] ^= 1; return C.b64u(b); };
await tamper({ iv: flip(vault.wrap.iv) }, 'подменённый iv обёртки — отказ');
await tamper({ ct: flip(vault.wrap.ct) }, 'подменённый ct обёртки — отказ');
await P.unlock(PASS_A);
ok('верная фраза — разблокировано', P.isUnlocked() && (await J.projects.get(project)).title === 'Проект ' + CANARY);

/* ═══ 4. Защита, правка, снятие ════════════════════════════════════════ */
console.log('\n4. Правка и снятие защиты');
await P.protect(task);
await P.protect(recTodo);
const t1 = await raw(task);
ok('задача: sec, без body; срок/статус открыты', t1.sec && !('body' in t1) && t1.dueDate === '2026-04-01' && t1.status === 'open');
await J.tasks.update(task, { body: 'задача v2 ' + CANARY });
const t2 = await raw(task);
ok('правка защищённого текста — новый iv', t2.sec.iv !== t1.sec.iv && !('body' in t2));
ok('правка расшифровывается в новое значение', (await J.tasks.get(task)).body === 'задача v2 ' + CANARY);
await J.projects.update(project, { body: '' });
ok('пустое описание защищённого проекта — поля нет в полезной нагрузке', (await J.projects.get(project)).body === undefined);
await J.projects.update(project, { body: '- ' + CANARY });

await P.protect(bareProject);
await P.unprotect(bareProject);
const bp = await raw(bareProject);
ok('снятие защиты: открытый текст вернулся, sec нет', bp.title === 'Без описания' && !('sec' in bp) && !('body' in bp));

const noteId = await J.entries.add({ type: 'note', nodeId: circuit, circuitId: circuit, status: 'open', body: 'личное ' + CANARY });
await P.protect(noteId);
ok('прямая запись текста в защищённую строку — отказ', (await rejects(() => J.entries.update(noteId, { body: 'утечка' }))) === 'journal-protected-plaintext');
ok('прямая вставка sec+body — отказ', (await rejects(() => J.entries.add({ type: 'note', nodeId: circuit, circuitId: circuit, body: 'x', sec: t2.sec }))) === 'journal-protected-plaintext');
const noteView = await J.entries.get(noteId);
await J.entries.update(noteId, noteView);
ok('расшифрованная копия, записанная целиком, текста не несёт', !('body' in (await raw(noteId))) && (await J.entries.get(noteId)).body === 'личное ' + CANARY);
await CWDB.journalEntries.put(noteView);
ok('даже сырой put копии не переносит текст (неперечислимые поля)', !('body' in (await raw(noteId))));
ok('meta.put(crypto:*) — отказ', (await rejects(() => J.meta.put({ id: 'crypto:v1', x: 1 }))) === 'journal-meta-reserved');

/* ═══ 5. Смешанное состояние и заблокированные операции ════════════════ */
console.log('\n5. Заблокированный режим');
P.lock();
const secOf = async (id) => JSON.stringify((await raw(id)).sec);
const sTask = await secOf(task);
await J.tasks.complete(task); await J.tasks.reopen(task);
await J.tasks.update(task, { dueDate: '2026-05-01' });
ok('задача: complete/reopen/срок без ключа, sec байт в байт', (await secOf(task)) === sTask && (await raw(task)).dueDate === '2026-05-01');
const sProj = await secOf(project);
await J.projects.complete(project); await J.projects.reopen(project);
await J.projects.archive(project); await J.projects.unarchive(project);
ok('проект: цикл и архив без ключа, sec байт в байт', (await secOf(project)) === sProj && (await raw(project)).status === 'active');
const sRec = await secOf(recTodo);
const before5 = (await CWDB.journalEntries.getAll()).length;
await J.carry.mark(recTodo);
ok('перенос без ключа: sec тот же, строк не прибавилось', (await secOf(recTodo)) === sRec && (await CWDB.journalEntries.getAll()).length === before5);
const visit2 = await J.visits.add({ nodeId: cong, dateFrom: '2026-06-01', dateTo: '2026-06-03' });
await J.carry.touch(recTodo, visit2, 'kept');
const carried = await raw(recTodo);
ok('перенос — одна логическая строка с историей', carried.touches.length === 2 && (await secOf(recTodo)) === sRec
  && (await J.carry.incoming(visit2)).filter((r) => r.id === recTodo).length === 1);
await J.visitRecords.update(recNote, { body: 'обычная заметка v2' });
ok('незащищённая запись правится без ключа', (await raw(recNote)).body === 'обычная заметка v2');
await J.tasks.update(plainTask, { body: 'открытая v2' });
ok('незащищённая задача правится без ключа', (await raw(plainTask)).body === 'открытая v2');
ok('правка текста без ключа — отказ', (await rejects(() => J.tasks.update(task, { body: 'x' }))) === 'journal-vault-locked');
ok('…шифротекст прежний', (await secOf(task)) === sTask);
ok('защита без ключа — отказ', (await rejects(() => P.protect(plainTask))) === 'journal-vault-locked');
ok('снятие без ключа — отказ', (await rejects(() => P.unprotect(task))) === 'journal-vault-locked');
ok('заблокированная копия текста не показывает', (await J.tasks.list()).every((r) => r.id !== task || r.body === undefined));
const delTask = await J.tasks.add({ nodeId: circuit, body: 'на удаление' });
await P.unlock(PASS_A); await P.protect(delTask); P.lock();
await J.tasks.remove(delTask);
ok('удаление защищённой задачи без ключа (только шифротекст)', (await raw(delTask)) === null);
ok('удаление проекта со связями — отказ, как и раньше', (await rejects(() => J.projects.remove(project))) === 'journal-project-has-links');

/* ═══ 6. Повреждения и подмены ═════════════════════════════════════════ */
console.log('\n6. Повреждения');
await P.unlock(PASS_A);
const vA = await J.visitRecords.add(visit, { type: 'note', body: 'A-текст' });
const vB = await J.visitRecords.add(visit, { type: 'note', body: 'B-текст' });
await P.protect(vA); await P.protect(vB);
const rowA = await raw(vA);
const rowB = await raw(vB);
const putRaw = (row) => CWDB.journalEntries.put(row);
await putRaw({ ...rowB, sec: rowA.sec });
let rb = await J.visitRecords.get(vB);
ok('sec записи A на месте B — отказ проверки (AAD с id)', P.isUnreadable(rb) && rb.body === undefined);
ok('…соседние записи читаются', (await J.visitRecords.get(vA)).body === 'A-текст');
ok('…правка нечитаемой — отказ, шифротекст не тронут',
  (await rejects(() => J.visitRecords.update(vB, { body: 'x' }))) === 'journal-sec-auth-failed' && JSON.stringify((await raw(vB)).sec) === JSON.stringify(rowA.sec));
await putRaw({ ...rowB, sec: { ...rowB.sec, iv: flip(rowB.sec.iv) } });
ok('подменённый iv записи — нечитаема', P.isUnreadable(await J.visitRecords.get(vB)));
await putRaw({ ...rowB, sec: { ...rowB.sec, ct: flip(rowB.sec.ct) } });
ok('подменённый ct записи — нечитаема', P.isUnreadable(await J.visitRecords.get(vB)));
for (const [label, sec, code] of [
  ['неподдерживаемая версия sec', { ...rowB.sec, v: 2 }, 'journal-sec-unsupported-version'],
  ['неподдерживаемый алгоритм', { ...rowB.sec, alg: 'AES-CBC' }, 'journal-sec-unsupported-alg'],
  ['битый base64url', { ...rowB.sec, ct: rowB.sec.ct + '*' }, 'journal-sec-malformed'],
]) {
  await putRaw({ ...rowB, sec });
  ok(label + ' — ' + code, C.validateSec(sec) === code && P.isUnreadable(await J.visitRecords.get(vB)));
  ok('…посторонняя операция её не перезаписывает', (await rejects(() => J.visitRecords.update(vB, { format: 'quote' }))) === code
    && JSON.stringify((await raw(vB)).sec) === JSON.stringify(sec));
}
await putRaw(rowB);
ok('восстановленная строка снова читается', (await J.visitRecords.get(vB)).body === 'B-текст');

/* ═══ 7. Правила домена ════════════════════════════════════════════════ */
console.log('\n7. Правила домена');
ok('посещение само не защищается', (await rejects(() => P.protect(visit))) === 'journal-protect-unsupported');
await J.visits.complete(visit);
ok('завершённое посещение: защита записи — отказ', (await rejects(() => P.protect(recNote))) === 'journal-visit-readonly');
ok('завершённое посещение: правка защищённой — отказ', (await rejects(() => J.visitRecords.update(vA, { body: 'x' }))) === 'journal-visit-readonly');
await J.visits.reopen(visit);
await J.projects.archive(bareProject);
ok('архивный проект: защита — отказ', (await rejects(() => P.protect(bareProject))) === 'journal-project-readonly');
await J.projects.unarchive(bareProject);
const links = await CWDB.journalLinks.getAll();
ok('связи: ровно id/from/to/rel/createdAt, без текста', links.every((l) => Object.keys(l).sort().join() === 'createdAt,from,id,rel,to') && !hasCanary(JSON.stringify(links)));

/* ═══ 8. Поиск ═════════════════════════════════════════════════════════ */
console.log('\n8. Поиск');
P.lock();
let res = await J.search.run(CANARY.slice(0, 20));
ok('заблокировано: защищённые не ищутся, считаются', res.results.length === 0 && res.protectedCount >= 4, res.protectedCount);
await P.unlock(PASS_A);
res = await J.search.run(CANARY.slice(0, 20));
ok('разблокировано: защищённые находятся в памяти', res.results.some((r) => r.id === task) && res.results.some((r) => r.id === project));
ok('…результат несёт текст для экрана', res.results.find((r) => r.id === task).texts.some(hasCanary));
P.lock();
res = await J.search.run(CANARY.slice(0, 20));
ok('после блокировки — снова не находятся', res.results.length === 0);
ok('поиск ничего не пишет (meta — только сейф)', (await CWDB.journalMeta.getAll()).every((m) => m.id === 'crypto:v1'));

/* ═══ 9. Копия: шифротекст, канарейка, восстановление ══════════════════ */
console.log('\n9. Резервная копия');
const protectedIds = (await CWDB.journalEntries.getAll()).filter((r) => r.sec).map((r) => r.id);
const secMap = async () => Object.fromEntries((await CWDB.journalEntries.getAll()).filter((r) => r.sec).map((r) => [r.id, JSON.stringify(r.sec)]));
const rowsOf = (snap) => snap.sections.shared.idb[DB].stores.journalEntries.rows;
const lockedSnap = await CWBackup.snapshot(['journal']);
await P.unlock(PASS_A);
const unlockedSnap = await CWBackup.snapshot(['journal']);
const fullSnap = await CWBackup.snapshot();
const secNow = await secMap();
for (const [label, snap] of [['копия модуля (заблокировано)', lockedSnap], ['копия модуля (разблокировано)', unlockedSnap], ['полная копия', fullSnap]]) {
  ok(label + ': канарейки нет', !hasCanary(JSON.stringify(snap)));
  ok(label + ': sec байт в байт как в базе', rowsOf(snap).filter((r) => r.sec).every((r) => JSON.stringify(r.sec) === secNow[r.id]));
}
ok('в копии все защищённые строки', rowsOf(unlockedSnap).filter((r) => r.sec).length === protectedIds.length);
const guardId = await CWBackup.guard.save(unlockedSnap);
ok('предохранительный снимок без канарейки', !hasCanary(JSON.stringify(await CWBackup.guard.get(guardId))));
ok('localStorage без канарейки (и пуст)', ![...mem.values()].some(hasCanary));
ok('journalEntries/Links/Meta без канарейки', !hasCanary(await dumpJournal()));

// Та же копия, тот же сейф.
await J.tasks.update(task, { body: 'после копии' });
await CWBackup.restore(lockedSnap);
P.lock();
await P.unlock(PASS_A);
ok('тот же сейф: восстановлено и читается', (await J.tasks.get(task)).body === 'задача v2 ' + CANARY);

// Другое устройство: другой сейф.
const deviceB = async () => {
  for (const s of JOURNAL) await CWDB[s].clear();
  P.lock();
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'B' });
  const tb = await J.tasks.add({ nodeId: c, body: 'устройство B' });
  await P.setup(PASS_B, tb);
  await CWDB.communities.put({ id: 'com_device_b', name: 'Только на B' });
  return tb;
};
const tb = await deviceB();
ok('устройство B: свой сейф', (await CWDB.journalMeta.get('crypto:v1')).wrap.ct !== vault.wrap.ct);
const communitiesBefore = (await CWDB.communities.getAll()).length;
await CWBackup.restore(unlockedSnap);
ok('копия модуля: хранилища Журнала ЗАМЕНЕНЫ набором', (await raw(tb)) === null && (await CWDB.journalMeta.get('crypto:v1')).wrap.ct === vault.wrap.ct);
ok('communities: слияние сохранено (своё с B цело, из копии пришло)', !!(await CWDB.communities.get('com_device_b')) && !!(await CWDB.communities.get('com_local'))
  && (await CWDB.communities.getAll()).length >= communitiesBefore);
const stale = await J.tasks.get(task);
ok('сессия с ключом B после замены сейфа — заблокирована, текст не выдан', !P.isUnlocked() && stale.body === undefined);
ok('ключ B не пишет в сейф A', (await rejects(() => J.tasks.update(task, { body: 'x' }))) === 'journal-vault-locked');
ok('фраза B к сейфу A не подходит', (await rejects(() => P.unlock(PASS_B))) === 'journal-vault-unlock-failed');
await P.unlock(PASS_A);
const readable = await Promise.all(protectedIds.map(async (id) => (await J.entries.get(id))));
ok('все защищённые строки открываются ОДНИМ ключом A (смешения нет)', readable.every((r) => r && !P.isUnreadable(r) && !P.isLocked(r)));

// Легаси J1–J7: открытый текст, сейфа нет.
const legacy = JSON.parse(JSON.stringify(unlockedSnap));
const lstores = legacy.sections.shared.idb[DB].stores;
lstores.journalEntries.rows = [{ id: 'je_legacy', type: 'todo', nodeId: circuit, circuitId: circuit, status: 'open', body: 'легаси', createdAt: 'x', updatedAt: 'x' }];
lstores.journalMeta.rows = [];
ok('легаси-копия проходит проверку', CWBackup.inspect(legacy).ok === true);
await CWBackup.restore(legacy);
ok('легаси: восстановлена, сейфа нет, состояние off', (await raw('je_legacy')).body === 'легаси' && (await P.status()).state === 'off');

// Отказы проверки — до первой записи.
await CWBackup.restore(unlockedSnap);
P.lock();
const refused = async (mutateFile, code, label) => {
  const f = JSON.parse(JSON.stringify(unlockedSnap));
  mutateFile(f.sections.shared.idb[DB].stores);
  const snapBefore = await dumpJournal();
  const check = CWBackup.inspect(f);
  const err = await rejects(() => CWBackup.restore(f));
  ok(label + ' — ' + code, check.ok === false && check.error === code && err === code, check.error + '/' + err);
  ok('…ноль изменений', (await dumpJournal()) === snapBefore);
};
const firstSec = (st) => st.journalEntries.rows.find((r) => r.sec);
await refused((st) => { firstSec(st).sec.v = 9; }, 'journal-backup-invalid-sec', 'sec неподдерживаемой версии');
await refused((st) => { firstSec(st).sec.alg = 'AES-CBC'; }, 'journal-backup-invalid-sec', 'sec с чужим алгоритмом');
await refused((st) => { firstSec(st).sec.iv = '@@@'; }, 'journal-backup-invalid-sec', 'sec с битым base64url');
await refused((st) => { firstSec(st).body = 'открытый'; }, 'journal-backup-plaintext', 'sec + открытый текст');
await refused((st) => { st.journalMeta.rows = []; }, 'journal-backup-vault-missing', 'шифротекст без сейфа');
await refused((st) => { st.journalMeta.rows[0].kdf.iterations = 5; }, 'journal-backup-invalid-vault', 'сейф с негодными параметрами');
await refused((st) => { st.journalMeta.rows[0].note = CANARY; }, 'journal-backup-invalid-vault', 'сейф с посторонним полем');
await refused((st) => { delete st.journalMeta; }, 'backup-incomplete-set', 'неполный набор хранилищ Журнала');

// Две реализации проверки формы согласны (crypto.js ↔ backup.js).
const shapes = [rowB.sec, { ...rowB.sec, v: 2 }, { ...rowB.sec, alg: 'X' }, { ...rowB.sec, iv: 'AAAA' }, { ...rowB.sec, extra: 1 }, { ...rowB.sec, ct: 'AB' }, null];
const agree = shapes.every((sec) => {
  const f = JSON.parse(JSON.stringify(unlockedSnap));
  const r = firstSec(f.sections.shared.idb[DB].stores);
  r.sec = sec;
  return (C.validateSec(sec) === null) === CWBackup.inspect(f).ok;
});
ok('validateSec (модуль) и проверка копии (хаб) согласны', agree);

// Сбой транзакции восстановления — откат всего набора.
const broken = JSON.parse(JSON.stringify(legacy));
broken.sections.shared.idb[DB].stores.journalNodes.rows.push({ label: 'без ключа' });
const snapBeforeTx = await dumpJournal();
ok('сбой записи в транзакции восстановления — ошибка', (await rejects(() => CWBackup.restore(broken))) !== null);
ok('…набор Журнала не тронут (clear откатился)', (await dumpJournal()) === snapBeforeTx);

// Полная копия хаба: полная замена.
await CWBackup.restore(fullSnap);
await P.unlock(PASS_A);
ok('полная копия: восстановлено, открывается ключом A', (await J.projects.get(project)).title === 'Проект ' + CANARY);

/* ═══ 10. Состояния сейфа и смена фразы ════════════════════════════════ */
console.log('\n10. Состояния сейфа');
const v0 = await CWDB.journalMeta.get('crypto:v1');
const secs0 = await secMap();
await P.changePassphrase(PASS_A, PASS_B);
ok('смена фразы: обёртка новая, записи не перешифрованы', (await CWDB.journalMeta.get('crypto:v1')).wrap.ct !== v0.wrap.ct && JSON.stringify(await secMap()) === JSON.stringify(secs0));
ok('…сессия продолжает работать', (await J.tasks.get(task)).body === 'задача v2 ' + CANARY);
P.lock();
ok('…старая фраза больше не открывает', (await rejects(() => P.unlock(PASS_A))) === 'journal-vault-unlock-failed');
await P.unlock(PASS_B);
ok('…новая открывает', (await J.projects.get(project)).title === 'Проект ' + CANARY);
ok('смена с неверной фразой — отказ без изменений', (await rejects(() => P.changePassphrase('nope-nope', PASS_A))) === 'journal-vault-unlock-failed');

const vaultNow = await CWDB.journalMeta.get('crypto:v1');
await CWDB.journalMeta.remove('crypto:v1');
let st = await P.status();
ok('шифротекст без сейфа — broken, без автоматического «ремонта»', st.state === 'broken' && st.error === 'journal-vault-missing' && !P.isUnlocked());
ok('…новый сейф поверх — отказ', (await rejects(() => P.setup(PASS_A, plainTask))) === 'journal-vault-missing');
await CWDB.journalMeta.put({ ...vaultNow, kdf: { ...vaultNow.kdf, hash: 'MD5' } });
st = await P.status();
ok('испорченный сейф — broken', st.state === 'broken');
ok('…разблокировка — отказ, сейф не перезаписан', (await rejects(() => P.unlock(PASS_B))) === 'journal-vault-unsupported' && (await CWDB.journalMeta.get('crypto:v1')).kdf.hash === 'MD5');
await CWDB.journalMeta.put(vaultNow);
await P.unlock(PASS_B);
for (const id of (await CWDB.journalEntries.getAll()).filter((r) => r.sec).map((r) => r.id)) {
  try { await P.unprotect(id); } catch (e) { /* закрытые посещения и т.п. — не цель этого шага */ }
}
P.lock();
st = await P.status();
ok('сейф есть, защищённых строк нет — корректно, стартует заблокированным', st.state === 'locked');

/* ═══ 11. Код экранов: данные только через фасад ═══════════════════════ */
console.log('\n11. Слой экранов');
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const ui = strip(['core', 'districts', 'visits', 'tasks', 'projects', 'search-archive', 'protection'].map((f) => read('journal/js/app/' + f + '.js')).join('\n') + read('journal/js/app.js'));
ok('экраны не трогают CWJournalCrypto напрямую', !/CWJournalCrypto/.test(ui));
ok('ни localStorage, ни sessionStorage в экранах', !/localStorage|sessionStorage/.test(ui));
ok('фраза не логируется', !/console\.[a-z]+\([^)]*(pass|фраз)/i.test(ui + read('journal/js/crypto.js') + read('journal/js/data.js')));
const html = read('journal/index.html');
ok('crypto.js подключён до data.js', html.indexOf('js/crypto.js') > -1 && html.indexOf('js/crypto.js') < html.indexOf('js/data.js'));
ok('sw.js прекэширует crypto.js и protection.js', /'\.\/js\/crypto\.js'/.test(read('journal/sw.js')) && /'\.\/js\/app\/protection\.js'/.test(read('journal/sw.js')));
const passInputs = html.match(/<input[^>]*id="protect(Pass|Confirm|Old)"[^>]*>/g) || [];
ok('поля фразы — type=password, без автоподстановки текста', passInputs.length === 3 && passInputs.every((m) => /type="password"/.test(m) && /autocomplete="(current|new)-password"/.test(m)));
ok('фраза не попадает в хэш/URL/хранилища экранов', !/location\.(hash|search)\s*=[^;]*protect(Pass|Old|Confirm)/.test(ui) && !/protectUi\.[a-z]+\s*=\s*pass\b/.test(ui));

console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ Защита Журнала (J8): все проверки пройдены');
process.exit(failed ? 1 : 0);
