// pdfExport.js — генерация PDF-отчётов (jsPDF)
// Кириллица: стандартные встроенные шрифты jsPDF не поддерживают кириллицу,
// поэтому для текста используем canvas->image приём (рендерим текст через HTML5 Canvas
// и вставляем как изображение построчно) — тот же обходной путь, что и в Visit Planner.

// Растр текста без сжатия jsPDF кладёт в документ как есть, из-за чего формуляр
// на одну страницу весил около мегабайта и его было тяжело отправить письмом
// или в WhatsApp с телефона. Строки почти целиком белые и жмутся очень хорошо.
const IMG_COMPRESSION = 'SLOW';

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

  // Разбивает строку на части, которые физически помещаются в заданную ширину.
  // Без этого длинные строки (например, карточка учащегося со всеми столбцами)
  // просто обрезались за краем canvas и молча пропадали из готового PDF.
  _wrapText(text, { fontSize = 12, bold = false, width = 500 } = {}) {
    const raw = String(text ?? '');
    if (!raw.trim()) return [' '];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [raw]; // окружение без canvas — лучше отдать строку как есть, чем упасть
    ctx.font = `${bold ? 'bold ' : ''}${fontSize}px Arial, sans-serif`;
    if (ctx.measureText(raw).width <= width) return [raw];

    const lines = [];
    let current = '';
    for (const word of raw.split(/\s+/)) {
      const candidate = current ? current + ' ' + word : word;
      if (ctx.measureText(candidate).width <= width) { current = candidate; continue; }
      if (current) lines.push(current);
      // Отдельное слово шире строки (длинный адрес или e-mail) — режем посимвольно.
      if (ctx.measureText(word).width <= width) { current = word; continue; }
      let chunk = '';
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width > width && chunk) { lines.push(chunk); chunk = ch; }
        else chunk += ch;
      }
      current = chunk;
    }
    if (current) lines.push(current);
    return lines.length ? lines : [' '];
  },

  _canvasLineToImage(text, { fontSize = 12, bold = false, width = 700 } = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = 2; // для чёткости
    const font = `${bold ? 'bold ' : ''}${fontSize}px Arial, sans-serif`;

    // Ширину холста подгоняем под фактическую длину строки, а не под максимально
    // допустимую. Раньше каждая строка сохранялась как PNG во всю ширину полосы
    // набора, и готовый файл раздувался до нескольких мегабайт (формуляр на одну
    // страницу весил ~2,4 МБ) — такой PDF тяжело отправить письмом.
    const measure = document.createElement('canvas').getContext('2d');
    let lineWidth = width;
    if (measure) {
      measure.font = font;
      lineWidth = Math.min(width, Math.ceil(measure.measureText(text).width) + 2);
    }
    lineWidth = Math.max(1, lineWidth);

    canvas.width = lineWidth * scale;
    canvas.height = (fontSize + 10) * scale;
    ctx.scale(scale, scale);
    // Непрозрачная белая подложка: PNG с альфа-каналом заставляет jsPDF писать в
    // документ дополнительную маску прозрачности на каждую строку, что почти
    // удваивало размер файла. Страница всё равно белая, потери нет.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lineWidth, fontSize + 10);
    ctx.font = font;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    ctx.fillText(text, 0, 2);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width / scale,
      height: canvas.height / scale
    };
  },

  async buildDocument(title, lines) {
    const jsPDF = this._requireJsPdf();
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginX = 40;
    let y = 50;
    const pageHeight = doc.internal.pageSize.getHeight();

    const titleImg = this._canvasLineToImage(title, { fontSize: 16, bold: true, width: 500 });
    doc.addImage(titleImg.dataUrl, 'PNG', marginX, y, titleImg.width, titleImg.height, undefined, IMG_COMPRESSION);
    y += titleImg.height + 16;

    for (const line of lines) {
      for (const part of this._wrapText(line, { fontSize: 11, width: 500 })) {
        const img = this._canvasLineToImage(part, { fontSize: 11, width: 500 });
        if (y + img.height > pageHeight - 40) {
          doc.addPage();
          y = 50;
        }
        doc.addImage(img.dataUrl, 'PNG', marginX, y, img.width, img.height, undefined, IMG_COMPRESSION);
        y += img.height + 4;
      }
    }
    return doc;
  },

  async downloadStudentList(students, columns, classesById) {
    const cols = columns && columns.length ? columns : await Students.getColumns();
    const lines = students.map((s) => {
      const cls = classesById[s.classId] ? classesById[s.classId].name : 'без класса';
      const parts = cols.map((c) => {
        const raw = (s.values || {})[c.key];
        const label = this._formatValue(c, raw);
        return `${c.label}: ${label || '—'}`;
      });
      return `${parts.join(' · ')} · Класс: ${cls}`;
    });
    const doc = await this.buildDocument('Список учащихся — Школа пионерского служения', lines);
    doc.save('students-list.pdf');
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
    const fullName = `${(student.values || {}).lastName || ''} ${(student.values || {}).firstName || ''}`.trim() || 'Без имени';
    const titleImg = this._canvasLineToImage(`Формуляр учащегося: ${fullName}`, { fontSize: 15, bold: true, width: 500 });
    doc.addImage(titleImg.dataUrl, 'PNG', marginX, y, titleImg.width, titleImg.height, undefined, IMG_COMPRESSION);
    y += titleImg.height + 10;

    if (classLabel) {
      const clsImg = this._canvasLineToImage(`Класс: ${classLabel}`, { fontSize: 11, width: 500 });
      doc.addImage(clsImg.dataUrl, 'PNG', marginX, y, clsImg.width, clsImg.height, undefined, IMG_COMPRESSION);
      y += clsImg.height + 8;
    }

    for (const col of columns) {
      const raw = (student.values || {})[col.key];
      const value = this._formatValue(col, raw) || '—';
      const line = `${col.label}: ${value}`;
      // Длинные значения (адрес, доп. сведения) переносим, иначе они обрезались
      // по краю canvas и не попадали в готовый формуляр.
      for (const part of this._wrapText(line, { fontSize: 11.5, width: 500 })) {
        const img = this._canvasLineToImage(part, { fontSize: 11.5, width: 500 });
        if (y + img.height > pageHeight - 40) { doc.addPage(); y = 50; }
        doc.addImage(img.dataUrl, 'PNG', marginX, y, img.width, img.height, undefined, IMG_COMPRESSION);
        y += img.height + 5;
      }
    }
    return y;
  },

  async downloadStudentFormulaire(student, columns, classLabel) {
    const jsPDF = this._requireJsPdf();
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    this._renderStudentFormulaire(doc, student, columns, classLabel, 50, pageHeight, 40);
    const fullName = `${(student.values || {}).lastName || ''}-${(student.values || {}).firstName || ''}`.trim() || 'student';
    doc.save(`formulaire-${fullName}.pdf`);
  },

  // Один PDF, одна страница на каждого учащегося — удобно распечатать/разослать всем сразу.
  async downloadAllStudentFormulaires(students, columns, classesById) {
    const jsPDF = this._requireJsPdf();
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    students.forEach((s, idx) => {
      if (idx > 0) doc.addPage();
      const classLabel = classesById && classesById[s.classId] ? classesById[s.classId].name : '';
      this._renderStudentFormulaire(doc, s, columns, classLabel, 50, pageHeight, 40);
    });
    doc.save('formulaires-all.pdf');
  },

  // ——— Формуляр регистрации (register.html) ———
  // Публичная страница формуляра не грузит всё приложение, поэтому метки берём
  // из Registration, если он подключён, и подстраховываемся локальными копиями.
  _regLabels() {
    const R = window.Registration || {};
    return {
      yesNo: R.YES_NO_LABELS || { yes: 'Да', no: 'Нет' },
      language: R.LANGUAGE_LABELS || { ru: 'Русский', uk: 'Украинский', pl: 'Польский', de: 'Немецкий', other: 'Другой' },
      format: R.FORMAT_LABELS || { print: 'Печатный экземпляр', jwpub: 'Электронный JWPub', pdf: 'PDF', epub: 'EPUB' }
    };
  },

  _formatDateRu(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
  },

  buildRegistrationLines(record, config = {}) {
    const L = this._regLabels();
    const language = record.language === 'other'
      ? (record.languageOther || 'другой')
      : (L.language[record.language] || record.language || '');
    const formats = (record.format || []).map((f) => L.format[f] || f).join(', ');

    const lines = [
      `Дата заполнения: ${this._formatDateRu(record.submittedAt || new Date().toISOString())}`,
      '',
      `Фамилия: ${record.lastName || '—'}`,
      `Имя: ${record.firstName || '—'}`,
      `Адрес проживания: ${record.address || '—'}`,
      `Email: ${record.email || '—'}`,
      `Телефон: ${record.phone || '—'}`,
      '',
      `Смогу присутствовать на Школе: ${L.yesNo[record.attending] || '—'}`
    ];
    if (record.attending === 'no') lines.push(`Причина: ${record.attendReason || '—'}`);
    lines.push(
      `Могу приехать на своём транспорте: ${L.yesNo[record.transport] || '—'}`,
      `Нужен ночлег: ${L.yesNo[record.lodging] || '—'}`,
      '',
      `Язык учебника: ${language || '—'}`,
      `Формат учебника: ${formats || '—'}`,
      '',
      `Дополнительные сведения: ${record.notes || '—'}`
    );

    // Напоминание о сроке и адресате печатаем в самом формуляре: бумажную копию
    // часто заполняют заранее и отправляют позже, уже без открытой страницы.
    const footer = [];
    if (config.deadline) footer.push(`Срок сдачи формуляра: ${this._formatDateRu(config.deadline)}`);
    if (config.email) footer.push(`Отправить на email: ${config.email}`);
    if (config.whatsapp) footer.push(`Отправить в WhatsApp: ${config.whatsapp}`);
    if (footer.length) lines.push('', '— — —', ...footer);

    return lines;
  },

  async downloadRegistrationFormulaire(record, config = {}) {
    const title = config.title || 'Формуляр для Школы пионерского служения';
    const doc = await this.buildDocument(title, this.buildRegistrationLines(record, config));
    const namePart = `${record.lastName || ''}-${record.firstName || ''}`
      .trim()
      .replace(/[\\/:*?"<>|\s]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'registration';
    doc.save(`formulyar-${namePart}.pdf`);
  },

  async downloadTextbookOrder(order) {
    const lines = [
      `Запрошено учащимися: ${order.requestedByStudents || 0}`,
      `Уже в наличии: ${order.alreadyInStock || 0}`,
      `К заказу (запрошено + 5 − в наличии): ${order.orderQuantity ?? Textbooks.calcOrderQuantity(order)}`,
      `Получено: ${order.received ? 'да' : 'нет'}`,
      `Пересчитано при получении: ${order.recountedOnReceipt ? 'да' : 'нет'}`,
      '',
      'Иноязычные заявки:',
      ...(order.otherLanguageRequests || []).map((r) => `  ${r.language}: ${r.qty}`),
      '',
      'Заявки Брайль/спецформат (оформляются через S-59):',
      ...(order.brailleRequests || []).map((r) => `  ${r.studentName || r.studentId}: ${r.format}`)
    ];
    const doc = await this.buildDocument('Заказ учебников — Школа пионерского служения', lines);
    doc.save('textbook-order.pdf');
  },

  async downloadRegistrations(registrations) {
    const lines = registrations.map((r) => {
      const attending = Registration.YES_NO_LABELS[r.attending] || '—';
      const reason = r.attending === 'no' && r.attendReason ? ` (причина: ${r.attendReason})` : '';
      const lang = Registration.LANGUAGE_LABELS[r.language] || r.language || '—';
      const formats = (r.format || []).map((f) => Registration.FORMAT_LABELS[f] || f).join(', ');
      return `${r.lastName} ${r.firstName} — тел: ${r.phone || '—'} — email: ${r.email || '—'} — ` +
        `присутствие: ${attending}${reason} — авто: ${Registration.YES_NO_LABELS[r.transport] || '—'} — ` +
        `ночлег: ${Registration.YES_NO_LABELS[r.lodging] || '—'} — язык: ${lang}${formats ? ' — формат: ' + formats : ''}`;
    });
    const doc = await this.buildDocument('Регистрации учащихся — Школа пионерского служения', lines);
    doc.save('registrations.pdf');
  },

  // ---------- Печатный бланк регистрации (для рассылки пионерам) ----------
  // В отличие от остальных функций этого файла (которые рисуют кириллицу как
  // растровое изображение через canvas — рабочий, но более тяжёлый приём),
  // здесь используется НАСТОЯЩИЙ встроенный шрифт (DejaVu Sans, урезанный до
  // нужных символов). Это возможно только для СТАТИЧНОГО содержимого бланка.
  //
  // Важное ограничение (проверено на практике): сделать этот PDF по-настоящему
  // интерактивным (с полями, которые пионер печатает прямо в Adobe/Preview)
  // ненадёжно — у jsPDF нет способа привязать встроенный кириллический шрифт
  // к полю так, чтобы ЛЮБОЙ PDF-редактор корректно показывал вводимый текст
  // (только к содержимому на момент создания). Поэтому бланк — для печати и
  // заполнения от руки, либо как приложение к ссылке на онлайн-формуляр
  // (register.html), а не замена ему.
  _ensureCyrillicFont(doc) {
    if (this._cyrillicFontLoaded) return;
    if (!window.PDF_FONT_DEJAVU_SANS) throw new Error('Шрифт для PDF-бланка не загрузился.');
    doc.addFileToVFS('DejaVuSans.ttf', window.PDF_FONT_DEJAVU_SANS);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    this._cyrillicFontLoaded = true;
  },

  // Шрифт бланка урезан (см. js/export/fonts/dejavu-sans-subset.js) до Latin +
  // кириллицы + базовой пунктуации. Любой символ ВНЕ этого набора (например,
  // «·», emoji, стрелки) не отрисуется — и, что важнее, jsPDF при этом обрежет
  // ВЕСЬ текстовый вызов начиная с этого символа, без ошибки и без предупреждения
  // (проверено на практике). Эта функция подстраховывает: заменяет неизвестные
  // символы на «-», чтобы одна забытая точка/тире не «съедала» остаток строки.
  _sanitizeForFont(str) {
    return String(str ?? '').replace(/[^\x20-\x7E\u00A0\u00AB\u00BB\u2013\u2014\u2018-\u201E\u2026\u0400-\u04FF]/g, '-');
  },

  _checkbox(doc, x, y, label, size = 9) {
    doc.setDrawColor(90);
    doc.rect(x, y - size + 2, size, size);
    doc.setFont('DejaVuSans');
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(this._sanitizeForFont(label), x + size + 4, y);
  },

  _sectionTitle(doc, y, text) {
    doc.setFont('DejaVuSans');
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(this._sanitizeForFont(text), 40, y);
    doc.setDrawColor(200);
    doc.line(40, y + 4, 555, y + 4);
    return y + 22;
  },

  _label(doc, x, y, text, size = 11) {
    doc.setFont('DejaVuSans');
    doc.setFontSize(size);
    doc.setTextColor(20);
    doc.text(this._sanitizeForFont(text), x, y);
  },

  _answerLine(doc, x, y, width) {
    doc.setDrawColor(140);
    doc.line(x, y, x + width, y);
  },

  async downloadRegistrationBlankForm(config) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    this._ensureCyrillicFont(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 50;

    doc.setFont('DejaVuSans');
    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text(this._sanitizeForFont(config.title || 'Формуляр регистрации — Школа пионерского служения'), 40, y, { maxWidth: pageWidth - 80 });
    y += 22;
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text('Пожалуйста, заполните и передайте районному старейшине как можно скорее.', 40, y);
    y += 26;

    // 1. Личные данные
    y = this._sectionTitle(doc, y, '1. Личные данные');
    this._label(doc, 40, y, 'Фамилия:'); this._answerLine(doc, 100, y + 2, 200);
    this._label(doc, 320, y, 'Имя:'); this._answerLine(doc, 360, y + 2, 195);
    y += 26;
    this._label(doc, 40, y, 'Адрес проживания:'); this._answerLine(doc, 155, y + 2, 400);
    y += 26;
    this._label(doc, 40, y, 'Email:'); this._answerLine(doc, 90, y + 2, 220);
    this._label(doc, 330, y, 'Телефон (WhatsApp):'); this._answerLine(doc, 445, y + 2, 110);
    y += 34;

    // 2. Участие
    y = this._sectionTitle(doc, y, '2. Участие в школе');
    this._label(doc, 40, y, 'Будете ли вы присутствовать на Школе пионерского служения?');
    y += 20;
    this._checkbox(doc, 40, y, 'Да'); this._checkbox(doc, 140, y, 'Нет');
    y += 22;
    this._label(doc, 40, y, 'Если нет — укажите причину:'); this._answerLine(doc, 210, y + 2, 345);
    y += 34;

    // 3. Транспорт
    y = this._sectionTitle(doc, y, '3. Транспорт');
    this._label(doc, 40, y, 'Есть ли у вас автомобиль, на котором вы сможете самостоятельно добираться до Школы?');
    y += 20;
    this._checkbox(doc, 40, y, 'Да'); this._checkbox(doc, 140, y, 'Нет');
    y += 34;

    // 4. Проживание
    y = this._sectionTitle(doc, y, '4. Проживание');
    this._label(doc, 40, y, 'Нуждаетесь ли вы в месте для ночлега?');
    y += 20;
    this._checkbox(doc, 40, y, 'Да'); this._checkbox(doc, 140, y, 'Нет');
    y += 34;

    // 5. Учебник
    y = this._sectionTitle(doc, y, '5. Учебник для школы');
    this._label(doc, 40, y, 'Язык учебника:');
    y += 20;
    this._checkbox(doc, 40, y, 'Русский'); this._checkbox(doc, 140, y, 'Украинский');
    this._checkbox(doc, 250, y, 'Польский'); this._checkbox(doc, 340, y, 'Немецкий');
    this._checkbox(doc, 430, y, 'Другой:'); this._answerLine(doc, 475, y + 2, 80);
    y += 26;
    this._label(doc, 40, y, 'Формат учебника (можно выбрать несколько):');
    y += 20;
    this._checkbox(doc, 40, y, 'Печатный'); this._checkbox(doc, 150, y, 'JWPub');
    this._checkbox(doc, 250, y, 'PDF'); this._checkbox(doc, 340, y, 'EPUB');
    y += 34;

    // 6. Дополнительные сведения
    y = this._sectionTitle(doc, y, '6. Дополнительные сведения');
    this._label(doc, 40, y, 'Аллергии, особенности питания, состояние здоровья, другие важные замечания:', 10.5);
    y += 20;
    for (let i = 0; i < 3; i++) { this._answerLine(doc, 40, y, 515); y += 22; }
    y += 6;

    // Информация для учащегося
    if (y > pageHeight - 140) { doc.addPage(); y = 50; }
    doc.setDrawColor(210);
    doc.line(40, y, 555, y);
    y += 20;
    doc.setFont('DejaVuSans');
    doc.setFontSize(10.5);
    doc.setTextColor(70);
    const closing = 'Пожалуйста, заполните и отправьте этот формуляр как можно скорее. Это поможет своевременно подготовить всё необходимое для проведения школы. Благодарим за сотрудничество!';
    const closingLines = doc.splitTextToSize(this._sanitizeForFont(closing), 515);
    doc.text(closingLines, 40, y);
    y += closingLines.length * 13 + 10;

    const deadline = config.deadline ? new Date(config.deadline).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' }) : 'уточните у районного старейшины';
    doc.setTextColor(20);
    doc.text(this._sanitizeForFont(`Заполненный формуляр необходимо отправить не позднее: ${deadline}`), 40, y);
    y += 16;
    doc.text('Способ отправки:', 40, y); y += 14;
    doc.text(this._sanitizeForFont(`- на адрес электронной почты: ${config.email || 'уточните у районного старейшины'}`), 50, y); y += 14;
    doc.text(this._sanitizeForFont(`- через WhatsApp: ${config.whatsapp || 'уточните у районного старейшины'}`), 50, y);

    doc.save('registration-blank-form.pdf');
  },

  async downloadS253(data) {
    const lines = [
      'Страница 1 — из «Списка», но НЕ прошли обучение в этом районе в этом году:',
      ...(data.notAttendedFromList || []).map((s) => `  ${s.name} — ${s.reason || 'без комментария'}`),
      '',
      'Страница 2 — прошли обучение, но НЕ были в «Списке»:',
      ...(data.attendedNotOnList || []).map((s) => `  ${s.name} — ${s.congregation || ''}`)
    ];
    const doc = await this.buildDocument('S-253 — Прошедшие обучение в Школе пионерского служения', lines);
    doc.save('s253-report.pdf');
  }
};

window.PdfExport = PdfExport;
