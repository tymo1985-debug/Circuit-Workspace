/**
 * Журнал — словарь модуля.
 *
 * ГРАНИЦА (та же, что в остальных модулях — см. appointments/i18n/dict.js):
 * здесь переводится только ОБОЛОЧКА интерфейса — навигация, заголовки
 * секций, статусы, подписи кнопок. Содержимое самих записей (заметки,
 * названия районов и собраний, даты, конкретные вопросы и задачи) — это
 * будущие пользовательские данные на языке пользователя, а не текст
 * оболочки, и не переводится. Тот же принцип, что у текста письма в
 * Назначениях: готовый документ остаётся на своём языке, оболочка вокруг
 * него — на языке интерфейса.
 *
 * В J1 это разделение видно на статических фикстурах: «EU-K-03», «Северное»,
 * «Уточнить, как идёт изучение…» — данные фикстуры, их не переводим;
 * «К следующим посещениям», «Открытые задачи», «Обзор» — оболочка,
 * переводится на все пять языков.
 *
 * Название и описание модуля — в shared/i18n/common.js
 * (module.journal.title/desc), как у всех модулей.
 */
(function (global) {
  'use strict';

  if (!global.CWI18n) {
    console.error('journal/i18n/dict.js подключён раньше shared/i18n.js');
    return;
  }

  global.CWI18n.register({

    ru: {
      'j.nav.overview': 'Обзор',
      'j.nav.districts': 'Районы',
      'j.nav.tasks': 'Задачи',
      'j.nav.search': 'Поиск',
      'j.nav.archive': 'Архив',

      'j.section.upcoming': 'К следующим посещениям',
      'j.section.tasks_open': 'Открытые задачи',
      'j.section.projects': 'Проекты района',
      'j.section.recent_visits': 'Последние посещения',
      'j.section.recent_edits': 'Недавно изменённые',

      'j.link.all': 'Все',
      'j.link.history': 'История',
      'j.link.open': 'Открыть',

      'j.fab.new_entry': 'Новая запись',
      'j.fab.new_congregation': 'Собрание',

      'j.locked.title': 'Защищённая запись',
      'j.locked.hint': 'содержимое скрыто',

      'j.district.kind': 'Район',
      'j.district.subtitle': 'собственные записи, проекты и задачи',
      'j.card.district_entries_title': 'Записи уровня района',
      'j.card.district_entries_hint': 'Район — самостоятельный рабочий объект: у него свои проекты, заметки и задачи, не привязанные ни к одному собранию.',
      'j.card.congregations_title': 'Собрания и группы',
      'j.tab.congregations': 'Собрания',
      'j.tab.entries': 'Записи',

      'j.badge.archive': 'архив',
      'j.badge.visit_open': 'визит открыт',
      'j.status.in_progress': 'идёт сейчас',
      'j.state.no_visit_yet': 'Первое посещение не проводилось',
      'j.label.last_visit': 'Последний визит:',
      'j.label.next_visit': 'след.',

      'j.placeholder.title': 'Экран появится в следующей фазе',
      'j.placeholder.text': 'В этой версии Журнала ещё нет данных — только оболочка и две демонстрационные фикстуры (Обзор и Районы).',
    },

    uk: {
      'j.nav.overview': 'Огляд',
      'j.nav.districts': 'Округи',
      'j.nav.tasks': 'Завдання',
      'j.nav.search': 'Пошук',
      'j.nav.archive': 'Архів',

      'j.section.upcoming': 'До наступних відвідувань',
      'j.section.tasks_open': 'Відкриті завдання',
      'j.section.projects': 'Проєкти округу',
      'j.section.recent_visits': 'Останні відвідування',
      'j.section.recent_edits': 'Нещодавно змінені',

      'j.link.all': 'Усі',
      'j.link.history': 'Історія',
      'j.link.open': 'Відкрити',

      'j.fab.new_entry': 'Новий запис',
      'j.fab.new_congregation': 'Збір',

      'j.locked.title': 'Захищений запис',
      'j.locked.hint': 'вміст приховано',

      'j.district.kind': 'Округ',
      'j.district.subtitle': 'власні записи, проєкти та завдання',
      'j.card.district_entries_title': 'Записи рівня округу',
      'j.card.district_entries_hint': 'Округ — самостійний робочий об’єкт: у нього власні проєкти, нотатки та завдання, не прив’язані до жодного збору.',
      'j.card.congregations_title': 'Збори і групи',
      'j.tab.congregations': 'Збори',
      'j.tab.entries': 'Записи',

      'j.badge.archive': 'архів',
      'j.badge.visit_open': 'візит відкрито',
      'j.status.in_progress': 'триває зараз',
      'j.state.no_visit_yet': 'Перше відвідування ще не проводилось',
      'j.label.last_visit': 'Останній візит:',
      'j.label.next_visit': 'наст.',

      'j.placeholder.title': 'Екран з’явиться в наступній фазі',
      'j.placeholder.text': 'У цій версії Журналу ще немає даних — лише оболонка і дві демонстраційні фікстури (Огляд і Округи).',
    },

    en: {
      'j.nav.overview': 'Overview',
      'j.nav.districts': 'Circuits',
      'j.nav.tasks': 'Tasks',
      'j.nav.search': 'Search',
      'j.nav.archive': 'Archive',

      'j.section.upcoming': 'For the next visits',
      'j.section.tasks_open': 'Open tasks',
      'j.section.projects': 'Circuit projects',
      'j.section.recent_visits': 'Recent visits',
      'j.section.recent_edits': 'Recently edited',

      'j.link.all': 'All',
      'j.link.history': 'History',
      'j.link.open': 'Open',

      'j.fab.new_entry': 'New entry',
      'j.fab.new_congregation': 'Congregation',

      'j.locked.title': 'Protected entry',
      'j.locked.hint': 'content hidden',

      'j.district.kind': 'Circuit',
      'j.district.subtitle': 'own entries, projects and tasks',
      'j.card.district_entries_title': 'Circuit-level entries',
      'j.card.district_entries_hint': 'A circuit is a working object in its own right: it has its own projects, notes and tasks that aren\u2019t tied to any one congregation.',
      'j.card.congregations_title': 'Congregations and groups',
      'j.tab.congregations': 'Congregations',
      'j.tab.entries': 'Entries',

      'j.badge.archive': 'archived',
      'j.badge.visit_open': 'visit in progress',
      'j.status.in_progress': 'in progress now',
      'j.state.no_visit_yet': 'No visit yet',
      'j.label.last_visit': 'Last visit:',
      'j.label.next_visit': 'next:',

      'j.placeholder.title': 'This screen arrives in a later phase',
      'j.placeholder.text': 'This version of Journal has no data yet \u2014 only the shell and two demo fixtures (Overview and Circuits).',
    },

    pl: {
      'j.nav.overview': 'Przegląd',
      'j.nav.districts': 'Obwody',
      'j.nav.tasks': 'Zadania',
      'j.nav.search': 'Szukaj',
      'j.nav.archive': 'Archiwum',

      'j.section.upcoming': 'Na kolejne odwiedziny',
      'j.section.tasks_open': 'Otwarte zadania',
      'j.section.projects': 'Projekty obwodu',
      'j.section.recent_visits': 'Ostatnie odwiedziny',
      'j.section.recent_edits': 'Ostatnio zmienione',

      'j.link.all': 'Wszystkie',
      'j.link.history': 'Historia',
      'j.link.open': 'Otwórz',

      'j.fab.new_entry': 'Nowy wpis',
      'j.fab.new_congregation': 'Zbór',

      'j.locked.title': 'Wpis chroniony',
      'j.locked.hint': 'treść ukryta',

      'j.district.kind': 'Obwód',
      'j.district.subtitle': 'własne wpisy, projekty i zadania',
      'j.card.district_entries_title': 'Wpisy na poziomie obwodu',
      'j.card.district_entries_hint': 'Obwód to samodzielny obiekt roboczy: ma własne projekty, notatki i zadania, niezwiązane z żadnym konkretnym zborem.',
      'j.card.congregations_title': 'Zbory i grupy',
      'j.tab.congregations': 'Zbory',
      'j.tab.entries': 'Wpisy',

      'j.badge.archive': 'archiwum',
      'j.badge.visit_open': 'wizyta w toku',
      'j.status.in_progress': 'trwa teraz',
      'j.state.no_visit_yet': 'Jeszcze bez odwiedzin',
      'j.label.last_visit': 'Ostatnia wizyta:',
      'j.label.next_visit': 'nast.',

      'j.placeholder.title': 'Ten ekran pojawi się w kolejnej fazie',
      'j.placeholder.text': 'Ta wersja Dziennika nie ma jeszcze danych — tylko powłoka i dwie fikstury demonstracyjne (Przegląd i Obwody).',
    },

    de: {
      'j.nav.overview': 'Übersicht',
      'j.nav.districts': 'Kreise',
      'j.nav.tasks': 'Aufgaben',
      'j.nav.search': 'Suche',
      'j.nav.archive': 'Archiv',

      'j.section.upcoming': 'Für die nächsten Besuche',
      'j.section.tasks_open': 'Offene Aufgaben',
      'j.section.projects': 'Kreisprojekte',
      'j.section.recent_visits': 'Letzte Besuche',
      'j.section.recent_edits': 'Zuletzt geändert',

      'j.link.all': 'Alle',
      'j.link.history': 'Verlauf',
      'j.link.open': 'Öffnen',

      'j.fab.new_entry': 'Neuer Eintrag',
      'j.fab.new_congregation': 'Versammlung',

      'j.locked.title': 'Geschützter Eintrag',
      'j.locked.hint': 'Inhalt verborgen',

      'j.district.kind': 'Kreis',
      'j.district.subtitle': 'eigene Einträge, Projekte und Aufgaben',
      'j.card.district_entries_title': 'Einträge auf Kreisebene',
      'j.card.district_entries_hint': 'Ein Kreis ist ein eigenständiges Arbeitsobjekt: er hat eigene Projekte, Notizen und Aufgaben, die an keine bestimmte Versammlung gebunden sind.',
      'j.card.congregations_title': 'Versammlungen und Gruppen',
      'j.tab.congregations': 'Versammlungen',
      'j.tab.entries': 'Einträge',

      'j.badge.archive': 'archiviert',
      'j.badge.visit_open': 'Besuch läuft',
      'j.status.in_progress': 'läuft gerade',
      'j.state.no_visit_yet': 'Noch kein Besuch',
      'j.label.last_visit': 'Letzter Besuch:',
      'j.label.next_visit': 'nächster:',

      'j.placeholder.title': 'Dieser Bildschirm kommt in einer späteren Phase',
      'j.placeholder.text': 'Diese Version von Journal hat noch keine Daten \u2014 nur die Hülle und zwei Demo-Fixtures (Übersicht und Kreise).',
    },

  });
})(typeof self !== 'undefined' ? self : globalThis);
