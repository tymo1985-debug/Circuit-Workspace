/** Журнал — задачи: экран «Задачи» и диалог задачи (в т.ч. задачи проекта). */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  /* Функции других файлов — позднее связывание через CWJournalApp. */
  function $() { return A.$.apply(this, arguments); }
  function $all() { return A.$all.apply(this, arguments); }
  function bindDialogCleanup() { return A.bindDialogCleanup.apply(this, arguments); }
  function canonicalName() { return A.canonicalName.apply(this, arguments); }
  function capitalize() { return A.capitalize.apply(this, arguments); }
  function ddmm() { return A.ddmm.apply(this, arguments); }
  function errorMessage() { return A.errorMessage.apply(this, arguments); }
  function esc() { return A.esc.apply(this, arguments); }
  function seasonLabel() { return A.seasonLabel.apply(this, arguments); }
  function svg() { return A.svg.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }
  function isLockedRow() { return A.isLockedRow.apply(this, arguments); }
  function isProtectedRow() { return A.isProtectedRow.apply(this, arguments); }
  function lockMark() { return A.lockMark.apply(this, arguments); }
  function isHostNode() { return A.isHostNode.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function requestUnlock() { return A.requestUnlock.apply(this, arguments); }
  function textOr() { return A.textOr.apply(this, arguments); }
  function toggleProtection() { return A.toggleProtection.apply(this, arguments); }
  function todayIso() { return A.todayIso.apply(this, arguments); }
  function uiLang() { return A.uiLang.apply(this, arguments); }
  function renderOverview() { return A.renderOverview.apply(this, arguments); }

  /* ═══ Скрытие текста задач (O4) ═══════════════════════════════════════
   * От случайного взгляда на экран: на Обзоре и на экране «Задачи» вместо
   * текста — точки, срок и место остаются. Состояние — только в памяти
   * вкладки: каждый запуск и уход со страницы (pagehide) снова «скрыто».
   * Ни localStorage, ни базы. Это не защита J8 — та шифрует при хранении. */
  var tasksMasked = true;
  var MASK = '••••••••••';
  var EYE = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
  var EYE_OFF = '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
  function areTasksMasked() { return tasksMasked; }
  function syncMaskButtons() {
    $all('[data-task-mask]').forEach(function (b) {
      var label = t('j.task.mask_toggle');
      b.setAttribute('aria-pressed', tasksMasked ? 'false' : 'true');
      b.setAttribute('aria-label', label);
      b.title = label;
      b.innerHTML = svg(tasksMasked ? EYE_OFF : EYE, 'width="20" height="20"');
    });
  }
  /** Заголовок строки задачи в режиме «скрыто»: одинаковая длина, без текста. */
  function maskedTitleHtml() {
    return '<p class="j-row__title j-row__title--masked" aria-label="' + esc(t('j.task.masked')) + '">' + MASK + '</p>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-task-mask]') : null;
    if (!b) return;
    tasksMasked = !tasksMasked;
    syncMaskButtons();
    var route = parseHash().route;
    if (route === 'overview') renderOverview();
    else if (route === 'tasks') renderTasks();
  });
  window.addEventListener('pagehide', function () { tasksMasked = true; syncMaskButtons(); });

  /* Поиск на экране «Задачи» (O4): в памяти, по требованию. Запрос — только
     значение поля (#tasksInput): не пишется ни в хэш, ни в хранилища;
     блокировка J8 очищает поле вместе с остальными. Текст защищённой задачи
     в заблокированной сессии не ищется — только место (район › собрание). */
  function normQuery(s) { return String(s == null ? '' : s).toLocaleLowerCase(uiLang()).replace(/\s+/g, ' ').trim(); }
  function taskQuery() { var f = $('#tasksInput'); return f ? normQuery(f.value) : ''; }
  document.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'tasksInput') return;
    if (parseHash().route === 'tasks') renderTasks();
  });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#tasksClear') : null;
    if (!b) return;
    var f = $('#tasksInput');
    f.value = '';
    f.focus();
    renderTasks();
  });


  /* ═══ Экран «Задачи» (J5) ═════════════════════════════════════════════
   * Все задачи Журнала через CWJournal.tasks; порядок — контракт
   * tasks.list(). Задача завершённого/архивного посещения — только чтение
   * (tasks.isMutable; само правило держит слой данных). */
  var taskTab = 'open';
  var tasksRenderSeq = 0;
  function setTaskTab(v) { taskTab = v; }

  async function nodePath(nodesById, node) {
    var parts = [];
    var cur = node;
    while (cur) {
      parts.unshift(cur.kind === 'congregation' ? canonicalName(cur) : cur.label);
      cur = cur.parentId && cur.parentId !== CWJournal.ROOT_PARENT ? nodesById[cur.parentId] : null;
    }
    return parts.join(' › ');
  }

  /* focusId (J9c) — задача из ссылки #tasks/<id>: нужная вкладка, строка
     подсвечена и в фокусе; защищённая и закрытая — обычная разблокировка.
     Нет такой задачи — обычный экран, адрес сводится к #tasks. Id сравнивается
     с данными как строка и в селекторы/разметку не попадает. */
  async function renderTasks(focusId) {
    // J8: два запроса перерисовки подряд (операция + смена блокировки) не
    // должны дублировать строки — список собирается целиком и ставится
    // только последним вызовом.
    var mine = ++tasksRenderSeq;
    var all = await CWJournal.tasks.list();
    var focusTask = focusId ? all.filter(function (r) { return r.id === focusId; })[0] || null : null;
    if (focusId && !focusTask && mine === tasksRenderSeq) {
      // Нет такой задачи — обычный экран «Задачи» (перерисовка по hashchange).
      location.replace(CWJournalRoute.build.task(null));
      return;
    }
    if (focusTask) taskTab = focusTask.status === 'done' ? 'done' : 'open';
    var focusRow = null;
    var nodes = await CWJournal.nodes.getAll();
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var open = all.filter(function (r) { return r.status !== 'done'; });
    var done = all.filter(function (r) { return r.status === 'done'; });
    var tabList = taskTab === 'done' ? done : open;
    var q = focusTask ? '' : taskQuery();
    if (focusTask && $('#tasksInput')) $('#tasksInput').value = '';
    var list = tabList;
    if (q) {
      list = [];
      for (var i = 0; i < tabList.length; i++) {
        var r = tabList[i];
        var place = byId[r.nodeId] ? await nodePath(byId, byId[r.nodeId]) : '';
        var text = isLockedRow(r) ? '' : (r.body || '');
        if (normQuery(text + ' ' + place).indexOf(q) !== -1) list.push(r);
      }
    }
    if (mine !== tasksRenderSeq) return;
    $('#tasksLede').textContent = t('j.visit.summary_tasks_counts').replace('%d', String(open.length)).replace('%d', String(done.length));
    $all('#route-tasks [data-task-tab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-task-tab') === taskTab); });
    $('#tasksClear').hidden = !$('#tasksInput').value;
    $('#tasksStatus').textContent = q ? list.length + ' / ' + tabList.length : '';
    syncMaskButtons();
    var box = $('#tasksList');
    box.innerHTML = '';
    if (q && !list.length) {
      box.innerHTML = '<p class="j-sec__hint">' + esc(t('j.task.no_match')) + '</p>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="md-emptystate"><div class="md-emptystate__icon" aria-hidden="true">' +
        svg('<path d="m3 8 3 3 5-5"/><path d="m3 17 3 3 5-5"/><path d="M14 8h7M14 18h7"/>', 'width="32" height="32"') + '</div>' +
        '<p class="md-emptystate__title">' + esc(t(taskTab === 'done' ? 'j.task.empty_done' : 'j.task.empty_open')) + '</p>' +
        '<p class="md-emptystate__text">' + esc(t('j.task.empty_text')) + '</p></div>';
      return;
    }
    var built = await buildTaskRows(list, byId, focusTask, renderTasks, tasksMasked);
    var frag = built.frag;
    focusRow = built.focusRow;
    if (mine !== tasksRenderSeq) return;
    box.replaceChildren(frag);
    if (focusRow) {
      try { focusRow.scrollIntoView({ block: 'center' }); } catch (_) { /* старый движок */ }
      var target = focusRow.querySelector('.j-task__main');
      if (target) target.focus({ preventScroll: true });
      if (isLockedRow(focusTask)) requestUnlock();
    }
  }

  /** Строки задач (общие для экрана «Задачи» и вкладки «Задачи» района).
   *  rerender — перерисовка вызывающего экрана после операции; masked —
   *  режим «скрыто» (O4, только экран «Задачи»: карточки объектов — рабочее
   *  место, там текст виден). Задача из явной ссылки #tasks/<id> видна и
   *  в режиме «скрыто» — её открыли намеренно. */
  async function buildTaskRows(list, byId, focusTask, rerender, masked) {
    var focusRow = null;
    var today = todayIso();
    var frag = document.createDocumentFragment();
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var mutable = await CWJournal.tasks.isMutable(r.id);
      var visit = r.fields && r.fields.visitId ? await CWJournal.visits.get(r.fields.visitId) : null;
      var node = byId[r.nodeId];
      var ctx = node ? await nodePath(byId, node) : '';
      if (visit) ctx += ' · ' + capitalize(seasonLabel(visit.dateFrom));
      var isDone = r.status === 'done';
      var due = r.dueDate ? '<span class="md-status ' + (!isDone && r.dueDate <= today ? 'md-status-important' : 'md-status-normal') + '">' +
        esc(t('j.task.due_short').replace('%s', ddmm(r.dueDate))) + '</span><span class="j-dot">·</span>' : '';
      var row = document.createElement('div');
      row.className = 'j-row j-task' + (isDone ? ' j-task--done' : '') + (focusTask && r.id === focusTask.id ? ' j-task--focus' : '');
      if (focusTask && r.id === focusTask.id) focusRow = row;
      row.innerHTML =
        '<button type="button" class="j-check__box" role="checkbox" aria-checked="' + isDone + '" aria-label="' + esc(t('j.record.todo_toggle')) + '"' + (mutable ? '' : ' disabled') + '></button>' +
        '<div class="j-task__main" role="button" tabindex="' + (mutable ? '0' : '-1') + '" aria-disabled="' + !mutable + '">' +
        (masked && !(focusTask && r.id === focusTask.id) ? maskedTitleHtml() : '<p class="j-row__title' + (isLockedRow(r) ? ' u-muted' : '') + '">' + esc(textOr(r, 'body')) + lockMark(r) + '</p>') +
        '<p class="j-row__meta">' + due + esc(ctx) + (mutable ? '' : '<span class="j-dot">·</span>' + esc(t('j.task.readonly'))) + '</p></div>';
      (function (r, isDone, mutable) {
        row.querySelector('.j-check__box').addEventListener('click', function () {
          if (!mutable) return;
          runTaskOp(function () { return isDone ? CWJournal.tasks.reopen(r.id) : CWJournal.tasks.complete(r.id); }, rerender);
        });
        var main = row.querySelector('.j-task__main');
        var edit = function () {
          if (!mutable) return;
          if (isLockedRow(r)) { requestUnlock(); return; } // перерисовка — по разблокировке
          openTaskDialog(r, { onDone: rerender });
        };
        main.addEventListener('click', edit);
        main.addEventListener('keydown', function (e) { if (e.key === 'Enter') edit(); });
      })(r, isDone, mutable);
      frag.appendChild(row);
    }
    return { frag: frag, focusRow: focusRow };
  }

  async function runTaskOp(fn, rerender) {
    try { await fn(); } catch (err) { alert(errorMessage(err)); }
    (rerender || renderTasks)();
  }

  /* ═══ Вкладка «Задачи» района (J10, строгое разделение) ═════════════════
   * Только задачи самого района и его групп/предгрупп (у них своей вкладки
   * нет); задачи, чей nodeId — собрание, показывает вкладка «Задачи» этого
   * собрания, не здесь. */
  var districtTaskTab = 'open';
  var districtTasksSeq = 0;
  async function renderDistrictTasks(circuitId) {
    var mine = ++districtTasksSeq;
    var nodes = await CWJournal.nodes.byCircuit(circuitId);
    var congIds = {};
    nodes.forEach(function (n) { if (isHostNode(n)) congIds[n.id] = true; });
    var all = (await CWJournal.tasks.list()).filter(function (r) { return r.circuitId === circuitId && !congIds[r.nodeId]; });
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var open = all.filter(function (r) { return r.status !== 'done'; });
    var done = all.filter(function (r) { return r.status === 'done'; });
    if (mine !== districtTasksSeq) return;
    $('#districtTasksLede').textContent = t('j.visit.summary_tasks_counts').replace('%d', String(open.length)).replace('%d', String(done.length));
    $all('#districtDetailView [data-dtask-tab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-dtask-tab') === districtTaskTab); });
    var list = districtTaskTab === 'done' ? done : open;
    var box = $('#districtTasksList');
    if (!list.length) {
      box.innerHTML = '<div class="md-emptystate"><div class="md-emptystate__icon" aria-hidden="true">' +
        svg('<path d="m3 8 3 3 5-5"/><path d="m3 17 3 3 5-5"/><path d="M14 8h7M14 18h7"/>', 'width="32" height="32"') + '</div>' +
        '<p class="md-emptystate__title">' + esc(t(districtTaskTab === 'done' ? 'j.task.empty_done' : 'j.task.empty_open')) + '</p>' +
        '<p class="md-emptystate__text">' + esc(t('j.dtask.empty_text')) + '</p></div>';
      return;
    }
    var rerender = function () { renderDistrictTasks(circuitId); };
    var built = await buildTaskRows(list, byId, null, rerender);
    if (mine !== districtTasksSeq) return;
    box.replaceChildren(built.frag);
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#districtDetailView [data-dtask-tab]') : null;
    if (!b) return;
    districtTaskTab = b.getAttribute('data-dtask-tab');
    var st = parseHash();
    if (st.circuitId) renderDistrictTasks(st.circuitId);
  });

  /* ═══ Вкладка «Задачи» собрания (J10) ════════════════════════════════════
   * Только строки этого собрания (nodeId = собрание): самостоятельные
   * задачи и задачи его посещений. Группы/предгруппы сюда не входят — у
   * них своей вкладки нет, их задачи остаются в вкладке района. */
  var congTaskTab = 'open';
  var congTasksSeq = 0;
  async function renderCongregationTasks(node) {
    var mine = ++congTasksSeq;
    var all = (await CWJournal.tasks.list()).filter(function (r) { return r.nodeId === node.id; });
    var byId = {};
    byId[node.id] = node;
    var open = all.filter(function (r) { return r.status !== 'done'; });
    var done = all.filter(function (r) { return r.status === 'done'; });
    if (mine !== congTasksSeq) return;
    $('#congTasksLede').textContent = t('j.visit.summary_tasks_counts').replace('%d', String(open.length)).replace('%d', String(done.length));
    $all('#congTasksPanel [data-ctask-tab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-ctask-tab') === congTaskTab); });
    var list = congTaskTab === 'done' ? done : open;
    var box = $('#congTasksList');
    if (!list.length) {
      box.innerHTML = '<div class="md-emptystate"><div class="md-emptystate__icon" aria-hidden="true">' +
        svg('<path d="m3 8 3 3 5-5"/><path d="m3 17 3 3 5-5"/><path d="M14 8h7M14 18h7"/>', 'width="32" height="32"') + '</div>' +
        '<p class="md-emptystate__title">' + esc(t(congTaskTab === 'done' ? 'j.task.empty_done' : 'j.task.empty_open')) + '</p>' +
        '<p class="md-emptystate__text">' + esc(t('j.ctask.empty_text')) + '</p></div>';
      return;
    }
    var rerender = function () { renderCongregationTasks(node); };
    var built = await buildTaskRows(list, byId, null, rerender);
    if (mine !== congTasksSeq) return;
    box.replaceChildren(built.frag);
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#congTasksPanel [data-ctask-tab]') : null;
    if (!b) return;
    congTaskTab = b.getAttribute('data-ctask-tab');
    var st = parseHash();
    if (st.congregationId) CWJournal.nodes.get(st.congregationId).then(function (n) { if (n) renderCongregationTasks(n); });
  });

  /** Создание самостоятельной задачи (row = null) или правка. Область
   *  выбирается явно — владельца «по умолчанию» нет. J7: opts.projectId —
   *  задача проекта (создание через CWJournal.projects.addTask, вместо
   *  удаления — «Убрать из проекта»); opts.onDone — перерисовка вызывающего. */
  async function openTaskDialog(row, opts) {
    opts = opts || {};
    var projectId = opts.projectId || null;
    var circuitScope = opts.circuitId || null;
    var unlinkBtn = $('#taskDialogUnlink');
    var dlg = $('#taskDialog');
    var form = $('#taskDialogForm');
    var scope = $('#taskDialogScope');
    var body = $('#taskDialogBody');
    var due = $('#taskDialogDue');
    var errEl = $('#taskDialogError');
    var del = $('#taskDialogDelete');
    var protBtn = $('#taskDialogProtect');
    var busy = false;
    $('#taskDialogTitle').textContent = t(row ? 'j.task.edit' : 'j.task.new');
    $('#taskScopeField').hidden = !!row || !!projectId;
    scope.required = !row && !projectId;
    if (!row && !projectId) {
      var nodes = (await CWJournal.nodes.getAll()).filter(function (n) {
        return n.status !== 'archived' && (!opts.circuitId || n.circuitId === opts.circuitId);
      });
      var byId = {};
      nodes.forEach(function (n) { byId[n.id] = n; });
      var choices = [];
      for (var i = 0; i < nodes.length; i++) choices.push({ id: nodes[i].id, label: await nodePath(byId, nodes[i]) });
      choices.sort(function (a, b) { return a.label.localeCompare(b.label); });
      scope.innerHTML = '<option value="">' + esc(t('j.task.scope_pick')) + '</option>' +
        choices.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>'; }).join('');
      // Вкладка района/собрания: область по умолчанию — сам узел, с которого
      // открыт диалог (выбор остаётся явным полем).
      var defaultScope = opts.nodeId || circuitScope;
      if (defaultScope && byId[defaultScope]) scope.value = defaultScope;
    }
    body.value = row ? row.body : '';
    due.value = row && row.dueDate ? row.dueDate : '';
    del.hidden = !row || !!projectId;
    unlinkBtn.hidden = !(row && projectId);
    protBtn.hidden = !row;
    if (row) protBtn.textContent = t(isProtectedRow(row) ? 'j.prot.unprotect' : 'j.prot.protect');
    errEl.hidden = true;
    dlg.showModal();
    body.focus();

    function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }
    async function onSubmit(e) {
      e.preventDefault();
      if (busy) return;
      if (!row && !projectId && !scope.value) { showError(t('j.task.scope_required')); return; }
      if (!body.value.trim()) { showError(t('j.error.visit_record_empty')); return; }
      busy = true;
      try {
        if (row) {
          var patch = {};
          if (body.value !== row.body) patch.body = body.value;
          if ((due.value || '') !== (row.dueDate || '')) patch.dueDate = due.value || null;
          if (Object.keys(patch).length) await CWJournal.tasks.update(row.id, patch);
        } else if (projectId) {
          await CWJournal.projects.addTask(projectId, { body: body.value, dueDate: due.value || undefined });
        } else {
          await CWJournal.tasks.add({ nodeId: scope.value, body: body.value, dueDate: due.value || undefined });
        }
      } catch (err) { busy = false; showError(errorMessage(err)); return; }
      busy = false;
      cleanup(); dlg.close(); done();
    }
    function done() { if (opts.onDone) opts.onDone(); else renderTasks(); }
    async function onUnlink() {
      if (!row || !projectId || busy || !confirm(t('j.project.unlink_confirm'))) return;
      busy = true;
      try { await CWJournal.projects.unlink(projectId, CWJournal.urn.entry(row.id)); } catch (err) { busy = false; showError(errorMessage(err)); return; }
      busy = false;
      cleanup(); dlg.close(); done();
    }
    async function onDelete() {
      if (!row || busy || !confirm(t('j.confirm.delete_record'))) return;
      busy = true;
      try { await CWJournal.tasks.remove(row.id); } catch (err) { busy = false; showError(errorMessage(err)); return; }
      busy = false;
      cleanup(); dlg.close(); done();
    }
    /* J8: несохранённая правка — сначала сохранить, затем лист защиты. */
    async function onProtect() {
      if (!row || busy) return;
      if (!body.value.trim()) { showError(t('j.error.visit_record_empty')); return; }
      busy = true;
      try {
        var patch = {};
        if (body.value !== row.body) patch.body = body.value;
        if ((due.value || '') !== (row.dueDate || '')) patch.dueDate = due.value || null;
        if (Object.keys(patch).length) await CWJournal.tasks.update(row.id, patch);
      } catch (err) { busy = false; showError(errorMessage(err)); return; }
      busy = false;
      cleanup(); dlg.close();
      await toggleProtection(row);
      done();
    }
    function onCancel() { cleanup(); dlg.close(); }
    var unbindClose;
    function cleanup() {
      form.removeEventListener('submit', onSubmit);
      del.removeEventListener('click', onDelete);
      protBtn.removeEventListener('click', onProtect);
      unlinkBtn.removeEventListener('click', onUnlink);
      $('#taskDialogCancel').removeEventListener('click', onCancel);
      if (unbindClose) unbindClose();
    }
    form.addEventListener('submit', onSubmit);
    del.addEventListener('click', onDelete);
    protBtn.addEventListener('click', onProtect);
    unlinkBtn.addEventListener('click', onUnlink);
    $('#taskDialogCancel').addEventListener('click', onCancel);
    unbindClose = bindDialogCleanup(dlg, cleanup);
  }

  /* Публикация для других файлов Журнала. */
  A.areTasksMasked = areTasksMasked;
  A.maskedTitleHtml = maskedTitleHtml;
  A.openTaskDialog = openTaskDialog;
  A.renderCongregationTasks = renderCongregationTasks;
  A.renderDistrictTasks = renderDistrictTasks;
  A.renderTasks = renderTasks;
  A.setTaskTab = setTaskTab;
  A.syncMaskButtons = syncMaskButtons;
})();
