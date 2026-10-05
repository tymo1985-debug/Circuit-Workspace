#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-archive-module.mjs
 *
 * ЧТО ЛОВИТ. Шаг A2 трека «Архив» (05.10.2026): страница `archive/` и её
 * три обязанности, нарушение каждой из которых бесшумно.
 *
 *  1. PIN-барьер. Хэш в `archive/js/pin.js` — копия `App.ui.pinHash`
 *     Клиндария (выносить функцию в `shared/` значило бы править PIN
 *     Клиндария, а схема §7 это запрещает). Копия расходится молча: изменится
 *     алгоритм в Клиндарии — Архив перестанет принимать верный PIN, или
 *     наоборот. Здесь функция достаётся из РЕАЛЬНОГО `circuit-planner/app.js`
 *     и сравнивается на наборе PIN.
 *  2. Закрытое остаётся закрытым. Пока PIN задан и не введён, конверты
 *     Клиндария не видны нигде на странице: ни в списке, ни в годах, ни в
 *     поиске, ни в сообщении «архив пуст». Проверяется по тексту живой
 *     страницы, а не по логике: утечка бывает и в разметке.
 *  3. Отказ не маскируется. База не открылась — страница говорит
 *     «недоступен», а не «пуст».
 *  4. Письма — только чтение. Карточка снимка в Архиве без кнопки удаления;
 *     удаление конверта — только по подтверждению.
 *
 * Страница — настоящий `archive/index.html` с настоящими скриптами поверх
 * fake-indexeddb, не мок.
 *
 *   npm i jsdom fake-indexeddb
 *   node scripts/check-archive-module.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/* ─── 1. Хэш PIN совпадает с Клиндарием ─────────────────────────────────── */
