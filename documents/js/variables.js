/**
 * Документы — presentation metadata для селектора переменных.
 *
 * ЭТО НЕ БИЗНЕС-ЛОГИКА И НЕ ДВИЖОК. Единственная задача файла — сопоставить
 * технический `namespace.field` из `shared/templates/namespaces.js` с
 * человеческим названием для UI (i18n-ключ) и решить, показывать ли поле в
 * новом picker'е вообще.
 *
 * ПОЧЕМУ НЕ shared/templates/labels.js. Реестр `CW_TEMPLATE_NAMESPACES`
 * технический по замыслу (см. шапку namespaces.js — «чего здесь нет и не
 * должно быть: подписей на человеческом языке»), и это верно. Но человеческие
 * названия здесь тоже не нужны как общий shared-слой: их использует только
 * один экран одного модуля. Решение 01.09.2026 (Алекс): держать mapping
 * локально в Documents, не создавая новую shared-архитектуру ради одного UI.
 *
 * СКРЫТЫЕ ПОЛЯ. Три поля существуют в реестре, работают в движке подстановки
 * и остаются доступными для старых шаблонов/ручного использования, но НЕ
 * показываются в новом picker'е (решение 01.09.2026, после проверки живым
 * прогоном фактического использования — см. docs/documents/):
 *   - visit.type      — технический код события (Congregation/Group/…),
 *                       не текст для письма; вставка испортит документ.
 *   - visit.typeLabel — заполняется пустой строкой ВСЕГДА
 *                       (circuit-planner/app.js, letterData()); показать его
 *                       пользователю — значит подсунуть вставку, которая
 *                       молча ничего не подставит.
 *   - doc.lang        — служебный код языка документа (uk/ru/de…) для
 *                       внутренней логики модулей, не для текста письма.
 *
 * НИЧЕГО ИЗ РЕЕСТРА НЕ УДАЛЯТЬ. Скрытие из picker'а — чисто presentation
 * (см. HIDDEN ниже и как его использует documents/js/app.js). Аргумент
 * namespaces в CWTemplates.tokens() как и раньше передаётся модулем;
 * шаблонизатор и aliases не меняются.
 */
(function () {
  'use strict';

  /* namespace.field → i18n-ключ короткого названия. Заполнено полностью —
     46 полей, одобрено Алексом 01.09.2026 (все namespaces реестра минус
     3 скрытых поля ниже). */
  var LABEL_KEYS = {
    'sender.name':    'doc.var.sender.name',
    'sender.code':    'doc.var.sender.code',
    'sender.address': 'doc.var.sender.address',
    'sender.phone1':  'doc.var.sender.phone1',
    'sender.phone2':  'doc.var.sender.phone2',
    'sender.email':   'doc.var.sender.email',

    'doc.today': 'doc.var.doc.today',

    'congregation.name':         'doc.var.congregation.name',
    'congregation.number':       'doc.var.congregation.number',
    'congregation.numberSuffix': 'doc.var.congregation.numberSuffix',
    'congregation.address':      'doc.var.congregation.address',
    'congregation.contactName':  'doc.var.congregation.contactName',
    'congregation.contactPhone': 'doc.var.congregation.contactPhone',
    'congregation.contactEmail': 'doc.var.congregation.contactEmail',

    'visit.startDate': 'doc.var.visit.startDate',
    'visit.endDate':   'doc.var.visit.endDate',

    'congress.name':              'doc.var.congress.name',
    'congress.theme':             'doc.var.congress.theme',
    'congress.place':              'doc.var.congress.place',
    'congress.date':               'doc.var.congress.date',
    'congress.rehearsalDate':      'doc.var.congress.rehearsalDate',
    'congress.rehearsalTime':      'doc.var.congress.rehearsalTime',
    'congress.recordingDeadline':  'doc.var.congress.recordingDeadline',
    'congress.responseDeadline':   'doc.var.congress.responseDeadline',

    'assignment.number':          'doc.var.assignment.number',
    'assignment.title':           'doc.var.assignment.title',
    'assignment.time':            'doc.var.assignment.time',
    'assignment.type':            'doc.var.assignment.type',
    'assignment.participant':     'doc.var.assignment.participant',
    'assignment.congregation':    'doc.var.assignment.congregation',
    'assignment.recordingMedia':  'doc.var.assignment.recordingMedia',
    'assignment.recordingKind':   'doc.var.assignment.recordingKind',
    'assignment.notes':           'doc.var.assignment.notes',

    'student.firstName':    'doc.var.student.firstName',
    'student.lastName':     'doc.var.student.lastName',
    'student.congregation': 'doc.var.student.congregation',
    'student.email':        'doc.var.student.email',
    'student.phone':        'doc.var.student.phone',

    'school.startDate':             'doc.var.school.startDate',
    'school.endDate':               'doc.var.school.endDate',
    'school.place':                 'doc.var.school.place',
    'school.teacherA':              'doc.var.school.teacherA',
    'school.teacherB':              'doc.var.school.teacherB',
    'school.registrationDeadline':  'doc.var.school.registrationDeadline',
    'school.registrationEmail':     'doc.var.school.registrationEmail',
    'school.registrationWhatsapp':  'doc.var.school.registrationWhatsapp',
  };

  /* Поля реестра, которые НЕ показываются в picker'е. См. обоснование в
     шапке файла. Ключ — то же `namespace.field`, что и в LABEL_KEYS. */
  var HIDDEN = {
    'visit.type': true,
    'visit.typeLabel': true,
    'doc.lang': true,
  };

  /* Человеческие названия категорий (заголовки групп в picker'е). Тот же
     набор namespaces, что уже фильтруется через NAMESPACES_BY_MODULE в
     app.js — здесь только подпись для заголовка группы, не список доступности. */
  var NAMESPACE_LABEL_KEYS = {
    sender: 'doc.var.ns.sender',
    doc: 'doc.var.ns.doc',
    congregation: 'doc.var.ns.congregation',
    visit: 'doc.var.ns.visit',
    congress: 'doc.var.ns.congress',
    assignment: 'doc.var.ns.assignment',
    student: 'doc.var.ns.student',
    school: 'doc.var.ns.school',
  };

  self.CWDocVariables = {
    /** @returns {boolean} true, если поле НЕ должно попадать в picker. */
    isHidden: function (ns, field) {
      return !!HIDDEN[ns + '.' + field];
    },
    /** @returns {string|null} i18n-ключ человеческого названия поля, если есть. */
    labelKey: function (ns, field) {
      return LABEL_KEYS[ns + '.' + field] || null;
    },
    /** @returns {string|null} i18n-ключ названия категории (namespace). */
    namespaceLabelKey: function (ns) {
      return NAMESPACE_LABEL_KEYS[ns] || null;
    },
  };
})();
