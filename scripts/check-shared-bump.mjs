#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-shared-bump.mjs
 *
 * Правка файла общего слоя обязана сопровождаться патч-бампом каждого модуля,
 * который держит этот файл в прекэше и читает кэш БЕЗ фоновой ревалидации.
 *
 * ─── ПОЧЕМУ ЭТА ПРОВЕРКА ЗАВЕДЕНА ──────────────────────────────────────────
 *
 * Правило записано в AGENTS.md и в шапках всех service worker'ов, но до
 * 28.08.2026 его соблюдала только человеческая память. А цена забывчивости
 * несоразмерна: пять из шести оболочек читают свой кэш чистым cache-first —
 *
 *     const cached = await matchOwn(request);
 *     if (cached) return cached;        // сеть даже не опрашивается
 *
 * — и имя кэша содержит версию модуля. Значит правка `shared/db.js` без
 * подъёма версии модуля НЕ ДОЕДЕТ ДО ПОЛЬЗОВАТЕЛЯ НИКОГДА: он останется на
 * старой копии общего слоя до следующего бампа этого модуля, сколько бы
 * месяцев ни прошло. Отказ бесшумный — у разработчика всё работает, потому
 * что у него кэш свежий.
 *
 * Ровно этот класс уже ломался 11.08.2026 («старый app.js из кэша рядом с
 * новой разметкой») и описан в шапке shared/update.js как причина её
 * появления. С тех пор общий слой вырос до двух десятков файлов, а правки в
 * нём стали регулярными — три подряд за один только этот день.
 *
 * Это метапроверка: она не ловит ошибку в коде, она ловит НЕДОСТАВКУ любой
 * правки общего слоя, то есть умножает надёжность всех остальных.
 *
 * ─── ТРИ РЕШЕНИЯ, КОТОРЫЕ НЕЛЬЗЯ «УПРОСТИТЬ» ───────────────────────────────
 *
 * 1. ТРЕБОВАНИЕ ПРЕДЪЯВЛЯЕТСЯ ТОЛЬКО КЭШ-ФЁРСТ МОДУЛЯМ. У Клиндария
 *    stale-while-revalidate: он подхватит свежий общий слой сам, следующим
 *    открытием. Требовать бамп и с него значило бы приучать к бампу «на
 *    всякий случай», а проверка, которая иногда просит лишнего, перестаёт
 *    быть аргументом. Стратегия определяется по коду оболочки, а не по
 *    списку имён: список разошёлся бы с реальностью молча.
 *
 * 2. НОВЫЙ ФАЙЛ ОБЩЕГО СЛОЯ ИЗ ПРАВИЛА ИСКЛЮЧЁН. Файл, которого в прошлом
 *    коммите не было, не может лежать в старом кэше — доставать из кэша
 *    нечего. Обоснование уже записано в AGENTS.md.
 *
 * 3. СРАВНЕНИЕ ИДЁТ ПО ИМЕНИ ФАЙЛА, а не по строке пути. У Клиндария и
 *    Конгрессов прекэш записан по-разному (`../shared/x.js` против
 *    `./shared/x.js`), и сверка строк ловила бы форму записи вместо сути —
 *    та же причина, по которой так устроен check-shared-precache.mjs.
 *
 * ─── ГРАНИЦА ПРИМЕНИМОСТИ ──────────────────────────────────────────────────
 *
 * Проверке нужна история: она сравнивает рабочее дерево с предыдущим
 * коммитом. В `git clone --depth 1` предыдущего коммита нет, и тогда она
 * честно ПРОПУСКАЕТСЯ с кодом 2, а не «проходит». Разница принципиальная:
 * «не смогли проверить» и «проверили, всё хорошо» — разные вещи, и это же
 * правило действует для остальных проверок гейта.
 *
 * База сравнения переопределяется переменной окружения CW_BUMP_BASE
 * (например, `origin/main`) — это нужно и для CI, и для прогона на сломанном
 * входе.
 *
 *   node scripts/check-shared-bump.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Оболочки: путь к файлу SW и идентификатор модуля в CW_MODULES.
   Хаб идёт под ключом null — его версия живёт в CW_VERSION. */
const SHELLS = [
  { sw: 'service-worker.js', module: null, title: 'хаб' },
  { sw: 'congress-project/service-worker.js', module: 'congress-project', title: 'Конгрессы' },
  { sw: 'circuit-planner/sw.js', module: 'circuit-planner', title: 'Клиндарий' },
  { sw: 'pioneer-school/sw.js', module: 'pioneer-school', title: 'Школа' },
  { sw: 'appointments/sw.js', module: 'appointments', title: 'Назначения' },
  { sw: 'documents/sw.js', module: 'documents', title: 'Документы' },
];

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

