/**
 * Журнал — документы проекта района (J9b): история писем проекта и
 * композер письма. Второго механизма документов нет: текст — CWTemplates,
 * язык — CWDocLang, архив — CWDocs (через CWJournal.documents), карточки —
 * CWDocsView, печать — CWPrint. Шаблон правится только в «Документах».
 *
 * Снимок в архив — только печать и явное «Сохранить в архив»; открытие,
 * смена языка и копирование снимков не создают. Защищённый проект (J8)
 * письма не получает — это правило слоя данных, кнопка лишь его отражает.
 */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  /* Функции других файлов — позднее связывание через CWJournalApp. */
  function $() { return A.$.apply(this, arguments); }
  function errorMessage() { return A.errorMessage.apply(this, arguments); }
  function esc() { return A.esc.apply(this, arguments); }
  function isProtectedRow() { return A.isProtectedRow.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function refreshCurrentView() { return A.refreshCurrentView.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }

  var DOC_LANGS = ['uk', 'ru', 'de', 'en', 'pl'];
  var DOCS_PAGE = '../documents/index.html';

  /* Состояние экрана: история текущего проекта и открытый композер. */
  var docsUi = { projectId: null, rows: [], shownFor: null, seq: 0, bound: false };
  var composer = null;

  /* Актуальный текст шаблона: при каждом открытии композера пользовательские
     шаблоны перечитываются из базы (CWTemplates.reload) — правка в
     «Документах» в соседней вкладке видна без перезагрузки Журнала. Сбой
     чтения оставляет прежний кэш; тогда хотя бы один init() нужен. */
  function templatesFresh() {
    var T = self.CWTemplates;
    if (!T) return Promise.resolve(false);
    var read = typeof T.reload === 'function' ? T.reload() : T.init();
    return Promise.resolve(read).then(function () { return true; }, function (e) {
      console.error('Журнал: хранилище шаблонов недоступно', e);
      return Promise.resolve(T.init()).then(function () { return true; }, function () { return false; });
    });
  }

  function archiveHref(projectId) {
    return DOCS_PAGE + '#archive/journal/project/' + encodeURIComponent(projectId);
  }

  /** История писем проекта и доступность «Создать письмо». */
  async function renderProjectDocs(p) {
    var mine = ++docsUi.seq;
    docsUi.projectId = p.id;
    var prot = isProtectedRow(p);
    var archived = p.status === 'archived';
    var avail = CWJournal.documents.available() && !!self.CWDocsView && !!self.CWTemplates;
    var btn = $('#projectLetterBtn');
    /* Архивный проект — только чтение (J7): история видна, письма нет. */
    btn.hidden = archived;
    btn.disabled = prot || archived || !avail;
    btn.onclick = function () { openLetterComposer(p.id); };
    var note = $('#projectDocsNote');
    note.hidden = !(prot || !avail);
    note.textContent = prot ? t('j.pdoc.protected') : (!avail ? t('j.pdoc.unavailable') : '');
    $('#projectArchiveLink').setAttribute('href', archiveHref(p.id));
    var box = $('#projectDocs');
    if (!self.CWDocsView) { box.replaceChildren(); $('#projectDocsCount').textContent = ''; return; }
    if (docsUi.rows.length === 0 || docsUi.shownFor !== p.id) box.innerHTML = self.CWDocsView.stateHtml('loading');
    var rows = [];
    try { rows = await CWJournal.documents.list(p.id); } catch (e) { rows = []; }
    if (mine !== docsUi.seq) return;
    docsUi.rows = rows || [];
    docsUi.shownFor = p.id;
    $('#projectDocsCount').textContent = docsUi.rows.length ? String(docsUi.rows.length) : '';
    box.innerHTML = docsUi.rows.length
      ? docsUi.rows.map(function (d) { return self.CWDocsView.cardHtml(d); }).join('')
      : self.CWDocsView.stateHtml('empty');
  }

  /* ═══ Композер ═══════════════════════════════════════════════════════ */
  function setStatus(key) { $('#letterStatus').textContent = key ? t(key) : ''; }
  function showError(err) {
    var e = $('#letterError');
    e.textContent = err ? errorMessage(err) : '';
    e.hidden = !err;
  }
  function currentDoc() {
    if (!composer || !composer.doc) return null;
    var d = Object.assign({}, composer.doc);
    d.subject = $('#letterSubject').value;
    d.body = $('#letterBody').value;
    d.title = t('j.pdoc.doc_title');
    return d;
  }
  function isEdited() {
    var d = composer && composer.doc;
    return !!d && ($('#letterSubject').value !== d.subject || $('#letterBody').value !== d.body);
  }
  function syncButtons() {
    var ready = !!(composer && composer.doc) && !composer.busy;
    ['#letterCopySubject', '#letterCopyBody', '#letterPrint', '#letterSave'].forEach(function (s) { $(s).disabled = !ready; });
  }

  async function loadLetter(lang) {
    if (!composer) return;
    showError(null);
    setStatus('');
    try {
      composer.doc = await CWJournal.documents.compose(composer.projectId, lang);
    } catch (err) {
      composer.doc = null;
      showError(err);
    }
    var d = composer.doc;
    $('#letterSubject').value = d ? d.subject : '';
    $('#letterBody').value = d ? d.body : '';
    var info = $('#letterInfo');
    var infoText = d && d.pending ? t('j.pdoc.pending').replace('%s', String(d.lang).toUpperCase()) : '';
    info.textContent = infoText;
    info.hidden = !infoText;
    syncButtons();
  }

  async function openLetterComposer(projectId) {
    var dlg = $('#letterDialog');
    if (dlg.open) return;
    composer = { projectId: projectId, doc: null, busy: false };
    var sel = $('#letterLang');
    var langs = self.CWDocLang && self.CWDocLang.LANGS().length ? self.CWDocLang.LANGS() : DOC_LANGS;
    sel.innerHTML = langs.map(function (l) { return '<option value="' + esc(l) + '">' + esc(l.toUpperCase()) + '</option>'; }).join('');
    sel.value = self.CWDocLang ? self.CWDocLang.get() : langs[0];
    $('#letterSubject').value = '';
    $('#letterBody').value = '';
    syncButtons();
    dlg.showModal();
    await templatesFresh();
    await loadLetter(sel.value);
  }

  function copyText(text, doneKey) {
    var done = function () { setStatus(doneKey); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else done();
  }

  async function runSave(reason) {
    var d = currentDoc();
    if (!d || composer.busy) return false;
    composer.busy = true;
    syncButtons();
    showError(null);
    try {
      await CWJournal.documents.save(composer.projectId, d, reason, isEdited());
      setStatus(reason === 'print' ? 'j.pdoc.printed' : 'j.pdoc.saved');
      return true;
    } catch (err) {
      /* Печать уже состоялась — неудача только у архива; «сохранено» не
         показываем ни в одном из двух случаев. */
      if (reason === 'print') setStatus('j.pdoc.printed_not_archived');
      showError(err);
      return false;
    } finally {
      if (composer) { composer.busy = false; syncButtons(); }
    }
  }

  function printLetter() {
    var d = currentDoc();
    if (!d || !self.CWPrint) return;
    var html = (d.subject ? '<h1 style="font-size:16pt;margin:0 0 12pt">' + esc(d.subject) + '</h1>' : '')
      + '<div style="white-space:pre-wrap;font-size:12pt;line-height:1.5">' + esc(d.body) + '</div>';
    var opened = self.CWPrint.document({
      title: d.subject || t('j.pdoc.doc_title'),
      html: html,
      lang: d.lang,
      onBlocked: function () { showError(new Error('journal-docs-print-blocked')); },
    });
    /* Снимок — только если документ действительно ушёл на печать. */
    if (opened) runSave('print');
  }

  /** Обработчики — один раз за жизнь страницы (экраны не пересоздаются). */
  function wireProjectDocsChrome() {
    if (docsUi.bound) return;
    docsUi.bound = true;
    if (self.CWDocLang) self.CWDocLang.init({ module: 'journal', langs: DOC_LANGS, apply: false });
    if (self.CWDocsView) {
      self.CWDocsView.bind($('#projectDocs'), function () { return docsUi.rows; }, {
        onCopied: function () {},
        onRemoved: function () { refreshCurrentView(); },
      });
    }
    $('#letterLang').addEventListener('change', function (e) {
      if (isEdited() && !confirm(t('j.pdoc.confirm_relang'))) { e.target.value = composer.doc.lang; return; }
      if (self.CWDocLang) self.CWDocLang.set(e.target.value);
      loadLetter(e.target.value);
    });
    $('#letterCopySubject').addEventListener('click', function () { copyText($('#letterSubject').value, 'j.pdoc.copied'); });
    $('#letterCopyBody').addEventListener('click', function () { copyText($('#letterBody').value, 'j.pdoc.copied'); });
    $('#letterPrint').addEventListener('click', printLetter);
    $('#letterSave').addEventListener('click', function () { runSave('manual'); });
    $('#letterClose').addEventListener('click', function () { $('#letterDialog').close(); });
    $('#letterDialog').addEventListener('close', function () {
      composer = null;
      $('#letterSubject').value = '';
      $('#letterBody').value = '';
      var st = parseHash();
      if (st.projectId) refreshCurrentView();
    });
  }

  /* Публикация для других файлов Журнала. */
  A.renderProjectDocs = renderProjectDocs;
  A.wireProjectDocsChrome = wireProjectDocsChrome;
})();
