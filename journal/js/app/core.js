/**
 * Журнал — общее ядро экранов (разрезка app.js, 0.9.1).
 *
 * Классические сценарии по порядку: app/core.js → districts.js → visits.js
 * → tasks.js → projects.js → search-archive.js → js/app.js (оркестровка).
 * Один явный общий объект — self.CWJournalApp: каждый файл публикует в нём
 * только то, что зовут другие файлы; всё остальное остаётся приватным в
 * замыкании файла. Состояние экрана живёт в файле своего экрана и наружу
 * отдаётся функциями (isDirectoryReady, setTaskTab, currentEditorVisit,
 * requestSearchFocus/consumeSearchFocus), а не общими переменными.
 * Данные — только через CWJournal (journal/js/data.js); CWDB здесь не
 * используется. Маршрутизатор один — journal/js/route.js.
 */
(function () {
  'use strict';

  var A = self.CWJournalApp = {};

  /* Функции других файлов — позднее связывание через CWJournalApp. */
  function canonicalName() { return A.canonicalName.apply(this, arguments); }
  function renderCircuitsList() { return A.renderCircuitsList.apply(this, arguments); }
  function renderCongregationDetail() { return A.renderCongregationDetail.apply(this, arguments); }
  function renderDistrictDetail() { return A.renderDistrictDetail.apply(this, arguments); }
  function renderProjectDetail() { return A.renderProjectDetail.apply(this, arguments); }
  function renderVisitDetail() { return A.renderVisitDetail.apply(this, arguments); }


  var MODULE_ID = 'journal';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function t(key) { return self.CWI18n ? CWI18n.t(key) : key; }
  function esc(s) { return self.CWEscape ? CWEscape.html(s) : String(s == null ? '' : s); }

  /* Разбор маршрута — в journal/js/route.js (чистая функция, покрыта
     тестом). Роутер по-прежнему один: здесь только вызов. */
  function parseHash() { return CWJournalRoute.parse(location.hash); }

  /* ═══ Диалог создания/переименования узла ═════════════════════════════ */

  /**
   * Общий помощник: гарантирует, что cleanup() вызовется РОВНО ОДИН РАЗ,
   * даже если диалог закрылся не через явную кнопку (Escape, клик по
   * backdrop, программный close()) — нативное событие 'close' на <dialog>
   * срабатывает в любом из этих случаев, а явные обработчики кнопок его
   * не вызывают вовсе. Без этого Escape оставлял слушатели/состояние
   * формы висеть до следующего открытия того же диалога, и повторные
   * открытия копили дубли обработчиков (spec-3, п.6).
   *
   * @param {HTMLDialogElement} dlg
   * @param {Function} cleanup — идемпотентна по построению вызывающего кода
   * @returns {Function} снять слушатель 'close' (вызывать из самого cleanup,
   *   чтобы не держать один и тот же listener между открытиями)
   */
  function bindDialogCleanup(dlg, cleanup) {
    var done = false;
    function guarded() {
      if (done) return;
      done = true;
      cleanup();
    }
    dlg.addEventListener('close', guarded);
    return function () { dlg.removeEventListener('close', guarded); };
  }

  /* ═══ Общий примитив .md-menu: один открыт одновременно, Esc/клик-мимо ═ */
  function closeAllMenus(exceptPanel) {
    $all('.md-menu__panel').forEach(function (p) {
      if (p !== exceptPanel) p.hidden = true;
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('.md-menu')) return;
    closeAllMenus(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllMenus(null);
  });
  function wireMenuToggle(btn, panel) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = panel.hidden;
      closeAllMenus(panel);
      panel.hidden = !willOpen;
    });
  }

  /* ═══ Иконки строк дерева (те же контуры, что в J1) ═══════════════════ */
  var ICON = {
    circuit: '<path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2z"/><path d="M9 3v16M15 5v16"/>',
    congregation: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    group: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 11a3 3 0 1 0-2-5.2M18 20a5 5 0 0 0-2-4"/>',
    pregroup: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 11a3 3 0 1 0-2-5.2M18 20a5 5 0 0 0-2-4"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    visit: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
  };
  function svg(paths, attrs) {
    return '<svg viewBox="0 0 24 24" ' + (attrs || 'width="17" height="17"')
      + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  function errorMessage(err) {
    var known = {
      'journal-node-has-children': 'j.error.has_children',
      'journal-node-has-entries': 'j.error.has_entries',
      'journal-node-has-links': 'j.error.has_links',
      'journal-invalid-hierarchy': 'j.error.invalid_hierarchy',
      'journal-immutable-kind': 'j.error.immutable_kind',
      'journal-immutable-parent': 'j.error.immutable_parent',
      'journal-node-use-lifecycle': 'j.error.node_lifecycle',
      'journal-node-invalid-transition': 'j.error.node_transition',
      'journal-node-not-found': 'j.error.node_not_found',
      'journal-visit-invalid-dates': 'j.error.visit_dates',
      'journal-visit-invalid-parent': 'j.error.visit_parent',
      'journal-visit-immutable': 'j.error.visit_immutable',
      'journal-visit-invalid-transition': 'j.error.visit_transition',
      'journal-visit-has-entries': 'j.error.visit_has_entries',
      'journal-visit-has-links': 'j.error.visit_has_links',
      'journal-visit-not-found': 'j.error.visit_not_found',
      'journal-visit-use-facade': 'j.error.visit_use_facade',
      'journal-visit-record-use-facade': 'j.error.visit_record_use_facade',
      'journal-visit-record-empty': 'j.error.visit_record_empty',
      'journal-visit-record-invalid-type': 'j.error.visit_record_type',
      'journal-visit-record-invalid-format': 'j.error.visit_record_format',
      'journal-visit-record-immutable': 'j.error.visit_record_immutable',
      'journal-visit-record-invalid-transition': 'j.error.visit_record_transition',
      'journal-visit-record-has-links': 'j.error.visit_record_has_links',
      'journal-visit-record-not-found': 'j.error.visit_record_not_found',
      'journal-visit-readonly': 'j.error.visit_readonly',
      'journal-visit-has-carry': 'j.error.visit_has_carry',
      'journal-task-use-facade': 'j.error.task_use_facade',
      'journal-task-not-found': 'j.error.task_not_found',
      'journal-task-invalid-node': 'j.task.scope_required',
      'journal-task-invalid-due': 'j.error.task_due',
      'journal-task-immutable': 'j.error.task_immutable',
      'journal-task-invalid-transition': 'j.error.visit_record_transition',
      'journal-task-has-links': 'j.error.visit_record_has_links',
      'journal-carry-use-facade': 'j.error.carry_use_facade',
      'journal-carry-has-history': 'j.error.carry_has_history',
      'journal-carry-not-eligible': 'j.error.carry_not_eligible',
      'journal-carry-already-open': 'j.error.carry_state',
      'journal-carry-not-open': 'j.error.carry_state',
      'journal-carry-foreign-visit': 'j.error.carry_foreign',
      'journal-carry-not-incoming': 'j.error.carry_foreign',
      'journal-carry-invalid-action': 'j.error.carry_state',
      'journal-entry-not-found': 'j.error.visit_record_not_found',
      'journal-project-use-facade': 'j.error.project_use_facade',
      'journal-project-not-found': 'j.error.project_not_found',
      'journal-project-empty-title': 'j.error.project_title',
      'journal-project-invalid-body': 'j.error.project_invalid',
      'journal-project-invalid-circuit': 'j.error.project_invalid',
      'journal-project-immutable': 'j.error.project_invalid',
      'journal-project-use-lifecycle': 'j.error.project_invalid',
      'journal-project-invalid-transition': 'j.error.project_transition',
      'journal-project-readonly': 'j.error.project_readonly',
      'journal-project-has-links': 'j.error.project_has_links',
      'journal-project-invalid-target': 'j.error.link_invalid',
      'journal-link-invalid-urn': 'j.error.link_invalid',
      'journal-link-invalid-rel': 'j.error.link_invalid',
      'journal-link-self': 'j.error.link_invalid',
      'journal-link-missing-endpoint': 'j.error.link_missing',
      'journal-link-cross-circuit': 'j.error.link_cross_circuit',
      'journal-link-archived-endpoint': 'j.error.link_archived',
    };
    var key = known[err && err.message];
    return key ? t(key) : (err && err.message) || String(err);
  }

  function refreshCurrentView() {
    var state = parseHash();
    if (state.route !== 'districts') return;
    if (state.projectId) renderProjectDetail(state.circuitId, state.projectId);
    else if (state.visitId) renderVisitDetail(state.circuitId, state.congregationId, state.visitId);
    else if (state.congregationId) renderCongregationDetail(state.circuitId, state.congregationId);
    else if (state.circuitId) renderDistrictDetail(state.circuitId);
    else renderCircuitsList();
  }

  /* ═══ Экран одного собрания (J3b) ═══════════════════════════════════════
   * CWDirectory владеет ИДЕНТИЧНОСТЬЮ (название/номер/адрес/контакт);
   * Журнал владеет расписанием и локальным label. Граница из
   * shared/directory.js — здесь эта граница только отображается, узел
   * данных CWDirectory.communities Журнал напрямую не трогает (см.
   * journal/AGENTS.md и J3b spec). */

  var directoryReady = false; // становится true только когда CWDirectory реально прочитан (см. DOMContentLoaded)
  function isDirectoryReady() { return directoryReady; }
  function setDirectoryReady(v) { directoryReady = !!v; }

  /* ═══ Даты и подписи посещения (производные, не хранятся) ══════════════ */
  function uiLang() { return self.CWI18n ? CWI18n.getLang() : 'ru'; }
  function capitalize(s) { return s ? s.charAt(0).toLocaleUpperCase(uiLang()) + s.slice(1) : s; }
  function isoToDate(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  /** «весна 2028» — сезон по месяцу начала посещения. */
  function seasonLabel(dateFrom) {
    var m = +dateFrom.slice(5, 7);
    var key = m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
    return t('j.season.' + key) + ' ' + dateFrom.slice(0, 4);
  }
  /** «9–14 апреля 2028» (withYear) / «9–14 апреля». Хвост «г.»/«р.» у
   *  славянских локалей убирается — в эталоне его нет. */
  function formatRange(from, to, withYear) {
    var opts = { day: 'numeric', month: 'long', timeZone: 'UTC' };
    if (withYear) opts.year = 'numeric';
    var text;
    try {
      var fmt = new Intl.DateTimeFormat(uiLang(), opts);
      text = fmt.formatRange ? fmt.formatRange(isoToDate(from), isoToDate(to)) : fmt.format(isoToDate(from)) + ' – ' + fmt.format(isoToDate(to));
    } catch (_) { text = from + ' – ' + to; }
    return text.replace(/\s(г|р)\.$/, '');
  }
  function visitStatusView(visit) {
    if (visit.status === 'archived') {
      return { label: t('j.badge.archive'), html: '<span class="j-tag">' + svg(ICON.archive, 'width="12" height="12"') + '<span>' + esc(t('j.badge.archive')) + '</span></span>' };
    }
    var key, cls;
    if (visit.status === 'completed') { key = 'j.visit.status.completed'; cls = 'md-status-success'; }
    else if (todayIso() < visit.dateFrom) { key = 'j.visit.status.planned'; cls = 'md-status-important'; }
    else { key = 'j.visit.status.open'; cls = 'md-status-success'; }
    return { label: t(key), html: '<span class="md-status ' + cls + '">' + esc(t(key)) + '</span>' };
  }

  function ddmm(iso) { return iso.slice(8, 10) + '.' + iso.slice(5, 7); }

  /** Вне экрана открытого района #moreBtn — тот же декоративный элемент,
   *  что и в J1: пустая панель, обработчик снят, подпись возвращена к
   *  общей «Ещё». Вызывается из applyRoute() при уходе с districts/<id>. */
  function resetMoreMenu() {
    var btn = $('#moreBtn');
    var panel = $('#moreMenuPanel');
    if (!panel.hidden || panel.innerHTML) {
      panel.hidden = true;
      panel.innerHTML = '';
      var freshBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(freshBtn, btn);
    }
    btn = $('#moreBtn');
    btn.setAttribute('data-i18n-aria-label', 'j.action.more');
    btn.setAttribute('aria-label', t('j.action.more'));
  }

  function resolveCommunity(id) { return isDirectoryReady() && id ? CWDirectory.get(id) : null; }
  function labelVisit(v) { return v && v.dateFrom ? seasonLabel(v.dateFrom) : ''; }
  function nodeName(n) { return n.kind === 'congregation' ? canonicalName(n) : n.label; }

  /** Куда ведёт результат — только существующие маршруты. Узла больше нет
   *  (устаревшая ссылка) — ближайший безопасный экран, а не ошибка. */
  function destFor(kind, row, chain, visit) {
    if (kind === 'project') return row.circuitId ? CWJournalRoute.build.project(row.circuitId, row.id) : '#districts';
    var node = chain.length ? chain[chain.length - 1] : null;
    if (kind === 'node') node = row;
    if (!node) return '#districts';
    var cong = node.kind === 'congregation' ? node
      : chain.filter(function (n) { return n.kind === 'congregation'; })[0] || null;
    var circuitId = node.circuitId;
    if (!circuitId) return '#districts';
    if (kind === 'task' && !visit) return '#tasks';
    if (kind === 'visit' || kind === 'record' || kind === 'task') {
      var v = kind === 'visit' ? row : visit;
      if (!cong) return CWJournalRoute.build.circuit(circuitId);
      if (v && node.kind === 'congregation') return CWJournalRoute.build.visit(circuitId, node.id, v.id);
      return CWJournalRoute.build.visits(circuitId, cong.id);
    }
    if (node.kind === 'circuit') return CWJournalRoute.build.circuit(node.id);
    if (cong) return CWJournalRoute.build.congregation(circuitId, cong.id);
    return CWJournalRoute.build.circuit(circuitId);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  /* Публикация для других файлов Журнала. */
  A.$ = $;
  A.$all = $all;
  A.ICON = ICON;
  A.MODULE_ID = MODULE_ID;
  A.bindDialogCleanup = bindDialogCleanup;
  A.capitalize = capitalize;
  A.ddmm = ddmm;
  A.destFor = destFor;
  A.el = el;
  A.errorMessage = errorMessage;
  A.esc = esc;
  A.formatRange = formatRange;
  A.isDirectoryReady = isDirectoryReady;
  A.labelVisit = labelVisit;
  A.nodeName = nodeName;
  A.parseHash = parseHash;
  A.refreshCurrentView = refreshCurrentView;
  A.resetMoreMenu = resetMoreMenu;
  A.resolveCommunity = resolveCommunity;
  A.seasonLabel = seasonLabel;
  A.setDirectoryReady = setDirectoryReady;
  A.svg = svg;
  A.t = t;
  A.todayIso = todayIso;
  A.uiLang = uiLang;
  A.visitStatusView = visitStatusView;
  A.wireMenuToggle = wireMenuToggle;
})();
