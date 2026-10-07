/** Журнал — «Состав района» (R1): собрания, группы и предгруппы Журнала.
 *
 * Данные — только CWJournal.roster.read() (узлы журнала, не календарь).
 * Экран ТОЛЬКО ЧИТАЕТ: ничего не пишет, не кэширует и не сохраняет запрос —
 * ни в хэш, ни в localStorage. Подпись собрания — nodeName() (справочник,
 * иначе label узла), номер — из справочника, когда он готов.
 *
 * Устаревший ответ отбрасывается по номеру прогона (rosterRenderSeq).
 * Пользовательский текст вставляется только текстовыми узлами. */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  var ICON = A.ICON;

  function $() { return A.$.apply(this, arguments); }
  function $all() { return A.$all.apply(this, arguments); }
  function el() { return A.el.apply(this, arguments); }
  function isDirectoryReady() { return A.isDirectoryReady.apply(this, arguments); }
  function nodeName() { return A.nodeName.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function svg() { return A.svg.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }
  function revealActiveTab() { return A.revealActiveTab.apply(this, arguments); }

  var TAB_KEY = { congregations: 'congregations', groups: 'groups', pregroups: 'pregroups' };
  var rosterRenderSeq = 0;
  var rosterUi = { data: null, failed: false, bound: false, query: '' };

  function isCurrentRoster(gen) { return gen === rosterRenderSeq && parseHash().route === 'roster'; }

  function norm(s) { return String(s == null ? '' : s).toLocaleLowerCase(A.uiLang()).replace(/\s+/g, ' ').trim(); }

  /** Номер собрания — только из справочника и только когда он прочитан. */
  function numberOf(node) {
    if (node.kind !== 'congregation' || !node.communityId || !isDirectoryReady()) return '';
    var rec = self.CWDirectory ? CWDirectory.get(node.communityId) : null;
    return rec && rec.congNumber ? String(rec.congNumber) : '';
  }

  function hrefFor(item) {
    var R = CWJournalRoute.build;
    if (item.node.kind === 'congregation') return R.congregation(item.circuitId, item.node.id);
    if (item.parent && item.parent.kind === 'congregation') return R.congregation(item.circuitId, item.parent.id);
    return item.circuitId ? R.circuit(item.circuitId) : '#districts';
  }

  function circuitLabel(data, id) {
    var c = data.circuits.filter(function (x) { return x.id === id; })[0];
    return c ? c.label : '';
  }

  /** Текст строки для фильтра: название, номер, родитель, район. */
  function haystack(data, item, multi) {
    return norm([nodeName(item.node), numberOf(item.node), item.parent ? nodeName(item.parent) : '',
      multi ? circuitLabel(data, item.circuitId) : ''].join(' '));
  }

  function buildRow(data, item, multi) {
    var row = el('a', 'j-row j-row--link j-ovrow');
    row.href = hrefFor(item);
    var ico = el('div', 'j-row__ico');
    ico.innerHTML = svg('<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/>');
    row.appendChild(ico);
    var body = el('div', 'j-row__body');
    body.appendChild(el('p', 'j-row__title', nodeName(item.node)));
    var meta = el('p', 'j-row__meta');
    var parts = [];
    var num = numberOf(item.node);
    if (num) parts.push(t('j.roster.number').replace('%s', num));
    if (item.node.kind !== 'congregation') {
      parts.push(item.parent ? t('j.roster.parent').replace('%s', nodeName(item.parent)) : t('j.roster.no_parent'));
    }
    if (multi) parts.push(circuitLabel(data, item.circuitId));
    parts.filter(Boolean).forEach(function (p, i) {
      if (i) meta.appendChild(el('span', 'j-dot', '·'));
      meta.appendChild(document.createTextNode(p));
    });
    if (parts.length) body.appendChild(meta);
    row.appendChild(body);
    var end = el('div', 'j-row__end');
    end.innerHTML = svg(ICON.chevron, 'width="18" height="18"');
    row.appendChild(end);
    return row;
  }

  function setCounts(data) {
    Object.keys(TAB_KEY).forEach(function (k) {
      var n = $('#rosterCount_' + k);
      if (n) n.textContent = data ? String(data[k].length) : (rosterUi.failed ? '—' : '…');
    });
  }

  function paint(tab) {
    var box = $('#rosterList');
    var status = $('#rosterStatus');
    $all('[data-roster-tab]').forEach(function (b) {
      var on = b.getAttribute('data-roster-tab') === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    revealActiveTab($('#rosterTabs'));
    var data = rosterUi.data;
    setCounts(data);
    box.replaceChildren();
    if (!data) {
      status.textContent = '';
      if (rosterUi.failed) box.appendChild(el('p', 'j-sec__hint', t('j.roster.unavailable')));
      return;
    }
    var multi = data.circuits.length > 1;
    var q = norm(rosterUi.query);
    var all = data[tab] || [];
    var list = q ? all.filter(function (it) { return haystack(data, it, multi).indexOf(q) !== -1; }) : all;
    if (!list.length) {
      box.appendChild(el('p', 'j-sec__hint', t(q && all.length ? 'j.roster.no_match' : 'j.roster.empty_' + tab)));
      status.textContent = '';
      return;
    }
    var frag = document.createDocumentFragment();
    list.forEach(function (it) { frag.appendChild(buildRow(data, it, multi)); });
    box.appendChild(frag);
    status.textContent = list.length + ' / ' + all.length;
  }

  async function renderRoster() {
    var gen = ++rosterRenderSeq;
    var tab = parseHash().rosterTab;
    if (!(tab in TAB_KEY)) tab = 'congregations';
    paint(tab);
    var data = null, failed = false;
    try { data = await CWJournal.roster.read(); } catch (e) {
      failed = true;
      console.error('Журнал: состав не прочитан', e);
    }
    if (!isCurrentRoster(gen)) return;
    rosterUi.data = data;
    rosterUi.failed = failed;
    paint(tab);
  }

  function wireRosterChrome() {
    if (rosterUi.bound) return;
    rosterUi.bound = true;
    $all('[data-roster-tab]').forEach(function (b) {
      b.addEventListener('click', function () { location.hash = CWJournalRoute.build.roster(b.getAttribute('data-roster-tab')); });
    });
    var input = $('#rosterInput');
    var clear = $('#rosterClear');
    input.addEventListener('input', function () {
      rosterUi.query = input.value;
      clear.hidden = !input.value;
      if (parseHash().route === 'roster') paint(parseHash().rosterTab);
    });
    clear.addEventListener('click', function () {
      input.value = '';
      rosterUi.query = '';
      clear.hidden = true;
      paint(parseHash().rosterTab);
      input.focus();
    });
    /* Свежесть без опроса: узлы этой и соседних вкладок. */
    if (CWJournal.integration && CWJournal.integration.onChange) {
      CWJournal.integration.onChange(function () { if (parseHash().route === 'roster') renderRoster(); });
    }
  }

  A.renderRoster = renderRoster;
  A.wireRosterChrome = wireRosterChrome;
})();
