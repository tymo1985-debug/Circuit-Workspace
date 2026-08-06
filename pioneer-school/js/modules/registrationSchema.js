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
// Типы полей:
//   text | email | tel | textarea — текстовый ввод
//   radio      — выбор одного варианта (в PDF: radio group)
//   checkboxes — выбор нескольких вариантов (в PDF: независимые checkbox)
// showIf: { field, equals } — поле показывается/поясняется только при условии.

const RegistrationSchema = {
  version: 1,

  sections: [
    {
      id: 'personal',
      title: '1. Личные данные',
      fields: [
        { key: 'lastName', label: 'Фамилия', type: 'text', required: true, autocomplete: 'family-name' },
        { key: 'firstName', label: 'Имя', type: 'text', required: true, autocomplete: 'given-name' },
        { key: 'address', label: 'Почтовый адрес проживания', type: 'text', required: true, autocomplete: 'street-address', pdfWidth: 'full' },
        { key: 'email', label: 'Адрес электронной почты', type: 'email', required: true, autocomplete: 'email' },
        {
          key: 'phone', label: 'Номер мобильного телефона', type: 'tel', required: true, autocomplete: 'tel',
          hint: 'Желательно указать номер, привязанный к WhatsApp — так с вами будет проще связаться.'
        }
      ]
    },
    {
      id: 'attendance',
      title: '2. Участие в школе',
      fields: [
        {
          key: 'attending', type: 'radio', required: true,
          label: 'Будете ли вы присутствовать на Школе пионерского служения?',
          options: [{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }]
        },
        {
          key: 'attendReason', type: 'textarea', label: 'Пожалуйста, укажите причину',
          showIf: { field: 'attending', equals: 'no' }, pdfWidth: 'full', pdfLines: 2
        }
      ]
    },
    {
      id: 'transport',
      title: '3. Транспорт',
      fields: [
        {
          key: 'transport', type: 'radio',
          label: 'Есть ли у вас автомобиль, на котором вы сможете самостоятельно добираться до места проведения школы?',
          options: [{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }]
        }
      ]
    },
    {
      id: 'lodging',
      title: '4. Проживание',
      fields: [
        {
          key: 'lodging', type: 'radio', label: 'Нуждаетесь ли вы в месте для ночлега?',
          options: [{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }]
        }
      ]
    },
    {
      id: 'textbook',
      title: '5. Учебник для школы',
      fields: [
        {
          key: 'language', type: 'radio', required: true, label: 'Язык учебника',
          options: [
            { value: 'ru', label: 'Русский' }, { value: 'uk', label: 'Украинский' },
            { value: 'pl', label: 'Польский' }, { value: 'de', label: 'Немецкий' },
            { value: 'other', label: 'Другой' }
          ]
        },
        {
          key: 'languageOther', type: 'text', label: 'Укажите необходимый язык',
          showIf: { field: 'language', equals: 'other' }
        },
        {
          key: 'format', type: 'checkboxes', label: 'Формат учебника (можно выбрать несколько)',
          options: [
            { value: 'print', label: 'Печатный экземпляр' }, { value: 'jwpub', label: 'Электронный JWPub' },
            { value: 'pdf', label: 'PDF' }, { value: 'epub', label: 'EPUB' }
          ]
        }
      ]
    },
    {
      id: 'extra',
      title: '6. Дополнительные сведения',
      fields: [
        {
          key: 'notes', type: 'textarea', pdfWidth: 'full', pdfLines: 3,
          label: 'Аллергии, особенности питания, состояние здоровья, другие важные замечания'
        }
      ]
    }
  ],

  closingText: 'Пожалуйста, заполните и отправьте этот формуляр как можно скорее. Это поможет своевременно подготовить всё необходимое для проведения школы. Благодарим за сотрудничество!',

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
