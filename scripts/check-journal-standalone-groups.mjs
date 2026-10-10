#!/usr/bin/env node
/**
 * Журнал — самостоятельные группы (0.25.0, решение Алекса 10.10.2026):
 * группа/предгруппа прямо под районом (`parentId` = район). Слой данных
 * (иерархия, isStandalone, посещения, задачи, Состав, Обзор, удаление) и
 * разметка экранов (страница группы, импорт, i18n).
 *
 *   node scripts/check-journal-standalone-groups.mjs
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
const cong = await N.add({ kind: 'congregation', parentId: circuit, label: 'Praha' });
const nested = await N.add({ kind: 'group', parentId: cong, label: 'Вложенная' });

console.log('\nИерархия');
const sg = await N.add({ kind: 'group', parentId: circuit, label: 'Group (Ukrainian) Leipzig-Russian' });
const sp = await N.add({ kind: 'pregroup', parentId: circuit, label: 'Предгруппа без собрания' });
ok('самостоятельная группа: circuitId = район', (await N.get(sg)).circuitId === circuit);
ok('isStandalone: группа и предгруппа под районом — да', N.isStandalone(await N.get(sg)) && N.isStandalone(await N.get(sp)));
ok('isStandalone: вложенная, собрание, район — нет', !N.isStandalone(await N.get(nested)) && !N.isStandalone(await N.get(cong)) && !N.isStandalone(await N.get(circuit)));
ok('под группу — отказ', (await rejects(() => N.add({ kind: 'group', parentId: sg, label: 'x' }))) === 'journal-invalid-hierarchy');
ok('в корень — отказ', (await rejects(() => N.add({ kind: 'group', parentId: J.ROOT_PARENT, label: 'x' }))) === 'journal-invalid-hierarchy');
ok('kind/parentId по-прежнему неизменяемы', (await rejects(() => N.update(sg, { parentId: cong }))) === 'journal-immutable-parent'
  && (await rejects(() => N.update(sg, { kind: 'congregation' }))) === 'journal-immutable-kind');
await N.update(sg, { communityId: 'ev-leipzig' });
ok('карточка справочника у самостоятельной группы уникальна', (await rejects(() => N.update(sp, { communityId: 'ev-leipzig' }))) === 'journal-node-community-taken');

console.log('\nПосещения и задачи самостоятельной группы');
const v = await J.visits.add({ nodeId: sg, dateFrom: '2027-03-14', dateTo: '2027-03-19' });
ok('посещение создаётся и читается по узлу', (await J.visits.byNode(sg)).length === 1 && (await J.visits.get(v)).nodeId === sg);
const task = await J.tasks.add({ nodeId: sg, body: 'Задача группы' });
ok('задача узла-группы создаётся', (await J.tasks.list()).some((r) => r.id === task && r.nodeId === sg));

console.log('\nСостав и Обзор');
const roster = await J.roster.read();
const rs = roster.groups.find((x) => x.node.id === sg);
const rn = roster.groups.find((x) => x.node.id === nested);
ok('Состав: самостоятельная — standalone, без родителя', rs && rs.standalone === true && rs.parent === null);
ok('Состав: вложенная — родитель собрание', rn && rn.standalone === false && rn.parent && rn.parent.id === cong);
ok('Состав: предгруппа без собрания в своей вкладке', roster.pregroups.some((x) => x.node.id === sp && x.standalone));
const ov = await J.overview.read();
const ovv = ov.visits.find((x) => x.nodeId === sg);
ok('Обзор: посещение группы — хозяин сама группа', ovv && ovv.congregationId === sg && ovv.nodeKind === 'group');

console.log('\nУдаление самостоятельной группы');
ok('с посещением — отказ', (await rejects(() => N.removeWithContents(sg))) === 'journal-node-has-visits');
await J.visits.remove(v);
const counts = await N.removeWithContents(sg);
ok('после снятия посещения удаляется вместе с задачей', counts.todos === 1 && !(await N.get(sg)) && (await J.entries.byNode(sg)).length === 0);

console.log('\nЭкраны и словарь');
const core = read('journal/js/app/core.js');
ok('isHostNode: собрание или самостоятельная', /function isHostNode\(n\)[\s\S]{0,200}isStandalone/.test(core) && core.includes('A.isHostNode = isHostNode'));
ok('destFor ведёт на страницу самостоятельной группы', core.includes('isHostNode(node) ? node') && core.includes('v && isHostNode(node)'));
const districts = read('journal/js/app/districts.js');
ok('список района и страница — по isHostNode', districts.includes('.filter(isHostNode)') && districts.includes('!isHostNode(node) || node.circuitId !== circuitId'));
ok('блоки собрания прячутся у группы', districts.includes("$('#congIdentityCard').hidden = !isCong") && districts.includes("$('#congChildrenSec').hidden = !isCong"));
ok('«Записи» у группы сводятся к «Обзору»', districts.includes("tab === 'entries' && node.kind !== 'congregation'"));
ok('страница посещения принимает самостоятельную группу', read('journal/js/app/visits.js').includes('!isHostNode(node) || node.circuitId !== circuitId'));
ok('разметка: id секции дочерних групп', read('journal/index.html').includes('id="congChildrenSec"'));
const imp = read('journal/js/app/import.js');
ok('импорт: «Отдельная группа» первым родителем, родитель — район', imp.includes("var STANDALONE = 'circuit'")
  && imp.includes("{ value: STANDALONE, label: t('j.import.standalone') }") && imp.includes('p === STANDALONE ? model.circuitId'));
const dict = read('journal/i18n/dict.js');
for (const key of ['j.import.standalone', 'j.roster.standalone', 'j.unit.standalone_groups', 'j.standalone.meta']) {
  ok(key + ' — во всех пяти языках', (dict.match(new RegExp("'" + key.replace(/\./g, '\\.') + "'", 'g')) || []).length === 5);
}

console.log(failed ? `\nПровалено: ${failed}` : '\nВсё прошло');
process.exit(failed ? 1 : 0);
