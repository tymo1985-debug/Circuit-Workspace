// classes.js — Ф5 «Классы и учебники» (15.11.2026): классы и распределение.
//
// РЕШЕНИЯ АЛЕКСА:
//  - Класс — запись хранилища `classes`: { id, name, teacherA, teacherB }.
//    У каждого класса своя пара преподавателей А/Б (Ф6 берёт её для заданий).
//    Старые классы без teacherA/teacherB читаются как пустые — миграции нет.
//  - В классы распределяются только подтвердившие (willCome / attended);
//    ждущие ответа остаются «без класса».
//  - Супруги и родственники (любая связь карточки) держатся в одном классе.
//  - «Предложить» распределяет только тех, кто без класса: ручные решения не
//    теряются. «Перераспределить всех» — отдельно, с подтверждением.
//  - Сначала предпросмотр, запись — кнопкой «Применить» (Students.setClass,
//    источник 'auto' в журнале пионера).
// Функции propose / groups / stats чистые (scripts/check-pioneer-classes.mjs).

const PSClasses = {
  CONFIRMED: ['willCome', 'attended'],
  MAX: 12,

  isConfirmed(s) { return this.CONFIRMED.includes(s && s.status); },

  /** Группы «держатся вместе»: связные компоненты по relations внутри списка. */
  groups(students) {
    const byId = new Map(students.map((s) => [s.id, s]));
    const seen = new Set();
    const out = [];
    students.forEach((start) => {
      if (seen.has(start.id)) return;
      const group = [];
      const stack = [start];
      seen.add(start.id);
      while (stack.length) {
        const s = stack.pop();
        group.push(s);
        (s.relations || []).forEach((r) => {
          const other = byId.get(r.studentId);
          if (other && !seen.has(other.id)) { seen.add(other.id); stack.push(other); }
        });
      }
      out.push(group);
    });
    return out;
  },

  /** Состав класса: число, братья / сёстры. */
  stats(members) {
    return {
      total: members.length,
      brothers: members.filter((s) => s.gender === 'brother').length,
      sisters: members.filter((s) => s.gender === 'sister').length
    };
  },

  /**
   * Предложение распределения.
   *  students — Students.list(); classes — существующие (в порядке показа);
   *  count — сколько классов использовать; mode — 'unclassed' | 'all';
   *  newName(n) — имя для недостающего класса n (1-based).
   * → { classes: [...существующие, ...новые { id: 'new:n', name, isNew }],
   *     moves: [{ id, from, to }] }  — только реальные изменения classId.
   */
  propose({ students = [], classes = [], count = 1, mode = 'unclassed', newName = (n) => String(n) }) {
    const want = Math.max(1, Math.min(this.MAX, Math.floor(Number(count) || 1)));
    const all = classes.slice();
    for (let n = all.length + 1; n <= want; n++) all.push({ id: 'new:' + n, name: newName(n), isNew: true });
    const targets = all.slice(0, want);
    const targetIds = new Set(targets.map((c) => c.id));
    const known = new Set(all.map((c) => c.id));
    const confirmed = students.filter((s) => this.isConfirmed(s));
    const current = (s) => (s.classId && known.has(s.classId) ? s.classId : null);
    const placed = new Map();   // id → classId (итог)
    const load = new Map(all.map((c) => [c.id, { total: 0, brothers: 0, sisters: 0 }]));
    const add = (classId, s) => {
      placed.set(s.id, classId);
      const l = load.get(classId);
      l.total++;
      if (s.gender === 'brother') l.brothers++;
      if (s.gender === 'sister') l.sisters++;
    };

    const queue = [];
    this.groups(confirmed).forEach((group) => {
      if (mode === 'all') { queue.push(group); return; }
      const fixed = group.map(current).filter(Boolean);
      if (!fixed.length) { queue.push(group); return; }
      // Часть группы уже в классе — остальные идут туда же (самый частый класс).
      const freq = {};
      fixed.forEach((id) => { freq[id] = (freq[id] || 0) + 1; });
      const home = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
      group.forEach((s) => add(current(s) || home, s));
    });

    // Крупные группы раньше; внутри — по фамилии, чтобы итог был устойчивым.
    queue.sort((a, b) => b.length - a.length || Students.fullName(a[0]).localeCompare(Students.fullName(b[0]), 'ru'));
    queue.forEach((group) => {
      const gb = group.filter((s) => s.gender === 'brother').length;
      const gs = group.filter((s) => s.gender === 'sister').length;
      let best = null;
      targets.forEach((c, i) => {
        const l = load.get(c.id);
        const score = [l.total + group.length, Math.abs((l.brothers + gb) - (l.sisters + gs)), i];
        if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1]
          || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { id: c.id, score };
      });
      group.forEach((s) => add(best.id, s));
    });

    const moves = confirmed
      .filter((s) => placed.has(s.id) && placed.get(s.id) !== (s.classId || null))
      .map((s) => ({ id: s.id, from: s.classId || null, to: placed.get(s.id) }));
    return { classes: all, targets: [...targetIds], moves };
  },

  // ---------- Запись ----------

  async list() { return DB.list('classes'); },

  async add(name) {
    const rec = { id: DB.uid(), name: String(name || '').trim(), teacherA: '', teacherB: '' };
    await DB.put('classes', rec);
    return rec;
  },

  async update(id, patch) {
    const rec = await DB.get('classes', id);
    if (!rec) return null;
    const next = { ...rec };
    ['name', 'teacherA', 'teacherB'].forEach((k) => { if (k in patch) next[k] = String(patch[k] || '').trim(); });
    if (!next.name) next.name = rec.name;
    return DB.put('classes', next);
  },

  /** Удалить можно только пустой класс — пионеры не теряют класс молча. */
  async remove(id, students) {
    if ((students || []).some((s) => s.classId === id)) throw new Error(T('ps.cls.err.not_empty'));
    return DB.remove('classes', id);
  },

  /** Применить предложение: создать новые классы, затем переставить пионеров. */
  async apply(proposal) {
    const realId = {};
    for (const c of proposal.classes) {
      if (!c.isNew) continue;
      if (!proposal.moves.some((m) => m.to === c.id)) continue;
      const rec = { id: DB.uid(), name: c.name, teacherA: '', teacherB: '' };
      await DB.put('classes', rec);
      realId[c.id] = rec.id;
    }
    for (const m of proposal.moves) {
      const to = realId[m.to] || m.to;
      if (String(to).startsWith('new:')) continue;
      await Students.setClass(m.id, to, 'auto');
    }
  }
};

window.PSClasses = PSClasses;
