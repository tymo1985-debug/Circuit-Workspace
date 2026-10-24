/**
 * Circuit Workspace — shared/summary.js
 * Сводка модуля для хаба («Сегодня», визуальный аудит 24.10.2026, Ф5).
 *
 * ЗАЧЕМ. Хаб показывает идущее/ближайшее посещение и ближайший конгресс, но
 * ни один модуль не читает хранилище другого (ARCHITECTURE.md, раздел 6).
 * Поэтому модуль сам публикует маленькую производную запись — то, что хабу
 * нужно, и ничего больше, — а хаб читает только её. Схемы модулей хабу не
 * известны, и правка модуля не может молча сломать главную.
 *
 * ГДЕ. localStorage `cw-summary:<id модуля>` — синхронно на первой
 * отрисовке хаба (тот же довод, что у `cw-sender`). Запись производная:
 * в резервную копию не входит, модуль пересоздаёт её при открытии.
 *
 * КОГДА ПИШЕТ МОДУЛЬ. После подтверждённой записи своего состояния, при
 * загрузке и при принятии состояния соседней вкладки — то есть всегда, когда
 * меняется то, что лежит в базе. «Сколько дней осталось» хаб считает сам от
 * дат, поэтому сводка не устаревает от одного течения времени.
 *
 * ДОГОВОР (версия 1; новое поле — не повод для новой версии, переименование —
 * повод). Даты — строки `ГГГГ-ММ-ДД`.
 *   circuit-planner:  { visits: [{ title, start, end }] }
 *     посещения собраний/групп с концом ≥ сегодня на момент записи,
 *     по дате начала, не больше 10;
 *   congress-project: { congresses: [{ name, place, date, responseDeadline }] }
 *     конгрессы с датой ≥ сегодня, по дате, не больше 5.
 * Проверяет `scripts/check-summary.mjs`.
 */
(function () {
  var PREFIX = 'cw-summary:';
  var VERSION = 1;

  function publish(id, data) {
    try {
      localStorage.setItem(PREFIX + id, JSON.stringify({ v: VERSION, at: new Date().toISOString(), data: data }));
    } catch (e) { /* хранилище недоступно — хаб просто не покажет карточку */ }
  }

  function read(id) {
    try {
      var rec = JSON.parse(localStorage.getItem(PREFIX + id) || 'null');
      return rec && rec.v === VERSION && rec.data ? rec : null;
    } catch (e) { return null; }
  }

  /** Сегодняшняя дата строкой ГГГГ-ММ-ДД по местному времени. */
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  self.CWSummary = { publish: publish, read: read, today: today, PREFIX: PREFIX, VERSION: VERSION };
})();
