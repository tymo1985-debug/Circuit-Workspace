#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-planner.mjs
 *
 * Фаза J9a: посещение Журнала ↔ запись Клиндария.
 *  - shared/planner.js (CWPlanner) — граница только для чтения: канон
 *    `state/circuit-planner`, нормализованные замороженные копии, без
 *    записи, без прежнего ключа, без опроса; маячок cw-state-rev;
 *  - CWJournal.planner — одна прямая связь на посещение
 *    (journal:entry/<v> → cw:circuit-planner/entry/<id>, rel external),
 *    замена пакетом, общий фасад связей её не обходит, правила J7 целы;
 *  - разрешение живое: даты/заголовок/удаление/восстановление;
 *  - глубокая ссылка Клиндария #calendar?entry=<id>, PIN не обходится;
 *  - копии: в Журнале только URN; внешняя «висячая» ссылка копию не ломает;
 *  - J8: открытый текст защищённых записей не попадает никуда нового.
 *
 *   node scripts/check-journal-planner.mjs   (fake-indexeddb)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

globalThis.self = globalThis;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
/* Шина событий окна: storage/pageshow соседней вкладки. */
const bus = {};
globalThis.addEventListener = (type, fn) => { (bus[type] = bus[type] || []).push(fn); };
const fire = (type, ev) => (bus[type] || []).forEach((fn) => fn(ev));
const timers = { interval: 0 };
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (...a) => { timers.interval++; return realSetInterval(...a); };
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = { journal: { version: '0.0.0' }, 'circuit-planner': { version: '0.0.0' } };

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e && e.message; } };
const tick = () => new Promise((r) => setTimeout(r, 20));

eval(read('shared/db.js'));
eval(read('shared/directory.js'));
eval(read('shared/planner.js'));
eval(read('journal/js/crypto.js'));
eval(read('journal/js/data.js'));
eval(read('shared/backup.js'));
await CWDB.init();
await CWDirectory.init();

const J = CWJournal;
const PL = J.planner;
const B = CWPlanner;
const MOD = 'circuit-planner';
const REV = 'cw-state-rev:circuit-planner';
const LEGACY = 'service-year-planner-v9-4-2';

let rev = 0;
const plannerBlob = (entries, events) => ({
  settings: { language: 'ru', emailBody: 'ПРИВАТНОЕ-ПИСЬМО' }, serviceYears: {},
  events: events || EVENTS, entries, meta: { version: 'x' },
});
const EVENTS = [
  { id: 'evt_north', name: 'Северное', visitType: 'congregation', color: '#123456' },
  { id: 'evt_grp', name: 'Озёрная группа', visitType: 'group' },
  { id: 'evt_plain', name: 'Серединное собрание', visitType: '' },
];
const ENTRIES = [
  { id: 'entry_north1', eventId: 'evt_north', start: '2028-03-13', end: '2028-03-18', title: 'Северное', note: 'ЗАМЕТКА', emailBody: 'ПИСЬМО', visitForm: { x: 1 } },
  { id: 'entry_north0', eventId: 'evt_north', start: '2027-10-01', end: '2027-10-05', title: 'Северное' },
  { id: 'entry_grp', eventId: 'evt_grp', start: '2028-03-20', end: '2028-03-22', title: 'Озёрная группа' },
  { id: 'entry_far', eventId: 'evt_grp', start: '2028-06-01', end: '2028-06-03', title: 'Озёрная группа' },
  { id: 'entry_plain', eventId: 'evt_plain', start: '2028-03-14', end: '2028-03-14', title: 'Серединное' },
];
async function writePlanner(entries, events, opts = {}) {
  rev++;
  await CWDB.state.put({ id: MOD, payload: typeof entries === 'string' ? entries : JSON.stringify(plannerBlob(entries, events)), savedAt: Date.now(), rev });
  if (opts.signal !== false) {
    localStorage.setItem(REV, 'r' + rev);
    fire('storage', { key: REV, newValue: 'r' + rev });
  }
  await tick();
}

