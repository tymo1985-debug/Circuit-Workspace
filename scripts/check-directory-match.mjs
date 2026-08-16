// Сопоставление свободных строк с карточками справочника и поиск дублей.
//
// ЗАПУСК из корня монорепо:
//   node scripts/check-directory-match.mjs
//
// ЗАЧЕМ. Шаг 6 фазы 5 связывает строку Конгрессов вида
// «Warszawa-Bemowo (19588)» с карточкой общего справочника. Логика чистая, но
// краевых случаев у неё много, а цена ошибки после подключения к интерфейсу —
// ссылка на чужое собрание в программе конгресса и в письмах.
//
// ПОЧЕМУ НЕ В check-all.mjs. Правило отбора туда прямое: попадает то, что уже
// ломалось повторно, а не всё, что можно проверить. Сопоставление не ломалось
// ни разу — оно только что написано. Регистрировать его в гейте сейчас значило
// бы размыть правило собственным исключением.
// ВКЛЮЧИТЬ В ГЕЙТ, когда сопоставление начнёт ЧТО-ТО МЕНЯТЬ (второй кусок
// шага 6): с этого момента цена ошибки — данные пользователя, а не пустой
// результат функции. Записано кандидатом в IDEAS.md.
//
// ПОЧЕМУ ЯВНЫЙ СПИСОК ЗАПИСЕЙ. `matchName()` и `findDuplicates()` принимают
// вторым аргументом массив карточек. Без него функции читали бы кэш, который
// наполняется только из IndexedDB, — и проверить их вне браузера было бы
// нельзя вовсе.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
};

/* Модуль — IIFE на глобальном объекте. Поднимаем его с заглушкой вместо
   window: ни CWDB, ни localStorage здесь не нужны, проверяются чистые
   функции. */
const src = readFileSync(new URL('../shared/directory.js', import.meta.url), 'utf8');
const fakeGlobal = {
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {},   // модуль слушает 'storage' — маячок соседних вкладок
};
new Function('window', 'self', 'globalThis', src)(fakeGlobal, fakeGlobal, fakeGlobal);
const D = fakeGlobal.CWDirectory;

if (!D) {
  console.log('  ✗ CWDirectory не поднялся');
  process.exit(1);
}

const RECORDS = [
  { id: 'a', name: 'Warszawa-Ukraiński-Południe', congNumber: '19588' },
  { id: 'b', name: 'Warszawa-Bemowo',             congNumber: '20114' },
  { id: 'c', name: 'Warszawa-Bemowo-Wschód',      congNumber: '20115' },
  { id: 'd', name: 'SZ Warszawa',                 congNumber: '' },
  { id: 'e', name: 'Kraków-Podgórze',             congNumber: '' },
];

const m = (value, list = RECORDS) => D.matchName(value, list);

console.log('\n1. Уверенные исходы');
{
  const r1 = m('Warszawa-Bemowo');
  ok('точное совпадение названия', r1.confidence === 'exact' && r1.record.id === 'b', r1.confidence);

  const r2 = m('  warszawa-bemowo  ');
  ok('регистр и лишние пробелы не значимы', r2.confidence === 'exact' && r2.record.id === 'b', r2.confidence);

  const r3 = m('Warszawa-Ukraiński-Południe (19588)');
  ok('номер в скобках ведёт к карточке', ['number', 'name'].includes(r3.confidence) && r3.record.id === 'a', r3.confidence);

  // Собрание переименовали: номер прежний, название новое. Номер должен победить.
  const r4 = m('Warszawa-Ukraiński-Nowe (19588)');
  ok('переименование: сопоставление по НОМЕРУ', r4.confidence === 'number' && r4.record.id === 'a', r4.confidence);

  // Номера нет ни у кого — совпадает только название после расщепления.
  const r5 = m('Kraków-Podgórze (99999)');
  ok('нет такого номера — совпадение по названию', r5.confidence === 'name' && r5.record.id === 'e', r5.confidence);
}

