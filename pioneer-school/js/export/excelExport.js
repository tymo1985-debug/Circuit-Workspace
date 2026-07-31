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
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
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
    const headers = [...columns.map((c) => c.label), 'Класс'];
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
    const { headers, rows } = this._buildStudentAoa(students, columns, classesById);
    const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Учащиеся');
    window.XLSX.writeFile(wb, 'students.xlsx');
  },

  downloadRegistrations(registrations) {
    const headers = ['Фамилия', 'Имя', 'Телефон', 'Email', 'Адрес', 'Присутствие', 'Причина отсутствия', 'Транспорт', 'Ночлег', 'Язык', 'Другой язык', 'Формат учебника', 'Доп. сведения', 'Дата отправки'];
    const rows = registrations.map((r) => [
      r.lastName, r.firstName, r.phone, r.email, r.address,
      Registration.YES_NO_LABELS[r.attending] || r.attending || '',
      r.attendReason || '',
      Registration.YES_NO_LABELS[r.transport] || r.transport || '',
      Registration.YES_NO_LABELS[r.lodging] || r.lodging || '',
      Registration.LANGUAGE_LABELS[r.language] || r.language || '',
      r.languageOther || '',
      (r.format || []).map((f) => Registration.FORMAT_LABELS[f] || f).join('; '),
      r.notes || '',
      r.submittedAt || ''
    ]);
    this._download('registrations.csv', this.toCsv(headers, rows));
  },

  downloadTextbookOrder(order) {
    const headers = ['Показатель', 'Значение'];
    const rows = [
      ['Запрошено учащимися', order.requestedByStudents || 0],
      ['Уже в наличии', order.alreadyInStock || 0],
      ['К заказу', order.orderQuantity ?? Textbooks.calcOrderQuantity(order)],
      ['Получено', order.received ? 'да' : 'нет']
    ];
    this._download('textbook-order.csv', this.toCsv(headers, rows));
  }
};

window.ExcelExport = ExcelExport;
