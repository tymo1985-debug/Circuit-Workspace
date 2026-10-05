#!/usr/bin/env node
/**
 * Контракт A3: Клиндарий отправляет служебный год в Архив.
 *
 * Что может сломаться молча:
 *  1. Конверт не пройдёт `CWArchive.put()` (форма) или потеряет данные года —
 *     визиты на границе года, замороженные события, письма в docRefs.
 *  2. Отпечаток «устареет» от просмотра календаря (пустые недели, которые
 *     блоб досоздаёт сам) — или, наоборот, не заметит правку.
 *  3. Страница Клиндария потеряет подключение (скрипт, прекэш, элементы,
 *     подписи на 5 языках) — кнопка молча не появится.
 *  4. Файл ui/archive-year.js начнёт ПИСАТЬ в блоб или удалять оригинал
 *     (это шаг A5, не A3).
 *
 *   npm i fake-indexeddb
 *   node scripts/check-archive-year.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

/* ─── Среда: настоящие shared-слои и настоящий ui/archive-year.js ─── */
const ctx = vm.createContext({
  indexedDB: new IDBFactory(), IDBKeyRange, console, setTimeout, clearTimeout,
});
ctx.self = ctx;
ctx.window = ctx;
['shared/serviceyear.js', 'shared/db.js', 'shared/archive.js', 'shared/documents.js', 'circuit-planner/ui/archive-year.js']
  .forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const L = ctx.CPArchiveYear;
const SY = ctx.CWServiceYear;
ok('CPArchiveYear и CWServiceYear загружены', !!L && !!SY);

/* Подписи в тесте — ключи как есть: проверяем структуру, а не язык. */
const t = (k, v) => k + (v ? ':' + JSON.stringify(v) : '');
const mk = (extra) => Object.assign({
  bounds: SY.bounds(2025), label: SY.label(2025), t, version: '9.0.0', docKeys: [],
  fmtDate: (s) => String(s), priorityKey: (p) => 'priority_' + p,
  getEvent: (id) => ({ id, name: 'Собрание ' + id, color: '#123456', address: 'ул. ' + id }),
}, extra || {});

const week = (id, extra) => Object.assign({ id, weekId: id, start: id, end: id, eventId: '', priority: 'normal', flagLetter: false, flagS302: false, note: '' }, extra || {});
const baseApp = () => ({
  serviceYears: { 2025: { weeks: {
    '2025-09-01': week('2025-09-01', { eventId: 'e1', flagS302: true }),
    '2025-09-08': week('2025-09-08'),                       // пустая — досоздана блобом
    '2025-09-15': week('2025-09-15', { note: 'заметка' }),
  } }, 2024: { weeks: { '2024-09-02': week('2024-09-02', { eventId: 'e9' }) } } },
  events: [],
  entries: [
    { id: 'a', eventId: 'e1', start: '2025-09-01', end: '2025-09-07', title: 'Визит А', note: 'н', flags: { f302: true, letter: false }, resultNote: 'итог' },
    { id: 'b', eventId: 'e2', start: '2026-08-31', end: '2026-09-06', title: '', note: '', flags: { f302: false, letter: true } },  // последний день года
    { id: 'c', eventId: 'e1', start: '2026-09-01', end: '2026-09-02', title: 'Следующий год' },                                  // уже новый год
    { id: 'd', eventId: 'e3', start: '2025-08-31', end: '2025-08-31', title: 'Прошлый год' },                                   // накануне
  ],
});

