#!/usr/bin/env node
/**
 * Школа пионеров — 18 заданий (Ф6, 15.11.2026).
 *
 * ЗАЧЕМ. Отказы Ф6 тихие:
 *  1. Библиотека общая (GLOBAL_META): записанная в школе-префикс, она пропала
 *     бы у следующей школы, и Алекс вводил бы 18 текстов заново.
 *  2. Ф6a (20.11.2026): день и время — из расписания по практическому
 *     занятию задания; преподаватель — ручная правка → буква части урока.
 *     Перепутанный слот молча печатает на бланке не тот день.
 *  3. «Распределить автоматически» трогает только пустые места; ручные
 *     решения остаются. Правило задания соблюдается, нагрузка ровная.
 *  4. Старые ключи плана и таблицы уроков в базе не стираются.
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
    'js/modules/textbooks.js', 'js/modules/classes.js', 'js/modules/tasks.js', 'js/modules/schedule.js', 'js/modules/overview.js']) {
    vm.runInContext(readFileSync(join(PS, f), 'utf8'), ctx, { filename: f });
  }
  await ctx.DB.ready();
  const { Students, PSTasks, PSSchedule, PSOverview, Schools, DB } = ctx;
  await Students.getColumns();

  console.log('1. Библиотека');
  let lib = await PSTasks.library();
  ok('18 пустых заданий', lib.length === 18 && lib[0].no === 1 && lib[17].no === 18 && lib[4].participants === 2);
  ok('лишнее и битое отбрасывается', PSTasks.normalizeLibrary([{ no: 3, participants: 9, rule: 'x', lesson: 40 }, { no: 25 }]).every((t) => t.no <= 18)
    && PSTasks.normalizeLibrary([{ no: 3, participants: 9, rule: 'x', lesson: 40 }])[2].participants === 2
    && PSTasks.normalizeLibrary([{ no: 3, rule: 'x', lesson: 40 }])[2].lesson === null);
  ok('практическое занятие 1–4, иначе null', PSTasks.normalizeLibrary([{ no: 1, practical: 3 }, { no: 2, practical: 7 }])[0].practical === 3
    && PSTasks.normalizeLibrary([{ no: 2, practical: 7 }])[1].practical === null && lib[0].practical === null);
  await PSTasks.saveTask({ no: 1, lesson: 8, practical: 1, participants: 2, rule: 'sameOrRelated', texts: { ru: { title: 'Первое', situation: 'С', description: 'О' } } });
  await PSTasks.saveTask({ no: 2, lesson: 3, participants: 3, rule: 'sisters', texts: { de: { title: 'Zwei' } } });
  lib = await PSTasks.library();
  const t1 = PSTasks.text(lib[0], 'cs');
  ok('текст: нет языка школы → ru с пометкой', t1.title === 'Первое' && t1.lang === 'ru' && t1.fallback);
  const t2 = PSTasks.text(lib[1], 'ru');
  ok('текст: нет ни школы, ни ru → первый заполненный', t2.title === 'Zwei' && t2.lang === 'de');
  ok('текст: пустой — пустые строки', PSTasks.text(lib[5], 'ru').title === '' && PSTasks.text(lib[5], 'ru').lang === null);

  console.log('2–3. Когда и у кого (Ф6a)');
  const days = PSSchedule.build('2027-02-01', {}, 'ru');
  const empty = { people: [], teacher: null, day: null };
  let r = PSTasks.resolve(lib[0], empty, days);
  ok('практ. 1 → вт 02.02, 13:00–14:25, преп. Б (урок 5б)', r.practical === 1 && r.day === 2 && r.date === '2027-02-02'
    && r.start === '13:00' && r.end === '14:25' && r.teacher === 'Б' && r.teacherSrc === 'schedule', JSON.stringify(r));
  r = PSTasks.resolve({ ...lib[0], practical: 2 }, empty, days);
  ok('практ. 2 → ср, 14:40, преп. А (урок 9а)', r.day === 3 && r.start === '14:40' && r.teacher === 'A');
  r = PSTasks.resolve(lib[0], { people: [], teacher: 'A', day: 5 }, days);
  ok('ручной преподаватель важнее; старый day не влияет', r.teacher === 'A' && r.teacherSrc === 'manual' && r.day === 2);
  r = PSTasks.resolve(lib[0], empty, PSSchedule.build('2027-02-01', { '5b': { start: '13:30', end: '14:40' } }, 'ru'));
  ok('своё время слота школы', r.start === '13:30' && r.end === '14:40' && r.changed);
  r = PSTasks.resolve(lib[3], empty, days);
  ok('задание без практ. занятия — пусто (заглушка)', r.practical === null && r.day === null && r.teacher === null);

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

  console.log('6. Хранение по школам');
  const s1 = DB.currentSchool().id;
  let all = PSTasks.setSlot({}, 'cls1', 1, { people: ['ann', 'petr'], teacher: null, day: null });
  await PSTasks.saveAssignments(all);
  await DB.setMeta('schoolPlan', { days: [{ date: '2027-03-01', A: [1, 2], Б: [] }] });
  await DB.setMeta('lessonTable', { 3: { day: 2, teacher: 'Б' } });
  await Schools.complete(s1);
  const sc2 = await Schools.create({ language: 'de' });
  ok('Школа 2 выбрана', DB.currentSchool().id === sc2.id);
  ok('библиотека видна в Школе 2', (await PSTasks.library())[0].texts.ru.title === 'Первое' && (await PSTasks.library())[0].practical === 1);
  ok('распределение Школы 1 не видно', Object.keys(await PSTasks.assignments()).length === 0);
  ok('старые plan/lessonTable не стёрты', (await DB.inSchool(s1).getMeta('schoolPlan')).days[0].A[1] === 2 && (await DB.getMeta('lessonTable'))[3].teacher === 'Б');

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
