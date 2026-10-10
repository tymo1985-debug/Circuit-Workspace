/** Журнал — Обзор (O2): живая сводка стартового экрана.
 *
 * Данные — только публичные границы: снимок CWJournal.overview.read() (районы,
 * открытые задачи, перенос, активные проекты, посещения — отбор, порядок и
 * архивный контекст держит data.js) и CWJournal.roster.read() (собрания,
 * группы и предгруппы Журнала — плашки сводки; календарь не читается).
 * Точечно — CWJournal.nodes.get() для подписей не более чем девяти
 * показанных строк. Ничего не пишется и не кэшируется.
 *
 * Показ: не больше PREVIEW строк в секции, счётчик — полный. Ссылки — только
 * существующие маршруты; строка, для которой безопасного маршрута нет, в
 * превью не попадает.
 *
 * Асинхронность и J8: каждая отрисовка получает поколение
 * (overviewRenderSeq). Вставка в DOM — только если поколение последнее и
 * маршрут всё ещё #overview; отрисовка, собранная с раскрытым текстом, не
 * вставляется, если к моменту вставки сессия заблокирована. При старте
 * отрисовки в заблокированной сессии секции, где был раскрытый текст,
 * очищаются сразу — не дожидаясь чтения.
 *
 * Свежесть без опроса: CWJournal.integration.onChange
 * (записи и узлы, эта и соседние вкладки); CWDirectory.onChange и смена
 * блокировки приходят через app.js/protection.js в тот же renderOverview. */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  /* Общие константы других файлов (объекты неизменяемы по смыслу). */
  var ICON = A.ICON;

  /* Функции других файлов — позднее связывание через CWJournalApp. */
  function $() { return A.$.apply(this, arguments); }
  function buildOverviewProjects() { return A.buildOverviewProjects.apply(this, arguments); }
  function capitalize() { return A.capitalize.apply(this, arguments); }
  function ddmm() { return A.ddmm.apply(this, arguments); }
  function esc() { return A.esc.apply(this, arguments); }
  function el() { return A.el.apply(this, arguments); }
  function formatRange() { return A.formatRange.apply(this, arguments); }
  function isLockedRow() { return A.isLockedRow.apply(this, arguments); }
  function isProtectedRow() { return A.isProtectedRow.apply(this, arguments); }
  function lockMark() { return A.lockMark.apply(this, arguments); }
  function nodeName() { return A.nodeName.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function seasonLabel() { return A.seasonLabel.apply(this, arguments); }
  function svg() { return A.svg.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }
  function textOr() { return A.textOr.apply(this, arguments); }
  function todayIso() { return A.todayIso.apply(this, arguments); }
  function visitStatusView() { return A.visitStatusView.apply(this, arguments); }

  var PREVIEW = 3;
  var OV_ICON = {
    carry: '<path d="M4 21V4h11l-1.5 4L15 12H4"/>',
    task: '<path d="m3 8 3 3 5-5"/><path d="m3 17 3 3 5-5"/><path d="M14 8h7M14 18h7"/>',
    visit: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  };
  /* Секции со строками, где может оказаться раскрытый текст (J8). */
  var PLAIN_BOXES = ['overviewCarry', 'overviewTasks', 'overviewProjects'];

  var overviewRenderSeq = 0;
  var overviewUi = { loaded: false, bound: false };

  function isCurrent(gen) { return gen === overviewRenderSeq && parseHash().route === 'overview'; }
  function unlocked() { return !!CWJournal.protection.isUnlocked(); }
  function plainIn(list) { return list.some(function (r) { return isProtectedRow(r) && !isLockedRow(r); }); }

  /* ═══ Сводка ═══════════════════════════════════════════════════════════ */
  function statItem(labelKey, value, href, title) {
    var label = t(labelKey);
    var item = el(href ? 'a' : 'span', 'j-ovstat');
    if (href) item.href = href;
    if (title) item.title = title;
    item.setAttribute('aria-label', label + ': ' + (title ? title : value));
    item.appendChild(el('b', 'j-ovstat__value', value));
    item.appendChild(el('span', 'j-ovstat__label', label));
    return item;
  }
  /** Плашки сводки: районы — из снимка Обзора, остальные — из состава
   *  Журнала (R1). Не прочитано — «—» с подсказкой, пока читается — «…». */
  function buildStats(data, failed, roster) {
    var frag = document.createDocumentFragment();
    var circuits = failed ? '—' : data ? String(data.circuits.length) : '…';
    frag.appendChild(statItem('j.nav.districts', circuits, '#districts', failed ? t('j.overview.unavailable') : null));
    [['congregations', 'j.overview.stat.congregations', '#roster'],
     ['groups', 'j.overview.stat.groups', '#roster/groups'],
     ['pregroups', 'j.overview.stat.pregroups', '#roster/pregroups']].forEach(function (x) {
      var value = failed ? '—' : roster ? String(roster[x[0]].length) : '…';
      frag.appendChild(statItem(x[1], value, x[2], failed ? t('j.overview.unavailable') : null));
    });
    return frag;
  }

  /* ═══ Строки ═══════════════════════════════════════════════════════════ */
  function linkRow(href, icon, accent) {
    var row = el('a', 'j-row j-row--link j-ovrow');
    row.href = href;
    var ico = el('div', 'j-row__ico' + (accent ? ' j-row__ico--accent' : ''));
    ico.innerHTML = svg(icon);
    row.appendChild(ico);
    return row;
  }
  function finishRow(row, body) {
    row.appendChild(body);
    var end = el('div', 'j-row__end');
    end.innerHTML = svg(ICON.chevron, 'width="18" height="18"');
    row.appendChild(end);
    return row;
  }
  function textTitle(r) {
    var p = el('p', 'j-row__title' + (isLockedRow(r) ? ' u-muted' : ''), textOr(r, 'body'));
    if (isProtectedRow(r)) p.insertAdjacentHTML('beforeend', lockMark(r));
    return p;
  }
  function meta(parts) {
    var m = el('p', 'j-row__meta');
    parts.filter(Boolean).forEach(function (part, i) {
      if (i) m.appendChild(el('span', 'j-dot', '·'));
      if (typeof part === 'string') m.appendChild(el('span', '', part)); else m.appendChild(part);
    });
    return m;
  }
  function label(nodes, id) { var n = nodes[id]; return n ? nodeName(n) : ''; }

  /** Существующий маршрут посещения — как у поиска (destFor): посещение
   *  собрания открывается само, группы/предгруппы — вкладкой «Посещения»
   *  собрания-родителя. Нет контекста — null (строка не показывается). */
  function visitDest(item) {
    if (!item || !item.circuitId || !item.congregationId) return null;
    if (item.nodeKind === 'congregation' || item.congregationId === item.nodeId) return CWJournalRoute.build.visit(item.circuitId, item.congregationId, item.visit.id);
    if (item.nodeKind === 'group' || item.nodeKind === 'pregroup') return CWJournalRoute.build.visits(item.circuitId, item.congregationId);
    return null;
  }

  function carryRow(r, dest, origin, nodes) {
    var row = linkRow(dest, OV_ICON.carry, true);
    var body = el('div', 'j-row__body');
    body.appendChild(textTitle(r));
    body.appendChild(meta([label(nodes, r.nodeId), origin ? capitalize(seasonLabel(origin.dateFrom)) : '']));
    return finishRow(row, body);
  }
  function taskRow(r, nodes, today) {
    var row = linkRow(CWJournalRoute.build.task(r.id), OV_ICON.task, false);
    var body = el('div', 'j-row__body');
    body.appendChild(textTitle(r));
    var due = null;
    if (r.dueDate) due = el('span', 'md-status ' + (r.dueDate <= today ? 'md-status-important' : 'md-status-normal'), t('j.task.due_short').replace('%s', ddmm(r.dueDate)));
    body.appendChild(meta([due, label(nodes, r.nodeId)]));
    return finishRow(row, body);
  }
  function visitRow(item, dest, nodes) {
    var v = item.visit;
    var row = linkRow(dest, OV_ICON.visit, false);
    var body = el('div', 'j-row__body');
    var name = label(nodes, item.nodeId);
    var title = el('p', 'j-row__title');
    title.appendChild(el('b', '', (name ? name + ' — ' : '') + capitalize(seasonLabel(v.dateFrom))));
    body.appendChild(title);
    var status = el('span', '');
    status.innerHTML = visitStatusView(v).html;
    body.appendChild(meta([formatRange(v.dateFrom, v.dateTo, true), status]));
    return finishRow(row, body);
  }

  function hint(key) { return el('p', 'j-sec__hint', t(key)); }

  /* ═══ Баннер ближайшего посещения (J10) ═══════════════════════════════════
   * Показывается только при реальном открытом посещении с датой начала не
   * раньше сегодня — ничего «для красоты» не выводится. Клик открывает
   * посещение (для группы/предгруппы — вкладку «Посещения» собрания-
   * родителя, как и остальной Обзор). */
  function nearestUpcoming(visits, today) {
    var open = visits.filter(function (x) { return x.visit.status === 'open' && x.visit.dateFrom >= today; });
    if (!open.length) return null;
    open.sort(function (a, b) { return a.visit.dateFrom < b.visit.dateFrom ? -1 : a.visit.dateFrom > b.visit.dateFrom ? 1 : 0; });
    return open[0];
  }
  async function renderNextVisitBanner(data, today, gen) {
    var box = $('#overviewNextVisit');
    var item = data ? nearestUpcoming(data.visits, today) : null;
    var dest = item ? visitDest(item) : null;
    if (!item || !dest) { if (isCurrent(gen)) { box.hidden = true; box.replaceChildren(); } return; }
    var node = await CWJournal.nodes.get(item.nodeId);
    if (!isCurrent(gen)) return;
    var name = node ? nodeName(node) : '';
    box.innerHTML = '<a class="md-banner" href="' + dest + '">' +
      '<span class="md-banner__icon">' + svg(OV_ICON.visit, 'width="20" height="20"') + '</span>' +
      '<div class="md-banner__body">' +
      '<p class="md-banner__title">' + esc((name ? name + ' — ' : '') + capitalize(seasonLabel(item.visit.dateFrom))) + '</p>' +
      '<p class="j-banner__text">' + esc(formatRange(item.visit.dateFrom, item.visit.dateTo, true)) + '</p>' +
      '</div></a>';
    box.hidden = false;
  }

  /** Все секции — во фрагменты, без вставки. */
  async function buildSections(data) {
    var visitById = {};
    data.visits.forEach(function (x) { visitById[x.visit.id] = x; });
    var carry = data.carry.map(function (r) {
      var origin = visitById[r.fields.visitId];
      return { row: r, origin: origin || null, dest: visitDest(origin) };
    }).filter(function (x) { return !!x.dest; });
    var visits = data.visits.map(function (x) { return { item: x, dest: visitDest(x) }; }).filter(function (x) { return !!x.dest; });
    var tasks = data.tasks;

    var carryShown = carry.slice(0, PREVIEW), taskShown = tasks.slice(0, PREVIEW), visitShown = visits.slice(0, PREVIEW);
    var ids = {};
    carryShown.forEach(function (x) { ids[x.row.nodeId] = true; });
    taskShown.forEach(function (r) { ids[r.nodeId] = true; });
    visitShown.forEach(function (x) { ids[x.item.nodeId] = true; });
    var nodes = {};
    await Promise.all(Object.keys(ids).map(async function (id) { nodes[id] = await CWJournal.nodes.get(id); }));

    var today = todayIso();
    var out = { plain: {} };
    var f;

    f = document.createDocumentFragment();
    carryShown.forEach(function (x) { f.appendChild(carryRow(x.row, x.dest, x.origin && x.origin.visit, nodes)); });
    out.carry = { count: carry.length, content: carry.length ? f : hint('j.overview.empty_carry') };
    out.plain.overviewCarry = plainIn(carryShown.map(function (x) { return x.row; }));

    f = document.createDocumentFragment();
    taskShown.forEach(function (r) { f.appendChild(taskRow(r, nodes, today)); });
    out.tasks = { count: tasks.length, content: tasks.length ? f : hint('j.overview.empty_tasks') };
    out.plain.overviewTasks = plainIn(taskShown);

    out.projects = await buildOverviewProjects(data, PREVIEW);
    out.plain.overviewProjects = plainIn(data.projects.slice(0, PREVIEW));

    f = document.createDocumentFragment();
    visitShown.forEach(function (x) { f.appendChild(visitRow(x.item, x.dest, nodes)); });
    out.visits = { count: visits.length, content: visits.length ? f : hint('j.overview.empty_visits') };
    return out;
  }

  /* ═══ Вставка ══════════════════════════════════════════════════════════ */
  var SECTIONS = [['carry', 'overviewCarry'], ['tasks', 'overviewTasks'], ['projects', 'overviewProjects'], ['visits', 'overviewVisits']];

  function setSection(box, count, content, busy) {
    $('#' + box + 'Count').textContent = count;
    var sec = $('#' + box + 'Sec');
    if (busy) sec.setAttribute('aria-busy', 'true'); else sec.removeAttribute('aria-busy');
    if (content) $('#' + box).replaceChildren(content); else $('#' + box).replaceChildren();
  }
  function showLoading() {
    $('#overviewStats').replaceChildren(buildStats(null, false, null));
    SECTIONS.forEach(function (s) { setSection(s[1], '…', null, true); });
    $('#overviewNextVisit').hidden = true;
  }
  /** Заблокировано: секции, где был раскрытый текст, очищаются сразу. */
  function dropPlain() {
    PLAIN_BOXES.forEach(function (id) {
      var box = $('#' + id);
      if (box && box.hasAttribute('data-ov-plain')) { box.replaceChildren(); box.removeAttribute('data-ov-plain'); }
    });
  }
  function commit(view, failed, data, roster) {
    $('#overviewStats').replaceChildren(buildStats(data, failed, roster));
    SECTIONS.forEach(function (s) {
      var box = $('#' + s[1]);
      if (failed) {
        setSection(s[1], '—', hint('j.overview.unavailable'), false);
        box.removeAttribute('data-ov-plain');
        return;
      }
      setSection(s[1], String(view[s[0]].count), view[s[0]].content, false);
      if (view.plain[s[1]]) box.setAttribute('data-ov-plain', ''); else box.removeAttribute('data-ov-plain');
    });
    overviewUi.loaded = true;
  }

  async function renderOverview() {
    var gen = ++overviewRenderSeq;
    if (!unlocked()) dropPlain();
    if (!overviewUi.loaded) showLoading();
    var data = null, roster = null, failed = false;
    try {
      data = await CWJournal.overview.read();
      roster = await CWJournal.roster.read();
    } catch (e) {
      failed = true;
      console.error('Журнал: данные Обзора не прочитаны', e);
    }
    if (!isCurrent(gen)) return;
    var view = null;
    if (!failed) {
      try { view = await buildSections(data); } catch (e) {
        failed = true;
        console.error('Журнал: Обзор не собран', e);
      }
    }
    if (!isCurrent(gen)) return;
    // Собрано с раскрытым текстом, а сессия уже заблокирована — не вставлять:
    // отрисовку без текста запустила смена блокировки.
    if (view && Object.keys(view.plain).some(function (k) { return view.plain[k]; }) && !unlocked()) return;
    await renderNextVisitBanner(failed ? null : data, todayIso(), gen);
    if (!isCurrent(gen)) return;
    commit(view, failed, data, roster);
  }

  function onSourceChange() { if (parseHash().route === 'overview') renderOverview(); }

  /** Подписки — один раз, до первой отрисовки маршрута (app.js). */
  function wireOverviewChrome() {
    if (overviewUi.bound) return;
    overviewUi.bound = true;
    CWJournal.integration.onChange(onSourceChange);
  }

  /* Публикация для других файлов Журнала. */
  A.dropPlain = dropPlain;
  A.renderOverview = renderOverview;
  A.wireOverviewChrome = wireOverviewChrome;
})();
