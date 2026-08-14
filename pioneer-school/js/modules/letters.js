// letters.js — документы Школы пионеров поверх общего слоя (фаза 6, 14.08.2026).
//
// ЧТО ЭТОТ ФАЙЛ ДЕЛАЕТ И ЧЕГО НЕ ДЕЛАЕТ. Он приводит данные модуля к именам
// реестра переменных (shared/templates/namespaces.js) и собирает готовый
// документ. Он НЕ хранит текст: текст живёт в общем хранилище шаблонов, правит
// его пользователь в модуле «Документы». Он не рисует интерфейс — этим
// занимается app.js — и не знает про PDF: сборкой бумаги занят PdfExport.
//
// ГРАНИЦА, КОТОРУЮ ЛЕГКО НАРУШИТЬ ПО ПРИВЫЧКЕ. Анкета, печатный бланк, S-253 и
// формуляры учащихся сюда не переезжают и не должны. Их текст принадлежит
// ДОКУМЕНТУ и живёт в i18n/doc.js, где его правит носитель языка в одной
// колонке словаря. Здесь — только текст, принадлежащий ПОЛЬЗОВАТЕЛЮ: письмо,
// которое районный старейшина пишет своими словами.
//
// ЯЗЫК. Берётся из PSDocLang (язык документа), а не из языка интерфейса.
// Переводов письма пока нет ни на один язык, кроме русского, поэтому
// CWTemplates.text() честно вернёт русскую колонку и пометит её `pending` —
// документ остаётся читаемым, а интерфейс показывает пометку.

const Letters = {
  MODULE: 'pioneer-school',

  /** Единственный документ фазы 6. Появится второй — здесь будет список. */
  INVITATION: {
    id: 'sys.school.student.invitation',
    context: 'school.student.invitation',
    entity: 'student',
    titleKey: 'ps.docs.invitation_title'
  },

  /** Подключён ли общий слой шаблонов. Без него документов у модуля нет. */
  available() {
    return typeof CWTemplates !== 'undefined' && CWTemplates.stored;
  },

  /** Ведётся ли архив выданных документов. Его отсутствие выдаче не мешает. */
  archiveAvailable() {
    return typeof CWDocs !== 'undefined' && CWDocs.available();
  },

  /**
   * Дата в языке документа. Значения из <input type="date"> приходят строкой
   * «2026-10-12», и её нельзя отдавать прямо в new Date(): такая строка
   * разбирается как UTC-полночь, и западнее Гринвича в письме печаталась бы
   * дата на день раньше. Та же защита, что в DateUtils.formatRu.
   */
  date(value) {
    if (!value) return '';
    const raw = String(value);
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00' : raw;
    return PSDocLang.date(iso);
  },

  /**
   * Данные модуля → пространства имён реестра. Движок не знает про `student`
   * как запись базы, `assignment` и `registrationConfig` — он знает только
   * имена полей из реестра, и привести одно к другому обязан модуль.
   */
  async data(student) {
    const [assignment, config] = await Promise.all([Assignment.get(), Registration.getConfig()]);
    const values = student.values || {};
    return {
      student: {
        firstName: values.firstName || '',
        lastName: values.lastName || '',
        congregation: values.congregation || '',
        email: values.email || '',
        phone: values.phone || ''
      },
      school: {
        startDate: this.date(assignment.startDate),
        endDate: this.date(assignment.endDate),
        place: assignment.location || '',
        teacherA: assignment.teacherA || '',
        teacherB: assignment.teacherB || '',
        registrationDeadline: this.date(config.deadline),
        registrationEmail: config.email || '',
        registrationWhatsapp: config.whatsapp || ''
      },
      doc: {
        today: this.date(new Date().toISOString()),
        lang: PSDocLang.get()
      }
      // `sender` намеренно не передаём: движок сам подставит общий слой
      // (shared/sender.js). У Школы нет и не нужно своего экрана отправителя —
      // это тот же районный старейшина, что подписывает письма в Клиндарии.
    };
  },

  /** Человеческое имя документа — для заголовка, архива и имени файла. */
  title() {
    return T(this.INVITATION.titleKey);
  },

  studentName(student) {
    const values = student.values || {};
    return `${values.lastName || ''} ${values.firstName || ''}`.trim() || T('ps.docs.no_name');
  },

  /**
   * Собрать документ: подстановка выполнена, править уже нечего.
   * Один источник и для предпросмотра, и для PDF, и для архива — иначе на
   * бумаге окажется не то, что показали на экране.
   *
   * @returns {Promise<Object|null>} null — общий слой недоступен либо у шаблона
   *   нет ни одной непустой колонки перевода.
   */
  async build(student) {
    if (!this.available()) return null;
    const lang = PSDocLang.get();
    const picked = CWTemplates.text(this.INVITATION.context, lang);
    if (!picked) return null;
    const data = await this.data(student);
    return {
      templateId: picked.id,
      context: this.INVITATION.context,
      title: this.title(),
      // ФАКТИЧЕСКИЙ язык, а не запрошенный: при пустой колонке перевода
      // CWTemplates отдаёт первый непустой, и записать сюда запрошенный
      // значило бы пометить русское письмо как «pl».
      lang: picked.lang,
      pending: picked.pending,
      format: 'text',
      subject: null,
      /* Хвостовые пустые строки срезаются. Они появляются закономерно, а не
         по ошибке: подпись состоит из полей общего отправителя, и пока он не
         заполнен (Школу могут открыть раньше Клиндария), последние строки
         подставляются пустыми. Срезается ТОЛЬКО хвост — пустая строка между
         абзацами это отбивка, набранная человеком, и трогать её нельзя. */
      body: CWTemplates.render(picked.body, data).replace(/[ \t]*(\r?\n)+[ \t]*$/, ''),
      data
    };
  },

  /**
   * Снимок выданного документа. Пишется только когда документ ПОКИНУЛ
   * приложение (печать, PDF) либо по явной кнопке — предпросмотр не пишется.
   *
   * Отказ архива не мешает выдаче: письмо уже собрано и уходит человеку,
   * ронять его из-за истории нельзя.
   */
  async snapshot(doc, student, reason, edited) {
    if (!doc || !this.archiveAvailable()) return null;
    try {
      return await CWDocs.save({
        templateId: doc.templateId,
        context: doc.context,
        title: doc.title,
        lang: doc.lang,
        format: doc.format,
        subject: doc.subject,
        body: doc.body,
        pages: [],
        edited: !!edited,
        ref: { module: this.MODULE, entity: this.INVITATION.entity, id: student.id },
        entityTitle: this.studentName(student),
        data: doc.data,
        reason: reason || 'manual'
      });
    } catch (error) {
      console.error('Letters.snapshot: снимок не сохранён', error);
      return null;
    }
  },

  /**
   * Имя файла PDF. Кириллица сохраняется — тот же набор символов, что в
   * App.utils.slug Клиндария. Транслитерация здесь была бы вредна: имён в
   * папке загрузок много, и «invitation-student.pdf» у всех подряд не
   * отличить друг от друга.
   */
  filename(student) {
    const values = student.values || {};
    const base = `${values.lastName || ''}-${values.firstName || ''}`
      .toLowerCase().trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-а-яёіїєґ]/gi, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `invitation-${base || 'student'}.pdf`;
  }
};

window.Letters = Letters;
