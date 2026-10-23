#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-archive-module.mjs
 *
 * ЧТО ЛОВИТ. Шаг A2 трека «Архив» (05.10.2026): страница `archive/` и её
 * три обязанности, нарушение каждой из которых бесшумно.
 *
 *  1. PIN удалён (21.10.2026, решение Алекса). Барьера нет: ни `pin.js`, ни
 *     плашки, ни диалога; оставшийся от прежней установки `syp-pin-hash`
 *     ничего не скрывает. Вернуть барьер молча нельзя — гейт упадёт.
 *  2. Чистая логика отбора и группировки.
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

/* ─── 1. PIN удалён ──────────────────────────────────────────────────────── */
console.log('\nPIN удалён из Клиндария и Архива');
{
  const app = read('circuit-planner/app.js');
  ok('archive/js/pin.js удалён', !existsSync(join(ROOT, 'archive/js/pin.js')));
  ok('Клиндарий PIN больше не записывает', !/setItem\('syp-pin-hash'/.test(app) && !/pinHash|showPinGateIfNeeded/.test(app));
  ok('Клиндарий снимает прежний ключ при запуске', /init\(\)\s*\{[\s\S]{0,400}removeItem\('syp-pin-hash'\)/.test(app));
  ok('экрана PIN в разметке Клиндария нет', !/id="pin(Overlay|SetupBtn)"/.test(read('circuit-planner/index.html')));
  const arc = read('archive/index.html') + read('archive/js/app.js') + read('archive/js/logic.js') + read('archive/sw.js');
  ok('в Архиве нет ни барьера, ни ссылок на него', !/pin\.js|ArchivePin|pinDialog|lockedBox|lockBtn|GATED_MODULE/.test(arc));
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
  if (opts.staleKey) w.localStorage.setItem('syp-pin-hash', opts.staleKey);
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
  /* 3.1. Видно всё. */
  const factory = new IDBFactory();
  await seed(factory);
  const { w, doc } = await openPage(factory);
  ok('ключи словаря страницы разрешаются (а не показываются как есть)',
    ['arc.empty', 'arc.nothing_found', 'arc.unavailable'].every((k) => tr(w, k) !== k));
  const items = doc.querySelectorAll('.arc-item');
  ok('три записи в списке', items.length === 3, items.length);
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

  /* 3.3a. «Отменить» в сообщении возвращает конверт как был (аудит 08, п.10). */
  const undo = doc.querySelector('#toast .arc-toast__action');
  ok('после удаления в сообщении есть «Отменить»', !!undo && undo.textContent === tr(w, 'arc.undo'));
  click(undo);
  await settle(150);
  const back = await w.CWArchive.get('congress-project:congress:c1');
  ok('«Отменить» — конверт снова в хранилище, payload и ревизия прежние',
    !!back && back.payload && back.revision === 1 && doc.querySelectorAll('.arc-item').length === 3);
  ok('restore() не затирает конверт, появившийся заново',
    (await w.CWArchive.restore({ ...back, title: 'старый' })) === false
    && (await w.CWArchive.get('congress-project:congress:c1')).title !== 'старый');
  let rejected = false;
  try { await w.CWArchive.restore({ id: 'x' }); } catch (e) { rejected = e.code === 'invalid'; }
  ok('restore() без модуля из SOURCES — отказ invalid', rejected);
}

{
  /* 3.4. Ключ прежнего PIN остался (Клиндарий ещё не запускался): ничего не скрыто. */
  const factory = new IDBFactory();
  await seed(factory);
  const { doc } = await openPage(factory, { staleKey: '12345' });
  ok('старый syp-pin-hash: все три записи, Клиндарий виден', doc.querySelectorAll('.arc-item').length === 3
    && [...doc.querySelectorAll('.arc-item')].some((b) => /circuit-planner/.test(b.getAttribute('data-open'))));
}

{
  /* 3.6. Пустой архив — честное «пуст». */
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
}

console.log(failed ? '\nПровалов: ' + failed : '\nАрхив: всё в порядке');
process.exit(failed ? 1 : 0);
