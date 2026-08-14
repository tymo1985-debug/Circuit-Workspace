// registrationForm.js — сборка ОНЛАЙН-АНКЕТЫ из схемы (registrationSchema.js).
//
// ЗАЧЕМ. До 14.08.2026 состав вопросов был описан дважды: схемой (из неё
// строится интерактивная PDF-анкета) и разметкой register.html. Описания уже
// разошлись — у поля «Дополнительные сведения» было два ключа словаря с разным
// текстом, и на четыре языка это оплачивалось бы дважды. Теперь вопрос
// добавляется в схему, и он сам появляется и на странице, и в PDF.
//
// ГДЕ ЭТО РАБОТАЕТ. Только на публичной странице register.html. Файл намеренно
// маленький и не тянет за собой ни T() из интерфейса, ни модуль Registration:
// страницу открывает сам пионер, и грузить ей 140 КБ админского кода незачем
// (та же причина, по которой у неё отдельный словарь i18n/doc.js).
//
// ЯЗЫК. Подписи приходят из схемы уже на языке ДОКУМЕНТА (геттер sections
// зовёт D() в момент обращения). Поэтому render() вызывается ПОСЛЕ
// PSDocLang.init() — иначе форма застынет на языке, который был при загрузке
// скрипта. Атрибуты data-doc-i18n сгенерированным узлам не нужны и не
// ставятся: applyDoc() переводит статическую разметку, а эта собрана уже
// переведённой.
//
// ЧТО ОСТАЁТСЯ В РАЗМЕТКЕ: шапка страницы, блок «куда и до какого числа
// сдавать», кнопки и баннер успеха. Это не вопросы анкеты, у них свои ключи и
// свои эхо-подстановки из настроек школы.