/* ═══ 1. Мост: канон, копии, отказоустойчивость ═══════════════════════ */
console.log('\n1. CWPlanner: канон, копии, битые данные');
B.subscribe(() => {});   // как экран Журнала: подписка ставит слушатель маячка
await B.init();
ok('нет записи канона → empty, пустой список', B.status() === 'empty' && B.listEntries().length === 0);
localStorage.setItem(LEGACY, JSON.stringify(plannerBlob(ENTRIES)));
await B.refresh();
ok('прежний ключ localStorage не читается', B.status() === 'empty' && B.listEntries().length === 0);
localStorage.removeItem(LEGACY);
await writePlanner(ENTRIES);
const list = B.listEntries();
ok('канон прочитан, 5 записей', B.status() === 'ok' && list.length === 5, list.length);
const n1 = B.getEntry('entry_north1');
ok('getEntry: нормализованные поля', n1 && JSON.stringify(Object.keys(n1).sort()) === JSON.stringify(['communityId', 'end', 'eventId', 'id', 'name', 'start', 'title', 'visitType']));
ok('getEntry: communityId = eventId у визита', n1.communityId === 'evt_north' && n1.visitType === 'congregation');
ok('обычная запись: без visitType и communityId', B.getEntry('entry_plain').visitType === '' && B.getEntry('entry_plain').communityId === '');
ok('приватные поля не выходят (заметка, письмо, формуляр, настройки)', !/ЗАМЕТКА|ПИСЬМО|visitForm|settings|ПРИВАТНОЕ/.test(JSON.stringify(B.listEntries())));
ok('getEntry: отсутствующая → null', B.getEntry('entry_nope') === null && B.getEntry(undefined) === null && B.getEntry({}) === null);
ok('копия заморожена', Object.isFrozen(n1));
try { n1.start = '1999-01-01'; } catch (_) { /* strict */ }
const l0 = B.listEntries()[0];
try { l0.title = 'ПОРЧА'; } catch (_) { /* strict */ }
ok('правка копии не меняет мост', B.getEntry('entry_north1').start === '2028-03-13' && !B.listEntries().some((e) => e.title === 'ПОРЧА'));
ok('копии отдельные на каждый вызов', B.getEntry('entry_north1') !== B.getEntry('entry_north1'));
ok('канон в базе не тронут', JSON.parse((await CWDB.state.get(MOD)).payload).entries[0].start === '2028-03-13');
await writePlanner('{не json');
ok('битый JSON → invalid, пусто, без исключения', B.status() === 'invalid' && B.listEntries().length === 0);
await writePlanner(JSON.stringify({ foo: 'bar' }));
ok('чужая форма блоба → invalid', B.status() === 'invalid');
await writePlanner([{ id: 'bad id/x', eventId: 'evt_north', start: '2028-01-01', end: '2028-01-02' },
  { id: 'entry_baddate', eventId: 'evt_north', start: '2028-02-30', end: '2028-03-01' },
  { id: 'entry_ok', eventId: 'evt_north', start: '2028-01-01', end: '2028-01-02' }, null, 5]);
ok('кривые id/даты/строки отброшены', B.listEntries().map((e) => e.id).join() === 'entry_ok');
await writePlanner(ENTRIES);

