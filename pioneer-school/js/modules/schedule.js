// schedule.js — Ф6a «Расписание школы» (20.11.2026).
//
// ИСТОЧНИК: PSS-sched_U.docx — «Расписание занятий в Школе пионерского
// служения» (рус.), переданный Алексом 20.11.2026.
//
// РЕШЕНИЯ АЛЕКСА (20.11.2026):
//  - Расписание ТОЛЬКО ДЛЯ ЧТЕНИЯ: уроки, порядок, названия, номера песен,
//    метки практических занятий и повторений не редактируются.
//  - Время стандартное (~80 %). Редкое исключение — своё время у слота в
//    одной школе: meta `scheduleTimes` школы хранит только отличия
//    { [slotId]: { start, end } }; пусто — как в шаблоне. Шаблон не меняется.
//  - Даты дней — от даты начала школы (`Assignment.startDate`, понедельник).
//  - Задания проходят в 4 практических занятиях; слоты закреплены здесь
//    (PRACTICAL). Какое задание в каком занятии — поле `practical` задания
//    в библиотеке (список Алекса), автоматического распределения нет.
//  - Песни — только номер.
//  - Преподаватель по умолчанию — буква части урока (а → А, б → Б, S-255);
//    у урока 18 — как в расписании.
//  - Названия — по языкам; пока есть только ru, остальные — когда придут
//    файлы (_X, _K). Нет названия на языке — русское.
//  - «Сейчас» (20.11.2026, варианты A + C): статус по местному времени
//    устройства — `status()`; данных не хранит, на печать не влияет.
// Функции без DB — чистые (scripts/check-pioneer-schedule.mjs).

