#!/usr/bin/env node
/**
 * Контракт A4: Конгрессы отправляют ОДИН конгресс в Архив.
 * Ловит: конверт, не проходящий CWArchive.put; потерю заданий/участников/писем;
 * отпечаток, который устаревает ни с чего или не замечает правку; потерю
 * подключения (скрипты, прекэш, элементы, 5 языков); запись/удаление данных.
 *   npm i fake-indexeddb && node scripts/check-archive-congress.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failed = 0;
const ok = (l, c, x) => { if (c) { console.log('  ✓ ' + l); return; } failed++; console.log('  ✗ ' + l + (x === undefined ? '' : '\n      ' + x)); };

const ctx = vm.createContext({ indexedDB: new IDBFactory(), IDBKeyRange, console, setTimeout, clearTimeout });
ctx.self = ctx; ctx.window = ctx;
['shared/serviceyear.js', 'shared/db.js', 'shared/archive.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
/* ES-модуль без импортов: снимаем export и исполняем как скрипт. */
const logicSrc = read('congress-project/js/archive-logic.js').replace(/^export /gm, '');
vm.runInContext(logicSrc + '\nthis.L={MODULE,ENTITY,idOf,hasDate,isPast,taskDocKey,fingerprint,buildEnvelope,removeCongress,restoreCongress};', ctx);
const L = ctx.L;
ok('archive-logic загружен', !!L && typeof L.buildEnvelope === 'function');

const tr = (k, v) => k + (v ? ':' + JSON.stringify(v) : '');
const isSection = (x) => !!x.section;
const mk = (extra) => Object.assign({ year: 2026, seriesName: 'Серия А', tr, fmtDate: (s) => s, version: '4.0.0', docKeys: [], isSection }, extra || {});
const cong = () => ({
  id: 'c1', name: 'SZ Warszawa', place: 'Варшава', date: '2026-11-07', theme: 'Тема', notes: 'заметка', seriesId: 's1',
  tasks: [
    { id: 't0', time: '9:30', title: 'РАНОК', type: 'Раздел', section: true, participants: [] },
    { id: 't1', time: '10:00', number: '1', title: 'Промова', type: 'Промова', status: 'Назначено', participants: [{ name: 'Іван', congregation: 'Центр' }, { name: '', congregation: '' }], notes: 'н' },
    { id: 't2', time: '10:20', title: 'Музика', type: 'Музика', status: 'Не назначено', participants: [] },
  ],
});

console.log('\nКонверт конгресса');
{
  const c = cong();
  const env = L.buildEnvelope(c, mk({ docKeys: ['congress-project:task:t1'] }));
  ok('id/sourceId/serviceYear/title', env.module === 'congress-project' && env.entity === 'congress' && env.sourceId === 'c1' && env.serviceYear === 2026 && env.title === 'SZ Warszawa');
  ok('payload несёт конгресс целиком и имя серии', env.payload.congress.tasks.length === 3 && env.payload.seriesName === 'Серия А');
  ok('payload — копия, не ссылка', env.payload.congress !== c && env.payload.congress.tasks[1] !== c.tasks[1]);
  ok('summary: задания без разделов, участники с именем, письма', env.summary.tasks === 2 && env.summary.participants === 1 && env.summary.letters === 1, JSON.stringify(env.summary));
  ok('display: два раздела; строка информации', env.display.sections.length === 2 && env.display.sections[0].rows[0].tags[0] === 'Серия А');
  const r = env.display.sections[1].rows;
  ok('строка задания: номер, участник с собранием, статус и тип в тегах', r[1].title === '1. Промова' && r[1].note.includes('Іван (Центр)') && r[1].tags.join() === 'Промова,Назначено', JSON.stringify(r[1]));
  ok('раздел без тегов типа', r[0].tags.length === 0);
  ok('оригинал не изменён', JSON.stringify(c) === JSON.stringify(cong()));
  ok('docRefs — ключи писем заданий', env.docRefs.join() === 'congress-project:task:t1' && L.taskDocKey({ id: 't1' }) === 'congress-project:task:t1');
}

