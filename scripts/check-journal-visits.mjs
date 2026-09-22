#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-visits.mjs
 *
 * Фаза J4a: жизненный цикл посещения (CWJournal.visits) и маршрут экрана
 * посещения (CWJournalRoute). Посещение — строка journalEntries c
 * type:'visit'; пятого хранилища нет.
 *
 * ПОЧЕМУ ЗДЕСЬ: инварианты посещения (неизменяемый узел, порядок дат,
 * статус только через жизненный цикл, запрет удаления с содержимым) держит
 * слой данных, а не экран — нарушение незаметно в UI и всплывает
 * рассинхроном данных.
 *
 *   node scripts/check-journal-visits.mjs      (требует fake-indexeddb, acorn)
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
eval(read('journal/js/route.js'));
await CWDB.init();
const J = CWJournal;

const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-T' });
const cong = await J.nodes.add({ kind: 'congregation', parentId: c, label: 'Северное' });
const grp = await J.nodes.add({ kind: 'group', parentId: cong, label: 'Группа' });

/* ═══ 1. Создание ═══════════════════════════════════════════════════════ */
console.log('\n1. Создание посещения');
const v1 = await J.visits.add({ nodeId: cong, dateFrom: '2028-04-09', dateTo: '2028-04-14' });
const r1 = await J.visits.get(v1);
ok('строка journalEntries с type=visit', r1 && r1.type === 'visit' && /^je_/.test(v1));
ok('nodeId/circuitId от узла', r1.nodeId === cong && r1.circuitId === c);
ok('status по умолчанию open', r1.status === 'open');
ok('даты сохранены как есть', r1.dateFrom === '2028-04-09' && r1.dateTo === '2028-04-14');
ok('createdAt/updatedAt проставлены', !!r1.createdAt && !!r1.updatedAt);
ok('пятого хранилища нет — только четыре journal*',
  Object.keys(CWDB).filter((k) => /^journal/.test(k)).sort().join() === 'journalEntries,journalLinks,journalMeta,journalNodes');
ok('посещение группы тоже допустимо', /^je_/.test(await J.visits.add({ nodeId: grp, dateFrom: '2028-01-01', dateTo: '2028-01-01' })));
ok('посещение района отклонено', (await rejects(() => J.visits.add({ nodeId: c, dateFrom: '2028-01-01', dateTo: '2028-01-02' }))) === 'journal-visit-invalid-parent');
ok('несуществующий узел отклонён', (await rejects(() => J.visits.add({ nodeId: 'nope', dateFrom: '2028-01-01', dateTo: '2028-01-02' }))) === 'journal-visit-invalid-parent');

/* ═══ 2. Даты ═══════════════════════════════════════════════════════════ */
console.log('\n2. Проверка дат');
const bad = [['2028-04-14', '2028-04-09'], ['2028-02-30', '2028-03-01'], ['', '2028-03-01'], ['2028-03-01', undefined], ['9.4.2028', '14.4.2028']];
for (const [f, t] of bad) {
  ok(`отклонено: ${f} → ${t}`, (await rejects(() => J.visits.add({ nodeId: cong, dateFrom: f, dateTo: t }))) === 'journal-visit-invalid-dates');
}
ok('однодневное посещение допустимо', !!(await J.visits.add({ nodeId: cong, dateFrom: '2027-11-08', dateTo: '2027-11-08' })));

/* ═══ 3. Правка ═════════════════════════════════════════════════════════ */
console.log('\n3. Правка посещения');
await new Promise((r) => setTimeout(r, 5));
const u = await J.visits.update(v1, { dateTo: '2028-04-15' });
ok('дата изменена, id/createdAt сохранены', u.dateTo === '2028-04-15' && u.id === v1 && u.createdAt === r1.createdAt);
ok('updatedAt продвинулся', u.updatedAt > r1.updatedAt);
ok('итоговая пара дат проверяется (одна дата в патче)', (await rejects(() => J.visits.update(v1, { dateTo: '2028-04-01' }))) === 'journal-visit-invalid-dates');
ok('после отказа запись не изменилась', (await J.visits.get(v1)).dateTo === '2028-04-15');
ok('nodeId неизменяем', (await rejects(() => J.visits.update(v1, { nodeId: grp }))) === 'journal-visit-immutable');
ok('circuitId неизменяем', (await rejects(() => J.visits.update(v1, { circuitId: 'x' }))) === 'journal-visit-immutable');
ok('type неизменяем', (await rejects(() => J.visits.update(v1, { type: 'note' }))) === 'journal-visit-immutable');
ok('status через update запрещён', (await rejects(() => J.visits.update(v1, { status: 'completed' }))) === 'journal-visit-invalid-transition');
ok('тот же nodeId в патче не ошибка', (await J.visits.update(v1, { nodeId: cong })).nodeId === cong);
ok('update чужой записи (не visit) отклонён',
  (await rejects(async () => { const n = await J.entries.add({ type: 'note', nodeId: cong, circuitId: c, status: 'open' }); await J.visits.update(n, { dateFrom: '2028-01-01' }); })) === 'journal-visit-not-found');

