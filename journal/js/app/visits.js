/** Журнал — посещения: экран, записи и редактор, перенос «на след. визит», диалоги. */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  /* Общие константы других файлов (объекты неизменяемы по смыслу). */
  var ICON = A.ICON;

  /* Функции других файлов — позднее связывание через CWJournalApp. */
  function $() { return A.$.apply(this, arguments); }
  function $all() { return A.$all.apply(this, arguments); }
  function bindDialogCleanup() { return A.bindDialogCleanup.apply(this, arguments); }
  function canonicalName() { return A.canonicalName.apply(this, arguments); }
  function capitalize() { return A.capitalize.apply(this, arguments); }
  function el() { return A.el.apply(this, arguments); }
  function errorMessage() { return A.errorMessage.apply(this, arguments); }
  function esc() { return A.esc.apply(this, arguments); }
  function formatRange() { return A.formatRange.apply(this, arguments); }
  function openRecordProjectPicker() { return A.openRecordProjectPicker.apply(this, arguments); }
  function refreshCurrentView() { return A.refreshCurrentView.apply(this, arguments); }
  function renderTasks() { return A.renderTasks.apply(this, arguments); }
  function seasonLabel() { return A.seasonLabel.apply(this, arguments); }
  function setTaskTab() { return A.setTaskTab.apply(this, arguments); }
  function svg() { return A.svg.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }
  function visitStatusView() { return A.visitStatusView.apply(this, arguments); }
  function wireMenuToggle() { return A.wireMenuToggle.apply(this, arguments); }


  async function renderCongregationVisits(node) {
    var list = await CWJournal.visits.byNode(node.id);
    $('#congVisitsCount').textContent = String(list.length);
    var box = $('#congVisitsList');
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML =
        '<div class="md-emptystate">' +
        '<div class="md-emptystate__icon" aria-hidden="true">' + svg(ICON.visit, 'width="32" height="32"') + '</div>' +
        '<p class="md-emptystate__title">' + esc(t('j.visits.empty_title')) + '</p>' +
        '<p class="md-emptystate__text">' + esc(t('j.visits.empty_text')) + '</p>' +
        '</div>';
      return;
    }
    list.forEach(function (visit) {
      var st = visitStatusView(visit);
      var row = document.createElement('div');
      row.className = 'j-row j-row--link';
      row.innerHTML =
        '<div class="j-row__ico">' + svg(ICON.visit) + '</div>' +
        '<div class="j-row__body">' +
        '<p class="j-row__title">' + (visit.status === 'archived'
          ? '<span class="u-muted">' + esc(capitalize(seasonLabel(visit.dateFrom))) + '</span>'
          : '<b>' + esc(capitalize(seasonLabel(visit.dateFrom))) + '</b>') + '</p>' +
        '<p class="j-row__meta">' + esc(formatRange(visit.dateFrom, visit.dateTo, false)) + '</p>' +
        '</div>' +
        '<div class="j-row__end">' + st.html + svg(ICON.chevron, 'width="18" height="18"') + '</div>';
      row.addEventListener('click', function () {
        location.hash = CWJournalRoute.build.visit(node.circuitId, node.id, visit.id);
      });
      box.appendChild(row);
    });
  }

  /* ═══ Экран посещения (J4a) ═════════════════════════════════════════════ */
  async function renderVisitDetail(circuitId, nodeId, visitId) {
    var node = await CWJournal.nodes.get(nodeId);
    if (!node || node.kind !== 'congregation' || node.circuitId !== circuitId) {
      location.replace(CWJournalRoute.build.circuit(circuitId));
      return;
    }
    var visit = await CWJournal.visits.get(visitId);
    if (!visit || visit.nodeId !== nodeId) {
      // Неизвестное/чужое посещение — ближайший валидный контекст.
      location.replace(CWJournalRoute.build.visits(circuitId, nodeId));
      return;
    }
    var circuit = await CWJournal.nodes.get(circuitId);
    if (!circuit) { location.replace('#districts'); return; }

    var congName = canonicalName(node);
    var season = seasonLabel(visit.dateFrom);
    $('#visitCrumbCircuit').textContent = circuit.label;
    $('#visitCrumbCircuit').setAttribute('href', CWJournalRoute.build.circuit(circuitId));
    $('#visitCrumbCong').textContent = congName;
    $('#visitCrumbCong').setAttribute('href', CWJournalRoute.build.visits(circuitId, nodeId));
    $('#visitCrumbLabel').textContent = capitalize(season);
    $('#visitTitle').textContent = t('j.visit.title').replace('%s', season);
    $('#visitLede').textContent = formatRange(visit.dateFrom, visit.dateTo, true) + ' · ' + t('j.visit.kind.' + node.kind);
    $('#topbarContext').textContent = congName + ' · ' + season;

    var st = visitStatusView(visit);
    $('#visitStatusChip').textContent = st.label;

    // Новый визит/переход на другой — черновик прежнего не переносится.
    if (editor.visitId !== visit.id) editor = { visitId: visit.id, draft: null, busy: false };
    editor.visit = visit;
    await renderVisitRecords();

    wireVisitMenu(visit, node);
  }

  /* ═══ Редактор записей посещения (J4b) ═════════════════════════════════
   * Один блок правится за раз (editor.draft); сохранение — явное, без
   * автосохранения. Все записи — через CWJournal.visitRecords. Текст
   * рендерится только через esc(); HTML не хранится и не собирается из
   * пользовательского ввода. */
  var editor = { visitId: null, visit: null, draft: null, busy: false, projCounts: {} };
  function currentEditorVisit() { return editor.visit; }
  var FORMAT_KEYS = { paragraph: 'j.editor.paragraph', list: 'j.editor.list', quote: 'j.editor.quote' };

  function visitEditable() { return !!(editor.visit && editor.visit.status === 'open'); }

  async function renderVisitRecords() {
    var visit = editor.visit;
    var records = await CWJournal.visitRecords.byVisit(visit.id);
    var editable = visitEditable();
    var box = $('#visitRecords');
    box.innerHTML = '';

    var ro = $('#visitReadonly');
    ro.hidden = editable;
    if (!editable) ro.textContent = t(visit.status === 'archived' ? 'j.visit.readonly_archived' : 'j.visit.readonly_completed');
    if (!editable) editor.draft = null;
    $('#visitAddWrap').hidden = !editable || !!(editor.draft && !editor.draft.id);
    $all('#visitDetailView .j-editor__bar [data-format], #visitDetailView .j-editor__bar [data-cmd]').forEach(function (b) {
      b.disabled = !editable;
    });
    syncToolbar();

    // J7: число проектов, связанных с каждой записью (индекс to), — только
    // для отметки на блоке; в памяти, никуда не пишется.
    editor.projCounts = {};
    await Promise.all(records.map(async function (r) {
      editor.projCounts[r.id] = (await CWJournal.projects.forTarget(CWJournal.urn.entry(r.id))).length;
    }));
    if (!records.length && !(editor.draft && !editor.draft.id)) {
      var empty = document.createElement('p');
      empty.className = 'j-editor__empty';
      empty.textContent = t(editable ? 'j.visit.records_empty' : 'j.visit.records_empty_readonly');
      box.appendChild(empty);
    }
    records.forEach(function (r) {
      box.appendChild(editor.draft && editor.draft.id === r.id ? editBlock(r) : viewBlock(r, editable));
    });
    if (editor.draft && !editor.draft.id) box.appendChild(editBlock(null));

    var todos = records.filter(function (r) { return r.type === 'todo'; });
    var done = todos.filter(function (r) { return r.status === 'done'; }).length;
    $('#visitSummaryTasks').textContent = todos.length
      ? t('j.visit.summary_tasks_counts').replace('%d', String(todos.length - done)).replace('%d', String(done))
      : t('j.visit.summary_none');
    // «Помечено на следующее посещение» — пункты, чьё последнее решение
    // принято В ЭТОМ посещении и которые остаются открытыми (J5). Это не
    // число входящих: входящие показаны выше, в баннере и секции переноса.
    var marked = await CWJournal.carry.markedIn(visit.id);
    $('#visitSummaryCarry').textContent = marked.length
      ? t('j.visit.summary_marked').replace('%d', String(marked.length))
      : t('j.visit.summary_none');
    $all('#visitDetailView .j-editor__bar [data-cmd="link"]').forEach(function (b) {
      b.disabled = !editable || !(editor.draft && editor.draft.id);
    });
    $all('#visitDetailView .j-editor__bar [data-cmd="carry"]').forEach(function (b) {
      var target = editor.draft && editor.draft.id ? records.filter(function (r) { return r.id === editor.draft.id; })[0] : null;
      b.disabled = !editable || !editor.draft;
      b.classList.toggle('active', !!(target && 'carryKey' in target));
    });
    await renderCarryIncoming();

    var input = box.querySelector('.j-block__input');
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }

  function syncToolbar() {
    var fmt = editor.draft ? editor.draft.format : 'paragraph';
    $all('#visitDetailView .j-editor__bar [data-format]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-format') === fmt);
    });
  }

  function carryTag(r) {
    if (!CWJournal.carry.isOpen(r)) return '';
    return '<span class="j-carrybadge j-block__carry">' + svg('<path d="M4 21V4h11l-1.5 4L15 12H4"/>', 'width="12" height="12"') +
      esc(t('j.carry.tag')) + '</span>';
  }

  function projTag(r) {
    var n = editor.projCounts && editor.projCounts[r.id];
    if (!n) return '';
    return '<span class="j-tag j-tag--link j-block__tag" title="' + esc(t('j.project.linked_tag')) + '">' +
      svg('<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>', 'width="12" height="12"') + esc(String(n)) + '</span>';
  }

  function typeTag(r) {
    if (r.type !== 'question' && r.type !== 'observation') return '';
    return '<span class="j-tag j-block__tag">' + esc(t('j.record.type.' + r.type)) + '</span>';
  }

  function viewBlock(r, editable) {
    var el = document.createElement('div');
    var fmt = (r.fields && r.fields.format) || 'paragraph';
    el.className = 'j-block j-block--' + (r.type === 'todo' ? 'checklist' : fmt) + (editable ? ' j-block--editable' : '');
    el.dataset.recordId = r.id;
    if (r.type === 'todo') {
      var isDone = r.status === 'done';
      el.innerHTML = '<div class="j-check' + (isDone ? ' j-check--done' : '') + '">' +
        '<button type="button" class="j-check__box" role="checkbox" aria-checked="' + isDone + '" aria-label="' + esc(t('j.record.todo_toggle')) + '"' + (editable ? '' : ' disabled') + '></button>' +
        '<span class="j-check__text">' + esc(r.body) + '</span>' + carryTag(r) + projTag(r) + '</div>';
      el.querySelector('.j-check__box').addEventListener('click', function (e) {
        e.stopPropagation();
        if (!editable || editor.busy) return;
        runRecordOp(function () { return isDone ? CWJournal.visitRecords.reopen(r.id) : CWJournal.visitRecords.complete(r.id); });
      });
    } else if (fmt === 'list') {
      el.innerHTML = '<ul>' + r.body.split('\n').filter(function (l) { return l.trim(); }).map(function (l) {
        return '<li>' + esc(l.replace(/^\s*[-•*]\s*/, '')) + '</li>';
      }).join('') + '</ul>' + typeTag(r) + carryTag(r) + projTag(r);
    } else {
      el.innerHTML = esc(r.body) + typeTag(r) + carryTag(r) + projTag(r);
    }
    if (editable) {
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', t('j.record.edit'));
      var start = function () {
        if (editor.busy) return;
        editor.draft = { id: r.id, type: r.type, format: fmt === 'checklist' ? 'checklist' : fmt, body: r.body, error: '', carry: CWJournal.carry.isOpen(r) };
        renderVisitRecords();
      };
      el.addEventListener('click', start);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === el) { e.preventDefault(); start(); } });
    }
    return el;
  }

  function editBlock(r) {
    var d = editor.draft;
    var el = document.createElement('div');
    el.className = 'j-block j-block--edit';
    var isTodo = d.type === 'todo';
    var typeOptions = isTodo ? '' : ['note', 'observation', 'question'].map(function (k) {
      return '<option value="' + k + '"' + (d.type === k ? ' selected' : '') + '>' + esc(t('j.record.type.' + k)) + '</option>';
    }).join('');
    el.innerHTML =
      '<textarea class="j-block__input j-block__input--' + esc(d.format) + '" rows="2" aria-label="' + esc(t('j.record.placeholder')) + '" placeholder="' + esc(t('j.record.placeholder')) + '"></textarea>' +
      (d.error ? '<p class="j-dialog-error" role="alert">' + esc(d.error) + '</p>' : '');
    el.querySelector('textarea').value = d.body || '';
    el.querySelector('textarea').addEventListener('input', function (e) { d.body = e.target.value; });

    var actions = document.createElement('div');
    actions.className = 'j-block__actions';
    actions.innerHTML =
      '<button type="button" class="md-btn md-btn-filled" data-act="save">' + esc(t('j.action.save')) + '</button>' +
      '<button type="button" class="md-btn md-btn-text" data-act="cancel">' + esc(t('j.action.cancel')) + '</button>' +
      '<button type="button" class="md-btn md-btn-tonal' + (d.carry ? ' is-pressed' : '') + '" data-act="carry" aria-pressed="' + !!d.carry + '">' +
        svg('<path d="M4 21V4h11l-1.5 4L15 12H4"/>', 'width="18" height="18"') + esc(t(d.carry ? 'j.carry.unmark' : 'j.editor.next_visit_long')) + '</button>' +
      (isTodo ? '' : '<button type="button" class="md-btn md-btn-outlined" data-act="to-todo">' + svg('<path d="m3 8 3 3 5-5"/><path d="m3 17 3 3 5-5"/><path d="M14 8h7M14 18h7"/>', 'width="18" height="18"') + esc(t('j.editor.make_todo')) + '</button>') +
      (isTodo ? '' : '<select class="j-block__type" data-act="type" aria-label="' + esc(t('j.record.type_label')) + '">' + typeOptions + '</select>') +
      (r ? '<button type="button" class="md-btn md-btn-text" data-act="delete">' + esc(t('j.action.delete')) + '</button>' : '');
    actions.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || b.tagName === 'SELECT') return;
      var act = b.getAttribute('data-act');
      if (act === 'save') saveDraft();
      else if (act === 'cancel') { editor.draft = null; renderVisitRecords(); }
      else if (act === 'to-todo') draftToTodo();
      else if (act === 'carry') draftToggleCarry();
      else if (act === 'delete') deleteRecord(r);
    });
    var sel = actions.querySelector('select');
    if (sel) sel.addEventListener('change', function () { d.type = sel.value; });
    var wrap = document.createDocumentFragment();
    wrap.appendChild(el);
    wrap.appendChild(actions);
    var holder = document.createElement('div');
    holder.appendChild(wrap);
    return holder;
  }

  /** Операция над записью: одна за раз; ошибка — видимая, данные на экране
   *  перечитываются из базы после любого исхода (ничего «оптимистичного»). */
  async function runRecordOp(fn, onError) {
    if (editor.busy) return;
    editor.busy = true;
    try {
      await fn();
      editor.busy = false;
    } catch (err) {
      editor.busy = false;
      if (onError) onError(err); else alert(errorMessage(err));
    }
    // Статус посещения мог смениться в другой вкладке — берём свежий.
    var fresh = await CWJournal.visits.get(editor.visitId);
    if (fresh) editor.visit = fresh;
    renderVisitRecords();
  }

  function saveDraft() {
    var d = editor.draft;
    if (!d) return;
    if (!d.body || !d.body.trim()) { d.error = t('j.error.visit_record_empty'); renderVisitRecords(); return; }
    runRecordOp(async function () {
      if (!d.id) {
        await CWJournal.visitRecords.add(editor.visitId, { type: d.type, body: d.body, format: d.format });
      } else {
        var cur = await CWJournal.visitRecords.get(d.id);
        var patch = {};
        if (cur.body !== d.body) patch.body = d.body;
        if (cur.type !== 'todo' && cur.type !== d.type) patch.type = d.type;
        if (cur.type !== 'todo' && cur.fields.format !== d.format) patch.format = d.format;
        if (Object.keys(patch).length) await CWJournal.visitRecords.update(d.id, patch);
      }
      editor.draft = null;
    }, function (err) { d.error = errorMessage(err); });
  }

  function draftToTodo() {
    var d = editor.draft;
    if (!d || d.type === 'todo') return;
    if (!d.body || !d.body.trim()) { d.error = t('j.error.visit_record_empty'); renderVisitRecords(); return; }
    runRecordOp(async function () {
      if (!d.id) {
        await CWJournal.visitRecords.add(editor.visitId, { type: 'todo', body: d.body });
      } else {
        var cur = await CWJournal.visitRecords.get(d.id);
        if (cur.body !== d.body) await CWJournal.visitRecords.update(d.id, { body: d.body });
        await CWJournal.visitRecords.convertToTodo(d.id);
      }
      editor.draft = null;
    }, function (err) { d.error = errorMessage(err); });
  }

  /** «На следующий визит» для выбранного блока: несохранённый текст
   *  сохраняется первым, затем пункт помечается или пометка снимается —
   *  всё через CWJournal.visitRecords / CWJournal.carry. */
  function draftToggleCarry() {
    var d = editor.draft;
    if (!d) return;
    if (!d.body || !d.body.trim()) { d.error = t('j.error.visit_record_empty'); renderVisitRecords(); return; }
    runRecordOp(async function () {
      var id = d.id;
      if (!id) {
        id = await CWJournal.visitRecords.add(editor.visitId, { type: d.type, body: d.body, format: d.type === 'todo' ? undefined : d.format });
      } else {
        var cur = await CWJournal.visitRecords.get(id);
        var patch = {};
        if (cur.body !== d.body) patch.body = d.body;
        if (cur.type !== 'todo' && cur.type !== d.type) patch.type = d.type;
        if (cur.type !== 'todo' && cur.fields.format !== d.format) patch.format = d.format;
        if (Object.keys(patch).length) await CWJournal.visitRecords.update(id, patch);
      }
      var row = await CWJournal.visitRecords.get(id);
      if (CWJournal.carry.isOpen(row)) await CWJournal.carry.unmark(id);
      else await CWJournal.carry.mark(id);
      editor.draft = null;
    }, function (err) { d.error = errorMessage(err); });
  }

  function deleteRecord(r) {
    if (!confirm(t('j.confirm.delete_record'))) return;
    runRecordOp(async function () {
      await CWJournal.visitRecords.remove(r.id);
      editor.draft = null;
    }, function (err) { if (editor.draft) editor.draft.error = errorMessage(err); });
  }

  /* ═══ Перенос: входящие пункты посещения (J5) ═══════════════════════════
   * Список и решения — только через CWJournal.carry. Ничего не пишется при
   * отрисовке; решение (kept/deferred/closed) — явная кнопка листа. */
  var carryView = { items: [], index: 0, visits: {} };

  async function visitCached(id) {
    if (!(id in carryView.visits)) carryView.visits[id] = await CWJournal.visits.get(id);
    return carryView.visits[id];
  }

  async function renderCarryIncoming() {
    var visit = editor.visit;
    carryView.visits = {};
    var rows = await CWJournal.carry.incoming(visit.id);
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var seen = {};
      (r.touches || []).forEach(function (tc) { if (tc.visitId !== visit.id) seen[tc.visitId] = true; });
      items.push({ row: r, origin: await visitCached(r.fields.visitId), state: CWJournal.carry.stateIn(r, visit.id), openVisits: Object.keys(seen).length });
    }
    carryView.items = items;

    var pending = items.filter(function (it) { return it.state === 'pending'; });
    var banner = $('#carryBanner');
    banner.hidden = !pending.length;
    if (pending.length) {
      $('#carryBannerTitle').textContent = t('j.carry.banner_title').replace('%d', String(pending.length));
      var oldest = pending.reduce(function (m, it) { return Math.max(m, it.openVisits); }, 0);
      $('#carryBannerText').textContent = oldest >= 2 ? t('j.carry.banner_oldest').replace('%d', String(oldest)) : '';
      $('#carryBannerText').hidden = oldest < 2;
      $('#carryReviewBtn').disabled = !visitEditable();
    }

    $('#carrySec').hidden = !items.length;
    $('#carryCount').textContent = String(items.length);
    var list = $('#carryList');
    list.innerHTML = '';
    items.forEach(function (it, idx) {
      var row = document.createElement('div');
      row.className = 'j-row j-row--link';
      row.innerHTML =
        '<div class="j-row__ico j-row__ico--accent">' + svg('<path d="M4 21V4h11l-1.5 4L15 12H4"/>') + '</div>' +
        '<div class="j-row__body"><p class="j-row__title j-row__title--clamp">' + esc(it.row.body) + '</p>' +
        '<p class="j-row__meta">' + esc(it.origin ? seasonLabel(it.origin.dateFrom) : '') + '<span class="j-dot">·</span>' +
        esc(t('j.carry.state.' + it.state)) + '</p></div>' +
        '<div class="j-row__end">' + (it.openVisits ? '<span class="j-carrybadge">' +
          svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>', 'width="12" height="12"') +
          String(it.openVisits) + '</span>' : '') + svg(ICON.chevron, 'width="18" height="18"') + '</div>';
      row.addEventListener('click', function () { openCarrySheet(idx); });
      list.appendChild(row);
    });
  }

  /** Строка истории: подпись с сезоном жирным (как в эталоне), только
   *  текстовые узлы — пользовательский текст сюда не попадает. */
  function histLine(el, template, season) {
    var parts = template.split('%s');
    el.appendChild(document.createTextNode(parts[0] || ''));
    var b = document.createElement('b');
    b.textContent = season;
    el.appendChild(b);
    el.appendChild(document.createTextNode(parts.slice(1).join('%s')));
  }

  async function openCarrySheet(idx) {
    var it = carryView.items[idx];
    if (!it) return;
    carryView.index = idx;
    var visit = editor.visit;
    var r = it.row;
    $('#carrySheetKicker').textContent = t(r.type === 'question' ? 'j.carry.kicker_question' : 'j.carry.kicker')
      .replace('%d', String(idx + 1)).replace('%d', String(carryView.items.length));
    $('#carrySheetTitle').textContent = r.body;
    var node = await CWJournal.nodes.get(r.nodeId);
    var meta = (node ? canonicalName(node) : '') + ' · ' + t('j.carry.open_visits').replace('%d', String(it.openVisits));
    if (r.type === 'todo') meta += ' · ' + t('j.record.type.todo') + ': ' + t(r.status === 'done' ? 'j.task.status_done' : 'j.task.status_open');
    var metaEl = $('#carrySheetMeta');
    metaEl.textContent = meta;
    if (it.openVisits) {
      var badge = document.createElement('span');
      badge.className = 'j-carrybadge';
      badge.innerHTML = svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>', 'width="12" height="12"');
      badge.appendChild(document.createTextNode(String(it.openVisits)));
      metaEl.appendChild(badge);
    }

    var hist = $('#carrySheetHist');
    hist.innerHTML = '';
    var touches = r.touches || [];
    for (var i = 0; i < touches.length; i++) {
      var tv = await visitCached(touches[i].visitId);
      var li = document.createElement('li');
      var p1 = document.createElement('p'); p1.className = 'j-hist__t';
      histLine(p1, t('j.carry.h.' + touches[i].action), tv ? seasonLabel(tv.dateFrom) : '—');
      var p2 = document.createElement('p'); p2.className = 'j-hist__m';
      p2.textContent = tv ? formatRange(tv.dateFrom, tv.dateTo, true) : '';
      li.appendChild(p1); li.appendChild(p2);
      hist.appendChild(li);
    }
    var now = document.createElement('li'); now.className = 'is-now';
    var n1 = document.createElement('p'); n1.className = 'j-hist__t';
    histLine(n1, t('j.carry.h.now'), seasonLabel(visit.dateFrom));
    var n2 = document.createElement('p'); n2.className = 'j-hist__m';
    n2.textContent = formatRange(visit.dateFrom, visit.dateTo, true);
    now.appendChild(n1); now.appendChild(n2); hist.appendChild(now);

    var canDecide = visitEditable() && CWJournal.carry.isOpen(r);
    $all('#carrySheet [data-carry]').forEach(function (b) {
      b.disabled = !canDecide;
      b.classList.toggle('is-pressed', it.state === b.getAttribute('data-carry'));
    });
    $('#carrySheetError').hidden = true;
    var dlg = $('#carrySheet');
    if (!dlg.open) dlg.showModal();
  }

  async function decideCarry(action) {
    var it = carryView.items[carryView.index];
    if (!it || editor.busy) return;
    editor.busy = true;
    try {
      await CWJournal.carry.touch(it.row.id, editor.visitId, action);
    } catch (err) {
      editor.busy = false;
      var e = $('#carrySheetError'); e.textContent = errorMessage(err); e.hidden = false;
      return;
    }
    editor.busy = false;
    await renderVisitRecords();
    var next = carryView.items.findIndex(function (x) { return x.state === 'pending'; });
    if (next < 0) { $('#carrySheet').close(); return; }
    openCarrySheet(next);
  }

  function wireVisitEditorChrome() {
    $('#visitAddRecord').addEventListener('click', function () {
      if (!visitEditable() || editor.busy) return;
      editor.draft = { id: null, type: 'note', format: 'paragraph', body: '', error: '' };
      renderVisitRecords();
    });
    $all('#visitDetailView .j-editor__bar [data-format]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!visitEditable() || editor.busy) return;
        var d = editor.draft;
        if (!d) {
          // Без выбранного блока формат начинает новую запись в этом формате.
          editor.draft = { id: null, type: 'note', format: b.getAttribute('data-format'), body: '', error: '' };
          renderVisitRecords();
          return;
        }
        if (d.type === 'todo') return;
        d.format = b.getAttribute('data-format');
        syncToolbar();
        var input = $('#visitRecords .j-block__input');
        if (input) { input.className = 'j-block__input j-block__input--' + d.format; input.focus(); }
      });
    });
    $all('#visitDetailView .j-editor__bar [data-cmd="carry"]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!visitEditable() || editor.busy || !editor.draft) return;
        draftToggleCarry();
      });
    });
    $all('#visitDetailView .j-editor__bar [data-cmd="link"]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!visitEditable() || editor.busy || !editor.draft || !editor.draft.id) return;
        openRecordProjectPicker(editor.draft.id);
      });
    });
    $('#carryReviewBtn').addEventListener('click', function () {
      var i = carryView.items.findIndex(function (it) { return it.state === 'pending'; });
      openCarrySheet(i < 0 ? 0 : i);
    });
    $all('#carrySheet [data-carry]').forEach(function (b) {
      b.addEventListener('click', function () { decideCarry(b.getAttribute('data-carry')); });
    });
    $('#carrySheetDone').addEventListener('click', function () { $('#carrySheet').close(); });
    $all('#route-tasks [data-task-tab]').forEach(function (b) {
      b.addEventListener('click', function () { setTaskTab(b.getAttribute('data-task-tab')); renderTasks(); });
    });
    $all('#visitDetailView .j-editor__bar [data-cmd="to-todo"]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!visitEditable() || editor.busy) return;
        if (!editor.draft) {
          // Без выбранного блока — новая задача (сохраняется явным «Сохранить»).
          editor.draft = { id: null, type: 'todo', format: 'checklist', body: '', error: '' };
          renderVisitRecords();
          return;
        }
        draftToTodo();
      });
    });
  }

  function wireVisitMenu(visit, node) {
    var btn = $('#moreBtn');
    var panel = $('#moreMenuPanel');
    var items = '<button type="button" class="md-menu__item" role="menuitem" data-action="edit-dates">' + esc(t('j.action.edit_dates')) + '</button>';
    if (visit.status === 'open') items += '<button type="button" class="md-menu__item" role="menuitem" data-action="complete">' + esc(t('j.action.complete')) + '</button>';
    if (visit.status === 'completed') items += '<button type="button" class="md-menu__item" role="menuitem" data-action="reopen">' + esc(t('j.action.reopen')) + '</button>';
    items += visit.status === 'archived'
      ? '<button type="button" class="md-menu__item" role="menuitem" data-action="unarchive">' + esc(t('j.action.unarchive')) + '</button>'
      : '<button type="button" class="md-menu__item" role="menuitem" data-action="archive">' + esc(t('j.action.archive')) + '</button>';
    items += '<button type="button" class="md-menu__item" role="menuitem" data-action="delete">' + esc(t('j.action.delete')) + '</button>';
    panel.innerHTML = items;
    btn.setAttribute('data-i18n-aria-label', 'j.action.visit_menu');
    btn.setAttribute('aria-label', t('j.action.visit_menu'));
    var freshBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(freshBtn, btn);
    wireMenuToggle(freshBtn, panel);
    panel.querySelectorAll('.md-menu__item').forEach(function (el) {
      el.onclick = function () {
        panel.hidden = true;
        handleVisitAction(el.getAttribute('data-action'), visit, node);
      };
    });
  }

  async function handleVisitAction(action, visit, node) {
    try {
      if (action === 'edit-dates') {
        openVisitDialog({
          title: t('j.dialog.edit_visit'), from: visit.dateFrom, to: visit.dateTo,
          onSave: function (from, to) { return CWJournal.visits.update(visit.id, { dateFrom: from, dateTo: to }); },
          onDone: refreshCurrentView,
        });
        return;
      }
      if (action === 'complete') await CWJournal.visits.complete(visit.id);
      else if (action === 'reopen') await CWJournal.visits.reopen(visit.id);
      else if (action === 'archive') await CWJournal.visits.archive(visit.id);
      else if (action === 'unarchive') await CWJournal.visits.unarchive(visit.id);
      else if (action === 'delete') {
        if (!confirm(t('j.confirm.delete').replace('%s', capitalize(seasonLabel(visit.dateFrom))))) return;
        await CWJournal.visits.remove(visit.id);
        location.hash = CWJournalRoute.build.visits(node.circuitId, node.id);
        return;
      }
      refreshCurrentView();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  /** Создание/правка дат. Ошибка сохранения показывается в самом диалоге,
   *  он остаётся открытым с введёнными значениями — состояние экрана и
   *  данных не расходятся (запись либо сохранена целиком, либо нет). */
  function openVisitDialog(opts) {
    var dlg = $('#visitDialog');
    var from = $('#visitDialogFrom');
    var to = $('#visitDialogTo');
    var errEl = $('#visitDialogError');
    var form = $('#visitDialogForm');
    var busy = false;
    $('#visitDialogTitle').textContent = opts.title;
    from.value = opts.from || '';
    to.value = opts.to || '';
    errEl.hidden = true; errEl.textContent = '';
    dlg.showModal();
    from.focus();

    function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }
    function onSubmit(e) {
      e.preventDefault();
      if (busy) return;
      var f = from.value, tt = to.value;
      if (!CWJournal.visits.isIsoDate(f) || !CWJournal.visits.isIsoDate(tt) || tt < f) {
        showError(t('j.error.visit_dates'));
        return;
      }
      busy = true;
      Promise.resolve(opts.onSave(f, tt)).then(function (result) {
        busy = false;
        cleanup();
        dlg.close();
        if (opts.onDone) opts.onDone(result);
      }, function (err) {
        busy = false;
        showError(errorMessage(err));
      });
    }
    function onCancel() { cleanup(); dlg.close(); }
    var unbindClose;
    function cleanup() {
      form.removeEventListener('submit', onSubmit);
      $('#visitDialogCancel').removeEventListener('click', onCancel);
      if (unbindClose) unbindClose();
    }
    form.addEventListener('submit', onSubmit);
    $('#visitDialogCancel').addEventListener('click', onCancel);
    unbindClose = bindDialogCleanup(dlg, cleanup);
  }

  /* Публикация для других файлов Журнала. */
  A.currentEditorVisit = currentEditorVisit;
  A.openVisitDialog = openVisitDialog;
  A.renderCongregationVisits = renderCongregationVisits;
  A.renderVisitDetail = renderVisitDetail;
  A.renderVisitRecords = renderVisitRecords;
  A.wireVisitEditorChrome = wireVisitEditorChrome;
})();
