// textbooks.js — расчёт и учёт заказа учебников (гл.2, п.12-17)
// Формула из п.12: к количеству, запрошенному учащимися, добавить 5
// и вычесть количество учебников, уже имеющихся в наличии у районного старейшины.

const Textbooks = {
  calcOrderQuantity({ requestedByStudents = 0, alreadyInStock = 0 }) {
    const qty = Number(requestedByStudents || 0) + 5 - Number(alreadyInStock || 0);
    return Math.max(0, qty);
  },

  async getOrder() {
    const order = await DB.get('textbookOrder', 'main');
    return order || {
      id: 'main',
      requestedByStudents: 0,
      alreadyInStock: 0,
      otherLanguageRequests: [],   // [{language, qty}] — п.13
      brailleRequests: [],         // [{studentId, format}] — п.15, оформляется через S-59
      received: false,
      receivedCount: null,
      recountedOnReceipt: false
    };
  },

  async save(order) {
    order.id = 'main';
    order.orderQuantity = this.calcOrderQuantity(order);
    return DB.put('textbookOrder', order);
  },

  // ---------- Ф5 (15.11.2026): заказ из ответов, язык × формат ----------
  // Решения Алекса: «+5» — только к печатным (к каждой печатной строке
  // языка); основа — подтвердившие + ждём ответа (`expected`) или только
  // подтвердившие (`confirmed`). «В наличии» — по строке (`order.stock`).
  // Прежние поля requestedByStudents / alreadyInStock / orderQuantity
  // остаются СУММАМИ по строкам: по ним печатают PDF/CSV и читают старые копии.
  RESERVE: 5,
  CONFIRMED: ['willCome', 'attended'],
  WAITING: ['invited', 'letterSent'],
  FORMATS: ['print', 'digital', 'braille'],

  formatOf(student) {
    const f = (student.values || {}).textbookFormat || 'standard';
    return f === 'print' ? 'print' : (f === 'braille' ? 'braille' : 'digital');
  },

  rowKey(language, format) { return `${language}|${format}`; },

  /**
   * → { rows: [{ key, language, format, byClass: {classId: n}, none, need,
   *             reserve, stock, order }], total: {…}, basis }
   * none — в заказе, но без класса (ждём ответа или не распределён).
   */
  compute({ students = [], classes = [], order = {}, schoolLanguage = '' }) {
    const basis = order.basis === 'confirmed' ? 'confirmed' : 'expected';
    const take = basis === 'confirmed' ? this.CONFIRMED : this.CONFIRMED.concat(this.WAITING);
    const classIds = new Set(classes.map((c) => c.id));
    const stock = order.stock || {};
    const rows = new Map();
    students.filter((s) => take.includes(s.status)).forEach((s) => {
      const langs = (s.textbookLanguages || []).length ? s.textbookLanguages : [schoolLanguage || '—'];
      const format = this.formatOf(s);
      langs.forEach((language) => {
        const key = this.rowKey(language, format);
        if (!rows.has(key)) rows.set(key, { key, language, format, byClass: {}, none: 0, need: 0 });
        const row = rows.get(key);
        if (s.classId && classIds.has(s.classId) && this.CONFIRMED.includes(s.status)) row.byClass[s.classId] = (row.byClass[s.classId] || 0) + 1;
        else row.none++;
        row.need++;
      });
    });
    // Строка, по которой «в наличии» уже введено, видна и без спроса.
    Object.keys(stock).forEach((key) => {
      if (rows.has(key) || !Number(stock[key])) return;
      const [language, format] = key.split('|');
      rows.set(key, { key, language, format, byClass: {}, none: 0, need: 0 });
    });
    const out = [...rows.values()].map((r) => {
      const reserve = r.format === 'print' && r.need > 0 ? this.RESERVE : 0;
      const inStock = Math.max(0, Number(stock[r.key]) || 0);
      return { ...r, reserve, stock: inStock, order: Math.max(0, r.need + reserve - inStock) };
    }).sort((a, b) => (a.language === schoolLanguage ? -1 : 0) - (b.language === schoolLanguage ? -1 : 0)
      || a.language.localeCompare(b.language) || this.FORMATS.indexOf(a.format) - this.FORMATS.indexOf(b.format));
    const sum = (k) => out.reduce((n, r) => n + r[k], 0);
    const byClass = {};
    out.forEach((r) => Object.entries(r.byClass).forEach(([id, n]) => { byClass[id] = (byClass[id] || 0) + n; }));
    return { basis, rows: out, total: { byClass, none: sum('none'), need: sum('need'), reserve: sum('reserve'), stock: sum('stock'), order: sum('order') } };
  },

  /** Сохранить заказ Ф5: основа, наличие по строкам и суммы для экспорта. */
  async saveComputed(order, result) {
    const next = {
      ...order,
      id: 'main',
      basis: result.basis,
      stock: { ...(order.stock || {}) },
      requestedByStudents: result.total.need,
      alreadyInStock: result.total.stock,
      orderQuantity: result.total.order
    };
    return DB.put('textbookOrder', next);
  },

  // Напоминание из п.14: заказ нужно оформить через месяц после получения
  // «Списка для Школы пионерского служения»; учебники должны быть присланы
  // минимум за месяц до начала Школы.
  REMINDERS: [
    T('ps.tb.zakazat_uchebniki_cherez_mesyac'),
    T('ps.tb.uchebniki_dolzhny_priyti_minimum'),
    T('ps.tb.pereschitat_uchebniki_srazu_posle'),
    T('ps.tb.uchebniki_dlya_braylya_slabovidyaschih'),
    T('ps.tb.pioner_prekrativshiy_sluzhenie_do')
  ]
};

window.Textbooks = Textbooks;