/* ═══ 4. Порядок и выборка по узлу ══════════════════════════════════════ */
console.log('\n4. Выборка по узлу');
const v0 = await J.visits.add({ nodeId: cong, dateFrom: '2027-03-14', dateTo: '2027-03-19' });
const list = await J.visits.byNode(cong);
ok('только посещения (заметка того же узла не попала)', list.every((v) => v.type === 'visit'));
ok('новые сверху (dateFrom по убыванию)', list.map((v) => v.dateFrom).join() === ['2028-04-09', '2027-11-08', '2027-03-14'].join(), list.map((v) => v.dateFrom).join());
ok('посещение группы не видно в собрании', list.length === 3);
ok('пересечение посещений одного узла допускается',
  !!(await J.visits.add({ nodeId: cong, dateFrom: '2028-04-10', dateTo: '2028-04-11' })));

/* ═══ 5. Жизненный цикл ═════════════════════════════════════════════════ */
console.log('\n5. Завершение / архив');
ok('open → completed', (await J.visits.complete(v1)).status === 'completed');
ok('повторное complete отклонено', (await rejects(() => J.visits.complete(v1))) === 'journal-visit-invalid-transition');
ok('completed → open (reopen)', (await J.visits.reopen(v1)).status === 'open');
await J.visits.complete(v1);
const a = await J.visits.archive(v1);
ok('archive: status archived + archivedAt', a.status === 'archived' && !!a.archivedAt);
ok('complete архивного отклонено', (await rejects(() => J.visits.complete(v1))) === 'journal-visit-invalid-transition');
const ua = await J.visits.unarchive(v1);
ok('unarchive возвращает прежний статус (completed)', ua.status === 'completed' && ua.archivedAt === null && !ua.fields.statusBeforeArchive);
await J.visits.archive(v0);
ok('unarchive открытого возвращает open', (await J.visits.unarchive(v0)).status === 'open');

/* ═══ 6. Безопасное удаление ════════════════════════════════════════════ */
console.log('\n6. Удаление');
// J4b: запись посещения создаётся только через visitRecords и только в открытом посещении.
await J.visits.reopen(v1);
const child = await J.visitRecords.add(v1, { type: 'todo', body: 'задача' });
ok('children() находит запись посещения', (await J.visits.children(v1)).map((e) => e.id).join() === child);
ok('удаление посещения с записями отклонено', (await rejects(() => J.visits.remove(v1))) === 'journal-visit-has-entries');
ok('после отказа посещение и запись целы', !!(await J.visits.get(v1)) && !!(await J.entries.get(child)));
await J.visitRecords.remove(child);
const lk = await J.links.add({ from: J.urn.entry(v1), to: J.urn.node(cong), rel: 'relates' });
ok('удаление посещения со связью отклонено', (await rejects(() => J.visits.remove(v1))) === 'journal-visit-has-links');
await J.links.remove(lk);
ok('пустое посещение удаляется', (await rejects(() => J.visits.remove(v1))) === null && (await J.visits.get(v1)) === null);
ok('узел с посещениями не удаляется (J3a safe-delete)', (await rejects(() => J.nodes.remove(cong))) === 'journal-node-has-children'
  || (await rejects(() => J.nodes.remove(cong))) === 'journal-node-has-entries');

/* ═══ 7. Маршрут ════════════════════════════════════════════════════════ */
console.log('\n7. Маршрут');
const P = CWJournalRoute.parse;
const B = CWJournalRoute.build;
ok('собрание → вкладка Обзор', P('#districts/c1/congregation/n1').congTab === 'overview' && !P('#districts/c1/congregation/n1').visitId);
ok('вкладка Посещения', P('#districts/c1/congregation/n1/visits').congTab === 'visits');
const pv = P('#districts/c1/congregation/n1/visit/je_1');
ok('посещение: все три id', pv.circuitId === 'c1' && pv.congregationId === 'n1' && pv.visitId === 'je_1' && !pv.normalized);
ok('…/visit без id → Посещения, помечено к нормализации', P('#districts/c1/congregation/n1/visit').congTab === 'visits' && P('#districts/c1/congregation/n1/visit').normalized);
ok('лишний хвост → Посещения, нормализация', P('#districts/c1/congregation/n1/visit/v/x').normalized && !P('#districts/c1/congregation/n1/visit/v/x').visitId);
ok('битое кодирование не бросает', (() => { try { P('#districts/%E0%A4%A/congregation/n'); return true; } catch (_) { return false; } })());
ok('неизвестный маршрут → overview', P('#nonsense').route === 'overview');
ok('build ↔ parse согласованы', P(B.visit('c 1', 'n/1', 'je_1')).visitId === 'je_1' && P(B.visit('c 1', 'n/1', 'je_1')).congregationId === 'n/1');

