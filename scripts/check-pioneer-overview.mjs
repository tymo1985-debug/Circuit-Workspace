#!/usr/bin/env node
/**
 * Школа пионеров — обзор: этапы, общий список, журнал пионера (Ф4, 15.11.2026).
 *
 * ЗАЧЕМ. Отказы Ф4 тихие:
 *  1. Журнал пишется при сохранении: запись мимо Students (DB.put) или
 *     затёртое поле `history` — карточка молча теряет историю. Смена статуса
 *     рассылкой и формуляром в журнал НЕ идёт (восстанавливается из их
 *     данных) — иначе одна строка появится дважды.
 *  2. Этап считается по данным: «текущий» — первый незакрытый; «Задания»
 *     (с Ф6) закрываются, когда заполнены все места во всех классах.
 *  3. Фильтры списка: «ждём ответа», «без класса», «не указано» — особые
 *     значения; ошибка в одном из них прячет пионера из списка.
 *  4. Экран не пишет в базу мимо Students: автораспределение — через setClass.
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PS = join(ROOT, 'pioneer-school');
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond ? '' : ' — ' + (extra || ''))); if (!cond) fails++; };

(async () => {
  const ctx = {
    indexedDB: new IDBFactory(), IDBKeyRange, console, Intl, Date, Math, JSON, Promise, Error, setTimeout,
    T: (k, v) => k + (v ? JSON.stringify(v) : ''),
    D: (k) => k,
    PSDocLang: { get: () => 'ru' },
    CWI18n: { lang: 'ru' },
    DateUtils: { todayIso: () => '2027-02-01' },
    CWDirectory: { ready: true, get: () => null },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['js/db.js', 'js/modules/history.js', 'js/modules/students.js', 'js/modules/schools.js',
    'js/modules/textbooks.js', 'js/modules/registrationSchema.js', 'js/modules/registration.js',
    'js/modules/dispatch.js', 'js/modules/overview.js']) {
    vm.runInContext(readFileSync(join(PS, f), 'utf8'), ctx, { filename: f });
  }
  await ctx.DB.ready();
  const { Students, Dispatch, Registration, PioneerHistory, PSOverview } = ctx;
  await Students.getColumns();
  const add = (id, last, { values = {}, ...extra } = {}, opts) => Students.save({ id, classId: null, values: { lastName: last, firstName: 'И', ...values }, origin: 'branchList', status: 'invited', textbookLanguages: ['ru'], ...extra }, opts);
  const get = async (id) => (await Students.list()).find((s) => s.id === id);

  console.log('1. Журнал пионера');
  await add('a', 'Альфа', { congregationId: 'c1', gender: 'sister', values: { lodging: 'yes', transport: 'no' } }, { source: 'import' });
  await add('b', 'Бета', { congregationId: 'c1', gender: 'brother', textbookLanguages: ['ru', 'de'], values: { transport: 'yes', specialNeeds: 'слух' } });
  await add('c', 'Гамма', { values: { congregation: 'Брно' }, origin: 'otherCircuit' });
  let a = await get('a');
  ok('новая запись → created с источником', a.history.length === 1 && a.history[0].type === 'created' && a.history[0].source === 'import' && a.history[0].origin === 'branchList', JSON.stringify(a.history));

  const cfg = { deadline: '2027-01-15' };
  let groups = Dispatch.groups(await Students.list(), await Dispatch.getState(), cfg);
  await Dispatch.markSent(groups.find((g) => g.key === 'c1'), '2026-11-20');
  a = await get('a');
  ok('рассылка меняет статус, но в журнал не пишет', a.status === 'letterSent' && a.history.length === 1, JSON.stringify(a.history));

  await Students.saveCard('a', { status: 'wontCome', statusReason: 'работа' });
  a = await get('a');
  const st = a.history[a.history.length - 1];
  ok('ручная смена статуса → status from/to/reason', st.type === 'status' && st.from === 'letterSent' && st.to === 'wontCome' && st.reason === 'работа', JSON.stringify(st));

  await ctx.DB.put('classes', { id: 'k1', name: 'Класс 1' });
  await Students.setClass('b', 'k1', 'auto');
  let b = await get('b');
  const cl = b.history[b.history.length - 1];
  ok('setClass → class с источником auto', cl.type === 'class' && cl.to === 'k1' && cl.source === 'auto' && b.classId === 'k1', JSON.stringify(b.history));
  const full = await ctx.DB.get('students', 'b');
  full.values.phone = '123';
  await Students.save(full);
  b = await get('b');
  ok('сохранение без смен не добавляет событий и не теряет журнал', b.history.length === 2, String(b.history.length));
  await Students.saveCard('b', { gender: 'brother' });
  ok('saveCard без смен статуса/класса — журнал тот же', (await get('b')).history.length === 2);

  const reg = { id: 'r1', lastName: 'Бета', firstName: 'И', attending: 'yes', submittedAt: '2026-11-28T10:00:00.000Z' };
  await ctx.DB.put('registrations', reg);
  await Registration.applyToStudent(reg, 'b');
  b = await get('b');
  ok('формуляр меняет статус, но в журнал не пишет', b.status === 'willCome' && b.history.length === 2, JSON.stringify(b.history));

  const state = await Dispatch.getState();
  const regs = await Registration.list();
  const classes = await ctx.DB.list('classes');
  const tl = PioneerHistory.timeline(b, { classes, dispatchState: state, groupKey: 'c1', groupName: 'Прага', deadline: '2027-01-15', registrations: regs });
  const kinds = tl.map((i) => i.kind).join();
  ok('лента: журнал + рассылка + формуляр', kinds.split(',').sort().join() === 'class_auto,created_manual,form,package', kinds);
  ok('лента: по дате', tl.every((it, i) => !i || String(tl[i - 1].at).slice(0, 10) <= String(it.at).slice(0, 10)), tl.map((i) => i.at).join());
  ok('строки рассылки и формуляра восстановлены (derived)', tl.filter((i) => i.derived).map((i) => i.kind).sort().join() === 'form,package');
  ok('форма: ответ «придёт»', tl.find((i) => i.kind === 'form').params.answer === 'willCome');
  const c = await get('c');
  const old = { ...c, history: [] };
  const tlOld = PioneerHistory.timeline(old, {});
  ok('старая запись без журнала → «в списке» без даты', tlOld.length === 1 && tlOld[0].kind === 'created_unknown' && tlOld[0].at === '');

  const path = PioneerHistory.path(b, { classes, dispatchState: state, groupKey: 'c1', registrations: regs });
  ok('путь: 4 шага пройдено, текущий — присутствие', path.map((p) => p.state).join() === 'done,done,done,done,current', path.map((p) => p.state).join());
  ok('путь: дата отправки и ответа', path[1].at === '2026-11-20' && path[2].at.startsWith('2026-11-28'), JSON.stringify(path));
  const pathA = PioneerHistory.path(await get('a'), { classes, dispatchState: state, groupKey: 'c1' });
  ok('отказ: класс и присутствие пропущены', pathA[3].state === 'skip' && pathA[4].state === 'skip', pathA.map((p) => p.state).join());

  const hist = PioneerHistory.stamp(null, { status: 'invited', origin: 'branchList', history: Array.from({ length: 250 }, () => ({ type: 'status' })) }, 'manual');
  ok('журнал ограничен LIMIT', hist.history.length === PioneerHistory.LIMIT);

  console.log('2. Этапы школы');
  const students = await Students.list();
  groups = Dispatch.groups(students, state, cfg);
  const base = { anketa: { proposedLocations: [] }, substitutes: [], assignment: {}, students: [], groups: [], classes: [], order: null, school: { completed: false } };
  let r = PSOverview.stages(base);
  ok('пустая школа: текущий — подготовка', r.current === 'prep' && r.stages.length === 8);
  r = PSOverview.stages({ ...base, anketa: { proposedLocations: [{}] }, substitutes: [{}], assignment: { startDate: '2027-03-02', location: 'Прага' }, students, groups, orphans: Dispatch.orphans(students), classes });
  ok('пакет не всем собраниям — текущий «рассылка»', r.current === 'dispatch', r.current);
  ok('данные рассылки: 1 из 2, без собрания 0', r.stages[3].data.sent === 1 && r.stages[3].data.total === 2 && r.stages[3].data.orphans === 0, JSON.stringify(r.stages[3].data));
  ok('ответы: 2 из 3, ждём 1', r.stages[4].data.responded === 2 && r.stages[4].data.waiting === 1 && r.stages[4].data.coming === 1, JSON.stringify(r.stages[4].data));
  const allAnswered = students.map((s) => (s.id === 'c' ? { ...s, status: 'willCome' } : s));
  const sentAll = groups.map((g) => ({ ...g, sent: true }));
  r = PSOverview.stages({ ...base, anketa: { proposedLocations: [{}] }, substitutes: [{}], assignment: { startDate: '2027-03-02', location: 'Прага' }, students: allAnswered, groups: sentAll, classes });
  ok('все ответили, «c» без класса — текущий «классы»', r.current === 'classes' && r.stages[5].data.unclassed === 1, r.current);
  const classed = allAnswered.map((s) => ({ ...s, classId: s.status === 'wontCome' ? null : 'k1' }));
  r = PSOverview.stages({ ...base, anketa: { proposedLocations: [{}] }, substitutes: [{}], assignment: { startDate: '2027-03-02', location: 'Прага' }, students: classed, groups: sentAll, classes });
  ok('Ф6: задания не заполнены — текущий «задания»', r.stages[6].state === 'current' && r.current === 'tasks', r.current);
  const tasksDone = { done: 18, total: 18 };
  r = PSOverview.stages({ ...base, anketa: { proposedLocations: [{}] }, substitutes: [{}], assignment: { startDate: '2027-03-02', location: 'Прага' }, students: classed, groups: sentAll, classes, taskProgress: tasksDone });
  ok('задания заполнены — текущий «итог»', r.stages[6].state === 'done' && r.current === 'report', r.current);
  r = PSOverview.stages({ ...base, anketa: { proposedLocations: [{}] }, substitutes: [{}], assignment: { startDate: '2027-03-02', location: 'Прага' }, students: classed, groups: sentAll, classes, taskProgress: tasksDone, school: { completed: true } });
  ok('завершённая школа — текущего нет', r.current === null && r.stages[7].state === 'done');
  ok('у каждого этапа есть раздел для кнопки', PSOverview.STAGES.every((k) => PSOverview.STAGE_ROUTE[k]));

  console.log('3. Общий список');
  const s2 = await Students.list();
  const ids = (f) => PSOverview.filter(s2, f).map((s) => s.id).sort().join();
  ok('без фильтров — все', ids({}) === 'a,b,c');
  ok('ждём ответа', ids({ status: '_waiting' }) === 'c', ids({ status: '_waiting' }));
  ok('без класса', ids({ classId: '_none' }) === 'a,c');
  ok('класс', ids({ classId: 'k1' }) === 'b');
  ok('пол не указан', ids({ gender: '_none' }) === 'c');
  ok('язык', ids({ language: 'de' }) === 'b');
  ok('собрание по названию', ids({ congregation: 'Брно' }) === 'c');
  ok('жильё / авто', ids({ lodging: 'yes' }) === 'a' && ids({ transport: 'yes' }) === 'b');
  ok('происхождение', ids({ origin: 'otherCircuit' }) === 'c');
  ok('формат: пустой = обычный', ids({ format: 'standard' }) === 'a,b,c');
  ok('фильтры складываются', ids({ classId: '_none', gender: 'sister' }) === 'a');
  const stats = PSOverview.stats(s2);
  ok('счётчики', stats.coming === 1 && stats.refused === 1 && stats.waiting === 1 && stats.lodging === 0 && stats.special === 1, JSON.stringify(stats));
  ok('варианты языков из данных', PSOverview.options(s2).language.join() === 'de,ru');

  console.log('4. Запись — только через Students');
  const app = readFileSync(join(PS, 'js/app.js'), 'utf8');
  ok("app.js не пишет пионеров через DB.put('students')", !/DB\.put\(\s*'students'/.test(app));
  const sw = readFileSync(join(PS, 'sw.js'), 'utf8');
  const html = readFileSync(join(PS, 'index.html'), 'utf8');
  ok('history.js и overview.js в кэше и на странице', ['history', 'overview'].every((m) => sw.includes(`'./js/modules/${m}.js'`) && html.includes(`js/modules/${m}.js`)));

  console.log(fails ? `\nПровалено: ${fails}` : '\nВсе проверки пройдены.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
