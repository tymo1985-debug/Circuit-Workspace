// pdfstack.js — что какому тракту выдачи бумаг нужно (Школа пионеров).
//
// ЗАЧЕМ ЭТОТ ФАЙЛ (находка N-3 повторного аудита, закрыта 30.08.2026).
// Школа подключала тегом <script> семь файлов на 2913 КБ — jsPDF, pdf.js,
// SheetJS, pdf-lib, fontkit и два шрифтовых бандла. Нужны они только при
// выдаче бумаги, но разбирались при КАЖДОМ открытии модуля, а пользуются им
// чаще с телефона. После переезда библиотек с CDN в репозиторий Школа стала
// самым тяжёлым модулем проекта.
//
// Механизм догрузки — общий (`shared/pdfstack.js`), там же записано, почему
// загрузка последовательная и почему обещание снимается при отказе. Здесь —
// только списки и подписи: пути разрешаются от адреса разметки модуля, а
// состав набора это знание Школы о своих трактах.
//
// ФАЙЛ ПОДКЛЮЧАЕТСЯ ОБЕИМИ СТРАНИЦАМИ модуля (index.html и register.html) —
// он крошечный и нужен на старте, потому что PSPdf.ensure() зовут
// обработчики кнопок.
//
// СОБСТВЕННЫЕ СБОРЩИКИ МОДУЛЯ ТОЖЕ ЛЕЖАТ В НАБОРАХ (pdfExport.js и соседи,
// вместе ~50 КБ). Выигрыш не в килобайтах: пока набор не догружен, имени
// `PdfExport` в странице просто нет, и забытый `ensure()` падает громко и
// сразу, а не выдаёт бумагу на неготовом стеке. Тот же приём у Клиндария —
// `visit-pdf.js` и `forms/s302-form.js` лежат в его наборах.
//
// ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. `js/export/excelExport.js` остался на старте: это
// 4 КБ собственного кода, и три из четырёх его выгрузок — чистый CSV, они
// обязаны работать без единой библиотеки. Ленивым сделан только настоящий
// .xlsx — он вынесен в `js/export/xlsxExport.js`, иначе скачивание CSV
// тянуло бы 864 КБ SheetJS.

const PSPdf = {
  tag: 'Школа пионеров',

  /* FONTS общего списка у Школы нет: шрифты у трактов разные (у бланка и
     писем — DejaVu Sans, у интерактивной анкеты — свой субсет для /DR), и
     общий список тянул бы лишние 96 КБ в каждый набор. */
  FONTS: [],

  SETS: {
    /* Выгрузка PDF и письма учащимся: jsPDF, встроенный кириллический шрифт
       для бланка и писем, сборщик. Один набор на два тракта намеренно —
       обе бумаги собирает один и тот же PdfExport. */
    pdf: [
      '../shared/vendor/jspdf.umd.min.js',
      'js/export/fonts/dejavu-sans-subset.js',
      'js/export/pdfExport.js',
    ],
    /* Импорт PDF: pdf.js плюс разборщик таблиц. Воркер здесь НЕ перечислен —
       его адрес проставляется в onReady, см. ниже. */
    import: [
      '../shared/vendor/pdf.min.js',
      'js/modules/pdfImport.js',
    ],
    /* Экспорт .xlsx: SheetJS плюс единственная функция, которой он нужен. */
    excel: [
      '../shared/vendor/xlsx.full.min.js',
      'js/export/xlsxExport.js',
    ],
    /* Интерактивная анкета (AcroForm): pdf-lib, fontkit для внедрения
       кириллического шрифта, сам шрифт формы, сборщик. */
    form: [
      '../shared/vendor/pdf-lib.min.js',
      '../shared/vendor/fontkit.umd.min.js',
      'js/export/fonts/dejavu-form-b64.js',
      'js/export/pdfFormExport.js',
    ],
  },

  /**
   * Донастройка после загрузки набора.
   *
   * ВОРКЕР pdf.js НЕЛЬЗЯ ОБЪЯВИТЬ РАНЬШЕ. Раньше это делал инлайновый скрипт
   * сразу за тегом pdf.min.js; теперь библиотека появляется только по кнопке,
   * и `window.pdfjsLib` до этого момента не существует. Адрес по-прежнему
   * локальный: `integrity` работает только для тега <script>, а здесь путь
   * подставляется строкой — то есть воркер остался бы единственным файлом,
   * в котором подмена по-прежнему исполнялась бы.
   * Версия воркера обязана совпадать с pdf.min.js (2.16.105): pdf.js
   * отказывается работать с воркером другой версии.
   */
  onReady(kind) {
    if (kind === 'import' && window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '../shared/vendor/pdf.worker.min.js';
    }
  },

  onStart() { this._toast(this._t('pdf.preparing')); },
  onError() { this._toast(this._t('pdf.not_loaded')); },

  /* Подписи общие с Клиндарием и живут в shared/i18n/common.js. На
     register.html движка локализации оболочки нет вовсе — там ключ вернётся
     как есть, и это лучше пустой строки. */
  _t(key) {
    return (typeof CWI18n === 'undefined') ? key : CWI18n.t(key);
  },

  /**
   * Одноразовое уведомление. Своего слоя уведомлений у Школы не было —
   * заводится минимальный, на общем компоненте `.md-snackbar` и с тем же
   * временем жизни, что у Клиндария (3,5 с).
   *
   * Контейнер создаётся при первом показе, а не в разметке: страниц две, и
   * дублировать пустой <div> в обеих значило бы завести второе место правки.
   */
  _toast(message) {
    if (typeof document === 'undefined' || !document.body) return;
    let wrap = document.getElementById('ps-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'ps-toast-wrap';
      wrap.className = 'ps-toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'md-snackbar';
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  /**
   * @param {'pdf'|'import'|'excel'|'form'} kind
   * @returns {Promise<boolean>} удалось ли подготовить стек
   */
  ensure(kind) {
    /* Модуль обязан открыться, даже если общий слой не доехал: без
       загрузчика выдача бумаги невозможна, но всё остальное работает. */
    if (!self.CWPdfStack) {
      this._toast(this._t('pdf.not_loaded'));
      return Promise.resolve(false);
    }
    return self.CWPdfStack.ensure(this, kind);
  },
};

// Правило модуля «const X + window.X = X» (см. db.js, students.js).
window.PSPdf = PSPdf;