/* ─── 1. Срез и конверт ─── */
console.log('\nКонверт года');
{
  const app = baseApp();
  const env = L.buildEnvelope(app, 2025, mk({ docKeys: ['circuit-planner:entry:b', 'circuit-planner:entry:a'] }));
  ok('id/sourceId/serviceYear/title', env.module === 'circuit-planner' && env.entity === 'serviceYear' && env.sourceId === '2025' && env.serviceYear === 2025 && env.title === '2025/2026');
  const ids = env.payload.entries.map((e) => e.id);
  ok('визиты в границах года: a и b (31 авг включительно), без c и d', ids.join() === 'a,b', ids.join());
  const w = Object.keys(env.payload.serviceYears[2025].weeks);
  ok('пустая неделя не попадает в архив', w.join() === '2025-09-01,2025-09-15', w.join());
  ok('чужой год (2024) в payload не попал', !env.payload.serviceYears[2024]);
  ok('события заморожены копией (имя, цвет, адрес)', env.payload.events.length === 2 && env.payload.events.every((e) => e.name && e.color && e.address), JSON.stringify(env.payload.events));
  ok('на события c/d, не входящие в год, ссылок нет', !env.payload.events.some((e) => e.id === 'e3'));
  ok('docRefs отсортированы и скопированы', env.docRefs.join() === 'circuit-planner:entry:a,circuit-planner:entry:b');
  ok('summary: weeks (с собранием) / visits / letters', env.summary.weeks === 1 && env.summary.visits === 2 && env.summary.letters === 2, JSON.stringify(env.summary));
  ok('display: два раздела, строки недель и визитов', env.display.sections.length === 2 && env.display.sections[0].rows.length === 2 && env.display.sections[1].rows.length === 2);
  const visit = env.display.sections[1].rows[0];
  ok('визит: S-302 и итог в тексте', visit.tags.includes('arch_tag_s302') && visit.note.includes('arch_result'), JSON.stringify(visit));
  ok('визит без названия берёт имя собрания', env.display.sections[1].rows[1].title === 'Собрание e2');
  ok('оригинал не изменён (блоб не тронут)', JSON.stringify(app) === JSON.stringify(baseApp()));
  ok('источник отсортирован предсказуемо: payload — копия, не ссылка', env.payload.entries[0] !== app.entries[0]);
}

/* ─── 2. Отпечаток ─── */
console.log('\nОтпечаток устаревания');
{
  const fp = (app, docs) => L.buildEnvelope(app, 2025, mk({ docKeys: docs || [] })).payload.fingerprint;
  const base = fp(baseApp());
  ok('тот же год — тот же отпечаток', fp(baseApp()) === base);
  const a1 = baseApp(); a1.serviceYears[2025].weeks['2025-09-22'] = week('2025-09-22');
  ok('досозданная пустая неделя НЕ меняет отпечаток', fp(a1) === base);
  const a2 = baseApp(); a2.entries[0].note = 'другая';
  ok('правка визита меняет отпечаток', fp(a2) !== base);
  const a3 = baseApp(); a3.serviceYears[2025].weeks['2025-09-15'].note = 'иначе';
  ok('правка недели меняет отпечаток', fp(a3) !== base);
  ok('новое письмо меняет отпечаток', fp(baseApp(), ['circuit-planner:entry:a']) !== base);
  const a4 = baseApp(); a4.entries[3].title = 'правка соседнего года';
  ok('правка визита ДРУГОГО года отпечаток не трогает', fp(a4) === base);
  const a5 = baseApp(); a5.entries.reverse();
  ok('порядок визитов в блобе не важен', fp(a5) === base);
  const ev = { get: (id) => ({ id, name: 'Переименовано ' + id, color: '#123456', address: 'ул. ' + id }) };
  ok('переименование собрания меняет отпечаток', L.buildEnvelope(baseApp(), 2025, mk({ getEvent: ev.get })).payload.fingerprint !== base);
}

/* ─── 3. Закончившийся год и «есть ли что отправлять» ─── */
console.log('\nПредложение: когда год закончился');
{
  ok('2025 при текущем 2026 — закончился', L.isFinished(2025, 2026));
  ok('текущий год не закончился', !L.isFinished(2026, 2026));
  ok('будущий год не закончился', !L.isFinished(2027, 2026));
  ok('не целое — не год', !L.isFinished('2025', 2026) && !L.isFinished(NaN, 2026));
  const empty = L.collect({ serviceYears: { 2025: { weeks: { '2025-09-08': week('2025-09-08') } } }, entries: [] }, 2025, SY.bounds(2025), null);
  ok('год из одних пустых недель — без содержимого', !L.hasContent(empty, 2025));
  ok('год только с визитом — с содержимым', L.hasContent(L.collect({ serviceYears: {}, entries: [baseApp().entries[0]] }, 2025, SY.bounds(2025), null), 2025));
}

