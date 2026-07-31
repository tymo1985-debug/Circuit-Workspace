// registration.js — формуляр регистрации учащихся (register.html) и его данные внутри приложения.
// Формуляр физически живёт в отдельном файле register.html (для рассылки пионерам по
// ссылке/QR — своё устройство, своё локальное хранилище). Этот модуль отвечает за:
//  1) настройки формуляра, которые задаёт районный старейшина (срок сдачи, email, WhatsApp);
//  2) список уже полученных регистраций (введённых вручную из писем/WhatsApp, либо
//     заполненных прямо в этом браузере, если register.html открыт на том же устройстве);
//  3) преобразование регистрации в запись учащегося (модуль students.js), чтобы не вводить
//     данные дважды.

const Registration = {
  LANGUAGE_LABELS: { ru: 'Русский', uk: 'Украинский', pl: 'Польский', de: 'Немецкий', other: 'Другой' },
  FORMAT_LABELS: { print: 'Печатный экземпляр', jwpub: 'Электронный JWPub', pdf: 'PDF', epub: 'EPUB' },
  YES_NO_LABELS: { yes: 'Да', no: 'Нет' },

  async getConfig() {
    return DB.getMeta('registrationConfig', {
      deadline: '',
      email: '',
      whatsapp: '',
      title: ''
    });
  },

  async saveConfig(cfg) {
    return DB.setMeta('registrationConfig', cfg);
  },

  async list() {
    const items = await DB.list('registrations');
    return items.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  },

  validate(reg) {
    const errors = [];
    if (!reg.lastName || !reg.lastName.trim()) errors.push('Укажите фамилию');
    if (!reg.firstName || !reg.firstName.trim()) errors.push('Укажите имя');
    if (!reg.email || !reg.email.trim()) errors.push('Укажите email');
    if (!reg.phone || !reg.phone.trim()) errors.push('Укажите телефон');
    return errors;
  },

  async save(reg) {
    const errors = this.validate(reg);
    if (errors.length) throw new Error(errors.join('; '));
    if (!reg.submittedAt) reg.submittedAt = new Date().toISOString();
    return DB.put('registrations', reg);
  },

  async remove(id) {
    return DB.remove('registrations', id);
  },

  // Перенос данных регистрации в учащегося (students.js), без повторного ввода.
  // Формат учебника из регистрации (print/jwpub/pdf/epub) сопоставляется с
  // упрощённой категорией students.js (standard/otherLanguage/braille/print) —
  // используется только для расчёта заказа обычных бумажных экземпляров.
  mapFormatToStudentCategory(formatArray, language) {
    if (language && language !== 'ru' && language !== '') {
      // если школа обычно на русском, а пионер выбрал другой язык — считаем иноязычным
    }
    if (Array.isArray(formatArray) && formatArray.includes('print')) return 'print';
    return 'standard';
  },

  async convertToStudent(reg) {
    // На случай, если организатор удалил один из стандартных столбцов —
    // убеждаемся, что нужные столбцы существуют, прежде чем записывать значения.
    await Students.ensureColumn('email', { label: 'Email', type: 'text' });
    await Students.ensureColumn('phone', { label: 'Телефон', type: 'text' });
    await Students.ensureColumn('address', { label: 'Адрес проживания', type: 'text' });
    await Students.ensureColumn('transport', { label: 'Есть автомобиль', type: 'select', options: Students.YES_NO_OPTIONS });
    await Students.ensureColumn('lodging', { label: 'Нужен ночлег', type: 'select', options: Students.YES_NO_OPTIONS });
    await Students.ensureColumn('language', { label: 'Язык учебника (текстом)', type: 'text' });
    await Students.ensureColumn('notes', { label: 'Доп. сведения', type: 'textarea' });

    const student = {
      id: DB.uid(),
      classId: null,
      values: {
        lastName: reg.lastName,
        firstName: reg.firstName,
        congregation: reg.congregation || '',
        status: reg.attending === 'no' ? 'withdrawn' : 'listed',
        textbookFormat: this.mapFormatToStudentCategory(reg.format, reg.language),
        email: reg.email || '',
        phone: reg.phone || '',
        address: reg.address || '',
        transport: reg.transport || '',
        lodging: reg.lodging || '',
        language: reg.language === 'other' ? (reg.languageOther || '') : (this.LANGUAGE_LABELS[reg.language] || ''),
        notes: reg.notes || ''
      },
      fromRegistrationId: reg.id
    };
    await Students.save(student);
    reg.convertedToStudentId = student.id;
    await DB.put('registrations', reg);
    return student;
  }
};

window.Registration = Registration;
