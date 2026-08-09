// pdfFormExport.js — генерация ИНТЕРАКТИВНОЙ PDF-анкеты (AcroForm).
//
// Почему не jsPDF (которым сделан остальной экспорт в проекте):
// у jsPDF нет способа объявить встроенный кириллический шрифт в словаре /DR
// самой формы. Без /DR просмотрщик не знает, каким шрифтом рисовать текст,
// который пользователь ВВОДИТ сам — поле либо пустое, либо с «кракозябрами».
// Проверено на практике, поэтому здесь используется pdf-lib, где /DR можно
// задать явно (см. _finalizeForm ниже — это ключевой шаг всей задачи).
//
// Структура анкеты берётся из общей схемы (js/modules/registrationSchema.js),
// настройки школы — из настроек приложения. Шаблон при этом не меняется.

const PdfFormExport = {
  PAGE_W: 595.28,
  PAGE_H: 841.89,
  MARGIN: 40,

  _b64ToUint8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  },

  // Дата в языке ДОКУМЕНТА: анкета на польском с русским «12 марта 2026 г.»
  // выглядит как недоделка.
  _fmtDate(iso) {
    if (!iso) return null;
    return (typeof PSDocLang !== 'undefined') ? PSDocLang.date(iso) : String(iso);
  },

  async generate(config, schema) {
    if (!window.PDFLib) throw new Error('Библиотека pdf-lib не загрузилась — обновите страницу.');
    if (!window.fontkit) throw new Error('Библиотека fontkit не загрузилась — обновите страницу.');
    if (!window.PDF_FORM_FONT_B64) throw new Error('Шрифт для PDF-анкеты не загрузился.');

    const { PDFDocument, PDFName, PDFString, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    doc.registerFontkit(window.fontkit);

    // subset: false — принципиально. Если урезать шрифт под уже использованные
    // символы, пионер не сможет напечатать буквы, которых не было в шаблоне.
    const font = await doc.embedFont(this._b64ToUint8(window.PDF_FORM_FONT_B64), { subset: false });

    const state = {
      doc, font, rgb, PDFName, PDFString,
      page: doc.addPage([this.PAGE_W, this.PAGE_H]),
      y: this.PAGE_H - 50,
      form: doc.getForm(),
      fieldCount: 0
    };

    this._drawHeader(state, config);
    schema.sections.forEach((section) => this._drawSection(state, section));
    this._drawClosing(state, config, schema);
    this._finalizeForm(state);

    return doc.save();
  },

  _ensureSpace(state, needed) {
    if (state.y - needed < 60) {
      state.page = state.doc.addPage([this.PAGE_W, this.PAGE_H]);
      state.y = this.PAGE_H - 50;
    }
  },

  _text(state, text, { x = this.MARGIN, size = 11, color = 0.12, maxWidth } = {}) {
    const opts = { x, y: state.y, size, font: state.font, color: state.rgb(color, color, color) };
    if (maxWidth) opts.maxWidth = maxWidth;
    state.page.drawText(String(text ?? ''), opts);
  },

  _wrapLines(state, text, size, maxWidth) {
    const words = String(text ?? '').split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const candidate = line ? line + ' ' + w : w;
      if (state.font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else { if (line) lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines;
  },

  _drawHeader(state, config) {
    const contentWidth = this.PAGE_W - this.MARGIN * 2;
    const title = config.title || D('doc.ps.reg.title');
    this._wrapLines(state, title, 17, contentWidth).forEach((line) => {
      this._text(state, line, { size: 17 });
      state.y -= 21;
    });
    state.y -= 4;
    this._wrapLines(state, D('doc.ps.pdf.lead'), 10.5, contentWidth)
      .forEach((line) => { this._text(state, line, { size: 10.5, color: 0.42 }); state.y -= 13; });
    state.y -= 10;

    if (config.extraInstructions && config.extraInstructions.trim()) {
      this._wrapLines(state, config.extraInstructions.trim(), 10.5, contentWidth).forEach((line) => {
        this._ensureSpace(state, 20);
        this._text(state, line, { size: 10.5, color: 0.25 });
        state.y -= 13;
      });
      state.y -= 8;
    }
  },

  _drawSectionTitle(state, title) {
    this._ensureSpace(state, 40);
    this._text(state, title, { size: 13 });
    state.y -= 6;
    state.page.drawLine({
      start: { x: this.MARGIN, y: state.y },
      end: { x: this.PAGE_W - this.MARGIN, y: state.y },
      thickness: 0.7, color: state.rgb(0.78, 0.76, 0.7)
    });
    state.y -= 18;
  },

  _drawSection(state, section) {
    this._drawSectionTitle(state, section.title);
    section.fields.forEach((field) => this._drawField(state, field));
    state.y -= 8;
  },

  _drawField(state, field) {
    const contentWidth = this.PAGE_W - this.MARGIN * 2;

    // Подпись поля (для условных полей — с пояснением, когда его заполнять)
    let label = field.label || '';
    if (field.showIf) {
      const parentLabel = window.RegistrationSchema.labelForValue(field.showIf.field, field.showIf.equals);
      label = `${label} ${D('doc.ps.reg.cond_hint', { option: parentLabel })}`;
    }
    if (field.required) label += ' *';

    if (field.type === 'radio' || field.type === 'checkboxes') {
      this._ensureSpace(state, 46);
      this._wrapLines(state, label, 11, contentWidth).forEach((line) => {
        this._text(state, line, { size: 11 });
        state.y -= 14;
      });
      state.y -= 4;
      this._drawOptions(state, field);
      state.y -= 10;
      return;
    }

    // Текстовые поля
    const isFull = field.pdfWidth === 'full' || field.type === 'textarea';
    const lines = field.pdfLines || 1;
    const boxHeight = field.type === 'textarea' ? 16 * lines : 18;
    this._ensureSpace(state, boxHeight + 34);

    this._wrapLines(state, label, 11, contentWidth).forEach((line) => {
      this._text(state, line, { size: 11 });
      state.y -= 14;
    });
    state.y -= 2;

    const width = isFull ? contentWidth : Math.min(300, contentWidth);
    const tf = state.form.createTextField(this._fieldName(field.key));
    if (field.type === 'textarea') tf.enableMultiline();
    tf.addToPage(state.page, {
      x: this.MARGIN,
      y: state.y - boxHeight + 12,
      width,
      height: boxHeight,
      font: state.font,
      borderWidth: 0.7,
      borderColor: state.rgb(0.62, 0.6, 0.55),
      backgroundColor: state.rgb(0.99, 0.985, 0.97)
    });
    // Размер шрифта задаётся ПОСЛЕ addToPage: запись /DA, которую он правит,
    // создаётся только при размещении поля на странице.
    tf.setFontSize(11);
    state.fieldCount++;
    state.y -= boxHeight + 14;

    if (field.hint) {
      this._ensureSpace(state, 18);
      this._wrapLines(state, field.hint, 9, contentWidth).forEach((line) => {
        this._text(state, line, { size: 9, color: 0.5 });
        state.y -= 11;
      });
      state.y -= 4;
    }
  },

  _drawOptions(state, field) {
    const box = 12;
    const gap = 16;
    let x = this.MARGIN;
    const maxX = this.PAGE_W - this.MARGIN;

    // Радиокнопки одной группы должны создаваться как ОДНА group —
    // иначе просмотрщик позволит выбрать несколько взаимоисключающих ответов.
    let radioGroup = null;
    if (field.type === 'radio') {
      radioGroup = state.form.createRadioGroup(this._fieldName(field.key));
    }

    field.options.forEach((opt) => {
      const labelWidth = state.font.widthOfTextAtSize(opt.label, 10.5);
      const itemWidth = box + 5 + labelWidth + gap;
      if (x + itemWidth > maxX) {
        x = this.MARGIN;
        state.y -= 22;
        this._ensureSpace(state, 26);
      }

      if (field.type === 'radio') {
        // Экспортное значение радиокнопки — КЛЮЧ ('yes'), а не подпись ('Да').
        // Раньше сюда шла подпись, и в польской анкете в самом PDF сохранялось
        // бы «Tak»: значение документа начинало зависеть от языка документа.
        // Ключи опций не переводятся нигде — здесь то же правило.
        radioGroup.addOptionToPage(opt.value, state.page, {
          x, y: state.y - 2, width: box, height: box,
          borderWidth: 0.7, borderColor: state.rgb(0.62, 0.6, 0.55),
          backgroundColor: state.rgb(0.99, 0.985, 0.97)
        });
      } else {
        const cb = state.form.createCheckBox(this._fieldName(field.key + '_' + opt.value));
        cb.addToPage(state.page, {
          x, y: state.y - 2, width: box, height: box,
          borderWidth: 0.7, borderColor: state.rgb(0.62, 0.6, 0.55),
          backgroundColor: state.rgb(0.99, 0.985, 0.97)
        });
      }
      state.fieldCount++;

      state.page.drawText(opt.label, {
        x: x + box + 5, y: state.y, size: 10.5, font: state.font, color: state.rgb(0.12, 0.12, 0.12)
      });
      x += itemWidth;
    });
    state.y -= 20;
  },

  // Имена полей PDF: латиницей, без пробелов — так надёжнее для любых
  // просмотрщиков и для последующего автоматического чтения ответов.
  _fieldName(key) {
    return String(key).replace(/[^A-Za-z0-9_]/g, '_');
  },

  _drawClosing(state, config, schema) {
    const contentWidth = this.PAGE_W - this.MARGIN * 2;
    this._ensureSpace(state, 130);
    state.y -= 6;
    state.page.drawLine({
      start: { x: this.MARGIN, y: state.y },
      end: { x: this.PAGE_W - this.MARGIN, y: state.y },
      thickness: 0.7, color: state.rgb(0.82, 0.8, 0.75)
    });
    state.y -= 18;

    this._wrapLines(state, schema.closingText, 10.5, contentWidth).forEach((line) => {
      this._ensureSpace(state, 16);
      this._text(state, line, { size: 10.5, color: 0.3 });
      state.y -= 13;
    });
    state.y -= 8;

    const deadline = this._fmtDate(config.deadline) || D('doc.ps.reg.ask_elder');
    this._ensureSpace(state, 80);
    this._text(state, D('doc.ps.pdf.deadline', { date: deadline }), { size: 11 });
    state.y -= 18;
    this._text(state, D('doc.ps.pdf.send_where'), { size: 11 });
    state.y -= 15;

    const contacts = [
      [D('doc.ps.pdf.contact.email'), config.email],
      [D('doc.ps.pdf.contact.phone'), config.phone],
      [D('doc.ps.pdf.contact.whatsapp'), config.whatsapp || config.phone]
    ].filter(([, v]) => v && String(v).trim());

    if (!contacts.length) {
      this._text(state, D('doc.ps.pdf.contact_none'), { x: this.MARGIN + 10, size: 10.5, color: 0.35 });
      state.y -= 14;
    } else {
      contacts.forEach(([label, value]) => {
        this._ensureSpace(state, 16);
        this._text(state, D('doc.ps.pdf.contact_line', { label, value }), { x: this.MARGIN + 10, size: 10.5, color: 0.2 });
        state.y -= 14;
      });
    }
  },

  // ★ КЛЮЧЕВОЙ ШАГ. Без него интерактивный PDF с кириллицей не работает:
  // поле ссылается на шрифт по имени, но само имя нигде не объявлено, и
  // просмотрщик не может отрисовать вводимый пользователем текст.
  _finalizeForm(state) {
    const { doc, font, form, PDFName, PDFString } = state;
    form.updateFieldAppearances(font);

    const acro = form.acroForm.dict;
    const fontDict = doc.context.obj({});
    fontDict.set(PDFName.of(font.name), font.ref);
    const dr = doc.context.obj({});
    dr.set(PDFName.of('Font'), fontDict);
    acro.set(PDFName.of('DR'), dr);
    acro.set(PDFName.of('DA'), PDFString.of(`/${font.name} 11 Tf 0 g`));
    // Просим просмотрщик перестроить внешний вид полей по нашим DR/DA —
    // страхует на случай, если он игнорирует заранее сгенерированные appearance.
    acro.set(PDFName.of('NeedAppearances'), doc.context.obj(true));
  },

  async download(config, schema) {
    const bytes = await this.generate(config, schema);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anketa-pioneer-school.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

window.PdfFormExport = PdfFormExport;
