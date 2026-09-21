/**
 * Журнал — оболочка модуля + дерево района (J3a).
 *
 * Обзор остаётся статической фикстурой J1 (см. index.html) — реальных
 * данных там ещё нет. «Районы» теперь реальный экран: список районов и
 * детальный экран одного района читаются и пишутся через CWJournal
 * (journal/js/data.js), без единой прямой транзакции IndexedDB отсюда.
 *
 * Маршрут «районы» имеет подсостояние — выбранный circuitId — в хэше:
 *   #districts            → список районов
 *   #districts/<circuitId> → один район
 * Это не отдельный элемент ROUTES: маршрут по-прежнему один («districts»),
 * подсостояние разбирается отдельно (см. parseHash()).
 */
(function () {
  'use strict';

  var MODULE_ID = 'journal';
  var ROUTES = ['overview', 'districts', 'tasks', 'search', 'archive'];
  var DEFAULT_ROUTE = 'overview';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function t(key) { return self.CWI18n ? CWI18n.t(key) : key; }
  function esc(s) { return self.CWEscape ? CWEscape.html(s) : String(s == null ? '' : s); }

  function parseHash() {
    var raw = (location.hash || '').replace(/^#/, '');
    var parts = raw.split('/');
    var route = ROUTES.indexOf(parts[0]) >= 0 ? parts[0] : DEFAULT_ROUTE;
    var circuitId = route === 'districts' && parts[1] ? decodeURIComponent(parts[1]) : null;
    return { route: route, circuitId: circuitId };
  }

  /* ═══ FAB: один элемент, подпись/действие меняются по месту ═══════════ */
  function fabSpecFor(state) {
    if (state.route === 'overview') return { labelKey: 'j.fab.new_entry', action: null };
    if (state.route === 'districts' && !state.circuitId) return { labelKey: 'j.fab.new_circuit', action: 'new-circuit' };
    if (state.route === 'districts' && state.circuitId) return { labelKey: 'j.fab.new_congregation', action: 'new-congregation' };
    return null;
  }

  /* ═══ Диалог создания/переименования узла ═════════════════════════════ */
  function openNodeDialog(opts) {
    var dlg = $('#nodeDialog');
    var input = $('#nodeDialogLabel');
    $('#nodeDialogTitle').textContent = opts.title;
    input.value = opts.initialValue || '';
    dlg.showModal();
    input.focus();
    input.select();

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
    }
    var form = $('#nodeDialogForm');
    form.addEventListener('submit', onSubmit);
    $('#nodeDialogCancel').addEventListener('click', onCancel);
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
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
  };
  function svg(paths, attrs) {
    return '<svg viewBox="0 0 24 24" ' + (attrs || 'width="17" height="17"')
      + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
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
        openNodeDialog({
          title: t('j.action.rename'),
          initialValue: node.label,
          onSave: async function (value) { await CWJournal.nodes.update(node.id, { label: value }); refreshCurrentView(); },
        });
        return;
      }
      if (action === 'toggle-archive') {
        await CWJournal.nodes.update(node.id, { status: node.status === 'archived' ? 'active' : 'archived' });
        refreshCurrentView();
        return;
      }
      if (action === 'delete') {
        if (!confirm(t('j.confirm.delete').replace('%s', node.label))) return;
        await CWJournal.nodes.remove(node.id);
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

  function errorMessage(err) {
    var known = {
      'journal-node-has-children': 'j.error.has_children',
      'journal-node-has-entries': 'j.error.has_entries',
      'journal-node-has-links': 'j.error.has_links',
      'journal-invalid-hierarchy': 'j.error.invalid_hierarchy',
      'journal-immutable-kind': 'j.error.immutable_kind',
      'journal-immutable-parent': 'j.error.immutable_parent',
    };
    var key = known[err && err.message];
    return key ? t(key) : (err && err.message) || String(err);
  }

  function refreshCurrentView() {
    var state = parseHash();
    if (state.route !== 'districts') return;
    if (state.circuitId) renderDistrictDetail(state.circuitId); else renderCircuitsList();
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

    // Карточка «Записи уровня района» — честные реальные (сейчас нулевые)
    // счётчики: CRUD самих записей — не в рамках J3a.
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

  async function renderCongregationRow(container, node, index, siblingCount) {
    var archived = node.status === 'archived';
    var row = document.createElement('div');
    row.className = 'j-row';
    row.innerHTML =
      '<div class="j-row__ico">' + svg(ICON.congregation) + '</div>' +
      '<div class="j-row__body">' +
      '<p class="j-row__title">' + (archived ? '<span class="u-muted">' + esc(node.label) + '</span>' : '<b>' + esc(node.label) + '</b>') + '</p>' +
      '<p class="j-row__meta">' + (archived ? esc(t('j.badge.archive')) : esc(t('j.state.no_visit_yet'))) + '</p>' +
      '</div>' +
      '<div class="j-row__end">' + rowMenuMarkup('congregation', node, index, siblingCount) + '</div>';
    container.appendChild(row);
    wireRowMenu(row, node);

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

  /* ═══ Создание района/собрания по FAB / пустому состоянию ═════════════ */
  async function runAction(action) {
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

  /* ═══ Маршрутизация и общая оболочка (J1) ═══════════════════════════════ */
  function applyRoute() {
    var state = parseHash();

    $all('[data-route]', document).forEach(function (el) {
      var isSection = el.tagName === 'SECTION';
      var match = el.getAttribute('data-route') === state.route;
      if (isSection) el.hidden = !match; else el.classList.toggle('active', match);
    });

    if (state.route === 'districts') {
      $('#circuitsListView').hidden = !!state.circuitId;
      $('#districtDetailView').hidden = !state.circuitId;
      if (state.circuitId) renderDistrictDetail(state.circuitId);
      else { renderCircuitsList(); resetMoreMenu(); }
    } else {
      resetMoreMenu();
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
    applyRoute();

    $('#searchBtn').addEventListener('click', function () { location.hash = '#search'; });

    window.addEventListener('hashchange', applyRoute);

    if (typeof CWUpdate !== 'undefined') {
      CWUpdate.init({ swUrl: 'sw.js', ui: 'silent', hubHref: '../index.html' });
    }
  });
})();
