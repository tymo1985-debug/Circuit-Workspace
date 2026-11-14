// students.js — учащиеся (пионеры) с гибкой системой столбцов.
// Каждый учащийся хранится как { id, classId, values: { [columnKey]: значение }, …поля Ф1 },
// набор столбцов пользователь может менять: добавлять, переименовывать, удалять
// (кроме системных столбцов, от которых зависит расчёт учебников — их можно
// переименовать, но не удалить).
//
// Ф1 (14.11.2026) — модель пионера. Поля смысла живут ВНЕ гибких столбцов,
// потому что столбцы пользователь вправе переименовать и удалить:
//   origin          — откуда пионер в списке (ORIGINS), независимо от статуса;
//   status          — где он сейчас (STATUSES); для wontCome/notAttended
//   statusReason    — причина, обязательна;
//   gender          — брат / сестра;
//   congregationId  — собрание из общего справочника (CWDirectory);
//                     values.congregation — снимок названия (печать, копии);
//   relations       — [{ type: spouse|relative, studentId }], всегда взаимные;
//   textbookLanguages — языки учебника, минимум один (коды или текст);
//   previousInvites — отметки «приглашался в Школу N — …» (повторное
//                     приглашение = отдельная запись в новой школе).
// Прежний столбец «Подтверждение участия» (values.status: listed / added /
// transferred / withdrawn) смешивал происхождение и статус — он разносится на
// origin + status при первом чтении записи (normalize) и из столбцов убран.
// Прежний «Язык учебника (текстом)» (values.language) → textbookLanguages.

const LEGACY_ORIGIN = { listed: 'branchList', added: 'otherCongregation', transferred: 'otherCircuit', withdrawn: 'branchList' };