function git(args) {
  /* stderr гасится намеренно: отсутствие HEAD~1 в мелком клоне — штатная
     ветка, а не сбой, и `fatal: ambiguous argument` в выводе гейта выглядел
     бы поломкой. Настоящие ошибки видны по брошенному исключению. */
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/* --- База сравнения ----------------------------------------------------- */
let base = process.env.CW_BUMP_BASE || '';
try {
  git(['rev-parse', '--git-dir']);
} catch {
  console.log('  · не git-репозиторий — проверить нечем');
  process.exit(2);
}
if (!base) {
  try { base = git(['rev-parse', 'HEAD~1']); } catch { base = ''; }
}
if (!base) {
  console.log('  · нет предыдущего коммита (мелкий клон) — проверка пропущена');
  console.log('    задать базу явно: CW_BUMP_BASE=origin/main node scripts/check-shared-bump.mjs');
  process.exit(2);
}

/* --- Что изменилось в общем слое ---------------------------------------- */
/* Только изменённые и удалённые: добавленный файл не может лежать в старом
   кэше, доставать из кэша нечего. */
let changedShared = [];
try {
  changedShared = git(['diff', '--name-only', '--diff-filter=MD', base, '--', 'shared/'])
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.log('  · сравнение с базой ' + base + ' не удалось: ' + e.message);
  process.exit(2);
}

console.log('\nБаза сравнения: ' + base);
if (!changedShared.length) {
  console.log('  · общий слой не менялся — требовать нечего');
  process.exit(0);
}
console.log('Изменено в общем слое: ' + changedShared.map((f) => basename(f)).join(', '));

/* --- Версии до и после -------------------------------------------------- */
function versionsFrom(source) {
  const sandbox = { self: {} };
  // eslint-disable-next-line no-new-func
  new Function('self', source)(sandbox.self);
  return { hub: sandbox.self.CW_VERSION || '', modules: sandbox.self.CW_MODULES || {} };
}
const now = versionsFrom(readFileSync(join(ROOT, 'shared/version.js'), 'utf8'));
let was;
try {
  was = versionsFrom(git(['show', base + ':shared/version.js']));
} catch (e) {
  console.log('  · shared/version.js в базе не прочитан: ' + e.message);
  process.exit(2);
}

/* --- Стратегия и прекэш каждой оболочки --------------------------------- */
/** Читает кэш без опроса сети? Признак — ранний возврат найденного в кэше
 *  без последующего fetch. Ревалидация опознаётся по самому вызову fetch()
 *  в той же ветке, а не по слову в комментарии. */
function isCacheFirst(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return !/revalidat/i.test(stripped);
}

/** Имена файлов общего слоя, перечисленных в прекэше оболочки. */
function precachedSharedNames(source) {
  const names = new Set();
  const re = /['"]([^'"\n]*shared\/[^'"\n]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) names.add(basename(m[1]));
  return names;
}

console.log('\nТребование патч-бампа');
const changedNames = changedShared.map((f) => basename(f));

SHELLS.forEach((shell) => {
  const path = join(ROOT, shell.sw);
  if (!existsSync(path)) { ok(shell.title + ': оболочка на месте', false, shell.sw + ' не найден'); return; }
  const source = readFileSync(path, 'utf8');

  if (!isCacheFirst(source)) {
    console.log('  · ' + shell.title + ': stale-while-revalidate — свежий общий слой подхватит сам');
    return;
  }

  const precached = precachedSharedNames(source);
  const touched = changedNames.filter((n) => precached.has(n));
  if (!touched.length) {
    console.log('  · ' + shell.title + ': изменённых файлов общего слоя нет в его прекэше');
    return;
  }

  const before = shell.module ? (was.modules[shell.module] || {}).version : was.hub;
  const after = shell.module ? (now.modules[shell.module] || {}).version : now.hub;
  ok(shell.title + ': версия поднята (' + touched.join(', ') + ')',
    !!after && after !== before,
    'версия осталась ' + (after || '—') + '; кэш-фёрст оболочка отдаст старую копию '
    + touched.join(', ') + ' и правка не доедет до пользователя никогда');
});

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nПатч-бамп соблюдён для всех затронутых модулей.');
process.exit(failed ? 1 : 0);
