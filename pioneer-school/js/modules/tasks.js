// tasks.js — Ф6 «18 заданий» (15.11.2026), доска «Tasks» и раздел G мастер-макета.
//
// РЕШЕНИЯ АЛЕКСА (15.11.2026):
//  - Библиотека из 18 заданий ОБЩАЯ для всех школ (GLOBAL_META `taskLibrary`):
//    { no, lesson, participants: 2–4, rule, texts: { <язык>: { title,
//    situation, description } } }. Тексты вводит сам Алекс; правка текста
//    видна и при перепечатке бланков завершённой школы (снимков нет).
//  - Правило участников — одно на задание (RULES), не на роль.
//  - Каждое задание — ровно один раз в каждом классе.
//  - Ф6a (20.11.2026): день и время задания — из расписания
//    (js/modules/schedule.js): поле `practical` (1–4) задания → слот
//    практического занятия. Таблица уроков и план школы на 6 дней убраны
//    (решение Алекса 18.11); их старые ключи `lessonTable`, `schoolPlan`,
//    `schoolPlanTemplate` остаются в базе и копиях нетронутыми, не читаются.
//    Какое задание в каком занятии — список Алекса (пока заглушки: пусто).
//  - Распределение — meta `tasks` школы:
//    { [classId]: { [no]: { people: [studentId…], teacher: null|'A'|'Б',
//      day } } }. people[0] — главный, остальные — помогающие.
//    null у teacher — «как в расписании» (буква части урока). `day` —
//    наследие до Ф6a: хранится как было, не читается.
//  - «Распределить автоматически» заполняет только пустые места; ручные
//    решения не трогает. Нарушение правила — предупреждение, не запрет.
// Функции без DB — чистые (scripts/check-pioneer-tasks.mjs).

