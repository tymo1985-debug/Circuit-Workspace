// substitutes.js — заместители преподавателей (S-257: рекомендация; гл.2 п.9: что им предоставить)

const Substitutes = {
  async list() {
    const items = await DB.list('substitutes');
    // сортировка "в порядке предпочтения" — по полю rank (гл.1 п.6)
    return items.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  },

  validate(sub) {
    const errors = [];
    if (!sub.fullName || !sub.fullName.trim()) errors.push('Укажите имя и фамилию');
    if (sub.age !== undefined && sub.age !== null && sub.age !== '' && Number(sub.age) >= 80) {
      errors.push('Внимание: братьев 80 лет и старше не следует рассматривать заместителем преподавателя (гл.1, п.5)');
    }
    return errors;
  },

  async save(sub) {
    const errors = this.validate(sub);
    // возрастное предупреждение не блокирует сохранение, только предупреждает — это не запрет ввода данных,
    // а требование регламента к рекомендации; оставляем решение районному старейшине.
    const blocking = errors.filter((e) => !e.startsWith('Внимание'));
    if (blocking.length) throw new Error(blocking.join('; '));
    return DB.put('substitutes', sub);
  },

  async remove(id) {
    return DB.remove('substitutes', id);
  },

  // Чек-лист того, что нужно предоставить заместителю (гл.2, п.9)
  NOTIFICATION_CHECKLIST: [
    'Доступ на JW Hub к учебнику S-255 (эл. версия)',
    'Доступ на JW Hub к планам практических занятий',
    'Копия бланка «Назначение на Школу пионерского служения»',
    'Информация о кредите 30 часов (если преподаёт все 6 дней)',
    'Ссылка на «Инструкции для новых общих пионеров» (S-236)',
    'Для спецпионеров/миссионеров: напоминание сделать пометку «Преподавал на Школе пионерского служения» в S-212 и S-4'
  ]
};

window.Substitutes = Substitutes;
