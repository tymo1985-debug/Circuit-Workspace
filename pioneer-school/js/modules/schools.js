// schools.js — школы года (Ф1, 14.11.2026).
//
// Школы идут ПОСЛЕДОВАТЕЛЬНО: открытой (не завершённой) может быть только
// одна, и это всегда последняя. Новая школа заводится, когда все прежние
// завершены. Завершённая школа открывается только для чтения и документов.
// У каждой школы свой язык. Номер — порядковый в календарном году.
//
// Хранение и привязка записей к школе — js/db.js («ШКОЛЫ»). Здесь — правила
// и подписи. Отметку «завершена» в Ф1 ставит человек; в Ф7 её дополнит шаг
// «Итог» (присутствие, S-253).

const Schools = {
  list() { return DB.schools(); },
  current() { return DB.currentSchool(); },
  isReadOnly() { return DB.isReadOnly(); },

  label(school) { return school ? T('ps.school.label', { n: school.number }) : ''; },

  stateLabel(school) {
    return T(school && school.completed ? 'ps.school.state.completed' : 'ps.school.state.active');
  },

  // «Школа 2 · 2026 · Чешский · активна» — переключатель и списки.
  fullLabel(school) {
    if (!school) return '';
    return [this.label(school), school.year, Students.languageName(school.language), this.stateLabel(school)]
      .filter(Boolean).join(' · ');
  },

  openSchool() { return this.list().find((s) => !s.completed) || null; },

  async switchTo(schoolId) { return DB.setCurrentSchool(schoolId); },

  canCreate() { return !this.openSchool(); },

  async create({ language }) {
    const list = this.list();
    if (list.some((s) => !s.completed)) throw new Error(T('ps.school.err.finish_first'));
    const lang = String(language || '').trim();
    if (!lang) throw new Error(T('ps.school.err.language'));
    const now = new Date();
    const year = now.getFullYear();
    const number = list.filter((s) => s.year === year).reduce((max, s) => Math.max(max, s.number || 0), 0) + 1;
    const school = {
      id: 'school-' + now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      number,
      year,
      language: lang,
      stage: 1,
      completed: false,
      createdAt: now.toISOString(),
      completedAt: null
    };
    await DB.saveSchools([...list, school]);
    await DB.setCurrentSchool(school.id);
    return school;
  },

  async complete(schoolId) {
    const list = this.list();
    const school = list.find((s) => s.id === schoolId);
    if (!school || school.completed) return null;
    school.completed = true;
    school.completedAt = new Date().toISOString();
    await DB.saveSchools(list);
    return school;
  },

  // Вернуть в работу можно только последнюю школу: иначе открытых стало бы
  // две, а школы идут строго по очереди.
  canReopen(school) {
    const list = this.list();
    return !!(school && school.completed && list.length && list[list.length - 1].id === school.id);
  },

  async reopen(schoolId) {
    const list = this.list();
    const school = list.find((s) => s.id === schoolId);
    if (!this.canReopen(school)) throw new Error(T('ps.school.err.reopen_last'));
    school.completed = false;
    school.completedAt = null;
    await DB.saveSchools(list);
    return school;
  },

  async setLanguage(schoolId, language) {
    const list = this.list();
    const school = list.find((s) => s.id === schoolId);
    if (!school) return null;
    if (school.completed) {
      const error = new Error(T('ps.school.readonly_error'));
      error.code = 'PS_READONLY';
      throw error;
    }
    const lang = String(language || '').trim();
    if (!lang) throw new Error(T('ps.school.err.language'));
    school.language = lang;
    await DB.saveSchools(list);
    return school;
  }
};

window.Schools = Schools;
