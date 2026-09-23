/** Журнал — районы и собрания: списки, карточки, справочник, расписание, меню. */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  /* Общие константы других файлов (объекты неизменяемы по смыслу). */
  var ICON = A.ICON;

  /* Функции других файлов — позднее связывание через CWJournalApp. */
  function $() { return A.$.apply(this, arguments); }
  function $all() { return A.$all.apply(this, arguments); }
  function bindDialogCleanup() { return A.bindDialogCleanup.apply(this, arguments); }
  function el() { return A.el.apply(this, arguments); }
  function errorMessage() { return A.errorMessage.apply(this, arguments); }
  function esc() { return A.esc.apply(this, arguments); }
  function isDirectoryReady() { return A.isDirectoryReady.apply(this, arguments); }
  function openTaskDialog() { return A.openTaskDialog.apply(this, arguments); }
  function openVisitDialog() { return A.openVisitDialog.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function refreshCurrentView() { return A.refreshCurrentView.apply(this, arguments); }
  function renderCongregationProjects() { return A.renderCongregationProjects.apply(this, arguments); }
  function renderCongregationVisits() { return A.renderCongregationVisits.apply(this, arguments); }
  function renderDistrictProjects() { return A.renderDistrictProjects.apply(this, arguments); }
  function svg() { return A.svg.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }
  function todayIso() { return A.todayIso.apply(this, arguments); }
  function wireMenuToggle() { return A.wireMenuToggle.apply(this, arguments); }


  function openNodeDialog(opts) {
    var dlg = $('#nodeDialog');
    var input = $('#nodeDialogLabel');
    $('#nodeDialogTitle').textContent = opts.title;
    input.value = opts.initialValue || '';
    dlg.showModal();
    input.focus();
    input.select();

    var unbindClose;
    function onSubmit(e) {
      e.preventDefault();
      var value = input.value.trim();
      if (!value) { input.focus(); return; }
      cleanup();
      dlg.close();
      opts.onSave(value);
    }
    function onCancel() { cleanup(); dlg.close(); }
    function cleanup() {
      form.removeEventListener('submit', onSubmit);
      $('#nodeDialogCancel').removeEventListener('click', onCancel);
      if (unbindClose) unbindClose();
    }
    var form = $('#nodeDialogForm');
    form.addEventListener('submit', onSubmit);
    $('#nodeDialogCancel').addEventListener('click', onCancel);
    unbindClose = bindDialogCleanup(dlg, cleanup);
  }

  /* ═══ Список районов ═══════════════════════════════════════════════════ */
  async function renderCircuitsList() {
    var body = $('#circuitsListBody');
    var all = (await CWJournal.nodes.byParent(CWJournal.ROOT_PARENT)).filter(function (n) { return n.kind === 'circuit'; });
    var active = CWJournal.sortNodes(all.filter(function (n) { return n.status !== 'archived'; }));
    var archived = CWJournal.sortNodes(all.filter(function (n) { return n.status === 'archived'; }));
    var ordered = active.concat(archived);

    if (!ordered.length) {
      body.innerHTML =
        '<div class="md-emptystate">' +
        '<div class="md-emptystate__icon" aria-hidden="true">' + svg(ICON.circuit, 'width="32" height="32"') + '</div>' +
        '<p class="md-emptystate__title">' + esc(t('j.empty.circuits_title')) + '</p>' +
        '<p class="md-emptystate__text">' + esc(t('j.empty.circuits_text')) + '</p>' +
        '<button type="button" class="md-btn md-btn-filled" id="emptyCreateCircuit">' + esc(t('j.fab.new_circuit')) + '</button>' +
        '</div>';
      $('#emptyCreateCircuit').addEventListener('click', function () { runAction('new-circuit'); });
      return;
    }

    body.innerHTML = '<div class="j-sec" id="circuitsSec"></div>';
    var sec = $('#circuitsSec');
    ordered.forEach(function (node, i) {
      var row = document.createElement('div');
      row.className = 'j-row j-row--link';
      row.dataset.nodeId = node.id;
      var archivedRow = node.status === 'archived';
      row.innerHTML =
        '<div class="j-row__ico">' + svg(ICON.circuit) + '</div>' +
        '<div class="j-row__body">' +
        '<p class="j-row__title">' + (archivedRow ? '<span class="u-muted">' + esc(node.label) + '</span>' : esc(node.label)) + '</p>' +
        '<p class="j-row__meta">' + (archivedRow ? esc(t('j.badge.archive')) : esc(t('j.state.no_visit_yet'))) + '</p>' +
        '</div>' +
        '<div class="j-row__end">' + rowMenuMarkup('circuit', node, i, ordered.length) + '</div>';
      row.querySelector('.j-row__body').addEventListener('click', function () {
        location.hash = '#districts/' + encodeURIComponent(node.id);
      });
      sec.appendChild(row);
      wireRowMenu(row, node);
    });
  }

  /* Меню действий строки — теперь единственный видимый элемент справа это
     обычный шеврон (как в эталоне 02-district-m.jpg); все действия, включая
     порядок, лежат в его выпадающем меню, а не постоянными кнопками рядом. */
  function rowMenuMarkup(kind, node, index, siblingCount) {
    var items = '';
    if (index > 0) {
      items += '<button type="button" class="md-menu__item" role="menuitem" data-action="move-up">' + esc(t('j.action.move_up')) + '</button>';
    }
    if (index < siblingCount - 1) {
      items += '<button type="button" class="md-menu__item" role="menuitem" data-action="move-down">' + esc(t('j.action.move_down')) + '</button>';
    }
    items += '<button type="button" class="md-menu__item" role="menuitem" data-action="rename">' + esc(t('j.action.rename')) + '</button>';
    if (kind === 'congregation') {
      items += '<button type="button" class="md-menu__item" role="menuitem" data-action="add-group">' + esc(t('j.action.add_group')) + '</button>'
        + '<button type="button" class="md-menu__item" role="menuitem" data-action="add-pregroup">' + esc(t('j.action.add_pregroup')) + '</button>';
    }
    var archiveLabel = node.status === 'archived' ? t('j.action.unarchive') : t('j.action.archive');
    items += '<button type="button" class="md-menu__item" role="menuitem" data-action="toggle-archive">' + esc(archiveLabel) + '</button>'
      + '<button type="button" class="md-menu__item" role="menuitem" data-action="delete">' + esc(t('j.action.delete')) + '</button>';
    return (
      '<div class="md-menu">' +
      '<button type="button" class="j-row__chevronbtn" aria-label="' + esc(t('j.action.row_menu')) + '">' + svg(ICON.chevron, 'width="18" height="18"') + '</button>' +
      '<div class="md-menu__panel" role="menu" hidden>' + items + '</div>' +
      '</div>'
    );
  }

  function wireRowMenu(row, node) {
    var menuBtn = row.querySelector('.md-menu > .j-row__chevronbtn');
    var panel = row.querySelector('.md-menu__panel');
    wireMenuToggle(menuBtn, panel);
    row.querySelectorAll('.md-menu__item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        panel.hidden = true;
        handleRowAction(el.dataset.action, node);
      });
    });
  }

  /* ═══ Действия над узлом (общие для района/собрания/группы) ═══════════ */
  async function handleRowAction(action, node) {
    try {
      if (action === 'rename') {
        renameNode(node);
        return;
      }
      if (action === 'toggle-archive') {
        await (node.status === 'archived' ? CWJournal.nodes.unarchive(node.id) : CWJournal.nodes.archive(node.id));
        refreshCurrentView();
        return;
      }
      if (action === 'delete') {
        if (!confirm(t('j.confirm.delete').replace('%s', node.label))) return;
        await CWJournal.nodes.remove(node.id);
        // J3a safe-delete прошёл первым (throw выше отменил бы это); только
        // ПОТОМ решаем судьбу общей записи справочника — спецификация п.1D.
        if (node.communityId) await releaseSourceIfUnused(node.communityId, node.id);
        refreshCurrentView();
        return;
      }
      if (action === 'add-group' || action === 'add-pregroup') {
        var kind = action === 'add-group' ? 'group' : 'pregroup';
        openNodeDialog({
          title: t(kind === 'group' ? 'j.dialog.new_group' : 'j.dialog.new_pregroup'),
          initialValue: '',
          onSave: async function (value) {
            await CWJournal.nodes.add({ kind: kind, parentId: node.id, label: value });
            refreshCurrentView();
          },
        });
        return;
      }
      if (action === 'move-up' || action === 'move-down') {
        await moveSibling(node, action === 'move-up' ? -1 : 1);
        refreshCurrentView();
        return;
      }
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  /** Обмен `sort` с соседом в направлении dir (-1 вверх, +1 вниз). */
  async function moveSibling(node, dir) {
    var siblings = CWJournal.sortNodes(await CWJournal.nodes.byParent(node.parentId));
    var idx = siblings.findIndex(function (n) { return n.id === node.id; });
    var otherIdx = idx + dir;
    if (idx < 0 || otherIdx < 0 || otherIdx >= siblings.length) return;
    var a = siblings[idx], b = siblings[otherIdx];
    var sortA = typeof a.sort === 'number' ? a.sort : idx;
    var sortB = typeof b.sort === 'number' ? b.sort : otherIdx;
    await CWJournal.nodes.update(a.id, { sort: sortB });
    await CWJournal.nodes.update(b.id, { sort: sortA });
  }

  /* ═══ Экран одного района ═══════════════════════════════════════════════ */
  async function renderDistrictDetail(circuitId) {
    var circuit = await CWJournal.nodes.get(circuitId);
    if (!circuit || circuit.kind !== 'circuit') {
      location.hash = '#districts';
      return;
    }

    $('#districtCrumbLabel').textContent = circuit.label;
    $('#districtTitle').textContent = circuit.label;

    var congregations = CWJournal.sortNodes(
      (await CWJournal.nodes.byParent(circuitId)).filter(function (n) { return n.kind === 'congregation'; })
    );
    var activeCount = congregations.filter(function (n) { return n.status !== 'archived'; }).length;
    $('#districtCounts').textContent = ' + ' + activeCount + ' ' + t('j.unit.congregations');

    // Карточка «Записи уровня района» — честные реальные счётчики; проекты
    // района (J7) — отдельной секцией ниже.
    var entryCounts = { project: 0, note: 0, todo: 0, question: 0 };
    (await CWJournal.entries.byCircuit(circuitId)).forEach(function (e) {
      if (e.nodeId === circuitId && entryCounts[e.type] !== undefined) entryCounts[e.type]++;
    });
    $('#districtEntryChips').innerHTML =
      chip(ICON.circuit, entryCounts.project + ' ' + esc(t('j.unit.projects'))) +
      chip('<path d="M14 3v5h5"/><path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z"/><path d="M9 13h6M9 17h4"/>', entryCounts.note + ' ' + esc(t('j.unit.notes'))) +
      chip('<path d="m3 8 3 3 5-5"/><path d="m3 17 3 3 5-5"/><path d="M14 8h7M14 18h7"/>', entryCounts.todo + ' ' + esc(t('j.unit.tasks'))) +
      chip('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>', entryCounts.question + ' ' + esc(t('j.unit.questions')));

    $('#congregationsCount').textContent = String(congregations.length);
    await renderDistrictProjects(circuit);

    var tree = $('#congregationsTree');
    tree.innerHTML = '';
    if (!congregations.length) {
      tree.innerHTML =
        '<div class="md-emptystate">' +
        '<div class="md-emptystate__icon" aria-hidden="true">' + svg(ICON.congregation, 'width="32" height="32"') + '</div>' +
        '<p class="md-emptystate__title">' + esc(t('j.empty.congregations_title')) + '</p>' +
        '<p class="md-emptystate__text">' + esc(t('j.empty.congregations_text')) + '</p>' +
        '</div>';
    } else {
      for (var i = 0; i < congregations.length; i++) {
        await renderCongregationRow(tree, congregations[i], i, congregations.length);
      }
    }

    wireCircuitMenu(circuit);
  }

  /** label должен прийти уже безопасным (esc(t(...)) на месте вызова) —
   *  сам chip() больше не экранирует, иначе перевод внутри неё удвоил бы
   *  экранирование (см. check-i18n-html.mjs: обёртка засчитывается только
   *  на вызове esc/escapeHtml/tEsc, а не на произвольном хелпере). */
  function chip(paths, safeLabel) {
    return '<span class="md-chip">' + svg(paths, 'width="16" height="16"') + safeLabel + '</span>';
  }

  /** Каноническое отображаемое имя собрания: CWDirectory.name, когда связь
   *  разрешилась, иначе локальный label узла (spec п.2 — оба места,
   *  district-строка и congregation-заголовок/крошка, используют ЭТУ ЖЕ
   *  функцию, не два разных источника истины). directoryReady=false — то
   *  же самое, что «пока не знаем»: не подменяем label раньше времени. */
  function canonicalName(node) {
    if (isDirectoryReady() && node.communityId) {
      var record = CWDirectory.get(node.communityId);
      if (record && record.name) return record.name;
    }
    return node.label;
  }

  async function renderCongregationRow(container, node, index, siblingCount) {
    var archived = node.status === 'archived';
    var displayLabel = canonicalName(node);
    var row = document.createElement('div');
    row.className = 'j-row';
    row.innerHTML =
      '<div class="j-row__ico">' + svg(ICON.congregation) + '</div>' +
      '<div class="j-row__body">' +
      '<p class="j-row__title">' + (archived ? '<span class="u-muted">' + esc(displayLabel) + '</span>' : '<b>' + esc(displayLabel) + '</b>') + '</p>' +
      '<p class="j-row__meta">' + (archived ? esc(t('j.badge.archive')) : esc(t('j.state.no_visit_yet'))) + '</p>' +
      '</div>' +
      '<div class="j-row__end">' + rowMenuMarkup('congregation', node, index, siblingCount) + '</div>';
    container.appendChild(row);
    wireRowMenu(row, node);
    row.querySelector('.j-row__body').addEventListener('click', function () {
      location.hash = '#districts/' + encodeURIComponent(node.circuitId) + '/congregation/' + encodeURIComponent(node.id);
    });

    var children = CWJournal.sortNodes(await CWJournal.nodes.byParent(node.id));
    if (children.length) {
      var wrap = document.createElement('div');
      wrap.className = 'j-tree__child';
      container.appendChild(wrap);
      children.forEach(function (child, ci) {
        var cArchived = child.status === 'archived';
        var crow = document.createElement('div');
        crow.className = 'j-row';
        crow.innerHTML =
          '<div class="j-row__ico">' + svg(ICON[child.kind] || ICON.group) + '</div>' +
          '<div class="j-row__body">' +
          '<p class="j-row__title">' + (cArchived ? '<span class="u-muted">' + esc(child.label) + '</span>' : esc(child.label)) + '</p>' +
          '<p class="j-row__meta">' + (cArchived ? esc(t('j.badge.archive')) : esc(t('j.state.no_visit_yet'))) + '</p>' +
          '</div>' +
          '<div class="j-row__end">' + rowMenuMarkup(child.kind, child, ci, children.length) + '</div>';
        wrap.appendChild(crow);
        wireRowMenu(crow, child);
      });
    }
  }

  /** Сколько узлов Журнала (кроме исключённого) всё ещё ссылаются на
   *  communityId — нужен для «отпускать 'journal' только если это была
   *  последняя ссылка» (relink и удаление, см. spec п.1). */
  async function countJournalRefs(communityId, excludeNodeId) {
    if (!communityId) return 0;
    var all = await CWJournal.nodes.getAll();
    return all.filter(function (n) {
      return n.kind === 'congregation' && n.communityId === communityId && n.id !== excludeNodeId;
    }).length;
  }

  /**
   * Единая точка связывания узла Журнала с записью справочника — покрывает
   * link/relink/create→link из spec п.1(A/B/C). Всегда идёт через
   * CWDirectory.attach()/detach(), никогда не пишет raw CWDB.
   *
   * @param {Object} node — текущий узел Журнала (ДО обновления)
   * @param {string} newCommunityId — куда связываем
   * @returns {Promise<{ok:boolean}>}
   */
  async function claimAndLink(node, newCommunityId) {
    var oldCommunityId = node.communityId || null;

    // A/B шаг 1: заявить НОВУЮ запись за 'journal' ПЕРЕД записью на узел —
    // так порядок из spec п.1B («claim the new record first»).
    var claimed = await Promise.resolve(CWDirectory.attach(newCommunityId, 'journal'));
    if (!claimed) return { ok: false }; // новой записи нет/отказ — узел не трогаем

    // Шаг 2: сохранить communityId на узле.
    try {
      await CWJournal.nodes.update(node.id, { communityId: newCommunityId });
    } catch (e) {
      // C: claim прошёл, update узла упал — компенсировать НУЖНО ТОЛЬКО
      // то, что именно ЭТА попытка добавила заново. Если newCommunityId
      // совпадает со старым communityId узла (переcвязывание с той же
      // записью, повторная попытка после отказа и т.п.), 'journal' был
      // легитимным источником ДО этой попытки — attach() выше был
      // идемпотентным no-op (см. CWDirectory.attach), а не новой заявкой,
      // и releaseSourceIfUnused здесь исключил бы САМ узел из подсчёта
      // (excludeNodeId=node.id), ошибочно увидел 0 ссылок и отцепил бы
      // источник, который узел всё ещё легитимно держит (его communityId
      // в БД не менялся — update() ведь упал). Поэтому: компенсация вообще
      // не запускается, когда новая запись — та же, что была уже
      // легитимно связана (spec-3, п.4).
      if (newCommunityId !== oldCommunityId) {
        await releaseSourceIfUnused(newCommunityId, node.id);
      }
      return { ok: false };
    }

    // B/D-симметрия: если это relink (была старая запись, отличная от
    // новой) — отпустить старую, если её больше никто из Журнала не держит.
    if (oldCommunityId && oldCommunityId !== newCommunityId) {
      await releaseSourceIfUnused(oldCommunityId, node.id);
    }
    return { ok: true };
  }

  /** Отпустить 'journal' от communityId, только если ни один ДРУГОЙ узел
   *  Журнала (кроме excludeNodeId, который уже меняет/потерял ссылку) на
   *  него не ссылается. excludeNodeId передаётся, потому что на момент
   *  вызова сам узел мог уже быть обновлён/удалён — считать его
   *  «отпущенным» самим собой. */
  async function releaseSourceIfUnused(communityId, excludeNodeId) {
    if (!communityId) return;
    var stillUsed = await countJournalRefs(communityId, excludeNodeId);
    if (stillUsed > 0) return; // другой узел Журнала всё ещё держит эту запись
    await Promise.resolve(CWDirectory.detach(communityId, 'journal'));
  }

  async function renderCongregationDetail(circuitId, nodeId) {
    var node = await CWJournal.nodes.get(nodeId);
    if (!node || node.kind !== 'congregation' || node.circuitId !== circuitId) {
      location.hash = '#districts/' + encodeURIComponent(circuitId);
      return;
    }
    var circuit = await CWJournal.nodes.get(circuitId);
    if (!circuit) { location.hash = '#districts'; return; }

    $('#congCrumbCircuit').textContent = circuit.label;
    $('#congCrumbCircuit').onclick = function (e) {
      e.preventDefault();
      location.hash = '#districts/' + encodeURIComponent(circuitId);
    };
    var displayName = canonicalName(node);
    $('#congCrumbLabel').textContent = displayName;

    var directoryRecord = (isDirectoryReady() && node.communityId) ? CWDirectory.get(node.communityId) : null;
    $('#congTitle').textContent = displayName;

    var childCount = (await CWJournal.nodes.byParent(node.id)).filter(function (n) { return n.status !== 'archived'; }).length;
    $('#congMeta').textContent = t('j.identity.title') + ' · ' + t('j.unit.groups_count').replace('%d', childCount);

    renderIdentityCard(node, directoryRecord);

    // Дочерние группы/предгруппы — переиспользуем разметку/обработчики J3a,
    // просто в контейнере congChildrenTree вместо congregationsTree.
    var childrenWrap = $('#congChildrenTree');
    childrenWrap.innerHTML = '';
    var children = CWJournal.sortNodes(await CWJournal.nodes.byParent(node.id));
    $('#congChildrenCount').textContent = String(children.length);
    if (!children.length) {
      childrenWrap.innerHTML =
        '<div class="md-emptystate">' +
        '<p class="md-emptystate__text">' + esc(t('j.empty.groups_text')) + '</p>' +
        '</div>';
    } else {
      children.forEach(function (child, ci) {
        var cArchived = child.status === 'archived';
        var crow = document.createElement('div');
        crow.className = 'j-row';
        crow.innerHTML =
          '<div class="j-row__ico">' + svg(ICON[child.kind] || ICON.group) + '</div>' +
          '<div class="j-row__body">' +
          '<p class="j-row__title">' + (cArchived ? '<span class="u-muted">' + esc(child.label) + '</span>' : esc(child.label)) + '</p>' +
          '<p class="j-row__meta">' + (cArchived ? esc(t('j.badge.archive')) : esc(t('j.state.no_visit_yet'))) + '</p>' +
          '</div>' +
          '<div class="j-row__end">' + rowMenuMarkup(child.kind, child, ci, children.length) + '</div>';
        childrenWrap.appendChild(crow);
        wireRowMenu(crow, child);
      });
    }

    await renderCongregationProjects(node);
    wireCongregationMenu(node);
    applyCongregationTab(node);
  }

  /* ═══ Вкладки собрания: «Обзор» (J3b) и «Посещения» (J4a) ═════════════ */
  function applyCongregationTab(node) {
    var state = parseHash();
    var tab = state.congTab === 'visits' ? 'visits' : 'overview';
    $all('#congregationDetailView [data-cong-tab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-cong-tab') === tab);
      btn.onclick = function () {
        location.hash = btn.getAttribute('data-cong-tab') === 'visits'
          ? CWJournalRoute.build.visits(node.circuitId, node.id)
          : CWJournalRoute.build.congregation(node.circuitId, node.id);
      };
    });
    $('#congOverviewPanel').hidden = tab !== 'overview';
    $('#congVisitsPanel').hidden = tab !== 'visits';
    if (tab === 'visits') renderCongregationVisits(node);
  }

  /** Три взаимоисключающих состояния карточки идентичности — см.
   *  03-congregation-m.jpg и J3b spec (LINKED/UNLINKED/BROKEN). */
  function renderIdentityCard(node, directoryRecord) {
    var elLinked = $('#congIdentityLinked');
    var elUnlinked = $('#congIdentityUnlinked');
    var elBroken = $('#congIdentityBroken');
    var elUnavailable = $('#congIdentityUnavailable');
    elLinked.hidden = true; elUnlinked.hidden = true; elBroken.hidden = true; elUnavailable.hidden = true;

    if (!isDirectoryReady()) {
      // Справочник недоступен/ещё не прочитан — семантически НЕ то же
      // самое, что «не связано»: там пользователь может сам решить связать,
      // здесь действие было бы основано на неполных данных. communityId не
      // трогаем, активных действий не предлагаем (spec-3, п.2).
      elUnavailable.hidden = false;
      $('#congUnavailableLabel').textContent = node.label;
      return;
    }

    if (node.communityId && directoryRecord) {
      elLinked.hidden = false;
      var line1Parts = [];
      if (directoryRecord.congNumber) line1Parts.push('№ ' + directoryRecord.congNumber);
      if (directoryRecord.address) line1Parts.push(directoryRecord.address);
      $('#congIdentityLine1').textContent = line1Parts.join(' · ');
      var sched = (node.fields && node.fields.schedule) || {};
      var schedParts = [];
      if (sched.midweek) schedParts.push(sched.midweek);
      if (sched.weekend) schedParts.push(sched.weekend);
      $('#congIdentitySchedule').textContent = schedParts.length ? schedParts.join(', ') : '';
      var contactParts = [];
      if (directoryRecord.contactName) contactParts.push(directoryRecord.contactName);
      if (directoryRecord.contactPhone) contactParts.push(directoryRecord.contactPhone);
      if (directoryRecord.contactEmail) contactParts.push(directoryRecord.contactEmail);
      if (directoryRecord.contactNote) contactParts.push(directoryRecord.contactNote);
      $('#congIdentityContact').textContent = contactParts.length ? contactParts.join(' · ') : '';
      $('#congIdentityHint').textContent = t('j.identity.source_hint');
      $('#congEditIdentityBtn').onclick = function () { openEditIdentityDialog(node, directoryRecord); };
      $('#congEditScheduleBtn').onclick = function () { openScheduleDialog(node); };
      return;
    }

    if (node.communityId && !directoryRecord) {
      // BROKEN: ссылка есть, записи нет. НЕ стирать communityId молча.
      elBroken.hidden = false;
      $('#congBrokenLabel').textContent = node.label;
      $('#congRelinkBtn').onclick = function () { openLinkDialog(node); };
      return;
    }

    // UNLINKED
    elUnlinked.hidden = false;
    $('#congUnlinkedLabel').textContent = node.label;
    $('#congLinkBtn').onclick = function () { openLinkDialog(node); };
  }

  /** ЕДИНСТВЕННЫЙ диспетчер переименования узла — для всех входов (строка
   *  района, топбар собрания, топбар района). Собрание в состоянии LINKED
   *  (связь разрешилась в CWDirectory) показывается под canonicalName(), то
   *  есть CWDirectory.name; локальное переименование node.label было бы
   *  невидимым, поэтому открывается редактор общей идентичности. Во всех
   *  остальных случаях (UNLINKED/BROKEN/UNAVAILABLE, район, группа,
   *  предгруппа) — обычное локальное переименование label.
   *  Входы не вызывают друг друга — только эту функцию (нет рекурсии
   *  handleRowAction ↔ renameCongregation, из-за которой два пути разошлись). */
  function renameNode(node) {
    if (node.kind === 'congregation' && isDirectoryReady() && node.communityId) {
      var directoryRecord = CWDirectory.get(node.communityId);
      if (directoryRecord) {
        openEditIdentityDialog(node, directoryRecord);
        return;
      }
    }
    openNodeDialog({
      title: t('j.action.rename'),
      initialValue: node.label,
      onSave: async function (value) {
        try {
          await CWJournal.nodes.update(node.id, { label: value });
          refreshCurrentView();
        } catch (err) { alert(errorMessage(err)); }
      },
    });
  }

  function wireCongregationMenu(node) {
    var btn = $('#moreBtn');
    var panel = $('#moreMenuPanel');
    panel.innerHTML =
      '<button type="button" class="md-menu__item" role="menuitem" data-action="add-group">' + esc(t('j.action.add_group')) + '</button>' +
      '<button type="button" class="md-menu__item" role="menuitem" data-action="add-pregroup">' + esc(t('j.action.add_pregroup')) + '</button>' +
      '<button type="button" class="md-menu__item" role="menuitem" data-action="rename">' + esc(t('j.action.rename')) + '</button>' +
      '<button type="button" class="md-menu__item" role="menuitem" data-action="toggle-archive">' + esc(node.status === 'archived' ? t('j.action.unarchive') : t('j.action.archive')) + '</button>' +
      '<button type="button" class="md-menu__item" role="menuitem" data-action="delete">' + esc(t('j.action.delete')) + '</button>';
    var freshBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(freshBtn, btn);
    wireMenuToggle(freshBtn, panel);
    // Add-group/add-pregroup — тот же путь, что и в district-меню собрания
    // (J3a): handleRowAction уже умеет открывать диалог и звать
    // refreshCurrentView(), который теперь (см. п.3 прошлой правки)
    // корректно перерисовывает именно congregation-detail. Второй CRUD
    // здесь не заводится — только доступ к существующему.
    panel.querySelector('[data-action="add-group"]').onclick = function () {
      panel.hidden = true;
      handleRowAction('add-group', node);
    };
    panel.querySelector('[data-action="add-pregroup"]').onclick = function () {
      panel.hidden = true;
      handleRowAction('add-pregroup', node);
    };
    panel.querySelector('[data-action="rename"]').onclick = function () {
      panel.hidden = true;
      renameNode(node);
    };
    panel.querySelector('[data-action="toggle-archive"]').onclick = function () {
      panel.hidden = true;
      (node.status === 'archived' ? CWJournal.nodes.unarchive(node.id) : CWJournal.nodes.archive(node.id))
        .then(function () { renderCongregationDetail(node.circuitId, node.id); }, function (err) { alert(errorMessage(err)); });
    };
    panel.querySelector('[data-action="delete"]').onclick = function () {
      panel.hidden = true;
      if (!confirm(t('j.confirm.delete').replace('%s', node.label))) return;
      var circuitId = node.circuitId;
      CWJournal.nodes.remove(node.id).then(function () {
        // Тот же порядок и та же семантика, что у district-row delete
        // (handleRowAction): J3a safe-delete сначала, освобождение общей
        // записи справочника — только после его успеха.
        return node.communityId ? releaseSourceIfUnused(node.communityId, node.id) : null;
      }).then(function () {
        location.hash = '#districts/' + encodeURIComponent(circuitId);
      }).catch(function (err) { alert(errorMessage(err)); });
    };
  }

  /* ─── Расписание (Journal-owned, поле fields.schedule) ──────────────────
   * Пишет ТОЛЬКО через CWJournal.nodes.update — CWDirectory не трогается. */
  function openScheduleDialog(node) {
    var dlg = $('#scheduleDialog');
    var sched = (node.fields && node.fields.schedule) || {};
    $('#scheduleDialogMidweek').value = sched.midweek || '';
    $('#scheduleDialogWeekend').value = sched.weekend || '';
    dlg.showModal();

    var unbindClose;
    function onSubmit(e) {
      e.preventDefault();
      cleanup();
      dlg.close();
      var fields = Object.assign({}, node.fields || {}, {
        schedule: {
          midweek: $('#scheduleDialogMidweek').value.trim(),
          weekend: $('#scheduleDialogWeekend').value.trim(),
        },
      });
      CWJournal.nodes.update(node.id, { fields: fields }).then(function () {
        renderCongregationDetail(node.circuitId, node.id);
      });
    }
    function onCancel() { cleanup(); dlg.close(); }
    function cleanup() {
      form.removeEventListener('submit', onSubmit);
      $('#scheduleDialogCancel').removeEventListener('click', onCancel);
      if (unbindClose) unbindClose();
    }
    var form = $('#scheduleDialogForm');
    form.addEventListener('submit', onSubmit);
    $('#scheduleDialogCancel').addEventListener('click', onCancel);
    unbindClose = bindDialogCleanup(dlg, cleanup);
  }

  /* ─── Редактирование связанной идентичности — только через CWDirectory ── */
  function openEditIdentityDialog(node, directoryRecord) {
    // Переиспользуем диалог связывания как форму создания/редактирования:
    // здесь — с предзаполненными полями и явным upsert по существующему id,
    // без списка кандидатов (кандидат уже выбран — это сама запись).
    var dlg = $('#linkDialog');
    $('#linkDialogTitle').textContent = t('j.identity.edit');
    $('#linkDialogSearch').closest('.md-field').style.display = 'none';
    $('#linkDialogCandidates').innerHTML = '';
    $('#linkDialogCreate').open = true;
    $('#linkDialogCreate').querySelector('summary').style.display = 'none';
    $('#linkDialogNewName').value = directoryRecord.name || '';
    $('#linkDialogNewNumber').value = directoryRecord.congNumber || '';
    $('#linkDialogNewAddress').value = directoryRecord.address || '';
    $('#linkDialogNewContactName').value = directoryRecord.contactName || '';
    $('#linkDialogNewContactPhone').value = directoryRecord.contactPhone || '';
    $('#linkDialogNewContactEmail').value = directoryRecord.contactEmail || '';
    $('#linkDialogNewContactNote').value = directoryRecord.contactNote || '';
    dlg.showModal();

    var unbindClose;
    function onCreateClick() {
      var patch = Object.assign({}, directoryRecord, {
        name: $('#linkDialogNewName').value.trim(),
        congNumber: $('#linkDialogNewNumber').value.trim(),
        address: $('#linkDialogNewAddress').value.trim(),
        contactName: $('#linkDialogNewContactName').value.trim(),
        contactPhone: $('#linkDialogNewContactPhone').value.trim(),
        contactEmail: $('#linkDialogNewContactEmail').value.trim(),
        contactNote: $('#linkDialogNewContactNote').value.trim(),
      });
      if (!patch.name) { $('#linkDialogNewName').focus(); return; }
      Promise.resolve(CWDirectory.upsert(patch, 'journal')).then(function (record) {
        cleanup();
        dlg.close();
        if (!record) { alert(t('j.error.directory_write_failed')); return; }
        // Правка идентичности открывается и со строки района, и с топбара
        // собрания — перерисовать нужно тот экран, что сейчас открыт.
        refreshCurrentView();
      });
    }
    function onCancel() { cleanup(); dlg.close(); }
    function cleanup() {
      $('#linkDialogCreateBtn').removeEventListener('click', onCreateClick);
      $('#linkDialogCancel').removeEventListener('click', onCancel);
      // Восстановить общий вид диалога linkDialog (используется и как
      // link/create) — иначе Escape оставлял бы поиск скрытым и <details>
      // принудительно открытым для следующего вызова openLinkDialog()
      // (spec-3, п.6: «reopen normal link dialog» после Esc из edit-режима).
      $('#linkDialogSearch').closest('.md-field').style.display = '';
      $('#linkDialogCreate').querySelector('summary').style.display = '';
      if (unbindClose) unbindClose();
    }
    $('#linkDialogCreateBtn').addEventListener('click', onCreateClick);
    $('#linkDialogCancel').addEventListener('click', onCancel);
    unbindClose = bindDialogCleanup(dlg, cleanup);
  }

  /* ─── Связывание с существующей записью / создание новой ────────────────
   * Человек ОБЯЗАН подтвердить выбор — здесь нет автоматического применения
   * слабых/неоднозначных совпадений (см. J3b spec, CWDirectory.matchName). */
  function openLinkDialog(node) {
    var dlg = $('#linkDialog');
    $('#linkDialogTitle').textContent = t('j.dialog.link_title');
    $('#linkDialogNewName').value = node.label || '';
    $('#linkDialogNewNumber').value = '';
    $('#linkDialogNewAddress').value = '';
    $('#linkDialogNewContactName').value = '';
    $('#linkDialogNewContactPhone').value = '';
    $('#linkDialogNewContactEmail').value = '';
    $('#linkDialogNewContactNote').value = '';
    $('#linkDialogCreate').open = false;

    function renderCandidates(query) {
      var all = isDirectoryReady() ? CWDirectory.all() : [];
      var needle = (query || '').trim().toLowerCase();
      var list = needle
        ? all.filter(function (r) { return (r.name || '').toLowerCase().indexOf(needle) >= 0; })
        : all;
      var wrap = $('#linkDialogCandidates');
      if (!list.length) {
        wrap.innerHTML = '<p class="j-sec__hint">' + esc(t('j.identity.no_candidates')) + '</p>';
        return;
      }
      wrap.innerHTML = list.slice(0, 20).map(function (r) {
        return '<div class="j-row j-row--link" data-id="' + esc(r.id) + '">' +
          '<div class="j-row__body"><p class="j-row__title">' + esc(r.name) + '</p>' +
          '<p class="j-row__meta">' + esc(r.congNumber ? '№ ' + r.congNumber : '') + '</p></div></div>';
      }).join('');
      wrap.querySelectorAll('.j-row--link').forEach(function (row) {
        row.addEventListener('click', function () { confirmLink(row.dataset.id); });
      });
    }

    function confirmLink(communityId) {
      // Явное подтверждение человеком — клик по конкретной карточке
      // кандидата. claimAndLink() заявляет 'journal' за новую запись,
      // сохраняет communityId и отпускает старую (если была и больше не
      // нужна) — весь source lifecycle из spec п.1(A/B), не только id.
      claimAndLink(node, communityId).then(function (result) {
        if (!result.ok) { alert(t('j.error.directory_write_failed')); return; }
        cleanup();
        dlg.close();
        renderCongregationDetail(node.circuitId, node.id);
      });
    }

    function onSearchInput() { renderCandidates($('#linkDialogSearch').value); }

    function onCreateClick() {
      var name = $('#linkDialogNewName').value.trim();
      if (!name) { $('#linkDialogNewName').focus(); return; }
      var payload = {
        name: name,
        congNumber: $('#linkDialogNewNumber').value.trim(),
        address: $('#linkDialogNewAddress').value.trim(),
        contactName: $('#linkDialogNewContactName').value.trim(),
        contactPhone: $('#linkDialogNewContactPhone').value.trim(),
        contactEmail: $('#linkDialogNewContactEmail').value.trim(),
        contactNote: $('#linkDialogNewContactNote').value.trim(),
      };
      Promise.resolve(CWDirectory.create(payload, 'journal')).then(function (record) {
        if (!record) {
          // Отказ записи в справочник — communityId НЕ проставляем,
          // локальный узел остаётся как есть (см. J3b spec, «No half-linked state»).
          alert(t('j.error.directory_write_failed'));
          return;
        }
        // create() уже проставил 'journal' в sources новой записи. claimAndLink
        // делает attach() ещё раз (безопасный no-op — attach() не трогает БД,
        // если источник уже там есть), сохраняет communityId на узле и, если
        // это была замена старой связи, отпускает старую запись — тот же
        // путь, что и обычное связывание с существующей записью.
        return claimAndLink(node, record.id).then(function (result) {
          if (!result.ok) {
            // Узел не обновился — компенсация внутри claimAndLink уже
            // отпустила 'journal', но саму СОЗДАННУЮ запись это не удаляет,
            // если её источник был только что добавлен и снят обратно до 0 —
            // releaseSourceIfUnused отработает именно так (0 ссылок → detach
            // → 'removed', т.к. единственный источник был 'journal').
            alert(t('j.error.directory_write_failed'));
            return;
          }
          cleanup();
          dlg.close();
          renderCongregationDetail(node.circuitId, node.id);
        });
      });
    }

    function onCancel() { cleanup(); dlg.close(); }
    var unbindClose;
    function cleanup() {
      $('#linkDialogSearch').removeEventListener('input', onSearchInput);
      $('#linkDialogCreateBtn').removeEventListener('click', onCreateClick);
      $('#linkDialogCancel').removeEventListener('click', onCancel);
      if (unbindClose) unbindClose();
    }

    $('#linkDialogSearch').value = '';
    $('#linkDialogSearch').addEventListener('input', onSearchInput);
    $('#linkDialogCreateBtn').addEventListener('click', onCreateClick);
    $('#linkDialogCancel').addEventListener('click', onCancel);
    unbindClose = bindDialogCleanup(dlg, cleanup);
    renderCandidates('');
    dlg.showModal();
  }

  function wireCircuitMenu(circuit) {
    var btn = $('#moreBtn');
    var panel = $('#moreMenuPanel');
    // Панель у #moreBtn пуста вне контекста района — наполняется здесь и
    // очищается resetMoreMenu() при уходе с экрана (см. applyRoute()).
    panel.innerHTML =
      '<button type="button" class="md-menu__item" role="menuitem" data-action="rename">' + esc(t('j.action.rename')) + '</button>' +
      '<button type="button" class="md-menu__item" role="menuitem" data-action="toggle-archive">' + esc(circuit.status === 'archived' ? t('j.action.unarchive') : t('j.action.archive')) + '</button>' +
      '<button type="button" class="md-menu__item" role="menuitem" data-action="delete">' + esc(t('j.action.delete')) + '</button>';
    btn.setAttribute('data-i18n-aria-label', 'j.action.circuit_menu');
    btn.setAttribute('aria-label', t('j.action.circuit_menu'));
    // Каждый вызов renderDistrictDetail переиспользует ту же кнопку — старые
    // обработчики снимаются клонированием узла, иначе они копятся при
    // каждом rename/archive и дублируют действия.
    var freshBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(freshBtn, btn);
    wireMenuToggle(freshBtn, panel);
    panel.querySelector('[data-action="rename"]').onclick = function () {
      panel.hidden = true;
      handleRowAction('rename', circuit);
    };
    panel.querySelector('[data-action="toggle-archive"]').onclick = function () {
      panel.hidden = true;
      handleRowAction('toggle-archive', circuit);
    };
    panel.querySelector('[data-action="delete"]').onclick = function () {
      panel.hidden = true;
      var beforeId = circuit.id;
      handleRowAction('delete', circuit).then(function () {
        // Успешное удаление района уводит на список; при отказе (children/
        // entries/links) handleRowAction уже показал alert и не изменил
        // hash — CWJournal.nodes.get ниже подтверждает, какой случай был.
        CWJournal.nodes.get(beforeId).then(function (still) {
          if (!still) location.hash = '#districts';
        });
      });
    };
  }

  /* ═══ Создание района/собрания по FAB / пустому состоянию ═════════════ */
  async function runAction(action) {
    if (action === 'new-task') { openTaskDialog(null); return; }
    if (action === 'new-visit') {
      var vs = parseHash();
      if (!vs.congregationId) return;
      var today = todayIso();
      openVisitDialog({
        title: t('j.dialog.new_visit'), from: today, to: today,
        onSave: function (f, tt) { return CWJournal.visits.add({ nodeId: vs.congregationId, dateFrom: f, dateTo: tt }); },
        onDone: function (id) { location.hash = CWJournalRoute.build.visit(vs.circuitId, vs.congregationId, id); },
      });
      return;
    }
    if (action === 'new-circuit') {
      openNodeDialog({
        title: t('j.dialog.new_circuit'),
        initialValue: '',
        onSave: async function (value) {
          var id = await CWJournal.nodes.add({ kind: 'circuit', parentId: CWJournal.ROOT_PARENT, label: value });
          location.hash = '#districts/' + encodeURIComponent(id);
        },
      });
      return;
    }
    if (action === 'new-congregation') {
      var state = parseHash();
      if (!state.circuitId) return;
      openNodeDialog({
        title: t('j.dialog.new_congregation'),
        initialValue: '',
        onSave: async function (value) {
          await CWJournal.nodes.add({ kind: 'congregation', parentId: state.circuitId, label: value });
          renderDistrictDetail(state.circuitId);
        },
      });
    }
  }

  /* Публикация для других файлов Журнала. */
  A.canonicalName = canonicalName;
  A.chip = chip;
  A.renderCircuitsList = renderCircuitsList;
  A.renderCongregationDetail = renderCongregationDetail;
  A.renderDistrictDetail = renderDistrictDetail;
  A.runAction = runAction;
})();
