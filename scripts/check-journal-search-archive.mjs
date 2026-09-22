#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-search-archive.mjs
 *
 * Фаза J6: поиск (CWJournal.search) и архив (CWJournal.archive +
 * nodes.archive/unarchive). Поиск — только чтение, в памяти, без
 * сохранённого индекса/истории; архив — status/archivedAt, без каскада.
 *
 *   node scripts/check-journal-search-archive.mjs   (fake-indexeddb, acorn)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';
import * as acorn from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

globalThis.self = globalThis;
const mem = new Map();
let lsWrites = 0;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { lsWrites++; mem.set(k, String(v)); },
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
await CWDB.init();
const J = CWJournal;
const S = J.search;
const ids = (res) => res.results.map((r) => r.id);
const has = (res, id) => ids(res).includes(id);

/* Данные */
const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Приозёрное', communityId: 'com_1' });
const cong2 = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Южное' });
const grp = await J.nodes.add({ kind: 'pregroup', parentId: cong, label: 'Озёрная' });
const v1 = await J.visits.add({ nodeId: cong, dateFrom: '2026-10-05', dateTo: '2026-10-10' });
const v2 = await J.visits.add({ nodeId: cong, dateFrom: '2027-04-09', dateTo: '2027-04-14' });
const vS = await J.visits.add({ nodeId: cong2, dateFrom: '2027-05-01', dateTo: '2027-05-03' });
const note = await J.visitRecords.add(v2, { type: 'note', body: 'Расписание группы Озёрная обсудили с координатором' });
const obs = await J.visitRecords.add(v2, { type: 'observation', body: 'Зал   маленький,\nнужен второй поток' });
const qst = await J.visitRecords.add(v2, { type: 'question', body: 'Когда начнётся изучение с семьёй Новак?' });
const vtodo = await J.visitRecords.add(v2, { type: 'todo', body: 'Позвонить старейшинам насчёт территории' });
const carryQ = await J.visitRecords.add(v2, { type: 'question', body: 'Вернуться к вопросу о расписании' });
await J.carry.mark(carryQ);
const oldNote = await J.visitRecords.add(v1, { type: 'note', body: 'Когда предгруппа Озёрная только образовалась' });
const stask = await J.tasks.add({ nodeId: cong2, body: 'Заказать литературу для Южного', dueDate: '2027-06-01' });
const xss = await J.tasks.add({ nodeId: cong2, body: '<img src=x onerror=alert(1)> проверка' });
const directory = { com_1: { name: 'Приозёрное-Центр', congNumber: '41277', address: 'ул. Лесная, 5', contactName: 'Павел Кравец' } };
const resolve = (id) => directory[id] || null;

/* ═══ 1. Нормализация ═════════════════════════════════════════════════ */
console.log('\n1. Нормализация запроса');
ok('trim + схлопывание пробелов', S.normalizeQuery('   Озёрная    группы  ') === 'озерная группы');
ok('регистр не важен', S.fold('ПРИОЗЁРНОЕ') === S.fold('приозёрное'));
ok('ё ≡ е', S.fold('Озёрная') === S.fold('Озерная'));
ok('й, ї, ґ не сворачиваются', S.fold('йїґ') === 'йїґ');
ok('латинские диакритики сняты, ß→ss, ł→l', S.fold('Äpfel Straße Łódź café') === 'apfel strasse lodz cafe');
ok('пустой/пробельный запрос → нет токенов', S.tokens('   ').length === 0);
ok('пустой запрос не возвращает результатов', (await S.run('   ')).results.length === 0);

/* ═══ 2. Совпадения ══════════════════════════════════════════════════ */
console.log('\n2. Совпадения по видам');
let r = await S.run('координатором');
ok('note посещения по body', has(r, note));
ok('observation по body (переносы строк)', has(await S.run('второй поток'), obs));
ok('question по body', has(await S.run('НОВАК'), qst));
ok('задача посещения', has(await S.run('старейшинам'), vtodo));
ok('самостоятельная задача', has(await S.run('литературу'), stask));
ok('узел: группа/предгруппа по label', has(await S.run('озёрная'), grp));
ok('узел: район по label', has(await S.run('eu-k-03'), c));
ok('перенос находится', has(await S.run('вернуться'), carryQ));
r = await S.run('Озёрная координатором');
ok('AND по токенам: оба в тексте', has(r, note) && r.results.length === 1, ids(r).join());
ok('AND: запись + контекст собрания', has(await S.run('координатором приозёрное'), note));
ok('AND: нет лишнего совпадения', !has(await S.run('координатором южное'), note));
ok('несвязанный запрос ничего не находит', (await S.run('абракадабра')).results.length === 0);
ok('контекст не размножает записи: «Приозёрное» не возвращает note', !has(await S.run('Приозёрное'), note));
ok('посещение находится по контексту собрания', has(await S.run('Приозёрное'), v2));
ok('посещение по производной подписи (labelVisit)', has(await S.run('осень 2026', { labelVisit: (v) => (v.dateFrom < '2027' ? 'осень 2026' : 'весна 2027') }), v1));

