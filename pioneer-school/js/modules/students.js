// students.js — учащиеся (пионеры) с гибкой системой столбцов.
// Каждый учащийся хранится как { id, classId, values: { [columnKey]: значение } },
// набор столбцов пользователь может менять: добавлять, переименовывать, удалять
// (кроме двух системных столбцов, от которых зависит расчёт учебников и статус —
// их можно переименовать, но не удалить).

const Students = {
  YES_NO_OPTIONS: [{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }],

  STATUS_OPTIONS: [
    { value: 'listed', label: 'В списке филиала' },
    { value: 'added', label: 'Добавлен вне списка (согласовано)' },
    { value: 'transferred', label: 'Передан из другого района' },
    { value: 'withdrawn', label: 'Выбыл / не обучается' }
  ],

  TEXTBOOK_FORMAT_OPTIONS: [
    { value: 'standard', label: 'Обычный (язык школы)' },
    { value: 'otherLanguage', label: 'На другом языке' },
    { value: 'braille', label: 'Брайль / спецформат (S-59)' },
    { value: 'print', label: 'Печатный (по запросу)' }
  ],

  // Столбцы, создаваемые при первом запуске. Пользователь может изменить всё,
  // кроме удаления столбцов с protected:true (lastName/firstName/status/textbookFormat) —
  // от status зависит распределение по классам и S-253, от textbookFormat — расчёт заказа.
  DEFAULT_COLUMNS: [
    { key: 'lastName', label: 'Фамилия', type: 'text', protected: true, required: true },
    { key: 'firstName', label: 'Имя', type: 'text', protected: true, required: true },
    { key: 'congregation', label: 'Собрание', type: 'text' },
    { key: 'status', label: 'Подтверждение участия', type: 'select', protected: true,
      options: [
        { value: 'listed', label: 'В списке филиала' },
        { value: 'added', label: 'Добавлен вне списка' },
        { value: 'transferred', label: 'Передан из другого района' },
        { value: 'withdrawn', label: 'Выбыл / не обучается' }
      ] },
    { key: 'textbookFormat', label: 'Формат учебника', type: 'select', protected: true,
      options: [
        { value: 'standard', label: 'Обычный' },
        { value: 'otherLanguage', label: 'На другом языке' },
        { value: 'braille', label: 'Брайль' },
        { value: 'print', label: 'Печатный' }
      ] },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Телефон', type: 'text' },
    { key: 'address', label: 'Адрес проживания', type: 'text' },
    { key: 'transport', label: 'Есть автомобиль', type: 'select', options: [{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }] },
    { key: 'lodging', label: 'Нужен ночлег', type: 'select', options: [{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }] },
    { key: 'language', label: 'Язык учебника (текстом)', type: 'text' },
    { key: 'notes', label: 'Доп. сведения', type: 'textarea' }
  ],

  // ---------- Столбцы ----------
  async getColumns() {
    const stored = await DB.getMeta('studentColumns', null);
    if (stored && stored.length) return stored;
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
    if (!label || !label.trim()) throw new Error('Укажите название столбца');
    const cols = await this.getColumns();
    const key = this.slugifyKey(label, cols.map((c) => c.key));
    cols.push({ key, label: label.trim(), type, options, protected: false });
    await this.saveColumns(cols);
    return key;
  },

  async renameColumn(key, newLabel) {
    const cols = await this.getColumns();
    const col = cols.find((c) => c.key === key);
    if (col && newLabel && newLabel.trim()) col.label = newLabel.trim();
    await this.saveColumns(cols);
  },

  async removeColumn(key) {
    const cols = await this.getColumns();
    const col = cols.find((c) => c.key === key);
    if (col && col.protected) {
      throw new Error('Этот столбец используется другими разделами (расчёт учебников, распределение по классам) и не может быть удалён. Его можно переименовать.');
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
    const found = cols.find((c) => norm(c.label) === norm(label));
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
    if (!v.lastName || !String(v.lastName).trim()) errors.push('Укажите фамилию');
    if (!v.firstName || !String(v.firstName).trim()) errors.push('Укажите имя');
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
