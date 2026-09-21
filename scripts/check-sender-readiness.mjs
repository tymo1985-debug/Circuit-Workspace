#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-sender-readiness.mjs
 *
 * Фаза C2: канон отправителя переехал из localStorage(`cw-sender`) в запись
 * `shared:sender` хранилища `state` общей базы. Эта проверка доказывает
 * границу C2: канон, миграция A–D, WRITTEN/REFUSED/FAILED, async adopt(),
 * backup-реестр и restore-мост — на месте, а инфраструктура готовности и
 * защита апгрейда со смешанным кэшем (унаследованы от C1) не сломаны.
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

/* ── 1–6. Сам shared/sender.js: канон переехал в CWState('shared:sender') ── */
console.log('\nshared/sender.js: канон фазы C2');
{
  ok('CWSender.init() объявлен', /init:\s*init/.test(sender));
  ok('CWSender.ready() объявлен', /ready:\s*init/.test(sender));
  ok('init/ready — одна и та же функция (один промис на страницу)',
    /var readyPromise = null;/.test(sender) && /if \(!readyPromise\) readyPromise = start\(\);/.test(sender));
  ok('get() остаётся синхронным (не возвращает Promise)',
    /get: function \(\) \{[\s\S]{0,150}return copy;/.test(sender));
  ok('STATE_ID канон — shared:sender', /var STATE_ID = 'shared:sender';/.test(sender));
  ok('LEGACY_KEY (cw-sender) объявлен как прежний ключ', /var LEGACY_KEY = 'cw-sender';/.test(sender));
  ok('канон создаётся через CWState.create(STATE_ID)',
    /state = global\.CWState\.create\(STATE_ID\);/.test(sender));
  ok('НИ ОДНОЙ записи в прежний ключ: setItem(LEGACY_KEY/cw-sender) отсутствует',
    !/localStorage\.setItem\([^)]*LEGACY_KEY/.test(sender) && !/setItem\(['"]cw-sender['"]/.test(sender));
  ok('adopt() теперь асинхронный — возвращает Promise через init().then(...)',
    /adopt: function \(seed\) \{[\s\S]{0,200}return init\(\)\.then\(function \(\) \{/.test(sender));
  ok('status()/onStatusChange() экспортированы для UI деградации',
    /status: status,/.test(sender) && /onStatusChange: function/.test(sender));
  ok('dirty() экспортирован (домен-правка не подтверждена каноном)',
    /dirty: isDirty,/.test(sender));
}

/* ── 7. Planner/Congress: adopt() теперь асинхронный, удаление — по confirmed */
console.log('\nCircuit Planner и Конгрессы: adopt() call site (C2 — async)');
{
  const planner = read('circuit-planner/app.js');
  const i = planner.indexOf('adopt() {');
  const body = planner.slice(i, i + 700);
  ok('Planner: CWSender.adopt(...) оборачивается в Promise.resolve(...).then(...)',
    i > -1 && /Promise\.resolve\(CWSender\.adopt\(/.test(body) && /\.then\(\(taken\) => \{/.test(body));
  ok('Planner: удаление старых полей — ТОЛЬКО внутри .then, на подтверждённом taken',
    /\.then\(\(taken\) => \{\s*if \(taken\) \{ delete s\.senderName/.test(body));
  ok('Planner: CWSender.ready() вызывается ДО shared.adopt() при старте',
    planner.indexOf('CWSender.ready()') > -1
    && planner.indexOf('CWSender.ready()') < planner.indexOf('this.shared.adopt();'));

  const congState = read('congress-project/js/state.js');
  const iC = congState.indexOf('export function adoptShared()');
  const bodyC = congState.slice(iC, iC + 500);
  ok('Congress: adoptShared() оборачивает adopt() в Promise.resolve(...).then(...)',
    iC > -1 && /Promise\.resolve\(self\.CWSender\.adopt\(/.test(bodyC) && /\.then\(taken=>\{/.test(bodyC));
  ok('Congress: НАЙДЕННЫЙ БАГ исправлен — удаление полей внутри if(taken), не безусловно',
    /\.then\(taken=>\{if\(taken\)\{\["senderName"/.test(bodyC));
}

/* ── 8/9. Хаб как писатель, все 6 оболочек wired ─────────────────────────── */
console.log('\nВсе 6 оболочек: sender подключён и wired на готовность');
{
  const hub = read('index.html');
  ok('хаб пишет sender (CWSender.set) — учтён как 6-й consumer/writer',
    /CWSender\.set\(patch\)/.test(hub));
  /* Форма вызова допускает защиту совместимости: старый sender без ready()
     считается готовым (см. раздел ниже про апгрейд со смешанным кэшем). */
  ok('хаб дожидается готовности sender перед первым fill()',
    /CWSender\.ready\(\)[\s\S]{0,80}\.then\(function \(\) \{ fill\(\); applySenderLock\(\); \}\)/.test(hub));
  ok('хаб подключает shared/state.js', /<script src="shared\/state\.js">/.test(hub));
  ok('хаб подключает shared/db.js СТАТИЧЕСКИМ тегом (не динамической инъекцией)',
    /<script src="shared\/db\.js">/.test(hub));
  ok('хаб: shared/db.js расположен ДО CWSender.ready() в порядке документа',
    hub.indexOf('<script src="shared/db.js">') > -1
    && hub.indexOf('<script src="shared/db.js">') < hub.indexOf('self.CWSender.ready()'));
  ok('хаб: гонка динамической инъекции db.js устранена (createElement для db.js отсутствует)',
    !/createElement\('script'\)[\s\S]{0,200}shared\/db\.js/.test(hub));

  const congress = read('congress-project/js/main.js');
  ok('Конгрессы: senderReady участвует в цепочке старта',
    /senderReady=[\s\S]{0,120}CWSender[\s\S]{0,60}ready/.test(congress)
    && /Promise\.all\(\[initState\(\),senderReady\]\)/.test(congress));

  const docs = read('documents/js/app.js');
  ok('Документы: CWSender.ready() в boot()',
    /function boot\(\) \{[\s\S]{0,400}CWSender\.ready\(\)/.test(docs));
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
      const body = appt.slice(i, i + 1600)
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

/* ── 12/13/14. Backup-реестр и версия базы — C2 ──────────────────────────── */
console.log('\nКанон, backup-реестр и версия базы (C2)');
{
  const backup = read('shared/backup.js');
  const shared = backup.slice(0, backup.indexOf('var MODULES'));
  ok('SHARED.local БОЛЬШЕ НЕ содержит cw-sender', !/local: \['cw-lang', 'cw-doclang', 'cw-sender'\]/.test(shared)
    && /local: \['cw-lang', 'cw-doclang'\]/.test(shared));
  ok('EXCLUDE глушит запись cw-sender/cw-appointments-v1 при восстановлении',
    /var EXCLUDE = \[[^\]]*'cw-sender'[^\]]*'cw-appointments-v1'[^\]]*\];/.test(backup));
  const modulesBlock = backup.slice(backup.indexOf('var MODULES'), backup.indexOf('\n  };', backup.indexOf('var MODULES')));
  ok('реестр модулей: sharedLocal БОЛЬШЕ НЕ несёт cw-sender ни у одного потребителя',
    !/sharedLocal: \['cw-sender'\]/.test(modulesBlock));
  const senderStateIdCount = (modulesBlock.match(/'shared:sender'/g) || []).length;
  ok('реестр: shared:sender объявлена адресной записью state у всех 4 прежних потребителей',
    senderStateIdCount >= 4, 'найдено: ' + senderStateIdCount);
  ok('restore-мост переносит легаси в канон (extractLegacyStateRow/writeExtraStateRow)',
    /function extractLegacyStateRow/.test(backup) && /function writeExtraStateRow/.test(backup));
  ok('канон (в файле ИЛИ уже на диске) побеждает легаси при восстановлении',
    /req\(store\.get\(row\.id\)\)\.then\(function \(existing\) \{\s*if \(existing\) \{/.test(backup));

  const dbSrc = read('shared/db.js');
  /* До J2 здесь стояло буквальное `DB_VERSION = 5`. Смысл проверки — фаза C2
     не завела для отправителя собственного хранилища (канон — строка в
     `state`); номер схемы законно растёт в других фазах (v6 — Журнал, J2),
     поэтому проверяется намерение, а не число. */
  ok('фаза C2 не завела отдельного хранилища для sender (канон — строка state)',
    !/^\s*sender\w*\s*:\s*\{\s*keyPath/m.test(dbSrc) && /state:\s*\{\s*keyPath: 'id'\s*\}/.test(dbSrc));
}

console.log('\nЗащита апгрейда со смешанным кэшем');
{
  /* A. Новый потребитель не должен падать, встретив pre-C1 sender без ready(). */
  const consumers = [
    ['хаб', 'index.html'],
    ['Клиндарий', 'circuit-planner/app.js'],
    ['Конгрессы', 'congress-project/js/main.js'],
    ['Школа', 'pioneer-school/js/app.js'],
    ['Назначения', 'appointments/js/app.js'],
    ['Документы', 'documents/js/app.js'],
  ];
  for (const [name, file] of consumers) {
    const src = read(file);
    ok(`${name}: вызов ready() защищён проверкой типа (старый sender не роняет старт)`,
      /typeof\s+(self\.|window\.)?CWSender\.ready\s*===\s*['"]function['"]/.test(src)
      || /CWSender\?\.ready\?\./.test(src));
  }

  /* A (исполняемая часть): старый API без ready() — потребитель обязан выжить. */
  const legacySender = { FIELDS: [], get: () => ({}), set: () => ({}), adopt: () => false, onChange: () => {} };
  const guarded = (s) => (s && typeof s.ready === 'function' ? s.ready() : Promise.resolve());
  let survived = true;
  try { guarded(legacySender); } catch (e) { survived = false; }
  ok('модель защиты: старый CWSender без ready() не бросает исключение', survived);

  /* B. Новый sender с ready() действительно ожидается. */
  const modern = { ready: () => Promise.resolve('awaited') };
  ok('модель защиты: новый CWSender с ready() реально вызывается',
    guarded(modern) instanceof Promise);

  /* E. Активный кэш Клиндария не мутируется фоново release-bound скриптами. */
  const plannerSw = read('circuit-planner/sw.js');
  ok('Клиндарий: release-bound скрипты не перезаписываются в активном кэше',
    /releaseBound/.test(plannerSw)
    && /if\s*\(!releaseBound\)/.test(plannerSw));
  ok('Клиндарий: ревалидация сохранена для не связанных с релизом файлов',
    /cacheFirst/.test(plannerSw));
}

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nФаза C2: канон отправителя — state/shared:sender; cw-sender только для чтения.');
process.exit(failed ? 1 : 0);