/* ═══ 8. Граница UI ═════════════════════════════════════════════════════ */
console.log('\n8. Граница UI ↔ данные');
{
  const acorn = await import('acorn');
  const walk = await import('acorn-walk');
  const src = read('journal/js/app.js');
  const ast = acorn.parse(src, { ecmaVersion: 2022 });
  let rawDb = 0, visitViaEntries = 0;
  walk.full(ast, (n) => {
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'CWDB') rawDb++;
    if (n.type === 'Property' && n.key && (n.key.name === 'type' || n.key.value === 'type')
      && n.value.type === 'Literal' && n.value.value === 'visit') visitViaEntries++;
  });
  ok('app.js не обращается к CWDB напрямую', rawDb === 0, String(rawDb));
  ok('app.js не создаёт записи type:visit в обход CWJournal.visits', visitViaEntries === 0, String(visitViaEntries));
  ok('операции посещения идут через CWJournal.visits.*',
    ['visits.add(', 'visits.update(', 'visits.complete(', 'visits.archive(', 'visits.remove(', 'visits.byNode('].every((m) => src.includes(m)));
  ok('разбор маршрута — через CWJournalRoute', /CWJournalRoute\.parse\(location\.hash\)/.test(src));
  ok('app.js/route.js/data.js без localStorage',
    ['journal/js/app.js', 'journal/js/route.js', 'journal/js/data.js'].every((f) => !/localStorage/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))));
  ok('route.js подключён и в прекэше', read('journal/index.html').includes('js/route.js') && read('journal/sw.js').includes("'./js/route.js'"));
}
ok('в localStorage за прогон ничего не записано', mem.size === 0, [...mem.keys()].join());

/* ═══ 9. Общий фасад записей не мутирует посещения ═════════════════════
 * Регрессия финального аудита J4a: entries.add/update/remove обходили все
 * инварианты посещения через тот же официальный фасад CWJournal. */
console.log('\n9. Обход через CWJournal.entries закрыт');
{
  const E = 'journal-visit-use-facade';
  ok('entries.add({type:visit}) отклонён',
    (await rejects(() => J.entries.add({ type: 'visit', nodeId: cong, circuitId: c, status: 'open', dateFrom: '2028-09-01', dateTo: '2028-09-02' }))) === E);
  ok('даже невалидный visit через entries.add не создаётся',
    (await rejects(() => J.entries.add({ type: 'visit', nodeId: c, dateFrom: 'x', dateTo: 'y' }))) === E
      && (await J.visits.byNode(c)).length === 0);

  const bv = await J.visits.add({ nodeId: cong, dateFrom: '2028-09-10', dateTo: '2028-09-12' });
  const before = JSON.stringify(await J.visits.get(bv));
  for (const [label, patch] of [
    ['status', { status: 'archived' }], ['nodeId', { nodeId: grp }], ['circuitId', { circuitId: 'x' }],
    ['type', { type: 'note' }], ['даты (невалидные)', { dateTo: '2000-01-01' }], ['label/title', { title: 'x' }],
  ]) {
    ok(`entries.update(visit) отклонён: ${label}`, (await rejects(() => J.entries.update(bv, patch))) === E);
  }
  ok('после попыток обхода посещение не изменилось', JSON.stringify(await J.visits.get(bv)) === before);

  const kid = await J.visitRecords.add(bv, { type: 'todo', body: 'задача' });
  ok('entries.remove(visit с записью) отклонён — обхода visits.remove нет', (await rejects(() => J.entries.remove(bv))) === E);
  ok('посещение и его запись целы', !!(await J.visits.get(bv)) && !!(await J.entries.get(kid)));
  ok('visits.remove по-прежнему отказывает с записью', (await rejects(() => J.visits.remove(bv))) === 'journal-visit-has-entries');

  const note = await J.entries.add({ type: 'note', nodeId: cong, circuitId: c, status: 'open' });
  ok('note → visit через entries.update запрещён', (await rejects(() => J.entries.update(note, { type: 'visit' }))) === E);
  ok('обычная запись: update работает', (await J.entries.update(note, { status: 'done' })).status === 'done');
  ok('обычная запись: remove работает', (await rejects(() => J.entries.remove(note))) === null && (await J.entries.get(note)) === null);
  ok('запись посещения удаляется только через visitRecords.remove', (await rejects(() => J.visitRecords.remove(kid))) === null);

  ok('visits.* работают штатно: update', (await J.visits.update(bv, { dateTo: '2028-09-13' })).dateTo === '2028-09-13');
  ok('visits.* работают штатно: complete/archive', (await J.visits.complete(bv)).status === 'completed' && (await J.visits.archive(bv)).status === 'archived');
  ok('visits.* работают штатно: remove пустого', (await rejects(() => J.visits.remove(bv))) === null && (await J.visits.get(bv)) === null);
}

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nПосещения Журнала: все проверки пройдены.');
process.exit(failed ? 1 : 0);
