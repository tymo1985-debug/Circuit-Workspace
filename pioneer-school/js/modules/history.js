// history.js — Ф4 «Обзор» (15.11.2026): журнал пионера и его путь по школе.
//
// РЕШЕНИЕ АЛЕКСА: «журнал + восстановить». История карточки собирается из
// двух источников, которые НЕ пересекаются:
//   1. Журнал — поле `history` записи пионера: [{ at, type, source, … }].
//      Пишется только при сохранении через Students (save / saveCard /
//      setClass / reinvite) — функцией stamp(). Типы:
//        created { origin, status }   — запись появилась;
//        status  { from, to, reason } — смена статуса вручную;
//        class   { from, to }         — смена класса (id классов).
//      Смена статуса рассылкой (source 'dispatch') и формуляром ('form') в
//      журнал НЕ пишется: эти события восстанавливаются из их собственных
//      данных (п. 2) — иначе одна строка появлялась бы дважды.
//   2. Восстановление — из того, что уже хранится: отметка рассылки
//      (meta `dispatch`: sentAt, deadline, remindedAt) и полученные формуляры
//      (registrations: convertedToStudentId, submittedAt, attending).
// Схема базы не меняется: `history` — поле записи, копия везёт его сама.

const PioneerHistory = {
  LIMIT: 200,
  // Чьи смены статуса восстанавливаются из собственных данных (см. шапку).
  DERIVED_SOURCES: ['dispatch', 'form'],

  _now() { return new Date().toISOString(); },

  /** События журнала между состоянием записи до (prev) и после (next) записи. */
  diff(prev, next, source = 'manual') {
    const at = this._now();
    const out = [];
    if (!prev) {
      out.push({ at, type: 'created', source, origin: next.origin || '', status: next.status || '' });
      return out;
    }
    if (prev.status !== next.status && !this.DERIVED_SOURCES.includes(source)) {
      out.push({ at, type: 'status', source, from: prev.status || '', to: next.status || '', reason: next.statusReason || '' });
    }
    if ((prev.classId || null) !== (next.classId || null)) {
      out.push({ at, type: 'class', source, from: prev.classId || null, to: next.classId || null });
    }
    return out;
  },

  /** Дописывает события в next.history (журнал берётся из prev, если в next его нет). */
  stamp(prev, next, source) {
    const base = Array.isArray(next.history) ? next.history
      : (prev && Array.isArray(prev.history) ? prev.history : []);
    const added = this.diff(prev, next, source);
    next.history = added.length ? [...base, ...added].slice(-this.LIMIT) : [...base];
    return next;
  },

  _day(value) { return String(value || '').slice(0, 10); },

  /**
   * Лента карточки, по времени. ctx: { classes, dispatchState, groupKey,
   * groupName, deadline, registrations }. Каждый элемент: { at, kind, params,
   * derived } — текст строит экран (ключи ps.hist.<kind>).
   */
  timeline(student, ctx = {}) {
    const classes = ctx.classes || [];
    const className = (id) => { const c = classes.find((x) => x.id === id); return c ? c.name : '—'; };
    const items = [];
    const log = Array.isArray(student.history) ? student.history : [];
    if (!log.some((e) => e.type === 'created')) {
      items.push({ at: '', kind: 'created_unknown', params: { origin: student.origin }, derived: true });
    }
    log.forEach((e) => {
      if (e.type === 'created') items.push({ at: e.at, kind: 'created_' + (e.source || 'manual'), params: { origin: e.origin } });
      else if (e.type === 'status') items.push({ at: e.at, kind: 'status', params: { from: e.from, to: e.to, reason: e.reason } });
      else if (e.type === 'class') {
        items.push(e.to
          ? { at: e.at, kind: e.source === 'auto' ? 'class_auto' : 'class', params: { name: className(e.to) } }
          : { at: e.at, kind: 'class_none', params: { name: className(e.from) } });
      }
    });
    const entry = (ctx.dispatchState || {})[ctx.groupKey] || null;
    if (entry && entry.sentAt) {
      items.push({ at: entry.sentAt, kind: ctx.deadline ? 'package' : 'package_nodl', params: { cong: ctx.groupName || '', deadline: ctx.deadline || '' }, derived: true });
    }
    if (entry && entry.remindedAt) {
      items.push({ at: entry.remindedAt, kind: 'reminded', params: { cong: ctx.groupName || '' }, derived: true });
    }
    (ctx.registrations || []).filter((r) => r && r.convertedToStudentId === student.id).forEach((r) => {
      const answer = r.attending === 'yes' ? 'willCome' : (r.attending === 'no' ? 'wontCome' : '');
      items.push({ at: r.submittedAt || '', kind: answer ? 'form' : 'form_blank', params: { answer }, derived: true });
    });
    // Без даты — в начало (восстановленное «в списке»), дальше по дню. У
    // рассылки и формуляра есть только день, поэтому внутри дня — естественный
    // порядок: появление → пакет → напоминание → формуляр → прочие события.
    const rank = (it) => (it.kind.startsWith('created') ? 0 : it.kind.startsWith('package') ? 1
      : it.kind === 'reminded' ? 2 : it.kind.startsWith('form') ? 3 : 4);
    return items.map((it, i) => ({ ...it, _i: i }))
      .sort((a, b) => (this._day(a.at) || '0').localeCompare(this._day(b.at) || '0') || rank(a) - rank(b) || a._i - b._i)
      .map(({ _i, ...it }) => it);
  },

  /** Дата первого события заданного вида (для пути пионера). */
  _firstAt(items, kinds) {
    const hit = items.find((it) => kinds.some((k) => it.kind.startsWith(k)) && it.at);
    return hit ? hit.at : '';
  },

  /**
   * Путь пионера: пять шагов экрана «Карточка». Шаг: { key, state, at, note }
   * state — done | current | todo | skip | bad.
   */
  path(student, ctx = {}) {
    const items = this.timeline(student, ctx);
    const status = student.status;
    const answered = ['willCome', 'wontCome', 'attended', 'notAttended'].includes(status);
    const refused = status === 'wontCome';
    const entry = (ctx.dispatchState || {})[ctx.groupKey] || {};
    const cls = (ctx.classes || []).find((c) => c.id === student.classId);
    const answerHit = items.find((it) => it.at && (it.kind === 'form'
      || (it.kind === 'status' && ['willCome', 'wontCome'].includes(it.params.to))));
    const answerAt = answerHit ? answerHit.at : '';
    const steps = [
      { key: 'invited', done: true, at: this._firstAt(items, ['created_']) },
      { key: 'letterSent', done: !!entry.sentAt || status !== 'invited', at: entry.sentAt || '' },
      { key: 'answered', done: answered, at: answerAt, note: answered ? status : '' },
      { key: 'classed', done: !!student.classId, skip: refused && !student.classId, note: cls ? cls.name : '' },
      { key: 'attended', done: status === 'attended', bad: status === 'notAttended', skip: refused }
    ];
    let currentSet = false;
    return steps.map((s) => {
      let state = s.done ? 'done' : (s.bad ? 'bad' : (s.skip ? 'skip' : 'todo'));
      if (state === 'todo' && !currentSet) { state = 'current'; currentSet = true; }
      return { key: s.key, state, at: s.at || '', note: s.note || '' };
    });
  }
};

window.PioneerHistory = PioneerHistory;
