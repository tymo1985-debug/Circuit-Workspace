// dispatch.js — Ф3 «Рассылка» (14.11.2026): пакет каждому собранию,
// сроки ответа, напоминания, статус «письмо отправлено».
//
// ПАКЕТ (решение Алекса): ZIP с отдельными PDF — письмо совету старейшин со
// списком приглашённых, приглашение и формуляр (имя и собрание уже вписаны)
// каждому пионеру. Тексты писем — шаблоны общего слоя, правятся в «Документах».
//
// ХРАНЕНИЕ. meta-ключ `dispatch` текущей школы (префикс школы ставит DB):
//   { [groupKey]: { sentAt, deadline, remindedAt } }
//   sentAt     — дата отправки (YYYY-MM-DD), ставится ТОЛЬКО кнопкой вручную;
//   deadline   — свой срок собрания; пусто = срок из настроек формуляра;
//   remindedAt — дата последнего напоминания.
// Схема базы не меняется: meta — ключ-значение, бэкап копирует её целиком.
//
// ГРУППА — собрание из справочника (congregationId). Пионер без ссылки на
// справочник группируется по снимку названия (`name:<название>`); без
// собрания вовсе — в рассылку не попадает: письмо некуда адресовать.
//
// ОТВЕТ — пионер со статусом из RESPONDED. Пакет получают только те, кого
// ждём (Students.isExpected): отказавшемуся приглашение не шлют.