console.log('\nPIN: копия хэша совпадает с Клиндарием');
{
  const app = read('circuit-planner/app.js');
  const m = app.match(/pinHash\(pin\)\s*\{[^\n]*\}/);
  ok('App.ui.pinHash найден в circuit-planner/app.js', !!m,
    'функцию переименовали или перенесли — обновить поиск здесь и копию в archive/js/pin.js');
  const keyLiteral = /localStorage\.setItem\('syp-pin-hash'/.test(app);
  ok("Клиндарий хранит PIN под ключом 'syp-pin-hash'", keyLiteral, 'ключ сменили — Архив смотрит не туда');

  const ctx = vm.createContext({ self: null });
  ctx.self = ctx;
  vm.runInContext(read('archive/js/pin.js'), ctx);
  const mine = ctx.ArchivePin;
  ok('ArchivePin.KEY совпадает с ключом Клиндария', mine.KEY === 'syp-pin-hash', mine.KEY);

  if (m) {
    const theirs = vm.runInContext('({ ' + m[0] + ' })', vm.createContext({})).pinHash;
    const pins = ['1234', '0000', '99999999', '4821', '0', '', ' 12 ', 'абвг', 'a'.repeat(200), '12 34'];
    const bad = pins.filter((p) => theirs(p) !== mine.hash(p));
    ok('хэш совпадает на ' + pins.length + ' PIN', bad.length === 0, 'расходятся: ' + JSON.stringify(bad));
  }
}

/* ─── 2. Чистая логика ───────────────────────────────────────────────────── */
console.log('\nЛогика отбора и группировки');
{
  const ctx = vm.createContext({ self: null });
  ctx.self = ctx;
  vm.runInContext(read('archive/js/logic.js'), ctx);
  const L = ctx.ArchiveLogic;
  const row = (id, module, year, title, text) => ({
    id, module, serviceYear: year, title,
    display: { sections: [{ heading: 'Раздел', rows: [{ date: '01.02', title: text || '', note: '', tags: [] }] }] },
  });
  const rows = [
    row('a', 'circuit-planner', 2025, '2025/2026', 'Визит Альфа'),
    row('b', 'congress-project', 2025, 'Конгресс весна', 'Программа'),
    row('c', 'congress-project', 2023, 'Конгресс осень', 'Альфа программа'),
  ];
  ok('visible: замок закрыт — Клиндарий скрыт', L.visible(rows, true).map((r) => r.id).join() === 'b,c');
  ok('visible: замок открыт — видно всё', L.visible(rows, false).length === 3);
  ok('yearsOf: новые сверху, без повторов', L.yearsOf(rows).join() === '2025,2023');
  ok('filter: слова в любом порядке', L.filter(rows, { query: 'программа альфа' }).map((r) => r.id).join() === 'c');
  ok('filter: год', L.filter(rows, { year: 2023 }).length === 1);
  ok('filter: регистр не важен', L.filter(rows, { query: 'ВИЗИТ' }).length === 1);
  ok('groupByYear: порядок годов и подписи', L.groupByYear(rows).map((g) => g.label).join() === '2025/2026,2023/2024');
  const p = L.parseDocRef('circuit-planner:entry:abc');
  ok('parseDocRef: обычный ключ', p && p.module === 'circuit-planner' && p.entity === 'entry' && p.id === 'abc');
  const colon = L.parseDocRef('a:b:c:d');
  ok('parseDocRef: id с двоеточием сохраняется', colon && colon.id === 'c:d');
  ok('parseDocRef: битые ключи → null', ['a:b', 'a::c', ':b:c', 'a:b:', '', null].every((k) => L.parseDocRef(k) === null));
}

/* ─── 3. Живая страница ──────────────────────────────────────────────────── */
console.log('\nСтраница архива (jsdom + fake-indexeddb)');

const HTML = read('archive/index.html');
const SKIP = /theme\.js|nav\.js|update\.js|backup\.js/;
const SCRIPTS = [...HTML.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !SKIP.test(s));
const PAGE_ORDER_OK = SCRIPTS.indexOf('../shared/db.js') >= 0
  && SCRIPTS.indexOf('../shared/db.js') < SCRIPTS.indexOf('../shared/archive.js')
  && SCRIPTS.indexOf('../shared/archive.js') < SCRIPTS.indexOf('js/app.js');
ok('в разметке db.js → archive.js → app.js', PAGE_ORDER_OK, SCRIPTS.join(', '));

const DB_SRC = read('shared/db.js');
const ARCHIVE_SRC = read('shared/archive.js');
const DOCS_SRC = read('shared/documents.js');

/* Данные кладём ДО открытия страницы — через настоящие CWArchive/CWDocs в
   голой среде, на той же фабрике IndexedDB. */
async function seed(factory) {
  const ctx = vm.createContext({ indexedDB: factory, IDBKeyRange, console, setTimeout, clearTimeout, self: null });
  ctx.self = ctx;
  [DB_SRC, ARCHIVE_SRC, DOCS_SRC].forEach((src) => vm.runInContext(src, ctx));
  const env = (module, entity, sourceId, year, title, rowTitle, extra) => Object.assign({
    module, entity, sourceId, serviceYear: year, title,
    sourceVersion: '9.95.22',
    display: { sections: [{ heading: 'Визиты', rows: [{ date: '12.03.2026', title: rowTitle, note: 'заметка', tags: ['собрание'] }] }] },
    summary: { visits: 1 },
    payload: { secret: true },
    docRefs: [],
  }, extra || {});
  /* Год Клиндария намеренно НЕ совпадает с годами конгрессов: иначе утечку
     года через чипы фильтра не отличить от честного года конгресса. */
  await ctx.CWArchive.put(env('circuit-planner', 'serviceYear', '2023', 2023, '2023/2024', 'Секретный визит Бета'));
  await ctx.CWArchive.put(env('congress-project', 'congress', 'c1', 2025, 'Конгресс весны', 'Программа весны', {
    docRefs: ['congress-project:congress:c1', 'congress-project:congress:нет-такого'],
  }));
  await ctx.CWArchive.put(env('congress-project', 'congress', 'c0', 2024, 'Конгресс осени', 'Программа осени'));
  await ctx.CWDocs.save({
    templateId: 'sys.congress.invite', context: 'congress.invite.email', title: 'Приглашение',
    lang: 'ru', format: 'text', subject: 'Тема приглашения', body: 'Текст письма участнику',
    ref: { module: 'congress-project', entity: 'congress', id: 'c1' }, reason: 'send',
  });
  return ctx;
}

async function openPage(factory, opts = {}) {
  const dom = new JSDOM(HTML, { url: 'https://example.test/archive/index.html', pretendToBeVisual: true });
  const w = dom.window;
  w.indexedDB = factory;
  w.IDBKeyRange = IDBKeyRange;
  w.scrollTo = () => {};
  /* Сценарий «база недоступна» ждёт console.error от страницы — не шумим. */
  if (opts.noDb) w.console.error = () => {};
  w.confirm = () => (opts.confirm === undefined ? true : opts.confirm);
  if (opts.pinHash) w.localStorage.setItem('syp-pin-hash', opts.pinHash);
  const ctx = vm.createContext(w);
  ctx.self = w;
  SCRIPTS.filter((s) => !(opts.noDb && /\/db\.js$/.test(s))).forEach((s) => {
    vm.runInContext(read(join('archive', s)), ctx, { filename: s });
  });
  await settle(120);
  return { w, doc: w.document, ctx };
}

const textOf = (doc) => doc.body.textContent.replace(/\s+/g, ' ');
/* Тексты сверяются через словарь страницы, а не по русскому литералу: язык
   интерфейса в jsdom зависит от окружения, а проверка обязана давать один
   ответ везде. Заодно ловится ключ, потерявший перевод (t(key) === key). */
const tr = (w, key) => w.CWI18n.t(key);
const said = (w, doc, key) => textOf(doc).includes(tr(w, key));
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));

