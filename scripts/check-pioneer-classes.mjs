#!/usr/bin/env node
/**
 * Школа пионеров — классы и заказ учебников (Ф5, 15.11.2026).
 *
 * ЗАЧЕМ. Отказы Ф5 тихие:
 *  1. «Предложить» трогает только тех, кто без класса: перестановка
 *     вручную распределённого пионера молча отменила бы решение Алекса.
 *  2. Супруги и родственники — в одном классе, даже если один из них уже
 *     стоит в классе, а второй ещё нет.
 *  3. В классы идут только подтвердившие; ждущие ответа — «без класса».
 *  4. «+5» — только к печатным строкам; суммы заказа пишутся в прежние поля
 *     (requestedByStudents / alreadyInStock / orderQuantity) — по ним печатают
 *     PDF/CSV и читают старые копии.
 *  5. Старый класс без teacherA/teacherB читается; непустой класс не удаляется.
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
  for (const f of ['js/db.js', 'js/modules/history.js', 'js/modules/students.js', 'js/modules/textbooks.js',
    'js/modules/classes.js', 'js/modules/overview.js']) {
    vm.runInContext(readFileSync(join(PS, f), 'utf8'), ctx, { filename: f });
  }
  await ctx.DB.ready();
  const { Students, PSClasses, Textbooks, DB } = ctx;
  await Students.getColumns();
  const add = (id, last, extra = {}) => {
    const { values = {}, ...rest } = extra;
    return Students.save({ id, classId: null, values: { lastName: last, firstName: 'И', ...values }, origin: 'branchList', status: 'willCome', textbookLanguages: ['ru'], ...rest });
  };
  const byId = async () => Object.fromEntries((await Students.list()).map((s) => [s.id, s]));

  console.log('1. Предложение распределения');
  await DB.put('classes', { id: 'k1', name: 'Класс 1' });            // старая запись: без преподавателей
  await add('a', 'Аа', { gender: 'brother' });
  await add('b', 'Бб', { gender: 'sister' });
  await add('c', 'Вв', { gender: 'brother', classId: 'k1' });        // вручную в классе 1
  await add('d', 'Гг', { gender: 'sister' });
  await add('e', 'Дд', { gender: 'brother' });
  await add('w', 'Жж', { status: 'invited' });                        // ждём ответа
  await add('x', 'Зз', { status: 'wontCome', statusReason: 'работа' });
  await Students.saveCard('a', { relations: [{ type: 'spouse', studentId: 'b' }] });
  await Students.saveCard('d', { relations: [{ type: 'relative', studentId: 'c' }] });

  let st = await Students.list();
  ok('старый класс без преподавателей читается', (await PSClasses.list())[0].teacherA === undefined);
  const groups = PSClasses.groups(st.filter((s) => PSClasses.isConfirmed(s)));
  ok('группы по связям', groups.map((g) => g.map((s) => s.id).sort().join('')).sort().join(',') === 'ab,cd,e', groups.map((g) => g.map((s) => s.id).join('')).join(','));

  let p = PSClasses.propose({ students: st, classes: await PSClasses.list(), count: 2, newName: (n) => 'Класс ' + n });
  const to = Object.fromEntries(p.moves.map((m) => [m.id, m.to]));
  ok('создаётся недостающий класс', p.classes.length === 2 && p.classes[1].isNew && p.classes[1].id === 'new:2');
  ok('вручную распределённый не переставлен', !('c' in to));
  ok('родственник идёт к уже распределённому', to.d === 'k1', JSON.stringify(to));
  ok('супруги вместе', to.a && to.a === to.b, JSON.stringify(to));
  ok('ждущие и отказавшиеся не распределяются', !('w' in to) && !('x' in to));
  ok('выравнивание: пара — в более пустой класс', to.a === 'new:2', JSON.stringify(to));
  ok('одиночка — туда, где меньше', to.e === 'new:2' || to.e === 'k1');

  const pAll = PSClasses.propose({ students: st, classes: await PSClasses.list(), count: 2, mode: 'all', newName: (n) => 'Класс ' + n });
  const all = Object.fromEntries(st.filter((s) => PSClasses.isConfirmed(s)).map((s) => [s.id, s.classId]));
  pAll.moves.forEach((m) => { all[m.id] = m.to; });
  ok('«всех заново»: группы вместе', all.a === all.b && all.c === all.d, JSON.stringify(all));
  const sizes = Object.values(all).reduce((m, id) => ({ ...m, [id]: (m[id] || 0) + 1 }), {});
  ok('«всех заново»: размеры 3 и 2', Object.values(sizes).sort().join() === '2,3', JSON.stringify(sizes));

  console.log('2. Применение');
  await PSClasses.apply(p);
  const cls = await PSClasses.list();
  const k2 = cls.find((c) => c.id !== 'k1');
  st = await byId();
  ok('новый класс создан с полями преподавателей', cls.length === 2 && k2.name === 'Класс 2' && k2.teacherA === '' && k2.teacherB === '');
  ok('пионеры переставлены, временных id нет', st.a.classId === k2.id && st.b.classId === k2.id && st.d.classId === 'k1' && !Object.values(st).some((s) => String(s.classId).startsWith('new:')));
  ok('в журнале — класс, источник auto', st.a.history.some((h) => h.type === 'class' && h.source === 'auto' && h.to === k2.id));
  ok('повторное «Предложить» — некого', PSClasses.propose({ students: Object.values(st), classes: cls, count: 2 }).moves.length === 0);
  await PSClasses.update(k2.id, { teacherA: '  Петров ', name: '' });
  const k2b = (await PSClasses.list()).find((c) => c.id === k2.id);
  ok('пара преподавателей сохраняется, пустое имя не стирает', k2b.teacherA === 'Петров' && k2b.name === 'Класс 2');
  let threw = false;
  try { await PSClasses.remove('k1', Object.values(st)); } catch (e) { threw = true; }
  ok('непустой класс не удаляется', threw && (await PSClasses.list()).length === 2);

  console.log('3. Заказ учебников');
  await Students.saveCard('a', { textbookLanguages: ['ru', 'de'] });
  const full = await DB.get('students', 'b'); full.values.textbookFormat = 'print'; await Students.save(full);
  const fw = await DB.get('students', 'w'); fw.values.textbookFormat = 'print'; await Students.save(fw);
  st = await Students.list();
  let order = await Textbooks.getOrder();
  let r = Textbooks.compute({ students: st, classes: cls, order, schoolLanguage: 'ru' });
  const row = (key) => r.rows.find((x) => x.key === key);
  ok('строки язык × формат', r.rows.map((x) => x.key).join() === 'ru|print,ru|digital,de|digital', r.rows.map((x) => x.key).join());
  ok('+5 только к печатным', row('ru|print').reserve === 5 && row('ru|digital').reserve === 0 && row('de|digital').reserve === 0);
  ok('ждущий ответа — в «без класса»', row('ru|print').none === 1 && row('ru|print').need === 2, JSON.stringify(row('ru|print')));
  ok('по классам', row('ru|digital').byClass.k1 === 3 && row('ru|digital').byClass[k2.id] === 1, JSON.stringify(row('ru|digital')));
  ok('отказавшийся не считается', r.total.need === 7, String(r.total.need));
  order = { ...order, stock: { 'ru|print': 3, 'fr|print': 2 } };
  r = Textbooks.compute({ students: st, classes: cls, order, schoolLanguage: 'ru' });
  ok('в наличии вычитается, заказ не уходит в минус', row('ru|print').order === 4 && r.rows.find((x) => x.key === 'fr|print').order === 0);
  ok('строка с наличием без спроса видна', !!r.rows.find((x) => x.key === 'fr|print'));
  await Textbooks.saveComputed(order, r);
  const saved = await Textbooks.getOrder();
  ok('суммы — в прежние поля', saved.requestedByStudents === 7 && saved.alreadyInStock === 5 && saved.orderQuantity === r.total.order && saved.orderQuantity === 4 + 4 + 1);
  const rc = Textbooks.compute({ students: st, classes: cls, order: { basis: 'confirmed' }, schoolLanguage: 'ru' });
  ok('основа «только подтвердившие»', rc.basis === 'confirmed' && rc.total.need === 6 && rc.total.none === 0);
  ok('без языков — язык школы', Textbooks.compute({ students: [{ id: 'z', status: 'willCome', values: {}, textbookLanguages: [] }], classes: [], order: {}, schoolLanguage: 'uk' }).rows[0].language === 'uk');

  console.log('4. Обзор и экран');
  const stages = ctx.PSOverview.stages({ students: st, classes: cls, orderQty: 9, anketa: {}, assignment: {}, groups: [] });
  ok('этап «классы» берёт заказ из orderQty', stages.stages[5].data.order === 9);
  ok('кнопка этапа «классы» ведёт в «Классы и учебники»', ctx.PSOverview.STAGE_ROUTE.classes === 'textbooks');
  const app = readFileSync(join(PS, 'js/app.js'), 'utf8');
  ok('прежнее «Равномерно распределить» удалено', !app.includes('auto-distribute-btn') && !readFileSync(join(PS, 'js/modules/students.js'), 'utf8').includes('autoDistribute('));
  const sw = readFileSync(join(PS, 'sw.js'), 'utf8');
  const html = readFileSync(join(PS, 'index.html'), 'utf8');
  ok('classes.js в кэше и на странице', sw.includes("'./js/modules/classes.js'") && html.includes('js/modules/classes.js'));

  console.log(fails ? `\nПровалено: ${fails}` : '\nВсе проверки пройдены.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
