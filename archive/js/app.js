/**
 * Архив — страница модуля (шаг A2, 05.10.2026).
 *
 * ОБЯЗАННОСТИ (docs/db-migration/05-archive-schema.md §1): только показ,
 * поиск, группировка по служебным годам и удаление конверта по подтверждению.
 * Чужих блобов страница не читает и не пишет, `payload` не запрашивает —
 * `CWArchive.list()` его и не отдаёт. Записывают конверты модули-источники.
 *
 * ОТКАЗ НЕ МАСКИРУЕТСЯ. Недоступная база показывается как «архив недоступен»,
 * а не как «архив пуст»: это разные ответы, и второй при первом был бы ложью
 * (shared/archive.js, шапка).
 *
 * PIN КЛИНДАРИЯ. Пока PIN задан и не введён, конверты Клиндария не попадают ни
 * в список, ни в годы, ни в поиск (archive/js/logic.js: visible). Состояние
 * «открыто» живёт только в памяти страницы (archive/js/pin.js).
 *
 * ПИСЬМА. Показываются из `CWDocs` по `docRefs`; второй копии письма нет.
 * Кнопка удаления снимка с карточки УБРАНА: снимок письма — след, что бумага
 * ушла людям, и стирать его из чужой для него страницы нельзя (это делают в
 * «Документах»). Копирование текста остаётся.
 */
