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
  function todayIso() { return A.todayIso.apply(this, arguments); }


  /* ═══ Экран «Задачи» (J5) ═════════════════════════════════════════════
   * Все задачи Журнала через CWJournal.tasks; порядок — контракт
   * tasks.list(). Задача завершённого/архивного посещения — только чтение
   * (tasks.isMutable; само правило держит слой данных). */
  var taskTab = 'open';
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

  async function renderTasks() {
    var all = await CWJournal.tasks.list();
    var nodes = await CWJournal.nodes.getAll();
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var open = all.filter(function (r) { return r.status !== 'done'; });
    var done = all.filter(function (r) { return r.status === 'done'; });
    $('#tasksLede').textContent = t('j.visit.summary_tasks_counts').replace('%d', String(open.length)).replace('%d', String(done.length));
    $all('#route-tasks [data-task-tab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-task-tab') === taskTab); });
    var list = taskTab === 'done' ? done : open;
    var box = $('#tasksList');
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<div class="md-emptystate"><div class="md-emptystate__icon" aria-hidden="true">' +
        svg('<path d="m3 8 3 3 5-5"/><path d="m3 17 3 3 5-5"/><path d="M14 8h7M14 18h7"/>', 'width="32" height="32"') + '</div>' +
        '<p class="md-emptystate__title">' + esc(t(taskTab === 'done' ? 'j.task.empty_done' : 'j.task.empty_open')) + '</p>' +
        '<p class="md-emptystate__text">' + esc(t('j.task.empty_text')) + '</p></div>';
      return;
    }
    var today = todayIso();
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
      row.className = 'j-row j-task' + (isDone ? ' j-task--done' : '');
      row.innerHTML =
        '<button type="button" class="j-check__box" role="checkbox" aria-checked="' + isDone + '" aria-label="' + esc(t('j.record.todo_toggle')) + '"' + (mutable ? '' : ' disabled') + '></button>' +
        '<div class="j-task__main" role="button" tabindex="' + (mutable ? '0' : '-1') + '" aria-disabled="' + !mutable + '">' +
        '<p class="j-row__title">' + esc(r.body) + '</p>' +
        '<p class="j-row__meta">' + due + esc(ctx) + (mutable ? '' : '<span class="j-dot">·</span>' + esc(t('j.task.readonly'))) + '</p></div>';
      (function (r, isDone, mutable) {
        row.querySelector('.j-check__box').addEventListener('click', function () {
          if (!mutable) return;
          runTaskOp(function () { return isDone ? CWJournal.tasks.reopen(r.id) : CWJournal.tasks.complete(r.id); });
        });
        var main = row.querySelector('.j-task__main');
        var edit = function () { if (mutable) openTaskDialog(r); };
        main.addEventListener('click', edit);
        main.addEventListener('keydown', function (e) { if (e.key === 'Enter') edit(); });
      })(r, isDone, mutable);
      box.appendChild(row);
    }
  }

  async function runTaskOp(fn) {
    try { await fn(); } catch (err) { alert(errorMessage(err)); }
    renderTasks();
  }

  /** Создание самостоятельной задачи (row = null) или правка. Область
   *  выбирается явно — владельца «по умолчанию» нет. J7: opts.projectId —
   *  задача проекта (создание через CWJournal.projects.addTask, вместо
   *  удаления — «Убрать из проекта»); opts.onDone — перерисовка вызывающего. */
  async function openTaskDialog(row, opts) {
    opts = opts || {};
    var projectId = opts.projectId || null;
    var unlinkBtn = $('#taskDialogUnlink');
    var dlg = $('#taskDialog');
    var form = $('#taskDialogForm');
    var scope = $('#taskDialogScope');
    var body = $('#taskDialogBody');
    var due = $('#taskDialogDue');
    var errEl = $('#taskDialogError');
    var del = $('#taskDialogDelete');
    var busy = false;
    $('#taskDialogTitle').textContent = t(row ? 'j.task.edit' : 'j.task.new');
    $('#taskScopeField').hidden = !!row || !!projectId;
    scope.required = !row && !projectId;
    if (!row && !projectId) {
      var nodes = (await CWJournal.nodes.getAll()).filter(function (n) { return n.status !== 'archived'; });
      var byId = {};
      nodes.forEach(function (n) { byId[n.id] = n; });
      var opts = [];
      for (var i = 0; i < nodes.length; i++) opts.push({ id: nodes[i].id, label: await nodePath(byId, nodes[i]) });
      opts.sort(function (a, b) { return a.label.localeCompare(b.label); });
      scope.innerHTML = '<option value="">' + esc(t('j.task.scope_pick')) + '</option>' +
        opts.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>'; }).join('');
    }
    body.value = row ? row.body : '';
    due.value = row && row.dueDate ? row.dueDate : '';
    del.hidden = !row || !!projectId;
    unlinkBtn.hidden = !(row && projectId);
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
    function onCancel() { cleanup(); dlg.close(); }
    var unbindClose;
    function cleanup() {
      form.removeEventListener('submit', onSubmit);
      del.removeEventListener('click', onDelete);
      unlinkBtn.removeEventListener('click', onUnlink);
      $('#taskDialogCancel').removeEventListener('click', onCancel);
      if (unbindClose) unbindClose();
    }
    form.addEventListener('submit', onSubmit);
    del.addEventListener('click', onDelete);
    unlinkBtn.addEventListener('click', onUnlink);
    $('#taskDialogCancel').addEventListener('click', onCancel);
    unbindClose = bindDialogCleanup(dlg, cleanup);
  }

  /* Публикация для других файлов Журнала. */
  A.openTaskDialog = openTaskDialog;
  A.renderTasks = renderTasks;
  A.setTaskTab = setTaskTab;
})();
