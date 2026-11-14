// registrationSchema.js — ЕДИНЫЙ источник структуры анкеты пионера.
//
// Онлайн-форма (register.html через js/modules/registrationForm.js) и
// интерактивная PDF-анкета (js/export/pdfFormExport.js) строятся из ЭТОЙ схемы.
// До 14.08.2026 состав вопросов был описан дважды — схемой и разметкой
// register.html, — и описания уже разошлись: поле «Дополнительные сведения»
// имело в них разные подписи (два ключа словаря на один вопрос).
//
// ЧТО ЕЩЁ НЕ ОТСЮДА. Печатный бланк (pdfExport.downloadRegistrationBlankForm)
// по-прежнему разложен вручную: у него подобранные координаты в две колонки,
// и генерация «как получится» испортила бы готовую бумагу. Подписи и порядок
// разделов он берёт из схемы, а расстановку держит свою. Это осознанный
// остаток дублирования, отмеченный в TODO.md.
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
//   radio      — выбор одного варианта (в PDF: radio group, на вебе: «таблетки»)
//   checkboxes — выбор нескольких вариантов (в PDF: независимые checkbox
//                `<key>_<value>`); значение в записи — массив. required —
//                «отмечен хотя бы один».
//   check      — одна галочка «да» (в PDF: checkbox `<key>`); в записи 'yes' или ''.
// showIf: { field, equals } — для radio; { field, includes } — для checkboxes.
//   Поле показывается/поясняется только при условии.
//   На вебе такое поле становится обязательным, пока видимо, и очищается,
//   когда скрывается: иначе причина неявки уехала бы в письмо у того, кто
//   сперва выбрал «Нет», потом передумал.
// rows — высота textarea на вебе; pdfLines — сколько линий рисовать на бумаге.
//   Это разные величины: на экране поле прокручивается, на бумаге нет.
//
// НУМЕРАЦИЯ РАЗДЕЛОВ — В `heading`, А НЕ В СЛОВАРЕ. Раньше строка словаря была
// «1. Личные данные», то есть переводчик отвечал за номер и обязан был помнить,
// что его нельзя терять и нельзя переставлять. Теперь в словаре чистое название
// (`title`), номер приписывает схема (`heading`), и все три потребителя —
// онлайн-форма, интерактивный PDF и печатный бланк — берут `heading`.
// Та же логика, по которой 14.08.2026 из словаря уехали двоеточия.

// ВЕРСИЯ 2 (Ф2, 14.11.2026): собрание, «номер есть в WhatsApp», несколько
// языков учебника (`languages` — массив, вместо одного `language`), особые
// потребности. Записи версии 1 и PDF-анкеты, разосланные до Ф2, читаются:
// одиночный `language` — это `languages` из одного элемента (languagesOf()).
// Ключи полей — контракт с IndexedDB, резервной копией и именами полей PDF;
// переименовывать нельзя.