/* ═══ 3. Справочник — только в памяти ═════════════════════════════════ */
console.log('\n3. CWDirectory — обогащение в памяти');
ok('каноническое имя справочника находит собрание', has(await S.run('Центр', { resolveCommunity: resolve }), cong));
ok('номер собрания', has(await S.run('41277', { resolveCommunity: resolve }), cong));
ok('адрес', has(await S.run('лесная', { resolveCommunity: resolve }), cong));
ok('без справочника — fallback label работает', has(await S.run('Приозёрное'), cong));
ok('справочник недоступен (resolve бросает) — без падения', has(await S.run('Приозёрное', { resolveCommunity: () => { throw new Error('x'); } }), cong));
ok('нет записи справочника — узел не «сломан», ищется по label', has(await S.run('Приозёрное', { resolveCommunity: () => null }), cong));
const congRow = await J.nodes.get(cong);
ok('обогащение ничего не записало в узел', !('name' in congRow) && !('congNumber' in congRow) && !('address' in congRow));

/* ═══ 4. Ранг ═════════════════════════════════════════════════════════ */
console.log('\n4. Детерминированный ранг');
const exact = await J.tasks.add({ nodeId: cong2, body: 'Территория' });
await sleep(3);
const starts = await J.tasks.add({ nodeId: cong2, body: 'Территория — обновить карты' });
await sleep(3);
const inner = await J.tasks.add({ nodeId: cong2, body: 'Карты: территория центра' });
r = await S.run('территория');
const pos = (id) => ids(r).indexOf(id);
ok('целое поле > начало поля > подстрока (даже если новее)', pos(exact) < pos(starts) && pos(starts) < pos(inner) && pos(exact) >= 0, ids(r).join());
const again = await S.run('территория');
ok('повторный прогон — тот же порядок', ids(again).join() === ids(r).join());
await J.tasks.remove(exact); await J.tasks.remove(starts); await J.tasks.remove(inner);

/* ═══ 5. Архив в контексте ═══════════════════════════════════════════ */
console.log('\n5. Активный и архивный контекст');
await J.visits.complete(v1);
await J.visits.archive(v1);
r = await S.run('образовалась');
ok('запись архивного посещения по умолчанию исключена', !has(r, oldNote) && r.archivedCount === 1);
r = await S.run('образовалась', { includeArchive: true });
ok('includeArchive находит её с признаком archived', has(r, oldNote) && r.results.find((x) => x.id === oldNote).archived === true);
ok('само архивное посещение: по умолчанию нет', !has(await S.run('Приозёрное'), v1));
await J.nodes.archive(cong2);
ok('узел в архиве — его задача исключена', !has(await S.run('литературу'), stask));
ok('узел в архиве — сам узел исключён', !has(await S.run('Южное'), cong2));
ok('посещение архивного узла исключено', !has(await S.run('Южное'), vS));
ok('includeArchive возвращает задачу узла', has(await S.run('литературу', { includeArchive: true }), stask));
await J.nodes.unarchive(cong2);
ok('после восстановления узла — сразу в поиске', has(await S.run('литературу'), stask));
await J.nodes.archive(c);
ok('архивный район: группа внутри — архивна в контексте', !has(await S.run('озёрная'), grp));
await J.nodes.unarchive(c);
await J.tasks.complete(vtodo);
ok('выполненная задача НЕ архив', has(await S.run('старейшинам'), vtodo));
const closer = await J.visits.add({ nodeId: cong, dateFrom: '2027-10-01', dateTo: '2027-10-05' });
await J.carry.touch(carryQ, closer, 'closed');
ok('закрытый перенос НЕ архив', has(await S.run('вернуться'), carryQ));
await J.visits.unarchive(v1);
ok('восстановленное посещение — запись снова в поиске', has(await S.run('образовалась'), oldNote));

