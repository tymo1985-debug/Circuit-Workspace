/**
 * Circuit Workspace — shared/dates.js
 *
 * «Сегодня» и календарная дата ПО МЕСТНОМУ ВРЕМЕНИ устройства (аудит 03, P2-2).
 *
 * ЗАЧЕМ. Короткая запись «сегодня» через toISOString() с обрезкой до десяти
 * символов даёт дату по UTC. Между
 * полуночью и 02:00 летом (зимой — до 01:00) по Берлину/Праге/Варшаве это
 * вчерашнее число: письмо уходило со вчерашней датой, а «отправлено» ставилось
 * задним числом. Здесь дата собирается из локальных `getFullYear/Month/Date`.
 *
 * ПРАВИЛО. «Сегодня» и дата-для-человека берутся только отсюда. Дата из
 * `toISOString().slice(0, 10)` допустима лишь для момента, который и так
 * хранится в UTC; для «сегодня» её запрещает `scripts/check-local-today.mjs`.
 *
 * API: `CWDates.today()` → 'YYYY-MM-DD'; `CWDates.fromDate(date)` — то же для
 * заданной даты (имя файла копии, ключ дня). Неверная дата → ''.
 */
(function (root) {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fromDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function today() { return fromDate(new Date()); }

  root.CWDates = { today: today, fromDate: fromDate };
})(self);