(function () {
  'use strict';

  var MODULE_ID = 'archive';
  var Logic = self.ArchiveLogic;
  var Pin = self.ArchivePin;

  var state = {
    rows: null,        // null — ещё грузим; массив — конверты без payload
    error: null,       // ошибка загрузки списка
    query: '',
    year: null,        // null — все годы
    openId: null,      // id открытой записи
    detailToken: 0,    // защита от гонки двух быстрых открытий
    letters: [],       // снимки писем открытой записи (для кнопки копирования)
  };

  var unbindLetters = null;
  var toastTimer = null;

  function $(sel) { return document.querySelector(sel); }
  function t(key, vars) { return self.CWI18n ? self.CWI18n.t(key, vars) : key; }
  function esc(v) { return self.CWEscape.html(v); }
  function lang() { return self.CWI18n ? self.CWI18n.getLang() : 'ru'; }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString(lang());
  }

  function moduleTitle(id) {
    var key = 'module.' + id + '.title';
    var s = t(key);
    return s === key ? id : s;
  }

  function toast(message) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2600);
  }

  function summaryLabel(key) {
    var k = 'arc.summary.' + key;
    var s = t(k);
    return s === k ? key : s;
  }

  /* ───────────────────────── список ───────────────────────── */

  function visibleRows() {
    return Logic.visible(state.rows || [], Pin.isLocked());
  }

  function renderYears(vis) {
    var box = $('#yearChips');
    var years = Logic.yearsOf(vis);
    if (state.year !== null && years.indexOf(state.year) < 0) state.year = null;
    if (!years.length) { box.hidden = true; return; }
    var chips = [{ year: null, label: t('arc.filter_all_years') }].concat(years.map(function (y) {
      return { year: y, label: Logic.yearLabel(y) };
    }));
    var label = box.querySelector('.sr-only');
    box.innerHTML = '';
    if (label) box.appendChild(label);
    box.insertAdjacentHTML('beforeend', chips.map(function (c) {
      var on = c.year === state.year;
      return '<button type="button" class="md-chip' + (on ? ' selected' : '') + '" aria-pressed="' + on
        + '" data-year="' + (c.year === null ? '' : c.year) + '">' + esc(c.label) + '</button>';
    }).join(''));
    box.hidden = false;
  }

  function itemHtml(r) {
    var meta = [fmtDate(r.archivedAt)];
    if (r.revision > 1) meta.push(t('arc.meta_revision', { n: r.revision }));
    var summary = Object.keys(r.summary || {}).map(function (k) {
      return summaryLabel(k) + ': ' + r.summary[k];
    });
    return '<li><button type="button" class="arc-item" data-open="' + self.CWEscape.attr(r.id) + '">'
      + '<span class="arc-item__head"><span class="arc-item__title">' + esc(r.title) + '</span>'
      + '<span class="arc-badge">' + esc(moduleTitle(r.module)) + '</span></span>'
      + '<p class="arc-item__meta">' + esc(meta.filter(Boolean).concat(summary).join(' · ')) + '</p>'
      + '</button></li>';
  }

  function renderList() {
    var locked = Pin.isLocked();
    $('#lockedBox').hidden = !locked;
    $('#lockBtn').hidden = !(Pin.isSet() && !locked);
    var list = $('#list');

    if (state.error) {
      $('#yearChips').hidden = true;
      list.innerHTML = '<div class="md-banner md-banner--error"><div class="md-banner__body">'
        + esc(t('arc.unavailable')) + '</div></div>';
      return;
    }
    if (state.rows === null) {
      $('#yearChips').hidden = true;
      list.innerHTML = '<div class="md-empty">' + esc(t('arc.loading')) + '</div>';
      return;
    }

    var vis = visibleRows();
    renderYears(vis);
    var shown = Logic.filter(vis, { query: state.query, year: state.year });

    if (!shown.length) {
      /* Пока раздел Клиндария закрыт, «архив пуст» утверждать нельзя: пустота
         видимой части ничего не говорит о закрытой. Тогда — только плашка. */
      if (locked && !vis.length) { list.innerHTML = ''; return; }
      list.innerHTML = '<div class="md-empty">'
        + esc(t(vis.length ? 'arc.nothing_found' : 'arc.empty')) + '</div>';
      return;
    }

    list.innerHTML = '<div class="arc-groups">' + Logic.groupByYear(shown).map(function (g) {
      return '<section class="arc-group"><h2 class="arc-group__title">' + esc(g.label) + '</h2>'
        + '<p class="arc-group__meta">' + esc(t('arc.group_count', { n: g.rows.length })) + '</p>'
        + '<ul class="arc-list">' + g.rows.map(itemHtml).join('') + '</ul></section>';
    }).join('') + '</div>';
  }

  function load() {
    state.error = null;
    return self.CWArchive.list().then(function (rows) {
      state.rows = rows;
    }).catch(function (e) {
      console.error('Архив: список не прочитан', e);
      state.rows = null;
      state.error = e || new Error('unknown');
    }).then(function () { renderList(); });
  }

  /* ───────────────────────── запись ───────────────────────── */

  function showScreen(name) {
    $('#listScreen').hidden = name !== 'list';
    $('#detailScreen').hidden = name !== 'detail';
    if (name === 'list') {
      state.openId = null;
      state.detailToken += 1;
      if (unbindLetters) { unbindLetters(); unbindLetters = null; }
      state.letters = [];
    }
    window.scrollTo(0, 0);
  }

  function sectionsHtml(rec) {
    var sections = (rec.display && rec.display.sections || []).filter(function (s) {
      return s.rows && s.rows.length;
    });
    if (!sections.length) return '<div class="md-empty">' + esc(t('arc.no_sections')) + '</div>';
    return sections.map(function (sec) {
      return '<section class="arc-section">'
        + (sec.heading ? '<h3 class="arc-section__title">' + esc(sec.heading) + '</h3>' : '')
        + '<ul class="arc-rows">' + sec.rows.map(function (r) {
          return '<li class="arc-row">'
            + (r.date ? '<div class="arc-row__date">' + esc(r.date) + '</div>' : '')
            + (r.title ? '<div class="arc-row__title">' + esc(r.title) + '</div>' : '')
            + (r.note ? '<div class="arc-row__note">' + esc(r.note) + '</div>' : '')
            + ((r.tags && r.tags.length) ? '<div class="arc-row__tags">' + r.tags.map(function (tag) {
              return '<span class="arc-badge">' + esc(tag) + '</span>';
            }).join('') + '</div>' : '')
            + '</li>';
        }).join('') + '</ul></section>';
    }).join('');
  }

  function detailHtml(rec) {
    var meta = [
      moduleTitle(rec.module),
      t('arc.meta_archived', { date: fmtDate(rec.archivedAt) }),
      rec.firstArchivedAt && rec.firstArchivedAt !== rec.archivedAt ? t('arc.meta_first', { date: fmtDate(rec.firstArchivedAt) }) : '',
      rec.revision > 1 ? t('arc.meta_revision', { n: rec.revision }) : '',
      rec.sourceVersion ? t('arc.meta_source_version', { v: rec.sourceVersion }) : '',
    ].filter(Boolean).join(' · ');
    var summaryKeys = Object.keys(rec.summary || {});
    return '<header><h2 class="arc-detail__title">' + esc(rec.title) + '</h2>'
      + '<p class="arc-detail__meta">' + esc(meta) + '</p></header>'
      + (summaryKeys.length ? '<ul class="arc-summary">' + summaryKeys.map(function (k) {
        return '<li>' + esc(summaryLabel(k) + ': ' + rec.summary[k]) + '</li>';
      }).join('') + '</ul>' : '')
      + sectionsHtml(rec)
      + ((rec.docRefs && rec.docRefs.length)
        ? '<section class="arc-section"><h3 class="arc-section__title">' + esc(t('arc.letters_title')) + '</h3>'
          + '<div class="arc-letters" id="letters"><div class="md-empty">' + esc(t('arc.loading')) + '</div></div></section>'
        : '')
      + '<div class="arc-actions">'
      /* A5: Архив сам ничего не восстанавливает — он только ведёт в модуль-
         источник, а тот, владелец своих данных, проверяет конфликт, снимает
         копию и спрашивает подтверждение. */
      + (Object.prototype.hasOwnProperty.call(self.CWArchive.SOURCES, rec.module)
        ? '<a class="md-btn md-btn-filled md-state-layer" id="restoreBtn" href="'
          + esc('../' + rec.module + '/#archive-restore=' + encodeURIComponent(rec.id)) + '">'
          + esc(t('arc.restore_btn', { module: moduleTitle(rec.module) })) + '</a>'
        : '')
      + '<button type="button" class="md-btn md-btn-outlined md-state-layer" id="deleteBtn">'
      + esc(t('arc.delete_btn')) + '</button></div>';
  }

  /* Письма по docRefs. Отказ чтения — отдельное сообщение, а не «писем нет»:
     listStrict() не превращает сбой в пустой список. */
  function loadLetters(rec, token) {
    var box = $('#letters');
    if (!box) return;
    var refs = (rec.docRefs || []).map(Logic.parseDocRef).filter(Boolean);
    var strict = self.CWDocs && self.CWDocs.listStrict;
    if (!strict) { box.innerHTML = '<div class="md-empty">' + esc(t('arc.letters_failed')) + '</div>'; return; }
    Promise.all(refs.map(function (ref) { return self.CWDocs.listStrict(ref); })).then(function (parts) {
      if (token !== state.detailToken) return;
      var seen = {};
      var docs = [].concat.apply([], parts).filter(function (d) {
        if (seen[d.id]) return false;
        seen[d.id] = true;
        return true;
      });
      state.letters = docs;
      if (!docs.length) { box.innerHTML = '<div class="md-empty">' + esc(t('arc.letters_none')) + '</div>'; return; }
      box.innerHTML = docs.map(function (d) { return self.CWDocsView.cardHtml(d); }).join('');
      /* Удаление снимка из Архива недоступно: кнопки нет. */
      Array.prototype.forEach.call(box.querySelectorAll('[data-cwdoc-remove]'), function (b) { b.remove(); });
      if (unbindLetters) unbindLetters();
      unbindLetters = self.CWDocsView.bind(box, function () { return state.letters; }, {
        onCopied: function () { toast(t('doc.copied')); },
      });
    }).catch(function (e) {
      console.error('Архив: письма не прочитаны', e);
      if (token !== state.detailToken) return;
      box.innerHTML = '<div class="md-banner md-banner--error"><div class="md-banner__body">'
        + esc(t('arc.letters_failed')) + '</div></div>';
    });
  }

  function openRecord(id) {
    var token = ++state.detailToken;
    self.CWArchive.get(id).then(function (rec) {
      if (token !== state.detailToken) return;
      /* Защита в глубину: закрытый конверт не открывается, даже если id
         как-то оказался известен (список его и так не показывает). */
      if (!rec || (rec.module === Logic.GATED_MODULE && Pin.isLocked())) {
        toast(t('arc.open_failed'));
        return;
      }
      showScreen('detail');
      state.openId = rec.id;
      $('#detail').innerHTML = detailHtml(rec);
      loadLetters(rec, token);
    }).catch(function (e) {
      console.error('Архив: запись не открыта', e);
      toast(t('arc.open_failed'));
    });
  }

  function deleteRecord() {
    var id = state.openId;
    if (!id) return;
    var rec = (state.rows || []).filter(function (r) { return r.id === id; })[0];
    var title = rec ? rec.title : id;
    if (!window.confirm(t('arc.confirm_delete', { title: title }))) return;
    self.CWArchive.remove(id, { confirmed: true }).then(function () {
      toast(t('arc.deleted'));
      showScreen('list');
      return load();
    }).catch(function (e) {
      console.error('Архив: удаление не удалось', e);
      toast(t('arc.delete_failed'));
    });
  }

  /* ───────────────────────── PIN ───────────────────────── */

  function openPinDialog() {
    var dlg = $('#pinDialog');
    $('#pinInput').value = '';
    $('#pinError').textContent = '';
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    $('#pinInput').focus();
  }

  function closePinDialog() {
    var dlg = $('#pinDialog');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  function onPinSubmit(event) {
    event.preventDefault();
    var input = $('#pinInput');
    if (Pin.unlock(input.value)) {
      input.value = '';
      closePinDialog();
      renderList();
    } else {
      input.value = '';
      $('#pinError').textContent = t('arc.pin_wrong');
      input.focus();
    }
  }

  /* ───────────────────────── связка ───────────────────────── */

  function renderAll() {
    renderList();
    if (state.openId && !$('#detailScreen').hidden) {
      /* Смена языка интерфейса: подписи записи собраны при открытии, поэтому
         открываем её заново (данные те же, подписи — на новом языке). */
      openRecord(state.openId);
    }
  }

  function bind() {
    $('#search').addEventListener('input', function (e) {
      state.query = e.target.value;
      renderList();
    });
    $('#yearChips').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-year]');
      if (!btn) return;
      state.year = btn.getAttribute('data-year') === '' ? null : Number(btn.getAttribute('data-year'));
      renderList();
    });
    $('#list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-open]');
      if (btn) openRecord(btn.getAttribute('data-open'));
    });
    $('#backBtn').addEventListener('click', function () { showScreen('list'); });
    $('#detail').addEventListener('click', function (e) {
      if (e.target.closest('#deleteBtn')) deleteRecord();
    });
    $('#unlockBtn').addEventListener('click', openPinDialog);
    $('#pinForm').addEventListener('submit', onPinSubmit);
    $('#pinCancel').addEventListener('click', closePinDialog);
    $('#lockBtn').addEventListener('click', function () {
      Pin.lock();
      /* Открытая запись Клиндария закрывается вместе с разделом. */
      var open = (state.rows || []).filter(function (r) { return r.id === state.openId; })[0];
      if (open && open.module === Logic.GATED_MODULE) showScreen('list');
      renderList();
    });
  }

  function boot() {
    if (self.CWI18n) {
      self.CWI18n.bindModule({ module: MODULE_ID, versionSlot: 'moduleVersion', onChange: renderAll });
    }
    var version = (self.CW_MODULES && self.CW_MODULES[MODULE_ID] || {}).version;
    if (version) $('#moduleVersion').textContent = 'v' + version;
    bind();
    renderList();
    load();
    if (typeof self.CWUpdate !== 'undefined') self.CWUpdate.init({ swUrl: './sw.js', ui: 'silent', hubHref: '../index.html' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