{
  /* 3.1. PIN не задан: видно всё. */
  const factory = new IDBFactory();
  await seed(factory);
  const { w, doc } = await openPage(factory);
  ok('ключи словаря страницы разрешаются (а не показываются как есть)',
    ['arc.empty', 'arc.nothing_found', 'arc.unavailable', 'arc.pin_wrong'].every((k) => tr(w, k) !== k));
  const items = doc.querySelectorAll('.arc-item');
  ok('PIN не задан: три записи в списке', items.length === 3, items.length);
  ok('PIN не задан: плашка замка скрыта', doc.getElementById('lockedBox').hidden === true);
  ok('PIN не задан: кнопки «Закрыть PIN-ом» нет', doc.getElementById('lockBtn').hidden === true);
  const groups = [...doc.querySelectorAll('.arc-group__title')].map((e) => e.textContent);
  ok('группы по служебным годам, новые сверху', groups.join() === '2025/2026,2024/2025,2023/2024', groups.join());
  ok('фильтр: «Все годы» + три года', doc.querySelectorAll('#yearChips [data-year]').length === 4);

  /* Поиск и год. */
  const search = doc.getElementById('search');
  search.value = 'осени';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('поиск по тексту строки display', doc.querySelectorAll('.arc-item').length === 1);
  search.value = 'такого-нет-нигде';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('поиск без совпадений — «Ничего не найдено», а не «пуст»', said(w, doc, 'arc.nothing_found') && !said(w, doc, 'arc.empty'));
  search.value = '';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  click(doc.querySelector('#yearChips [data-year="2024"]'));
  ok('фильтр по году', doc.querySelectorAll('.arc-item').length === 1);
  click(doc.querySelector('#yearChips [data-year=""]'));

  /* 3.2. Запись конгресса: разделы, письма без кнопки удаления. */
  const open = [...doc.querySelectorAll('.arc-item')].find((b) => b.getAttribute('data-open') === 'congress-project:congress:c1');
  click(open);
  await settle(120);
  const detail = doc.getElementById('detail');
  ok('экран записи открыт', doc.getElementById('detailScreen').hidden === false && doc.getElementById('listScreen').hidden === true);
  ok('строки display показаны', /Программа весны/.test(detail.textContent) && /заметка/.test(detail.textContent));
  ok('payload не показывается', !/secret/.test(detail.textContent));
  ok('письмо из docRefs показано', detail.querySelectorAll('.cwdoc').length === 1 && /Тема приглашения/.test(detail.textContent));
  ok('у письма НЕТ кнопки удаления снимка', detail.querySelectorAll('[data-cwdoc-remove]').length === 0);
  ok('копирование письма осталось', detail.querySelectorAll('[data-cwdoc-copy]').length === 1);

  /* 3.3. Удаление: без согласия — ничего, с согласием — удалено. */
  w.confirm = () => false;
  click(doc.getElementById('deleteBtn'));
  await settle();
  const still = await w.CWArchive.has('congress-project:congress:c1');
  ok('отказ в confirm — конверт на месте', still === true);
  w.confirm = () => true;
  click(doc.getElementById('deleteBtn'));
  await settle(150);
  ok('согласие — конверт удалён из хранилища', (await w.CWArchive.has('congress-project:congress:c1')) === false);
  ok('после удаления — снова список, записей на одну меньше',
    doc.getElementById('listScreen').hidden === false && doc.querySelectorAll('.arc-item').length === 2);
  ok('письмо в хранилище документов НЕ тронуто удалением конверта',
    (await w.CWDocs.list({ module: 'congress-project', entity: 'congress', id: 'c1' })).length === 1);
}

