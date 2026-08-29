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
    file: 'check-escape.mjs',
    title: 'Экранирование в одном слое',
    why: 'функция безопасности в нескольких редакциях расходится молча; значения в html-шаблон идут в innerHTML и в окно печати',
    deps: [],
  },
  {
    file: 'check-sri.mjs',
    title: 'Подписи внешних скриптов',
    why: 'внешний скрипт без integrity — единственный путь для чужого кода; смена версии без хеша ломает PDF',
    deps: [],
  },
  {
    file: 'check-shared-bump.mjs',
    title: 'Патч-бамп при правке общего слоя',
    why: 'кэш-фёрст оболочка без подъёма версии не отдаст новый shared/* никогда',
    deps: [],
  },
  {
    file: 'check-doclang.mjs',
    title: 'Язык документов Школы пионеров',
    why: 'язык документа не зависит от языка интерфейса; текст доезжает до PDF без потерь',
    deps: ['jsdom', 'jspdf'],
  },
  {
    file: 'check-i18n-shadow.mjs',
    title: 'Затенение функции перевода',
    why: 'переменная задачи по имени t перекрывает импорт t() и роняет весь экран',
    deps: ['acorn', 'acorn-walk'],
  },
  {
    file: 'check-i18n-dupes.mjs',
    title: 'Повторы ключей в словаре',
    why: 'в объектном литерале побеждает последнее значение — дубль молча подменяет текст соседа',
    deps: [],
  },
  {
    file: 'check-i18n-coverage.mjs',
    title: 'Покрытие словарей по языкам',
    why: 'ключ, заведённый не во всех языках, не даёт ошибки — CWI18n.t() молча падает в русский; долг перевода обязан считаться сканером, а не помниться записью в TODO',
    deps: [],
  },
  {
    file: 'check-i18n-placeholders.mjs',
    title: 'Переменные в переводах',
    why: 'потерянный {n} или {{sender.name}} не даёт ошибки — строка просто уходит человеку без числа или без имени',
    deps: [],
  },
  {
    file: 'check-inline-lang-tables.mjs',
    title: 'Языковые таблицы в коде',
    why: 'язык модуля не исчерпывается каталогом i18n/: таблица с кодами языков в ключах живёт и в app.js, и там немецкого не было',
    deps: ['acorn', 'acorn-walk'],
  },
  {
    file: 'check-css-vars.mjs',
    title: 'Необъявленные CSS-переменные',
    why: 'неразрешимая var() делает объявление недействительным — рамки уходят в currentColor, а в тёмной теме этого не видно вовсе',
    deps: [],
  },
  {
    file: 'check-shared-precache.mjs',
    title: 'Прекэш общего слоя',
    why: 'файл общего слоя, подключённый в разметке, обязан лежать и в прекэше SW — иначе офлайн его нет',
    deps: [],
  },
  {
    file: 'check-sw-cache-scope.mjs',
    title: 'Область кэша service worker',
    why: 'Cache Storage общий на origin: глобальный caches.match() мог отдать модулю копию общего файла из кэша соседа, обесценивая патч-бамп',
    deps: [],
  },
  {
    file: 'check-manifests.mjs',
    title: 'Манифесты: область и идентичность',
    why: 'scope разрешается от адреса манифеста, а id — от ORIGIN: относительный id молча делает идентичностью корень сайта, и два приложения считаются одним',
    deps: [],
  },
  {
    file: 'check-hub-tiles.mjs',
    title: 'Плитки хаба и реестр',
    why: 'плитка без записи в CW_MODULES теряет версию молча, модуль без плитки негде открыть; с 28.08.2026 число плиток задаёт ещё и раскладку платы',
    deps: [],
  },
  {
    file: 'check-orphan-classes.mjs',
    title: 'Классы без правил',
    why: 'класс из разметки без единого правила не даёт ни ошибки, ни следа: элемент молча проваливается на чужой стиль или остаётся вовсе неоформленным',
    deps: [],
  },
  {
    file: 'check-print-ready.mjs',
    title: 'Старт печати документа',
    why: 'печать ломалась трижды и все три раза молча — бумага выходила и выглядела как успех; здесь проверяется, что документ уходит в печать по готовности окна и ровно один раз',
    deps: [],
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
    /* Код 2 от самой проверки — «выполнить не удалось», а не провал. Так
       отвечает check-shared-bump.mjs в мелком клоне, где нет предыдущего
       коммита: сравнивать не с чем. Считать это провалом значило бы
       заваливать гейт на пустом месте, а считать успехом — выдавать
       непроверенное за проверенное. Оба варианта хуже отдельного статуса. */
    var code = res.status;
    results.push({ ...check, status: code === 0 ? PASS : code === 2 ? SKIP : FAIL });
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
        'доставьте недостающее (пакеты или историю git) и прогоните ещё раз.'
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
