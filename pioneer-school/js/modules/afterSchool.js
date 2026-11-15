// afterSchool.js — «После школы» (Ф7, 15.11.2026): отметки присутствия и
// S-253 «Прошедшие обучение в Школе пионерского служения», гл.4.
//
// ОТМЕТКИ — это статус пионера (attended / notAttended + причина), без своих
// полей. Ставятся только `mark()` через Students.saveCard (журнал, source
// 'attendance'). Повторный клик по той же отметке возвращает «Придёт».
//
// S-253 — ЖИВОЙ РАСЧЁТ (решение Алекса 15.11.2026): `report()` — чистая
// функция над списком пионеров и meta `afterSchool_s253` школы:
//   стр.1 — из списка филиала (origin 'branchList'), но не прошли обучение:
//           «Не придёт» / «Не был» с причиной; без ответа и без отметки —
//           тоже сюда, с причиной «нет ответа» / «нет отметки» (предупреждение,
//           не запрет);
//   стр.2 — «Был», но origin не 'branchList'.
// Meta хранит только то, чего нет в статусах: ручные строки прежнего формата
// (`notAttendedFromList` / `attendedNotOnList` — не переименовывать, это
// контракт с копиями), скрытые авто-строки `hidden` (id пионеров) и отметку
// «отправлено филиалу» (`submitted` / `submittedDate`).

const AfterSchool = {
  OPEN: ['invited', 'letterSent', 'willCome'],
  MARKABLE: ['willCome', 'attended', 'notAttended'],

  async get() {
    const d = await DB.getMeta('afterSchool_s253', null);
    return this.normalize(d);
  },

  normalize(d) {
    const src = d && typeof d === 'object' ? d : {};
    const list = (a) => (Array.isArray(a) ? a.filter((x) => x && String(x.name || '').trim()) : []);
    return {
      notAttendedFromList: list(src.notAttendedFromList),
      attendedNotOnList: list(src.attendedNotOnList),
      hidden: Array.isArray(src.hidden) ? src.hidden.filter(Boolean) : [],
      submitted: !!src.submitted,
      submittedDate: src.submittedDate || ''
    };
  },

  async save(data) {
    return DB.setMeta('afterSchool_s253', this.normalize(data));
  },

  /** Причина строки стр.1 как код (переводится на языке интерфейса/документа). */
  reasonCode(s) {
    if (s.status === 'wontCome' || s.status === 'notAttended') return '';
    return s.status === 'willCome' ? 'unmarked' : 'noAnswer';
  },

  /**
   * students — Students.list(); data — get().
   * → { page1: [{ id, name, congregation, reason, reasonCode, status, manual, hidden }],
   *     page2: [{ id, name, congregation, origin, manual, hidden }],
   *     open: [student] — из списка филиала без итоговой отметки,
   *     attended, failed — счётчики по видимым строкам }
   */
  report(students, data) {
    const d = this.normalize(data);
    const hidden = new Set(d.hidden);
    const cong = (s) => ((s.values || {}).congregation || '');
    const page1 = [];
    const page2 = [];
    const open = [];
    (students || []).forEach((s) => {
      const fromList = (s.origin || 'branchList') === 'branchList';
      if (fromList && s.status !== 'attended') {
        if (this.OPEN.includes(s.status)) open.push(s);
        page1.push({
          id: s.id, name: Students.fullName(s), congregation: cong(s), status: s.status,
          reason: String(s.statusReason || '').trim(), reasonCode: this.reasonCode(s),
          manual: false, hidden: hidden.has(s.id)
        });
      } else if (!fromList && s.status === 'attended') {
        page2.push({ id: s.id, name: Students.fullName(s), congregation: cong(s), origin: s.origin, manual: false, hidden: hidden.has(s.id) });
      }
    });
    d.notAttendedFromList.forEach((m, i) => page1.push({
      id: 'm1:' + i, name: String(m.name).trim(), congregation: m.congregation || '', status: '',
      reason: String(m.reason || '').trim(), reasonCode: '', manual: true, hidden: false
    }));
    d.attendedNotOnList.forEach((m, i) => page2.push({
      id: 'm2:' + i, name: String(m.name).trim(), congregation: m.congregation || '', origin: '', manual: true, hidden: false
    }));
    const attended = (students || []).filter((s) => s.status === 'attended').length + d.attendedNotOnList.length;
    const failed = page1.filter((r) => !r.hidden).length;
    return { page1, page2, open, attended, failed };
  },

  /** Отметка присутствия. value: 'attended' | 'notAttended' | null (снять). */
  async mark(studentId, value, reason) {
    if (value === 'notAttended' && !String(reason || '').trim()) throw new Error(T('ps.pioneer.err.reason'));
    const patch = value
      ? { status: value, statusReason: value === 'notAttended' ? String(reason).trim() : '' }
      : { status: 'willCome', statusReason: '' };
    return Students.saveCard(studentId, patch, { source: 'attendance' });
  },

  async toggleHidden(id) {
    const d = await this.get();
    d.hidden = d.hidden.includes(id) ? d.hidden.filter((x) => x !== id) : d.hidden.concat(id);
    await this.save(d);
    return d;
  },

  async removeManual(rowId) {
    const d = await this.get();
    const [page, idx] = String(rowId).split(':');
    const key = page === 'm1' ? 'notAttendedFromList' : 'attendedNotOnList';
    d[key].splice(Number(idx), 1);
    await this.save(d);
    return d;
  },

  EXPENSES_NOTE: 'Расходы районного старейшины — по «Руководству для районных старейшин» (tg) и чек-листу S-256. Старейшина-пионер, преподававший вместо районного старейшины, тоже может подать расходы вместе с расходами районного старейшины (гл.4, п.2).'
};

window.AfterSchool = AfterSchool;