console.log('\n2. Исходы, которые обязан разрешать человек');
{
  // 20114 принадлежит Bemowo, а название — Ukraiński-Południe.
  const r1 = m('Warszawa-Ukraiński-Południe (20114)');
  ok('номер и название ведут к РАЗНЫМ карточкам → conflict', r1.confidence === 'conflict', r1.confidence);
  ok('conflict не выбирает победителя', r1.record === null);
  ok('conflict показывает обоих кандидатов', r1.candidates.length === 2,
     JSON.stringify(r1.candidates.map((c) => c.id)));

  const r2 = m('SZ-Warszawa');
  ok('пунктуация → только слабое совпадение', r2.confidence === 'weak' && r2.record.id === 'd', r2.confidence);

  const r3 = m('Warszawa Bemowo', [
    { id: 'x', name: 'Warszawa-Bemowo', congNumber: '1' },
    { id: 'y', name: 'Warszawa.Bemowo', congNumber: '2' },
  ]);
  ok('несколько слабых кандидатов → ambiguous', r3.confidence === 'ambiguous', r3.confidence);
  ok('ambiguous ничего не выбирает', r3.record === null && r3.candidates.length === 2);
}

console.log('\n3. Чего сопоставление НЕ делает намеренно');
{
  const r1 = m('Warszawa-Bemowo-Wschód');
  ok('соседнее собрание не склеивается с Warszawa-Bemowo',
     r1.confidence === 'exact' && r1.record.id === 'c', `${r1.confidence}/${r1.record && r1.record.id}`);

  const r2 = m('Warszawa-Bemow');   // одна буква потеряна
  ok('опечатка НЕ сопоставляется (нет расстояния редактирования)',
     r2.confidence === 'none', r2.confidence);

  const r3 = m('Варшава-Бемово');
  ok('транслитерация НЕ сопоставляется', r3.confidence === 'none', r3.confidence);

  const r4 = m('Совершенно другое собрание');
  ok('незнакомая строка → none', r4.confidence === 'none' && r4.record === null, r4.confidence);

  const r5 = m('');
  ok('пустая строка безопасна', r5.confidence === 'none' && r5.record === null);

  const r6 = m('что угодно', []);
  ok('пустой справочник безопасен', r6.confidence === 'none' && r6.record === null);
}

console.log('\n4. Чистота: справочник не портится');
{
  const before = JSON.stringify(RECORDS);
  const r = m('Warszawa-Bemowo');
  r.record.name = 'ИСПОРЧЕНО';
  r.record.congNumber = '000';
  ok('вернулась копия, оригинал не тронут', JSON.stringify(RECORDS) === before);
  ok('исходная строка сохранена в результате', m('Warszawa-Bemowo (19588)').input === 'Warszawa-Bemowo (19588)');
}

console.log('\n5. Пачка строк');
{
  const all = D.matchAll(['Warszawa-Bemowo', 'нет такого', 'SZ-Warszawa'], RECORDS);
  ok('matchAll возвращает по результату на строку', all.length === 3);
  ok('порядок сохранён',
     all[0].confidence === 'exact' && all[1].confidence === 'none' && all[2].confidence === 'weak',
     all.map((x) => x.confidence).join(','));
}

console.log('\n6. Дубли внутри справочника');
{
  const dup = D.findDuplicates([
    { id: '1', name: 'Warszawa-Bemowo',  congNumber: '20114' },
    { id: '2', name: 'Warszawa Bemowo',  congNumber: '20114' },  // дубль по номеру
    { id: '3', name: 'Kraków-Podgórze',  congNumber: '30001' },
    { id: '4', name: 'kraków-podgórze',  congNumber: '30002' },  // дубль по имени
    { id: '5', name: 'Одинокое',         congNumber: '' },
    { id: '6', name: 'Другое',           congNumber: '' },
  ]);
  const byNumber = dup.filter((g) => g.reason === 'number');
  const byName = dup.filter((g) => g.reason === 'name');
  ok('дубль по номеру найден', byNumber.length === 1 && byNumber[0].ids.join() === '1,2',
     JSON.stringify(byNumber));
  ok('дубль по названию найден', byName.length === 1 && byName[0].ids.join() === '3,4',
     JSON.stringify(byName));
  ok('пустой номер не считается дублем', !dup.some((g) => g.value === ''));

  const same = D.findDuplicates([
    { id: '1', name: 'Одно и то же', congNumber: '111' },
    { id: '2', name: 'Одно и то же', congNumber: '111' },
  ]);
  ok('совпадение и по номеру, и по имени не удваивается', same.length === 1, JSON.stringify(same));

  ok('чистый справочник — пустой результат',
     D.findDuplicates([{ id: '1', name: 'A', congNumber: '1' }, { id: '2', name: 'B', congNumber: '2' }]).length === 0);
}

console.log(`\nПройдено: ${pass}, провалов: ${fail}.`);
if (fail) { console.log('Выпускать нельзя.'); process.exit(1); }
console.log('Сопоставление ведёт себя как описано в 03-matching-audit.md.');