/* ─── 4. Реальный CWArchive: конверт принят, ревизии, отпечаток читается ─── */
console.log('\nCWArchive.put поверх (ревизии)');
{
  const env = L.buildEnvelope(baseApp(), 2025, mk({ docKeys: ['circuit-planner:entry:a'] }));
  const r1 = await ctx.CWArchive.put(env);
  ok('put принял конверт, ревизия 1', r1.revision === 1 && r1.id === L.idOf(2025), JSON.stringify(r1 && r1.revision));
  const back = await ctx.CWArchive.get(L.idOf(2025));
  ok('отпечаток читается из payload', back.payload.fingerprint === env.payload.fingerprint);
  const changed = baseApp(); changed.entries[0].note = 'позже';
  const r2 = await ctx.CWArchive.put(L.buildEnvelope(changed, 2025, mk({ docKeys: ['circuit-planner:entry:a'] })));
  ok('повторная архивация — ревизия 2, firstArchivedAt сохранён', r2.revision === 2 && r2.firstArchivedAt === r1.firstArchivedAt);
  ok('устаревание видно по отпечатку', (await ctx.CWArchive.get(L.idOf(2025))).payload.fingerprint !== env.payload.fingerprint);
  const list = await ctx.CWArchive.list({ module: 'circuit-planner' });
  ok('список видит год, payload в списке нет', list.length === 1 && list[0].payload === undefined && list[0].summary.visits === 2);
  /* сбой формы не глотается */
  let code = '';
  try { await ctx.CWArchive.put(Object.assign({}, env, { sourceId: '2024' })); } catch (e) { code = e.code; }
  ok('конверт не той формы — отказ invalid, а не тишина', code === 'invalid', code);
}

/* ─── 5. Подключение к странице Клиндария ─── */
console.log('\nПодключение (разметка, прекэш, словарь)');
{
  const html = read('circuit-planner/index.html');
  const sw = read('circuit-planner/sw.js');
  const dict = read('circuit-planner/i18n/dict.js');
  const src = read('circuit-planner/ui/archive-year.js');
  const pos = (s) => html.indexOf(s);
  ok('index.html: shared/archive.js после db.js и до app.js', pos('../shared/db.js') < pos('../shared/archive.js') && pos('../shared/archive.js') < pos('app.js" defer'));
  ok('index.html: ui/archive-year.js до app.js', pos('ui/archive-year.js') > 0 && pos('ui/archive-year.js') < pos('app.js" defer'));
  ['archiveYearCard', 'archiveYearSelect', 'archiveYearStatus', 'archiveYearBtn', 'archiveProposal', 'archiveProposalText', 'archiveProposalYesBtn', 'archiveProposalLaterBtn']
    .forEach((id) => ok('index.html: #' + id, html.includes('id="' + id + '"')));
  ok("sw.js: precache '../shared/archive.js'", sw.includes("'../shared/archive.js'"));
  ok("sw.js: precache './ui/archive-year.js'", sw.includes("'./ui/archive-year.js'"));
  ok('app.js: renderAll зовёт archiveYearRender', /archiveYearRender\(\)/.test(read('circuit-planner/app.js')));

  const used = [...new Set([...src.matchAll(/\bt\('(arch_[a-z0-9_]+)'/g)].map((m) => m[1]))];
  const html_keys = [...html.matchAll(/data-i18n="(cp\.arch_[a-z0-9_]+)"/g)].map((m) => m[1].slice(3));
  const need = [...new Set(used.concat(html_keys))];
  ok('ключи arch_* найдены в коде', need.length >= 18, String(need.length));
  /* пять блоков register: каждый обязан содержать каждый ключ */
  const blocks = dict.split(/CWI18n\.register\(\{\s*/).slice(1);
  ok('в словаре Клиндария пять языковых блоков', blocks.length === 5, String(blocks.length));
  const missing = [];
  blocks.forEach((b, i) => need.forEach((k) => { if (!b.includes("'cp." + k + "'")) missing.push(['ru', 'uk', 'en', 'pl', 'de'][i] + ':' + k); }));
  ok('все ключи arch_* есть на всех 5 языках', missing.length === 0, missing.join(', '));
  ok('ключи priority_* для строк недель существуют', ['priority_normal', 'priority_important', 'priority_critical'].every((k) => dict.includes("'cp." + k + "'")));
  const arc = read('archive/i18n/dict.js');
  ok('Архив подписывает summary.weeks на 5 языках', (arc.match(/'arc\.summary\.weeks'/g) || []).length === 5);
}

/* ─── 6. Граница ответственности: A3 читает, A5 удаляет ─── */
console.log('\nГраница A3: блоб только читается');
{
  const src = read('circuit-planner/ui/archive-year.js');
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('нет присваиваний в App.state.app', !/App\.state\.app[\w.\[\]'"]*\s*(=[^=]|\+\+|--)/.test(code));
  ok('нет delete / splice / remove над данными', !/\bdelete\s|\.splice\(|CWArchive\.remove|CWDocs\.remove|App\.store\.save|App\.actions\./.test(code));
  ok('ключ хранилища блоба не упоминается', !/service-year-planner-v9-4-2/.test(code));
}

console.log(failed ? '\nПровалено: ' + failed : '\nВсё в порядке.');
process.exit(failed ? 1 : 0);
