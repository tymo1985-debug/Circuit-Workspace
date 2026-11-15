// overview.js — Ф4 «Обзор» (15.11.2026): этапы школы и общий список.
//
// ЭТАПЫ (решение Алекса — «автоматически по данным»): этап закрыт, когда это
// видно из данных; текущий — первый незакрытый. Ручных отметок и новых полей
// нет. Этап «Задания» до Ф6 считать нечем — он `later` и текущим не бывает.
// Функции чистые: экран собирает данные и передаёт их сюда (проверка —
// scripts/check-pioneer-overview.mjs).
//
// СПИСОК: фильтры и счётчики над Students.list(); значение фильтра '' = все.

const PSOverview = {
  STAGES: ['prep', 'assignment', 'list', 'dispatch', 'answers', 'classes', 'tasks', 'report'],
  // Куда ведёт кнопка «Что сделать сейчас».
  STAGE_ROUTE: {
    prep: 'anketa', assignment: 'assignment', list: 'students', dispatch: 'dispatch',
    answers: 'dispatch', classes: 'students', tasks: 'practical', report: 'afterschool'
  },
  WAITING: ['invited', 'letterSent'],
  COMING: ['willCome', 'attended'],

  /**
   * input: { anketa, substitutes, assignment, students, groups, orphans,
   *          classes, order, school }
   * → { stages: [{ key, n, state: done|current|todo|later, data }], current }
   */
  stages(input) {
    const students = input.students || [];
    const groups = input.groups || [];
    const classes = input.classes || [];
    const anketa = input.anketa || {};
    const assignment = input.assignment || {};
    const responded = students.filter((s) => !this.WAITING.includes(s.status));
    const coming = students.filter((s) => this.COMING.includes(s.status));
    const withInvitees = groups.filter((g) => g.invitees && g.invitees.length);
    const unclassed = coming.filter((s) => !s.classId);
    const locations = (anketa.proposedLocations || []).length;
    const subs = (input.substitutes || []).length;

    const raw = {
      prep: { done: locations > 0 && subs > 0, data: { locations, subs } },
      assignment: {
        done: !!(assignment.startDate && String(assignment.location || '').trim()),
        data: { start: assignment.startDate || '', end: assignment.endDate || '', location: assignment.location || '' }
      },
      list: {
        done: students.length > 0,
        data: { total: students.length, outside: students.filter((s) => s.origin && s.origin !== 'branchList').length }
      },
      dispatch: {
        done: withInvitees.length > 0 && withInvitees.every((g) => g.sent),
        data: { sent: withInvitees.filter((g) => g.sent).length, total: withInvitees.length, orphans: (input.orphans || []).length }
      },
      answers: {
        done: students.length > 0 && responded.length === students.length,
        data: {
          responded: responded.length,
          total: students.length,
          coming: coming.length,
          refused: students.filter((s) => s.status === 'wontCome' || s.status === 'notAttended').length,
          waiting: students.length - responded.length,
          overdue: groups.filter((g) => g.overdue).length
        }
      },
      classes: {
        done: classes.length > 0 && coming.length > 0 && unclassed.length === 0,
        data: { classes: classes.length, unclassed: unclassed.length, order: input.order ? Textbooks.calcOrderQuantity(input.order) : 0 }
      },
      tasks: { later: true, data: {} },
      report: { done: !!(input.school && input.school.completed), data: {} }
    };

    let current = null;
    const stages = this.STAGES.map((key, i) => {
      const r = raw[key];
      let state = r.later ? 'later' : (r.done ? 'done' : 'todo');
      if (state === 'todo' && !current) { state = 'current'; current = key; }
      return { key, n: i + 1, state, data: r.data };
    });
    return { stages, current };
  },

  // ---------- Общий список ----------

  /** Счётчики над списком (как на доске «Все пионеры»). */
  stats(students) {
    const expected = students.filter((s) => Students.isExpected(s));
    const yes = (s, key) => ((s.values || {})[key] || '') === 'yes';
    return {
      total: students.length,
      coming: students.filter((s) => this.COMING.includes(s.status)).length,
      refused: students.filter((s) => s.status === 'wontCome').length,
      waiting: students.filter((s) => this.WAITING.includes(s.status)).length,
      lodging: expected.filter((s) => yes(s, 'lodging')).length,
      special: expected.filter((s) => String((s.values || {}).specialNeeds || '').trim()).length
    };
  },

  congregationOf(s) { return String((s.values || {}).congregation || '').trim(); },

  /** Варианты фильтров из самих данных (собрания, языки). */
  options(students) {
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
    return {
      congregation: uniq(students.map((s) => this.congregationOf(s))),
      language: uniq(students.flatMap((s) => s.textbookLanguages || []))
    };
  },

  /**
   * f: { congregation, status, classId, gender, language, format, transport,
   *      lodging, origin }; '' = все. Особые значения: status '_waiting' —
   *      ждём ответа; classId '_none' / gender '_none' — не указано.
   */
  filter(students, f = {}) {
    const v = (s, k) => (s.values || {})[k] || '';
    return students.filter((s) => {
      if (f.congregation && this.congregationOf(s) !== f.congregation) return false;
      if (f.status === '_waiting') { if (!this.WAITING.includes(s.status)) return false; }
      else if (f.status && s.status !== f.status) return false;
      if (f.classId === '_none') { if (s.classId) return false; }
      else if (f.classId && s.classId !== f.classId) return false;
      if (f.gender === '_none') { if (s.gender) return false; }
      else if (f.gender && s.gender !== f.gender) return false;
      if (f.language && !(s.textbookLanguages || []).includes(f.language)) return false;
      if (f.format && (v(s, 'textbookFormat') || 'standard') !== f.format) return false;
      if (f.transport && v(s, 'transport') !== f.transport) return false;
      if (f.lodging && v(s, 'lodging') !== f.lodging) return false;
      if (f.origin && s.origin !== f.origin) return false;
      return true;
    });
  }
};

window.PSOverview = PSOverview;