{
  /* 3.4. PIN задан и не введён: Клиндарий не виден нигде. */
  const factory = new IDBFactory();
  await seed(factory);
  const pinCtx = vm.createContext({ self: null });
  pinCtx.self = pinCtx;
  vm.runInContext(read('archive/js/pin.js'), pinCtx);
  const hash = pinCtx.ArchivePin.hash('4821');
  const { w, doc } = await openPage(factory, { pinHash: hash });

  const all = textOf(doc);
  ok('PIN задан: плашка «закрыто PIN-ом» видна', doc.getElementById('lockedBox').hidden === false);
  ok('PIN задан: года Клиндария нет на странице', !/2023\/2024/.test(all), all.slice(0, 160));
  ok('PIN задан: в списке только Конгрессы', doc.querySelectorAll('.arc-item').length === 2
    && ![...doc.querySelectorAll('.arc-item')].some((b) => /circuit-planner/.test(b.getAttribute('data-open'))));
  ok('PIN задан: текста закрытого конверта нет нигде', !/Секретный визит Бета/.test(all));
  const yearsShown = [...doc.querySelectorAll('#yearChips [data-year]')].map((b) => b.getAttribute('data-year')).join();
  ok('PIN задан: годы считаются по видимым записям (года Клиндария нет)', yearsShown === ',2025,2024', yearsShown);

  const search = doc.getElementById('search');
  search.value = 'Секретный';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('поиск не находит закрытое', doc.querySelectorAll('.arc-item').length === 0 && !/Секретный визит Бета/.test(textOf(doc)));
  ok('поиск по закрытому не выдаёт «архив пуст» (это утверждение о закрытой части)', !said(w, doc, 'arc.empty'));
  search.value = '';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));

  /* Прямое открытие закрытого id (в обход списка) тоже не проходит. */
  w.document.getElementById('list').insertAdjacentHTML('beforeend',
    '<button class="arc-item" data-open="circuit-planner:serviceYear:2023">x</button>');
  click(doc.querySelector('[data-open="circuit-planner:serviceYear:2023"]'));
  await settle(120);
  ok('закрытый конверт не открывается по прямому id', doc.getElementById('detailScreen').hidden === true);

  /* Неверный PIN. */
  click(doc.getElementById('unlockBtn'));
  const input = doc.getElementById('pinInput');
  input.value = '0000';
  doc.getElementById('pinForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok('неверный PIN: сообщение, раздел закрыт', doc.getElementById('pinError').textContent === tr(w, 'arc.pin_wrong')
    && doc.getElementById('lockedBox').hidden === false && !/Секретный визит Бета/.test(textOf(doc)));
  ok('неверный PIN: поле очищено', input.value === '');

  /* Верный PIN (с пробелами по краям, как у Клиндария). */
  input.value = ' 4821 ';
  doc.getElementById('pinForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  ok('верный PIN: плашка скрыта, три записи', doc.getElementById('lockedBox').hidden === true
    && doc.querySelectorAll('.arc-item').length === 3);
  ok('верный PIN: годы теперь с Клиндарием', doc.querySelectorAll('.arc-group__title').length === 3);
  ok('верный PIN: появилась кнопка «Закрыть PIN-ом»', doc.getElementById('lockBtn').hidden === false);
  ok('PIN не записан в хранилище страницей', w.localStorage.getItem('syp-pin-hash') === hash);

  /* Обратно под замок. */
  click(doc.getElementById('lockBtn'));
  ok('«Закрыть PIN-ом»: Клиндарий снова скрыт', doc.querySelectorAll('.arc-item').length === 2
    && !/Секретный визит Бета/.test(textOf(doc)));
}

{
  /* 3.5. PIN задан, а в архиве нет ничего, кроме Клиндария: не «пуст». */
  const factory = new IDBFactory();
  const s = await seed(factory);
  await s.CWArchive.remove('congress-project:congress:c1', { confirmed: true });
  await s.CWArchive.remove('congress-project:congress:c0', { confirmed: true });
  const { w, doc } = await openPage(factory, { pinHash: '12345' });
  ok('только закрытое: нет ни записей, ни «Архив пока пуст»',
    doc.querySelectorAll('.arc-item').length === 0 && !said(w, doc, 'arc.empty')
    && doc.getElementById('lockedBox').hidden === false);
}

{
  /* 3.6. Пустой архив без PIN — честное «пуст». */
  const { w, doc } = await openPage(new IDBFactory());
  ok('пустой архив: «Архив пока пуст»', said(w, doc, 'arc.empty'), tr(w, 'arc.empty'));
}

{
  /* 3.7. База недоступна — «недоступен», а не «пуст». */
  const { w, doc } = await openPage(new IDBFactory(), { noDb: true });
  const all = textOf(doc);
  ok('база недоступна: «Архив недоступен»', said(w, doc, 'arc.unavailable'), all.slice(0, 200));
  ok('база недоступна: НЕ «Архив пока пуст»', !said(w, doc, 'arc.empty'));
}

{
  /* 3.8. Страница и словарь. */
  ok('словарь: ключи на пяти языках одного состава', (() => {
    const src = read('archive/i18n/dict.js');
    const counts = ['ru', 'uk', 'en', 'pl', 'de'].map((l) => {
      const a = src.indexOf('    ' + l + ': {');
      const rest = src.slice(a + 1);
      const next = rest.search(/\n    (ru|uk|en|pl|de): \{|\n  \}\);/);
      return (rest.slice(0, next).match(/'arc\.[^']+':/g) || []).length;
    });
    return counts.every((c) => c === counts[0] && c > 20);
  })());
  ok('в AGENTS модуля описан PIN-барьер', existsSync(join(ROOT, 'archive/AGENTS.md')) && /PIN/.test(read('archive/AGENTS.md')));
}

console.log(failed ? '\nПровалов: ' + failed : '\nАрхив: всё в порядке');
process.exit(failed ? 1 : 0);
