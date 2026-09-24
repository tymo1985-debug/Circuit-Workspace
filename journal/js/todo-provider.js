/**
 * Журнал — поставщик задач для общего To Do (J9c).
 *
 * Подключает задачи Журнала к shared/todo.js (CWTodo) через публичную границу
 * CWJournal.integration: только чтение, сырые строки без раскрытия J8 (у
 * защищённой задачи text = null и при разблокированном Журнале). Задачи
 * по-прежнему живут в journalEntries (type 'todo') и меняются только через
 * CWJournal.tasks на экранах Журнала. Ссылка — #tasks/<id> через
 * CWJournalRoute.build.task, без ручной сборки строки.
 *
 * Свежесть без опроса: CWJournal.integration.onChange — изменения в этой
 * вкладке и в соседних (BroadcastChannel, без постоянного следа).
 */
(function (global) {
  'use strict';

  var PAGE = '../journal/index.html';
  if (!global.CWTodo || !global.CWJournal || !global.CWJournal.integration || !global.CWJournalRoute) return;
  var I = global.CWJournal.integration;

  global.CWTodo.register({
    module: 'journal',
    list: function () { return I.tasks(); },
    ref: function (id) { return global.CWJournal.urn.entry(id); },
    urlFor: function (id) { return PAGE + global.CWJournalRoute.build.task(id); },
    /* Эта вкладка и соседние — один подписчик (BroadcastChannel внутри). */
    subscribe: function (onChange) { return I.onChange(onChange); },
  });
})(typeof self !== 'undefined' ? self : this);