console.log('\n1b. Граница: Журнал не разбирает блоб Клиндария');
const bridge = strip(read('shared/planner.js'));
ok('мост ничего не пишет', !/\.(put|add|update|remove|delete|clear|setItem|removeItem)\(/.test(bridge));
ok('мост без прежнего ключа и зеркала', !/service-year-planner|cw-state-mirror/.test(bridge));
ok('мост без опроса (setInterval/setTimeout)', !/setInterval|setTimeout/.test(bridge));
ok('мост читает только state/circuit-planner', /CWDB\.state/.test(bridge) && /store\.get\(MODULE\)/.test(bridge));
const journalCode = ['journal/js/data.js', 'journal/js/app/core.js', 'journal/js/app/districts.js', 'journal/js/app/visits.js',
  'journal/js/app/tasks.js', 'journal/js/app/projects.js', 'journal/js/app/search-archive.js', 'journal/js/app/protection.js',
  'journal/js/app.js', 'journal/js/route.js'].map((f) => strip(read(f))).join('\n');
ok('Журнал не читает CWDB.state / payload / прежний ключ', !/CWDB\.state|\.state\.get\(|\.payload\b|service-year-planner|cw-state-mirror|CWState/.test(journalCode));
const htmlCode = read('journal/index.html').replace(/<!--[\s\S]*?-->/g, '');
ok('Журнал не подключает shared/state.js', !/shared\/state\.js/.test(htmlCode) && !/shared\/state\.js/.test(strip(read('journal/sw.js'))));
ok('planner.js подключён и в прекэше Журнала', /<script src="\.\.\/shared\/planner\.js"><\/script>/.test(read('journal/index.html')) && read('journal/sw.js').includes("'../shared/planner.js'"));
const at = (src) => htmlCode.indexOf('<script src="' + src + '"');
ok('planner.js — после db.js/directory.js, до data.js', at('../shared/db.js') < at('../shared/planner.js') && at('../shared/directory.js') < at('../shared/planner.js') && at('../shared/planner.js') < at('js/data.js') && at('../shared/db.js') >= 0);

/* ═══ 2. Кандидаты ═════════════════════════════════════════════════════ */
console.log('\n2. Кандидаты: ранг, без автосвязи');
const circuit = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const north = await J.nodes.add({ kind: 'congregation', parentId: circuit, label: 'Северное', communityId: 'evt_north' });
const lake = await J.nodes.add({ kind: 'congregation', parentId: circuit, label: 'Приозёрное' });
const grp = await J.nodes.add({ kind: 'group', parentId: lake, label: 'Озёрная' });
const v = await J.visits.add({ nodeId: north, dateFrom: '2028-03-12', dateTo: '2028-03-17' });
const linksBefore = (await CWDB.journalLinks.getAll()).length;
const c1 = B.candidates({ communityId: 'evt_north', dateFrom: '2028-03-12', dateTo: '2028-03-17', visitType: 'congregation' });
ok('первый — то же собрание + даты', c1[0].entry.id === 'entry_north1' && c1[0].identity && c1[0].overlap && c1[0].typeMatch);
ok('то же собрание в другие даты — ниже, но есть', c1.findIndex((c) => c.entry.id === 'entry_north0') > 0 && c1.find((c) => c.entry.id === 'entry_north0').identity);
ok('близкие даты (±14) другого собрания — кандидат', c1.some((c) => c.entry.id === 'entry_grp' && c.near && !c.identity));
ok('далёкие даты без собрания — не кандидат', !c1.some((c) => c.entry.id === 'entry_far'));
ok('обычная (не визит) запись — не кандидат', !c1.some((c) => c.entry.id === 'entry_plain'));
ok('ранг: собрание > даты > тип', c1.map((c) => c.score).every((s, i, a) => i === 0 || a[i - 1] >= s));
const cg = B.candidates({ dateFrom: '2028-03-20', dateTo: '2028-03-22', visitType: 'group' });
ok('группа без идентичности: по датам и типу', cg[0].entry.id === 'entry_grp' && cg[0].overlap && cg[0].typeMatch && !cg[0].identity);
const cType = B.candidates({ dateFrom: '2028-03-14', dateTo: '2028-03-19', visitType: 'group' });
ok('при равных датах тип поднимает запись', cType[0].entry.visitType === 'group' || cType[0].score > cType[1].score);
ok('чужое название не даёт совпадения (без нечёткого поиска)', B.candidates({ communityId: 'Северное', dateFrom: '2030-01-01', dateTo: '2030-01-02' }).length === 0);
ok('нет кандидатов — пустой список', B.candidates({ communityId: 'x', dateFrom: '2031-01-01', dateTo: '2031-01-02' }).length === 0);
const call = B.candidates({ dateFrom: '2031-01-01', dateTo: '2031-01-02', all: true });
ok('«показать все» — все записи, включая обычные', call.length === 5 && call.some((c) => c.entry.id === 'entry_plain'));
ok('кандидаты не пишут связей', (await CWDB.journalLinks.getAll()).length === linksBefore);
const vis = read('journal/js/app/visits.js');
ok('экран: planner.set только по кнопке «Связать с записью»', (strip(vis).match(/CWJournal\.planner\.set\(/g) || []).length === 1
  && /function onLink\(\) \{ if \(ui\.selected\) run\(function \(\) \{ return CWJournal\.planner\.set\(/.test(vis));
ok('экран: кандидаты — только отображение (без автоматического выбора)', !/selected\s*=\s*cands\[/.test(vis));

/* ═══ 3. Связь: URN, одна на посещение, замена, снятие ═════════════════ */
console.log('\n3. Связь посещения с записью');
const vRef = J.urn.entry(v);
ok('URN канонический', PL.urn('entry_north1') === 'cw:circuit-planner/entry/entry_north1' && PL.entryId('cw:circuit-planner/entry/entry_north1') === 'entry_north1');
for (const bad of ['', 'a/b', 'a b', 'a|b', null, 5]) ok('кривой id → отказ: ' + JSON.stringify(bad), (await rejects(() => PL.set(v, bad))) === 'journal-planner-invalid-id');
ok('не посещение → отказ', (await rejects(() => PL.set(north, 'entry_north1'))) === 'journal-visit-not-found');
const project = await J.projects.add({ circuitId: circuit, title: 'Проект района' });
await J.projects.link(project, vRef);
const extId = await J.links.add({ from: vRef, to: 'cw:documents/doc/d_1', rel: 'external' });
const otherPlanner = await J.links.add({ from: vRef, to: 'cw:circuit-planner/visit/v_1', rel: 'external' });
const lid = await PL.set(v, 'entry_north1');
ok('id строки — постоянный слот посещения', lid === 'jl_planner|' + vRef && PL.slotId(v) === lid);
const plannerRows = async () => (await CWDB.journalLinks.getAll()).filter((l) => l.from === vRef && l.to.startsWith('cw:circuit-planner/entry/'));
let rows = await plannerRows();
ok('связь создана: одна строка, rel external', rows.length === 1 && rows[0].rel === 'external' && rows[0].to === 'cw:circuit-planner/entry/entry_north1');
ok('строка — ровно id/from/to/rel/createdAt', JSON.stringify(Object.keys(rows[0]).sort()) === JSON.stringify(['createdAt', 'from', 'id', 'rel', 'to']));
ok('в строке посещения нет plannerId/дат Клиндария', !/entry_north1|2028-03-13|plannerId/.test(JSON.stringify(await CWDB.journalEntries.get(v))));
ok('повтор той же записи — идемпотентно', (await PL.set(v, 'entry_north1')) === lid && (await plannerRows()).length === 1);
ok('get → текущая запись', (await PL.get(v)).entryId === 'entry_north1');
await PL.set(v, 'entry_grp');
rows = await plannerRows();
ok('перепривязка заменяет, не копит', rows.length === 1 && rows[0].to.endsWith('/entry_grp'));
ok('…тот же id слота, изменилась только цель', rows[0].id === lid);
const keepAll = await CWDB.journalLinks.getAll();
ok('прочие связи целы (проект, cw:documents, cw:circuit-planner/visit)', keepAll.some((l) => l.id === extId) && keepAll.some((l) => l.id === otherPlanner) && keepAll.some((l) => l.to === vRef && l.rel === 'relates'));
ok('общий links.add не обходит фасад', (await rejects(() => J.links.add({ from: vRef, to: 'cw:circuit-planner/entry/entry_far', rel: 'external' }))) === 'journal-planner-use-facade');
ok('…и обратное направление', (await rejects(() => J.links.add({ from: 'cw:circuit-planner/entry/entry_far', to: vRef, rel: 'relates' }))) === 'journal-planner-use-facade');
ok('общий links.remove не обходит фасад', (await rejects(() => J.links.remove(rows[0].id))) === 'journal-planner-use-facade');
/* Гонка: соседняя вкладка «успела» записать вторую связь в обход. */
await CWDB.journalLinks.add({ id: 'jl_external|' + vRef + '|cw:circuit-planner/entry/entry_north0', from: vRef, to: 'cw:circuit-planner/entry/entry_north0', rel: 'external', createdAt: new Date().toISOString() });
await PL.set(v, 'entry_north1');
ok('после set всегда ровно одна (лишние сняты)', (await plannerRows()).length === 1 && (await PL.get(v)).entryId === 'entry_north1');
ok('удаление посещения со связью — отказ', (await rejects(() => J.visits.remove(v))) === 'journal-visit-has-links');
await J.visits.complete(v);
ok('закрытое посещение: set — только чтение', (await rejects(() => PL.set(v, 'entry_grp'))) === 'journal-visit-readonly');
ok('закрытое посещение: clear — только чтение', (await rejects(() => PL.clear(v))) === 'journal-visit-readonly');
ok('…связь осталась', (await PL.get(v)).entryId === 'entry_north1');
await J.visits.reopen(v);
await J.visits.archive(v);
ok('архивное посещение: set — отказ', (await rejects(() => PL.set(v, 'entry_grp'))) === 'journal-visit-readonly');
await J.visits.unarchive(v);
ok('clear снимает только связь с записью Клиндария', (await PL.clear(v)) === 1 && (await PL.get(v)) === null
  && (await CWDB.journalLinks.getAll()).some((l) => l.id === extId) && (await CWDB.journalLinks.getAll()).some((l) => l.id === otherPlanner));
ok('clear без связи — 0', (await PL.clear(v)) === 0);
const vEmpty = await J.visits.add({ nodeId: grp, dateFrom: '2028-03-20', dateTo: '2028-03-22' });
await PL.set(vEmpty, 'entry_grp');
await PL.clear(vEmpty);
ok('посещение без связей удаляется как прежде', (await rejects(() => J.visits.remove(vEmpty))) === null);
/* Предусловие пакета: посещение закрыли «между» чтением и пакетом. */
const origBatch = CWDB.batch;
CWDB.batch = async (ops) => { await CWDB.journalEntries.update(v, { status: 'completed' }); return origBatch(ops); };
ok('гонка с закрытием посещения → journal-planner-changed', (await rejects(() => PL.set(v, 'entry_north1'))) === 'journal-planner-changed');
CWDB.batch = origBatch;
ok('…ничего не записано', (await PL.get(v)) === null);
await CWDB.journalEntries.update(v, { status: 'open' });
await PL.set(v, 'entry_north1');

/* ═══ 3b. Гонки: инвариант «одна строка» держит ключ ═══════════════════ */
console.log('\n3b. Гонки set/set и set/clear');
const rawPlanner = async (vid) => (await CWDB.journalLinks.getAll()).filter((l) => l.from === J.urn.entry(vid) && l.to.startsWith('cw:circuit-planner/entry/'));
const vRace = await J.visits.add({ nodeId: north, dateFrom: '2028-05-01', dateTo: '2028-05-03' });
const TARGETS = ['entry_north1', 'entry_grp', 'entry_far', 'entry_north0'];
let setSetOk = true, setSetInfo = '';
for (let i = 0; i < 25; i++) {
  const a = TARGETS[i % 4], b = TARGETS[(i + 1) % 4];
  const res = await Promise.allSettled([PL.set(vRace, a), PL.set(vRace, b)]);
  const r = await rawPlanner(vRace);
  const g = await PL.get(vRace);
  const good = res.every((x) => x.status === 'fulfilled') && r.length === 1 && r[0].id === PL.slotId(vRace)
    && [a, b].includes(PL.entryId(r[0].to)) && g && g.entryId === PL.entryId(r[0].to) && g.linkId === r[0].id;
  if (!good) { setSetOk = false; setSetInfo = i + ': ' + JSON.stringify(r.map((x) => x.id + '→' + x.to)) + ' ' + JSON.stringify(res.map((x) => x.status)); break; }
}
ok('set ∥ set (разные записи) ×25: ровно одна строка-слот, get согласен', setSetOk, setSetInfo);
await Promise.all([PL.set(vRace, 'entry_grp'), PL.set(vRace, 'entry_grp'), PL.set(vRace, 'entry_grp')]);
ok('set ∥ set (та же запись): одна строка', (await rawPlanner(vRace)).length === 1 && (await PL.get(vRace)).entryId === 'entry_grp');
let setClearOk = true, setClearInfo = '';
for (let i = 0; i < 25; i++) {
  if (i % 2) await PL.set(vRace, 'entry_north1'); else await PL.clear(vRace);
  const res = await Promise.allSettled(i % 3 ? [PL.set(vRace, TARGETS[i % 4]), PL.clear(vRace)] : [PL.clear(vRace), PL.set(vRace, TARGETS[i % 4])]);
  const r = await rawPlanner(vRace);
  const g = await PL.get(vRace);
  const errs = res.filter((x) => x.status === 'rejected').map((x) => x.reason && x.reason.message);
  const good = r.length <= 1 && (r.length === 0 ? g === null : (r[0].id === PL.slotId(vRace) && g.entryId === PL.entryId(r[0].to)))
    && errs.every((m) => m === 'journal-planner-changed');
  if (!good) { setClearOk = false; setClearInfo = i + ': ' + JSON.stringify(r) + ' ' + JSON.stringify(errs); break; }
}
ok('set ∥ clear ×25: 0 или 1 строка-слот, без дублей и порчи', setClearOk, setClearInfo);
/* Кривое прежнее состояние: строки вне слота сходятся к одному слоту. */
await CWDB.journalLinks.add({ id: 'jl_external|' + J.urn.entry(vRace) + '|cw:circuit-planner/entry/entry_far', from: J.urn.entry(vRace), to: 'cw:circuit-planner/entry/entry_far', rel: 'external', createdAt: '2020-01-01T00:00:00.000Z' });
await CWDB.journalLinks.add({ id: 'jl_external|' + J.urn.entry(vRace) + '|cw:circuit-planner/entry/entry_grp', from: J.urn.entry(vRace), to: 'cw:circuit-planner/entry/entry_grp', rel: 'external', createdAt: '2020-01-01T00:00:00.000Z' });
await PL.set(vRace, 'entry_north0');
let rr = await rawPlanner(vRace);
ok('set: строки вне слота сняты, остался слот', rr.length === 1 && rr[0].id === PL.slotId(vRace) && rr[0].to.endsWith('/entry_north0'));
await CWDB.journalLinks.add({ id: 'jl_stray', from: J.urn.entry(vRace), to: 'cw:circuit-planner/entry/entry_far', rel: 'external', createdAt: '2020-01-01T00:00:00.000Z' });
await PL.clear(vRace);
ok('clear: снимает слот и строки вне слота', (await rawPlanner(vRace)).length === 0);
ok('обычные связи J7 — прежний тройной id', extId === 'jl_external|' + vRef + '|cw:documents/doc/d_1');
ok('слот не зависит от цели (не тройной id)', !/cw:circuit-planner/.test(PL.slotId(vRace)));
await J.visits.remove(vRace);

/* ═══ 4. Разрешение: живые данные, «не найдена», возврат ═══════════════ */
console.log('\n4. Разрешение связи');
const resolve = async () => { const l = await PL.get(v); return l ? B.getEntry(l.entryId) : undefined; };
ok('связанная запись разрешается', (await resolve()).start === '2028-03-13');
const moved = ENTRIES.map((e) => (e.id === 'entry_north1' ? { ...e, start: '2028-04-02', end: '2028-04-07' } : e));
await writePlanner(moved);
ok('даты в Клиндарии сменились → новые даты', (await resolve()).start === '2028-04-02' && (await resolve()).end === '2028-04-07');
const renamed = moved.map((e) => (e.id === 'entry_north1' ? { ...e, title: 'Северное (новое)', eventId: 'evt_grp' } : e));
await writePlanner(renamed);
ok('заголовок/событие сменились → новые', (await resolve()).title === 'Северное (новое)' && (await resolve()).communityId === 'evt_grp');
const linkBeforeDelete = JSON.stringify(await plannerRows());
await writePlanner(renamed.filter((e) => e.id !== 'entry_north1'));
ok('запись удалена → не разрешается', (await resolve()) === null && B.status() === 'ok');
ok('…связь НЕ удалена', JSON.stringify(await plannerRows()) === linkBeforeDelete);
await writePlanner(ENTRIES);
ok('запись с тем же id вернулась → снова разрешается', (await resolve()).start === '2028-03-13');

/* ═══ 5. Соседняя вкладка: маячок, без опроса ══════════════════════════ */
console.log('\n5. Живые изменения');
let notified = 0;
const off = B.subscribe(() => { notified++; });
await writePlanner(moved, undefined, { signal: false });
ok('без маячка мост не перечитывает (нет опроса)', B.getEntry('entry_north1').start === '2028-03-13' && notified === 0);
localStorage.setItem(REV, 'x1'); fire('storage', { key: REV, newValue: 'x1' }); await tick();
ok('маячок cw-state-rev → перечитано, подписчик уведомлён', B.getEntry('entry_north1').start === '2028-04-02' && notified === 1);
fire('storage', { key: 'cw-state-rev:congress-project', newValue: 'y' }); await tick();
ok('чужой маячок игнорируется', notified === 1);
fire('storage', { key: REV, newValue: 'x2' }); await tick();
ok('без изменений данных — без лишних уведомлений', notified === 1);
await writePlanner(ENTRIES, undefined, { signal: false });
fire('pageshow', { persisted: true }); await tick();
ok('возврат из bfcache → перечитано', B.getEntry('entry_north1').start === '2028-03-13' && notified === 2);
off();
await writePlanner(moved);
ok('отписка работает', notified === 2);
ok('без setInterval', timers.interval === 0);
await writePlanner(ENTRIES);
ok('экран подписан на мост и перерисовывает чип', /CWPlanner\.subscribe\(onPlannerChanged\)/.test(vis) && /function onPlannerChanged\(\)[\s\S]{0,300}renderPlannerChip/.test(vis));
ok('экран: «не найдена» без удаления связи', /j\.planner\.missing/.test(vis) && !/planner\.clear\([^)]*\)[\s\S]{0,40}missing/.test(vis));

/* ═══ 5b. Справочник в этой же вкладке ════════════════════════════════ */
console.log('\n5b. CWDirectory: название обновляется без записи Клиндария');
await CWDirectory.upsert({ id: 'evt_north', name: 'Северное (справочник)' }, 'circuit-planner');
await tick();
ok('имя из справочника', B.getEntry('entry_north1').name === 'Северное (справочник)');
const payloadBefore = (await CWDB.state.get(MOD)).payload;
const revBefore = (await CWDB.state.get(MOD)).rev;
let dirNotified = 0;
const offDir = B.subscribe(() => { dirNotified++; });
await CWDirectory.upsert({ id: 'evt_north', name: 'Северное (переименовано)' }, 'circuit-planner');
await tick();
ok('правка справочника → подписчик моста уведомлён', dirNotified === 1);
ok('getEntry().name — новое имя', B.getEntry('entry_north1').name === 'Северное (переименовано)');
ok('канон Клиндария мост не переписал', (await CWDB.state.get(MOD)).payload === payloadBefore && (await CWDB.state.get(MOD)).rev === revBefore);
offDir();
ok('мост подписан на CWDirectory.onChange', /CWDirectory[\s\S]{0,80}onChange\(function \(\) \{ read\(\); \}\)/.test(read('shared/planner.js')));

/* ═══ 6. Глубокая ссылка Клиндария ═════════════════════════════════════ */
console.log('\n6. Глубокая ссылка #calendar?entry=<id>');
ok('urlForEntry', B.urlForEntry('entry_north1') === '../circuit-planner/index.html#calendar?entry=entry_north1');
ok('urlForEntry: кривой id → без хвоста', B.urlForEntry('a"><img') === '../circuit-planner/index.html#calendar');
const app = read('circuit-planner/app.js');
const from = app.indexOf('      entryIdFromHash(hash) {');
const to = app.indexOf('      /* Единая точка открытия редактора собрания');
ok('методы глубокой ссылки на месте', from > 0 && to > from);
const App = {
  state: { app: { entries: ENTRIES }, selectedScreen: 'dashboard', calendarView: 'year', calendarEventFilter: 'evt_x', calendarYear: 2020, calendarMonth: 0, calendarSelectedDateIso: '2020-01-01', calendarDetailId: null },
  utils: {
    parseLocalDate: (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; },
    iso: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  },
};
const actions = eval('({' + app.slice(from, to) + '})');
const snapshot = () => JSON.stringify(App.state);
const pristine = snapshot();
for (const h of ['', '#calendar', '#dashboard?entry=entry_north1', '#calendar?entry=', '#calendar?entry=a%20b', '#calendar?entry=<svg>', '#calendar?entry=%E0%A4%A', '#calendar?x=entry_north1', '#calendar?entry=entry_gone']) {
  ok('не фокусирует: ' + JSON.stringify(h), actions.focusEntryFromHash(h) === false && snapshot() === pristine);
}
ok('разбор id', actions.entryIdFromHash('#calendar?entry=entry_north1') === 'entry_north1' && actions.entryIdFromHash('#calendar?foo=1&entry=entry_grp') === 'entry_grp');
ok('валидная запись → календарь, месяц, дата, карточка', actions.focusEntryFromHash('#calendar?entry=entry_north1') === true
  && App.state.selectedScreen === 'calendar' && App.state.calendarView === 'month' && App.state.calendarYear === 2028 && App.state.calendarMonth === 2
  && App.state.calendarSelectedDateIso === null && App.state.calendarDetailId === 'entry:entry_north1' && App.state.calendarEventFilter === 'all');
ok('сохранённые настройки не трогаются', !/settings/.test(app.slice(from, to)));
ok('id не попадает в селектор/разметку', !/querySelector|innerHTML|getElementById/.test(app.slice(from, to)));
const init = app.slice(app.indexOf('    init() {'), app.indexOf('    init() {') + 6000);
ok('экран по-прежнему из хэша до «?» (ярлыки PWA)', /const hashScreen = \(window\.location\.hash \|\| ''\)\.replace\('#', ''\)\.split\('\?'\)\[0\];/.test(init));
ok('фокус — после calendarView из настроек', init.indexOf("this.state.calendarView = this.state.app.settings.calendarView") < init.indexOf('focusEntryFromHash'));
ok('PIN не обходится: showPinGateIfNeeded зовётся всегда', /this\.ui\.showPinGateIfNeeded\(\);/.test(init) && !/deepLinkedEntry[^\n]*showPinGateIfNeeded/.test(init));
const manifest = JSON.parse(read('circuit-planner/manifest.webmanifest'));
ok('ярлыки PWA без изменений формы (#screen)', (manifest.shortcuts || []).every((s) => /#[a-z-]+$/.test(s.url) && actions.entryIdFromHash(s.url.slice(s.url.indexOf('#'))) === null));

/* ═══ 7. Копии ═════════════════════════════════════════════════════════ */
console.log('\n7. Резервные копии');
const snapJ = await CWBackup.snapshot(['journal']);
const jText = JSON.stringify(snapJ);
ok('копия Журнала: связь как URN', jText.includes('cw:circuit-planner/entry/entry_north1'));
ok('копия Журнала: без данных Клиндария', !/2028-03-18|evt_north|ПРИВАТНОЕ|ЗАМЕТКА/.test(JSON.stringify(snapJ.sections.shared.idb['circuit-workspace-db'].stores.journalLinks)) && !/ПРИВАТНОЕ|ЗАМЕТКА/.test(jText));
await writePlanner(ENTRIES.filter((e) => e.id !== 'entry_north1'));
const snapBroken = await CWBackup.snapshot(['journal']);
ok('внешняя «висячая» связь не делает копию негодной', CWBackup.inspect(snapBroken).ok === true);
await CWBackup.restore(snapBroken);
ok('восстановление только Журнала: связь на месте, не разрешается', (await PL.get(v)).entryId === 'entry_north1' && B.getEntry('entry_north1') === null);
await writePlanner(ENTRIES);
const snapPlanner = await CWBackup.snapshot(['circuit-planner']);
await writePlanner([]);
ok('Клиндарий опустел → связь «не найдена»', B.getEntry('entry_north1') === null && (await PL.get(v)) !== null);
await CWBackup.restore(snapPlanner);
localStorage.setItem(REV, 'restored'); fire('storage', { key: REV, newValue: 'restored' }); await tick();
ok('восстановление только Клиндария: та же связь снова разрешается', B.getEntry('entry_north1')?.start === '2028-03-13' && (await PL.get(v)).entryId === 'entry_north1');
const full = await CWBackup.snapshot();
ok('полная копия проходит проверку', CWBackup.inspect(full).ok === true);
await PL.clear(v);
await writePlanner([]);
await CWBackup.restore(full);
await B.refresh();
ok('полное восстановление: связь и запись вернулись', (await PL.get(v))?.entryId === 'entry_north1' && B.getEntry('entry_north1')?.start === '2028-03-13');

/* ═══ 8. J8: открытый текст защищённых записей никуда не уходит ════════ */
console.log('\n8. J8');
const CANARY = 'CANARY-J9A-' + Math.random().toString(16).slice(2) + '-Ѫ';
const rec = await J.visitRecords.add(v, { type: 'note', body: 'заметка ' + CANARY });
await J.protection.setup('correct horse battery', rec);
ok('запись защищена', !!(await CWDB.journalEntries.get(rec)).sec);
await J.protection.unlock('correct horse battery');
ok('разблокировано: текст читается', (await J.visitRecords.get(rec)).body.includes(CANARY));
await PL.set(v, 'entry_grp');
await B.refresh();
const lsDump = JSON.stringify([...mem.entries()]);
const bridgeDump = JSON.stringify(B.listEntries()) + JSON.stringify(B.candidates({ all: true }));
const linksDump = JSON.stringify(await CWDB.journalLinks.getAll());
const stateDump = JSON.stringify(await CWDB.state.getAll());
const snapDump = JSON.stringify(await CWBackup.snapshot()) + JSON.stringify(await CWDB.snapshots.getAll());
ok('канарейки нет в CWPlanner', !bridgeDump.includes(CANARY));
ok('канарейки нет в journalLinks / URN', !linksDump.includes(CANARY));
ok('канарейки нет в localStorage', !lsDump.includes(CANARY));
ok('канарейки нет в state (Клиндарий)', !stateDump.includes(CANARY));
ok('канарейки нет в копиях и снимках', !snapDump.includes(CANARY));
J.protection.lock();

console.log(failed ? `\n✗ check-journal-planner: ${failed} провал(ов)` : '\n✓ check-journal-planner: всё прошло');
process.exit(failed ? 1 : 0);