/* ═══ 6. Граница J8 ══════════════════════════════════════════════════ */
console.log('\n6. Защищённые строки (sec)');
await CWDB.journalEntries.add({ id: 'je_sec1', type: 'note', nodeId: cong, circuitId: c, status: 'open', sec: { iv: 'x', ct: 'СЕКРЕТНОЕСЛОВО-cipher' } });
await CWDB.journalEntries.add({ id: 'je_sec2', type: 'note', nodeId: cong, circuitId: c, status: 'open', body: 'СЕКРЕТНОЕСЛОВО', sec: { iv: 'y', ct: 'zz' } });
r = await S.run('СЕКРЕТНОЕСЛОВО');
ok('ни шифротекст, ни остаточный body защищённой строки не ищутся', r.results.length === 0);
ok('защищённые строки считаются', r.protectedCount === 2);
const metaRows = await CWDB.journalMeta.getAll();
ok('поиск не пишет в journalMeta', metaRows.length === 0);
const beforeRows = JSON.stringify(await CWDB.journalEntries.getAll());
await S.run('озёрная'); await S.run('координатором', { includeArchive: true });
ok('поиск ничего не пишет в journalEntries', JSON.stringify(await CWDB.journalEntries.getAll()) === beforeRows);
ok('поиск не трогает localStorage', lsWrites === 0 && mem.size === 0);
await CWDB.journalEntries.remove('je_sec1'); await CWDB.journalEntries.remove('je_sec2');

/* ═══ 7. Подсветка ═══════════════════════════════════════════════════ */
console.log('\n7. Подсветка и отрывок');
const hl = S.highlight('Расписание группы Озёрная', 'озерная');
ok('подсветка по исходной строке (ё)', hl.filter((s) => s.hit).map((s) => s.text).join() === 'Озёрная');
ok('сегменты складываются в исходный текст', hl.map((s) => s.text).join('') === 'Расписание группы Озёрная');
const evil = S.highlight('<img src=x onerror=alert(1)> проверка', 'проверка');
ok('HTML остаётся текстом сегментов', evil.map((s) => s.text).join('') === '<img src=x onerror=alert(1)> проверка');
ok('HTML-подобный body находится как текст', has(await S.run('onerror'), xss));
const sn = S.snippet('а '.repeat(60) + 'Озёрная ' + 'б '.repeat(80), 'озёрная');
ok('отрывок обрезан с «…» и содержит совпадение', sn[0].text === '…' && sn[sn.length - 1].text === '…' && sn.some((s) => s.hit));

/* ═══ 8. Архив узлов ═════════════════════════════════════════════════ */
console.log('\n8. Жизненный цикл архива узла');
const n8 = await J.nodes.add({ kind: 'group', parentId: cong, label: 'Восточная' });
const a8 = await J.nodes.archive(n8);
ok('archive: status + archivedAt', a8.status === 'archived' && !!a8.archivedAt);
ok('повторный archive отклонён', (await rejects(() => J.nodes.archive(n8))) === 'journal-node-invalid-transition');
const u8 = await J.nodes.unarchive(n8);
ok('unarchive: active, archivedAt физически удалён', u8.status === 'active' && !('archivedAt' in (await J.nodes.get(n8))));
ok('unarchive неархивного отклонён', (await rejects(() => J.nodes.unarchive(n8))) === 'journal-node-invalid-transition');
ok('update({status}) в обход цикла отклонён', (await rejects(() => J.nodes.update(n8, { status: 'archived' }))) === 'journal-node-use-lifecycle');
ok('update({archivedAt}) отклонён', (await rejects(() => J.nodes.update(n8, { archivedAt: 'x' }))) === 'journal-node-use-lifecycle');
ok('update с тем же статусом — не ошибка', (await J.nodes.update(n8, { status: 'active', label: 'Восточная-2' })).label === 'Восточная-2');
ok('rename/sort/fields/communityId работают', !!(await J.nodes.update(n8, { sort: 5, fields: { x: 1 } })) && !!(await J.nodes.update(cong, { communityId: 'com_1' })));
ok('archive несуществующего — journal-node-not-found', (await rejects(() => J.nodes.archive('nope'))) === 'journal-node-not-found');

