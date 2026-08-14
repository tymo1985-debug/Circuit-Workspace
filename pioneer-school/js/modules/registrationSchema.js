// registrationSchema.js — ЕДИНЫЙ источник структуры анкеты пионера.
//
// Раньше структура анкеты существовала в двух местах: разметкой в register.html
// и отдельно в коде генератора PDF. Любая правка требовала синхронных изменений
// в обоих местах, иначе онлайн-форма и PDF расходились. Теперь и HTML-формуляр,
// и интерактивный PDF строятся из ЭТОЙ схемы — правится она одна.
//
// Настройки конкретной школы (срок сдачи, контакты, доп. текст) в схеме НЕ хранятся:
// они лежат отдельно, в настройках приложения (meta 'registrationConfig'), и
// подставляются при генерации. Поэтому для новой школы шаблон менять не нужно.
//
// ЯЗЫК. Подписи берутся из словаря документов (i18n/doc.js) по языку ДОКУМЕНТА
// (js/doclang.js, функция D), а не по языку интерфейса. Ключи опций
// ('yes', 'ru', 'print', …) не переводятся никогда: они лежат в IndexedDB,
// ездят в резервных копиях и служат именами полей PDF.
//
// ПОЧЕМУ sections — ГЕТТЕР, А НЕ МАССИВ. Обычный массив вычислился бы один раз
// при загрузке скрипта и навсегда застыл бы на языке, который был в тот момент.
// Ровно на этом уже обожглись со справочными требованиями в anketa.js и с
// Registration.*_LABELS. Здесь та же ловушка закрыта заранее.
//
// Типы полей:
//   text | email | tel | textarea — текстовый ввод
//   radio      — выбор одного варианта (в PDF: radio group)
//   checkboxes — выбор нескольких вариантов (в PDF: независимые checkbox)
// showIf: { field, equals } — поле показывается/поясняется только при условии.

const RegistrationSchema = {
  version: 1,

  get sections() {
    const yesNo = [
      { value: 'yes', label: D('doc.ps.reg.opt.yes') },
      { value: 'no', label: D('doc.ps.reg.opt.no') }
    ];
    return [
      {
        id: 'personal',
        title: D('doc.ps.reg.section.personal'),
        fields: [
          { key: 'lastName', label: D('doc.ps.field.lastName'), type: 'text', required: true, autocomplete: 'family-name' },
          { key: 'firstName', label: D('doc.ps.field.firstName'), type: 'text', required: true, autocomplete: 'given-name' },
          { key: 'address', label: D('doc.ps.field.address'), type: 'text', required: true, autocomplete: 'street-address', pdfWidth: 'full' },
          { key: 'email', label: D('doc.ps.field.email'), type: 'email', required: true, autocomplete: 'email' },
          {
            key: 'phone', label: D('doc.ps.reg.field.phone'), type: 'tel', required: true, autocomplete: 'tel',
            hint: D('doc.ps.reg.hint.phone')
          }
        ]
      },
      {
        id: 'attendance',
        title: D('doc.ps.reg.section.attendance'),
        fields: [
          {
            key: 'attending', type: 'radio', required: true,
            label: D('doc.ps.reg.field.attending'),
            options: yesNo
          },
          {
            key: 'attendReason', type: 'textarea', label: D('doc.ps.reg.field.attendReason'),
            showIf: { field: 'attending', equals: 'no' }, pdfWidth: 'full', pdfLines: 2
          }
        ]
      },
      {
        id: 'transport',
        title: D('doc.ps.reg.section.transport'),
        fields: [
          { key: 'transport', type: 'radio', label: D('doc.ps.reg.field.transport'), options: yesNo }
        ]
      },
      {
        id: 'lodging',
        title: D('doc.ps.reg.section.lodging'),
        fields: [
          { key: 'lodging', type: 'radio', label: D('doc.ps.reg.field.lodging'), options: yesNo }
        ]
      },
      {
        id: 'textbook',
        title: D('doc.ps.reg.section.textbook'),
        fields: [
          {
            key: 'language', type: 'radio', required: true, label: D('doc.ps.field.language'),
            options: [
              { value: 'ru', label: D('doc.ps.reg.opt.lang.ru') },
              { value: 'uk', label: D('doc.ps.reg.opt.lang.uk') },
              { value: 'pl', label: D('doc.ps.reg.opt.lang.pl') },
              { value: 'de', label: D('doc.ps.reg.opt.lang.de') },
              { value: 'other', label: D('doc.ps.reg.opt.lang.other') }
            ]
          },
          {
            key: 'languageOther', type: 'text', label: D('doc.ps.reg.field.languageOther'),
            showIf: { field: 'language', equals: 'other' }
          },
          {
            key: 'format', type: 'checkboxes', label: D('doc.ps.reg.field.format'),
            options: [
              { value: 'print', label: D('doc.ps.reg.opt.format.print') },
              { value: 'jwpub', label: D('doc.ps.reg.opt.format.jwpub') },
              { value: 'pdf', label: D('doc.ps.reg.opt.format.pdf') },
              { value: 'epub', label: D('doc.ps.reg.opt.format.epub') }
            ]
          }
        ]
      },
      {
        id: 'extra',
        title: D('doc.ps.reg.section.extra'),
        fields: [
          {
            key: 'notes', type: 'textarea', pdfWidth: 'full', pdfLines: 3,
            label: D('doc.ps.reg.field.notes')
          }
        ]
      }
    ];
  },

  get closingText() { return D('doc.ps.reg.closing'); },

  allFields() {
    return this.sections.flatMap((s) => s.fields);
  },

  fieldByKey(key) {
    return this.allFields().find((f) => f.key === key) || null;
  },

  labelForValue(key, value) {
    const f = this.fieldByKey(key);
    if (!f || !f.options) return value;
    const opt = f.options.find((o) => o.value === value);
    return opt ? opt.label : value;
  }
};

if (typeof window !== 'undefined') window.RegistrationSchema = RegistrationSchema;
if (typeof module !== 'undefined' && module.exports) module.exports = RegistrationSchema;