const RegistrationForm = {
  // Собрать все разделы схемы внутрь контейнера.
  render(container, schema) {
    container.textContent = '';
    schema.sections.forEach((section) => {
      container.appendChild(this._section(section));
    });
    return container;
  },

  _section(section) {
    const fs = document.createElement('fieldset');
    const legend = document.createElement('legend');
    // heading, а не title: номер раздела приписывает схема, в словаре его нет.
    legend.textContent = section.heading;
    fs.appendChild(legend);
    section.fields.forEach((field) => fs.appendChild(this._field(field)));
    return fs;
  },

  _field(field) {
    const conditional = !!field.showIf;
    const wrap = document.createElement('div');
    // Условный блок скрыт до выполнения условия (.conditional/.show в
    // css/styles.css), обычное поле — просто .field.
    wrap.className = conditional ? 'conditional' : 'field';
    if (conditional) wrap.id = field.key + '-block';

    const group = field.type === 'radio' || field.type === 'checkboxes';
    wrap.appendChild(group ? this._groupLabel(field) : this._label(field));
    wrap.appendChild(this._control(field));

    if (field.hint) {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = field.hint;
      wrap.appendChild(hint);
    }
    return wrap;
  },

  // Подпись у поля ввода — настоящий <label for>, чтобы работало нажатие
  // по подписи и озвучивание скринридером.
  _label(field) {
    const label = document.createElement('label');
    label.setAttribute('for', field.key);
    label.appendChild(this._labelText(field));
    return label;
  },

  // У группы переключателей нет одного элемента, на который сослался бы
  // <label for>, поэтому подпись — <span class="group-label">.
  _groupLabel(field) {
    const span = document.createElement('span');
    span.className = 'group-label';
    span.appendChild(this._labelText(field));
    return span;
  },

  _labelText(field) {
    const frag = document.createDocumentFragment();
    const text = document.createElement('span');
    text.textContent = field.label || '';
    frag.appendChild(text);
    if (field.required) {
      frag.appendChild(document.createTextNode(' '));
      const mark = document.createElement('span');
      mark.className = 'required-mark';
      mark.textContent = '*';
      frag.appendChild(mark);
    }
    return frag;
  },

  _control(field) {
    if (field.type === 'radio') return this._pills(field);
    if (field.type === 'checkboxes') return this._checkCards(field);
    if (field.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.id = field.key;
      ta.name = field.key;
      ta.rows = field.rows || 3;
      if (field.required) ta.required = true;
      return ta;
    }
    const input = document.createElement('input');
    input.type = field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text';
    input.id = field.key;
    input.name = field.key;
    if (field.required) input.required = true;
    if (field.autocomplete) input.autocomplete = field.autocomplete;
    if (field.placeholder) input.placeholder = field.placeholder;
    return input;
  },

  // «Таблетки» — тот же вид, что у остальных вопросов «Да/Нет». Язык учебника
  // раньше был <select> и выбивался из ряда; решение Алекса 14.08.2026 —
  // привести к общему виду. Порядок узлов важен: правило
  // `.pill-option input:checked + span` требует, чтобы <span> шёл сразу
  // за <input>.
  _pills(field) {
    const row = document.createElement('div');
    row.className = 'radio-row';
    (field.options || []).forEach((opt, i) => {
      const label = document.createElement('label');
      label.className = 'pill-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = field.key;
      input.value = opt.value;
      // required достаточно поставить одному переключателю группы — браузер
      // требует выбор в группе целиком.
      if (field.required && i === 0) input.required = true;
      const span = document.createElement('span');
      span.textContent = opt.label;
      label.appendChild(input);
      label.appendChild(span);
      row.appendChild(label);
    });
    return row;
  },

  _checkCards(field) {
    const grid = document.createElement('div');
    grid.className = 'format-grid';
    (field.options || []).forEach((opt) => {
      const label = document.createElement('label');
      label.className = 'check-card';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = field.key;
      input.value = opt.value;
      const span = document.createElement('span');
      span.textContent = opt.label;
      label.appendChild(input);
      label.appendChild(document.createTextNode(' '));
      label.appendChild(span);
      grid.appendChild(label);
    });
    return grid;
  },

  // Условные поля: показать/скрыть и переключить обязательность.
  //
  // Обязательность ставится только пока поле видимо — иначе форма не
  // отправится из-за скрытого пустого поля.
  //
  // При скрытии значение ОЧИЩАЕТСЯ. Прежняя разметочная версия этого не делала,
  // и у того, кто сначала выбрал «Нет», написал причину, а потом передумал,
  // причина неявки уезжала в письмо старейшине вместе с ответом «Да».
  wire(form, schema) {
    const conditionals = schema.allFields().filter((f) => f.showIf);
    const sync = () => {
      conditionals.forEach((field) => {
        const block = form.querySelector('#' + field.key + '-block');
        const control = form.querySelector('[name="' + field.key + '"]');
        if (!block || !control) return;
        const show = this._valueOf(form, field.showIf.field) === field.showIf.equals;
        block.classList.toggle('show', show);
        control.required = show;
        if (!show) control.value = '';
      });
    };
    const triggers = new Set(conditionals.map((f) => f.showIf.field));
    triggers.forEach((name) => {
      form.querySelectorAll('[name="' + name + '"]').forEach((el) => {
        el.addEventListener('change', sync);
      });
    });
    sync();
    return sync;
  },

  // Значение поля по имени: у переключателей — выбранный вариант, у остальных
  // — содержимое элемента.
  _valueOf(form, name) {
    const els = form.querySelectorAll('[name="' + name + '"]');
    if (!els.length) return '';
    const first = els[0];
    if (first.type === 'radio' || first.type === 'checkbox') {
      const checked = form.querySelector('[name="' + name + '"]:checked');
      return checked ? checked.value : '';
    }
    return first.value;
  },

  // Единая точка входа для страницы: собрать поля и включить условную логику.
  // Возвращает sync() — его нужно позвать после form.reset(), иначе условные
  // блоки останутся раскрытыми над пустой формой.
  mount(form, schema, container) {
    this.render(container || form, schema);
    return this.wire(form, schema);
  }
};

if (typeof window !== 'undefined') window.RegistrationForm = RegistrationForm;
if (typeof module !== 'undefined' && module.exports) module.exports = RegistrationForm;
