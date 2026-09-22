#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-shell-bump.mjs
 *
 * ПОЧЕМУ ЭТА ПРОВЕРКА ПОЯВИЛАСЬ. `check-shared-bump.mjs` следит только за
 * `shared/*`. В релизе C1 изменился `circuit-planner/app.js` — файл САМОЙ
 * оболочки, лежащий в её прекэше, — а версия Клиндария осталась 9.94.11.
 * Новый service worker поэтому не установился вовсе, старый продолжил
 * обслуживать свой кэш, и до пользователя правка не доехала. Хуже: активный
 * worker дописывал в свой же кэш свежие файлы по одному, и страница получала
 * смесь поколений (новый app.js + старый shared/sender.js → падение на
 * `CWSender.ready is not a function`).
 *
 * ПРАВИЛО: если изменился файл, который оболочка прекэширует и который
 * принадлежит ей самой (не `shared/*` — за ним следит соседняя проверка),
 * версия этой оболочки в `CW_MODULES` обязана измениться в том же релизе.
 *
 * Список файлов берётся из самого service worker'а, а не хардкодится: иначе
 * проверка устареет при первом же новом файле в прекэше.
 *
 *   CW_BUMP_BASE=origin/main node scripts/check-shell-bump.mjs
 *
 * Код 2 («не смогли проверить») — когда нет базы сравнения: в мелком клоне
 * сравнивать не с чем, и это не провал.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const SHELLS = [
  { id: 'circuit-planner',  dir: 'circuit-planner',  sw: 'circuit-planner/sw.js' },
  { id: 'congress-project', dir: 'congress-project', sw: 'congress-project/service-worker.js' },
  { id: 'pioneer-school',   dir: 'pioneer-school',   sw: 'pioneer-school/sw.js' },
  { id: 'appointments',     dir: 'appointments',     sw: 'appointments/sw.js' },
  { id: 'documents',        dir: 'documents',        sw: 'documents/sw.js' },
  { id: 'journal',          dir: 'journal',           sw: 'journal/sw.js' },
];

const base = process.env.CW_BUMP_BASE || '';
let changed = [];
try {
  /* Сравнение идёт с РАБОЧИМ ДЕРЕВОМ, а не с HEAD: цель проверки — поймать
     недостающий бамп ПЕРЕД сборкой релизного ZIP, а несохранённые правки
     на этот момент обычно ещё не закоммичены (тот же случай, что уже решён
     в check-shared-bump.mjs — там сравнение всегда шло с деревом). `git
     diff --name-only <base>` без второго аргумента-ревизии сравнивает
     дерево (включая незакоммиченное и проиндексированное) с базой; когда
     дерево чистое и совпадает с HEAD (обычный CI), результат тот же, что
     и раньше — поведение для чистых деревьев не меняется. */
  const out = execFileSync('git', ['diff', '--name-only', base || 'HEAD~1'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  changed = out.split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.log('  · нет базы сравнения (мелкий клон) — проверка пропущена');
  console.log('    задать базу явно: CW_BUMP_BASE=origin/main node scripts/check-shell-bump.mjs');
  process.exit(2);
}

/** Версии модулей до и после — из shared/version.js обеих ревизий. */
function versionsAt(ref) {
  const src = ref === null
    ? read('shared/version.js')
    : execFileSync('git', ['show', `${ref}:shared/version.js`], { cwd: ROOT, encoding: 'utf8' });
  const out = {};
  for (const m of src.matchAll(/'([a-z-]+)':\s*\{[^}]*version:\s*'([^']+)'/g)) out[m[1]] = m[2];
  return out;
}

const before = versionsAt(base || 'HEAD~1');
const after = versionsAt(null);

/** Пути из прекэша конкретного SW, принадлежащие самой оболочке. */
function ownPrecached(shell) {
  const sw = read(shell.sw);
  const paths = [...sw.matchAll(/'(\.\.?\/[^']+\.(?:js|css|html|webmanifest))'/g)].map((m) => m[1]);
  const own = new Set();
  for (const p of paths) {
    if (p.includes('/shared/')) continue;            // за общим слоем следит соседняя проверка
    if (p.includes('/vendor/') || p.includes('/fonts/')) continue;
    own.add(`${shell.dir}/${p.replace(/^\.\//, '')}`);
  }
  own.add(shell.sw);                                  // сам worker тоже связан с релизом
  return own;
}

console.log('\nТребование бампа при правке файлов самой оболочки');
let failed = 0;
for (const shell of SHELLS) {
  const own = ownPrecached(shell);
  const touched = changed.filter((f) => own.has(f));
  if (!touched.length) {
    console.log(`  · ${shell.id}: собственные файлы прекэша не менялись`);
    continue;
  }
  const bumped = before[shell.id] !== after[shell.id];
  if (bumped) {
    console.log(`  ✓ ${shell.id}: версия поднята (${touched.join(', ')})`);
  } else {
    failed++;
    console.log(`  ✗ ${shell.id}: изменены ${touched.join(', ')}, а версия осталась ${after[shell.id]}`
      + ' — новый service worker не установится, правка не доедет до пользователя');
  }
}

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nБамп соблюдён для всех затронутых оболочек.');
process.exit(failed ? 1 : 0);
