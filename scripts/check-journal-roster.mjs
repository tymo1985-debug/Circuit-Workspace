/**
 * Журнал — «Состав района» (R1).
 *
 * Проверяет:
 *  - маршрут #roster[/groups|/pregroups] и нормализацию неверного хвоста;
 *  - CWJournal.roster.read(): собрания, группы, предгруппы по узлам Журнала,
 *    архивный контекст (свой статус, архивный предок, архивный район) в состав
 *    не входит, родитель группы — собрание, одна функция read, ничего не
 *    пишется;
 *  - экран: вкладки со счётчиками, строки и ссылки, фильтр (регистр, номер из
 *    справочника), «ничего не найдено», пустая вкладка; запрос не попадает в
 *    хэш и localStorage; пункт меню в боковой навигации (нижняя остаётся из пяти);
 *  - код экрана: без CWDB, localStorage, календаря, таймеров;
 *  - ключи на пяти языках, файл в прекэше SW.
 *
 *   node scripts/check-journal-roster.mjs   (jsdom + fake-indexeddb)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

const { JSDOM } = await import('jsdom');
const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');

const html = read('journal/index.html');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { url: 'http://localhost/journal/index.html#overview', pretendToBeVisual: true, runScripts: 'outside-only' });
const W = dom.window;
W.indexedDB = new IDBFactory();
W.IDBKeyRange = IDBKeyRange;
Object.defineProperty(W, 'crypto', { value: globalThis.crypto, configurable: true });
W.structuredClone = globalThis.structuredClone;
W.BroadcastChannel = undefined;
let intervals = 0;
const realSetInterval = W.setInterval;
W.setInterval = (...a) => { intervals++; return realSetInterval(...a); };
W.alert = () => {}; W.confirm = () => true;
if (!W.HTMLDialogElement.prototype.showModal) { W.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; W.HTMLDialogElement.prototype.close = function () { this.open = false; }; }
const errors = [];
W.console.error = (...a) => { errors.push(a.map(String).join(' ')); };

const srcs = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
  .filter((src) => !/theme\.js|update\.js|nav\.js/.test(src));
const evalSrc = (src) => W.eval(read(src.startsWith('../') ? src.slice(3) : 'journal/' + src) + '\n//# sourceURL=' + src);
const split = srcs.indexOf('js/app/core.js');
srcs.slice(0, split).forEach(evalSrc);

const doc = W.document;
const $ = (sel) => doc.querySelector(sel);
const $$ = (sel) => [...doc.querySelectorAll(sel)];
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 6; i++) await wait(30); };
const WJ = W.CWJournal, R = W.CWJournalRoute;
await W.CWDB.init();

/* ═══ 1. Маршрут ═══════════════════════════════════════════════════════ */
console.log('1. Маршрут');
ok('roster — маршрут', R.ROUTES.includes('roster'));
ok('#roster → собрания, без нормализации', R.parse('#roster').route === 'roster' && R.parse('#roster').rosterTab === 'congregations' && !R.parse('#roster').normalized);
ok('#roster/groups, #roster/pregroups', R.parse('#roster/groups').rosterTab === 'groups' && R.parse('#roster/pregroups').rosterTab === 'pregroups');
ok('неизвестная вкладка и лишний хвост → нормализация к «Составу»', R.parse('#roster/nope').normalized && R.parse('#roster/groups/x').normalized && R.parse('#roster/congregations').normalized);
ok('build.roster', R.build.roster() === '#roster' && R.build.roster('groups') === '#roster/groups' && R.build.roster('pregroups') === '#roster/pregroups' && R.build.roster('x') === '#roster');
ok('прежние маршруты не тронуты', R.parse('#tasks').route === 'tasks' && R.parse('#districts/c1').circuitId === 'c1' && R.parse('#nope').route === 'overview');