const Students = {
  YES_NO_OPTIONS: [{ value: 'yes', label: 'Да', labelKey: 'ps.ui.da' }, { value: 'no', label: 'Нет', labelKey: 'ps.ui.net' }],

  MODEL: 2,
  ORIGINS: ['branchList', 'otherCongregation', 'otherCircuit', 'otherBranch'],
  STATUSES: ['invited', 'letterSent', 'willCome', 'wontCome', 'attended', 'notAttended'],
  REASON_REQUIRED: ['wontCome', 'notAttended'],
  GENDERS: ['brother', 'sister'],
  RELATION_TYPES: ['spouse', 'relative'],
  // Языки в подсказке выбора; любой другой вводится текстом.
  LANGUAGE_PRESETS: ['ru', 'uk', 'cs', 'de', 'pl', 'en'],

  originLabel(value) { return value ? T('ps.pioneer.origin.' + value) : '—'; },
  statusLabel(value) { return value ? T('ps.pioneer.status.' + value) : '—'; },
  genderLabel(value) { return value ? T('ps.pioneer.gender.' + value) : '—'; },
  relationLabel(value) { return value ? T('ps.pioneer.relation.' + value) : '—'; },

  // Название языка: код — через Intl на языке интерфейса, текст — как есть.
  languageName(code) {
    const value = String(code || '').trim();
    if (!/^[a-z]{2,3}$/.test(value)) return value;
    try {
      const ui = (typeof CWI18n !== 'undefined' && CWI18n.lang) ? CWI18n.lang : 'ru';
      const name = new Intl.DisplayNames([ui], { type: 'language' }).of(value);
      return name ? name.charAt(0).toLocaleUpperCase(ui) + name.slice(1) : value;
    } catch (e) { return value; }
  },

  // «Русский, чешский» → ['ru', 'cs']; незнакомое остаётся текстом.
  parseLanguages(text) {
    const parts = String(text || '').split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);
    const locales = ['ru', 'uk', 'en', 'pl', 'de', 'cs'];
    const byName = {};
    this.LANGUAGE_PRESETS.forEach((code) => {
      locales.forEach((loc) => {
        try {
          const n = new Intl.DisplayNames([loc], { type: 'language' }).of(code);
          if (n) byName[n.toLowerCase()] = code;
        } catch (e) { /* без Intl.DisplayNames остаётся текст */ }
      });
      byName[code] = code;
    });
    const out = [];
    parts.forEach((p) => {
      const code = byName[p.toLowerCase()] || p;
      if (!out.includes(code)) out.push(code);
    });
    return out;
  },

  TEXTBOOK_FORMAT_OPTIONS: [
    { value: 'standard', label: 'Обычный (язык школы)', labelKey: 'ps.stud.obychnyy_yazyk_shkoly' },
    { value: 'otherLanguage', label: 'На другом языке', labelKey: 'ps.stud.na_drugom_yazyke' },
    { value: 'braille', label: 'Брайль / спецформат (S-59)', labelKey: 'ps.stud.brayl_specformat_s_59' },
    { value: 'print', label: 'Печатный (по запросу)', labelKey: 'ps.stud.pechatnyy_po_zaprosu' }
  ],

  // Столбцы, создаваемые при первом запуске. Пользователь может изменить всё,
  // кроме удаления столбцов с protected:true (lastName/firstName/textbookFormat) —
  // от textbookFormat зависит расчёт заказа. Статус пионера — не столбец (Ф1).
  DEFAULT_COLUMNS: [
    { key: 'lastName', label: 'Фамилия', labelKey: 'ps.ui.familiya', type: 'text', protected: true, required: true },
    { key: 'firstName', label: 'Имя', labelKey: 'ps.ui.imya', type: 'text', protected: true, required: true },
    { key: 'congregation', label: 'Собрание', labelKey: 'ps.ph.sobranie', type: 'text' },
    { key: 'textbookFormat', label: 'Формат учебника', labelKey: 'ps.stud.format_uchebnika', type: 'select', protected: true,
      options: [
        { value: 'standard', label: 'Обычный', labelKey: 'ps.stud.obychnyy' },
        { value: 'otherLanguage', label: 'На другом языке', labelKey: 'ps.stud.na_drugom_yazyke' },
        { value: 'braille', label: 'Брайль', labelKey: 'ps.stud.brayl' },
        { value: 'print', label: 'Печатный', labelKey: 'ps.stud.pechatnyy' }
      ] },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Телефон', labelKey: 'ps.ui.telefon', type: 'text' },
    { key: 'address', label: 'Адрес проживания', labelKey: 'ps.stud.adres_prozhivaniya', type: 'text' },
    { key: 'transport', label: 'Есть автомобиль', labelKey: 'ps.ui.est_avtomobil', type: 'select', options: [{ value: 'yes', label: 'Да', labelKey: 'ps.ui.da' }, { value: 'no', label: 'Нет', labelKey: 'ps.ui.net' }] },
    { key: 'lodging', label: 'Нужен ночлег', labelKey: 'ps.ui.nuzhen_nochleg', type: 'select', options: [{ value: 'yes', label: 'Да', labelKey: 'ps.ui.da' }, { value: 'no', label: 'Нет', labelKey: 'ps.ui.net' }] },
    { key: 'notes', label: 'Доп. сведения', labelKey: 'ps.stud.dop_svedeniya', type: 'textarea' }
  ],

  // Подпись столбца или варианта для ПОКАЗА. Пока пользователь не переименовал
  // столбец, подпись берётся из словаря по labelKey и следует за языком
  // интерфейса. Как только он задал своё название (renamed:true), показывается
  // именно оно и переводом не затирается никогда.
  // Поле label при этом всегда остаётся заполненным: его используют
  // генераторы документов (PDF/XLSX), которые намеренно не переводятся.
  label(column) {
    if (!column) return '';
    if (column.renamed || !column.labelKey) return column.label || '';
    return typeof T === 'function' ? T(column.labelKey) : column.label || '';
  },

  optionLabel(option) { return this.label(option); },

  // Существующие установки хранят столбцы без labelKey. Проставляем его по
  // совпадению с эталонной подписью: совпало — столбец не переименовывали,
  // можно переводить; не совпало — это выбор пользователя, не трогаем.
  migrateColumnLabels(columns) {
    let changed = false;
    const defaults = {};
    this.DEFAULT_COLUMNS.forEach((d) => { defaults[d.key] = d; });
    columns.forEach((col) => {
      const def = defaults[col.key];
      if (!def || col.labelKey || col.renamed) return;
      if (col.label === def.label) { col.labelKey = def.labelKey; changed = true; }
      else { col.renamed = true; changed = true; }
      if (Array.isArray(col.options) && Array.isArray(def.options)) {
        col.options.forEach((opt) => {
          const dOpt = def.options.find((o) => o.value === opt.value);
          if (dOpt && !opt.labelKey && opt.label === dOpt.label) { opt.labelKey = dOpt.labelKey; changed = true; }
        });
      }
    });
    return changed;
  },

  // ---------- Столбцы ----------
  async getColumns() {
    let stored = await DB.getMeta('studentColumns', null);
    if (stored && stored.length) {
      let changed = this.migrateColumnLabels(stored);
      // Ф1: статус и языки учебника — поля модели, не столбцы (см. шапку).
      const kept = stored.filter((c) => c.key !== 'status' && c.key !== 'language');
      if (kept.length !== stored.length) { stored = kept; changed = true; }
      if (changed) await DB.setMeta('studentColumns', stored);
      return stored;
    }
    const defaults = JSON.parse(JSON.stringify(this.DEFAULT_COLUMNS));
    await DB.setMeta('studentColumns', defaults);
    return defaults;
  },

  async saveColumns(cols) {
    return DB.setMeta('studentColumns', cols);
  },

  slugifyKey(label, existingKeys) {
    let base = String(label || 'field').toLowerCase().trim()
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '');
    if (!base) base = 'field';
    let key = base, i = 1;
    while (existingKeys.includes(key)) key = base + '_' + (i++);
    return key;
  },

  async addColumn({ label, type = 'text', options = [] }) {
    if (!label || !label.trim()) throw new Error(T('ps.app.ukazhite_nazvanie_stolbca'));
    const cols = await this.getColumns();
    const key = this.slugifyKey(label, cols.map((c) => c.key));
    cols.push({ key, label: label.trim(), type, options, protected: false });
    await this.saveColumns(cols);
    return key;
  },

  async renameColumn(key, newLabel) {
    const cols = await this.getColumns();
    const col = cols.find((c) => c.key === key);
    if (col && newLabel && newLabel.trim()) { col.label = newLabel.trim(); col.renamed = true; }
    await this.saveColumns(cols);
  },

  async removeColumn(key) {
    const cols = await this.getColumns();
    const col = cols.find((c) => c.key === key);
    if (col && col.protected) {
      throw new Error(T('ps.stud.etot_stolbec_ispolzuetsya_drugimi'));
    }
    await this.saveColumns(cols.filter((c) => c.key !== key));
  },

  // Гарантирует, что столбец с данным ключом существует (используется при
  // переносе данных из регистрации/импорта, где ключ уже определён).
  async ensureColumn(key, def) {
    const cols = await this.getColumns();
    if (!cols.find((c) => c.key === key)) {
      cols.push({ key, protected: false, ...def });
      await this.saveColumns(cols);
    }
  },

  // Найти существующий столбец по названию (без учёта регистра) или создать новый текстовый.
  async resolveColumnByLabel(label) {
    const cols = await this.getColumns();
    const norm = (s) => String(s || '')
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      .normalize('NFC')
      .trim()
      .toLowerCase();
    const found = cols.find((c) => norm(this.label(c)) === norm(label) || norm(c.label) === norm(label));
    if (found) return found.key;
    return this.addColumn({ label, type: 'text' });
  },

  // ---------- Учащиеся ----------
  _migrateLegacy(raw) {
    if (raw.values) return raw;
    // Старый плоский формат (v1.0–v1.1): поля лежали прямо в объекте.
    const { id, classId, updatedAt, ...rest } = raw;
    return { id, classId: classId || null, updatedAt, values: rest, _migrated: true };
  },

  _schoolLanguage() {
    const school = DB.currentSchool();
    return school ? school.language : '';
  },

  // Приводит запись к модели Ф1. Возвращает { rec, changed }; исходный объект
  // не меняется. Повторный вызов на уже приведённой записи ничего не меняет.
  normalize(raw, schoolLanguage) {
    const base = this._migrateLegacy(raw);
    const rec = { ...base, values: { ...(base.values || {}) } };
    let changed = !!rec._migrated;
    delete rec._migrated;
    if (rec.model !== this.MODEL) {
      const v = rec.values;
      const legacy = v.status;
      if (!this.ORIGINS.includes(rec.origin)) rec.origin = LEGACY_ORIGIN[legacy] || 'branchList';
      if (!this.STATUSES.includes(rec.status)) {
        rec.status = legacy === 'withdrawn' ? 'wontCome' : 'invited';
        rec.statusReason = legacy === 'withdrawn' ? T('ps.stud.vybyl_ne_obuchaetsya') : '';
      }
      if (!Array.isArray(rec.textbookLanguages) || !rec.textbookLanguages.length) {
        rec.textbookLanguages = this.parseLanguages(v.language);
      }
      delete v.status;
      delete v.language;
      rec.model = this.MODEL;
      changed = true;
    }
    if (!Array.isArray(rec.textbookLanguages)) { rec.textbookLanguages = []; changed = true; }
    if (!rec.textbookLanguages.length && schoolLanguage) { rec.textbookLanguages = [schoolLanguage]; changed = true; }
    if (typeof rec.statusReason !== 'string') { rec.statusReason = ''; changed = true; }
    if (!this.GENDERS.includes(rec.gender)) { if (rec.gender !== '') changed = true; rec.gender = ''; }
    if (rec.congregationId === undefined) { rec.congregationId = null; changed = true; }
    if (!Array.isArray(rec.relations)) { rec.relations = []; changed = true; }
    if (!Array.isArray(rec.previousInvites)) { rec.previousInvites = []; changed = true; }
    if (rec.classId === undefined) { rec.classId = null; changed = true; }
    return { rec, changed };
  },

  // То, что отдаётся экранам. Служебные поля (fromRegistrationId и т.п.) сюда
  // не попадают намеренно — писать в базу нужно полную запись (DB.get).
  _view(rec) {
    return {
      id: rec.id,
      classId: rec.classId,
      values: rec.values,
      origin: rec.origin,
      status: rec.status,
      statusReason: rec.statusReason,
      gender: rec.gender,
      congregationId: rec.congregationId,
      relations: rec.relations,
      textbookLanguages: rec.textbookLanguages,
      previousInvites: rec.previousInvites,
      reinvitedFrom: rec.reinvitedFrom || null
    };
  },

  async list(db = DB) {
    const items = await db.list('students');
    const lang = this._schoolLanguage();
    const out = [];
    for (const raw of items) {
      const { rec, changed } = this.normalize(raw, lang);
      // Завершённая школа — только чтение: приводим в памяти, в базу не пишем.
      if (changed && db === DB && !DB.isReadOnly()) {
        try { await DB.put('students', rec); } catch (e) { console.warn('pioneer-school: normalize', e); }
      }
      out.push(this._view(rec));
    }
    return out.sort((a, b) => (a.values.lastName || '').localeCompare(b.values.lastName || '', 'ru'));
  },

  async listByClass(classId) {
    const all = await this.list();
    return all.filter((s) => s.classId === classId);
  },

  validate(student) {
    const errors = [];
    const v = student.values || {};
    if (!v.lastName || !String(v.lastName).trim()) errors.push(T('ps.stud.ukazhite_familiyu'));
    if (!v.firstName || !String(v.firstName).trim()) errors.push(T('ps.stud.ukazhite_imya'));
    if (!this.ORIGINS.includes(student.origin)) errors.push(T('ps.pioneer.err.origin'));
    if (!this.STATUSES.includes(student.status)) errors.push(T('ps.pioneer.err.status'));
    if (this.REASON_REQUIRED.includes(student.status) && !String(student.statusReason || '').trim()) {
      errors.push(T('ps.pioneer.err.reason'));
    }
    if (!Array.isArray(student.textbookLanguages) || !student.textbookLanguages.length) {
      errors.push(T('ps.pioneer.err.languages'));
    }
    return errors;
  },

  async save(student) {
    const { rec } = this.normalize(student, this._schoolLanguage());
    const errors = this.validate(rec);
    if (errors.length) throw new Error(errors.join('; '));
    const saved = await DB.put('students', rec);
    if (student !== saved) Object.assign(student, { id: saved.id });
    return saved;
  },

  // Сохранение из карточки: поля модели + взаимные связи одним заходом.
  // patch — { values?, origin, status, statusReason, gender, congregationId,
  // textbookLanguages, relations } поверх ПОЛНОЙ записи из базы.
  async saveCard(studentId, patch) {
    const full = await DB.get('students', studentId);
    if (!full) throw new Error(T('ps.pioneer.err.not_found'));
    const { rec } = this.normalize(full, this._schoolLanguage());
    const next = { ...rec, ...patch, values: { ...rec.values, ...(patch.values || {}) } };
    if (next.status && !this.REASON_REQUIRED.includes(next.status)) next.statusReason = '';
    next.statusReason = String(next.statusReason || '').trim();
    next.textbookLanguages = (next.textbookLanguages || []).map((l) => String(l).trim()).filter(Boolean)
      .filter((l, i, arr) => arr.indexOf(l) === i);

    const all = (await DB.list('students')).map((r) => this.normalize(r, '').rec);
    const byId = Object.fromEntries(all.map((r) => [r.id, r]));
    const wanted = [];
    (patch.relations || rec.relations || []).forEach((r) => {
      if (!r || r.studentId === studentId || !byId[r.studentId] || !this.RELATION_TYPES.includes(r.type)) return;
      if (wanted.some((w) => w.studentId === r.studentId)) return;
      wanted.push({ type: r.type, studentId: r.studentId });
    });
    const spouses = wanted.filter((r) => r.type === 'spouse');
    if (spouses.length > 1) throw new Error(T('ps.pioneer.err.one_spouse'));
    spouses.forEach((r) => {
      const other = byId[r.studentId];
      const otherSpouse = (other.relations || []).find((x) => x.type === 'spouse' && x.studentId !== studentId);
      if (otherSpouse) throw new Error(T('ps.pioneer.err.spouse_taken', { name: this.fullName(other) }));
    });
    next.relations = wanted;

    const errors = this.validate(next);
    if (errors.length) throw new Error(errors.join('; '));

    // Взаимность: у второй стороны связь ставится и снимается вместе с этой.
    const touched = [];
    all.forEach((other) => {
      if (other.id === studentId) return;
      const want = wanted.find((w) => w.studentId === other.id);
      const has = (other.relations || []).find((x) => x.studentId === studentId);
      if (want && (!has || has.type !== want.type)) {
        other.relations = (other.relations || []).filter((x) => x.studentId !== studentId).concat({ type: want.type, studentId });
        touched.push(other);
      } else if (!want && has) {
        other.relations = other.relations.filter((x) => x.studentId !== studentId);
        touched.push(other);
      }
    });
    await DB.put('students', next);
    for (const other of touched) await DB.put('students', other);
    return this._view(next);
  },

  async remove(id) {
    await DB.remove('students', id);
    // Связи взаимные: у второй стороны ссылка на удалённого снимается.
    const all = await DB.list('students');
    for (const other of all) {
      if (!Array.isArray(other.relations) || !other.relations.some((r) => r.studentId === id)) continue;
      other.relations = other.relations.filter((r) => r.studentId !== id);
      await DB.put('students', other);
    }
    return true;
  },

  fullName(s) {
    const v = (s && s.values) || {};
    return `${v.lastName || ''} ${v.firstName || ''}`.trim() || T('ps.docs.no_name');
  },

  // Ждём ли пионера на школе: всё, кроме «не придёт». Заменяет прежнее
  // values.status !== 'withdrawn' (классы, учебники, списки, письма).
  isExpected(s) { return (s && s.status) !== 'wontCome'; },

  // ---------- Повторное приглашение (Ф1) ----------
  // Пионер из прошлой школы приглашается в текущую ОТДЕЛЬНОЙ записью; прежняя
  // запись остаётся в своей школе как была (только чтение), новая получает
  // отметку «приглашался в Школу N — …».
  async reinvite(fromSchoolId, studentId, toSchoolId) {
    const schools = DB.schools();
    const from = schools.find((s) => s.id === fromSchoolId);
    const to = schools.find((s) => s.id === toSchoolId);
    if (!from || !to || from.id === to.id || to.completed) throw new Error(T('ps.pioneer.err.no_target'));
    const srcRaw = await DB.inSchool(fromSchoolId).get('students', studentId);
    if (!srcRaw) throw new Error(T('ps.pioneer.err.not_found'));
    const src = this.normalize(srcRaw, from.language).rec;
    if (src.status === 'attended') throw new Error(T('ps.pioneer.err.attended'));
    const target = DB.inSchool(toSchoolId);
    const existing = await target.list('students');
    if (existing.some((r) => r.reinvitedFrom && r.reinvitedFrom.schoolId === fromSchoolId && r.reinvitedFrom.studentId === studentId)) {
      throw new Error(T('ps.pioneer.err.already_reinvited', { school: T('ps.school.label', { n: to.number }) }));
    }
    const rec = {
      id: DB.uid(),
      classId: null,
      values: { ...src.values },
      origin: src.origin,
      status: 'invited',
      statusReason: '',
      gender: src.gender,
      congregationId: src.congregationId,
      relations: [],
      textbookLanguages: [...src.textbookLanguages],
      previousInvites: [...src.previousInvites, {
        schoolId: from.id, number: from.number, year: from.year, status: src.status, reason: src.statusReason
      }],
      reinvitedFrom: { schoolId: fromSchoolId, studentId },
      model: this.MODEL
    };
    await target.put('students', rec);
    return rec;
  },

  // Строка отметки: «Приглашался в Школу 1 (2026) — не придёт: причина».
  previousInviteText(p) {
    const outcome = this.statusLabel(p.status) + (p.reason ? ': ' + p.reason : '');
    return T('ps.pioneer.prev_invite', { n: p.number, year: p.year || '', outcome });
  },

  // ---------- Экспорт ----------
  // Поля модели — не столбцы, но в выгрузку попадать должны (прежний столбец
  // «Подтверждение участия» выгружался). Виртуальные столбцы только для чтения.
  virtualColumns() {
    const opts = (list, fn) => list.map((value) => ({ value, label: fn.call(this, value) }));
    return [
      { key: '_origin', virtual: true, type: 'select', label: T('ps.pioneer.f.origin'), options: opts(this.ORIGINS, this.originLabel) },
      { key: '_status', virtual: true, type: 'select', label: T('ps.pioneer.f.status'), options: opts(this.STATUSES, this.statusLabel) },
      { key: '_statusReason', virtual: true, type: 'text', label: T('ps.pioneer.f.reason') },
      { key: '_gender', virtual: true, type: 'select', label: T('ps.pioneer.f.gender'), options: opts(this.GENDERS, this.genderLabel) },
      { key: '_languages', virtual: true, type: 'text', label: T('ps.pioneer.f.languages') }
    ];
  },

  exportColumns(columns) { return [...columns, ...this.virtualColumns()]; },

  cellValue(s, column) {
    if (!column.virtual) return (s.values || {})[column.key];
    switch (column.key) {
      case '_origin': return s.origin;
      case '_status': return s.status;
      case '_statusReason': return s.statusReason;
      case '_gender': return s.gender;
      case '_languages': return (s.textbookLanguages || []).map((l) => this.languageName(l)).join(', ');
      default: return '';
    }
  },

  // ВНИМАНИЕ: на вход подаются объекты из list() (вид, не полная запись).
  // Возвращаем ТОЛЬКО изменение classId, чтобы вызывающий код не записывал в
  // базу усечённую запись поверх полной (раньше так терялось, например, поле
  // fromRegistrationId).
  autoDistribute(students, classes) {
    if (!classes.length) return students;
    const sorted = [...students].filter((s) => this.isExpected(s));
    const perClass = Math.ceil(sorted.length / classes.length);
    let idx = 0;
    return sorted.map((s) => {
      const classIndex = Math.min(Math.floor(idx / perClass), classes.length - 1);
      idx++;
      return { ...s, classId: classes[classIndex].id };
    });
  },

  countByFormat(students) {
    const counts = { standard: 0, otherLanguage: 0, braille: 0, print: 0 };
    students.forEach((s) => {
      if (!this.isExpected(s)) return;
      const fmt = (s.values || {}).textbookFormat || 'standard';
      if (counts[fmt] !== undefined) counts[fmt]++;
    });
    return counts;
  }
};

window.Students = Students;