const RegistrationSchema = {
  version: 2,

  // Языки учебника в анкете. Ключ 'other' раскрывает поле languageOther.
  // Только ru/uk/de — решение Алекса 14.11.2026; остальные добавляются по
  // потребности (ключ + подпись doc.ps.reg.opt.lang.<код> на 5 языках).
  // Ответы старых анкет с другим кодом (pl) читаются: подпись — сам код.
  LANGUAGE_OPTIONS: ['ru', 'uk', 'de', 'other'],

  get sections() {
    const yesNo = [
      { value: 'yes', label: D('doc.ps.reg.opt.yes') },
      { value: 'no', label: D('doc.ps.reg.opt.no') }
    ];
    const withHeading = (list) => list.map((s, i) => ({
      ...s,
      number: i + 1,
      heading: `${i + 1}. ${s.title}`
    }));
    return withHeading([
      {
        id: 'personal',
        title: D('doc.ps.reg.section.personal'),
        fields: [
          { key: 'lastName', label: D('doc.ps.field.lastName'), type: 'text', required: true, autocomplete: 'family-name' },
          { key: 'firstName', label: D('doc.ps.field.firstName'), type: 'text', required: true, autocomplete: 'given-name' },
          // Собрание — текстом: справочника собраний (CWDirectory) на телефоне
          // пионера нет. Сопоставление со справочником — при переносе в
          // карточку (Registration.applyToStudent).
          { key: 'congregation', label: D('doc.ps.field.congregation'), type: 'text', required: true, autocomplete: 'off' },
          {
            key: 'phone', label: D('doc.ps.reg.field.phone'), type: 'tel', required: true, autocomplete: 'tel',
            placeholder: '+000 00 000 00 00'
          },
          { key: 'phoneWhatsapp', label: D('doc.ps.reg.field.phoneWhatsapp'), type: 'check' },
          { key: 'email', label: D('doc.ps.field.email'), type: 'email', required: true, autocomplete: 'email' },
          { key: 'address', label: D('doc.ps.field.address'), type: 'text', required: true, autocomplete: 'street-address', pdfWidth: 'full' }
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
          // required — пока поле видимо (RegistrationForm.wire): при «Нет»
          // причина обязательна. Звёздочка видна и на бумаге.
          {
            key: 'attendReason', type: 'textarea', required: true, label: D('doc.ps.reg.field.attendReason'),
            showIf: { field: 'attending', equals: 'no' }, pdfWidth: 'full', pdfLines: 2, rows: 2
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
            key: 'languages', type: 'checkboxes', required: true, label: D('doc.ps.reg.field.languages'),
            options: this.LANGUAGE_OPTIONS.map((code) => ({ value: code, label: D('doc.ps.reg.opt.lang.' + code) }))
          },
          {
            key: 'languageOther', type: 'text', label: D('doc.ps.reg.field.languageOther'),
            showIf: { field: 'languages', includes: 'other' }
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
        id: 'needs',
        title: D('doc.ps.field.specialNeeds'),
        fields: [
          {
            key: 'specialNeeds', type: 'textarea', pdfWidth: 'full', pdfLines: 2, rows: 2,
            label: D('doc.ps.reg.field.specialNeeds')
          }
        ]
      },
      {
        id: 'extra',
        title: D('doc.ps.reg.section.extra'),
        fields: [
          {
            key: 'notes', type: 'textarea', pdfWidth: 'full', pdfLines: 3, rows: 4,
            label: D('doc.ps.reg.field.notes')
          }
        ]
      }
    ]);
  },

  get closingText() { return D('doc.ps.reg.closing'); },

  // Подсказка браузера у обязательной группы галочек (RegistrationForm.wire).
  get groupRequiredText() { return D('doc.ps.reg.pick_one'); },

  allFields() {
    return this.sections.flatMap((s) => s.fields);
  },

  // Печатный бланк раскладывает разделы вручную, но названия и номера обязан
  // брать отсюда — иначе схема и бумага снова разъедутся.
  sectionById(id) {
    return this.sections.find((s) => s.id === id) || null;
  },

  fieldByKey(key) {
    return this.allFields().find((f) => f.key === key) || null;
  },

  labelForValue(key, value) {
    // Записи версии 1 хранили один язык под ключом `language`.
    const f = this.fieldByKey(key === 'language' ? 'languages' : key);
    if (!f || !f.options) return value;
    const opt = f.options.find((o) => o.value === value);
    return opt ? opt.label : value;
  },

  // Значение условия showIf: radio — equals, checkboxes — includes.
  conditionValue(showIf) {
    return showIf.equals !== undefined ? showIf.equals : showIf.includes;
  },

  // Выполнено ли условие showIf для записи (значение — строка или массив).
  conditionMet(showIf, value) {
    const want = this.conditionValue(showIf);
    return Array.isArray(value) ? value.includes(want) : value === want;
  },

  // Запись из пар [ключ, значение] (FormData веба, поля PDF): checkboxes
  // собираются в массив, остальное — строкой. Незнакомые ключи пропускаются.
  recordFromEntries(entries) {
    const record = {};
    this.allFields().forEach((f) => { if (f.type === 'checkboxes') record[f.key] = []; });
    for (const [key, value] of entries) {
      const f = this.fieldByKey(key);
      if (!f) continue;
      if (f.type === 'checkboxes') { if (!record[key].includes(value)) record[key].push(value); }
      else record[key] = typeof value === 'string' ? value.trim() : value;
    }
    return record;
  },

  // Коды языков учебника из записи любой версии: v2 — массив `languages`,
  // v1 — одиночный `language`.
  languagesOf(record) {
    if (!record) return [];
    if (Array.isArray(record.languages)) return record.languages.slice();
    return record.language ? [record.language] : [];
  },

  // Языки для показа и документов: 'other' → то, что пионер вписал.
  languageLabels(record) {
    return this.languagesOf(record).map((code) => (code === 'other'
      ? (record.languageOther || D('doc.ps.reg.opt.lang.other_lower'))
      : this.labelForValue('languages', code)));
  }
};

if (typeof window !== 'undefined') window.RegistrationSchema = RegistrationSchema;
if (typeof module !== 'undefined' && module.exports) module.exports = RegistrationSchema;
