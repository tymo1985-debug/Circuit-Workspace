/** Журнал — проекты района (J7): экран проекта, списки, описание, выбор для связи. */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  /* Общие константы других файлов (объекты неизменяемы по смыслу). */
  var ICON = A.ICON;

  /* Функции других файлов — позднее связывание через CWJournalApp. */
  function $() { return A.$.apply(this, arguments); }
  function $all() { return A.$all.apply(this, arguments); }
  function bindDialogCleanup() { return A.bindDialogCleanup.apply(this, arguments); }
  function capitalize() { return A.capitalize.apply(this, arguments); }
  function chip() { return A.chip.apply(this, arguments); }
  function currentEditorVisit() { return A.currentEditorVisit.apply(this, arguments); }
  function ddmm() { return A.ddmm.apply(this, arguments); }
  function destFor() { return A.destFor.apply(this, arguments); }
  function el() { return A.el.apply(this, arguments); }
  function errorMessage() { return A.errorMessage.apply(this, arguments); }
  function esc() { return A.esc.apply(this, arguments); }
  function formatRange() { return A.formatRange.apply(this, arguments); }
  function isLockedRow() { return A.isLockedRow.apply(this, arguments); }
  function isProtectedRow() { return A.isProtectedRow.apply(this, arguments); }
  function lockMark() { return A.lockMark.apply(this, arguments); }
  function lockedLabel() { return A.lockedLabel.apply(this, arguments); }
  function nodeName() { return A.nodeName.apply(this, arguments); }
  function openTaskDialog() { return A.openTaskDialog.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function refreshCurrentView() { return A.refreshCurrentView.apply(this, arguments); }
  function renderVisitRecords() { return A.renderVisitRecords.apply(this, arguments); }
  function requestUnlock() { return A.requestUnlock.apply(this, arguments); }
  function seasonLabel() { return A.seasonLabel.apply(this, arguments); }
  function svg() { return A.svg.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }
  function textOr() { return A.textOr.apply(this, arguments); }
  function toggleProtection() { return A.toggleProtection.apply(this, arguments); }
  function todayIso() { return A.todayIso.apply(this, arguments); }
  function uiLang() { return A.uiLang.apply(this, arguments); }
  function wireMenuToggle() { return A.wireMenuToggle.apply(this, arguments); }


  /* ═══ Проекты района (J7) — эталон 06-project-m / 06-project-d ════════════
   * Данные — только CWJournal.projects / CWJournal.links. Счётчики, прогресс
   * «N из M», список связанного и «история» — вычисление при отрисовке из
   * строк проекта, связей и связанных задач; ничего из этого не пишется.
   * Пользовательский текст выводится только через textContent/esc().
   * Описание — обычный текст в body: строка «## …» показывается
   * заголовком, строки «- …» — списком; HTML не хранится и не собирается. */
  var PICON = {
    project: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    note: '<path d="M14 3v5h5"/><path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z"/><path d="M9 13h6M9 17h4"/>',
  };
  var projectUi = { id: null, editing: false, draft: '', busy: false, error: '', fmt: 'paragraph' };
  var projectRenderSeq = 0;

  function pad2(n) { return String(n).padStart(2, '0'); }
  function localDay(iso) {
    var d = new Date(iso);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function dmy(iso) { var d = new Date(iso); return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear(); }
  function dayOrToday(iso) { return localDay(iso) === todayIso() ? t('j.project.today') : dmy(iso); }
  function whenText(iso) {
    var d = new Date(iso);
    return localDay(iso) === todayIso() ? t('j.project.today_at').replace('%s', pad2(d.getHours()) + ':' + pad2(d.getMinutes())) : dmy(iso);
  }
  /** Множественное число по правилам языка интерфейса: ключи prefix.one/
   *  few/many/other есть во всех пяти словарях. */
  function plural(prefix, n) {
    var cat = 'other';
    try { cat = new Intl.PluralRules(uiLang()).select(n); } catch (_) { /* other */ }
    if (['one', 'few', 'many', 'other'].indexOf(cat) === -1) cat = 'other';
    return t(prefix + '.' + cat).replace('%d', String(n));
  }
  function projectStatusHtml(p) {
    if (p.status === 'archived') return '<span class="j-tag">' + svg(ICON.archive, 'width="12" height="12"') + '<span>' + esc(t('j.badge.archive')) + '</span></span>';
    var done = p.status === 'completed';
    return '<span class="md-status ' + (done ? 'md-status-normal' : 'md-status-success') + '">' + esc(t(done ? 'j.project.status.completed' : 'j.project.status.active')) + '</span>';
  }
  function projectStatusLabel(p) {
    return p.status === 'archived' ? t('j.badge.archive') : t(p.status === 'completed' ? 'j.project.status.completed' : 'j.project.status.active');
  }
  function firstLine(text, max) {
    var s = String(text || '').split('\n').map(function (l) { return l.replace(/^\s*(##\s+|[-•*]\s+)/, '').trim(); }).filter(Boolean)[0] || '';
    return s.length > (max || 90) ? s.slice(0, (max || 90) - 1) + '…' : s;
  }
  function projectLinkCount(rel) { return rel.nodes.length + rel.tasks.length + rel.items.length + rel.external.length; }

  /** Строка проекта для списков (район/Обзор/собрание) — та же геометрия,
   *  что у фикстуры J1 «Проекты района». */
  function projectRow(p, rel, extraMeta) {
    var row = el('div', 'j-row j-row--link j-prow');
    row.setAttribute('role', 'link');
    row.setAttribute('tabindex', '0');
    var ico = el('div', 'j-row__ico j-row__ico--project');
    ico.innerHTML = svg(PICON.project);
    var body = el('div', 'j-row__body');
    var title = el('p', 'j-row__title');
    title.appendChild(el('b', isLockedRow(p) ? 'u-muted' : '', textOr(p, 'title')));
    if (isProtectedRow(p)) title.insertAdjacentHTML('beforeend', lockMark(p));
    body.appendChild(title);
    var meta = el('p', 'j-row__meta');
    var parts = [];
    if (extraMeta) parts.push(extraMeta);
    parts.push(projectStatusLabel(p));
    if (rel.progress.total) parts.push(t('j.project.tasks_meta').replace('%d', String(rel.progress.done)).replace('%d', String(rel.progress.total)));
    if (rel.nodes.length) parts.push(plural('j.project.nodes_count', rel.nodes.length));
    parts.forEach(function (txt, i) {
      if (i) meta.appendChild(el('span', 'j-dot', '·'));
      meta.appendChild(el('span', '', txt));
    });
    body.appendChild(meta);
    var end = el('div', 'j-row__end');
    var n = projectLinkCount(rel);
    if (n) {
      var tag = el('span', 'j-tag j-tag--link');
      tag.innerHTML = svg(PICON.link, 'width="12" height="12"');
      tag.appendChild(document.createTextNode(String(n)));
      end.appendChild(tag);
    }
    var chev = el('span', 'j-row__chev');
    chev.innerHTML = svg(ICON.chevron, 'width="18" height="18"');
    end.appendChild(chev);
    row.appendChild(ico); row.appendChild(body); row.appendChild(end);
    var go = function () { location.hash = CWJournalRoute.build.project(p.circuitId, p.id); };
    row.addEventListener('click', go);
    row.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return row;
  }
  async function renderProjectRows(box, list, metaFor) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < list.length; i++) {
      var rel = await CWJournal.projects.related(list[i].id);
      frag.appendChild(projectRow(list[i], rel, metaFor ? metaFor(list[i]) : null));
    }
    box.replaceChildren(frag);
  }

  /* Экран района: секция «Проекты района». */
  async function renderDistrictProjects(circuit) {
    var list = await CWJournal.projects.byCircuit(circuit.id);
    $('#districtProjectsCount').textContent = String(list.length);
    $('#districtNewProject').hidden = circuit.status === 'archived';
    $('#districtNewProject').onclick = function () { openProjectDialog({ circuitId: circuit.id }); };
    var box = $('#districtProjectsList');
    if (!list.length) {
      box.replaceChildren(el('p', 'j-sec__hint', t('j.project.empty_district')));
      return;
    }
    await renderProjectRows(box, list);
  }

  /* Обзор: реальный блок «Проекты района» — активные проекты всех районов
   * вне архивного контекста. Остальные блоки Обзора остаются фикстурой J1. */
  async function renderOverviewProjects() {
    var all = await CWJournal.projects.list();
    var circuits = {};
    (await CWJournal.nodes.byKind('circuit')).forEach(function (c) { circuits[c.id] = c; });
    var list = all.filter(function (p) { return p.status === 'active' && circuits[p.circuitId] && circuits[p.circuitId].status !== 'archived'; });
    if (parseHash().route !== 'overview') return;
    $('#overviewProjectsCount').textContent = String(list.length);
    var box = $('#overviewProjects');
    if (!list.length) { box.replaceChildren(el('p', 'j-sec__hint', t('j.project.empty_overview'))); return; }
    var many = Object.keys(circuits).length > 1;
    await renderProjectRows(box, list, many ? function (p) { return circuits[p.circuitId].label; } : null);
  }

  /* Собрание: «Связанные проекты района» — входящие связи проект → узел. */
  async function renderCongregationProjects(node) {
    var list = await CWJournal.projects.forTarget(CWJournal.urn.node(node.id));
    $('#congProjectsSec').hidden = !list.length;
    $('#congProjectsCount').textContent = String(list.length);
    await renderProjectRows($('#congProjectsList'), list);
  }

  /** Описание (plain text) → блоки для показа. */
  function bodyBlocks(text) {
    var blocks = [], cur = null;
    String(text || '').split('\n').forEach(function (line) {
      var m;
      if (!line.trim()) { cur = null; return; }
      if ((m = /^\s*##\s+(.*)$/.exec(line))) { blocks.push({ kind: 'heading2', text: m[1] }); cur = null; return; }
      if ((m = /^\s*[-•*]\s+(.*)$/.exec(line))) {
        if (!cur || cur.kind !== 'list') { cur = { kind: 'list', items: [] }; blocks.push(cur); }
        cur.items.push(m[1]);
        return;
      }
      if (cur && cur.kind === 'paragraph') { cur.text += '\n' + line; return; }
      cur = { kind: 'paragraph', text: line };
      blocks.push(cur);
    });
    return blocks;
  }
  function lineBounds(v, pos) {
    var ls = v.lastIndexOf('\n', pos - 1) + 1;
    var le = v.indexOf('\n', pos);
    return [ls, le < 0 ? v.length : le];
  }
  function lineFormat(v, pos) {
    var b = lineBounds(v, pos), line = v.slice(b[0], b[1]);
    return /^\s*##\s/.test(line) ? 'heading2' : /^\s*[-•*]\s/.test(line) ? 'list' : 'paragraph';
  }
  function applyLineFormat(ta, fmt) {
    var v = ta.value, b = lineBounds(v, ta.selectionStart);
    var line = v.slice(b[0], b[1]).replace(/^\s*(##\s+|[-•*]\s+)/, '');
    var prefix = fmt === 'heading2' ? '## ' : fmt === 'list' ? '- ' : '';
    ta.value = v.slice(0, b[0]) + prefix + line + v.slice(b[1]);
    var caret = b[0] + prefix.length + line.length;
    ta.setSelectionRange(caret, caret);
    projectUi.draft = ta.value;
    projectUi.fmt = fmt;
    syncProjectToolbar(true);
  }
  function syncProjectToolbar(editable) {
    $all('#projectEditor [data-pformat]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-pformat') === (projectUi.editing ? projectUi.fmt : 'paragraph'));
      b.disabled = !editable;
    });
    $all('#projectEditor [data-pcmd]').forEach(function (b) { b.disabled = !editable; });
  }

  function renderProjectBody(p, editable) {
    var box = $('#projectBody');
    box.replaceChildren();
    if (isLockedRow(p)) {
      // J8: текст зашифрован и ключа нет — только подпись и разблокировка.
      box.classList.remove('j-pbody--editable');
      box.removeAttribute('tabindex'); box.removeAttribute('role'); box.removeAttribute('aria-label');
      var panel = el('div', 'j-lockedpanel');
      panel.innerHTML = svg(ICON.lock, 'width="20" height="20"');
      panel.appendChild(el('span', '', lockedLabel(p)));
      if (!CWJournal.protection.isUnreadable(p)) {
        var ub = el('button', 'md-btn md-btn-tonal', t('j.prot.unlock'));
        ub.type = 'button';
        ub.addEventListener('click', function () { requestUnlock(); });
        panel.appendChild(ub);
      }
      box.appendChild(panel);
      return;
    }
    if (projectUi.editing && editable) {
      var wrap = el('div', 'j-block j-block--edit');
      var ta = el('textarea', 'j-block__input j-pbody__input');
      ta.rows = 6;
      ta.value = projectUi.draft;
      ta.setAttribute('aria-label', t('j.project.field_body'));
      ta.placeholder = t('j.project.body_placeholder');
      var syncFmt = function () { projectUi.fmt = lineFormat(ta.value, ta.selectionStart); syncProjectToolbar(true); };
      ta.addEventListener('input', function () { projectUi.draft = ta.value; syncFmt(); });
      ta.addEventListener('keyup', syncFmt);
      ta.addEventListener('click', syncFmt);
      wrap.appendChild(ta);
      if (projectUi.error) wrap.appendChild(el('p', 'j-dialog-error', projectUi.error));
      box.appendChild(wrap);
      var actions = el('div', 'j-block__actions');
      var save = el('button', 'md-btn md-btn-filled', t('j.action.save'));
      save.type = 'button';
      save.addEventListener('click', function () { saveProjectBody(p); });
      var cancel = el('button', 'md-btn md-btn-text', t('j.action.cancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', function () { projectUi.editing = false; projectUi.error = ''; refreshCurrentView(); });
      actions.appendChild(save); actions.appendChild(cancel);
      box.appendChild(actions);
      ta.focus();
      syncFmt();
      return;
    }
    var blocks = bodyBlocks(p.body);
    if (!blocks.length) {
      box.appendChild(el('p', 'j-editor__empty', t(editable ? 'j.project.body_empty' : 'j.project.body_empty_readonly')));
    }
    blocks.forEach(function (b) {
      var node = el('div', 'j-block j-block--' + b.kind);
      if (b.kind === 'list') {
        var ul = el('ul');
        b.items.forEach(function (it) { ul.appendChild(el('li', '', it)); });
        node.appendChild(ul);
      } else node.textContent = b.text;
      box.appendChild(node);
    });
    if (editable) {
      box.classList.add('j-pbody--editable');
      box.tabIndex = 0;
      box.setAttribute('role', 'button');
      box.setAttribute('aria-label', t('j.project.edit_body'));
    } else {
      box.classList.remove('j-pbody--editable');
      box.removeAttribute('tabindex'); box.removeAttribute('role'); box.removeAttribute('aria-label');
    }
  }
  function startProjectEdit(p, fmt) {
    if (projectUi.editing || projectUi.busy || p.status === 'archived') return;
    if (isLockedRow(p)) { requestUnlock(); return; }
    projectUi.editing = true;
    projectUi.prot = isProtectedRow(p);
    projectUi.draft = p.body || '';
    projectUi.error = '';
    projectUi.fmt = 'paragraph';
    renderProjectBody(p, true);
    if (fmt) applyLineFormat($('#projectBody textarea'), fmt);
  }
  async function saveProjectBody(p) {
    if (projectUi.busy) return;
    projectUi.busy = true;
    try {
      if ((p.body || '') !== projectUi.draft) await CWJournal.projects.update(p.id, { body: projectUi.draft });
      projectUi.editing = false;
      projectUi.error = '';
    } catch (err) { projectUi.error = errorMessage(err); }
    projectUi.busy = false;
    refreshCurrentView();
  }

  async function renderProjectDetail(circuitId, projectId) {
    // J8: перерисовку могут запросить двое сразу (операция + смена
    // блокировки). Каждый вызов — свой номер; после каждого ожидания
    // устаревший вызов выходит, DOM пишет только последний. Все ожидания —
    // до первой записи в DOM, дальше отрисовка синхронна.
    var mine = ++projectRenderSeq;
    var p = await CWJournal.projects.get(projectId);
    if (mine !== projectRenderSeq) return;
    if (!p || p.circuitId !== circuitId) { location.replace(CWJournalRoute.build.circuit(circuitId)); return; }
    var circuit = await CWJournal.nodes.get(circuitId);
    if (mine !== projectRenderSeq) return;
    if (!circuit || circuit.kind !== 'circuit') { location.replace('#districts'); return; }
    if (projectUi.id !== p.id) projectUi = { id: p.id, editing: false, draft: '', busy: false, error: '', fmt: 'paragraph' };
    var rel = await CWJournal.projects.related(p.id);
    var nodesAll = await CWJournal.nodes.byCircuit(circuitId);
    var mutables = await Promise.all(rel.tasks.map(function (x) { return CWJournal.tasks.isMutable(x.row.id); }));
    if (mine !== projectRenderSeq) return;
    var byId = {};
    nodesAll.forEach(function (n) { byId[n.id] = n; });
    var st = parseHash();
    if (st.projectId !== p.id) return; // пользователь уже ушёл с экрана

    var editable = p.status !== 'archived';
    // J8: без ключа текст защищённого не правится; статус/архив/связи —
    // метаданные и остаются доступны.
    var textEditable = editable && !isLockedRow(p);
    $('#projectCrumbCircuit').textContent = circuit.label;
    $('#projectCrumbCircuit').setAttribute('href', CWJournalRoute.build.circuit(circuitId));
    $('#projectCrumbEntries').setAttribute('href', CWJournalRoute.build.circuit(circuitId));
    $('#projectTitle').textContent = textOr(p, 'title');
    if (isProtectedRow(p)) $('#projectTitle').insertAdjacentHTML('beforeend', lockMark(p));
    $('#projectLede').textContent = t('j.project.kind') + ' · ' + t('j.project.created').replace('%s', dmy(p.createdAt))
      + ' · ' + t('j.project.changed').replace('%s', dayOrToday(p.updatedAt || p.createdAt));
    $('#projectStatusBadge').innerHTML = projectStatusHtml(p);
    $('#topbarContext').textContent = circuit.label;
    var ro = $('#projectReadonly');
    ro.hidden = editable;
    ro.textContent = editable ? '' : t('j.project.readonly');
    if (!textEditable) projectUi.editing = false;
    syncProjectToolbar(textEditable);
    renderProjectBody(p, textEditable);

    /* Задачи проекта: связанные todo, прогресс — выполненные / все. */
    $('#projectTasksCount').textContent = t('j.project.progress').replace('%d', String(rel.progress.done)).replace('%d', String(rel.progress.total));
    var tbox = $('#projectTasks');
    tbox.replaceChildren();
    if (!rel.tasks.length) tbox.appendChild(el('p', 'j-sec__hint', t('j.project.tasks_empty')));
    for (var i = 0; i < rel.tasks.length; i++) {
      (function (r, mutable) {
        var isDone = r.status === 'done';
        var line = el('div', 'j-check j-ptask' + (isDone ? ' j-check--done' : ''));
        var box = el('button', 'j-check__box');
        box.type = 'button';
        box.setAttribute('role', 'checkbox');
        box.setAttribute('aria-checked', String(isDone));
        box.setAttribute('aria-label', t('j.record.todo_toggle'));
        box.disabled = !mutable;
        box.addEventListener('click', function () {
          if (!mutable || projectUi.busy) return;
          runProjectOp(function () { return isDone ? CWJournal.tasks.reopen(r.id) : CWJournal.tasks.complete(r.id); });
        });
        var text = el('span', 'j-check__text j-ptask__text', textOr(r, 'body'));
        if (isProtectedRow(r)) text.insertAdjacentHTML('beforeend', lockMark(r));
        if (mutable) {
          text.setAttribute('role', 'button');
          text.tabIndex = 0;
          var edit = function () {
            if (isLockedRow(r)) { requestUnlock(); return; }
            openTaskDialog(r, { projectId: p.id, onDone: refreshCurrentView });
          };
          text.addEventListener('click', edit);
          text.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); edit(); } });
        }
        line.appendChild(box); line.appendChild(text);
        if (r.dueDate) {
          line.appendChild(el('span', 'md-status ' + (isDone ? 'md-status-normal' : 'md-status-important') + ' j-ptask__due',
            t('j.task.due_short').replace('%s', ddmm(r.dueDate))));
        }
        if (!mutable) line.appendChild(el('span', 'j-tag j-ptask__ro', t('j.task.readonly')));
        tbox.appendChild(line);
      })(rel.tasks[i].row, mutables[i]);
    }
    $('#projectAddTask').hidden = !editable;

    /* Связанные собрания/группы — имя из CWDirectory в памяти, иначе label. */
    $('#projectNodesCount').textContent = String(rel.nodes.length);
    var nbox = $('#projectNodes');
    nbox.replaceChildren();
    rel.nodes.forEach(function (x) {
      var n = x.node;
      var chip = el('button', 'md-chip j-pnode' + (n.status === 'archived' ? ' j-pnode--archived' : ''));
      chip.type = 'button';
      chip.innerHTML = svg(ICON[n.kind] || ICON.group, 'width="16" height="16"');
      chip.appendChild(el('span', '', nodeName(n)));
      var cong = n.kind === 'congregation' ? n : byId[n.parentId];
      chip.addEventListener('click', function () {
        if (cong && cong.kind === 'congregation') location.hash = CWJournalRoute.build.congregation(circuitId, cong.id);
      });
      nbox.appendChild(chip);
    });
    if (editable) {
      var add = el('button', 'md-chip j-pnode j-pnode--add');
      add.type = 'button';
      add.innerHTML = svg(PICON.plus, 'width="16" height="16"');
      add.appendChild(el('span', '', t('j.project.add_node')));
      add.addEventListener('click', function () { openProjectPicker(p, 'nodes'); });
      nbox.appendChild(add);
    }

    /* Связанные фрагменты: записи/посещения — по ссылке, с источником. */
    $('#projectItemsCount').textContent = String(rel.items.length + rel.external.length);
    var ibox = $('#projectItems');
    ibox.replaceChildren();
    if (!rel.items.length && !rel.external.length) ibox.appendChild(el('p', 'j-sec__hint j-pitems__empty', t('j.project.items_empty')));
    rel.items.forEach(function (x) { ibox.appendChild(projectItemRow(p, x, byId, editable)); });
    rel.external.forEach(function (x) {
      var row = el('div', 'j-row j-pitem');
      var ico = el('div', 'j-row__ico');
      ico.innerHTML = svg(PICON.link);
      var body = el('div', 'j-row__body');
      body.appendChild(el('p', 'j-row__title', t('j.project.external')));
      body.appendChild(el('p', 'j-row__meta', x.parsed.module + ' · ' + x.parsed.kind));
      row.appendChild(ico); row.appendChild(body);
      if (editable) row.appendChild(unlinkButton(p, x.link.to));
      ibox.appendChild(row);
    });

    renderProjectHistory(p, rel, byId);

    var sbtn = $('#projectStatusBtn');
    sbtn.hidden = !editable;
    sbtn.innerHTML = svg(p.status === 'completed' ? '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>' : PICON.check, 'width="18" height="18"');
    sbtn.appendChild(document.createTextNode(t(p.status === 'completed' ? 'j.project.reopen' : 'j.project.complete')));
    sbtn.onclick = function () {
      runProjectOp(function () { return p.status === 'completed' ? CWJournal.projects.reopen(p.id) : CWJournal.projects.complete(p.id); });
    };
    var abtn = $('#projectArchiveBtn');
    abtn.innerHTML = svg(ICON.archive, 'width="18" height="18"');
    abtn.appendChild(document.createTextNode(t(editable ? 'j.project.to_archive' : 'j.action.unarchive')));
    abtn.onclick = function () {
      runProjectOp(function () { return editable ? CWJournal.projects.archive(p.id) : CWJournal.projects.unarchive(p.id); });
    };
    wireProjectMenu(p);
  }

  function unlinkButton(p, ref) {
    var b = el('button', 'j-tag j-tag--link j-pitem__unlink');
    b.type = 'button';
    b.innerHTML = svg(PICON.link, 'width="12" height="12"');
    b.setAttribute('aria-label', t('j.project.unlink'));
    b.title = t('j.project.unlink');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!confirm(t('j.project.unlink_confirm'))) return;
      runProjectOp(function () { return CWJournal.projects.unlink(p.id, ref); });
    });
    return b;
  }

  function chainOf(byId, nodeId) {
    var out = [], cur = byId[nodeId], seen = {};
    while (cur && !seen[cur.id]) { seen[cur.id] = true; out.unshift(cur); cur = byId[cur.parentId]; }
    return out;
  }
  function recordKindLabel(r) { return t('j.project.item.' + (r.type === 'visit' ? 'visit' : r.type)); }

  function projectItemRow(p, x, byId, editable) {
    var r = x.row, v = x.visit;
    var chain = chainOf(byId, r.nodeId);
    var node = byId[r.nodeId];
    var row = el('div', 'j-row j-pitem');
    var ico = el('div', 'j-row__ico j-row__ico--project');
    ico.innerHTML = svg(r.type === 'visit' || v ? ICON.visit : PICON.note);
    var body = el('div', 'j-row__body j-pitem__open');
    body.setAttribute('role', 'link');
    body.tabIndex = 0;
    var title = el('p', 'j-row__title j-row__title--clamp');
    if (r.type === 'visit') title.textContent = capitalize(t('j.project.visit_title').replace('%s', seasonLabel(r.dateFrom)));
    else title.textContent = isLockedRow(r) ? lockedLabel(r) : '«' + firstLine(r.body, 160) + '»';
    body.appendChild(title);
    var meta = el('p', 'j-row__meta');
    var parts = [];
    if (node) parts.push(nodeName(node));
    if (r.type === 'visit') parts.push(formatRange(r.dateFrom, r.dateTo, true));
    else {
      if (v) parts.push(t('j.project.visit_meta').replace('%s', seasonLabel(v.dateFrom)));
      parts.push(recordKindLabel(r));
    }
    parts.forEach(function (txt, i) {
      if (i) meta.appendChild(el('span', 'j-dot', '·'));
      meta.appendChild(el('span', '', txt));
    });
    body.appendChild(meta);
    var end = el('div', 'j-row__end');
    if (editable) end.appendChild(unlinkButton(p, x.link.to));
    var chev = el('span', 'j-row__chev');
    chev.innerHTML = svg(ICON.chevron, 'width="18" height="18"');
    end.appendChild(chev);
    row.appendChild(ico); row.appendChild(body); row.appendChild(end);
    var go = function () { location.hash = destFor(r.type === 'visit' ? 'visit' : 'record', r, chain, v); };
    body.addEventListener('click', go);
    chev.addEventListener('click', go);
    body.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return row;
  }

  /** «История проекта» — производная лента: создание проекта, моменты
   *  связывания (createdAt строки связи), закрытие связанных задач, архив.
   *  Не журнал событий: снятая связь из ленты исчезает. Ничего не хранится. */
  function renderProjectHistory(p, rel, byId) {
    var ev = [];
    ev.push({ at: p.createdAt, text: t('j.project.hist.created') });
    if (p.status === 'archived' && p.archivedAt) ev.push({ at: p.archivedAt, text: t('j.project.hist.archived') });
    rel.nodes.forEach(function (x) { ev.push({ at: x.link.createdAt, text: t('j.project.hist.node').replace('%s', nodeName(x.node)) }); });
    rel.items.forEach(function (x) {
      var n = byId[x.row.nodeId];
      var name = n ? nodeName(n) : '';
      ev.push({ at: x.link.createdAt, text: t(x.row.type === 'visit' ? 'j.project.hist.visit' : 'j.project.hist.item').replace('%s', name) });
    });
    rel.tasks.forEach(function (x) {
      var name = isLockedRow(x.row) ? lockedLabel(x.row) : firstLine(x.row.body, 60);
      ev.push({ at: x.link.createdAt, text: t('j.project.hist.task_added').replace('%s', name) });
      if (x.row.status === 'done' && x.row.updatedAt) ev.push({ at: x.row.updatedAt, text: t('j.project.hist.task_done').replace('%s', name) });
    });
    ev = ev.filter(function (e) { return !!e.at; }).sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
    var shown = ev.slice(0, 6);
    if (ev.length > 6 && shown[shown.length - 1].text !== t('j.project.hist.created')) shown[5] = ev[ev.length - 1];
    var ul = $('#projectHistory');
    ul.replaceChildren();
    shown.forEach(function (e, i) {
      var li = el('li', i === 0 ? 'is-now' : '');
      li.appendChild(el('p', 'j-hist__t', e.text));
      li.appendChild(el('p', 'j-hist__m', whenText(e.at)));
      ul.appendChild(li);
    });
  }

  async function runProjectOp(fn) {
    if (projectUi.busy) return;
    projectUi.busy = true;
    try { await fn(); } catch (err) { alert(errorMessage(err)); }
    projectUi.busy = false;
    refreshCurrentView();
  }

  function wireProjectMenu(p) {
    var btn = $('#moreBtn');
    var panel = $('#moreMenuPanel');
    var items = '';
    var hidden = isLockedRow(p);
    if (p.status !== 'archived' && !hidden) {
      items += '<button type="button" class="md-menu__item" role="menuitem" data-action="rename">' + esc(t('j.action.rename')) + '</button>'
        + '<button type="button" class="md-menu__item" role="menuitem" data-action="edit-body">' + esc(t('j.project.edit_body')) + '</button>'
        + '<button type="button" class="md-menu__item" role="menuitem" data-action="link">' + esc(t('j.editor.link')) + '</button>';
    }
    // J8: защита — не в архиве (архивный проект только для чтения).
    if (hidden && !CWJournal.protection.isUnreadable(p)) {
      items += '<button type="button" class="md-menu__item" role="menuitem" data-action="unlock">' + esc(t('j.prot.unlock')) + '</button>';
    } else if (p.status !== 'archived' && !hidden) {
      items += '<button type="button" class="md-menu__item" role="menuitem" data-action="protect">'
        + esc(t(isProtectedRow(p) ? 'j.prot.unprotect' : 'j.prot.protect')) + '</button>';
    }
    items += '<button type="button" class="md-menu__item" role="menuitem" data-action="delete">' + esc(t('j.action.delete')) + '</button>';
    panel.innerHTML = items;
    btn.setAttribute('data-i18n-aria-label', 'j.project.menu');
    btn.setAttribute('aria-label', t('j.project.menu'));
    var freshBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(freshBtn, btn);
    wireMenuToggle(freshBtn, panel);
    panel.querySelectorAll('.md-menu__item').forEach(function (it) {
      it.onclick = function () {
        panel.hidden = true;
        var a = it.getAttribute('data-action');
        if (a === 'rename') openProjectDialog({ project: p });
        else if (a === 'edit-body') startProjectEdit(p);
        else if (a === 'link') openProjectPicker(p, 'all');
        else if (a === 'unlock') requestUnlock();
        else if (a === 'protect') toggleProtection(p).then(function () { refreshCurrentView(); });
        else if (a === 'delete') {
          if (!confirm(t('j.confirm.delete').replace('%s', textOr(p, 'title')))) return;
          CWJournal.projects.remove(p.id).then(function () {
            location.hash = CWJournalRoute.build.circuit(p.circuitId);
          }, function (err) { alert(errorMessage(err)); });
        }
      };
    });
  }

  function wireProjectChrome() {
    $('#projectBody').addEventListener('click', function (e) {
      if (e.target.closest('button, textarea, select, .j-block__actions')) return;
      var st = parseHash();
      if (!st.projectId || projectUi.editing) return;
      CWJournal.projects.get(st.projectId).then(function (p) { if (p) startProjectEdit(p); });
    });
    $('#projectBody').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || projectUi.editing || e.target !== $('#projectBody')) return;
      e.preventDefault();
      $('#projectBody').click();
    });
    $all('#projectEditor [data-pformat]').forEach(function (b) {
      b.addEventListener('click', function () {
        var fmt = b.getAttribute('data-pformat');
        var ta = $('#projectBody textarea');
        if (ta) { applyLineFormat(ta, fmt); ta.focus(); return; }
        var st = parseHash();
        CWJournal.projects.get(st.projectId).then(function (p) { if (p) startProjectEdit(p, fmt); });
      });
    });
    $all('#projectEditor [data-pcmd]').forEach(function (b) {
      b.addEventListener('click', function () {
        var st = parseHash();
        CWJournal.projects.get(st.projectId).then(function (p) {
          if (!p || p.status === 'archived') return;
          if (b.getAttribute('data-pcmd') === 'task') openTaskDialog(null, { projectId: p.id, onDone: refreshCurrentView });
          else openProjectPicker(p, 'all');
        });
      });
    });
    $('#projectAddTask').addEventListener('click', function () {
      var st = parseHash();
      if (st.projectId) openTaskDialog(null, { projectId: st.projectId, onDone: refreshCurrentView });
    });
  }

  /** Создание (opts.circuitId) или переименование (opts.project). */
  function openProjectDialog(opts) {
    var dlg = $('#projectDialog');
    var form = $('#projectDialogForm');
    var name = $('#projectDialogName');
    var body = $('#projectDialogBody');
    var errEl = $('#projectDialogError');
    var editing = !!opts.project;
    var busy = false;
    $('#projectDialogTitle').textContent = t(editing ? 'j.project.rename' : 'j.project.new');
    $('#projectDialogBodyField').hidden = editing;
    name.value = editing ? opts.project.title : '';
    body.value = '';
    errEl.hidden = true;
    dlg.showModal();
    name.focus();
    function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }
    async function onSubmit(e) {
      e.preventDefault();
      if (busy) return;
      if (!name.value.trim()) { showError(t('j.error.project_title')); name.focus(); return; }
      busy = true;
      var newId = null;
      try {
        if (editing) {
          if (name.value !== opts.project.title) await CWJournal.projects.update(opts.project.id, { title: name.value });
        } else {
          newId = await CWJournal.projects.add({ circuitId: opts.circuitId, title: name.value, body: body.value });
        }
      } catch (err) { busy = false; showError(errorMessage(err)); return; }
      busy = false;
      cleanup(); dlg.close();
      if (newId) location.hash = CWJournalRoute.build.project(opts.circuitId, newId);
      else refreshCurrentView();
    }
    function onCancel() { cleanup(); dlg.close(); }
    var unbindClose;
    function cleanup() {
      form.removeEventListener('submit', onSubmit);
      $('#projectDialogCancel').removeEventListener('click', onCancel);
      if (unbindClose) unbindClose();
    }
    form.addEventListener('submit', onSubmit);
    $('#projectDialogCancel').addEventListener('click', onCancel);
    unbindClose = bindDialogCleanup(dlg, cleanup);
  }

  /* ═══ Выбор для связи (J7) ═══════════════════════════════════════════════
   * Один диалог: список строится заново из базы при открытии и после
   * каждого переключения (истина — journalLinks, не состояние экрана).
   * Фильтр — только в памяти диалога. Повторный клик во время записи
   * игнорируется; повтор связи всё равно не создаёт второй строки. */
  function openPickDialog(opts) {
    var dlg = $('#pickDialog');
    var list = $('#pickDialogList');
    var search = $('#pickDialogSearch');
    var errEl = $('#pickDialogError');
    var busy = false, sections = [];
    $('#pickDialogTitle').textContent = opts.title;
    $('#pickDialogHint').textContent = opts.hint || '';
    $('#pickDialogHint').hidden = !opts.hint;
    search.value = '';
    errEl.hidden = true;
    function draw() {
      var q = CWJournal.search.normalizeQuery(search.value);
      var frag = document.createDocumentFragment();
      var shown = 0;
      sections.forEach(function (sec) {
        var items = sec.items.filter(function (it) { return !q || CWJournal.search.fold(it.label + ' ' + (it.meta || '')).indexOf(q) >= 0; });
        if (!items.length) return;
        frag.appendChild(el('p', 'j-kicker j-pick__sec', sec.title));
        items.forEach(function (it) {
          shown++;
          var row = el('button', 'j-pick__row' + (it.checked ? ' is-on' : ''));
          row.type = 'button';
          row.setAttribute('role', 'checkbox');
          row.setAttribute('aria-checked', String(!!it.checked));
          row.disabled = !!it.disabled;
          var box = el('span', 'j-check__box j-pick__box');
          box.setAttribute('aria-hidden', 'true');
          if (it.checked) box.innerHTML = svg(PICON.check, 'width="14" height="14"');
          var txt = el('span', 'j-pick__txt');
          txt.appendChild(el('span', 'j-pick__label', it.label));
          if (it.meta) txt.appendChild(el('span', 'j-pick__meta', it.meta));
          row.appendChild(box); row.appendChild(txt);
          row.addEventListener('click', async function () {
            if (busy || it.disabled) return;
            busy = true;
            errEl.hidden = true;
            try { await opts.toggle(it, !it.checked); }
            catch (err) { errEl.textContent = errorMessage(err); errEl.hidden = false; }
            try { sections = await opts.load(); } catch (_) { /* прежний список */ }
            busy = false;
            draw();
          });
          frag.appendChild(row);
        });
      });
      if (!shown) frag.appendChild(el('p', 'j-sec__hint', t(q ? 'j.search.none_title' : 'j.project.pick_empty')));
      list.replaceChildren(frag);
    }
    function onInput() { draw(); }
    function onDone() { dlg.close(); }
    var unbindClose;
    function cleanup() {
      search.removeEventListener('input', onInput);
      $('#pickDialogDone').removeEventListener('click', onDone);
      list.replaceChildren();
      search.value = '';
      if (unbindClose) unbindClose();
      if (opts.onClose) opts.onClose();
    }
    search.addEventListener('input', onInput);
    $('#pickDialogDone').addEventListener('click', onDone);
    unbindClose = bindDialogCleanup(dlg, cleanup);
    list.replaceChildren(el('p', 'j-sec__hint', '…'));
    dlg.showModal();
    opts.load().then(function (s) { sections = s; draw(); }, function (err) { errEl.textContent = errorMessage(err); errEl.hidden = false; });
  }

  /** Кандидаты для проекта: только тот же район (граница — и в слое данных). */
  function openProjectPicker(p, mode) {
    openPickDialog({
      title: t(mode === 'nodes' ? 'j.project.pick_nodes' : 'j.project.pick_title'),
      hint: t('j.project.pick_hint'),
      load: async function () {
        var linked = {};
        (await CWJournal.projects.links(p.id)).forEach(function (l) { linked[l.to] = true; });
        var nodes = await CWJournal.nodes.byCircuit(p.circuitId);
        var byId = {};
        nodes.forEach(function (n) { byId[n.id] = n; });
        var secNodes = { title: t('j.project.pick_sec_nodes'), items: [] };
        CWJournal.sortNodes(nodes).forEach(function (n) {
          if (CWJournal.projects.NODE_TARGETS.indexOf(n.kind) === -1) return;
          var ref = CWJournal.urn.node(n.id);
          if (n.status === 'archived' && !linked[ref]) return;
          var parent = byId[n.parentId];
          secNodes.items.push({ ref: ref, label: nodeName(n),
            meta: t('j.search.kind.' + n.kind) + (n.kind !== 'congregation' && parent ? ' · ' + nodeName(parent) : ''), checked: !!linked[ref] });
        });
        secNodes.items.sort(function (a, b) { return a.label.localeCompare(b.label); });
        if (mode === 'nodes') return [secNodes];
        var entries = await CWJournal.entries.byCircuit(p.circuitId);
        var visitById = {};
        entries.forEach(function (e) { if (e.type === 'visit') visitById[e.id] = e; });
        var secVisits = { title: t('j.project.pick_sec_visits'), items: [] };
        var secRecords = { title: t('j.project.pick_sec_records'), items: [] };
        var secTasks = { title: t('j.project.pick_sec_tasks'), items: [] };
        entries.forEach(function (e) {
          if (CWJournal.projects.ENTRY_TARGETS.indexOf(e.type) === -1) return;
          var ref = CWJournal.urn.entry(e.id);
          var n = byId[e.nodeId];
          var where = n ? nodeName(n) : '';
          if (e.type === 'visit') {
            if (e.status === 'archived' && !linked[ref]) return;
            secVisits.items.push({ ref: ref, sort: e.dateFrom, label: capitalize(seasonLabel(e.dateFrom)) + ' · ' + where,
              meta: formatRange(e.dateFrom, e.dateTo, true) + (e.status !== 'open' ? ' · ' + t('j.project.pick_readonly') : ''),
              checked: !!linked[ref], disabled: e.status !== 'open' });
            return;
          }
          var v = e.fields && e.fields.visitId ? visitById[e.fields.visitId] : null;
          var ro = !!(v && v.status !== 'open');
          if (v && v.status === 'archived' && !linked[ref]) return;
          var meta = where + (v ? ' · ' + seasonLabel(v.dateFrom) : '') + ' · ' + recordKindLabel(e) + (ro ? ' · ' + t('j.project.pick_readonly') : '');
          // J8: заблокированная защищённая — подписью (связь текста не несёт).
          var item = { ref: ref, sort: e.updatedAt || '', label: isLockedRow(e) ? lockedLabel(e) : firstLine(e.body, 90), meta: meta, checked: !!linked[ref], disabled: ro };
          (e.type === 'todo' ? secTasks : secRecords).items.push(item);
        });
        [secVisits, secRecords, secTasks].forEach(function (s) { s.items.sort(function (a, b) { return a.sort < b.sort ? 1 : a.sort > b.sort ? -1 : 0; }); });
        return [secNodes, secVisits, secRecords, secTasks];
      },
      toggle: function (it, on) { return on ? CWJournal.projects.link(p.id, it.ref) : CWJournal.projects.unlink(p.id, it.ref); },
      onClose: refreshCurrentView,
    });
  }

  /** «Связать» в редакторе посещения: проекты района для выбранной
   *  сохранённой записи. Правило «только в открытом посещении» держит
   *  CWJournal (journal-visit-readonly), не только эта кнопка. */
  function openRecordProjectPicker(recordId) {
    var visit = currentEditorVisit();
    if (!visit) return;
    var ref = CWJournal.urn.entry(recordId);
    openPickDialog({
      title: t('j.project.pick_projects'),
      hint: t('j.project.pick_projects_hint'),
      load: async function () {
        var linked = {};
        (await CWJournal.projects.forTarget(ref)).forEach(function (p) { linked[p.id] = true; });
        var items = [];
        (await CWJournal.projects.byCircuit(visit.circuitId)).forEach(function (p) {
          if (p.status !== 'active' && !linked[p.id]) return;
          items.push({ id: p.id, label: textOr(p, 'title'), meta: projectStatusLabel(p), checked: !!linked[p.id], disabled: p.status === 'archived' });
        });
        return [{ title: t('j.section.projects'), items: items }];
      },
      toggle: function (it, on) { return on ? CWJournal.projects.link(it.id, ref) : CWJournal.projects.unlink(it.id, ref); },
      onClose: function () { renderVisitRecords(); },
    });
  }

  /** J8: при блокировке черновик описания защищённого проекта уходит. */
  function forgetProjectProtectedDraft() {
    if (!projectUi.prot) return;
    projectUi.editing = false;
    projectUi.draft = '';
    projectUi.prot = false;
  }

  /* Публикация для других файлов Журнала. */
  A.forgetProjectProtectedDraft = forgetProjectProtectedDraft;
  A.openRecordProjectPicker = openRecordProjectPicker;
  A.renderCongregationProjects = renderCongregationProjects;
  A.renderDistrictProjects = renderDistrictProjects;
  A.renderOverviewProjects = renderOverviewProjects;
  A.renderProjectDetail = renderProjectDetail;
  A.wireProjectChrome = wireProjectChrome;
})();
