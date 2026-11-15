#!/usr/bin/env node
/**
 * Школа пионеров — школы года и модель пионера (Ф1, 14.11.2026).
 *
 * ЗАЧЕМ. С Ф1 каждая запись модуля принадлежит школе (префикс ключа, см.
 * «ШКОЛЫ» в pioneer-school/js/db.js). Отказы здесь необратимы для данных:
 * школа перезаписывает соседнюю по фиксированному ключу ('main', ключ урока),
 * старая копия восстанавливается «в никуда», завершённая школа молча меняется.
 * Сценарии гоняют настоящие db.js / students.js / schools.js на fake-indexeddb,
 * каждая «страница» — свой vm-контекст над одной и той же базой.
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const idb = new IDBFactory();
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond ? '' : ' — ' + (extra || ''))); if (!cond) fails++; };

function page() {
  const ctx = {
    indexedDB: idb, IDBKeyRange, console, Intl, Date, Math, JSON, Promise, Error, setTimeout,
    T: (k, v) => k + (v ? JSON.stringify(v) : ''),
    PSDocLang: { get: () => 'ru' },
    CWI18n: { lang: 'ru' },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['js/db.js', 'js/modules/history.js', 'js/modules/students.js', 'js/modules/schools.js']) {
    vm.runInContext(readFileSync(join(ROOT, 'pioneer-school', f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

function rawOpenV2() {
  return new Promise((res, rej) => {
    const r = idb.open('pioneer-school-db', 2);
    r.onupgradeneeded = (e) => {
      const db = e.target.result;
      ['meta','substitutes','students','classes','textbookOrder','lessons','practicalSessions','dailyReviews','afterSchool','documents','registrations']
        .forEach((n) => db.createObjectStore(n, { keyPath: n === 'meta' ? 'key' : 'id' }));
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function rawPut(db, store, rows) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    rows.forEach((r) => t.objectStore(store).put(r));
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
function rawAll(db, store) {
  return new Promise((res) => { const r = db.transaction(store).objectStore(store).getAllKeys(); r.onsuccess = () => res(r.result); });
}
const LEGACY = {
  meta: [
    { key: 'anketa_s257', value: { city: 'Прага' } },
    { key: 'assignment', value: { location: 'Зал', startDate: '2026-12-01' } },
    { key: 'studentColumns', value: [
      { key: 'lastName', label: 'Фамилия', type: 'text', protected: true },
      { key: 'firstName', label: 'Имя', type: 'text', protected: true },
      { key: 'status', label: 'Подтверждение участия', type: 'select', protected: true },
      { key: 'language', label: 'Язык учебника (текстом)', type: 'text' },
      { key: 'congregation', label: 'Собрание', type: 'text' } ] },
  ],
  students: [
    { id: 'id-a', classId: null, values: { lastName: 'Новак', firstName: 'Анна', status: 'listed', language: 'Русский, чешский', congregation: 'Прага' } },
    { id: 'id-b', classId: null, values: { lastName: 'Новак', firstName: 'Пётр', status: 'withdrawn' } },
    { id: 'id-c', classId: null, values: { lastName: 'Ким', firstName: 'Ира', status: 'transferred', language: 'Klingon' } },
  ],
  classes: [{ id: 'id-k1', name: 'Класс 1' }],
  textbookOrder: [{ id: 'main', requestedByStudents: 7 }],
  lessons: [{ id: '1a', key: '1a', done: true }],
};

(async () => {
  console.log('1. Переход текущих данных в «Школу 1»');
  let raw = await rawOpenV2();
  for (const [s, rows] of Object.entries(LEGACY)) await rawPut(raw, s, rows);
  raw.close();
  let p = page();
  await p.DB.ready();
  let schools = p.DB.schools();
  ok('создана одна школа №1', schools.length === 1 && schools[0].number === 1 && !schools[0].completed);
  ok('язык школы по умолчанию', schools[0].language === 'ru');
  const s1 = schools[0].id;
  ok('выбрана Школа 1', p.DB.currentSchool().id === s1);
  raw = await rawOpenV2();
  const sk = await rawAll(raw, 'students');
  ok('ключи учащихся с префиксом школы', sk.every((k) => k.startsWith(s1 + '|')), sk.join());
  const mk = await rawAll(raw, 'meta');
  ok('анкета → ключ школы', mk.includes(s1 + '|anketa_s257') && !mk.includes('anketa_s257'), mk.join());
  ok('столбцы остались общими', mk.includes('studentColumns'));
  raw.close();
  ok('getMeta по короткому ключу', (await p.DB.getMeta('anketa_s257')).city === 'Прага');
  ok('учебники по id main', (await p.DB.get('textbookOrder', 'main')).requestedByStudents === 7);
  const st = await p.Students.list();
  ok('id без префикса', st.every((s) => !s.id.includes('|')));
  const a = st.find((s) => s.id === 'id-a'), b = st.find((s) => s.id === 'id-b'), c = st.find((s) => s.id === 'id-c');
  ok('listed → список филиала / приглашён', a.origin === 'branchList' && a.status === 'invited');
  ok('языки из текста → коды', JSON.stringify(a.textbookLanguages) === '["ru","cs"]', JSON.stringify(a.textbookLanguages));
  ok('withdrawn → не придёт + причина', b.status === 'wontCome' && !!b.statusReason);
  ok('без языка → язык школы', JSON.stringify(b.textbookLanguages) === '["ru"]');
  ok('transferred → другой район; чужой язык текстом', c.origin === 'otherCircuit' && c.textbookLanguages[0] === 'Klingon');
  ok('values.status снят', a.values.status === undefined && a.values.language === undefined);
  const cols = await p.Students.getColumns();
  ok('столбцы status/language убраны', !cols.some((x) => x.key === 'status' || x.key === 'language'));
  const again = await p.Students.list();
  ok('повторное чтение стабильно', JSON.stringify(again) === JSON.stringify(await p.Students.list()));

  console.log('2. Связи');
  await p.Students.saveCard('id-a', { relations: [{ type: 'spouse', studentId: 'id-b' }] });
  let bb = (await p.Students.list()).find((s) => s.id === 'id-b');
  ok('связь взаимная', bb.relations.length === 1 && bb.relations[0].studentId === 'id-a' && bb.relations[0].type === 'spouse');
  let err = null;
  try { await p.Students.saveCard('id-c', { relations: [{ type: 'spouse', studentId: 'id-b' }] }); } catch (e) { err = e.message; }
  ok('второй супруг отклонён', err && err.includes('spouse_taken'), err);
  err = null;
  try { await p.Students.saveCard('id-c', { status: 'wontCome', statusReason: '  ' }); } catch (e) { err = e.message; }
  ok('причина обязательна', err && err.includes('err.reason'), err);
  err = null;
  try { await p.Students.saveCard('id-c', { textbookLanguages: [] }); } catch (e) { err = e.message; }
  ok('минимум один язык', err && err.includes('err.languages'), err);
  await p.Students.saveCard('id-a', { relations: [] });
  bb = (await p.Students.list()).find((s) => s.id === 'id-b');
  ok('связь снята у обоих', bb.relations.length === 0);
  await p.Students.saveCard('id-a', { relations: [{ type: 'relative', studentId: 'id-c' }] });
  await p.Students.remove('id-c');
  const aa = (await p.Students.list()).find((s) => s.id === 'id-a');
  ok('удаление снимает связь у второго', aa.relations.length === 0);

  console.log('3. Вторая школа, только чтение');
  err = null;
  try { await p.Schools.create({ language: 'cs' }); } catch (e) { err = e.message; }
  ok('новая школа при открытой — отказ', err && err.includes('finish_first'));
  await p.Schools.complete(s1);
  ok('Школа 1 только чтение', p.DB.isReadOnly());
  err = null;
  try { await p.DB.put('classes', { name: 'X' }); } catch (e) { err = e; }
  ok('запись в завершённую — PS_READONLY', err && err.code === 'PS_READONLY');
  err = null;
  try { await p.DB.setMeta('assignment', {}); } catch (e) { err = e; }
  ok('мета завершённой — PS_READONLY', err && err.code === 'PS_READONLY');
  await p.DB.setMeta('studentExportColumns', ['lastName']);
  ok('общий ключ пишется и в завершённой', true);
  const sc2 = await p.Schools.create({ language: 'cs' });
  ok('Школа 2 создана и выбрана', sc2.number === 2 && p.DB.currentSchool().id === sc2.id && !p.DB.isReadOnly());
  ok('Школа 2 пуста', (await p.DB.list('students')).length === 0 && !(await p.DB.get('textbookOrder', 'main')));
  await p.DB.put('textbookOrder', { id: 'main', requestedByStudents: 3 });
  ok('Школа 1 не задета', (await p.DB.inSchool(s1).get('textbookOrder', 'main')).requestedByStudents === 7);
  await p.DB.put('lessons', { id: '1a', key: '1a', done: false });
  await p.DB.clearStore('lessons');
  ok('clearStore только своей школы', (await p.DB.inSchool(s1).list('lessons')).length === 1);
  ok('вернуть можно только последнюю', !p.Schools.canReopen(p.DB.schools()[0]));

  console.log('4. Повторное приглашение');
  const rec = await p.Students.reinvite(s1, 'id-b', sc2.id);
  const list2 = await p.Students.list();
  ok('отдельная запись в Школе 2', list2.length === 1 && list2[0].id !== 'id-b' && list2[0].status === 'invited');
  ok('отметка о прошлой школе', list2[0].previousInvites[0].number === 1 && list2[0].previousInvites[0].status === 'wontCome');
  ok('текст отметки', p.Students.previousInviteText(list2[0].previousInvites[0]).includes('prev_invite'));
  err = null;
  try { await p.Students.reinvite(s1, 'id-b', sc2.id); } catch (e) { err = e.message; }
  ok('повтор приглашения — отказ', err && err.includes('already_reinvited'));
  ok('прежняя запись цела', (await p.DB.inSchool(s1).get('students', 'id-b')).status === 'wontCome');

  console.log('5. Копия модуля: новая и старая');
  const dump = await p.DB.exportAll();
  ok('копия помечена _scoped', dump._scoped === 1 && dump._version === 2);
  await p.DB.importAll(dump);
  ok('после восстановления — обе школы', p.DB.schools().length === 2);
  ok('данные Школы 2 на месте', (await p.DB.get('textbookOrder', 'main')).requestedByStudents === 3);
  const legacyDump = { _version: 2, meta: LEGACY.meta, students: LEGACY.students, classes: LEGACY.classes, textbookOrder: LEGACY.textbookOrder, lessons: LEGACY.lessons,
    substitutes: [], practicalSessions: [], dailyReviews: [], afterSchool: [], documents: [], registrations: [] };
  await p.DB.importAll(JSON.parse(JSON.stringify(legacyDump)));
  schools = p.DB.schools();
  ok('старая копия → одна «Школа 1»', schools.length === 1 && schools[0].number === 1 && !schools[0].completed);
  ok('старая копия: данные в Школе 1', (await p.DB.get('textbookOrder', 'main')).requestedByStudents === 7 && (await p.Students.list()).length === 3);

  console.log('6. Старая копия через хаб (сырые записи) и перезапуск страницы');
  raw = await rawOpenV2();
  await new Promise((res) => { const t = raw.transaction(['meta', 'students'], 'readwrite'); t.objectStore('meta').clear(); t.objectStore('students').clear(); t.oncomplete = res; });
  await rawPut(raw, 'meta', LEGACY.meta);
  await rawPut(raw, 'students', LEGACY.students);
  raw.close();
  p = page();
  await p.DB.ready();
  ok('новая страница: Школа 1 и наследие принято', p.DB.schools().length === 1 && (await p.Students.list()).length === 3);
  raw = await rawOpenV2();
  ok('после принятия ключей без префикса нет', (await rawAll(raw, 'students')).every((k) => k.includes('|')));
  raw.close();
  const p2 = page();
  await p2.DB.ready();
  ok('повторный запуск идемпотентен', p2.DB.schools().length === 1 && p2.DB.schools()[0].id === p.DB.schools()[0].id);

  console.log(fails ? `\nИтого провалено: ${fails}` : '\nИтого: все сценарии пройдены');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
