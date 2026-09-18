#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-sender-readiness.mjs
 *
 * Фаза C1: подготовка `CWSender` к переносу канона в общую базу (Фаза C2)
 * БЕЗ смены самого канона. Эта проверка доказывает ровно границу C1:
 * инфраструктура готовности и будущие зависимости на месте, а поведение
 * хранения не изменилось ни на бит.
 *
 * ПОЧЕМУ ЭТА ПРОВЕРКА ЗДЕСЬ, А НЕ ТОЛЬКО В check-shared-precache.mjs.
 * Тот гейт статически сверяет script-теги с precache для пяти оболочек с
 * собственным service worker'ом, но НЕ включает хаб (у него другой формат
 * страницы и есть динамическая инъекция `db.js`) и не проверяет ничего
 * специфичного для sender — идемпотентность API, синхронность get(),
 * неизменность backup-реестра. Дублировать эти проверки в пяти файлах хуже,
 * чем держать их в одном месте, привязанном к конкретной фазе миграции.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

const sender = read('shared/sender.js');

/* ── 1–6. Сам shared/sender.js: контракт готовности, backend не тронут ───── */
console.log('\nshared/sender.js: контракт готовности');
{
  ok('CWSender.init() объявлен', /init:\s*init/.test(sender));
  ok('CWSender.ready() объявлен', /ready:\s*init/.test(sender));
  ok('init/ready — одна и та же функция (один промис на страницу)',
    /var readyPromise = null/.test(sender) && /if \(!readyPromise\)/.test(sender));
  ok('get() остаётся синхронным (не возвращает Promise)',
    /get:\s*function\s*\(\)\s*\{[\s\S]{0,120}return copy;/.test(sender));
  ok('set() по-прежнему пишет в localStorage(cw-sender)',
    /function write\(value\)[\s\S]{0,120}localStorage\.setItem\(KEY, value\)/.test(sender));
  ok('adopt() остаётся синхронным (возвращает boolean, не Promise)',
    /adopt:\s*function \(seed\)[\s\S]{0,400}return true;/.test(sender));
  ok('KEY canonical — по-прежнему cw-sender', /var KEY = 'cw-sender'/.test(sender));
  ok('никакой записи в state/shared:sender внутри sender.js',
    !sender.includes("'shared:sender'") && !sender.includes('"shared:sender"'));
  ok('CWSender.create(...) / CWState.create внутри sender.js не вызывается',
    !/CWState\.create/.test(sender));
}

/* ── 7. Planner: опасный adopt() call site зафиксирован, не стал async ──── */
console.log('\nCircuit Planner: adopt() call site');
{
  const planner = read('circuit-planner/app.js');
  const i = planner.indexOf('adopt() {');
  const body = planner.slice(i, i + 700);
  ok('adopt() Клиндария остаётся синхронным методом (не async)',
    i > -1 && !/async adopt/.test(planner.slice(Math.max(0, i - 20), i + 20)));
  ok('CWSender.adopt(...) вызывается синхронно, без await',
    /const taken = CWSender\.adopt\(/.test(body) && !/await CWSender\.adopt/.test(body));
  ok('удаление старых полей sender остаётся условным на synchronous taken (безопасно только в C1)',
    /if \(taken\) \{ delete s\.senderName/.test(body));
  ok('CWSender.ready() вызывается ДО shared.adopt() при старте',
    planner.indexOf('CWSender.ready()') > -1
    && planner.indexOf('CWSender.ready()') < planner.indexOf('this.shared.adopt();'));
}

/* ── 8/9. Хаб как писатель, все 6 оболочек wired ─────────────────────────── */
console.log('\nВсе 6 оболочек: sender подключён и wired на готовность');
{
  const hub = read('index.html');
  ok('хаб пишет sender (CWSender.set) — учтён как 6-й consumer/writer',
    /CWSender\.set\(patch\)/.test(hub));
  ok('хаб вызывает CWSender.ready() перед первым fill()',
    /CWSender\.ready\(\)\.then\(fill\)/.test(hub));
  ok('хаб подключает shared/state.js', /<script src="shared\/state\.js">/.test(hub));

  const congress = read('congress-project/js/main.js');
  ok('Конгрессы: senderReady участвует в цепочке старта',
    /senderReady=self\.CWSender\?\.ready\?\.\(\)/.test(congress)
    && /Promise\.all\(\[initState\(\),senderReady\]\)/.test(congress));

  const docs = read('documents/js/app.js');
  ok('Документы: CWSender.ready() в boot()',
    /function boot\(\) \{[\s\S]{0,200}CWSender\.ready\(\)/.test(docs));
  const docsHtml = read('documents/index.html');
  ok('Документы: подключён shared/state.js', /shared\/state\.js/.test(docsHtml));

  const ps = read('pioneer-school/js/app.js');
  ok('Школа: CWSender.ready() в DOMContentLoaded (транзитивный потребитель через shared/templates.js)',
    /CWSender\.ready\(\)/.test(ps));
  const psHtml = read('pioneer-school/index.html');
  ok('Школа: подключён shared/state.js', /shared\/state\.js/.test(psHtml));

  const appt = read('appointments/js/app.js');
  ok('Назначения: CWSender.ready() до renderSenderPanel()/renderLetter()',
    (() => {
      const i = appt.indexOf('function start() {');
      const body = appt.slice(i, i + 900)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      const r = body.indexOf('CWSender.ready()');
      const p1 = body.indexOf('renderSenderPanel()');
      const p2 = body.indexOf('renderLetter()');
      return r > -1 && r < p1 && r < p2;
    })());
  const apptHtml = read('appointments/index.html');
  ok('Назначения: подключены shared/state.js и shared/db.js',
    /shared\/state\.js/.test(apptHtml) && /shared\/db\.js/.test(apptHtml));

  const plannerHtml = read('circuit-planner/index.html');
  ok('Клиндарий: shared/state.js уже был подключён (без изменений)',
    /shared\/state\.js/.test(plannerHtml));
}

/* ── 10/11. Precache ─────────────────────────────────────────────────────── */
console.log('\nPrecache новых зависимостей');
{
  ok('SW хаба: state.js в precache', /'\.\/shared\/state\.js'/.test(read('service-worker.js')));
  ok('SW Документов: state.js в precache', /'\.\.\/shared\/state\.js'/.test(read('documents/sw.js')));
  ok('SW Школы: state.js в precache', /'\.\.\/shared\/state\.js'/.test(read('pioneer-school/sw.js')));
  const apptSw = read('appointments/sw.js');
  ok('SW Назначений: state.js и db.js в precache',
    /'\.\.\/shared\/state\.js'/.test(apptSw) && /'\.\.\/shared\/db\.js'/.test(apptSw));
}

/* ── 6. "Нет лишнего open DB": лениво по построению ───────────────────────── */
console.log('\nПодключение файлов не открывает базу и не создаёт canonical sender');
{
  const db = read('shared/db.js');
  ok('shared/db.js не вызывает openDb() на верхнем уровне (только внутри методов)',
    !/^\s*openDb\(\);?\s*$/m.test(db.replace(/function openDb[\s\S]*?\n  \}\n/, '')));
  const state = read('shared/state.js');
  ok('shared/state.js не обращается к CWDB на верхнем уровне (только внутри create())',
    (() => {
      const i = state.indexOf('function create(');
      // Убираем блочные и строчные комментарии — иначе документация,
      // упоминающая CWDB.mutate() как объяснение формата, ложно проваливает
      // проверку кода, которого там на самом деле нет.
      const stripped = state.slice(0, i)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return !/CWDB/.test(stripped);
    })());
  ok('нигде в изменённых файлах не создаётся CWState.create(\'shared:sender\')',
    !/CWState\.create\(['"]shared:sender['"]\)/.test(
      sender + read('index.html') + read('circuit-planner/app.js')
      + read('congress-project/js/main.js') + read('documents/js/app.js')
      + read('pioneer-school/js/app.js') + read('appointments/js/app.js')));
}

/* ── 12/13/14. Backup/канон/версия не изменились ─────────────────────────── */
console.log('\nКанон, backup-реестр и версия базы не изменены');
{
  const backup = read('shared/backup.js');
  const shared = backup.slice(0, backup.indexOf('var MODULES'));
  ok('SHARED.local всё ещё содержит cw-sender', /cw-sender/.test(shared));
  const modulesBlock = backup.slice(backup.indexOf('var MODULES'), backup.indexOf('};', backup.indexOf('var MODULES')));
  const sharedLocalCount = (modulesBlock.match(/sharedLocal: \['cw-sender'\]/g) || []).length;
  ok('реестр модулей: sharedLocal по-прежнему cw-sender у всех прежних потребителей',
    sharedLocalCount >= 4, 'найдено: ' + sharedLocalCount);
  ok('в реестре нет sharedStores-записи для shared:sender (C2 ещё не начата)',
    !modulesBlock.includes("ids: ['shared:sender']") && !modulesBlock.includes('"shared:sender"'));

  const dbSrc = read('shared/db.js');
  ok('DB_VERSION не изменена в этой фазе', /const DB_VERSION = 5;/.test(dbSrc));
}

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nГотовность sender подготовлена; канон остаётся cw-sender.');
process.exit(failed ? 1 : 0);
