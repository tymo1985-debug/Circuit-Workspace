/**
 * Журнал — оркестровка: маршрут (applyRoute), FAB, язык/версия и запуск
 * (DOMContentLoaded). Экраны — в journal/js/app/*.js (разрезка 0.9.1),
 * общий объект — self.CWJournalApp (см. app/core.js).
 *
 * Журнал — оболочка модуля + дерево района (J3a).
 *
 * Обзор (O2) — живая сводка, js/app/overview.js (renderOverview). «Районы» — реальный экран: список районов и
 * детальный экран одного района читаются и пишутся через CWJournal
 * (journal/js/data.js), без единой прямой транзакции IndexedDB отсюда.
 *
 * Маршрут «районы» имеет подсостояние — выбранный circuitId — в хэше:
 *   #districts            → список районов
 *   #districts/<circuitId> → один район
 * Это не отдельный элемент ROUTES: маршрут по-прежнему один («districts»),
 * подсостояние разбирается отдельно (см. parseHash()).
 * J7: проект района — #districts/<c>/project/<p> (renderProjectDetail).
 */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  /* Общие константы других файлов (объекты неизменяемы по смыслу). */
  var MODULE_ID = A.MODULE_ID;

  /* Функции других файлов — позднее связывание через CWJournalApp. */
  function $() { return A.$.apply(this, arguments); }
  function $all() { return A.$all.apply(this, arguments); }
  function consumeSearchFocus() { return A.consumeSearchFocus.apply(this, arguments); }
  function el() { return A.el.apply(this, arguments); }
  function focusSearch() { return A.focusSearch.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function renderArchive() { return A.renderArchive.apply(this, arguments); }
  function renderCircuitsList() { return A.renderCircuitsList.apply(this, arguments); }
  function renderCongregationDetail() { return A.renderCongregationDetail.apply(this, arguments); }
  function renderDistrictDetail() { return A.renderDistrictDetail.apply(this, arguments); }
  function renderOverview() { return A.renderOverview.apply(this, arguments); }
  function renderProjectDetail() { return A.renderProjectDetail.apply(this, arguments); }
  function renderSearch() { return A.renderSearch.apply(this, arguments); }
  function renderTasks() { return A.renderTasks.apply(this, arguments); }
  function renderVisitDetail() { return A.renderVisitDetail.apply(this, arguments); }
  function requestSearchFocus() { return A.requestSearchFocus.apply(this, arguments); }
  function resetMoreMenu() { return A.resetMoreMenu.apply(this, arguments); }
  function runAction() { return A.runAction.apply(this, arguments); }
  function setDirectoryReady() { return A.setDirectoryReady.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }
  function wireArchiveChrome() { return A.wireArchiveChrome.apply(this, arguments); }
  function wireProjectChrome() { return A.wireProjectChrome.apply(this, arguments); }
  function wireSearchChrome() { return A.wireSearchChrome.apply(this, arguments); }
  function wireVisitEditorChrome() { return A.wireVisitEditorChrome.apply(this, arguments); }
  function wireProtectionChrome() { return A.wireProtectionChrome.apply(this, arguments); }
  function wireOverviewChrome() { return A.wireOverviewChrome.apply(this, arguments); }



  /* ═══ FAB: один элемент, подпись/действие меняются по месту ═══════════ */
  function fabSpecFor(state) {
    if (state.route === 'overview') return null; // O2: создание требует контекста — глобального нет
    if (state.route === 'tasks') return { labelKey: 'j.fab.new_task', action: 'new-task' };
    if (state.route === 'districts' && state.visitId) return null; // экран посещения — без FAB (эталон 04)
    if (state.route === 'districts' && state.projectId) return null; // экран проекта — без FAB (эталон 06)
    if (state.route === 'districts' && state.congregationId) return { labelKey: 'j.fab.new_visit', action: 'new-visit' };
    if (state.route === 'districts' && !state.circuitId) return { labelKey: 'j.fab.new_circuit', action: 'new-circuit' };
    if (state.route === 'districts' && state.circuitId) return { labelKey: 'j.fab.new_congregation', action: 'new-congregation' };
    return null;
  }

  /* ═══ Маршрутизация и общая оболочка (J1) ═══════════════════════════════ */
  function applyRoute() {
    var state = parseHash();

    $all('[data-route]', document).forEach(function (el) {
      var isSection = el.tagName === 'SECTION';
      var match = el.getAttribute('data-route') === state.route;
      if (isSection) el.hidden = !match; else el.classList.toggle('active', match);
    });

    if (state.route === 'districts') {
      var showProject = !!(state.circuitId && state.projectId);
      var showVisit = !!(state.circuitId && state.congregationId && state.visitId);
      var showCong = !!(state.circuitId && state.congregationId) && !showVisit;
      var showCircuit = !!state.circuitId && !showCong && !showVisit && !showProject;
      var showList = !state.circuitId;
      $('#circuitsListView').hidden = !showList;
      $('#districtDetailView').hidden = !showCircuit;
      $('#congregationDetailView').hidden = !showCong;
      $('#visitDetailView').hidden = !showVisit;
      $('#projectDetailView').hidden = !showProject;
      if (!showVisit && !showProject) $('#topbarContext').textContent = '';
      if (state.normalized && state.circuitId && !state.congregationId) {
        // Неполный маршрут проекта (…/project без id) — сам район.
        location.replace(CWJournalRoute.build.circuit(state.circuitId));
        return;
      }
      if (state.normalized && state.congregationId) {
        // Неполный хвост маршрута (…/visit без id и т.п.) — ближайший
        // валидный контекст: вкладка «Посещения» этого собрания.
        location.replace(CWJournalRoute.build.visits(state.circuitId, state.congregationId));
        return;
      }
      if (showProject) renderProjectDetail(state.circuitId, state.projectId);
      else if (showVisit) renderVisitDetail(state.circuitId, state.congregationId, state.visitId);
      else if (showCong) renderCongregationDetail(state.circuitId, state.congregationId);
      else if (showCircuit) renderDistrictDetail(state.circuitId);
      else { renderCircuitsList(); resetMoreMenu(); }
    } else {
      resetMoreMenu();
      $('#topbarContext').textContent = '';
      if (state.route === 'overview') renderOverview();
      else if (state.route === 'tasks') {
        // J9c: #tasks/<id> — фокус на задаче; кривой хвост — просто «Задачи».
        if (state.normalized) { location.replace(CWJournalRoute.build.task(null)); return; }
        renderTasks(state.taskId);
      }
      else if (state.route === 'search') {
        $('#topbarContext').textContent = t('j.search.scope');
        renderSearch();
        consumeSearchFocus();
      } else if (state.route === 'archive') renderArchive();
    }

    var fab = $('#fab');
    var fabLabel = $('#fabLabel');
    var spec = fabSpecFor(state);
    if (spec) {
      fab.hidden = false;
      fabLabel.setAttribute('data-i18n', spec.labelKey);
      fabLabel.textContent = t(spec.labelKey);
      fab.onclick = spec.action ? function () { runAction(spec.action); } : null;
    } else {
      fab.hidden = true;
      fab.onclick = null;
    }
  }

  function initVersion() {
    var version = (self.CW_MODULES && self.CW_MODULES[MODULE_ID] || {}).version;
    if (version) $('#moduleVersion').textContent = 'v' + version;
  }

  function initLanguage() {
    if (!self.CWI18n) return;
    self.CWI18n.bindModule({
      module: MODULE_ID,
      select: 'uiLanguage',
      onChange: function () { applyRoute(); },
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (self.CWI18n) self.CWI18n.init({ module: MODULE_ID });
    initLanguage();
    initVersion();
    wireVisitEditorChrome();
    wireProjectChrome();
    wireProtectionChrome();
    wireOverviewChrome();
    applyRoute();

    wireSearchChrome();
    wireArchiveChrome();
    // Кнопка поиска в шапке: на экран поиска и фокус в поле. Уже на #search
    // hashchange не сработает — фокус ставится сразу.
    $('#searchBtn').addEventListener('click', function () {
      if (parseHash().route === 'search' && location.hash === '#search') { focusSearch(); return; }
      requestSearchFocus();
      location.hash = '#search';
    });

    window.addEventListener('hashchange', applyRoute);

    if (typeof CWUpdate !== 'undefined') {
      CWUpdate.init({ swUrl: 'sw.js', ui: 'silent', hubHref: '../index.html' });
    }

    /* CWDirectory: инициализация обязательна ДО первой отрисовки карточки
       идентичности (J3b spec, «Required startup»). Экран собрания, если он
       уже открыт при загрузке, ждёт readiness — до неё показывает локальный
       label, не решая заранее linked/unlinked/broken (см. renderIdentityCard). */
    if (typeof CWDirectory !== 'undefined') {
      Promise.resolve(CWDirectory.init()).then(function () {
        // init() может вернуть false (БД недоступна) — это НЕ то же самое,
        // что «справочник пустой». directoryReady=true только когда
        // CWDirectory сам подтверждает готовность (см. shared/directory.js,
        // геттер ready); иначе карточка идентичности обязана остаться в
        // «пока не знаем», а не молча решить, что communityId разорван
        // (spec п.5). Повторных попыток здесь не заводим — не расширять
        // область этой правки.
        setDirectoryReady(CWDirectory.ready);
        var state = parseHash();
        if (state.route === 'search') renderSearch();
        else if (state.route === 'archive') renderArchive();
        else if (state.route === 'overview') renderOverview();
        else if (state.route === 'districts' && state.projectId) renderProjectDetail(state.circuitId, state.projectId);
        else if (state.route === 'districts' && state.congregationId) {
          renderCongregationDetail(state.circuitId, state.congregationId);
        } else if (state.route === 'districts' && state.circuitId) {
          renderDistrictDetail(state.circuitId);
        }
      });
      CWDirectory.onChange(function () {
        // Синхронизировать перед перерисовкой: onChange() может сработать
        // и после восстановления связи (reload() внутри CWDirectory сам
        // выставляет ready), и после нового сбоя — читаем актуальное
        // состояние заново, а не полагаемся на значение из предыдущего
        // init() (spec-3, п.2).
        setDirectoryReady(CWDirectory.ready);
        var state = parseHash();
        if (state.route === 'search') { renderSearch(); return; }
        if (state.route === 'archive') { renderArchive(); return; }
        if (state.route === 'overview') { renderOverview(); return; }
        if (state.route !== 'districts') return;
        if (state.projectId) { renderProjectDetail(state.circuitId, state.projectId); return; }
        if (state.congregationId) renderCongregationDetail(state.circuitId, state.congregationId);
        else if (state.circuitId) renderDistrictDetail(state.circuitId); // канонические имена в строках-собраниях
      });
    }
  });})();
