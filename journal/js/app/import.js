/** Журнал — «Импорт из Клиндария» (R3): однократный перенос объектов календаря
 *  в собственный состав Журнала. ТОЛЬКО по кнопке, только в одну сторону.
 *
 *  Источник — CWPlanner.listCommunities() (read-only). Ничего не пишется, пока
 *  человек не нажал «Импортировать». Запись — только добавление узлов:
 *   • уже есть = узел Журнала с тем же communityId (любой статус, включая архив);
 *     по названию не сопоставляется;
 *   • узел из календаря не удаляется и не перезаписывается, карточка справочника
 *     не правится (расщепление «имя (номер)» — лишь подсказка);
 *   • собрание создаётся в выбранном районе; родителя группе/предгруппе выбирает
 *     человек — подсказка по названию сама не применяется (D2);
 *   • связь узла с карточкой — через districts.claimAndLink (attach 'journal');
 *     не прошла — свежий узел убирается, а не остаётся наполовину связанным.
 *  Повторный прогон идемпотентен: перед записью граф узлов читается заново.
 *  Пользовательский текст вставляется только текстовыми узлами. */
(function () {
  'use strict';

  var A = self.CWJournalApp;

  function $() { return A.$.apply(this, arguments); }
  function el() { return A.el.apply(this, arguments); }
  function t() { return A.t.apply(this, arguments); }
  function nodeName() { return A.nodeName.apply(this, arguments); }
  function parseHash() { return A.parseHash.apply(this, arguments); }
  function bindDialogCleanup() { return A.bindDialogCleanup.apply(this, arguments); }
  function claimAndLink() { return A.claimAndLink.apply(this, arguments); }

  var KIND_LABEL = { congregation: 'j.tab.congregations', group: 'j.overview.stat.groups', pregroup: 'j.overview.stat.pregroups' };
  var runSeq = 0;

  function normImport(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim(); }

  /** Данные для предпросмотра. Ничего не пишет. */
  async function collect() {
    var P = self.CWPlanner;
    if (!P) return { state: 'unavailable' };
    try { await P.init(); } catch (e) { return { state: 'unavailable' }; }
    var st = P.status();
    if (st !== 'ok' && st !== 'empty') return { state: 'unavailable' };
    var all = await CWJournal.nodes.getAll();
    var circuits = CWJournal.sortNodes(all.filter(function (n) { return n.kind === 'circuit' && n.status !== 'archived'; }));
    var roster = await CWJournal.roster.read();
    var have = {};
    all.forEach(function (n) { if (n.communityId) have[n.communityId] = true; });
    var dirOk = A.isDirectoryReady();
    var rows = [], existing = 0;
    P.listCommunities().forEach(function (c) {
      if (have[c.communityId]) { existing++; return; }
      var rec = dirOk ? CWDirectory.get(c.communityId) : null;
      var name = (rec && rec.name) || c.name;
      var row = { c: c, kind: c.visitType, name: name, number: rec && rec.congNumber ? String(rec.congNumber) : '', checked: c.visitType === 'congregation', parent: '' };
      if (c.visitType === 'congregation' && !row.number && self.CWDirectory) {
        var guess = CWDirectory.parseName(name);
        if (guess.congNumber) row.numberHint = guess.congNumber;
      }
      rows.push(row);
    });
    return { state: 'ok', circuits: circuits, circuitId: circuits.length ? circuits[0].id : '', roster: roster, rows: rows, existing: existing };
  }

  /** Возможные родители: собрания Журнала + выбранные к импорту собрания. */
  function parentOptions(model) {
    var opts = [];
    var multi = model.circuits.length > 1;
    model.roster.congregations.forEach(function (it) {
      var label = nodeName(it.node);
      if (multi) { var c = model.circuits.filter(function (x) { return x.id === it.circuitId; })[0]; if (c) label += ' · ' + c.label; }
      opts.push({ value: it.node.id, label: label });
    });
    model.rows.forEach(function (r) {
      if (r.kind === 'congregation' && r.checked) opts.push({ value: 'new:' + r.c.communityId, label: r.name + ' +' });
    });
    return opts;
  }

  /** Подсказка родителя по названию — самую длинную совпавшую; не применяется. */
  function hintFor(row, opts) {
    var g = normImport(row.name), best = null;
    opts.forEach(function (o) {
      var n = normImport(o.label.replace(/ \+$/, '').split(' · ')[0]);
      if (n && g.indexOf(n) !== -1 && (!best || n.length > best.n)) best = { n: n.length, o: o };
    });
    return best ? best.o : null;
  }

  function displayName(r) { return r.number ? r.name + ' (' + r.number + ')' : r.name; }

  function selected(model) {
    return model.rows.filter(function (r) {
      if (!r.checked) return false;
      return r.kind === 'congregation' ? !!model.circuitId : !!r.parent;
    });
  }

  function paintImport(box, applyBtn, model, redraw) {
    box.replaceChildren();
    var opts = parentOptions(model);
    if (model.circuits.length > 1) {
      var lab = el('label', 'j-sec__hint', t('j.import.circuit'));
      var sel = el('select', 'j-import__select');
      model.circuits.forEach(function (c) { var o = el('option', '', c.label); o.value = c.id; if (c.id === model.circuitId) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () { model.circuitId = sel.value; redraw(); });
      lab.appendChild(sel); box.appendChild(lab);
    }
    var news = model.rows.filter(function (r) { return r.kind === 'congregation'; });
    var decide = model.rows.filter(function (r) { return r.kind !== 'congregation'; });
    function section(titleKey, list, isDecide) {
      if (!list.length) return;
      box.appendChild(el('h4', 'j-import__h', t(titleKey) + ' · ' + list.length));
      list.forEach(function (r) {
        var row = el('div', 'j-row j-import__row');
        var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!r.checked;
        cb.setAttribute('aria-label', displayName(r));
        cb.addEventListener('change', function () { r.checked = cb.checked; redraw(); });
        row.appendChild(cb);
        var body = el('div', 'j-row__body');
        body.appendChild(el('p', 'j-row__title', displayName(r)));
        var meta = [t(KIND_LABEL[r.kind])];
        if (r.numberHint) meta.push(t('j.import.number_hint'));
        body.appendChild(el('p', 'j-row__meta', meta.join(' · ')));
        if (isDecide) {
          var ps = el('select', 'j-import__select');
          ps.setAttribute('aria-label', t('j.import.parent'));
          var first = el('option', '', t('j.import.parent_pick')); first.value = ''; ps.appendChild(first);
          opts.forEach(function (o) { var op = el('option', '', o.label); op.value = o.value; if (o.value === r.parent) op.selected = true; ps.appendChild(op); });
          if (r.parent && !opts.some(function (o) { return o.value === r.parent; })) r.parent = '';
          ps.addEventListener('change', function () { r.parent = ps.value; r.checked = !!ps.value; redraw(); });
          body.appendChild(ps);
          var h = r.parent ? null : hintFor(r, opts);
          if (h) {
            var line = el('p', 'j-row__meta', t('j.import.hint').replace('%s', h.label.replace(/ \+$/, '')) + ' ');
            var acc = el('button', 'md-btn md-btn-text', t('j.import.hint_apply')); acc.type = 'button';
            acc.addEventListener('click', function () { r.parent = h.value; r.checked = true; redraw(); });
            line.appendChild(acc); body.appendChild(line);
          }
        }
        row.appendChild(body);
        box.appendChild(row);
      });
    }
    section('j.import.sec_new', news, false);
    section('j.import.sec_decide', decide, true);
    if (!model.rows.length) box.appendChild(el('p', 'j-sec__hint', t('j.import.nothing')));
    if (model.existing) box.appendChild(el('p', 'j-sec__hint', t('j.import.exists_n').replace('%d', String(model.existing))));
    var n = selected(model).length;
    applyBtn.textContent = t('j.import.apply').replace('%d', String(n));
    applyBtn.disabled = n === 0;
  }

  /** Запись. Граф читается заново: повторное нажатие/вторая вкладка не создаёт дублей. */
  async function apply(model) {
    var have = {};
    (await CWJournal.nodes.getAll()).forEach(function (n) { if (n.communityId) have[n.communityId] = true; });
    var done = 0, failed = 0, created = {};
    async function addLinked(kind, parentId, row) {
      var id = null;
      try {
        id = await CWJournal.nodes.add({ kind: kind, parentId: parentId, label: row.name });
        var node = await CWJournal.nodes.get(id);
        var res = await claimAndLink(node, row.c.communityId);
        if (!res.ok) { await CWJournal.nodes.remove(id); return null; }
        return id;
      } catch (e) {
        console.error('Журнал: импорт — строка не добавлена', e);
        if (id) { try { await CWJournal.nodes.remove(id); } catch (e2) { /* узел без связи остаётся виден в Составе */ } }
        return null;
      }
    }
    var sel = selected(model).filter(function (r) { return !have[r.c.communityId]; });
    var congs = sel.filter(function (r) { return r.kind === 'congregation'; });
    for (var i = 0; i < congs.length; i++) {
      var cid = await addLinked('congregation', model.circuitId, congs[i]);
      if (cid) { created[congs[i].c.communityId] = cid; done++; } else failed++;
    }
    var rest = sel.filter(function (r) { return r.kind !== 'congregation'; });
    for (var j = 0; j < rest.length; j++) {
      var p = rest[j].parent;
      var parentId = p.indexOf('new:') === 0 ? created[p.slice(4)] : p;
      var gid = parentId ? await addLinked(rest[j].kind, parentId, rest[j]) : null;
      if (gid) done++; else failed++;
    }
    return { done: done, failed: failed };
  }

  async function openImport() {
    var gen = ++runSeq;
    var dlg = $('#importDialog');
    var box = $('#importBody');
    var applyBtn = $('#importApply');
    var cancel = $('#importCancel');
    var lede = $('#importLede');
    lede.textContent = t('j.import.lede');
    box.replaceChildren(el('p', 'j-sec__hint', '…'));
    applyBtn.hidden = false; applyBtn.disabled = true; applyBtn.textContent = t('j.import.apply').replace('%d', '0');
    cancel.textContent = t('j.action.cancel');
    var model = null, busy = false, unbind;
    function cleanup() {
      applyBtn.removeEventListener('click', onApply);
      cancel.removeEventListener('click', onCancel);
      if (unbind) unbind();
    }
    function onCancel() { cleanup(); dlg.close(); }
    function redraw() { if (model && gen === runSeq) paintImport(box, applyBtn, model, redraw); }
    async function onApply() {
      if (busy || !model) return;
      busy = true; applyBtn.disabled = true;
      var res = await apply(model);
      box.replaceChildren(el('p', 'j-sec__hint', t('j.import.done').replace('%d', String(res.done)).replace('%d', String(res.failed))));
      applyBtn.hidden = true; cancel.textContent = t('j.import.close');
      busy = false;
      if (typeof A.renderRoster === 'function' && parseHash().route === 'roster') A.renderRoster();
    }
    applyBtn.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    unbind = bindDialogCleanup(dlg, cleanup);
    dlg.showModal();
    var data;
    try { data = await collect(); } catch (e) { console.error('Журнал: импорт не подготовлен', e); data = { state: 'unavailable' }; }
    if (gen !== runSeq) return;
    if (data.state !== 'ok') { box.replaceChildren(el('p', 'j-sec__hint', t('j.import.unavailable'))); applyBtn.hidden = true; return; }
    if (!data.circuits.length) { box.replaceChildren(el('p', 'j-sec__hint', t('j.import.no_circuit'))); applyBtn.hidden = true; return; }
    model = data;
    paintImport(box, applyBtn, model, redraw);
  }

  function wireImportChrome() {
    var b = $('#rosterImportBtn');
    if (b) b.addEventListener('click', openImport);
  }

  A.openImport = openImport;
  A.wireImportChrome = wireImportChrome;
})();