/* ═══ 2. CWJournal.roster.read ═════════════════════════════════════════ */
console.log('\n2. Данные состава');
const cA = await WJ.nodes.add({ kind: 'circuit', parentId: WJ.ROOT_PARENT, label: 'Район Живой' });
const cX = await WJ.nodes.add({ kind: 'circuit', parentId: WJ.ROOT_PARENT, label: 'Район Архивный' });
const n1 = await WJ.nodes.add({ kind: 'congregation', parentId: cA, label: 'Собрание Липовое' });
const n2 = await WJ.nodes.add({ kind: 'congregation', parentId: cA, label: 'Собрание Берёзовое' });
const nArch = await WJ.nodes.add({ kind: 'congregation', parentId: cA, label: 'Собрание Архивное' });
const nInX = await WJ.nodes.add({ kind: 'congregation', parentId: cX, label: 'Собрание В архивном районе' });
const g1 = await WJ.nodes.add({ kind: 'group', parentId: n1, label: 'Группа Ручей' });
const g2 = await WJ.nodes.add({ kind: 'group', parentId: n2, label: 'Группа Озеро' });
const gArch = await WJ.nodes.add({ kind: 'group', parentId: nArch, label: 'Группа Под архивным' });
const p1 = await WJ.nodes.add({ kind: 'pregroup', parentId: n1, label: 'Предгруппа Холм' });
await WJ.nodes.archive(nArch);
await WJ.nodes.archive(cX);

