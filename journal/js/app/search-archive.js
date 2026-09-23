/** Журнал — поиск (J6) и раздел «Архив». */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  /* Общие константы других файлов (объекты неизменяемы по смыслу). */
  var ICON = A.ICON;

  /* Функции других файлов — позднее связывание через CWJournalApp. */
  function $() { return A.$.apply(this, arguments); }
  function $all() { return A.$all.apply(this, arguments); }
  function capitalize() { return A.capitalize.apply(this, arguments); }
  function ddmm() { return A.ddmm.apply(this, arguments); }
  function destFor() { return A.destFor.apply(this, arguments); }
  function el() { return A.el.apply(this, arguments); }
  function errorMessage() { return A.errorMessage.apply(this, arguments); }
  function formatRange() { return A.formatRange.apply(this, arguments); }
  function labelVisit() { return A.labelVisit.apply(this, arguments); }
  function nodeName() { return A.nodeName.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function resolveCommunity() { return A.resolveCommunity.apply(this, arguments); }
  function seasonLabel() { return A.seasonLabel.apply(this, arguments); }
  function setTaskTab() { return A.setTaskTab.apply(this, arguments); }
  function svg() { return A.svg.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }
  function textOr() { return A.textOr.apply(this, arguments); }
  function uiLang() { return A.uiLang.apply(this, arguments); }


  /* ═══ Поиск (J6) ═════════════════════════════════════════════════════════
   * Данные — только CWJournal.search (в памяти, по требованию). Запрос живёт
   * ТОЛЬКО в памяти этого замыкания: не попадает ни в хэш, ни в историю,
   * ни в localStorage — текст Журнала может быть чувствительным. Подсветка
   * строится из текстовых узлов (<mark> + textContent), пользовательский
   * текст никогда не проходит через innerHTML. Устаревший ответ (более
   * ранний запрос, завершившийся позже) отбрасывается по номеру прогона. */
  var SICON = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    project: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    task: '<path d="m3 8 3 3 5-5"/><path d="m3 17 3 3 5-5"/><path d="M14 8h7M14 18h7"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  };
  var SEARCH_FILTERS = ['all', 'records', 'tasks', 'visits', 'nodes', 'archive'];
  var SEARCH_GROUPS = ['visits', 'records', 'tasks', 'nodes'];
  var searchUi = { query: '', filter: 'all', seq: 0, timer: null, focusNext: false };

  function searchGroupOf(r) {
    if (r.archived) return 'archive';
    if (r.kind === 'node') return 'nodes';
    if (r.kind === 'task') return 'tasks';
    if (r.kind === 'visit') return 'visits';
    if (r.kind === 'record') return CWJournal.carry.isOpen(r.row) ? 'records' : 'visits';
    return 'records';
  }
  /** Сегменты { text, hit } → текстовые узлы и <mark>. Без innerHTML. */
  function appendSegments(parent, segs) {
    segs.forEach(function (s) {
      if (s.hit) parent.appendChild(el('mark', 'j-hit', s.text));
      else parent.appendChild(document.createTextNode(s.text));
    });
  }
  /** Крошки «› EU-K-03 › Приозёрное › Осень 2027»: иконка — статичная
   *  разметка, подписи — только textContent. */
  function crumbLine(parts, archivedTag) {
    var p = el('p', 'j-row__meta j-path');
    parts.filter(Boolean).forEach(function (txt) {
      var chev = el('span', 'j-path__sep');
      chev.innerHTML = svg(ICON.chevron, 'width="12" height="12"');
      p.appendChild(chev);
      p.appendChild(el('span', 'j-path__item', txt));
    });
    if (archivedTag) p.appendChild(el('span', 'j-tag', t('j.badge.archive')));
    return p;
  }

  function resultIcon(r) {
    if (r.archived) return { paths: ICON.archive, cls: '' };
    if (r.kind === 'node') return { paths: ICON[r.row.kind] || ICON.group, cls: '' };
    if (r.kind === 'visit') return { paths: ICON.visit, cls: '' };
    if (CWJournal.carry.isOpen(r.row)) return { paths: SICON.flag, cls: ' j-row__ico--accent' };
    if (r.kind === 'task') return { paths: SICON.task, cls: '' };
    if (r.kind === 'record') return { paths: ICON.visit, cls: '' };
    if (r.row.type === 'project') return { paths: SICON.project, cls: ' j-row__ico--project' };
    return { paths: SICON.note, cls: '' };
  }

  function searchRow(r, query) {
    var chain = r.chain || [];
    var names = chain.map(nodeName);
    var row = el('div', 'j-row j-row--link j-sres');
    row.setAttribute('role', 'link');
    row.setAttribute('tabindex', '0');
    var ic = resultIcon(r);
    var ico = el('div', 'j-row__ico' + ic.cls);
    ico.innerHTML = svg(ic.paths);
    var body = el('div', 'j-row__body');
    var title = el('p', 'j-row__title j-sres__text');
    var parts;
    if (r.kind === 'node') {
      appendSegments(title, CWJournal.search.highlight(nodeName(r.row), query));
      parts = names.slice(0, -1).concat([t('j.search.kind.' + r.row.kind)]);
    } else if (r.kind === 'visit') {
      appendSegments(title, CWJournal.search.highlight(capitalize(seasonLabel(r.row.dateFrom)), query));
      title.appendChild(document.createTextNode(' · ' + formatRange(r.row.dateFrom, r.row.dateTo, true)));
      parts = names;
    } else {
      var texts = r.texts || [];
      var toks = CWJournal.search.tokens(query);
      var pick = texts.filter(function (x) {
        var f = CWJournal.search.fold(x);
        return toks.some(function (tk) { return f.indexOf(tk) >= 0; });
      });
      var text = pick.length ? pick[pick.length - 1] : (texts[texts.length - 1] || '');
      appendSegments(title, CWJournal.search.snippet(text, query));
      parts = names.slice();
      if (r.visit && r.visit.dateFrom) parts.push(capitalize(seasonLabel(r.visit.dateFrom)));
      if (CWJournal.carry.isOpen(r.row)) parts.push(t('j.search.carry_next'));
      else if (r.kind === 'task') {
        if (r.row.status === 'done') parts.push(t('j.search.task_done'));
        else if (r.row.dueDate) parts.push(t('j.task.due_short').replace('%s', ddmm(r.row.dueDate)));
      } else if (r.kind === 'entry' || r.kind === 'project') {
        parts.push(r.row.title && r.row.title !== text ? r.row.title : t(r.row.type === 'project' ? 'j.search.type.project' : 'j.record.type.' + r.row.type));
      }
    }
    body.appendChild(title);
    body.appendChild(crumbLine(parts, r.archived));
    var end = el('div', 'j-row__end');
    end.innerHTML = svg(ICON.chevron, 'width="18" height="18"');
    row.appendChild(ico); row.appendChild(body); row.appendChild(end);
    var go = function () {
      var href = destFor(r.kind, r.row, chain, r.visit);
      if (href === '#tasks') setTaskTab(r.row.status === 'done' ? 'done' : 'open');
      location.hash = href;
    };
    row.addEventListener('click', go);
    row.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return row;
  }

  function searchEmpty(titleKey, textKey) {
    var box = el('div', 'md-emptystate');
    var icon = el('div', 'md-emptystate__icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = svg(SICON.search, 'width="32" height="32"');
    box.appendChild(icon);
    box.appendChild(el('p', 'md-emptystate__title', t(titleKey)));
    box.appendChild(el('p', 'md-emptystate__text', t(textKey)));
    return box;
  }

  function scheduleSearch(delay) {
    clearTimeout(searchUi.timer);
    searchUi.timer = setTimeout(renderSearch, delay === undefined ? 150 : delay);
  }

  async function renderSearch() {
    clearTimeout(searchUi.timer);
    var mine = ++searchUi.seq;
    var query = searchUi.query;
    var input = $('#searchInput');
    if (input.value !== query) input.value = query;
    $('#searchClear').hidden = !query;
    var res;
    try {
      res = await CWJournal.search.run(query, {
        includeArchive: searchUi.filter === 'archive',
        resolveCommunity: resolveCommunity,
        labelVisit: labelVisit,
      });
    } catch (err) {
      if (mine !== searchUi.seq) return;
      $('#searchResults').replaceChildren(searchEmpty('j.search.none_title', 'j.search.error_text'));
      return;
    }
    // Ответ на устаревший запрос не перетирает более новый.
    if (mine !== searchUi.seq || parseHash().route !== 'search') return;

    var filters = $('#searchFilters');
    var out = $('#searchResults');
    if (!res.tokens.length) {
      filters.hidden = true;
      $('#searchStatus').textContent = '';
      out.replaceChildren(searchEmpty('j.search.empty_title', 'j.search.empty_text'));
      return;
    }
    var groups = { visits: [], records: [], tasks: [], nodes: [], archive: [] };
    res.results.forEach(function (r) { groups[searchGroupOf(r)].push(r); });
    var activeTotal = groups.visits.length + groups.records.length + groups.tasks.length + groups.nodes.length;
    var counts = { all: activeTotal, records: groups.records.length, tasks: groups.tasks.length,
      visits: groups.visits.length, nodes: groups.nodes.length,
      archive: searchUi.filter === 'archive' ? groups.archive.length : res.archivedCount };

    filters.hidden = false;
    filters.replaceChildren();
    SEARCH_FILTERS.forEach(function (f) {
      if (f === 'nodes' && !counts.nodes && searchUi.filter !== 'nodes') return;
      var b = el('button', 'md-chip' + (searchUi.filter === f ? ' selected' : ''), t('j.search.filter.' + f) + ' · ' + counts[f]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(searchUi.filter === f));
      b.addEventListener('click', function () {
        if (searchUi.filter === f) return;
        searchUi.filter = f;
        renderSearch();
      });
      filters.appendChild(b);
    });

    var show = searchUi.filter === 'all' ? SEARCH_GROUPS : [searchUi.filter];
    var frag = document.createDocumentFragment();
    var shown = 0;
    show.forEach(function (g) {
      var list = groups[g];
      if (!list.length) return;
      shown += list.length;
      var sec = el('div', 'j-sec j-sres__group');
      var head = el('div', 'j-sec__head j-sres__head');
      head.appendChild(el('h2', 'j-sec__title', t('j.search.group.' + g)));
      head.appendChild(el('span', 'j-sec__count', String(list.length)));
      sec.appendChild(head);
      list.forEach(function (r) { sec.appendChild(searchRow(r, query)); });
      frag.appendChild(sec);
    });
    if (!shown) {
      frag.appendChild(searchEmpty('j.search.none_title',
        searchUi.filter !== 'archive' && res.archivedCount ? 'j.search.none_text_archive' : 'j.search.none_text'));
    }
    if (res.protectedCount) {
      var note = el('div', 'j-sres__locked');
      var li = el('span', 'j-sres__lockico');
      li.innerHTML = svg(SICON.lock, 'width="18" height="18"');
      var txt = el('p', 'j-sres__locktext');
      txt.appendChild(el('b', '', t('j.search.protected_lead').replace('%d', String(res.protectedCount))));
      txt.appendChild(document.createTextNode(' ' + t('j.search.protected_text')));
      note.appendChild(li); note.appendChild(txt);
      frag.appendChild(note);
    }
    out.replaceChildren(frag);
    $('#searchStatus').textContent = t('j.search.count').replace('%d', String(shown));
  }

  function wireSearchChrome() {
    var input = $('#searchInput');
    input.addEventListener('input', function () {
      searchUi.query = input.value;
      $('#searchClear').hidden = !input.value;
      scheduleSearch();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); searchUi.query = input.value; renderSearch(); }
      else if (e.key === 'Escape' && input.value) { e.preventDefault(); clearSearch(); }
    });
    $('#searchClear').addEventListener('click', clearSearch);
  }
  function clearSearch() {
    searchUi.query = '';
    $('#searchInput').value = '';
    renderSearch();
    $('#searchInput').focus();
  }
  function requestSearchFocus() { searchUi.focusNext = true; }
  function consumeSearchFocus() { if (searchUi.focusNext) { searchUi.focusNext = false; focusSearch(); } }
  function focusSearch() {
    var input = $('#searchInput');
    input.focus();
    try { input.select(); } catch (_) { /* не все поля умеют select */ }
  }

  /* ═══ Архив (J6) ═════════════════════════════════════════════════════════
   * CWJournal.archive: только напрямую архивные узлы, посещения и (J7)
   * проекты, новые
   * сверху. «Восстановить» возвращает ТОЛЬКО выбранный объект (каскада нет);
   * если его предок всё ещё в архиве — строка это показывает, объект после
   * восстановления доступен по дереву, но в поиске остаётся архивным до
   * восстановления предка. Удаления здесь нет: архив — хранение, не корзина. */
  var archiveTab = 'all';

  function wireArchiveChrome() {
    $all('#route-archive [data-archive-tab]').forEach(function (b) {
      b.addEventListener('click', function () { archiveTab = b.getAttribute('data-archive-tab'); renderArchive(); });
    });
  }
  function formatDay(iso) {
    try {
      return new Intl.DateTimeFormat(uiLang(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)).replace(/\s(г|р)\.$/, '');
    } catch (_) { return String(iso).slice(0, 10); }
  }

  async function renderArchive() {
    var items;
    try { items = await CWJournal.archive.list(); } catch (_) { items = []; }
    if (parseHash().route !== 'archive') return;
    $all('#route-archive [data-archive-tab]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-archive-tab') === archiveTab);
    });
    var tabKind = { nodes: 'node', visits: 'visit', projects: 'project' };
    var list = items.filter(function (it) {
      return archiveTab === 'all' || it.kind === tabKind[archiveTab];
    });
    $('#archiveLede').textContent = t('j.archive.lede');
    var box = $('#archiveList');
    if (!list.length) {
      var empty = el('div', 'md-emptystate');
      var icon = el('div', 'md-emptystate__icon');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = svg(ICON.archive, 'width="32" height="32"');
      empty.appendChild(icon);
      empty.appendChild(el('p', 'md-emptystate__title', t('j.archive.empty_title')));
      empty.appendChild(el('p', 'md-emptystate__text', t('j.archive.empty_text')));
      box.replaceChildren(empty);
      return;
    }
    var sec = el('div', 'j-sec');
    var head = el('div', 'j-sec__head');
    head.appendChild(el('h2', 'j-sec__title', t('j.archive.tab_' + archiveTab)));
    head.appendChild(el('span', 'j-sec__count', String(list.length)));
    sec.appendChild(head);
    list.forEach(function (it) {
      var chain = it.chain || [];
      var row = el('div', 'j-row j-arch');
      var ico = el('div', 'j-row__ico');
      ico.innerHTML = svg(it.kind === 'visit' ? ICON.visit : it.kind === 'project' ? SICON.project : (ICON[it.row.kind] || ICON.group));
      var body = el('div', 'j-row__body j-arch__open');
      body.setAttribute('role', 'link');
      body.setAttribute('tabindex', '0');
      var titleText = it.kind === 'visit'
        ? capitalize(seasonLabel(it.row.dateFrom)) + ' · ' + formatRange(it.row.dateFrom, it.row.dateTo, true)
        : it.kind === 'project' ? textOr(it.row, 'title') : nodeName(it.row);
      body.appendChild(el('p', 'j-row__title', titleText));
      var parts = chain.map(nodeName);
      if (it.kind === 'node') parts.push(t('j.search.kind.' + it.row.kind));
      if (it.kind === 'project') parts.push(t('j.search.type.project'));
      var meta = crumbLine(parts, false);
      meta.appendChild(el('span', 'j-dot', '·'));
      meta.appendChild(el('span', '', it.archivedAt
        ? t('j.archive.archived_on').replace('%s', formatDay(it.archivedAt))
        : t('j.archive.no_date')));
      if (it.parentArchived) meta.appendChild(el('span', 'j-tag', t('j.archive.parent_archived')));
      body.appendChild(meta);
      var end = el('div', 'j-row__end');
      var restore = el('button', 'md-btn md-btn-text j-arch__restore', t('j.archive.restore'));
      restore.type = 'button';
      restore.addEventListener('click', async function () {
        restore.disabled = true;
        try { await CWJournal.archive.restore(it); }
        catch (err) { alert(errorMessage(err)); }
        renderArchive();
      });
      var open = el('button', 'md-icon-btn j-row__chevronbtn');
      open.type = 'button';
      open.setAttribute('aria-label', t('j.archive.open'));
      open.innerHTML = svg(ICON.chevron, 'width="18" height="18"');
      var go = function () { location.hash = destFor(it.kind, it.row, chain, it.kind === 'visit' ? it.row : null); };
      open.addEventListener('click', go);
      body.addEventListener('click', go);
      body.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      end.appendChild(restore); end.appendChild(open);
      row.appendChild(ico); row.appendChild(body); row.appendChild(end);
      sec.appendChild(row);
    });
    box.replaceChildren(sec);
  }

  /* Публикация для других файлов Журнала. */
  /** J8: блокировка — расшифрованные результаты уходят с экрана сразу,
   *  запрос в полёте отменяется; перерисовка затем ищет уже без ключа. */
  function forgetSearchResults() {
    searchUi.seq++;
    $('#searchResults').replaceChildren();
    $('#searchStatus').textContent = '';
  }

  A.consumeSearchFocus = consumeSearchFocus;
  A.forgetSearchResults = forgetSearchResults;
  A.focusSearch = focusSearch;
  A.renderArchive = renderArchive;
  A.renderSearch = renderSearch;
  A.requestSearchFocus = requestSearchFocus;
  A.wireArchiveChrome = wireArchiveChrome;
  A.wireSearchChrome = wireSearchChrome;
})();
