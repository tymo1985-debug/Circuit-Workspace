#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-all.mjs
 *
 * Единая точка прогона всех проверок перед выпуском.
 *
 * ЗАЧЕМ. Проверок стало больше одной, и запускать их по памяти поштучно —
 * значит рано или поздно забыть одну именно в тот раз, когда она бы поймала
 * ошибку. Здесь один запуск, общая сводка и ненулевой код возврата, если
 * провалилась хотя бы одна проверка.
 *
 *   node scripts/check-all.mjs
 *
 * КАК ДОБАВИТЬ ПРОВЕРКУ. Дописать объект в CHECKS ниже. Правило отбора:
 * сюда попадает то, что уже ломалось повторно, а не всё, что теоретически
 * можно проверить. Список кандидатов с обоснованием — в IDEAS.md, раздел
 * «Архитектура».
 *
 * ЗАВИСИМОСТИ. Часть проверок требует npm-пакетов (jsdom, jspdf). В репозитории
 * нет package.json — это осознанно, проект собирается без сборки. Поэтому
 * отсутствие пакета здесь не выдаётся за провал проверки: он показывается
 * отдельным статусом ПРОПУЩЕНА с готовой командой установки. Провал и
 * «не смогли проверить» — разные вещи, и смешивать их опасно: во втором
 * случае никто ничего не гарантировал.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const CHECKS = [
  {
    file: 'check-versions.mjs',
    title: 'Согласованность версий',
    why: 'версия внутри модуля, CW_MODULES и CW_VERSION должны совпадать',
    deps: [],
  },
  {
    file: 'check-doclang.mjs',
    title: 'Язык документов Школы пионеров',
    why: 'язык документа не зависит от языка интерфейса; текст доезжает до PDF без потерь',
    deps: ['jsdom', 'jspdf'],
  },
  {
    file: 'check-backup.mjs',
    title: 'Резервное копирование',
    why: 'копия модуля везёт нужные части общего слоя; её восстановление не стирает данные соседей',
    deps: ['fake-indexeddb'],
  },
];

const PASS = 'ПРОЙДЕНА';
const FAIL = 'ПРОВАЛЕНА';
const SKIP = 'ПРОПУЩЕНА';

/** Пакет доступен для импорта? Проверяем именно импортом, а не наличием папки:
 *  node_modules может существовать с битым/частичным содержимым. */
async function hasDep(name) {
  try {
    await import(name);
    return true;
  } catch {
    return false;
  }
}

async function run() {
  const results = [];

  for (const check of CHECKS) {
    const missing = [];
    for (const dep of check.deps) {
      if (!(await hasDep(dep))) missing.push(dep);
    }

    console.log(`\n${'─'.repeat(72)}`);
    console.log(`▶ ${check.title}`);
    console.log(`  ${check.why}`);
    console.log('─'.repeat(72));

    if (missing.length) {
      console.log(`  Нет пакетов: ${missing.join(', ')}`);
      console.log(`  Установить:  npm install ${missing.join(' ')}`);
      results.push({ ...check, status: SKIP, missing });
      continue;
    }

    const res = spawnSync(process.execPath, [join(HERE, check.file)], {
      stdio: 'inherit',
      cwd: join(HERE, '..'),
    });
    results.push({ ...check, status: res.status === 0 ? PASS : FAIL });
  }

  console.log(`\n${'═'.repeat(72)}`);
  console.log('СВОДКА');
  console.log('═'.repeat(72));

  const width = Math.max(...results.map((r) => r.title.length));
  for (const r of results) {
    const mark = r.status === PASS ? '✓' : r.status === FAIL ? '✗' : '·';
    console.log(`  ${mark} ${r.title.padEnd(width)}  ${r.status}`);
  }

  const failed = results.filter((r) => r.status === FAIL);
  const skipped = results.filter((r) => r.status === SKIP);

  console.log('');
  if (failed.length) {
    console.log(`Провалено проверок: ${failed.length}. Выпускать нельзя.`);
  } else if (skipped.length) {
    console.log(
      `Провалов нет, но ${skipped.length} проверок не выполнено — ` +
        'установите пакеты и прогоните ещё раз, прежде чем выпускать.'
    );
  } else {
    console.log('Все проверки пройдены — можно выпускать.');
  }

  // Пропуск тоже даёт ненулевой код: «не проверили» не должно молча
  // проходить в CI или в чужой сессии как «всё хорошо».
  process.exit(failed.length ? 1 : skipped.length ? 2 : 0);
}

run().catch((err) => {
  console.error('check-all: непредвиденная ошибка');
  console.error(err);
  process.exit(1);
});