const before = (await WJ.nodes.getAll()).length;
const data = await WJ.roster.read();
const names = (list) => list.map((x) => x.node.label).sort();
ok('собрания: активные, без архивных и без чужого архивного района', JSON.stringify(names(data.congregations)) === JSON.stringify(['Собрание Берёзовое', 'Собрание Липовое']), names(data.congregations).join());
ok('группы: без группы под архивным собранием', JSON.stringify(names(data.groups)) === JSON.stringify(['Группа Озеро', 'Группа Ручей']), names(data.groups).join());
ok('предгруппы', names(data.pregroups).join() === 'Предгруппа Холм');
ok('районы: архивный не входит', data.circuits.length === 1 && data.circuits[0].id === cA);
ok('родитель группы — её собрание', data.groups.every((x) => x.parent && x.parent.kind === 'congregation' && x.parent.id === x.node.parentId));
ok('у собрания родителя в записи нет, район известен', data.congregations.every((x) => x.parent === null && x.circuitId === cA));
ok('одна функция read', JSON.stringify(Object.keys(WJ.roster)) === '["read"]');
await WJ.roster.read();
ok('чтение ничего не записало', (await WJ.nodes.getAll()).length === before);
const dataSrc = strip(read('journal/js/data.js'));
const rosterSrc = dataSrc.slice(dataSrc.indexOf('var roster = {'), dataSrc.indexOf('var TASK_ID'));
ok('roster: только чтение, без таймеров и хранилищ браузера', rosterSrc.length > 100 && !/\.(put|add|update|mutate|remove|batch|setItem)\(|localStorage|sessionStorage|setInterval|setTimeout|CWPlanner/.test(rosterSrc));

/* ═══ 3. Экран ═════════════════════════════════════════════════════════ */
console.log('\n3. Экран «Состав»');
await wait(20);
srcs.slice(split).forEach(evalSrc);
doc.dispatchEvent(new W.Event('DOMContentLoaded'));
await settle();
const A = W.CWJournalApp;
const lsBefore = JSON.stringify(Object.keys(W.localStorage).sort());
const titles = () => $$('#rosterList .j-row__title').map((x) => x.textContent);
const counts = () => ['congregations', 'groups', 'pregroups'].map((k) => $('#rosterCount_' + k).textContent).join();

ok('на старте открыт Обзор, «Состав» скрыт', !$('#route-overview').hidden && $('#route-roster').hidden);
W.location.hash = '#roster'; await settle();
ok('#roster → экран виден, остальные скрыты', !$('#route-roster').hidden && $('#route-overview').hidden && $('#route-districts').hidden);
ok('счётчики вкладок по Журналу', counts() === '2,2,1', counts());
ok('вкладка «Собрания»: две строки', titles().length === 2 && titles().includes('Собрание Липовое') && titles().includes('Собрание Берёзовое'), titles().join());
ok('активная вкладка отмечена', $('[data-roster-tab="congregations"]').classList.contains('active') && $('[data-roster-tab="groups"]').getAttribute('aria-pressed') === 'false');
const row1 = $$('#rosterList a.j-row').find((a) => a.textContent.includes('Липовое'));
ok('собрание → экран собрания', row1 && row1.getAttribute('href') === R.build.congregation(cA, n1), row1 && row1.getAttribute('href'));
ok('пункт меню активен на «Составе»', $('.md-sidenav [data-route="roster"]').classList.contains('active'));

$('[data-roster-tab="groups"]').click(); await settle();
ok('клик по вкладке → #roster/groups', W.location.hash === '#roster/groups');
ok('вкладка «Группы»: две строки с родителем', titles().length === 2 && $$('#rosterList .j-row__meta').every((m) => m.textContent.startsWith(A.t('j.roster.parent').replace('%s', ''))), $$('#rosterList .j-row__meta').map((m) => m.textContent).join('|'));
const grow = $$('#rosterList a.j-row').find((a) => a.textContent.includes('Ручей'));
ok('группа → собрание-родитель', grow && grow.getAttribute('href') === R.build.congregation(cA, n1));
W.location.hash = '#roster/pregroups'; await settle();
ok('вкладка «Предгруппы»', titles().join() === 'Предгруппа Холм');

// Фильтр
W.location.hash = '#roster'; await settle();
const input = $('#rosterInput');
const hashBefore = W.location.hash;
input.value = 'ЛИПОВ'; input.dispatchEvent(new W.Event('input', { bubbles: true }));
ok('фильтр: регистр не важен', titles().join() === 'Собрание Липовое', titles().join());
ok('фильтр: кнопка очистки появилась, статус «1 / 2»', $('#rosterClear').hidden === false && $('#rosterStatus').textContent === '1 / 2');
ok('запрос не попал в хэш и localStorage', W.location.hash === hashBefore && JSON.stringify(Object.keys(W.localStorage).sort()) === lsBefore);
input.value = 'нет такого'; input.dispatchEvent(new W.Event('input', { bubbles: true }));
ok('ничего не найдено — подсказка', titles().length === 0 && $('#rosterList').textContent.includes(A.t('j.roster.no_match')));
$('#rosterClear').click();
ok('очистка → снова полный список', titles().length === 2 && input.value === '' && $('#rosterClear').hidden === true);

// Номер собрания — из справочника
const rec = await W.CWDirectory.create({ name: 'Липовое (справочник)', congNumber: '12345' }, 'journal');
await WJ.nodes.update(n1, { communityId: rec.id });
W.location.hash = '#overview'; await settle();
W.location.hash = '#roster'; await settle();
ok('название — из справочника, номер в подписи', titles().includes('Липовое (справочник)') && $('#rosterList').textContent.includes('12345'), titles().join());
input.value = '12345'; input.dispatchEvent(new W.Event('input', { bubbles: true }));
ok('фильтр по номеру', titles().join() === 'Липовое (справочник)', titles().join());
$('#rosterClear').click();

// Свежесть и пустая вкладка
await WJ.nodes.archive(p1); await settle();
ok('архивация предгруппы → счётчик обновился', $('#rosterCount_pregroups').textContent === '0', counts());
W.location.hash = '#roster/pregroups'; await settle();
ok('пустая вкладка — подсказка, не пустота', titles().length === 0 && $('#rosterList').textContent.includes(A.t('j.roster.empty_pregroups')));

// Нормализация и FAB
W.location.hash = '#roster/groups/x'; await settle();
ok('кривой хвост → #roster', W.location.hash === '#roster');
ok('FAB на «Составе» скрыт', $('#fab').hidden === true);

/* ═══ 4. Код, ключи, оболочка ══════════════════════════════════════════ */
console.log('\n4. Код, ключи, оболочка');
const rs = strip(read('journal/js/app/roster.js'));
ok('экран: без CWDB, хранилищ браузера, календаря и таймеров', !/CWDB|localStorage|sessionStorage|CWPlanner|setInterval|setTimeout|indexedDB/.test(rs));
ok('экран читает только CWJournal.roster', /CWJournal\.roster\.read\(\)/.test(rs) && !/CWJournal\.(nodes|entries|visits)\./.test(rs));
const dict = read('journal/i18n/dict.js');
const keys = ['j.nav.roster', 'j.roster.title', 'j.roster.lede', 'j.roster.search', 'j.roster.search_label', 'j.roster.number', 'j.roster.parent', 'j.roster.no_parent', 'j.roster.unavailable', 'j.roster.no_match', 'j.roster.empty_congregations', 'j.roster.empty_groups', 'j.roster.empty_pregroups'];
ok('ключи «Состава» на пяти языках', keys.every((k) => (dict.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 5), keys.filter((k) => (dict.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length !== 5).join());
const used = [...new Set([...(rs.matchAll(/t\('(j\.[a-z_.]+)'\)/g)).map((m) => m[1]), ...(html.matchAll(/data-i18n(?:-[a-z-]+)?="(j\.roster\.[a-z_]+|j\.nav\.roster)"/g)).map((m) => m[1])])];
ok('все используемые ключи заведены', used.every((k) => dict.includes("'" + k + "'")), used.filter((k) => !dict.includes("'" + k + "'")).join());
ok('пункт меню: боковая навигация; нижняя — пять пунктов (потолок MD3)', /class="md-sidenav__item" data-route="roster" href="#roster"/.test(html) && $$('.md-bottomnav__item').length === 5 && !$('.md-bottomnav [data-route="roster"]'));
ok('плашки Обзора ведут в «Состав» (путь для телефона)', /'#roster\/groups'/.test(strip(read('journal/js/app/overview.js'))));
ok('roster.js в прекэше SW', read('journal/sw.js').includes("'./js/app/roster.js'"));
ok('опроса нет', intervals === 0);
/* R3: импорт из Клиндария — только чтение календаря, только добавление узлов. */
const imp = strip(read('journal/js/app/import.js'));
ok('R3: импорт читает календарь только через CWPlanner.listCommunities, без CWDB и хранилищ браузера', /CWPlanner/.test(imp) && /listCommunities\(\)/.test(imp) && !/CWDB|localStorage|sessionStorage|indexedDB|setInterval/.test(imp));
ok('R3: импорт ничего не удаляет и не правит карточки справочника', !/CWDirectory\.(upsert|create|remove|detach)/.test(imp) && !/nodes\.update\(/.test(imp));
ok('R3: связь узла идёт через claimAndLink, дубли отсекаются по communityId', /claimAndLink\(node, row\.c\.communityId\)/.test(imp) && /have\[row\.c\.communityId\]|have\[r\.c\.communityId\]/.test(imp));
const impKeys = [...new Set([...imp.matchAll(/'(j\.import\.[a-z_]+)'/g)].map((m) => m[1]))];
ok('R3: ключи импорта на пяти языках', impKeys.length >= 15 && impKeys.every((k) => (dict.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 5), impKeys.filter((k) => (dict.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length !== 5).join());
ok('R3: import.js в прекэше SW, кнопка и окно в разметке', read('journal/sw.js').includes("'./js/app/import.js'") && /id="rosterImportBtn"/.test(html) && /id="importDialog"/.test(html));
/* R2: ключ связи группы/предгруппы со справочником. */
const dj = strip(read('journal/js/app/districts.js'));
const refsFn = (dj.match(/async function countJournalRefs[\s\S]*?\n  }\n/) || [''])[0];
ok('R2: countJournalRefs считает узлы всех видов', refsFn.includes('n.communityId === communityId') && !/n\.kind\s*===/.test(refsFn));
ok('R2: пункт «связать» только у группы и предгруппы, через ручной выбор карточки', /kind === 'group' \|\| kind === 'pregroup'[\s\S]{0,200}link-directory/.test(dj) && /data-action="link-directory"/.test(dj));
ok('R2: ключ directory_already_linked на пяти языках', (dict.match(/'j\.error\.directory_already_linked'/g) || []).length === 5);
errors.length = errors.filter((e) => !/не прочитан|не собран/.test(e)).length;
ok('ошибок консоли нет', errors.length === 0, errors.join(' | '));

console.log(failed ? '\n✗ Провалов: ' + failed : '\n✓ Состав района: всё на месте.');
process.exit(failed ? 1 : 0);
