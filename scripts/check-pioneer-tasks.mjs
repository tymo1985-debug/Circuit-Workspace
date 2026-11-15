#!/usr/bin/env node
/**
 * Школа пионеров — 18 заданий (Ф6, 15.11.2026).
 *
 * ЗАЧЕМ. Отказы Ф6 тихие:
 *  1. Библиотека общая (GLOBAL_META): записанная в школе-префикс, она пропала
 *     бы у следующей школы, и Алекс вводил бы 18 текстов заново.
 *  2. День и преподаватель: ручная правка → план школы → таблица уроков.
 *     Перепутанный порядок молча печатает на бланке не тот день.
 *  3. «Распределить автоматически» трогает только пустые места; ручные
 *     решения остаются. Правило задания соблюдается, нагрузка ровная.
 *  4. План новой школы — копия шаблона без дат; правка плана одной школы не
 *     меняет другую.
 *  5. Этап «Задания» в обзоре закрывается, когда все места во всех классах
 *     заполнены.
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
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['js/db.js', 'js/modules/history.js', 'js/modules/students.js', 'js/modules/schools.js',
    'js/modules/textbooks.js', 'js/modules/classes.js', 'js/modules/tasks.js', 'js/modules/overview.js']) {
    vm.runInContext(readFileSync(join(PS, f), 'utf8'), ctx, { filename: f });
  }
  await ctx.DB.ready();
  const { Students, PSTasks, PSOverview, Schools, DB } = ctx;
  await Students.getColumns();
  const seed = JSON.parse(readFileSync(join(PS, 'data/seed-lessons.json'), 'utf8'));

  console.log('1. Библиотека');
  let lib = await PSTasks.library();
  ok('18 пустых заданий', lib.length === 18 && lib[0].no === 1 && lib[17].no === 18 && lib[4].participants === 2);
  ok('лишнее и битое отбрасывается', PSTasks.normalizeLibrary([{ no: 3, participants: 9, rule: 'x', lesson: 40 }, { no: 25 }]).every((t) => t.no <= 18)
    && PSTasks.normalizeLibrary([{ no: 3, participants: 9, rule: 'x', lesson: 40 }])[2].participants === 2
    && PSTasks.normalizeLibrary([{ no: 3, rule: 'x', lesson: 40 }])[2].lesson === null);
  await PSTasks.saveTask({ no: 1, lesson: 8, participants: 2, rule: 'sameOrRelated', texts: { ru: { title: 'Первое', situation: 'С', description: 'О' } } });
  await PSTasks.saveTask({ no: 2, lesson: 3, participants: 3, rule: 'sisters', texts: { de: { title: 'Zwei' } } });
  lib = await PSTasks.library();
  const t1 = PSTasks.text(lib[0], 'cs');
  ok('текст: нет языка школы → ru с пометкой', t1.title === 'Первое' && t1.lang === 'ru' && t1.fallback);
  const t2 = PSTasks.text(lib[1], 'ru');
  ok('текст: нет ни школы, ни ru → первый заполненный', t2.title === 'Zwei' && t2.lang === 'de');
  ok('текст: пустой — пустые строки', PSTasks.text(lib[5], 'ru').title === '' && PSTasks.text(lib[5], 'ru').lang === null);

  console.log('2. Таблица уроков и план');
  const defs = PSTasks.lessonDefaults(seed);
  ok('seed: урок 1 — день 1, А', defs[1].day === 1 && defs[1].teacher === 'A');
  ok('seed: урок 2 (а/б) — день 1, без преподавателя', defs[2].day === 1 && defs[2].teacher === null);
  ok('seed: урок 18 (А/Б) — день 6, без преподавателя', defs[18].day === 6 && defs[18].teacher === null);
  ok('seed: урок 3 неизвестен', defs[3].day === null && defs[3].teacher === null);
  await PSTasks.setLesson(3, { day: 2, teacher: 'Б' });
  const lessons = await PSTasks.lessonTable(seed);
  ok('правка таблицы поверх seed', lessons[3].day === 2 && lessons[3].teacher === 'Б' && lessons[1].teacher === 'A');
  ok('parseLessons', JSON.stringify(PSTasks.parseLessons('3, 4;19 x 4 5')) === '[3,4,5]');
  const plan = PSTasks.blankPlan();
  plan.days[3].date = '2027-03-04'; plan.days[3]['Б'] = [8];
  const idx = PSTasks.planIndex(plan);
  ok('план: урок 8 — день 4, Б, дата', idx[8].day === 4 && idx[8].teacher === 'Б' && idx[8].date === '2027-03-04');

  console.log('3. Откуда день и преподаватель');
  const empty = { people: [], teacher: null, day: null };
  let r = PSTasks.resolve(lib[0], empty, {}, lessons);
  ok('без плана — из урока (8: день 3, А)', r.day === 3 && r.teacher === 'A' && r.daySrc === 'lesson');
  r = PSTasks.resolve(lib[0], empty, idx, lessons);
  ok('план важнее урока', r.day === 4 && r.teacher === 'Б' && r.daySrc === 'plan' && r.date === '2027-03-04');
  r = PSTasks.resolve(lib[0], { people: [], teacher: 'A', day: 5 }, idx, lessons);
  ok('ручная правка важнее плана', r.day === 5 && r.teacher === 'A' && r.daySrc === 'manual' && r.date === '');
  r = PSTasks.resolve(lib[3], empty, idx, lessons);
  ok('задание без урока — пусто', r.day === null && r.teacher === null);

  console.log('4. Правила');
  const P = (id, gender, rel = []) => ({ id, gender, relations: rel.map((x) => ({ type: 'spouse', studentId: x })), values: { lastName: id } });
  const ann = P('ann', 'sister', ['petr']), petr = P('petr', 'brother', ['ann']), olga = P('olga', 'sister'), ivan = P('ivan', 'brother');
  ok('супруги разного пола — можно', PSTasks.ruleOk('sameOrRelated', [ann, petr]));
  ok('чужие разного пола — нельзя', !PSTasks.ruleOk('sameOrRelated', [olga, ivan]));
  ok('супруги + сестра — нельзя (сестра и брат чужие)', !PSTasks.ruleOk('sameOrRelated', [ann, petr, olga]));
  ok('только сёстры', PSTasks.ruleOk('sisters', [ann, olga]) && !PSTasks.ruleOk('sisters', [ann, petr]));
  ok('любые', PSTasks.ruleOk('any', [olga, ivan]));
  const probs = PSTasks.problems({ participants: 2, rule: 'sameOrRelated' }, { people: ['olga', 'ivan'] }, new Map([[olga.id, olga], [ivan.id, ivan]]));
  ok('замечание «нарушает правило»', probs.includes('rule') && !probs.includes('count'));
  ok('замечания «не в классе» и «не хватает»', JSON.stringify(PSTasks.problems({ participants: 3, rule: 'any' }, { people: ['x', 'olga'] }, new Map([[olga.id, olga]]))) === '["gone","count"]');

  console.log('5. Распределить автоматически');
  const members = [];
  ['a', 'b', 'c', 'd', 'e'].forEach((x) => members.push(P('br-' + x, 'brother')));
  ['a', 'b', 'c', 'd', 'e', 'f'].forEach((x) => members.push(P('si-' + x, 'sister')));
  members.push(ann, petr);
  const library = PSTasks.normalizeLibrary(Array.from({ length: 18 }, (_, i) => ({ no: i + 1, participants: 2 + (i % 3), rule: i === 1 ? 'sisters' : i === 2 ? 'brothers' : 'sameOrRelated' })));
  const manual = { 4: { people: ['olga-gone', 'br-a'], teacher: 'Б', day: 2 }, 7: { people: ['si-a'], teacher: null, day: null } };
  const { slots, filled } = PSTasks.propose(library, manual, members);
  const byId = new Map(members.map((s) => [s.id, s]));
  ok('ручное полное место не тронуто', JSON.stringify(slots[4].people) === '["olga-gone","br-a"]' && slots[4].teacher === 'Б' && slots[4].day === 2);
  ok('частично заполненное дозаполнено, главный прежний', slots[7].people[0] === 'si-a' && slots[7].people.length === library[6].participants);
  const full = library.every((t) => slots[t.no].people.length === t.participants);
  ok('все места заполнены', full, JSON.stringify(library.filter((t) => slots[t.no].people.length !== t.participants).map((t) => t.no)));
  ok('правила соблюдены (кроме ручного места)', library.filter((t) => t.no !== 4).every((t) => PSTasks.ruleOk(t.rule, slots[t.no].people.map((id) => byId.get(id)))));
  ok('без повторов внутри задания', library.every((t) => new Set(slots[t.no].people).size === slots[t.no].people.length));
  const load = new Map(members.map((s) => [s.id, 0]));
  library.forEach((t) => slots[t.no].people.forEach((id) => load.has(id) && load.set(id, load.get(id) + 1)));
  const loads = [...load.values()];
  ok('нагрузка ровная (разница ≤ 2)', Math.max(...loads) - Math.min(...loads) <= 2, JSON.stringify(Object.fromEntries(load)));
  ok('счётчик добавленных мест', filled === library.reduce((n, t) => n + t.participants, 0) - 2 - 1);
  const again = PSTasks.propose(library, slots, members);
  ok('повторный запуск ничего не меняет', again.filled === 0 && JSON.stringify(again.slots) === JSON.stringify(slots));

  console.log('6. Хранение по школам, план и шаблон');
  const s1 = DB.currentSchool().id;
  let all = PSTasks.setSlot({}, 'cls1', 1, { people: ['ann', 'petr'], teacher: null, day: null });
  await PSTasks.saveAssignments(all);
  const p1 = await PSTasks.plan();
  p1.days[0].date = '2027-03-01'; p1.days[0].A = [1, 2];
  await PSTasks.savePlan(p1);
  await PSTasks.saveTemplate(p1);
  await Schools.complete(s1);
  const sc2 = await Schools.create({ language: 'de' });
  ok('Школа 2 выбрана', DB.currentSchool().id === sc2.id);
  ok('библиотека видна в Школе 2', (await PSTasks.library())[0].texts.ru.title === 'Первое');
  ok('таблица уроков видна в Школе 2', (await PSTasks.lessonTable(seed))[3].teacher === 'Б');
  ok('распределение Школы 1 не видно', Object.keys(await PSTasks.assignments()).length === 0);
  const p2 = await PSTasks.plan();
  ok('план Школы 2 — из шаблона, без дат', JSON.stringify(p2.days[0].A) === '[1,2]' && p2.days[0].date === '');
  p2.days[0].A = [5];
  await PSTasks.savePlan(p2);
  ok('план Школы 1 не задет', JSON.stringify((await DB.inSchool(s1).getMeta('schoolPlan')).days[0].A) === '[1,2]');

  console.log('7. Обзор');
  const classes = [{ id: 'c1' }, { id: 'c2' }];
  const libFull = PSTasks.normalizeLibrary([]);
  let allFull = {};
  classes.forEach((c) => libFull.forEach((t) => { allFull = PSTasks.setSlot(allFull, c.id, t.no, { people: ['x', 'y'] }); }));
  const prog = PSTasks.progress(libFull, allFull, classes);
  ok('прогресс 36 из 36', prog.done === 36 && prog.total === 36);
  const stage = (tp) => PSOverview.stages({ students: [], classes, taskProgress: tp }).stages.find((s) => s.key === 'tasks');
  ok('этап «Задания» закрыт при полном заполнении', stage(prog).state === 'done');
  ok('этап «Задания» открыт при неполном', stage({ done: 3, total: 36 }).state !== 'done' && stage({ done: 3, total: 36 }).state !== 'later');
  ok('без классов — не закрыт', stage({ done: 0, total: 0 }).state !== 'done');

  console.log(fails ? `\n✗ ${fails} проверок не прошло` : '\n✓ Ф6: задания — всё на месте');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
