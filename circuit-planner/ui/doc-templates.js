// circuit-planner/ui/doc-templates.js
//
// Второй срез Phase 3 (аудит контекста, 31.08.2026). Извлечён из
// circuit-planner/app.js без изменения поведения — было
// App.ui.{docCtx..getSalutationFor} внутри монолитного IIFE (строки
// 2774-2956, 183 строки). Логика не менялась ни на символ, включая тела
// условий и комментарии; правки — только отступы (методы объекта -> функции)
// и разрешение внутренних this.xxx() в прямые вызовы (все имена — из этого
// же кластера, кроме this.letterTypeSuffix -> App.ui.letterTypeSuffix,
// метод остаётся в app.js).
//
// НЕ переименован в "letters.js": исходный план Phase 3 (§8 аудита) предполагал
// чистый непрерывный блок «письма/композер», но на уровне методов это не
// подтвердилось — письма, формуляр визита, PIN, модалка документов, история
// и композер перемешаны построчно, а не сгруппированы по темам. Настоящий
// непрерывный и связный кластер внутри этой области — обёртка над
// self.CWTemplates (общий слой шаблонов): контекст/id документа, чтение,
// сохранение, сброс, страницы письма и перенос легаси-настроек. Он и стал
// вторым срезом; резка «писем» как таковых откладывается до пересмотра
// границ (см. отчёт по этому срезу).
//
// ⚠️ Один метод здесь — adoptDocuments() — миграция настроек в CWTemplates
// (см. её собственный комментарий про снимок перед необратимым переносом).
// Тело не изменено НИ НА СИМВОЛ, порядок вызова сохранён: она по-прежнему
// вызывается из App.init() через App.ui.adoptDocuments() ПОСЛЕ того, как эта
// часть применена (см. точку вызова CPParts.forEach в app.js — она стоит
// раньше App.init() при любом сценарии старта).
//
// Использует CPConsts (второй аргумент): DEFAULT_LETTER_TEMPLATE_HTML,
// DEFAULT_EMAIL_BODY_TEMPLATES, DEFAULT_LETTER_SALUTATIONS, builtinPages.
// Остальные ключи CPConsts (VP_I18N_DICTS и т.д.) этому кластеру не нужны.