console.log('\nОтпечаток');
{
  const fp = (c, docs, s) => L.buildEnvelope(c, mk({ docKeys: docs || [], seriesName: s === undefined ? 'Серия А' : s })).payload.fingerprint;
  const base = fp(cong());
  ok('тот же конгресс — тот же отпечаток', fp(cong()) === base);
  const a = cong(); a.tasks[1].participants[0].name = 'Пётр';
  ok('правка участника меняет отпечаток', fp(a) !== base);
  const b = cong(); b.date = '2026-11-08';
  ok('правка даты меняет отпечаток', fp(b) !== base);
  ok('новое письмо меняет отпечаток', fp(cong(), ['congress-project:task:t1']) !== base);
  ok('переименование серии меняет отпечаток', fp(cong(), [], 'Другая') !== base);
  const o = cong(); const r = {}; Object.keys(o).reverse().forEach((k) => { r[k] = o[k]; });
  ok('порядок ключей не важен', fp(r) === base);
}

console.log('\nДата и «прошёл ли»');
{
  ok('есть дата', L.hasDate({ date: '2026-11-07' }));
  ok('пусто / мусор — нет даты', !L.hasDate({ date: '' }) && !L.hasDate({}) && !L.hasDate({ date: '07.11.2026' }) && !L.hasDate(null));
  ok('вчерашний — прошёл', L.isPast({ date: '2026-10-04' }, '2026-10-05'));
  ok('сегодняшний — ещё не прошёл', !L.isPast({ date: '2026-10-05' }, '2026-10-05'));
  ok('будущий и без даты — нет', !L.isPast({ date: '2027-01-01' }, '2026-10-05') && !L.isPast({}, '2026-10-05'));
}

console.log('\nCWArchive.put поверх');
{
  const c = cong();
  const r1 = await ctx.CWArchive.put(L.buildEnvelope(c, mk()));
  ok('put принял конверт, ревизия 1', r1.revision === 1 && r1.id === L.idOf('c1'));
  const c2 = cong(); c2.notes = 'иначе';
  const r2 = await ctx.CWArchive.put(L.buildEnvelope(c2, mk()));
  ok('повтор — ревизия 2, firstArchivedAt сохранён', r2.revision === 2 && r2.firstArchivedAt === r1.firstArchivedAt);
  const got = await ctx.CWArchive.get(L.idOf('c1'));
  ok('устаревание видно по отпечатку', got.payload.fingerprint !== r1.payload.fingerprint);
  const list = await ctx.CWArchive.list({ module: 'congress-project', serviceYear: 2026 });
  ok('в списке, без payload', list.length === 1 && list[0].payload === undefined && list[0].summary.tasks === 2);
  let code = '';
  try { await ctx.CWArchive.put(Object.assign(L.buildEnvelope(c, mk()), { serviceYear: 'x' })); } catch (e) { code = e.code; }
  ok('неверная форма — invalid, не тишина', code === 'invalid', code);
}

