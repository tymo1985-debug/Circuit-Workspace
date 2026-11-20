#!/usr/bin/env node
/**
 * Школа пионеров — расписание школы (Ф6a, 20.11.2026).
 *
 * ЗАЧЕМ. Отказы расписания тихие:
 *  1. Шаблон — перенос PSS-sched_U.docx; опечатка во времени или в слоте
 *     практического занятия молча печатает пионерам не тот час и не тот день.
 *     Проверяем 18 уроков, 4 практических (5б, 9а, 12а, 14б), 5 повторений,
 *     песни и то, что перерывы сходятся со временем соседних уроков.
 *  2. Своё время — только отличие от шаблона и только в своей школе; шаблон
 *     не меняется, завершённая школа не пишется.
 *  3. Даты дней — от даты начала без сдвига часовых поясов.
 *  4. «Сейчас» (варианты A + C): статус урока/перерыва/дня по местному
 *     времени; граница урока не даёт двух «текущих», своё время учитывается.
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
const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

(async () => {
  const ctx = {
    indexedDB: new IDBFactory(), IDBKeyRange, console, Intl, Date, Math, JSON, Promise, Error, setTimeout,
    T: (k, v) => k + (v ? JSON.stringify(v) : ''), D: (k) => k,
    PSDocLang: { get: () => 'ru' }, CWI18n: { lang: 'ru' }, DateUtils: { todayIso: () => '2027-02-01' },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['js/db.js', 'js/modules/history.js', 'js/modules/students.js', 'js/modules/schools.js', 'js/modules/schedule.js']) {
    vm.runInContext(readFileSync(join(PS, f), 'utf8'), ctx, { filename: f });
  }
  await ctx.DB.ready();
  const { PSSchedule: S, Schools, DB } = ctx;

  console.log('1. Шаблон = PSS-sched_U.docx');
  const tpl = S.TEMPLATE;
  const lessons = tpl.flatMap((d) => d.slots.filter((s) => s.id));
  ok('6 дней', tpl.length === 6);
  ok('уроки 1–18, каждый в одном дне', Array.from({ length: 18 }, (_, i) => i + 1).every((n) => S.dayOfLesson(n) === Math.min(6, Math.ceil(n / 3))));
  ok('у каждой части урока есть русское название', lessons.every((s) => S.TITLES.ru[s.id]));
  ok('практические: 5б вт, 9а ср, 12а чт, 14б пт', JSON.stringify(S.PRACTICALS.map((n) => { const p = S.practical(n); return [S.label(p.id), p.day, p.start]; }))
    === JSON.stringify([['5б', 2, '13:00'], ['9а', 3, '14:40'], ['12а', 4, '14:40'], ['14б', 5, '13:00']]));
  ok('повторения: дни 1–5, 16:00–16:35', JSON.stringify(lessons.filter((s) => s.review).map((s) => [s.review, s.start, s.end]))
    === JSON.stringify([1, 2, 3, 4, 5].map((n) => [n, '16:00', '16:35'])));
  ok('песни', tpl.map((d) => d.open + '/' + d.close).join(' ') === '81/73 67/58 70/57 77/60 68/79 76/84');
  ok('урок 18: А, Б, А', lessons.filter((s) => S.label(s.id) === '18').map((s) => S.teacherOf(s)).join('') === 'AБA');
  ok('преподаватель по букве: 5б → Б, 9а → А', S.teacherOf(S.practical(1)) === 'Б' && S.teacherOf(S.practical(2)) === 'A');
  const gaps = [];
  tpl.forEach((d, i) => {
    let prev = null; let pending = 0;
    d.slots.forEach((s) => {
      if (!s.id) { pending = s.minutes; return; }
      if (min(s.start) >= min(s.end)) gaps.push(`д${i + 1} ${s.id}: начало ≥ конца`);
      if (prev && min(s.start) - min(prev.end) !== pending) gaps.push(`д${i + 1} ${prev.id}→${s.id}: ${min(s.start) - min(prev.end)} ≠ ${pending}`);
      prev = s; pending = 0;
    });
  });
  ok('перерывы сходятся со временем уроков', !gaps.length, gaps.join('; '));

  console.log('2. Сборка, даты, названия');
  const days = S.build('2027-02-01', {}, 'de');
  ok('даты пн–сб', days.map((d) => d.date).join(',') === '2027-02-01,2027-02-02,2027-02-03,2027-02-04,2027-02-05,2027-02-06');
  ok('через смену месяца', S.addDays('2027-02-27', 3) === '2027-03-02' && S.weekday('2027-02-01') === 1 && S.weekday('2027-02-07') === 7);
  ok('без даты начала — дни без дат', S.build('', {}, 'ru').every((d) => d.date === ''));
  ok('нет названий языка — русские с пометкой', days[0].slots[0].title === S.TITLES.ru['1a'] && days[0].slots[0].fallback);
  ok('ru — без пометки', !S.build('', {}, 'ru')[0].slots[0].fallback);
  ok('dayOn', S.dayOn('2027-02-01', '2027-02-04') === 4 && S.dayOn('2027-02-01', '2027-02-08') === null);

  console.log('3. Своё время — отличие, по школам');
  ok('совпадающее со стандартом не хранится', JSON.stringify(S.normalizeTimes({ '5b': { start: '13:00', end: '14:25' } })) === '{}');
  ok('мусор и чужие слоты отбрасываются', JSON.stringify(S.normalizeTimes({ x: { start: '1' }, '5b': { start: '25:00', end: '14:40' } })) === '{"5b":{"start":"13:00","end":"14:40"}}');
  const s1 = DB.currentSchool().id;
  await S.setTime('5b', '13:30', '14:45');
  let built = S.build('2027-02-01', await S.times(), 'ru');
  const p1 = S.practicalIn(built, 1);
  ok('своё время в своей школе', p1.start === '13:30' && p1.end === '14:45' && p1.changed);
  ok('шаблон не изменился', S.practical(1).start === '13:00');
  await S.resetTime('5b');
  ok('вернуть стандартное', JSON.stringify(await S.times()) === '{}');
  await S.setTime('9a', '15:00', '16:10');
  await Schools.complete(s1);
  const sc2 = await Schools.create({ language: 'ru' });
  ok('Школа 2 — стандартное время', DB.currentSchool().id === sc2.id && JSON.stringify(await S.times()) === '{}');
  ok('время Школы 1 на месте', (await DB.inSchool(s1).getMeta('scheduleTimes'))['9a'].start === '15:00');
  let refused = false;
  try { await DB.inSchool(s1).setMeta('scheduleTimes', {}); } catch (e) { refused = e.code === 'PS_READONLY'; }
  ok('завершённая школа не пишется', refused);

  console.log('4. Сейчас');
  const dd = S.build('2027-02-01', {}, 'ru');
  const at = (date, hm) => S.status(dd, date, min(hm));
  ok('нет даты начала — nodate', S.status(S.build('', {}, 'ru'), '2027-02-01', 600).phase === 'nodate');
  let st = at('2027-01-20', '10:00');
  ok('до школы — дни до начала', st.phase === 'before' && st.daysUntil === 12);
  ok('после школы — after', at('2027-02-07', '09:00').phase === 'after');
  st = at('2027-02-02', '11:20');
  ok('вт 11:20 — идёт 5а, ещё 40 мин', st.phase === 'during' && st.day === 2 && st.current.item.sid === '5a' && st.current.left === 40 && st.current.progress === 47, JSON.stringify(st.current));
  ok('4а/4б и понедельник — пройдены, 5б впереди', st.slots['4a'] === 'past' && st.slots['1a'] === 'past' && st.slots['5b'] === 'future' && st.dayStates[1] === 'past' && st.dayStates[2] === 'today' && st.dayStates[3] === 'future');
  ok('далее — обед, потом 5б (практ. 1)', st.next.kind === 'lunch' && st.next.start === '12:00' && st.next.end === '13:00' && st.then.sid === '5b' && st.then.practical === 1);
  st = at('2027-02-02', '10:30');
  ok('граница: 10:30 — перерыв, не 4б', st.current.item.kind === 'break' && st.slots['4b'] === 'past' && st.current.item.end === '10:45');
  st = at('2027-02-02', '07:50');
  ok('утро — день ещё не начался, далее 4а', st.dayState === 'before' && !st.current && st.next.sid === '4a');
  st = at('2027-02-02', '17:00');
  ok('вечер — день закончен, далее — завтра 7а', st.dayState === 'done' && !st.current && st.next.sid === '7a' && st.next.date === '2027-02-03');
  st = at('2027-02-06', '15:20');
  ok('последний день после 18 — ничего далее', st.dayState === 'done' && st.next === null);
  st = S.status(S.build('2027-02-01', { '5a': { start: '11:00', end: '12:00' } }, 'ru'), '2027-02-02', min('10:50'));
  ok('своё время: перерыв тянется до нового начала 5а', st.current.item.kind === 'break' && st.current.item.end === '11:00' && st.current.left === 10);

  console.log(fails ? `\n✗ ${fails} проверок не прошло` : '\n✓ Ф6a: расписание — всё на месте');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
