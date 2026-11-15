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
  // Языки учебника для таблицы — на языке интерфейса (Intl через
  // Students.languageName); записи v1 и v2 читаются одинаково.
  languageText(reg) {
    return RegistrationSchema.languagesOf(reg)
      .map((code) => (code === 'other' ? (reg.languageOther || T('ps.ui.drugoy')) : Students.languageName(code)))
      .join(', ');
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
    // Ф2: «Не приду» без причины не принимается — причина нужна для S-253.
    if (reg.attending === 'no' && !String(reg.attendReason || '').trim()) errors.push(T('ps.reg.enter_reason'));
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

  // ---------- Ф2: заполненная анкета → карточка пионера ----------

  // Регистрация из заполненной PDF-анкеты. Без validate(): анкету заполнял
  // пионер, и пустой email не повод потерять остальные ответы — недочёты
  // показываются после переноса в карточку (applyToStudent → warnings).
  async saveImported(record, fileName) {
    const reg = {
      ...record,
      id: DB.uid(),
      source: 'pdf',
      sourceFile: fileName || '',
      schemaVersion: RegistrationSchema.version,
      submittedAt: new Date().toISOString()
    };
    await DB.put('registrations', reg);
    return reg;
  },

  _nameKey(last, first) {
    const n = (x) => String(x || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase().replace(/ё/g, 'е');
    return n(last) + '|' + n(first);
  },

  // Пионер этой школы с теми же фамилией и именем — обычно тот, кого
  // пригласили по списку филиала и кто теперь вернул анкету.
  async findStudentMatch(reg) {
    const key = this._nameKey(reg.lastName, reg.firstName);
    const list = await Students.list();
    return list.find((s) => this._nameKey(s.values.lastName, s.values.firstName) === key) || null;
  },

  // Языки учебника для модели пионера: коды + то, что вписано в «Другой».
  textbookLanguagesOf(reg) {
    const codes = RegistrationSchema.languagesOf(reg).filter((c) => c !== 'other');
    const other = RegistrationSchema.languagesOf(reg).includes('other') || reg.languageOther
      ? Students.parseLanguages(reg.languageOther) : [];
    return [...codes, ...other].filter((l, i, arr) => l && arr.indexOf(l) === i);
  },

  async _ensureColumns() {
    // На случай, если организатор удалил один из стандартных столбцов —
    // убеждаемся, что нужные столбцы существуют, прежде чем записывать значения.
    await Students.ensureColumn('congregation', { label: T('ps.ph.sobranie'), type: 'text' });
    await Students.ensureColumn('email', { label: 'Email', type: 'text' });
    await Students.ensureColumn('phone', { label: T('ps.ui.telefon'), type: 'text' });
    await Students.ensureColumn('phoneWhatsapp', { label: T('ps.reg.whatsapp_col'), labelKey: 'ps.reg.whatsapp_col', type: 'select', options: Students.YES_NO_OPTIONS });
    await Students.ensureColumn('address', { label: T('ps.stud.adres_prozhivaniya'), type: 'text' });
    await Students.ensureColumn('transport', { label: T('ps.ui.est_avtomobil'), type: 'select', options: Students.YES_NO_OPTIONS });
    await Students.ensureColumn('lodging', { label: T('ps.ui.nuzhen_nochleg'), type: 'select', options: Students.YES_NO_OPTIONS });
    await Students.ensureColumn('specialNeeds', { label: T('ps.reg.special_needs'), labelKey: 'ps.reg.special_needs', type: 'textarea' });
    await Students.ensureColumn('notes', { label: T('ps.stud.dop_svedeniya'), type: 'textarea' });
  },

  /**
   * Ответы анкеты → карточка пионера (поля модели Ф1).
   * @param {Object} reg — запись регистрации
   * @param {string|null} studentId — обновить этого пионера; null — новый
   * @returns {{ student: Object, warnings: string[] }}
   *
   * ОБНОВЛЕНИЕ НЕ СТИРАЕТ: пустой ответ анкеты оставляет то, что уже было в
   * карточке. Статус меняется только у тех, кто ещё не на школе
   * (attended / notAttended — итог школы, анкета его не переписывает).
   */
  async applyToStudent(reg, studentId = null) {
    await this._ensureColumns();
    const warnings = [];
    const directory = (typeof CWDirectory !== 'undefined' && CWDirectory.ready && reg.congregation)
      ? CWDirectory.byName(reg.congregation) : null;
    // Пустой справочник — не недочёт анкеты: название остаётся текстом.
    if (reg.congregation && typeof CWDirectory !== 'undefined' && CWDirectory.ready && !directory
      && CWDirectory.all().length) {
      warnings.push(T('ps.reg.import.no_congregation', { name: reg.congregation }));
    }
    const languages = this.textbookLanguagesOf(reg);
    if (!languages.length) warnings.push(T('ps.reg.import.no_language'));
    let reason = String(reg.attendReason || '').trim();
    if (reg.attending === 'no' && !reason) {
      reason = T('ps.reg.import.reason_missing');
      warnings.push(T('ps.reg.import.no_reason'));
    }
    const answered = {
      lastName: reg.lastName,
      firstName: reg.firstName,
      congregation: directory ? directory.name : reg.congregation,
      email: reg.email,
      phone: reg.phone,
      phoneWhatsapp: reg.phoneWhatsapp === 'yes' ? 'yes' : '',
      address: reg.address,
      transport: reg.transport,
      lodging: reg.lodging,
      specialNeeds: reg.specialNeeds,
      notes: reg.notes,
      textbookFormat: (reg.format || []).length ? this.mapFormatToStudentCategory(reg.format) : ''
    };
    const values = {};
    Object.keys(answered).forEach((k) => {
      const v = answered[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') values[k] = String(v).trim();
    });
    const nextStatus = reg.attending === 'no' ? 'wontCome' : (reg.attending === 'yes' ? 'willCome' : null);

    let student;
    if (studentId) {
      const current = (await Students.list()).find((s) => s.id === studentId);
      if (!current) throw new Error(T('ps.pioneer.err.not_found'));
      delete values.lastName;
      delete values.firstName;
      const patch = { values };
      if (directory) patch.congregationId = directory.id;
      if (languages.length) patch.textbookLanguages = languages;
      if (nextStatus && !['attended', 'notAttended'].includes(current.status)) {
        patch.status = nextStatus;
        patch.statusReason = nextStatus === 'wontCome' ? reason : '';
      }
      student = await Students.saveCard(studentId, patch, { source: 'form' });
    } else {
      student = {
        id: DB.uid(),
        classId: null,
        values: { textbookFormat: 'standard', ...values },
        model: Students.MODEL,
        origin: 'branchList',
        status: nextStatus || 'invited',
        statusReason: nextStatus === 'wontCome' ? reason : '',
        gender: '',
        congregationId: directory ? directory.id : null,
        relations: [],
        textbookLanguages: languages,
        previousInvites: [],
        fromRegistrationId: reg.id
      };
      await Students.save(student, { source: 'form' });
    }
    reg.convertedToStudentId = student.id;
    await DB.put('registrations', reg);
    return { student, warnings };
  },

  // Кнопка «В учащиеся» в таблице регистраций — прежний вход, теперь через
  // applyToStudent (новый пионер).
  async convertToStudent(reg) {
    const { student } = await this.applyToStudent(reg, null);
    return student;
  }
};

window.Registration = Registration;