const PSTasks = {
  COUNT: 18,
  LESSONS: 18,
  DAYS: 6,
  PRACTICALS: [1, 2, 3, 4],
  TEACHERS: ['A', 'Б'],
  RULES: ['sameOrRelated', 'brothers', 'sisters', 'any'],
  MIN_PEOPLE: 2,
  MAX_PEOPLE: 4,
  FALLBACK_LANG: 'ru',
  KEYS: { library: 'taskLibrary', tasks: 'tasks' },

  // ---------- Библиотека ----------

  blankTask(no) { return { no, lesson: null, practical: null, participants: 2, rule: 'sameOrRelated', texts: {} }; },

  normalizeTask(t, no) {
    const base = this.blankTask(no);
    const src = t && typeof t === 'object' ? t : {};
    const lesson = Number(src.lesson);
    const n = Number(src.participants);
    const pr = Number(src.practical);
    return {
      no,
      lesson: lesson >= 1 && lesson <= this.LESSONS ? lesson : null,
      practical: this.PRACTICALS.includes(pr) ? pr : null,
      participants: n >= this.MIN_PEOPLE && n <= this.MAX_PEOPLE ? n : base.participants,
      rule: this.RULES.includes(src.rule) ? src.rule : base.rule,
      texts: src.texts && typeof src.texts === 'object' ? src.texts : {}
    };
  },

  /** Ровно 18 записей по номерам; лишнее отбрасывается, недостающее — пустое. */
  normalizeLibrary(list) {
    const byNo = new Map((Array.isArray(list) ? list : []).map((t) => [Number(t && t.no), t]));
    return Array.from({ length: this.COUNT }, (_, i) => this.normalizeTask(byNo.get(i + 1), i + 1));
  },

  async library() { return this.normalizeLibrary(await DB.getMeta(this.KEYS.library, [])); },

  async saveTask(task) {
    const lib = await this.library();
    const no = Number(task.no);
    const next = lib.map((t) => (t.no === no ? this.normalizeTask(task, no) : t));
    await DB.setMeta(this.KEYS.library, next);
    return next;
  },

  /** Текст задания на языке lang → ru → первый заполненный. */
  text(task, lang) {
    const texts = (task && task.texts) || {};
    const filled = (code) => {
      const t = texts[code];
      return t && ['title', 'situation', 'description'].some((k) => String(t[k] || '').trim());
    };
    const order = [lang, this.FALLBACK_LANG].concat(Object.keys(texts)).filter(Boolean);
    const used = order.find(filled);
    const t = used ? texts[used] : {};
    return {
      title: String(t.title || ''), situation: String(t.situation || ''), description: String(t.description || ''),
      lang: used || null, fallback: !!used && used !== lang
    };
  },

  // ---------- Распределение ----------

  async assignments() { return DB.getMeta(this.KEYS.tasks, {}) || {}; },
  async saveAssignments(all) { return DB.setMeta(this.KEYS.tasks, all); },

  slot(all, classId, no) {
    const s = ((all || {})[classId] || {})[no] || {};
    return {
      people: Array.isArray(s.people) ? s.people.filter(Boolean) : [],
      teacher: this.TEACHERS.includes(s.teacher) ? s.teacher : null,
      day: Number(s.day) >= 1 && Number(s.day) <= this.DAYS ? Number(s.day) : null
    };
  },

  setSlot(all, classId, no, slot) {
    const next = { ...(all || {}) };
    next[classId] = { ...(next[classId] || {}), [no]: { people: slot.people || [], teacher: slot.teacher || null, day: slot.day || null } };
    return next;
  },

  /**
   * Когда и у кого задание. Чистая функция.
   *  days — PSSchedule.build(...) школы.
   * → { practical, day, date, start, end, changed, teacher, teacherSrc }
   *   teacher: ручная правка → буква части урока практического занятия.
   */
  resolve(task, slot, days) {
    const at = task && task.practical && typeof PSSchedule !== 'undefined' ? PSSchedule.practicalIn(days, task.practical) : null;
    const manual = slot && this.TEACHERS.includes(slot.teacher) ? slot.teacher : null;
    const auto = at && this.TEACHERS.includes(at.teacher) ? at.teacher : null;
    return {
      practical: at ? task.practical : null,
      day: at ? at.day : null, date: at ? at.date : '', start: at ? at.start : '', end: at ? at.end : '',
      changed: !!(at && at.changed),
      teacher: manual || auto, teacherSrc: manual ? 'manual' : auto ? 'schedule' : null, autoTeacher: auto
    };
  },

  related(a, b) { return !!(a && b && (a.relations || []).some((r) => r.studentId === b.id)); },

  /** Может ли b стоять в задании вместе с a по правилу. */
  pairOk(rule, a, b) {
    if (rule === 'any') return true;
    if (rule === 'brothers') return a.gender === 'brother' && b.gender === 'brother';
    if (rule === 'sisters') return a.gender === 'sister' && b.gender === 'sister';
    return (!!a.gender && a.gender === b.gender) || this.related(a, b);
  },

  personOk(rule, s) {
    if (rule === 'brothers') return s.gender === 'brother';
    if (rule === 'sisters') return s.gender === 'sister';
    return true;
  },

  ruleOk(rule, people) {
    if (!people.every((s) => this.personOk(rule, s))) return false;
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) if (!this.pairOk(rule, people[i], people[j])) return false;
    }
    return true;
  },

  /** Замечания к месту: count (не хватает людей), rule, gone (не в классе). */
  problems(task, slot, byId) {
    const out = [];
    const present = slot.people.map((id) => byId.get(id)).filter(Boolean);
    if (present.length < slot.people.length) out.push('gone');
    if (slot.people.length !== task.participants) out.push('count');
    if (present.length > 1 && !this.ruleOk(task.rule, present)) out.push('rule');
    return out;
  },

  /**
   * Автозаполнение одного класса. Чистая функция.
   *  library — 18 заданий; slots — { [no]: slot } класса; members — пионеры класса.
   * → { slots: { [no]: slot }, filled: число добавленных мест }
   * Уже стоящие люди остаются; ушедшие из класса снимаются только с мест,
   * которые дозаполняются. Нагрузка ровная: сначала те, у кого заданий меньше.
   */
  propose(library, slots, members) {
    const byId = new Map(members.map((s) => [s.id, s]));
    const load = new Map(members.map((s) => [s.id, 0]));
    const mainLoad = new Map(members.map((s) => [s.id, 0]));
    const pairs = new Map();
    const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    const met = (ids, c) => ids.reduce((n, id) => n + (pairs.get(pairKey(id, c.id)) || 0), 0);
    const meet = (ids) => ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => pairs.set(pairKey(a, b), (pairs.get(pairKey(a, b)) || 0) + 1)));
    const out = {};
    library.forEach((t) => {
      const s = this.slot({ c: slots || {} }, 'c', t.no);
      out[t.no] = s;
      s.people.forEach((id, i) => {
        if (!load.has(id)) return;
        load.set(id, load.get(id) + 1);
        if (i === 0) mainLoad.set(id, mainLoad.get(id) + 1);
      });
      meet(s.people);
    });
    const name = (s) => Students.fullName(s);
    // Сначала те, у кого заданий меньше; среди помогающих — с кем главный
    // ещё не работал (напарники не повторяются без нужды).
    const order = (list, main, ids) => list.slice().sort((a, b) =>
      (load.get(a.id) - load.get(b.id))
      || (main ? mainLoad.get(a.id) - mainLoad.get(b.id) : met(ids, a) - met(ids, b))
      || name(a).localeCompare(name(b)));
    let filled = 0;

    library.forEach((t) => {
      const s = out[t.no];
      if (s.people.length >= t.participants) return;
      const people = s.people.filter((id) => byId.has(id));
      const chosen = people.map((id) => byId.get(id));
      const fits = (c) => !people.includes(c.id) && this.personOk(t.rule, c) && chosen.every((p) => this.pairOk(t.rule, p, c));
      if (!chosen.length) {
        // главный — тот, у кого найдётся достаточно напарников
        const mains = order(members.filter((c) => this.personOk(t.rule, c)), true);
        const main = mains.find((m) => members.filter((c) => c.id !== m.id && this.personOk(t.rule, c) && this.pairOk(t.rule, m, c)).length >= t.participants - 1) || mains[0];
        if (!main) return;
        chosen.push(main); people.push(main.id);
        mainLoad.set(main.id, mainLoad.get(main.id) + 1);
        load.set(main.id, load.get(main.id) + 1);
        filled++;
      }
      while (people.length < t.participants) {
        // Пока остаётся больше одного места, сначала берём того же пола:
        // супруг разного пола «закрыл» бы группу для остальных.
        const cands = order(members.filter(fits), false, people);
        const sameGender = cands.filter((c) => chosen.every((p) => p.gender && p.gender === c.gender));
        const next = (t.participants - people.length > 1 && sameGender.length ? sameGender : cands)[0];
        if (!next) break;
        chosen.push(next); people.push(next.id);
        load.set(next.id, load.get(next.id) + 1);
        filled++;
      }
      if (people.length > s.people.length) meet(people);
      out[t.no] = { ...s, people };
    });
    return { slots: out, filled };
  },

  /** Для обзора: сколько мест заполнено полностью во всех классах. */
  progress(library, all, classes) {
    let done = 0;
    classes.forEach((c) => library.forEach((t) => {
      if (this.slot(all, c.id, t.no).people.length >= t.participants) done++;
    }));
    return { done, total: classes.length * library.length };
  }
};

window.PSTasks = PSTasks;
