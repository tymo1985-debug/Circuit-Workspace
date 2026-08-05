// students.js — учащиеся (пионеры) с гибкой системой столбцов.
// Каждый учащийся хранится как { id, classId, values: { [columnKey]: значение } },
// набор столбцов пользователь может менять: добавлять, переименовывать, удалять
// (кроме двух системных столбцов, от которых зависит расчёт учебников и статус —
// их можно переименовать, но не удалить).

const Students = {
  YES_NO_OPTIONS: [{ value: 'yes', label: 'Да', labelKey: 'ps.ui.da' }, { value: 'no', label: 'Нет', labelKey: 'ps.ui.net' }],

  STATUS_OPTIONS: [
    { value: 'listed', label: 'В списке филиала', labelKey: 'ps.stud.v_spiske_filiala' },
    { value: 'added', label: 'Добавлен вне списка (согласовано)', labelKey: 'ps.stud.dobavlen_vne_spiska_soglasovano' },
    { value: 'transferred', label: 'Передан из другого района', labelKey: 'ps.stud.peredan_iz_drugogo_rayona' },
    { value: 'withdrawn', label: 'Выбыл / не обучается', labelKey: 'ps.stud.vybyl_ne_obuchaetsya' }
  ],

  TEXTBOOK_FORMAT_OPTIONS: [
    { value: 'standard', label: 'Обычный (язык школы)', labelKey: 'ps.stud.obychnyy_yazyk_shkoly' },
    { value: 'otherLanguage', label: 'На другом языке', labelKey: 'ps.stud.na_drugom_yazyke' },
    { value: 'braille', label: 'Брайль / спецформат (S-59)', labelKey: 'ps.stud.brayl_specformat_s_59' },
    { value: 'print', label: 'Печатный (по запросу)', labelKey: 'ps.stud.pechatnyy_po_zaprosu' }
  ],

  // Столбцы, создаваемые при первом запуске. Пользователь может изменить всё,
  // кроме удаления столбцов с protected:true (lastName/firstName/status/textbookFormat) —
  // от status зависит распределение по классам и S-253, от textbookFormat — расчёт заказа.
  DEFAULT_COLUMNS: [
    { key: 'lastName', label: 'Фамилия', labelKey: 'ps.ui.familiya', type: 'text', protected: true, required: true },
    { key: 'firstName', label: 'Имя', labelKey: 'ps.ui.imya', type: 'text', protected: true, required: true },
    { key: 'congregation', label: 'Собрание', labelKey: 'ps.ph.sobranie', type: 'text' },
    { key: 'status', label: 'Подтверждение участия', labelKey: 'ps.stud.podtverzhdenie_uchastiya', type: 'select', protected: true,
      options: [
        { value: 'listed', label: 'В списке филиала', labelKey: 'ps.stud.v_spiske_filiala' },
        { value: 'added', label: 'Добавлен вне списка', labelKey: 'ps.stud.dobavlen_vne_spiska' },
        { value: 'transferred', label: 'Передан из другого района', labelKey: 'ps.stud.peredan_iz_drugogo_rayona' },
        { value: 'withdrawn', label: 'Выбыл / не обучается', labelKey: 'ps.stud.vybyl_ne_obuchaetsya' }
      ] },
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
    { key: 'language', label: 'Язык учебника (текстом)', labelKey: 'ps.stud.yazyk_uchebnika_tekstom', type: 'text' },
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
    const stored = await DB.getMeta('studentColumns', null);
    if (stored && stored.length) {
      if (this.migrateColumnLabels(stored)) await DB.setMeta('studentColumns', stored);
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

  async list() {
    const items = await DB.list('students');
    const migrated = items.map((i) => this._migrateLegacy(i));
    for (let i = 0; i < items.length; i++) {
      if (migrated[i]._migrated) {
        const clean = { id: migrated[i].id, classId: migrated[i].classId, values: migrated[i].values };
        await DB.put('students', clean);
      }
    }
    return migrated
      .map((m) => ({ id: m.id, classId: m.classId, values: m.values }))
      .sort((a, b) => (a.values.lastName || '').localeCompare(b.values.lastName || '', 'ru'));
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
    return errors;
  },

  async save(student) {
    const errors = this.validate(student);
    if (errors.length) throw new Error(errors.join('; '));
    return DB.put('students', student);
  },

  async remove(id) {
    return DB.remove('students', id);
  },

  // ВНИМАНИЕ: на вход подаются объекты из list(), который отдаёт только
  // { id, classId, values }. Возвращаем ТОЛЬКО изменение classId, чтобы
  // вызывающий код не записывал в базу усечённую запись поверх полной
  // (раньше так терялось, например, поле fromRegistrationId).
  autoDistribute(students, classes) {
    if (!classes.length) return students;
    const sorted = [...students].filter((s) => (s.values || {}).status !== 'withdrawn');
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
      const v = s.values || {};
      if (v.status === 'withdrawn') return;
      const fmt = v.textbookFormat || 'standard';
      if (counts[fmt] !== undefined) counts[fmt]++;
    });
    return counts;
  }
};

window.Students = Students;
