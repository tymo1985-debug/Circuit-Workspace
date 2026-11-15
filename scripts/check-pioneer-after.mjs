#!/usr/bin/env node
/**
 * Школа пионеров — «После школы» (Ф7, 15.11.2026).
 *
 * ЗАЧЕМ. Отказы Ф7 тихие:
 *  1. S-253 — живой расчёт из статусов: стр.1 — из списка филиала, но не
 *     прошли (в том числе без ответа и без отметки), стр.2 — «Был» не из
 *     списка. Ошибка в фильтре молча теряет человека в отчёте филиалу.
 *  2. Ручные строки прежнего формата (notAttendedFromList / attendedNotOnList)
 *     из старых копий не пропадают, а печатаются вместе с расчётом.
 *  3. «Не был» без причины не сохраняется; отметка пишется в журнал пионера
 *     (source 'attendance'); повторный клик возвращает «Придёт».
 *  4. Скрытая строка остаётся на экране, но не идёт в PDF и счётчики.
 *  5. Завершённая школа — только чтение: отметку поставить нельзя.
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
    'js/modules/afterSchool.js']) {
    vm.runInContext(readFileSync(join(PS, f), 'utf8'), ctx, { filename: f });
  }
  await ctx.DB.ready();
  const { Students, AfterSchool, DB, Schools } = ctx;
  await Students.getColumns();
  const add = (id, origin, status, statusReason = '') => Students.save({
    id, classId: null, values: { lastName: id, firstName: 'И', congregation: 'Брно' },
    origin, status, statusReason, textbookLanguages: ['ru'],
  });
  await add('a', 'branchList', 'willCome');
  await add('b', 'branchList', 'wontCome', 'работа');
  await add('c', 'branchList', 'invited');
  await add('d', 'otherCircuit', 'willCome');
  await add('e', 'branchList', 'willCome');
  await add('f', 'otherBranch', 'wontCome', 'болезнь');

  console.log('1. Отметки');
  let err = '';
  try { await AfterSchool.mark('a', 'notAttended', '  '); } catch (e) { err = e.message; }
  ok('«Не был» без причины — ошибка', err === 'ps.pioneer.err.reason');
  await AfterSchool.mark('a', 'notAttended', 'заболела');
  await AfterSchool.mark('d', 'attended');
  await AfterSchool.mark('e', 'attended');
  let all = Object.fromEntries((await Students.list()).map((s) => [s.id, s]));
  ok('«Не был» + причина', all.a.status === 'notAttended' && all.a.statusReason === 'заболела');
  const hist = (await DB.get('students', 'd')).history || [];
  ok('отметка в журнале (source attendance)', hist.some((h) => h.type === 'status' && h.source === 'attendance' && h.to === 'attended'));
  await AfterSchool.mark('e', null);
  all = Object.fromEntries((await Students.list()).map((s) => [s.id, s]));
  ok('снятие отметки → «Придёт»', all.e.status === 'willCome' && !all.e.statusReason);

  console.log('2. S-253');
  const legacy = { notAttendedFromList: [{ name: 'Старый', reason: 'переезд' }], attendedNotOnList: [{ name: 'Гость', congregation: 'Вена' }], submitted: true, submittedDate: '2026-10-01' };
  await DB.setMeta('afterSchool_s253', legacy);
  let data = await AfterSchool.get();
  ok('старая запись читается без потерь', data.notAttendedFromList.length === 1 && data.attendedNotOnList.length === 1 && data.submitted && Array.isArray(data.hidden));
  let rep = AfterSchool.report(await Students.list(), data);
  const p1 = Object.fromEntries(rep.page1.map((r) => [r.id, r]));
  ok('стр.1: «Не был», «Не придёт», без ответа, без отметки', ['a', 'b', 'c', 'e'].every((id) => p1[id]) && rep.page1.length === 5);
  ok('стр.1: причины', p1.a.reason === 'заболела' && p1.b.reason === 'работа' && p1.c.reasonCode === 'noAnswer' && p1.e.reasonCode === 'unmarked');
  ok('стр.1: не из списка филиала не попадает', !p1.d && !p1.f);
  ok('стр.1: ручная строка', rep.page1.some((r) => r.manual && r.name === 'Старый' && r.reason === 'переезд'));
  ok('стр.2: «Был» не из списка + ручная', rep.page2.length === 2 && rep.page2.some((r) => r.id === 'd' && r.origin === 'otherCircuit') && rep.page2.some((r) => r.manual && r.name === 'Гость'));
  ok('без итоговой отметки: c, e', rep.open.map((s) => s.id).sort().join() === 'c,e');
  ok('счётчики', rep.attended === 2 && rep.failed === 5, JSON.stringify([rep.attended, rep.failed]));

  console.log('3. Скрыть и удалить');
  await AfterSchool.toggleHidden('c');
  rep = AfterSchool.report(await Students.list(), await AfterSchool.get());
  ok('скрытая строка на месте, но вне счёта', rep.page1.find((r) => r.id === 'c').hidden && rep.failed === 4);
  await AfterSchool.toggleHidden('c');
  await AfterSchool.removeManual('m1:0');
  data = await AfterSchool.get();
  ok('ручная строка удалена, скрытие снято', data.notAttendedFromList.length === 0 && data.hidden.length === 0);

  console.log('4. Завершённая школа');
  const sc = Schools.current ? Schools.current() : null;
  if (sc) {
    await Schools.complete(sc.id);
    err = '';
    try { await AfterSchool.mark('e', 'attended'); } catch (e) { err = (e && (e.code || (e.reason && e.reason.code))) || String(e); }
    ok('отметка в завершённой школе отклонена', /PS_READONLY/.test(err), err);
  } else {
    ok('есть текущая школа', false, 'Schools.current() пусто');
  }

  console.log(fails ? `\n✗ ${fails} проверок не прошло` : '\n✓ Ф7: после школы — всё на месте');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