/* ═══ 9. Экран архива: выборка ═══════════════════════════════════════ */
console.log('\n9. CWJournal.archive');
const legacy = await J.nodes.add({ kind: 'group', parentId: cong, label: 'Легаси', status: 'archived' });
ok('легаси-узел без archivedAt', !('archivedAt' in (await J.nodes.get(legacy))));
await sleep(3);
await J.nodes.archive(cong2);
await sleep(3);
await J.visits.archive(v2);
let list = await J.archive.list();
const lids = list.map((i) => i.id);
ok('в списке узлы и посещения', lids.includes(cong2) && lids.includes(v2) && lids.includes(legacy));
ok('легаси-узел в списке, archivedAt=null', list.find((i) => i.id === legacy).archivedAt === null);
ok('новые сверху: v2 раньше cong2', lids.indexOf(v2) < lids.indexOf(cong2));
ok('потомки архивного узла не размножаются (vS нет в списке)', !lids.includes(vS));
ok('выполненная задача и закрытый перенос — не в архиве', !lids.includes(vtodo) && !lids.includes(carryQ) && !lids.includes(note));
ok('порядок детерминирован', (await J.archive.list()).map((i) => i.id).join() === lids.join());
await J.visits.archive(vS);
list = await J.archive.list();
ok('архивное посещение в архивном узле: parentArchived', list.find((i) => i.id === vS).parentArchived === true);
await J.archive.restore(list.find((i) => i.id === vS));
ok('восстановление посещения — только его (узел остаётся в архиве)', (await J.visits.get(vS)).status !== 'archived' && (await J.nodes.get(cong2)).status === 'archived');
ok('восстановленное под архивным узлом — всё ещё архив в контексте поиска', !has(await S.run('Южное'), vS));
await J.archive.restore(list.find((i) => i.id === cong2));
ok('восстановление узла без каскада: посещение не трогалось', (await J.visits.get(vS)).status === 'open');
ok('после восстановления — сразу в обычном поиске', has(await S.run('Южное'), cong2) && has(await S.run('Южное'), vS));
await J.archive.restore((await J.archive.list()).find((i) => i.id === legacy));
ok('легаси-узел восстанавливается', (await J.nodes.get(legacy)).status === 'active');
await J.archive.restore((await J.archive.list()).find((i) => i.id === v2));
ok('restore посещения через канонический unarchive (прежний статус)', (await J.visits.get(v2)).status === 'open');

/* ═══ 10. Структура экрана ═══════════════════════════════════════════ */
console.log('\n10. Структура app.js / route.js / index.html');
const app = read('journal/js/app.js');
const names = new Set();
for (const tok of acorn.tokenizer(app, { ecmaVersion: 'latest' })) if (tok.type.label === 'name') names.add(tok.value);
ok('app.js не обращается к CWDB', !names.has('CWDB'));
ok('app.js не использует localStorage/sessionStorage', !names.has('localStorage') && !names.has('sessionStorage'));
const route = read('journal/js/route.js');
ok('маршрут поиска — голый #search без хвоста запроса', /'search'/.test(route) && !/search\//.test(route));
ok('запрос не пишется в hash/history', !/location\.hash\s*=\s*[^;]*searchUi\.query/.test(app) && !/history\.(push|replace)State/.test(app));
const j6 = app.slice(app.indexOf('═══ Поиск (J6)'), app.indexOf('═══ Создание района/собрания'));
ok('блок J6 найден', j6.length > 1000);
ok('J6: innerHTML только для статичных иконок svg(...)',
  (j6.match(/innerHTML\s*=[^;]*;/g) || []).every((m) => /innerHTML\s*=\s*svg\(/.test(m)), (j6.match(/innerHTML\s*=[^;]*;/g) || []).join(' | '));
ok('подсветка — <mark> через textContent', /el\('mark', 'j-hit', s\.text\)/.test(app));
ok('устаревший ответ отбрасывается по номеру прогона', /mine !== searchUi\.seq/.test(app));
ok('восстановление из архива — через CWJournal.archive.restore', /CWJournal\.archive\.restore\(/.test(app));
ok('действия архива узла — через archive/unarchive', !/nodes\.update\([^)]*status/.test(app));
const html = read('journal/index.html');
ok('экран поиска: поле, фильтры, результаты', /id="searchInput"/.test(html) && /id="searchFilters"/.test(html) && /id="searchResults"/.test(html));
ok('экран архива: список и вкладки', /id="archiveList"/.test(html) && /data-archive-tab="visits"/.test(html));
ok('заглушек поиска/архива больше нет', !/j-placeholder" data-route="(search|archive)"/.test(html));
const data = read('journal/js/data.js');
ok('фасады J3–J5 на месте', ['journal-visit-use-facade', 'journal-visit-record-use-facade', 'journal-task-use-facade', 'journal-carry-use-facade'].every((k) => data.includes(k)));
ok('поиск не пишет в хранилища (нет add/put/update в search/snapshot)',
  !/search = \{[\s\S]*?(\.put\(|\.add\(|\.update\(|mutate\()[\s\S]*?\n  \};\n\n  \/\* ═══ Архив/.test(data));

console.log(failed ? `\n✗ провалов: ${failed}` : '\n✓ J6: поиск и архив — все проверки прошли');
process.exit(failed ? 1 : 0);
