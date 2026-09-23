/**
 * Журнал — экран защиты (J8): лист «Защищённая запись» (разблокировка,
 * первая настройка, смена фразы, блокировка), кнопка замка в шапке и
 * реакция экранов на блокировку.
 *
 * Данные — только через CWJournal.protection. Фраза живёт в поле ввода до
 * отправки и стирается сразу после любого исхода; в состояние экрана,
 * хэш, журнал и хранилища она не попадает. PIN, passkey, таймер и
 * блокировка при скрытии вкладки в J8 намеренно не делаются.
 */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  function $() { return A.$.apply(this, arguments); }
  function errorMessage() { return A.errorMessage.apply(this, arguments); }
  function forgetProjectProtectedDraft() { return A.forgetProjectProtectedDraft.apply(this, arguments); }
  function forgetSearchResults() { return A.forgetSearchResults.apply(this, arguments); }
  function forgetVisitProtectedDraft() { return A.forgetVisitProtectedDraft.apply(this, arguments); }
  function isProtectedRow() { return A.isProtectedRow.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function refreshCurrentView() { return A.refreshCurrentView.apply(this, arguments); }
  function renderArchive() { return A.renderArchive.apply(this, arguments); }
  function renderOverviewProjects() { return A.renderOverviewProjects.apply(this, arguments); }
  function renderSearch() { return A.renderSearch.apply(this, arguments); }
  function renderTasks() { return A.renderTasks.apply(this, arguments); }
  function svg() { return A.svg.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }

  var ICON = A.ICON;

  var protectUi = { mode: null, resolve: null, entryId: null, busy: false, state: 'off' };

  /* Диалоги, где может стоять расшифрованный текст: при блокировке — закрыть. */
  var TEXT_DIALOGS = ['taskDialog', 'carrySheet', 'projectDialog', 'pickDialog'];
  var SECRET_FIELDS = ['protectOld', 'protectPass', 'protectConfirm'];

  var MODE_TEXT = {
    unlock: ['j.locked.title', 'j.prot.lede', 'j.prot.unlock'],
    setup: ['j.prot.setup_title', 'j.prot.setup_lede', 'j.prot.enable'],
    status: ['j.prot.unlocked_title', 'j.prot.unlocked_lede', 'j.prot.lock_now'],
    change: ['j.prot.change_title', 'j.prot.change_lede', 'j.action.save'],
    broken: ['j.prot.broken_title', 'j.prot.broken_lede', ''],
  };

  function clearSecrets() {
    SECRET_FIELDS.forEach(function (id) { var f = $('#' + id); if (f) f.value = ''; });
  }
  function showSheetError(msg) {
    var e = $('#protectError');
    e.textContent = msg || '';
    e.hidden = !msg;
  }

  function setMode(mode) {
    protectUi.mode = mode;
    var txt = MODE_TEXT[mode];
    $('#protectSheet').setAttribute('data-mode', mode);
    $('#protectSheetTitle').textContent = t(txt[0]);
    $('#protectSheetLede').textContent = t(txt[1]);
    var wantsPass = mode === 'unlock' || mode === 'setup' || mode === 'change';
    $('#protectOldField').hidden = mode !== 'change';
    $('#protectPassField').hidden = !wantsPass;
    $('#protectConfirmField').hidden = !(mode === 'setup' || mode === 'change');
    $('#protectPassLabel').textContent = t(mode === 'change' ? 'j.prot.pass_new' : 'j.prot.pass');
    $('#protectPass').setAttribute('autocomplete', mode === 'unlock' ? 'current-password' : 'new-password');
    $('#protectWarn').hidden = !(mode === 'setup' || mode === 'change');
    var submit = $('#protectSubmit');
    submit.hidden = !txt[2];
    submit.textContent = txt[2] ? t(txt[2]) : '';
    submit.disabled = false;
    $('#protectChange').hidden = mode !== 'status';
    $('#protectIco').innerHTML = svg(mode === 'status' ? ICON.unlock : ICON.lock, 'width="32" height="32"');
    showSheetError('');
  }

  function focusFirst() {
    var first = protectUi.mode === 'change' ? $('#protectOld') : $('#protectPass');
    if (first && !first.closest('[hidden]')) first.focus();
    else $('#protectSubmit').focus();
  }

  /** Лист как обещание: true — цель режима достигнута, false — отмена. */
  function openSheet(mode, opts) {
    opts = opts || {};
    if (protectUi.resolve) finish(false);
    clearSecrets();
    protectUi.entryId = opts.entryId || null;
    setMode(mode);
    var sheet = $('#protectSheet');
    return new Promise(function (resolve) {
      protectUi.resolve = resolve;
      if (!sheet.open) sheet.showModal();
      focusFirst();
    });
  }
  function finish(result) {
    clearSecrets();
    var done = protectUi.resolve;
    protectUi.resolve = null;
    protectUi.entryId = null;
    protectUi.busy = false;
    var sheet = $('#protectSheet');
    if (sheet.open) sheet.close();
    if (done) done(result);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (protectUi.busy) return;
    var mode = protectUi.mode;
    if (mode === 'status') { CWJournal.protection.lock('manual'); finish(true); return; }
    if (mode === 'broken') { finish(false); return; }
    var pass = $('#protectPass').value;
    if (mode === 'setup' || mode === 'change') {
      if (pass.length < CWJournal.protection.minPassphrase()) { showSheetError(t('j.prot.err.weak')); return; }
      if (pass !== $('#protectConfirm').value) { showSheetError(t('j.prot.err.mismatch')); return; }
    }
    if (!pass) { showSheetError(t('j.prot.err.wrong')); return; }
    var old = $('#protectOld').value;
    clearSecrets();
    protectUi.busy = true;
    $('#protectSubmit').disabled = true;
    try {
      if (mode === 'unlock') await CWJournal.protection.unlock(pass);
      else if (mode === 'setup') await CWJournal.protection.setup(pass, protectUi.entryId);
      else if (mode === 'change') await CWJournal.protection.changePassphrase(old, pass);
    } catch (err) {
      pass = old = '';
      protectUi.busy = false;
      $('#protectSubmit').disabled = false;
      showSheetError(errorMessage(err));
      focusFirst();
      return;
    }
    pass = old = '';
    finish(true);
  }

  async function currentState() {
    try { return await CWJournal.protection.status(); } catch (e) { return { state: 'unavailable' }; }
  }

  /** Разблокировать, если нужно. true — ключ в памяти. */
  async function requestUnlock() {
    var st = await currentState();
    if (st.state === 'unlocked') return true;
    if (st.state === 'locked') return openSheet('unlock');
    if (st.state === 'broken') { await openSheet('broken'); return false; }
    if (st.state === 'unavailable') alert(t('j.prot.err.unavailable'));
    return false;
  }

  /** Защитить запись. Первый раз — лист настройки: сейф и запись одним
   *  пакетом (CWJournal.protection.setup). */
  async function requestProtect(entryId) {
    var st = await currentState();
    if (st.state === 'off') return openSheet('setup', { entryId: entryId });
    if (!(await requestUnlock())) return false;
    try {
      await CWJournal.protection.protect(entryId);
      return true;
    } catch (err) { alert(errorMessage(err)); return false; }
  }

  async function requestUnprotect(entryId) {
    if (!confirm(t('j.prot.unprotect_confirm'))) return false;
    if (!(await requestUnlock())) return false;
    try {
      await CWJournal.protection.unprotect(entryId);
      return true;
    } catch (err) { alert(errorMessage(err)); return false; }
  }

  function toggleProtection(row) {
    return isProtectedRow(row) ? requestUnprotect(row.id) : requestProtect(row.id);
  }

  async function syncLockButton() {
    var st = await currentState();
    protectUi.state = st.state;
    var btn = $('#lockBtn');
    btn.hidden = st.state === 'off' || st.state === 'unavailable';
    var open = st.state === 'unlocked';
    var label = t(open ? 'j.prot.state_unlocked' : st.state === 'broken' ? 'j.prot.broken_title' : 'j.prot.state_locked');
    btn.classList.toggle('is-open', open);
    btn.innerHTML = svg(open ? ICON.unlock : ICON.lock, 'width="22" height="22"');
    btn.title = label;
    btn.setAttribute('aria-label', t('j.prot.lock_btn') + ': ' + label);
  }

  function onLockButton() {
    var s = protectUi.state;
    if (s === 'unlocked') openSheet('status');
    else if (s === 'locked') openSheet('unlock');
    else if (s === 'broken') openSheet('broken');
  }

  function rerenderRoute() {
    var st = parseHash();
    if (st.route === 'districts') refreshCurrentView();
    else if (st.route === 'tasks') renderTasks();
    else if (st.route === 'search') renderSearch();
    else if (st.route === 'archive') renderArchive();
    else if (st.route === 'overview') renderOverviewProjects();
  }

  /* Блокировка (кнопка, pagehide, смена сейфа): расшифрованное уходит с
     экрана — черновики защищённых записей, результаты поиска, открытые
     диалоги с текстом — и экран перерисовывается уже без текста. */
  function onProtectionChange(kind) {
    if (kind === 'locked') {
      forgetVisitProtectedDraft();
      forgetProjectProtectedDraft();
      forgetSearchResults();
      TEXT_DIALOGS.forEach(function (id) { var d = $('#' + id); if (d && d.open) d.close(); });
    }
    syncLockButton();
    rerenderRoute();
  }

  function wireProtectionChrome() {
    $('#protectSheetForm').addEventListener('submit', onSubmit);
    $('#protectCancel').addEventListener('click', function () { finish(false); });
    $('#protectChange').addEventListener('click', function () { clearSecrets(); setMode('change'); focusFirst(); });
    $('#protectSheet').addEventListener('close', function () { if (protectUi.resolve) finish(false); });
    $('#lockBtn').addEventListener('click', onLockButton);
    CWJournal.protection.onChange(onProtectionChange);
    // Возврат из BFCache: ключ сброшен на pagehide — показать это честно.
    window.addEventListener('pageshow', function (e) { if (e.persisted) { syncLockButton(); rerenderRoute(); } });
    syncLockButton();
  }

  /* Публикация для других файлов Журнала. */
  A.requestProtect = requestProtect;
  A.requestUnlock = requestUnlock;
  A.requestUnprotect = requestUnprotect;
  A.syncLockButton = syncLockButton;
  A.toggleProtection = toggleProtection;
  A.wireProtectionChrome = wireProtectionChrome;
})();
