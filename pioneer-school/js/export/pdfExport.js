// pdfExport.js — генерация PDF-отчётов (jsPDF)
// Весь текст — настоящим текстом встроенного шрифта Noto Sans (общий шрифт PDF
// всего приложения, shared/fonts/noto-sans-pdf-regular.js; до Ф6 визуального
// аудита 24.10.2026 — субсет DejaVu). Раньше списки и формуляры рисовались
// построчно картинками через canvas: текст не выделялся, файлы были тяжёлыми
// (список из 12 учащихся — 424 КБ). Решение Алекса 21.10.2026, п.26 аудита.

const PdfExport = {
  // Единая проверка внешней библиотеки. Раньше при недоступном CDN
  // `const { jsPDF } = window.jspdf` падал с TypeError, и кнопка экспорта
  // просто «ничего не делала» — без единого сообщения пользователю
  // (в excelExport такая проверка уже была, здесь её не хватало).
  _requireJsPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      const message = 'Библиотека для PDF не загрузилась. Проверьте подключение к интернету и обновите страницу.';
      alert(message);
      throw new Error(message);
    }
    return window.jspdf.jsPDF;
  },

  /** Новый A4-документ со встроенным кириллическим шрифтом. */
  _textDoc(orientation) {
    const jsPDF = this._requireJsPdf();
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: orientation || 'portrait' });
    this._ensureCyrillicFont(doc);
    doc.setFont('NotoSans', 'normal');
    doc.setTextColor(20);
    return doc;
  },

  /**
   * Абзац текстом с переносом по ширине; перенос страницы — между строками,
   * а не посреди строки. Возвращает новый y.
   */
  _para(doc, text, x, y, { size = 11, width = 515, gap = 4, color = 20 } = {}) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineH = size * 1.3;
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.splitTextToSize(this._sanitizeForFont(text), width).forEach((line) => {
      if (y + lineH > pageHeight - 40) { doc.addPage(); y = 50; }
      doc.text(line, x, y, { baseline: 'top' });
      y += lineH;
    });
    return y + gap;
  },

  async buildDocument(title, lines) {
    const doc = this._textDoc();
    let y = this._para(doc, title, 40, 50, { size: 16, gap: 12 });
    for (const line of lines) y = this._para(doc, line, 40, y, { size: 11 });
    return doc;
  },

  // Список учащихся — таблицей, без выбывших (п.26 аудита): раньше это был
  // сплошной текст «столбец: значение · …» по каждому, включая выбывших.
  async downloadStudentList(students, columns, classesById) {
    const cols = columns && columns.length ? columns : await Students.getColumns();
    const byKey = (k) => cols.find((c) => c.key === k);
    const value = (s, k) => { const c = byKey(k); return c ? this._formatValue(c, (s.values || {})[k]) : ''; };
    const active = students.filter((s) => (s.values || {}).status !== 'withdrawn');
    const label = (k, fallback) => { const c = byKey(k); return c ? (Students.label ? Students.label(c) : c.label) : fallback; };
    const head = ['№', `${label('lastName', '')} ${label('firstName', '')}`.trim(), D('doc.ps.list.class'), label('phone', 'Tel.'), label('email', 'E-mail')];
    const rows = active.map((s, i) => [
      String(i + 1),
      `${value(s, 'lastName')} ${value(s, 'firstName')}`.trim(),
      classesById[s.classId] ? classesById[s.classId].name : D('doc.ps.list.no_class'),
      value(s, 'phone'),
      value(s, 'email'),
    ]);
    const doc = this._textDoc();
    let y = this._para(doc, D('doc.ps.list.students_title'), 40, 50, { size: 16, gap: 12 });
    this._table(doc, head, rows, y, [28, 170, 110, 100, 107]);
    doc.save('students-list.pdf');
  },

  /** Простая таблица текстом: перенос внутри ячейки, строка не режется страницей, шапка повторяется. */
  _table(doc, head, rows, y, widths) {
    const x0 = 40, size = 9.5, lineH = size * 1.3, pad = 4;
    const pageHeight = doc.internal.pageSize.getHeight();
    const draw = (cells, isHead) => {
      doc.setFontSize(size);
      const wrapped = cells.map((c, i) => doc.splitTextToSize(this._sanitizeForFont(c || ''), widths[i] - pad * 2));
      const h = Math.max(...wrapped.map((w) => w.length)) * lineH + pad * 2;
      if (y + h > pageHeight - 40) { doc.addPage(); y = 50; if (!isHead) draw(head, true); }
      let x = x0;
      if (isHead) { doc.setFillColor(238, 242, 240); doc.rect(x0, y, widths.reduce((a, b) => a + b, 0), h, 'F'); }
      doc.setDrawColor(200); doc.setTextColor(isHead ? 60 : 20);
      wrapped.forEach((lines, i) => {
        doc.rect(x, y, widths[i], h);
        lines.forEach((line, k) => doc.text(line, x + pad, y + pad + k * lineH, { baseline: 'top' }));
        x += widths[i];
      });
      y += h;
    };
    draw(head, true);
    rows.forEach((r) => draw(r, false));
    return y;
  },

  _formatValue(column, raw) {
    if (raw === undefined || raw === null || raw === '') return '';
    if (column.type === 'select' && Array.isArray(column.options)) {
      const opt = column.options.find((o) => o.value === raw);
      return opt ? opt.label : raw;
    }
    return String(raw);
  },

  // Формуляр одного учащегося — компактная карточка со всеми его данными.
  // Используется как для скачивания по одному студенту, так и как «страница» в общем PDF.
  _renderStudentFormulaire(doc, student, columns, classLabel, startY, pageHeight, marginX) {
    let y = startY;
    const fullName = `${(student.values || {}).lastName || ''} ${(student.values || {}).firstName || ''}`.trim() || D('doc.ps.form.no_name');
    y = this._para(doc, D('doc.ps.form.student_title', { name: fullName }), marginX, y, { size: 15, gap: 8 });
    if (classLabel) y = this._para(doc, `${D('doc.ps.list.class')}: ${classLabel}`, marginX, y, { size: 11, gap: 8 });
    for (const col of columns) {
      const value = this._formatValue(col, (student.values || {})[col.key]) || '—';
      y = this._para(doc, `${col.label}: ${value}`, marginX, y, { size: 11.5, gap: 5 });
    }
    return y;
  },

  async downloadStudentFormulaire(student, columns, classLabel) {
    const doc = this._textDoc();
    const pageHeight = doc.internal.pageSize.getHeight();
    this._renderStudentFormulaire(doc, student, columns, classLabel, 50, pageHeight, 40);
    const fullName = `${(student.values || {}).lastName || ''}-${(student.values || {}).firstName || ''}`.trim() || 'student';
    doc.save(`formulaire-${fullName}.pdf`);
  },

  // Один PDF, одна страница на каждого учащегося — удобно распечатать/разослать всем сразу.
  async downloadAllStudentFormulaires(students, columns, classesById) {
    const doc = this._textDoc();
    const pageHeight = doc.internal.pageSize.getHeight();
    students.forEach((s, idx) => {
      if (idx > 0) doc.addPage();
      const classLabel = classesById && classesById[s.classId] ? classesById[s.classId].name : '';
      this._renderStudentFormulaire(doc, s, columns, classLabel, 50, pageHeight, 40);
    });
    doc.save('formulaires-all.pdf');
  },

  // ——— Формуляр регистрации (register.html) ———
  // Подписи вариантов берём из схемы анкеты: она уже на языке ДОКУМЕНТА и
  // является единственным источником. Раньше здесь лежала третья копия тех же
  // справочников (Registration.*_LABELS плюс локальный запасной вариант),
  // и жила она языком интерфейса — то есть польская анкета получала русские
  // «Да/Нет», даже когда всё остальное было переведено.
  _optLabel(fieldKey, value) {
    const S = window.RegistrationSchema;
    if (!S || value === undefined || value === null || value === '') return '';
    return S.labelForValue(fieldKey, value) || '';
  },

  // Дата в языке документа: у польского и немецкого формуляра русское
  // «12 марта 2026 г.» выглядело бы опечаткой.
  _formatDocDate(value) {
    return (typeof PSDocLang !== 'undefined') ? PSDocLang.date(value) : String(value || '');
  },

  /* buildRegistrationLines() и downloadRegistrationFormulaire() удалены
     30.08.2026 вместе с трактом выдачи PDF на публичной странице анкеты.
     Их вызывали только две кнопки register.html; тракт признан мёртвым
     владельцем проекта. Карточка регистрации как бумага больше не
     существует — анкета уходит письмом и в WhatsApp текстом. */

  async downloadTextbookOrder(order) {
    const yn = (flag) => (flag ? D('doc.ps.yes_short') : D('doc.ps.no_short'));
    const lines = [
      `${D('doc.ps.order.requested')}: ${order.requestedByStudents || 0}`,
      `${D('doc.ps.order.in_stock')}: ${order.alreadyInStock || 0}`,
      `${D('doc.ps.order.to_order_full')}: ${order.orderQuantity ?? Textbooks.calcOrderQuantity(order)}`,
      `${D('doc.ps.order.received')}: ${yn(order.received)}`,
      `${D('doc.ps.order.recounted')}: ${yn(order.recountedOnReceipt)}`,
      '',
      D('doc.ps.order.other_langs'),
      ...(order.otherLanguageRequests || []).map((r) => `  ${r.language}: ${r.qty}`),
      '',
      D('doc.ps.order.braille'),
      ...(order.brailleRequests || []).map((r) => `  ${r.studentName || r.studentId}: ${r.format}`)
    ];
    const doc = await this.buildDocument(D('doc.ps.order.title'), lines);
    doc.save('textbook-order.pdf');
  },

  async downloadRegistrations(registrations) {
    const lines = registrations.map((r) => {
      const attending = this._optLabel('attending', r.attending) || '—';
      const reason = r.attending === 'no' && r.attendReason ? ` (${D('doc.ps.regs.reason')}: ${r.attendReason})` : '';
      const lang = this._optLabel('language', r.language) || r.language || '—';
      const formats = (r.format || []).map((f) => this._optLabel('format', f) || f).join(', ');
      return `${r.lastName} ${r.firstName} — ${D('doc.ps.regs.phone')}: ${r.phone || '—'} — ${D('doc.ps.regs.email')}: ${r.email || '—'} — ` +
        `${D('doc.ps.regs.attending')}: ${attending}${reason} — ${D('doc.ps.regs.car')}: ${this._optLabel('transport', r.transport) || '—'} — ` +
        `${D('doc.ps.regs.lodging')}: ${this._optLabel('lodging', r.lodging) || '—'} — ${D('doc.ps.regs.language')}: ${lang}` +
        `${formats ? ' — ' + D('doc.ps.regs.format') + ': ' + formats : ''}`;
    });
    const doc = await this.buildDocument(D('doc.ps.regs.title'), lines);
    doc.save('registrations.pdf');
  },

  // ---------- Печатный бланк регистрации (для рассылки пионерам) ----------
  // Как и весь файл, бланк набран встроенным шрифтом Noto Sans (субсет).
  //
  // Важное ограничение (проверено на практике): сделать этот PDF по-настоящему
  // интерактивным (с полями, которые пионер печатает прямо в Adobe/Preview)
  // ненадёжно — у jsPDF нет способа привязать встроенный кириллический шрифт
  // к полю так, чтобы ЛЮБОЙ PDF-редактор корректно показывал вводимый текст
  // (только к содержимому на момент создания). Поэтому бланк — для печати и
  // заполнения от руки, либо как приложение к ссылке на онлайн-формуляр
  // (register.html), а не замена ему.
  // ⚠️ ПРОВЕРКА ИДЁТ ПО ДОКУМЕНТУ, А НЕ ПО ФЛАГУ НА PdfExport. Так было до
  // 14.08.2026: флаг `this._cyrillicFontLoaded` жил на модуле и после первого
  // PDF навсегда оставался true, а addFont() регистрирует шрифт в КОНКРЕТНОМ
  // экземпляре jsPDF. Второй бланк за ту же сессию (без перезагрузки страницы)
  // молча уходил на встроенный `times`, и кириллица в нём ломалась.
  // Воспроизведено на jsPDF 2.5.1: setFont(<встроенный>) во втором документе
  // пишет в консоль «Unable to look up font label» и возвращает `times`.
  _ensureCyrillicFont(doc) {
    var list = typeof doc.getFontList === 'function' ? doc.getFontList() : null;
    if (list && list.NotoSans) return;
    if (!window.PDF_FONT_NOTO_SANS) throw new Error('Шрифт для PDF-бланка не загрузился.');
    doc.addFileToVFS('NotoSans.ttf', window.PDF_FONT_NOTO_SANS);
    doc.addFont('NotoSans.ttf', 'NotoSans', 'normal');
  },

  // Шрифт бланка урезан (см. scripts/build-pdf-font-subset.mjs) до ASCII +
  // Latin-1 Supplement + Latin Extended-A + всей кириллицы + пунктуации. Любой
  // символ ВНЕ этого набора (например, «·», emoji, стрелки) не отрисуется — и,
  // что важнее, jsPDF при этом обрежет ВЕСЬ текстовый вызов начиная с этого
  // символа, без ошибки и без предупреждения (проверено на практике). Эта
  // функция подстраховывает: заменяет неизвестные символы на «-», чтобы одна
  // забытая точка/тире не «съедала» остаток строки.
  //
  // ДИАПАЗОНЫ ЗДЕСЬ И В ШРИФТЕ ДОЛЖНЫ СОВПАДАТЬ. До подключения языка документа
  // whitelist был `\x20-\x7E`, три знака и кириллица — то есть ł ż ą ä ö ü ß
  // превращались в дефисы ещё до шрифта, и польский бланк печатался как
  // «Szko-a». Расширяя набор глифов скриптом scripts/build-pdf-font-subset.mjs,
  // править и эту строку; скрипт предупреждает, если они разошлись.
  //   \u00A0-\u017F — Latin-1 Supplement + Latin Extended-A (de/pl/en)
  //   \u0400-\u04FF — кириллица целиком (ru + uk)
  //   \u2013\u2014\u2018-\u201E\u2026\u2116 — тире, кавычки, многоточие, №
  _sanitizeForFont(str) {
    return String(str ?? '').replace(/[^\x20-\x7E\u00A0-\u017F\u0400-\u04FF\u2013\u2014\u2018-\u201E\u2026\u2116]/g, '-');
  },

  _checkbox(doc, x, y, label, size = 9) {
    doc.setDrawColor(90);
    doc.rect(x, y - size + 2, size, size);
    doc.setFont('NotoSans');
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(this._sanitizeForFont(label), x + size + 4, y);
  },

  _sectionTitle(doc, y, text) {
    doc.setFont('NotoSans');
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(this._sanitizeForFont(text), 40, y);
    doc.setDrawColor(200);
    doc.line(40, y + 4, 555, y + 4);
    return y + 22;
  },

  // Подпись. `maxWidth` — ширина, после которой текст переносится на
  // следующую строку.
  //
  // ЗАЧЕМ ПЕРЕНОС. Без него jsPDF рисует строку одной линией и молча уводит
  // хвост за правое поле — бумага обрезает. Вопрос про автомобиль вылезал на
  // 16 пунктов уже по-русски (531 при 515 доступных); в немецком и польском
  // те же вопросы длиннее ещё на четверть. Соседний _labelLine умеет
  // ужиматься с 09.08.2026, _label — не умел.
  //
  // @returns {number} y последней нарисованной строки: если подпись заняла
  //   две строки, вызывающий код должен знать об этом, иначе следующий
  //   элемент ляжет поверх.
  _label(doc, x, y, text, size = 11, maxWidth = 0) {
    doc.setFont('NotoSans');
    doc.setFontSize(size);
    doc.setTextColor(20);
    const safe = this._sanitizeForFont(text);
    if (!maxWidth) {
      doc.text(safe, x, y);
      return y;
    }
    const lines = doc.splitTextToSize(safe, maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length - 1) * (size + 3);
  },

  // Двоеточие после подписи дорисовывается здесь, а не хранится в словаре:
  // переводчику достаётся чистая подпись без пунктуации, одинаковая для
  // бумаги и онлайн-анкеты. Пустую строку не трогаем — «:» в одиночестве
  // выглядел бы как опечатка.
  _withColon(text) {
    return text ? text + ':' : text;
  },

  _answerLine(doc, x, y, width) {
    doc.setDrawColor(140);
    doc.line(x, y, x + width, y);
  },

  // Подпись и линия для ответа рядом с ней.
  //
  // ЗАЧЕМ НЕ ПРОСТО ДВА ВЫЗОВА. Координаты линий в бланке подобраны на глаз под
  // русские подписи: «Фамилия:» кончается раньше x=100, поэтому линия начинается
  // со 100. В немецком и польском те же подписи длиннее, и линия прошла бы прямо
  // по буквам. Поэтому заданная координата — МИНИМУМ, а не точное место: если
  // подпись шире, линия сдвигается вправо и на столько же укорачивается, не
  // вылезая за правое поле. На русском раскладка не меняется ни на пункт.
  _labelLine(doc, x, y, text, lineX, lineWidth, size = 11) {
    const label = this._withColon(text);
    this._label(doc, x, y, label, size);
    const start = Math.max(lineX, x + doc.getTextWidth(this._sanitizeForFont(label)) + 8);
    const end = lineX + lineWidth;
    if (end > start + 20) this._answerLine(doc, start, y + 2, end - start);
  },

  // Ряд чекбоксов с подписями. `x` каждого элемента — тоже минимум: элементы
  // текут слева направо, и длинная подпись сдвигает следующий, а не оказывается
  // под ним. Если ряд перестаёт помещаться по ширине, он переносится.
  // @returns {number} новый y
  _checkboxRow(doc, y, items, size = 9) {
    const RIGHT = 555;
    let cursor = 0;
    for (const item of items) {
      doc.setFont('NotoSans');
      doc.setFontSize(11);
      const width = size + 4 + doc.getTextWidth(this._sanitizeForFont(item.label)) + 18;
      let x = Math.max(item.x, cursor);
      if (x + width > RIGHT && cursor > 0) { y += 20; x = items[0].x; }
      this._checkbox(doc, x, y, item.label, size);
      cursor = x + width;
    }
    // Правый край последнего элемента: тому, кто дорисовывает линию для
    // ответа следом за рядом («Другой: ______»), нужно знать, где ряд
    // реально кончился. С жёсткой координатой линия заходила под подпись —
    // «Другой:» дотягивался до 506, а линия начиналась с 475.
    this._lastCheckboxRowEnd = cursor;
    return y;
  },

  // Заголовок раздела для бумаги — ИЗ СХЕМЫ, вместе с номером.
  // Раскладка бланка своя (подобранные координаты в две колонки), но названия
  // и порядок разделов обязаны совпадать с онлайн-анкетой и интерактивным PDF.
  // Номер приписывает схема: в словаре его нет — там чистое название.
  _sectionHeading(id) {
    const S = window.RegistrationSchema;
    const section = S && S.sectionById(id);
    return section ? section.heading : '';
  },

  async downloadRegistrationBlankForm(config) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    this._ensureCyrillicFont(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 50;

    const opt = (field, value) => this._optLabel(field, value);
    const yes = opt('attending', 'yes');
    const no = opt('attending', 'no');

    doc.setFont('NotoSans');
    doc.setFontSize(18);
    doc.setTextColor(20);
    /* Перенос по maxWidth занимает несколько строк: сдвиг считаем по их числу,
       иначе длинный заголовок наезжает на подзаголовок. */
    const titleLines = doc.splitTextToSize(this._sanitizeForFont(config.title || D('doc.ps.reg.title')), pageWidth - 80);
    doc.text(titleLines, 40, y);
    y += 4 + titleLines.length * 21;
    doc.setFontSize(11);
    doc.setTextColor(90);
    const leadLines = doc.splitTextToSize(this._sanitizeForFont(D('doc.ps.blank.lead')), pageWidth - 80);
    doc.text(leadLines, 40, y);
    y += 12 + leadLines.length * 13;

    // 1. Личные данные
    y = this._sectionTitle(doc, y, this._sectionHeading('personal'));
    this._labelLine(doc, 40, y, D('doc.ps.field.lastName'), 100, 200);
    this._labelLine(doc, 320, y, D('doc.ps.field.firstName'), 360, 195);
    y += 26;
    this._labelLine(doc, 40, y, D('doc.ps.field.address'), 155, 400);
    y += 26;
    this._labelLine(doc, 40, y, D('doc.ps.field.email'), 90, 220);
    this._labelLine(doc, 330, y, D('doc.ps.reg.field.phone'), 445, 110);
    y += 34;

    // 2. Участие
    y = this._sectionTitle(doc, y, this._sectionHeading('attendance'));
    y = this._label(doc, 40, y, D('doc.ps.reg.field.attending'), 11, 515);
    y += 20;
    y = this._checkboxRow(doc, y, [{ x: 40, label: yes }, { x: 140, label: no }]);
    y += 22;
    this._labelLine(doc, 40, y, D('doc.ps.reg.field.attendReason'), 210, 345);
    y += 34;

    // 3. Транспорт
    y = this._sectionTitle(doc, y, this._sectionHeading('transport'));
    y = this._label(doc, 40, y, D('doc.ps.reg.field.transport'), 11, 515);
    y += 20;
    y = this._checkboxRow(doc, y, [{ x: 40, label: yes }, { x: 140, label: no }]);
    y += 34;

    // 4. Проживание
    y = this._sectionTitle(doc, y, this._sectionHeading('lodging'));
    y = this._label(doc, 40, y, D('doc.ps.reg.field.lodging'), 11, 515);
    y += 20;
    y = this._checkboxRow(doc, y, [{ x: 40, label: yes }, { x: 140, label: no }]);
    y += 34;

    // 5. Учебник
    y = this._sectionTitle(doc, y, this._sectionHeading('textbook'));
    y = this._label(doc, 40, y, this._withColon(D('doc.ps.field.language')), 11, 515);
    y += 20;
    y = this._checkboxRow(doc, y, [
      { x: 40, label: opt('language', 'ru') }, { x: 140, label: opt('language', 'uk') },
      { x: 250, label: opt('language', 'pl') }, { x: 340, label: opt('language', 'de') },
      { x: 430, label: this._withColon(D('doc.ps.reg.opt.lang.other')) }
    ]);
    // Линия начинается после подписи ряда, а не с жёсткой координаты.
    // ОГРАНИЧЕНИЕ: если перевод подписи длинный (немецкое «Andere Sprache:»
    // дотягивается до 553), места на строке не остаётся и линия не рисуется
    // вовсе — это лучше, чем линия поверх букв, но поле для ответа при этом
    // пропадает. Всплывёт, когда придут переводы; отмечено в TODO.md.
    const otherStart = Math.max(475, (this._lastCheckboxRowEnd || 0) - 12);
    if (555 > otherStart + 20) this._answerLine(doc, otherStart, y + 2, 555 - otherStart);
    y += 26;
    y = this._label(doc, 40, y, this._withColon(D('doc.ps.reg.field.format')), 11, 515);
    y += 20;
    y = this._checkboxRow(doc, y, [
      { x: 40, label: D('doc.ps.reg.opt.format.print') }, { x: 150, label: 'JWPub' },
      { x: 250, label: 'PDF' }, { x: 340, label: 'EPUB' }
    ]);
    y += 34;

    // 6. Дополнительные сведения
    y = this._sectionTitle(doc, y, this._sectionHeading('extra'));
    y = this._label(doc, 40, y, this._withColon(D('doc.ps.reg.field.notes')), 10.5, 515);
    y += 20;
    for (let i = 0; i < 3; i++) { this._answerLine(doc, 40, y, 515); y += 22; }
    y += 6;

    // Информация для учащегося
    if (y > pageHeight - 140) { doc.addPage(); y = 50; }
    doc.setDrawColor(210);
    doc.line(40, y, 555, y);
    y += 20;
    doc.setFont('NotoSans');
    doc.setFontSize(10.5);
    doc.setTextColor(70);
    const closingLines = doc.splitTextToSize(this._sanitizeForFont(D('doc.ps.reg.closing')), 515);
    doc.text(closingLines, 40, y);
    y += closingLines.length * 13 + 10;

    const askElder = D('doc.ps.send.ask_elder');
    const deadline = config.deadline ? this._formatDocDate(config.deadline) : askElder;
    doc.setTextColor(20);
    // Двоеточие и значение дорисовываются здесь: в словаре лежит чистая
    // подпись, одинаковая для бланка, онлайн-страницы и интерактивного PDF.
    doc.text(this._sanitizeForFont(`${this._withColon(D('doc.ps.send.deadline'))} ${deadline}`), 40, y);
    y += 16;
    doc.text(this._sanitizeForFont(this._withColon(D('doc.ps.send.how'))), 40, y); y += 14;
    // Дефис списка — тоже разметка, а не текст: он был частью строки словаря
    // и переводчику пришлось бы помнить, что его нельзя терять.
    doc.text(this._sanitizeForFont(`- ${this._withColon(D('doc.ps.send.by_email'))} ${config.email || askElder}`), 50, y); y += 14;
    doc.text(this._sanitizeForFont(`- ${this._withColon(D('doc.ps.send.by_whatsapp'))} ${config.whatsapp || askElder}`), 50, y);

    doc.save('registration-blank-form.pdf');
  },

  async downloadS253(data) {
    const lines = [
      D('doc.ps.s253.page1'),
      ...(data.notAttendedFromList || []).map((s) => `  ${s.name} — ${s.reason || D('doc.ps.s253.no_comment')}`),
      '',
      D('doc.ps.s253.page2'),
      ...(data.attendedNotOnList || []).map((s) => `  ${s.name} — ${s.congregation || ''}`)
    ];
    const doc = await this.buildDocument(D('doc.ps.s253.title'), lines);
    doc.save('s253-report.pdf');
  },

  // ---------- Письмо учащемуся (фаза 6, 14.08.2026) ----------
  // Своя вёрстка, а не buildDocument(): у письма заголовок по центру и
  // абзацы из шаблона.
  //
  // ЖИРНОГО НАЧЕРТАНИЯ НЕТ. В набор Школы грузится только normal
  // (scripts/build-pdf-font-subset.mjs), второе начертание удвоило бы вес
  // набора. Поэтому `**` из текста вычищаются: показать звёздочки в готовом
  // письме хуже, чем потерять выделение (решение Алекса 14.08.2026).
  _stripBold(str) {
    return String(str ?? '').replace(/\*\*/g, '');
  },

  /**
   * @param {Object} input
   *   {string} input.title — заголовок документа (имя из библиотеки шаблонов)
   *   {string} input.body  — ГОТОВЫЙ текст, подстановка уже выполнена
   * @returns {Object} jsPDF
   */
  buildLetterDoc({ title, body }) {
    const jsPDF = this._requireJsPdf();
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    this._ensureCyrillicFont(doc);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 56;
    const marginTop = 64;
    const marginBottom = 56;
    const maxWidth = pageWidth - marginX * 2;
    const LINE = 16;
    let y = marginTop;

    // Шрифт и кегль переустанавливаются после КАЖДОГО addPage(): jsPDF не
    // переносит их на новую страницу сам, и второй лист письма печатался бы
    // встроенным шрифтом — то есть без кириллицы.
    const setBody = () => { doc.setFont('NotoSans'); doc.setFontSize(11.5); doc.setTextColor(20); };

    if (title) {
      doc.setFont('NotoSans');
      doc.setFontSize(14);
      doc.setTextColor(20);
      doc.splitTextToSize(this._sanitizeForFont(this._stripBold(title)), maxWidth).forEach((line) => {
        doc.text(line, marginX, y);
        y += 19;
      });
      y += 10;
    }

    setBody();
    // Перевод строки в шаблоне — это перевод строки в письме: текст пришёл из
    // поля `format: 'text'`, где перенос набран человеком осмысленно. Пустая
    // строка даёт отбивку абзаца, а не полную пустую строку: иначе письмо
    // растягивается на лишний лист.
    String(body ?? '').split(/\r?\n/).forEach((paragraph) => {
      const safe = this._sanitizeForFont(this._stripBold(paragraph));
      if (!safe.trim()) { y += LINE * 0.6; return; }
      doc.splitTextToSize(safe, maxWidth).forEach((line) => {
        if (y > pageHeight - marginBottom) { doc.addPage(); setBody(); y = marginTop; }
        doc.text(line, marginX, y);
        y += LINE;
      });
    });

    return doc;
  },

  downloadLetter({ title, body, filename }) {
    const doc = this.buildLetterDoc({ title, body });
    doc.save(filename || 'letter.pdf');
  }
};

window.PdfExport = PdfExport;