console.log('\nПодключение');
{
  const html = read('congress-project/index.html'), sw = read('congress-project/service-worker.js'), dict = read('congress-project/i18n/dict.js');
  const ui = read('congress-project/js/archive-congress.js'), render = read('congress-project/js/render.js');
  const p = (s) => html.indexOf(s);
  ok('index.html: archive.js и serviceyear.js после db.js, до main.js', p('../shared/db.js') < p('../shared/archive.js') && p('../shared/archive.js') > 0 && p('../shared/serviceyear.js') > 0 && p('../shared/serviceyear.js') < p('js/main.js'));
  ['archiveBanner', 'archiveBannerText', 'archiveYesBtn', 'archiveLaterBtn', 'archiveOkBtn', 'archiveCongressBtn'].forEach((id) => ok('index.html: #' + id, html.includes('id="' + id + '"')));
  ['../shared/archive.js', '../shared/serviceyear.js', './js/archive-logic.js', './js/archive-congress.js'].forEach((f) => ok('service-worker.js: прекэш ' + f, sw.includes("'" + f + "'")));
  ok('render.js зовёт archiveRender', /archiveRender\(\)/.test(render) && render.includes('./archive-congress.js'));
  const keys = [...new Set([...ui.matchAll(/tk\("([a-z_]+)"/g)].map((m) => m[1]).concat([...read('congress-project/js/archive-logic.js').matchAll(/tr\("([a-z_]+)"/g)].map((m) => m[1])).concat([...html.matchAll(/data-i18n="cong\.arch\.([a-z_]+)"/g)].map((m) => m[1])))];
  ok('ключи arch.* найдены', keys.length >= 10, keys.join());
  const blocks = dict.split(/CWI18n\.register\(\{\s*/).slice(1);
  ok('пять языковых блоков', blocks.length === 5);
  const miss = [];
  blocks.forEach((b, i) => keys.forEach((k) => { if (!b.includes("'cong.arch." + k + "'")) miss.push(['ru', 'uk', 'en', 'pl', 'de'][i] + ':' + k); }));
  ok('все ключи на 5 языках', miss.length === 0, miss.join());
  ok('Архив подписывает tasks/participants на 5 языках', (read('archive/i18n/dict.js').match(/'arc\.summary\.(tasks|participants)'/g) || []).length === 10);
}

console.log('\nA5: убрать конгресс и вернуть его');
{
  const st = { congresses: [cong(), Object.assign(cong(), { id: 'c2', name: 'Другой' })], activeId: 'c1', series: [{ id: 's1', name: 'Серия А' }] };
  const env = L.buildEnvelope(st.congresses[0], mk());
  ok('убрать: конгресса нет, активным стал соседний', L.removeCongress(st, 'c1') && st.congresses.length === 1 && st.activeId === 'c2');
  ok('убрать несуществующий — false, ничего не тронуто', !L.removeCongress(st, 'нет') && st.congresses.length === 1);
  const c = L.restoreCongress(st, env.payload);
  ok('вернуть: конгресс первым, активный, серия сохранена', st.congresses[0].id === 'c1' && st.activeId === 'c1' && c.seriesId === 's1');
  ok('вернуть: копия, а не ссылка на payload', st.congresses[0] !== env.payload.congress);
  ok('после возврата отпечаток совпадает с архивным', L.buildEnvelope(st.congresses[0], mk()).payload.fingerprint === env.payload.fingerprint);
  let code = '';
  try { L.restoreCongress(st, env.payload); } catch (e) { code = e.code; }
  ok('такой конгресс уже есть — отказ conflict, без дубля', code === 'conflict' && st.congresses.length === 2, code);
  const lone = { congresses: [], activeId: null, series: [] };
  L.restoreCongress(lone, env.payload);
  ok('серии больше нет — конгресс встаёт без серии', lone.congresses[0].seriesId === null);
  code = '';
  try { L.restoreCongress(lone, { congress: { id: '' } }); } catch (e) { code = e.code; }
  ok('битый payload — invalid', code === 'invalid', code);
}

console.log('\nA5: порядок шагов (правила необратимого переноса)');
{
  const src = read('congress-project/js/archive-congress.js');
  const body = (name) => { const i = src.indexOf('async function ' + name); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); };
  const order = (txt, parts) => parts.every((p, i) => i === 0 || (txt.indexOf(parts[i - 1]) >= 0 && txt.indexOf(parts[i - 1]) < txt.indexOf(p)));
  ok('убрать: confirm → не только чтение → перечитать конверт → сверить отпечаток → копия → удалить → save',
    order(body('removeFlow'), ['confirm(', 'isDegradedUI()', 'CWArchive.get(', 'fingerprint !==', 'backupFirst(', 'removeCongress(', 'save()']));
  ok('вернуть: конверт → конфликт → confirm → не только чтение → копия → вернуть → save',
    order(body('restoreFlow'), ['CWArchive.get(', '.some((x) => x.id', 'confirm(', 'isDegradedUI()', 'backupFirst(', 'restoreCongress(', 'save()']));
  ok('без копии — отказ', /if \(!id\) throw codeError\("backup"\)/.test(src));
  ok('хэш намерения снимается сразу', /history\.replaceState/.test(src));
  const code = (src + read('congress-project/js/archive-logic.js')).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('письма и конверты не удаляются', !/CWArchive\.remove|CWDocs\.remove|CWDocs\.save/.test(code));
  const html = read('congress-project/index.html'), dict = read('congress-project/i18n/dict.js');
  ok('index.html: #archiveRemoveCongressBtn', html.includes('id="archiveRemoveCongressBtn"'));
  ok('подписи автокопий на 5 языках', (dict.match(/'cong\.backup\.before_archive_(remove|restore)'/g) || []).length === 10);
  const arc = read('archive/js/app.js');
  ok('Архив ведёт в модуль-источник, а не восстанавливает сам', /#archive-restore=/.test(arc) && !/CWState|App\.state|store\.st/.test(arc));
}

console.log(failed ? '\nПровалено: ' + failed : '\nВсё в порядке.');
process.exit(failed ? 1 : 0);
