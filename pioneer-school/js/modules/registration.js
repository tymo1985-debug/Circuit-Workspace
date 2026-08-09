// registration.js — формуляр регистрации учащихся (register.html) и его данные внутри приложения.
// Формуляр физически живёт в отдельном файле register.html (для рассылки пионерам по
// ссылке/QR — своё устройство, своё локальное хранилище). Этот модуль отвечает за:
//  1) настройки формуляра, которые задаёт районный старейшина (срок сдачи, email, WhatsApp);
//  2) список уже полученных регистраций (введённых вручную из писем/WhatsApp, либо
//     заполненных прямо в этом браузере, если register.html открыт на том же устройстве);
//  3) преобразование регистрации в запись учащегося (модуль students.js), чтобы не вводить
//     данные дважды.

const Registration = {
  // Подписи справочников для ИНТЕРФЕЙСА приложения (таблица регистраций).
  // Документы (PDF, CSV, письмо пионеру) берут свои подписи из схемы анкеты
  // по языку ДОКУМЕНТА — см. registrationSchema.labelForValue().
  //
  // ГЕТТЕРЫ, А НЕ ОБЫЧНЫЕ ПОЛЯ: раньше это были статические объекты, и T()
  // вычислялся один раз при загрузке скрипта. Язык, выбранный позже, до этих
  // подписей уже не доходил — таблица регистраций оставалась на языке первой
  // загрузки. Та же ловушка, что со справочными требованиями в anketa.js.
  get LANGUAGE_LABELS() {
    return { ru: T('ps.ui.russkiy'), uk: T('ps.ui.ukrainskiy'), pl: T('ps.ui.polskiy'), de: T('ps.ui.nemeckiy'), other: T('ps.ui.drugoy') };
  },
  get FORMAT_LABELS() {
    return { print: T('ps.reg.pechatnyy_ekzemplyar'), jwpub: T('ps.reg.elektronnyy_jwpub'), pdf: 'PDF', epub: 'EPUB' };
  },
  get YES_NO_LABELS() {
    return { yes: T('ps.ui.da'), no: T('ps.ui.net') };
  },

  async getConfig() {
    return DB.getMeta('registrationConfig', {
      deadline: '',
      email: '',
      phone: '',
      whatsapp: '',
      title: '',
      extraInstructions: ''
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
    if (!reg.lastName || !reg.lastName.trim()) errors.push(T('ps.stud.ukazhite_familiyu'));
    if (!reg.firstName || !reg.firstName.trim()) errors.push(T('ps.stud.ukazhite_imya'));
    if (!reg.email || !reg.email.trim()) errors.push(T('ps.reg.enter_email'));
    if (!reg.phone || !reg.phone.trim()) errors.push(T('ps.reg.enter_phone'));
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
  mapFormatToStudentCategory(formatArray) {
    if (Array.isArray(formatArray) && formatArray.includes('print')) return 'print';
    return 'standard';
  },

  async convertToStudent(reg) {
    // На случай, если организатор удалил один из стандартных столбцов —
    // убеждаемся, что нужные столбцы существуют, прежде чем записывать значения.
    await Students.ensureColumn('congregation', { label: T('ps.ph.sobranie'), type: 'text' });
    await Students.ensureColumn('email', { label: 'Email', type: 'text' });
    await Students.ensureColumn('phone', { label: T('ps.ui.telefon'), type: 'text' });
    await Students.ensureColumn('address', { label: T('ps.stud.adres_prozhivaniya'), type: 'text' });
    await Students.ensureColumn('transport', { label: T('ps.ui.est_avtomobil'), type: 'select', options: Students.YES_NO_OPTIONS });
    await Students.ensureColumn('lodging', { label: T('ps.ui.nuzhen_nochleg'), type: 'select', options: Students.YES_NO_OPTIONS });
    await Students.ensureColumn('language', { label: T('ps.stud.yazyk_uchebnika_tekstom'), type: 'text' });
    await Students.ensureColumn('notes', { label: T('ps.stud.dop_svedeniya'), type: 'textarea' });

    const student = {
      id: DB.uid(),
      classId: null,
      values: {
        lastName: reg.lastName,
        firstName: reg.firstName,
        congregation: reg.congregation || '',
        status: reg.attending === 'no' ? 'withdrawn' : 'listed',
        textbookFormat: this.mapFormatToStudentCategory(reg.format),
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
