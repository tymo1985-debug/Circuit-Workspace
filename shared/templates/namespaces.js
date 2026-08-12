/**
 * Circuit Workspace — shared/templates/namespaces.js
 * Реестр переменных шаблонов: какие вообще бывают, к какому пространству имён
 * относятся и под какими СТАРЫМИ именами они уже написаны в шаблонах у
 * пользователей.
 *
 * ЗАЧЕМ ОН ПОЯВИЛСЯ. До него в проекте было три несовместимых диалекта
 * плейсхолдеров: `{{senderName}}` в Конгрессах, `{congregation}` в Клиндарии
 * и `{name}` через словарь в Назначениях и Школе (последний — не шаблонизатор,
 * а подстановка в перевод, он сюда не входит и не должен). Пользователь,
 * научившийся писать шаблон в одном модуле, не мог перенести навык в соседний,
 * а список доступных переменных существовал в двух местах: массивом `PH` в
 * `congress-project/js/letters.js` и функцией `renderPlaceholderReference()`
 * в `circuit-planner/app.js`.
 *
 * КАНОНИЧЕСКАЯ ФОРМА — `{{namespace.field}}`. Двойные скобки: они строже и не
 * конфликтуют с одинарной скобкой, которая в живом тексте письма встречается
 * как обычный символ.
 *
 * ⚠️ ALIASES УДАЛЯТЬ НЕЛЬЗЯ. НИКОГДА. У пользователей в браузерах лежат
 * отредактированные шаблоны, написанные старыми именами. Убрать алиас — значит
 * молча сломать чьё-то письмо: плейсхолдер перестанет подставляться и уедет в
 * готовый документ как есть. Список только пополняется.
 *
 * КАК ДОБАВИТЬ ПЕРЕМЕННУЮ: поле в нужное пространство ниже + отдача значения
 * модулем в `CWTemplates.render()`. Логику движка трогать не нужно.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И НЕ ДОЛЖНО БЫТЬ: подписей на человеческом языке. Реестр —
 * технический словарь, а не строки интерфейса; описания переменных живут в
 * словарях модулей (`ph_*` в Клиндарии) и переводятся носителями языка.
 * `example` — не подпись, а образец значения для колонки «пример».
 *
 * `self` вместо `window` — файл можно безопасно подключать и через
 * importScripts() в service worker'е, как shared/version.js.
 */
(function (global) {
  'use strict';

  global.CW_TEMPLATE_NAMESPACES = {
    /* Данные отправителя. Источник — shared/sender.js; движок подставляет их
       сам, если модуль не передал своих (см. shared/templates.js). */
    sender: {
      fields: {
        name:    { aliases: ['senderName', 'sender'], example: 'Олексій Тимощук' },
        code:    { aliases: ['senderCode'],           example: 'EU-K-01' },
        address: { aliases: ['senderAddress'],        example: 'Warszawa' },
        phone1:  { aliases: ['senderPhone1'],         example: '+48 000 000 000' },
        phone2:  { aliases: ['senderPhone2'],         example: '' },
        email:   { aliases: ['senderEmail'],          example: 'mail@example.com' },
      },
    },

    /* Служебное: то, что знает сам движок, а не модуль. */
    doc: {
      fields: {
        today: { aliases: ['today'], example: '12 серпня 2026 р.' },
        lang:  { aliases: [],        example: 'uk' },
      },
    },

    /* Собрание/группа. Пока значения приходят от модуля; после появления
       общего справочника (shared/directory.js) источником станет он, а имена
       переменных не изменятся — в этом и смысл пространства имён. */
    congregation: {
      fields: {
        name:         { aliases: ['congregation'],        example: 'Group Hamburg-Russian-West' },
        number:       { aliases: ['cong_number'],         example: '14761' },
        /* Номер в скобках или пустая строка: собрание без номера не должно
           оставлять в письме « ()». Готовая строка, а не форматирование в
           шаблоне. */
        numberSuffix: { aliases: ['cong_number_suffix'],  example: ' (14761)' },
        address:      { aliases: [],                      example: '' },
        contactName:  { aliases: ['contact_name'],        example: 'Іван Петренко' },
        contactPhone: { aliases: [],                      example: '' },
        contactEmail: { aliases: [],                      example: '' },
      },
    },

    /* Визит районного надзирателя — Клиндарий. */
    visit: {
      fields: {
        startDate: { aliases: ['start_date'], example: '12 жовтня 2026 р.' },
        endDate:   { aliases: ['end_date'],   example: '17 жовтня 2026 р.' },
        type:      { aliases: [],             example: 'Congregation' },
        typeLabel: { aliases: [],             example: 'збору' },
      },
    },

    /* Конгресс — Конгрессы. */
    congress: {
      fields: {
        name:              { aliases: ['congressName'],       example: 'Радійте!' },
        theme:             { aliases: [],                     example: 'Радійте!' },
        place:             { aliases: ['congressPlace'],       example: 'SZ Warszawa' },
        date:              { aliases: ['congressDate'],        example: '07.11.2026' },
        rehearsalDate:     { aliases: ['stageRehearsalDate'],  example: '05.11.2026' },
        rehearsalTime:     { aliases: ['stageRehearsalTime'],  example: '18:00' },
        recordingDeadline: { aliases: ['recordingDeadline'],   example: '20.10.2026' },
        responseDeadline:  { aliases: ['responseDeadline'],    example: '18.08.2026' },
      },
    },

    /* Задание в программе конгресса. */
    assignment: {
      fields: {
        number:         { aliases: ['assignmentNumber'],  example: '1' },
        title:          { aliases: ['assignmentTitle'],   example: 'Довіряй Єгові всім серцем' },
        time:           { aliases: ['assignmentTime'],    example: '10:00' },
        type:           { aliases: ['assignmentType'],    example: 'промову' },
        participant:    { aliases: ['participantName'],   example: 'Якуб Ульфік' },
        recordingMedia: { aliases: ['recordingMedia'],    example: 'аудіо' },
        recordingKind:  { aliases: ['recordingKind'],     example: 'інтерв’ю' },
        notes:          { aliases: ['notes'],             example: '' },
      },
    },

    /* Школа пионеров — писем в модуле пока нет вовсе (проверено 11.08.2026).
       Пространства заведены заранее, чтобы имена переменных для будущих писем
       не изобретались заново и не разошлись с остальными модулями. */
    student: {
      fields: {
        firstName: { aliases: [], example: 'Олена' },
        lastName:  { aliases: [], example: 'Коваль' },
        email:     { aliases: [], example: '' },
        phone:     { aliases: [], example: '' },
      },
    },
    school: {
      fields: {
        startDate: { aliases: [], example: '' },
        endDate:   { aliases: [], example: '' },
        place:     { aliases: [], example: '' },
      },
    },
  };
})(typeof self !== 'undefined' ? self : this);