(window.CPParts = window.CPParts || []).push(function (App, CPConsts) {
  var DEFAULT_LETTER_TEMPLATE_HTML = CPConsts.DEFAULT_LETTER_TEMPLATE_HTML;
  var DEFAULT_EMAIL_BODY_TEMPLATES = CPConsts.DEFAULT_EMAIL_BODY_TEMPLATES;
  var DEFAULT_LETTER_SALUTATIONS = CPConsts.DEFAULT_LETTER_SALUTATIONS;
  var builtinPages = CPConsts.builtinPages;

  function docCtx(kind, suffix) {
    const type = { Congregation: 'congregation', Group: 'group', Pregroup: 'pregroup' }[suffix] || 'congregation';
    return 'visit.' + type + '.' + kind;
  }
  function docId(kind, suffix) { return 'sys.' + docCtx(kind, suffix); }
  /** Готов ли общий слой отдавать документы. */
  function docsReady() { return !!(self.CWTemplates && self.CWTemplates.stored); }
  /** Язык документа. Письмо украинское независимо от языка интерфейса. */
  function docLang() { return (self.CWDocLang && self.CWDocLang.get()) || 'uk'; }
  /**
   * Текст документа. `settingsKey` — прежнее место хранения, оно же путь
   * отката; `fallback` — системный текст на случай, если нет ни того, ни
   * другого.
   */
  function docText(kind, suffix, settingsKey, fallback) {
    let found = null;
    if (docsReady()) {
      found = self.CWTemplates.text(docCtx(kind, suffix), docLang());
      /* Признак «правил пользователь» — `custom`, а НЕ непустое тело:
         `CWTemplates.text()` идёт через `effective()` и при отсутствии
         пользовательской записи отдаёт СИСТЕМНЫЙ шаблон, тело у которого
         непустое всегда. Проверка «if (found.body)» пропускала системный
         текст вперёд настроек и делала откат ниже недостижимым — у
         Клиндария дыра латентная (перенос обычно проходит), у Конгрессов
         была вскрыта. См. docs/documents/02-templates-migration-audit.md. */
      if (found && found.body && found.custom) return found.body;
    }
    const legacy = App.state.app.settings[settingsKey + suffix];
    if (legacy) return legacy;
    if (found && found.body) return found.body;
    return fallback;
  }
  /** Записать текст документа. Возвращает промис — вызывающему ждать не обязательно. */
  function docSave(kind, suffix, settingsKey, html) {
    if (!docsReady()) {
      App.state.app.settings[settingsKey + suffix] = html;
      App.store.save();
      return Promise.resolve();
    }
    return self.CWTemplates.save(docId(kind, suffix), docLang(), {
      body: html,
      context: docCtx(kind, suffix),
      module: 'circuit-planner',
      format: kind === 'letter' ? 'html' : 'text',
    }).catch((e) => { console.error('Клиндарий: не удалось сохранить документ', e); });
  }
  /**
   * Вернуть системный текст: пользовательская запись УДАЛЯЕТСЯ, а не
   * перезаписывается. Так шаблон снова начинает обновляться вместе с
   * приложением, и не остаётся записи-двойника.
   */
  function docReset(kind, suffix, settingsKey, fallback) {
    if (!docsReady()) {
      App.state.app.settings[settingsKey + suffix] = fallback;
      App.store.save();
      return Promise.resolve();
    }
    return self.CWTemplates.reset(docId(kind, suffix))
      .catch((e) => { console.error('Клиндарий: не удалось восстановить оригинал', e); });
  }
  /** Дополнительные страницы письма (памятка координатору и прочее). */
  function docPages(suffix) {
    let found = null;
    if (docsReady()) {
      found = self.CWTemplates.text(docCtx('letter', suffix), docLang());
      /* Только ПОЛЬЗОВАТЕЛЬСКАЯ запись важнее настроек. У системных
         шаблонов страницы есть всегда (памятка координатору лежит в
         builtin.js), поэтому прежняя проверка «Array.isArray(found.pages)»
         отдавала системную памятку вперёд правленой пользователем —
         и увидеть подмену можно было только на бумаге. */
      if (found && found.custom && Array.isArray(found.pages) && found.pages.length) return found.pages;
    }
    /* Запасной путь: свои страницы, если они есть, иначе системные.
       Пустой массив здесь недопустим — письмо ушло бы БЕЗ памятки
       координатору, и заметить это можно было бы только на бумаге. */
    const own = App.state.app.settings.letterPages && App.state.app.settings.letterPages[suffix];
    if (Array.isArray(own) && own.length) return own;
    if (found && Array.isArray(found.pages) && found.pages.length) return found.pages;
    return builtinPages(suffix);
  }
  function docSavePages(suffix, pages) {
    if (!docsReady()) {
      if (!App.state.app.settings.letterPages) App.state.app.settings.letterPages = {};
      App.state.app.settings.letterPages[suffix] = pages;
      App.store.save();
      return Promise.resolve();
    }
    return self.CWTemplates.save(docId('letter', suffix), docLang(), {
      pages: pages,
      context: docCtx('letter', suffix),
      module: 'circuit-planner',
      format: 'html',
    }).catch((e) => { console.error('Клиндарий: не удалось сохранить страницы письма', e); });
  }

  /**
   * Однократный перенос текстов писем из настроек модуля в общее хранилище.
   *
   * ⚠️ НЕОБРАТИМО: после успешного переноса ключи `letterTemplate*`,
   * `letterPages*`, `emailBody*`, `letterSalutation*` и `memoTemplate`
   * удаляются из настроек. Четыре правила, те же, что в Конгрессах:
   *
   *   1. Снимок состояния в историю модуля ПЕРЕД началом.
   *   2. Переносится только правленое. Модуль всегда материализовал
   *      значения по умолчанию прямо в настройки (ensureSettingsDefaults),
   *      поэтому ключ есть у всех — «правил» определяется сравнением с
   *      системным текстом, а не наличием ключа. Скопировать нетронутый
   *      текст значило бы заморозить его: он перестал бы обновляться
   *      вместе с приложением.
   *   3. adopt() не перезаписывает существующую запись — он зовётся при
   *      каждом запуске модуля, и второй запуск не должен затирать правку,
   *      сделанную уже в новом хранилище.
   *   4. Ключи удаляются и состояние сохраняется ТОЛЬКО после успешной
   *      записи в базу. При сбое настройки остаются нетронутыми, модуль
   *      продолжает работать на прежнем источнике, перенос повторится при
   *      следующем запуске.
   */
  function adoptDocuments() {
    if (!self.CWTemplates || !self.CWTemplates.stored || !self.CWDB) return Promise.resolve(false);
    const settings = App.state.app.settings || {};
    const suffixes = ['Congregation', 'Group', 'Pregroup'];
    const jobs = [];
    const KINDS = [
      { kind: 'letter', key: 'letterTemplate', format: 'html', def: (s) => DEFAULT_LETTER_TEMPLATE_HTML },
      { kind: 'email', key: 'emailBody', format: 'text', def: (s) => DEFAULT_EMAIL_BODY_TEMPLATES[s] },
      { kind: 'salutation', key: 'letterSalutation', format: 'text', def: (s) => DEFAULT_LETTER_SALUTATIONS[s] },
    ];
    suffixes.forEach((suffix) => {
      const pages = (settings.letterPages && settings.letterPages[suffix]) || null;
      const defaultPages = builtinPages(suffix);
      const pagesTouched = pages && JSON.stringify(pages) !== JSON.stringify(defaultPages);
      KINDS.forEach((spec) => {
        const value = settings[spec.key + suffix];
        const isText = typeof value === 'string' && value;
        const changed = isText && value !== spec.def(suffix);
        /* Страницы принадлежат записи письма, поэтому правленые страницы
           при нетронутом тексте письма всё равно требуют его переноса. */
        const needed = changed || (spec.kind === 'letter' && pagesTouched);
        if (!needed) return;
        const record = {
          context: App.ui.docCtx(spec.kind, suffix),
          module: 'circuit-planner',
          format: spec.format,
          title: spec.kind + ' ' + suffix,
          translations: { uk: { subject: null, body: changed ? value : spec.def(suffix) } },
        };
        if (spec.kind === 'letter' && pagesTouched) record.pages = pages;
        jobs.push(self.CWTemplates.adopt(App.ui.docId(spec.kind, suffix), record));
      });
    });
    const cleanup = () => {
      suffixes.forEach((suffix) => {
        delete settings['letterTemplate' + suffix];
        delete settings['emailBody' + suffix];
        delete settings['letterSalutation' + suffix];
      });
      delete settings.letterTemplate;
      delete settings.letterPages;
      delete settings.memoTemplate;
      App.store.save();
    };
    if (!jobs.length) { cleanup(); return Promise.resolve(false); }
    // Снимок ДО необратимого переноса, а не параллельно с ним: с фазы 4
    // запись снимка асинхронна, и «позвал и пошёл дальше» означало бы, что
    // копия и перенос идут наперегонки.
    return App.store.snapshotForMigration().then(() => Promise.all(jobs)).then(() => { cleanup(); return true; }).catch((error) => {
      console.error('Клиндарий: перенос документов не выполнен, настройки не тронуты', error);
      return false;
    });
  }
  function getLetterTemplateFor(visitType) {
    const suffix = App.ui.letterTypeSuffix(visitType);
    return docText('letter', suffix, 'letterTemplate', DEFAULT_LETTER_TEMPLATE_HTML);
  }
  function setLetterTemplateFor(suffix, html) {
    docSave('letter', suffix, 'letterTemplate', html);
  }
  function getEmailBodyFor(suffix) {
    return docText('email', suffix, 'emailBody', DEFAULT_EMAIL_BODY_TEMPLATES[suffix]);
  }
  function getSalutationFor(suffix) {
    return docText('salutation', suffix, 'letterSalutation', DEFAULT_LETTER_SALUTATIONS[suffix]);
  }

  Object.assign(App.ui, {
    docCtx, docId, docsReady, docLang, docText, docSave, docReset, docPages,
    docSavePages, adoptDocuments, getLetterTemplateFor, setLetterTemplateFor,
    getEmailBodyFor, getSalutationFor,
  });
});
