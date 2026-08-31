#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-sri.mjs
 *
 * Каждый внешний скрипт в разметке обязан иметь `integrity` и `crossorigin`,
 * и хеш обязан совпадать с записанным в `scripts/sri-lock.json`.
 *
 * ─── ПОЧЕМУ ЭТО МОЖНО ПРОВЕРЯТЬ БЕЗ СЕТИ ───────────────────────────────────
 *
 * Версия на cdnjs и на jsdelivr неизменяема после публикации — это прямо
 * заявленный ими контракт, на нём же построено кэширование на 355 дней.
 * Значит однажды снятый хеш верен для этого адреса навсегда, и сверять его с
 * сетью при каждом прогоне незачем.
 *
 * Опасность ровно одна и она офлайновая: **кто-то поднимает версию библиотеки
 * в адресе и не трогает хеш**. Тогда браузер откажется исполнять скрипт, и
 * выгрузка PDF умрёт разом в двух модулях — причём не у того, кто правил
 * (у него в кэше старый файл), а у пользователя. Замок ловит ровно это.
 *
 * Второй случай — новый внешний тег без `integrity` вообще: так семь тегов и
 * прожили до 28.08.2026.
 *
 * ─── ЧТО ДЕЛАТЬ, КОГДА ПРОВЕРКА КРАСНЕЕТ ───────────────────────────────────
 *
 * Это не повод править замок руками. Нужен новый хеш с живого CDN:
 *
 *     node scripts/build-sri.mjs           # напечатать готовые теги
 *     node scripts/build-sri.mjs --lock    # обновить sri-lock.json
 *
 * Хеш обязан сниматься с байтов CDN, а не с копии из npm: jsdelivr раздаёт
 * пакет как есть, cdnjs пересобирает свою копию сам. Совпадение вероятно, но
 * гарантии нет, а цена ошибки — заблокированный браузером скрипт.
 *
 * ─── ЧЕГО ПРОВЕРКА НЕ ДЕЛАЕТ ───────────────────────────────────────────────
 *
 * Не видит адресов, подставляемых из JS строкой (`GlobalWorkerOptions.workerSrc`
 * у pdf.js). Для них `integrity` не существует в принципе, и единственный
 * ответ — держать файл в репозитории; воркер там и лежит. Поэтому здесь же
 * отдельно проверяется, что воркер НЕ вернулся на CDN.
 *
 *   node scripts/check-sri.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PAGES = [
  'index.html',
  'circuit-planner/index.html',
  'congress-project/index.html',
  'pioneer-school/index.html',
  'pioneer-school/register.html',
  'appointments/index.html',
  'documents/index.html',
];

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

const lockPath = join(ROOT, 'scripts/sri-lock.json');
if (!existsSync(lockPath)) {
  console.log('  ✗ нет scripts/sri-lock.json — снять хеши: node scripts/build-sri.mjs --lock');
  process.exit(1);
}
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

/* Теги <script> с абсолютным адресом. Разбор построчный намеренно: полный
   парсер HTML здесь не нужен, а лишняя зависимость в проекте без сборки —
   нужна ещё меньше. */
const TAG = /<script\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi;

console.log('\nВнешние скрипты в разметке');
let seen = 0;

for (const page of PAGES) {
  const path = join(ROOT, page);
  if (!existsSync(path)) continue;
  const html = readFileSync(path, 'utf8');
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html)) !== null) {
    seen++;
    const tag = m[0];
    const url = m[1];
    const short = page + ' · ' + url.split('/').pop();

    const integrity = /\bintegrity\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!integrity) {
      ok(short + ': есть integrity', false,
        'внешний скрипт без integrity — единственный путь, которым в приложение попадает чужой код;\n'
        + '      снять хеш: node scripts/build-sri.mjs');
      continue;
    }
    ok(short + ': есть integrity', true);

    ok(short + ': есть crossorigin',
      /\bcrossorigin\s*=/i.test(tag),
      'без crossorigin браузер не сможет проверить ответ и просто заблокирует скрипт');

    const expected = lock[url];
    if (!expected) {
      ok(short + ': адрес записан в замке', false,
        'адрес не найден в scripts/sri-lock.json — вероятно, поднята версия библиотеки;\n'
        + '      обновить замок с живого CDN: node scripts/build-sri.mjs --lock');
      continue;
    }
    ok(short + ': хеш совпадает с замком', integrity[1] === expected,
      'в разметке ' + integrity[1] + '\n      в замке    ' + expected);
  }
}

/* Ноль внешних скриптов — ЛУЧШЕЕ состояние, а не поломка разбора (29.08.2026).
   Библиотеки переехали в shared/vendor, и CDN из проекта ушёл целиком:
   `integrity` защищал от подмены содержимого, но не от недоступности.
   Проверка при этом не становится бессмысленной — она сторожит возврат:
   первый же новый внешний тег обязан прийти с хешем и попасть в замок. */
if (seen === 0) {
  console.log('  · внешних скриптов нет — весь код приходит из репозитория');
} else {
  console.log('  · внешних скриптов: ' + seen + ' (все обязаны иметь integrity и стоять в замке)');
}

/* Воркер pdf.js: `integrity` для него не существует, защита одна — свой файл. */
console.log('\nВоркер pdf.js');
/* 30.08.2026: адрес переехал из инлайнового скрипта index.html в
   js/pdfstack.js — pdf.js теперь догружается по кнопке, и объявить workerSrc
   раньше, чем появится window.pdfjsLib, нельзя. Проверка ищет его в обоих
   местах: суть требования не изменилась, изменилось только место записи. */
const schoolFiles = ['pioneer-school/js/pdfstack.js', 'pioneer-school/index.html']
  .map((f) => join(ROOT, f)).filter((f) => existsSync(f));
if (schoolFiles.length) {
  const html = schoolFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
  const src = /workerSrc\s*=\s*["']([^"']+)["']/.exec(html);
  ok('адрес воркера задан', !!src);
  if (src) {
    ok('воркер берётся из репозитория, а не с CDN',
      !/^https?:/i.test(src[1]),
      'адрес подставляется строкой, а не тегом, поэтому integrity его не защищает;\n'
      + '      единственный ответ — держать файл у себя. Сейчас: ' + src[1]);
    ok('файл воркера на месте',
      !/^https?:/i.test(src[1]) && existsSync(join(ROOT, 'pioneer-school', src[1])),
      'pioneer-school/' + src[1]);
    /* Версия воркера обязана совпадать с pdf.min.js: pdf.js отказывается
       работать с воркером другой версии, и разошлись бы они молча. */
    ok('воркер лежит рядом с самой библиотекой',
      src[1].includes('vendor/'), src[1]);
  }
}

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nВсе внешние скрипты подписаны и совпадают с замком.');
process.exit(failed ? 1 : 0);