const PSSchedule = {
  DAYS: 6,
  FALLBACK_LANG: 'ru',
  KEYS: { times: 'scheduleTimes' },

  // kind: lesson | break | lunch. teacher: 'A' | 'Б'. practical: 1–4. review: день 1–5.
  TEMPLATE: [
    { open: 81, close: 73, slots: [
      { id: '1a', start: '08:25', end: '09:00' },
      { id: '1b', start: '09:00', end: '10:15' },
      { kind: 'break', minutes: 15 },
      { id: '2a', start: '10:30', end: '12:00' },
      { kind: 'lunch', minutes: 60 },
      { id: '2b', start: '13:00', end: '14:25' },
      { kind: 'break', minutes: 15 },
      { id: '3a', start: '14:40', end: '16:00' },
      { id: '3b', start: '16:00', end: '16:35', review: 1 }
    ] },
    { open: 67, close: 58, slots: [
      { id: '4a', start: '08:25', end: '09:30' },
      { id: '4b', start: '09:30', end: '10:30' },
      { kind: 'break', minutes: 15 },
      { id: '5a', start: '10:45', end: '12:00' },
      { kind: 'lunch', minutes: 60 },
      { id: '5b', start: '13:00', end: '14:25', practical: 1 },
      { kind: 'break', minutes: 15 },
      { id: '6a', start: '14:40', end: '16:00' },
      { id: '6b', start: '16:00', end: '16:35', review: 2 }
    ] },
    { open: 70, close: 57, slots: [
      { id: '7a', start: '08:25', end: '09:30' },
      { id: '7b', start: '09:30', end: '10:30' },
      { kind: 'break', minutes: 15 },
      { id: '8a', start: '10:45', end: '12:00' },
      { kind: 'lunch', minutes: 60 },
      { id: '8b', start: '13:00', end: '14:25' },
      { kind: 'break', minutes: 15 },
      { id: '9a', start: '14:40', end: '16:00', practical: 2 },
      { id: '9b', start: '16:00', end: '16:35', review: 3 }
    ] },
    { open: 77, close: 60, slots: [
      { id: '10a', start: '08:25', end: '09:30' },
      { id: '10b', start: '09:30', end: '10:30' },
      { kind: 'break', minutes: 15 },
      { id: '11a', start: '10:45', end: '12:00' },
      { kind: 'lunch', minutes: 60 },
      { id: '11b', start: '13:00', end: '14:25' },
      { kind: 'break', minutes: 15 },
      { id: '12a', start: '14:40', end: '16:00', practical: 3 },
      { id: '12b', start: '16:00', end: '16:35', review: 4 }
    ] },
    { open: 68, close: 79, slots: [
      { id: '13a', start: '08:25', end: '09:30' },
      { id: '13b', start: '09:30', end: '10:30' },
      { kind: 'break', minutes: 15 },
      { id: '14a', start: '10:45', end: '12:00' },
      { kind: 'lunch', minutes: 60 },
      { id: '14b', start: '13:00', end: '14:25', practical: 4 },
      { kind: 'break', minutes: 15 },
      { id: '15a', start: '14:40', end: '16:00' },
      { id: '15b', start: '16:00', end: '16:35', review: 5 }
    ] },
    { open: 76, close: 84, slots: [
      { id: '16a', start: '08:25', end: '09:30' },
      { id: '16b', start: '09:30', end: '10:30' },
      { kind: 'break', minutes: 15 },
      { id: '17a', start: '10:45', end: '12:00' },
      { kind: 'lunch', minutes: 60 },
      { id: '17b', start: '13:00', end: '14:00' },
      { kind: 'break', minutes: 10 },
      { id: '18-1', start: '14:10', end: '14:30', teacher: 'A' },
      { id: '18-2', start: '14:30', end: '14:50', teacher: 'Б' },
      { id: '18-3', start: '14:50', end: '15:15', teacher: 'A' }
    ] }
  ],

  // Названия частей уроков. Ключ — id слота.
  TITLES: {
    ru: {
      '1a': 'Пояснения к курсу Школы пионерского служения',
      '1b': 'Укрепляй дружбу с Иеговой',
      '2a': 'Перевод «Новый мир». Часть 1',
      '2b': 'Перевод «Новый мир». Часть 2',
      '3a': 'Иди в ногу с организацией Бога',
      '3b': 'Повторение. День 1',
      '4a': 'Поддерживай правление Иеговы',
      '4b': 'Проявляй к людям искренний интерес',
      '5a': 'Проповедь по домам — наш основной вид служения',
      '5b': 'Проповедь по домам — наш основной вид служения',
      '6a': 'Женщины, которые радуют сердце Иеговы',
      '6b': 'Повторение. День 2',
      '7a': 'Принимай советы и наставление',
      '7b': 'Не поддавайся влиянию «духа этого мира»',
      '8a': 'Будь безупречен в глазах Бога',
      '8b': 'Участвуй в разных видах служения',
      '9a': 'Участвуй в разных видах служения',
      '9b': 'Повторение. День 3',
      '10a': 'Цени роль Иисуса Христа',
      '10b': 'Руководствуйся библейскими принципами',
      '11a': 'Продолжай расти духовно',
      '11b': 'Повторные посещения, которые достигают цели',
      '12a': 'Повторные посещения, которые достигают цели',
      '12b': 'Повторение. День 4',
      '13a': 'Учись у Иисуса Христа',
      '13b': 'Умело проводи изучения Библии. Часть 1',
      '14a': 'Умело проводи изучения Библии. Часть 2',
      '14b': 'Умело проводи изучения Библии',
      '15a': 'Помогай другим стремиться к духовной зрелости',
      '15b': 'Повторение. День 5',
      '16a': '«Радость, которую даёт Иегова, — ваша сила»',
      '16b': 'Иегова благословляет тех, кто ему доверяет',
      '17a': 'Постоянно молись',
      '17b': 'Стойкость ведёт к одобрению Бога',
      '18-1': 'Комментарии учащихся',
      '18-2': 'Заключительная речь',
      '18-3': 'Заключительная речь и заключение'
    }
  },

  // ---------- Чтение шаблона ----------

  /** «5b» → { lesson: 5, part: 'б' }; «18-2» → { lesson: 18, part: '' }. */
  parseId(id) {
    const m = /^(\d+)([ab]?)/.exec(String(id || ''));
    if (!m) return { lesson: null, part: '' };
    return { lesson: Number(m[1]), part: m[2] === 'a' ? 'а' : m[2] === 'b' ? 'б' : '' };
  },

  /** Подпись урока: «5б», «18». */
  label(id) { const p = this.parseId(id); return p.lesson ? p.lesson + p.part : ''; },

  /** Преподаватель по умолчанию: явный у слота → буква части (а → A, б → Б). */
  teacherOf(slot) {
    if (slot.teacher) return slot.teacher;
    const p = this.parseId(slot.id).part;
    return p === 'а' ? 'A' : p === 'б' ? 'Б' : null;
  },

  title(id, lang) {
    const own = (this.TITLES[lang] || {})[id];
    if (own) return { text: own, fallback: false };
    return { text: (this.TITLES[this.FALLBACK_LANG] || {})[id] || '', fallback: !!lang && lang !== this.FALLBACK_LANG };
  },

  /** Номер дня (1–6) урока. */
  dayOfLesson(n) {
    const idx = this.TEMPLATE.findIndex((d) => d.slots.some((s) => s.id && this.parseId(s.id).lesson === Number(n)));
    return idx >= 0 ? idx + 1 : null;
  },

  /** Слот практического занятия 1–4 с днём. */
  practical(n) {
    for (let i = 0; i < this.TEMPLATE.length; i++) {
      const s = this.TEMPLATE[i].slots.find((x) => x.practical === Number(n));
      if (s) return { ...s, day: i + 1 };
    }
    return null;
  },

  PRACTICALS: [1, 2, 3, 4],

  // ---------- Время ----------

  validTime(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')); },

  /** Только отличия от шаблона; неизвестные слоты и мусор отбрасываются. */
  normalizeTimes(map) {
    const ids = new Set(this.TEMPLATE.flatMap((d) => d.slots.filter((s) => s.id).map((s) => s.id)));
    const out = {};
    Object.entries(map && typeof map === 'object' ? map : {}).forEach(([id, v]) => {
      if (!ids.has(id) || !v) return;
      const base = this.baseSlot(id);
      const start = this.validTime(v.start) ? v.start : base.start;
      const end = this.validTime(v.end) ? v.end : base.end;
      if (start !== base.start || end !== base.end) out[id] = { start, end };
    });
    return out;
  },

  baseSlot(id) {
    for (const d of this.TEMPLATE) { const s = d.slots.find((x) => x.id === id); if (s) return s; }
    return null;
  },

  async times() { return this.normalizeTimes(await DB.getMeta(this.KEYS.times, {})); },

  async setTime(id, start, end) {
    const all = await this.times();
    return DB.setMeta(this.KEYS.times, this.normalizeTimes({ ...all, [id]: { start, end } }));
  },

  async resetTime(id) {
    const all = await this.times();
    delete all[id];
    return DB.setMeta(this.KEYS.times, all);
  },

  async resetAll() { return DB.setMeta(this.KEYS.times, {}); },

  // ---------- Сборка ----------

  /** 'YYYY-MM-DD' + n дней → 'YYYY-MM-DD' (без часовых поясов). */
  addDays(iso, n) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return d.toISOString().slice(0, 10);
  },

  /** 1 = понедельник … 7 = воскресенье; null — нет даты. */
  weekday(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    const w = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return w === 0 ? 7 : w;
  },

  /**
   * Расписание школы. Чистая функция.
   *  startDate — дата начала (понедельник) или ''; times — отличия; lang — язык названий.
   * → [{ day, date, open, close, slots: [{ id, kind, start, end, changed, label,
   *      title, fallback, teacher, practical, review, minutes }] }]
   */
  build(startDate, times, lang) {
    const own = this.normalizeTimes(times);
    return this.TEMPLATE.map((d, i) => ({
      day: i + 1,
      date: startDate ? this.addDays(startDate, i) : '',
      open: d.open,
      close: d.close,
      slots: d.slots.map((s, j) => {
        if (!s.id) {
          // Время перерыва — между соседними уроками (с учётом своего времени школы).
          const at = (k) => { const x = d.slots[k]; return x && x.id ? (own[x.id] || x) : null; };
          const prev = at(j - 1); const next = at(j + 1);
          return { kind: s.kind, minutes: s.minutes, key: 'd' + (i + 1) + '-' + j, start: prev ? prev.end : '', end: next ? next.start : '' };
        }
        const t = own[s.id];
        const title = this.title(s.id, lang);
        return {
          id: s.id, kind: 'lesson',
          start: t ? t.start : s.start, end: t ? t.end : s.end, changed: !!t,
          baseStart: s.start, baseEnd: s.end,
          label: this.label(s.id), title: title.text, fallback: title.fallback,
          teacher: this.teacherOf(s), practical: s.practical || null, review: s.review || null
        };
      })
    }));
  },

  /** Слот практического занятия в собранном расписании → { day, date, start, end, id, teacher }. */
  practicalIn(days, n) {
    for (const d of days || []) {
      const s = d.slots.find((x) => x.practical === Number(n));
      if (s) return { day: d.day, date: d.date, start: s.start, end: s.end, id: s.id, label: s.label, teacher: s.teacher, changed: s.changed };
    }
    return null;
  },

  // ---------- Сейчас ----------

  toMin(t) { return this.validTime(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null; },

  daysBetween(a, b) {
    const d = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
    return Math.round((d(b) - d(a)) / 86400000);
  },

  /**
   * Где мы сейчас. Чистая функция.
   *  days — build(...); today — 'YYYY-MM-DD' (местная дата); nowMin — минуты от полуночи.
   * → { phase: 'nodate' | 'before' | 'during' | 'after', daysUntil,
   *     day, date, dayState: 'before' | 'running' | 'done',
   *     current: { item, left, progress } | null, next, then,
   *     slots: { [id|key]: 'past' | 'current' | 'future' }, dayStates: { [day]: 'past' | 'today' | 'future' } }
   * item — { kind, id|key, label, title, practical, date, day, start, end }.
   */
  status(days, today, nowMin) {
    const list = days || [];
    if (!list.length || !list[0].date || !today) return { phase: 'nodate' };
    const first = list[0].date; const last = list[list.length - 1].date;
    const dayStates = {};
    list.forEach((d) => { dayStates[d.day] = d.date < today ? 'past' : d.date === today ? 'today' : 'future'; });
    if (today < first) return { phase: 'before', daysUntil: this.daysBetween(today, first), dayStates };
    if (today > last) return { phase: 'after', dayStates };
    const items = [];
    list.forEach((d) => d.slots.forEach((s) => {
      if (!s.start || !s.end) return;
      items.push({ kind: s.kind, sid: s.id || s.key, label: s.label || '', title: s.title || '', practical: s.practical || null,
        date: d.date, day: d.day, start: s.start, end: s.end, minutes: s.minutes || null });
    }));
    const pos = (it) => [it.date, this.toMin(it.start), this.toMin(it.end)];
    const slots = {};
    let current = null; let nextIdx = -1;
    items.forEach((it, i) => {
      const [date, a, b] = pos(it);
      let st;
      if (date < today || (date === today && b <= nowMin)) st = 'past';
      else if (date === today && a <= nowMin && nowMin < b) st = 'current';
      else st = 'future';
      slots[it.sid] = st;
      if (st === 'current') current = { item: it, left: b - nowMin, progress: Math.round(((nowMin - a) / (b - a)) * 100) };
      if (st === 'future' && nextIdx < 0) nextIdx = i;
    });
    const todayItems = items.filter((it) => it.date === today);
    const dayStart = todayItems.length ? this.toMin(todayItems[0].start) : null;
    const dayEnd = todayItems.length ? this.toMin(todayItems[todayItems.length - 1].end) : null;
    const dayState = dayStart !== null && nowMin < dayStart ? 'before' : dayEnd !== null && nowMin >= dayEnd ? 'done' : 'running';
    const today1 = list.find((d) => d.date === today);
    return {
      phase: 'during', day: today1 ? today1.day : null, date: today, dayState,
      current, next: nextIdx >= 0 ? items[nextIdx] : null, then: nextIdx >= 0 && items[nextIdx + 1] ? items[nextIdx + 1] : null,
      slots, dayStates
    };
  },

  /** Номер дня школы для даты today или null (вне школы). */
  dayOn(startDate, today) {
    for (let i = 0; i < this.DAYS; i++) if (this.addDays(startDate, i) === today) return i + 1;
    return null;
  }
};

window.PSSchedule = PSSchedule;
