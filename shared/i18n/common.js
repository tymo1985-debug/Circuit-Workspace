/**
 * Circuit Workspace — shared/i18n/common.js
 * Общие словари: строки хаба + строки, которые нужны больше чем одному
 * модулю (кнопки, статусы, названия и описания модулей).
 *
 * ПРАВИЛО, ЧТО КЛАСТЬ СЮДА, А ЧТО В МОДУЛЬ:
 *   сюда   — всё, что встречается минимум в двух местах экосистемы
 *            (названия модулей, «Сохранить», «Отмена», статусы);
 *   в модуль (`<module>/i18n/dict.js`) — то, что осмысленно только внутри
 *            конкретного модуля («Формуляр S-302», «Классы учащихся»).
 * Так название модуля существует ровно в одном месте: и на плитке хаба, и
 * в шапке самого модуля берётся один и тот же ключ module.<id>.title.
 *
 * Подписи языков в переключателе (Русский / Українська / …) намеренно НЕ
 * здесь: они не переводятся и заданы в shared/i18n.js → LANGS.
 */
(function (global) {
  'use strict';

  if (!global.CWI18n) {
    console.error('shared/i18n/common.js подключён раньше shared/i18n.js');
    return;
  }

  global.CWI18n.register({

    ru: {
      'common.back_to_hub': 'На главную — Circuit Workspace',
      'common.language': 'Язык',
      'common.language_inherit': 'Как в Circuit Workspace',
      'common.settings': 'Настройки',
      'common.save': 'Сохранить',
      'common.cancel': 'Отмена',
      'common.close': 'Закрыть',
      'common.delete': 'Удалить',
      'common.search': 'Поиск',
      'common.export': 'Экспорт',
      'common.import': 'Импорт',
      'common.print': 'Печать',

      'status.live': 'работает',
      'status.soon': 'скоро',
      'status.dev': 'в разработке',

      'hub.title': 'Один вход для всех инструментов района',
      'hub.subtitle': 'Каждая плитка — самостоятельный модуль. Общие данные вводятся один раз и постепенно становятся доступны во всех модулях.',
      'hub.footer': 'Circuit Workspace · единая точка входа поверх независимых модулей',
      'hub.language_label': 'Язык интерфейса',
      'hub.version_label': 'Версия хаба',

      'module.congress-project.title': 'Конгрессы',
      'module.congress-project.desc': 'Программа конгрессов, распределение заданий и генерация писем участникам в PDF.',
      'module.circuit-planner.title': 'Клиндарий',
      'module.circuit-planner.desc': 'Календарь служебного года: недели, посещения, формуляры S-302 и печать PDF.',
      'module.pioneer-school.title': 'Школа пионеров',
      'module.pioneer-school.desc': 'Учащиеся и классы, расписание уроков, учебники, формуляры S-253 и экспорт списков.',
      'module.appointments.title': 'Назначения',
      'module.appointments.desc': 'Письмо о назначении и вычёркивании старейшин и служителей собрания.',
    },

    uk: {
      'common.back_to_hub': 'На головну — Circuit Workspace',
      'common.language': 'Мова',
      'common.language_inherit': 'Як у Circuit Workspace',
      'common.settings': 'Налаштування',
      'common.save': 'Зберегти',
      'common.cancel': 'Скасувати',
      'common.close': 'Закрити',
      'common.delete': 'Видалити',
      'common.search': 'Пошук',
      'common.export': 'Експорт',
      'common.import': 'Імпорт',
      'common.print': 'Друк',

      'status.live': 'працює',
      'status.soon': 'скоро',
      'status.dev': 'у розробці',

      'hub.title': 'Один вхід до всіх інструментів округу',
      'hub.subtitle': 'Кожна плитка — самостійний модуль. Спільні дані вводяться один раз і поступово стають доступними в усіх модулях.',
      'hub.footer': 'Circuit Workspace · єдина точка входу над незалежними модулями',
      'hub.language_label': 'Мова інтерфейсу',
      'hub.version_label': 'Версія хаба',

      'module.congress-project.title': 'Конгреси',
      'module.congress-project.desc': 'Програма конгресів, розподіл завдань і створення листів учасникам у PDF.',
      'module.circuit-planner.title': 'Кліндарій',
      'module.circuit-planner.desc': 'Календар службового року: тижні, відвідування, формуляри S-302 і друк PDF.',
      'module.pioneer-school.title': 'Школа піонерів',
      'module.pioneer-school.desc': 'Учні та класи, розклад уроків, підручники, формуляри S-253 і експорт списків.',
      'module.appointments.title': 'Призначення',
      'module.appointments.desc': 'Лист про призначення і викреслення старійшин та служителів збору.',
    },

    en: {
      'common.back_to_hub': 'Back to Circuit Workspace',
      'common.language': 'Language',
      'common.language_inherit': 'Same as Circuit Workspace',
      'common.settings': 'Settings',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.delete': 'Delete',
      'common.search': 'Search',
      'common.export': 'Export',
      'common.import': 'Import',
      'common.print': 'Print',

      'status.live': 'live',
      'status.soon': 'coming soon',
      'status.dev': 'in development',

      'hub.title': 'One entry point for every circuit tool',
      'hub.subtitle': 'Each tile is a standalone module. Shared data is entered once and gradually becomes available across all modules.',
      'hub.footer': 'Circuit Workspace · one entry point above independent modules',
      'hub.language_label': 'Interface language',
      'hub.version_label': 'Hub version',

      'module.congress-project.title': 'Conventions',
      'module.congress-project.desc': 'Convention programme, task assignments and participant letters as PDF.',
      'module.circuit-planner.title': 'Klindariy',
      'module.circuit-planner.desc': 'Service-year calendar: weeks, visits, S-302 forms and PDF printing.',
      'module.pioneer-school.title': 'Pioneer school',
      'module.pioneer-school.desc': 'Students and classes, lesson schedule, textbooks, S-253 forms and list export.',
      'module.appointments.title': 'Appointments',
      'module.appointments.desc': 'Letter about appointing and deleting elders and ministerial servants.',
    },

    pl: {
      'common.back_to_hub': 'Powrót do Circuit Workspace',
      'common.language': 'Język',
      'common.language_inherit': 'Jak w Circuit Workspace',
      'common.settings': 'Ustawienia',
      'common.save': 'Zapisz',
      'common.cancel': 'Anuluj',
      'common.close': 'Zamknij',
      'common.delete': 'Usuń',
      'common.search': 'Szukaj',
      'common.export': 'Eksport',
      'common.import': 'Import',
      'common.print': 'Drukuj',

      'status.live': 'działa',
      'status.soon': 'wkrótce',
      'status.dev': 'w budowie',

      'hub.title': 'Jedno wejście do wszystkich narzędzi obwodu',
      'hub.subtitle': 'Każdy kafelek to samodzielny moduł. Wspólne dane wprowadzasz raz i stopniowo stają się dostępne we wszystkich modułach.',
      'hub.footer': 'Circuit Workspace · jedno wejście ponad niezależnymi modułami',
      'hub.language_label': 'Język interfejsu',
      'hub.version_label': 'Wersja centrum',

      'module.congress-project.title': 'Kongresy',
      'module.congress-project.desc': 'Program kongresu, przydział zadań i listy do uczestników w PDF.',
      'module.circuit-planner.title': 'Klindarium',
      'module.circuit-planner.desc': 'Kalendarz roku służbowego: tygodnie, wizyty, formularze S-302 i wydruk PDF.',
      'module.pioneer-school.title': 'Szkoła pionierska',
      'module.pioneer-school.desc': 'Uczniowie i klasy, plan lekcji, podręczniki, formularze S-253 i eksport list.',
      'module.appointments.title': 'Mianowania',
      'module.appointments.desc': 'List o mianowaniu i skreśleniu starszych oraz sług pomocniczych.',
    },

    de: {
      'common.back_to_hub': 'Zurück zu Circuit Workspace',
      'common.language': 'Sprache',
      'common.language_inherit': 'Wie in Circuit Workspace',
      'common.settings': 'Einstellungen',
      'common.save': 'Speichern',
      'common.cancel': 'Abbrechen',
      'common.close': 'Schließen',
      'common.delete': 'Löschen',
      'common.search': 'Suche',
      'common.export': 'Export',
      'common.import': 'Import',
      'common.print': 'Drucken',

      'status.live': 'aktiv',
      'status.soon': 'demnächst',
      'status.dev': 'in Arbeit',

      'hub.title': 'Ein Zugang zu allen Werkzeugen des Kreises',
      'hub.subtitle': 'Jede Kachel ist ein eigenständiges Modul. Gemeinsame Daten werden einmal erfasst und nach und nach in allen Modulen verfügbar.',
      'hub.footer': 'Circuit Workspace · ein Zugang über unabhängigen Modulen',
      'hub.language_label': 'Sprache der Oberfläche',
      'hub.version_label': 'Version der Zentrale',

      'module.congress-project.title': 'Kongresse',
      'module.congress-project.desc': 'Kongressprogramm, Aufgabenverteilung und Teilnehmerbriefe als PDF.',
      'module.circuit-planner.title': 'Klindarium',
      'module.circuit-planner.desc': 'Dienstjahr-Kalender: Wochen, Besuche, S-302-Formulare und PDF-Druck.',
      'module.pioneer-school.title': 'Pionierschule',
      'module.pioneer-school.desc': 'Schüler und Klassen, Stundenplan, Lehrbücher, S-253-Formulare und Listenexport.',
      'module.appointments.title': 'Ernennungen',
      'module.appointments.desc': 'Brief über Ernennung und Streichung von Ältesten und Dienstamtgehilfen.',
    },

  });
})(typeof self !== 'undefined' ? self : this);