const Dispatch = {
  RESPONDED: ['willCome', 'wontCome', 'attended', 'notAttended'],

  async getState() {
    return { ...(await DB.getMeta('dispatch', {})) };
  },

  async saveEntry(key, patch) {
    const state = await this.getState();
    const next = { ...(state[key] || {}), ...patch };
    Object.keys(next).forEach((k) => { if (next[k] === '' || next[k] == null) delete next[k]; });
    if (Object.keys(next).length) state[key] = next; else delete state[key];
    await DB.setMeta('dispatch', state);
    return state[key] || {};
  },

  directory() {
    return (typeof CWDirectory !== 'undefined' && CWDirectory.ready) ? CWDirectory : null;
  },

  keyOf(student) {
    if (student.congregationId) return student.congregationId;
    const name = String(student.values.congregation || '').trim();
    return name ? 'name:' + name.toLowerCase() : '';
  },

  /**
   * @returns {Array<Object>} группы по собраниям, по алфавиту:
   *   { key, name, record, members, invitees, responded, total, entry,
   *     deadline, ownDeadline, sent, overdue, complete }
   */
  groups(students, state, config, today = DateUtils.todayIso()) {
    const dir = this.directory();
    const map = new Map();
    students.forEach((s) => {
      const key = this.keyOf(s);
      if (!key) return;
      if (!map.has(key)) {
        const record = s.congregationId && dir ? dir.get(s.congregationId) : null;
        map.set(key, { key, record, name: (record && record.name) || String(s.values.congregation || '').trim(), members: [] });
      }
      map.get(key).members.push(s);
    });
    return [...map.values()].map((g) => {
      const entry = state[g.key] || {};
      const responded = g.members.filter((s) => this.RESPONDED.includes(s.status)).length;
      const deadline = entry.deadline || config.deadline || '';
      const complete = responded === g.members.length;
      return {
        ...g,
        invitees: g.members.filter((s) => Students.isExpected(s)),
        responded,
        total: g.members.length,
        entry,
        deadline,
        ownDeadline: !!entry.deadline,
        sent: !!entry.sentAt,
        complete,
        overdue: !!entry.sentAt && !complete && !!deadline && deadline < today
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  },

  /** Пионеры без собрания — им пакет не собрать. */
  orphans(students) {
    return students.filter((s) => !this.keyOf(s));
  },

  pending(group) {
    return group.members.filter((s) => !this.RESPONDED.includes(s.status));
  },

  /** Отметить отправленным: «приглашён» → «письмо отправлено». */
  async markSent(group, date) {
    await this.saveEntry(group.key, { sentAt: date || DateUtils.todayIso() });
    for (const s of group.members) {
      if (s.status === 'invited') await Students.saveCard(s.id, { status: 'letterSent' }, { source: 'dispatch' });
    }
  },

  /** Снять отметку: обратный переход только для тех, кто ещё не ответил. */
  async unmarkSent(group) {
    await this.saveEntry(group.key, { sentAt: '', remindedAt: '' });
    for (const s of group.members) {
      if (s.status === 'letterSent') await Students.saveCard(s.id, { status: 'invited' }, { source: 'dispatch' });
    }
  },

  async setDeadline(group, date) {
    await this.saveEntry(group.key, { deadline: date || '' });
  },

  async markReminded(group) {
    await this.saveEntry(group.key, { remindedAt: DateUtils.todayIso() });
  },

  // ---------- Пакет ----------

  _bytesOfJsPdf(doc) { return new Uint8Array(doc.output('arraybuffer')); },

  /**
   * Файлы пакета одного собрания. folder — папка внутри ZIP (название
   * собрания: и в одиночном пакете, и в «всех пакетах»). Наборы 'pdf' и 'form' догружаются
   * здесь же.
   * @returns {Promise<{files:Array, docs:Array}|null>} docs — для снимков в
   *   архив; null — ПДФ-стек не загрузился (сообщение уже показал PSPdf).
   */
  async packageFiles(group, folder = '') {
    if (!(await PSPdf.ensure('pdf')) || !(await PSPdf.ensure('form'))) return null;
    const config = await Registration.getConfig();
    const overrides = { deadline: group.deadline };
    const names = group.invitees.map((s) => Students.fullName(s));
    const files = [];
    const docs = [];
    const prefix = folder ? PSZip.safeName(folder) + '/' : '';

    const elders = await Letters.buildFor(Letters.ELDERS, await Letters.congregationData(group, names, overrides));
    if (!elders) throw new Error(T('ps.docs.build_failed'));
    files.push({
      name: prefix + PSZip.safeName(`00 ${elders.title} — ${group.name}`) + '.pdf',
      data: this._bytesOfJsPdf(PdfExport.buildLetterDoc({ title: elders.title, body: elders.body }))
    });
    docs.push({ doc: elders, ref: { entity: Letters.ELDERS.entity, id: group.key, title: group.name } });

    const formConfig = { ...config, deadline: group.deadline };
    for (const s of group.invitees) {
      const person = PSZip.safeName(Students.fullName(s), 'pioneer');
      const invitation = await Letters.build(s, overrides);
      if (!invitation) throw new Error(T('ps.docs.build_failed'));
      files.push({
        name: `${prefix}${person}/${PSZip.safeName(invitation.title)}.pdf`,
        data: this._bytesOfJsPdf(PdfExport.buildLetterDoc({ title: invitation.title, body: invitation.body }))
      });
      docs.push({ doc: invitation, ref: { entity: Letters.INVITATION.entity, id: s.id, title: Letters.studentName(s) } });
      const form = await PdfFormExport.generate(formConfig, RegistrationSchema, {
        lastName: s.values.lastName || '',
        firstName: s.values.firstName || '',
        congregation: group.name
      });
      files.push({ name: `${prefix}${person}/${PSZip.safeName(T('ps.dispatch.file_form'))}.pdf`, data: form });
    }
    return { files, docs };
  },

  async snapshot(docs) {
    for (const item of docs) await Letters.snapshotFor(item.doc, item.ref, 'print', false);
  },

  /** Текст напоминания старейшинам: перечислены только не ответившие. */
  async reminder(group) {
    const names = this.pending(group).map((s) => Students.fullName(s));
    return Letters.buildFor(Letters.REMINDER, await Letters.congregationData(group, names, { deadline: group.deadline }));
  },

  /** Ссылки на отправку: WhatsApp по номеру контакта, письмо по email. */
  links(group, doc) {
    const rec = group.record || {};
    const digits = String(rec.contactPhone || '').replace(/\D+/g, '');
    const text = encodeURIComponent(doc.body);
    return {
      whatsapp: digits ? `https://wa.me/${digits}?text=${text}` : '',
      email: rec.contactEmail
        ? `mailto:${encodeURIComponent(rec.contactEmail)}?subject=${encodeURIComponent(doc.title)}&body=${text}`
        : ''
    };
  }
};

window.Dispatch = Dispatch;
