// pdfExport.js — генерация PDF-отчётов (jsPDF)
// Кириллица: стандартные встроенные шрифты jsPDF не поддерживают кириллицу,
// поэтому для текста используем canvas->image приём (рендерим текст через HTML5 Canvas
// и вставляем как изображение построчно) — тот же обходной путь, что и в Visit Planner.

const PdfExport = {
  _canvasLineToImage(text, { fontSize = 12, bold = false, width = 700 } = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = 2; // для чёткости
    canvas.width = width * scale;
    canvas.height = (fontSize + 10) * scale;
    ctx.scale(scale, scale);
    ctx.font = `${bold ? 'bold ' : ''}${fontSize}px Arial, sans-serif`;
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
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginX = 40;
    let y = 50;
    const pageHeight = doc.internal.pageSize.getHeight();

    const titleImg = this._canvasLineToImage(title, { fontSize: 16, bold: true, width: 500 });
    doc.addImage(titleImg.dataUrl, 'PNG', marginX, y, titleImg.width, titleImg.height);
    y += titleImg.height + 16;

    for (const line of lines) {
      const img = this._canvasLineToImage(line || ' ', { fontSize: 11, width: 500 });
      if (y + img.height > pageHeight - 40) {
        doc.addPage();
        y = 50;
      }
      doc.addImage(img.dataUrl, 'PNG', marginX, y, img.width, img.height);
      y += img.height + 4;
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
    doc.addImage(titleImg.dataUrl, 'PNG', marginX, y, titleImg.width, titleImg.height);
    y += titleImg.height + 10;

    if (classLabel) {
      const clsImg = this._canvasLineToImage(`Класс: ${classLabel}`, { fontSize: 11, width: 500 });
      doc.addImage(clsImg.dataUrl, 'PNG', marginX, y, clsImg.width, clsImg.height);
      y += clsImg.height + 8;
    }

    for (const col of columns) {
      const raw = (student.values || {})[col.key];
      const value = this._formatValue(col, raw) || '—';
      const line = `${col.label}: ${value}`;
      const img = this._canvasLineToImage(line, { fontSize: 11.5, width: 500 });
      if (y + img.height > pageHeight - 40) { doc.addPage(); y = 50; }
      doc.addImage(img.dataUrl, 'PNG', marginX, y, img.width, img.height);
      y += img.height + 5;
    }
    return y;
  },

  async downloadStudentFormulaire(student, columns, classLabel) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    this._renderStudentFormulaire(doc, student, columns, classLabel, 50, pageHeight, 40);
    const fullName = `${(student.values || {}).lastName || ''}-${(student.values || {}).firstName || ''}`.trim() || 'student';
    doc.save(`formulaire-${fullName}.pdf`);
  },

  // Один PDF, одна страница на каждого учащегося — удобно распечатать/разослать всем сразу.
  async downloadAllStudentFormulaires(students, columns, classesById) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    students.forEach((s, idx) => {
      if (idx > 0) doc.addPage();
      const classLabel = classesById && classesById[s.classId] ? classesById[s.classId].name : '';
      this._renderStudentFormulaire(doc, s, columns, classLabel, 50, pageHeight, 40);
    });
    doc.save('formulaires-all.pdf');
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
