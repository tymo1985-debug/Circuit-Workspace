// substitutes.js — заместители преподавателей (S-257: рекомендация; гл.2 п.9: что им предоставить)

// Предупреждения (в отличие от блокирующих ошибок) помечаются техническим
// префиксом, а не словом «Внимание»: раньше проверка шла по русскому тексту
// и сломалась бы при переводе интерфейса.
const WARN_PREFIX = '\u26A0 ';

const Substitutes = {
  async list() {
    const items = await DB.list('substitutes');
    // сортировка "в порядке предпочтения" — по полю rank (гл.1 п.6)
    return items.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  },

  validate(sub) {
    const errors = [];
    if (!sub.fullName || !sub.fullName.trim()) errors.push(T('ps.sub.ukazhite_imya_i_familiyu'));
    if (sub.age !== undefined && sub.age !== null && sub.age !== '' && Number(sub.age) >= 80) {
      errors.push(WARN_PREFIX + T('ps.sub.age_warning'));
    }
    return errors;
  },

  async save(sub) {
    const errors = this.validate(sub);
    // возрастное предупреждение не блокирует сохранение, только предупреждает — это не запрет ввода данных,
    // а требование регламента к рекомендации; оставляем решение районному старейшине.
    const blocking = errors.filter((e) => !e.startsWith(WARN_PREFIX));
    if (blocking.length) throw new Error(blocking.join('; '));
    return DB.put('substitutes', sub);
  },

  async remove(id) {
    return DB.remove('substitutes', id);
  },

  // Чек-лист того, что нужно предоставить заместителю (гл.2, п.9)
  NOTIFICATION_CHECKLIST: [
    T('ps.sub.check_s255'),
    T('ps.sub.check_plans'),
    T('ps.sub.check_form'),
    T('ps.sub.check_credit'),
    T('ps.sub.check_s236'),
    T('ps.sub.check_s212')
  ]
};

window.Substitutes = Substitutes;
