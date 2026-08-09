// excelExport.js — экспорт CSV (открывается в Excel), UTF-8 BOM для корректной кириллицы

const ExcelExport = {
  _download(filename, csvContent) {
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  _escape(value) {
    let str = String(value ?? '');
    // Защита от формульной инъекции: значение, начинающееся с = + - @ (или с
    // табуляции/CR перед ними), Excel и Google Таблицы трактуют как формулу.
    // Данные сюда попадают из ручного ввода и импорта PDF, поэтому нейтрализуем
    // их одинарной кавычкой — она не отображается в ячейке.
    if (/^[\t\r]*[=+\-@]/.test(str)) str = "'" + str;
    if (/[",\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  },

  toCsv(headers, rows) {
    const lines = [headers.map((h) => this._escape(h)).join(',')];
    rows.forEach((row) => lines.push(row.map((v) => this._escape(v)).join(',')));
    return lines.join('\r\n');
  },

  _formatValue(column, raw) {
    if (raw === undefined || raw === null || raw === '') return '';
    if (column.type === 'select' && Array.isArray(column.options)) {
      const opt = column.options.find((o) => o.value === raw);
      return opt ? opt.label : raw;
    }
    return String(raw);
  },

  _buildStudentAoa(students, columns, classesById) {
    const headers = [...columns.map((c) => c.label), D('doc.ps.list.class')];
    const rows = students.map((s) => [
      ...columns.map((c) => this._formatValue(c, (s.values || {})[c.key])),
      classesById && classesById[s.classId] ? classesById[s.classId].name : ''
    ]);
    return { headers, rows };
  },

  downloadStudentsCsv(students, columns, classesById) {
    const { headers, rows } = this._buildStudentAoa(students, columns, classesById);
    this._download('students.csv', this.toCsv(headers, rows));
  },

  // Настоящий .xlsx (SheetJS) — открывается в Excel, Google Sheets и Apple Numbers.
  // Отдельного формата для Numbers не существует как открытого стандарта для генерации
  // на клиенте — Numbers полностью и корректно открывает .xlsx, поэтому один файл
  // покрывает оба случая.
  downloadStudentsXlsx(students, columns, classesById) {
    if (!window.XLSX) { alert('Библиотека для Excel не загрузилась. Проверьте подключение к интернету.'); return; }
    // В .xlsx экранирование кавычкой не нужно и мешало бы — SheetJS пишет
    // значения как текстовые ячейки, формулой они не станут.
    const { headers, rows } = this._buildStudentAoa(students, columns, classesById);
    const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, D('doc.ps.csv.sheet_students'));
    window.XLSX.writeFile(wb, 'students.xlsx');
  },

  // Подписи вариантов — из схемы анкеты, то есть на языке ДОКУМЕНТА.
  // Выгрузка уходит в письме или в общую таблицу, её язык не должен зависеть
  // от того, на каком языке в этот момент открыто приложение.
  _optLabel(fieldKey, value) {
    const S = window.RegistrationSchema;
    if (!S || value === undefined || value === null || value === '') return '';
    return S.labelForValue(fieldKey, value) || '';
  },

  downloadRegistrations(registrations) {
    const headers = ['lastName', 'firstName', 'phone', 'email', 'address', 'attending', 'reason',
      'transport', 'lodging', 'language', 'languageOther', 'format', 'notes', 'submittedAt']
      .map((k) => D('doc.ps.csv.' + k));
    const rows = registrations.map((r) => [
      r.lastName, r.firstName, r.phone, r.email, r.address,
      this._optLabel('attending', r.attending) || r.attending || '',
      r.attendReason || '',
      this._optLabel('transport', r.transport) || r.transport || '',
      this._optLabel('lodging', r.lodging) || r.lodging || '',
      this._optLabel('language', r.language) || r.language || '',
      r.languageOther || '',
      (r.format || []).map((f) => this._optLabel('format', f) || f).join('; '),
      r.notes || '',
      r.submittedAt || ''
    ]);
    this._download('registrations.csv', this.toCsv(headers, rows));
  },

  downloadTextbookOrder(order) {
    const headers = [D('doc.ps.csv.metric'), D('doc.ps.csv.value')];
    const rows = [
      [D('doc.ps.order.requested'), order.requestedByStudents || 0],
      [D('doc.ps.order.in_stock'), order.alreadyInStock || 0],
      [D('doc.ps.order.to_order'), order.orderQuantity ?? Textbooks.calcOrderQuantity(order)],
      [D('doc.ps.order.received'), order.received ? D('doc.ps.yes_short') : D('doc.ps.no_short')]
    ];
    this._download('textbook-order.csv', this.toCsv(headers, rows));
  }
};

window.ExcelExport = ExcelExport;
