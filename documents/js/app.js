/**
 * Документы — библиотека шаблонов и общий редактор.
 *
 * ЧТО ЭТОТ МОДУЛЬ ЕСТЬ И ЧЕГО В НЁМ НЕТ. Он не хранит ничего своего: данные
 * лежат в общем слое (`CWDB.templates` + системные тексты в
 * `shared/templates/builtin.js`), а модуль — это интерфейс к ним. Поэтому
 * своего localStorage-ключа у него нет вовсе, и в резервной копии он
 * представлен хранилищем `templates`, а не собственными данными.
 *
 * ГРАНИЦА, КОТОРУЮ НЕЛЬЗЯ РАЗМЫВАТЬ: здесь правится текст, ПРИНАДЛЕЖАЩИЙ
 * ПОЛЬЗОВАТЕЛЮ. Письмо «Назначений» и формуляры Школы пионеров сюда не
 * попадают и попадать не должны — их формулировку правит носитель языка в
 * словаре, а не пользователь в браузере.
 *
 * ЯЗЫК ИНТЕРФЕЙСА И ЯЗЫК ДОКУМЕНТА — РАЗНЫЕ ВЕЩИ. Секретарь может работать в
 * польском интерфейсе и править украинское письмо; переключатель языка
 * документа отдельный и на интерфейс не влияет.
 */
(function () {
  'use strict';

  var MODULE_ID = 'documents';

  var $ = function (sel) { return document.querySelector(sel); };
  var t = function (key, vars) { return self.CWI18n ? self.CWI18n.t(key, vars) : key; };

  /* Человеческие названия системных шаблонов. Записи в builtin.js несут
     техническое `title` для журналов; в интерфейсе показываем переводимое имя.
     У пользовательских шаблонов (например, письмо под конкретный тип задания)
     ключа нет — тогда показывается их собственный title. */
  var NAME_KEYS = {
    'sys.congress.assignment.invitation': 'doc.name.congress_invitation',
    'sys.visit.congregation.letter': 'doc.name.visit_letter_congregation',
    'sys.visit.group.letter': 'doc.name.visit_letter_group',
    'sys.visit.pregroup.letter': 'doc.name.visit_letter_pregroup',
    'sys.visit.congregation.email': 'doc.name.visit_email_congregation',
    'sys.visit.group.email': 'doc.name.visit_email_group',
    'sys.visit.pregroup.email': 'doc.name.visit_email_pregroup',
    'sys.visit.congregation.salutation': 'doc.name.visit_salutation_congregation',
    'sys.visit.group.salutation': 'doc.name.visit_salutation_group',
    'sys.visit.pregroup.salutation': 'doc.name.visit_salutation_pregroup',
  };

  /* Какие пространства переменных показывать. Чужие не предлагаем: движок их
     не подставит (пространство не передано модулем), и предлагать их значило
     бы обманывать. */
  var NAMESPACES_BY_MODULE = {
    'congress-project': ['sender', 'congress', 'assignment', 'doc'],
    'circuit-planner': ['sender', 'congregation', 'visit', 'doc'],
    'pioneer-school': ['sender', 'student', 'school', 'doc'],
  };

  var state = {
    screen: 'library',
    filter: 'all',
    search: '',
    id: null,
    lang: null,
    view: 'edit',
    dirty: false,
  };

  /* ─────────────────────────  Вспомогательное  ───────────────────────── */

  /* Делегирование в общий слой (28.08.2026). Своя редакция убрана: их было
     шесть, и они расходились — три экранировали апостроф, три нет.
     Обоснование набора символов — в шапке shared/escape.js. */
  function escapeHtml(s) {
    return self.CWEscape.html(s);
  }

  function status(key) {
    var el = $('#saveStatus');
    if (el) el.textContent = key ? t(key) : '';
  }

  function templates() {
    return self.CWTemplates && self.CWTemplates.all ? self.CWTemplates.all() : [];
  }

  function nameOf(tpl) {
    var key = NAME_KEYS[tpl.id];
    return key ? t(key) : (tpl.title || tpl.id);
  }

  /** Вид документа выводится из контекста: …letter / …email / …salutation. */
  function kindOf(tpl) {
    var ctx = String(tpl.context || '');
    if (/\.email$/.test(ctx)) return { key: 'doc.kind.email', icon: 'mail' };
    if (/\.salutation$/.test(ctx)) return { key: 'doc.kind.salutation', icon: 'lines' };
    return { key: 'doc.kind.letter', icon: 'page' };
  }

  function moduleLabel(tpl) {
    return tpl.module ? t('module.' + tpl.module + '.title') : '';
  }

  function icon(name) {
    if (name === 'mail') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
    if (name === 'lines') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5h5"/><path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z"/></svg>';
  }

  /* ─────────────────────────  Библиотека  ───────────────────────── */

  var FILTERS = [
    { key: 'all', label: 'doc.filter_all' },
    { key: 'congress-project', label: 'module.congress-project.title' },
    { key: 'circuit-planner', label: 'module.circuit-planner.title' },
    { key: 'pioneer-school', label: 'module.pioneer-school.title' },
    { key: 'custom', label: 'doc.filter_custom' },
  ];

  function renderFilters() {
    $('#filters').innerHTML = FILTERS.map(function (f) {
      var on = state.filter === f.key;
      return '<button type="button" class="md-chip' + (on ? ' selected' : '') + '"'
        + ' aria-pressed="' + on + '" data-filter="' + f.key + '">' + escapeHtml(t(f.label)) + '</button>';
    }).join('');
  }

  function matches(tpl) {
    if (state.filter === 'custom' && !tpl.custom) return false;
    if (state.filter !== 'all' && state.filter !== 'custom' && tpl.module !== state.filter) return false;
    if (!state.search) return true;
    var q = state.search.toLowerCase();
    if (nameOf(tpl).toLowerCase().indexOf(q) >= 0) return true;
    var tr = tpl.translations || {};
    return Object.keys(tr).some(function (lang) {
      var entry = tr[lang] || {};
      return String(entry.body || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderList() {
    var rows = templates().filter(matches).sort(function (a, b) {
      return (a.module || '').localeCompare(b.module || '') || nameOf(a).localeCompare(nameOf(b));
    });
    if (!rows.length) {
      $('#list').innerHTML = '<div class="md-empty">' + escapeHtml(t('doc.nothing_found')) + '</div>';
      return;
    }
    $('#list').innerHTML = rows.map(function (tpl) {
      var kind = kindOf(tpl);
      var tr = tpl.translations || {};
      var pills = Object.keys(tr).map(function (lang) {
        var filled = !!(tr[lang] && tr[lang].body);
        return '<span class="lang-pill ' + (filled ? 'lang-pill--filled' : 'lang-pill--pending') + '">'
          + escapeHtml(lang.toUpperCase()) + '</span>';
      }).join('');
      var pages = (tpl.pages || []).length;
      var meta = [escapeHtml(t(kind.key)), moduleLabel(tpl)].filter(Boolean).join(' · ')
        + (pages ? ' · ' + escapeHtml(t('doc.extra_pages', { n: pages })) : '');
      return '<button type="button" class="doc-row" data-open="' + escapeHtml(tpl.id) + '">'
        + '<span class="doc-row__icon" aria-hidden="true">' + icon(kind.icon) + '</span>'
        + '<span><span class="doc-row__name">' + escapeHtml(nameOf(tpl)) + '</span>'
        + '<span class="doc-row__meta">' + escapeHtml(meta) + '</span>'
        + '<span class="doc-row__langs">' + pills + '</span></span>'
        + '<span class="md-chip">' + escapeHtml(t(tpl.custom ? 'doc.badge_custom' : 'doc.badge_system')) + '</span>'
        + '</button>';
    }).join('');
  }

  /* ─────────────────────────  Архив  ─────────────────────────
     Второй раздел модуля: документы, которые УЖЕ покинули приложение.
     Отличие от библиотеки принципиальное и потому вынесено в отдельный экран:
     в библиотеке текст правится, здесь он неизменен. Редактирования тут нет
     вообще — только чтение, копирование и удаление записи.

     Группировка по сущности, а не плоский список: все бумаги одного визита
     нужны вместе, а плоский список из сотен писем нечитаем (правило из
     docs/documents/00-proposal.md, раздел 11). */

  var archive = { rows: null, search: '', filter: 'all', loading: false };

  var ARCHIVE_FILTERS = [
    { key: 'all', label: 'doc.filter_all' },
    { key: 'congress-project', label: 'module.congress-project.title' },
    { key: 'circuit-planner', label: 'module.circuit-planner.title' },
    { key: 'pioneer-school', label: 'module.pioneer-school.title' },
  ];

  function renderArchiveFilters() {
    $('#archiveFilters').innerHTML = ARCHIVE_FILTERS.map(function (f) {
      var on = archive.filter === f.key;
      return '<button type="button" class="md-chip' + (on ? ' selected' : '') + '"'
        + ' aria-pressed="' + on + '" data-afilter="' + f.key + '">' + escapeHtml(t(f.label)) + '</button>';
    }).join('');
  }

  function archiveMatches(doc) {
    if (archive.filter !== 'all' && (doc.module || '') !== archive.filter) return false;
    if (!archive.search) return true;
    var q = archive.search.toLowerCase();
    return String(doc.entityTitle || '').toLowerCase().indexOf(q) >= 0
      || String(doc.subject || '').toLowerCase().indexOf(q) >= 0
      || String(doc.body || '').toLowerCase().indexOf(q) >= 0;
  }

  /* Вид документа, подпись причины, текст для копирования и сама карточка
     снимка живут в общем `CWDocsView` (shared/docsview.js). Здесь эти
     четыре функции были СВОЕЙ копией — второй в проекте после Клиндария,
     и копии уже разошлись по вёрстке. 25.08.2026 модуль переведён на
     общий слой; отбор (`archiveMatches`) и группировка по сущностям
     остались здесь, потому что они принадлежат этому экрану. */

  function renderArchive() {
    var box = $('#archiveList');
    if (archive.loading) { box.innerHTML = '<div class="md-empty">' + escapeHtml(t('doc.archive_loading')) + '</div>'; return; }
    if (!archive.rows) { box.innerHTML = ''; return; }
    if (!archive.rows.length) { box.innerHTML = '<div class="md-empty">' + escapeHtml(t('doc.archive_empty')) + '</div>'; return; }

    var rows = archive.rows.filter(archiveMatches);
    if (!rows.length) { box.innerHTML = '<div class="md-empty">' + escapeHtml(t('doc.archive_nothing_found')) + '</div>'; return; }

    /* Группы идут в порядке свежести своего последнего документа: сверху то,
       чем занимались только что. */
    var groups = [];
    var index = {};
    rows.forEach(function (doc) {
      var key = doc.entityKey || (doc.ref ? [doc.ref.module, doc.ref.entity, doc.ref.id].join(':') : '');
      if (!index[key]) { index[key] = { key: key, docs: [], doc: doc }; groups.push(index[key]); }
      index[key].docs.push(doc);
    });

    box.innerHTML = groups.map(function (group) {
      var head = group.doc;
      var title = head.entityTitle || escapeHtml(t('doc.archive_entity_gone'));
      var meta = [
        head.module ? escapeHtml(t('module.' + head.module + '.title')) : '',
        escapeHtml(t('doc.archive_docs_count', { n: group.docs.length })),
      ].filter(Boolean).join(' · ');
      return '<section class="arc-group">'
        + '<h3 class="arc-group__title">' + escapeHtml(title) + '</h3>'
        + '<p class="arc-group__meta">' + escapeHtml(meta) + '</p>'
        + group.docs.map(self.CWDocsView.cardHtml).join('')
        + '</section>';
    }).join('');
  }

  function loadArchive(force) {
    if (!self.CWDocs || !self.CWDocs.available()) {
      archive.rows = [];
      renderArchive();
      return;
    }
    if (archive.rows && !force) { renderArchive(); return; }
    archive.loading = true;
    renderArchive();
    self.CWDocs.listAll().then(function (rows) {
      archive.loading = false;
      archive.rows = rows;
      renderArchive();
    }).catch(function (error) {
      console.error('Документы: не удалось прочитать архив', error);
      archive.loading = false;
      archive.rows = [];
      renderArchive();
    });
  }

  function showScreen(name) {
    /* Редактор — не раздел, а состояние библиотеки: уходя в архив, из него
       выходим, иначе несохранённая правка осталась бы висеть невидимой. */
    if (name !== 'library' && state.id) {
      if (state.dirty && !window.confirm(t('doc.confirm_leave'))) return;
      showLibrary();
    }
    state.screen = name;
    $('#screenLibrary').hidden = name !== 'library' || !!state.id;
    $('#screenEditor').hidden = !(name === 'library' && state.id);
    $('#screenArchive').hidden = name !== 'archive';
    $('#screenDirectory').hidden = name !== 'directory';
    Array.prototype.forEach.call(document.querySelectorAll('[data-screen]'), function (btn) {
      var on = btn.dataset.screen === name;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    if (name === 'archive') loadArchive(false);
    if (name === 'directory') loadDirectory();
  }

  /* ───────────────────  Общий справочник собраний  ───────────────────

     ТОЛЬКО ПРОСМОТР. Правка и удаление отсюда сделали бы «Документы» вторым
     ПИШУЩИМ модулем справочника — отдельное решение с последствиями (окно
     выбора области удаления Клиндария впервые начало бы срабатывать, четыре
     ключа `cp.delete_*` стали бы видимы на разрушительном действии), а не
     побочный эффект экрана просмотра.

     Экран нужен потому, что до него ВЕСЬ справочник не был виден нигде:
     Клиндарий строит список из своих событий, Конгрессы подмешивают записи
     только в подсказки поля «Собрание». Карточка без своего события в
     Клиндарии не показывалась ни в одном модуле — а появиться она может,
     например, при восстановлении старой резервной копии, где раздел
     `communities` сливается, а не заменяется. */
  var directory = { rows: null, search: '' };

  function dirCardHtml(record) {
    var rows = [
      [t('cong.field.number'), record.congNumber],
      [t('cp.address'), record.address],
      [t('cp.contact_name'), record.contactName],
      [t('cp.contact_phone'), record.contactPhone],
      [t('cp.contact_email'), record.contactEmail],
      [t('cp.contact_note'), record.contactNote],
    ].filter(function (pair) { return String(pair[1] || '').trim(); });
    /* Источники показываем названиями модулей из общего словаря, а не
       идентификаторами: `circuit-planner` в интерфейсе — это протечка
       внутреннего имени наружу. */
    var sources = (record.sources || []).map(function (id) {
      return t('module.' + id + '.title');
    }).filter(Boolean).join(' · ');
    return '<article class="dir-card">'
      + '<h3 class="dir-card__name">' + escapeHtml(record.name || '') + '</h3>'
      + (sources ? '<p class="dir-card__sources">' + escapeHtml(sources) + '</p>' : '')
      + (rows.length ? '<dl class="dir-card__rows">' + rows.map(function (pair) {
          return '<dt>' + escapeHtml(pair[0]) + '</dt><dd>' + escapeHtml(pair[1]) + '</dd>';
        }).join('') + '</dl>' : '')
      + '</article>';
  }

  function renderDirectory() {
    var box = $('#dirList');
    if (!box) return;
    if (!directory.rows) { box.innerHTML = '<div class="md-empty">' + escapeHtml(t('doc.archive_loading')) + '</div>'; return; }
    if (!directory.rows.length) { box.innerHTML = '<div class="md-empty">' + escapeHtml(t('doc.archive_nothing_found')) + '</div>'; return; }
    var q = directory.search.trim().toLowerCase();
    var rows = q ? directory.rows.filter(function (r) {
      return String(r.name || '').toLowerCase().indexOf(q) >= 0
        || String(r.congNumber || '').toLowerCase().indexOf(q) >= 0
        || String(r.address || '').toLowerCase().indexOf(q) >= 0;
    }) : directory.rows;
    if (!rows.length) { box.innerHTML = '<div class="md-empty">' + escapeHtml(t('doc.archive_nothing_found')) + '</div>'; return; }
    box.innerHTML = rows.map(dirCardHtml).join('');
  }

  function loadDirectory() {
    if (!self.CWDirectory || !self.CWDirectory.ready) { directory.rows = []; renderDirectory(); return; }
    /* Сортировка по названию, а не по времени правки: справочник читают как
       список, а не как ленту. Пустое имя вниз — такая карточка это сбой,
       и прятать её в середине списка незачем. */
    directory.rows = self.CWDirectory.all().sort(function (a, b) {
      return String(a.name || '\uffff').localeCompare(String(b.name || '\uffff'),
        self.CWI18n ? self.CWI18n.getLang() : 'ru');
    });
    renderDirectory();
  }

  /* ─────────────────────────  Редактор  ───────────────────────── */

  function currentTpl() {
    return state.id && self.CWTemplates ? self.CWTemplates.get(state.id) : null;
  }

  function isHtml(tpl) { return (tpl && tpl.format) === 'html'; }

  /** Сырой текст выбранной языковой колонки — БЕЗ подстановки запасного языка:
      в редакторе нужно видеть, что колонка пуста, а не чужой текст. */
  function columnBody(tpl, lang) {
    var entry = (tpl.translations || {})[lang];
    return entry && entry.body ? entry.body : '';
  }

  function openEditor(id) {
    var tpl = self.CWTemplates.get(id);
    if (!tpl) return;
    state.id = id;
    state.dirty = false;
    var langs = Object.keys(tpl.translations || {});
    var wanted = self.CWDocLang ? self.CWDocLang.get() : null;
    state.lang = langs.indexOf(wanted) >= 0 ? wanted : langs[0];
    $('#screenLibrary').hidden = true;
    $('#screenEditor').hidden = false;
    $('#edTitle').textContent = nameOf(tpl);
    $('#edBadge').textContent = t(tpl.custom ? 'doc.badge_custom' : 'doc.badge_system');
    $('#resetBtn').hidden = !tpl.custom;
    $('#tabPages').hidden = !isHtml(tpl);
    renderLangs();
    renderVars();
    loadColumn();
    setView('edit');
    window.scrollTo(0, 0);
  }

  function showLibrary() {
    state.id = null;
    $('#screenEditor').hidden = true;
    $('#screenLibrary').hidden = false;
    renderList();
  }

  function renderLangs() {
    var tpl = currentTpl();
    var tr = tpl.translations || {};
    $('#edLangs').innerHTML = Object.keys(tr).map(function (lang) {
      var on = state.lang === lang;
      var filled = !!(tr[lang] && tr[lang].body);
      return '<button type="button" class="md-chip' + (on ? ' selected' : '') + '"'
        + ' aria-pressed="' + on + '" data-lang="' + lang + '">' + lang.toUpperCase()
        + (filled ? '' : ' · ' + escapeHtml(t('doc.lang_empty'))) + '</button>';
    }).join('');

    /* Пустая колонка — не ошибка, а «перевода пока нет». Говорим об этом
       прямо и называем язык, который увидит получатель документа. */
    var pending = $('#edPending');
    if (columnBody(tpl, state.lang)) { pending.hidden = true; return; }
    var fallback = Object.keys(tr).filter(function (l) { return tr[l] && tr[l].body; })[0];
    pending.hidden = false;
    pending.textContent = fallback
      ? t('doc.pending_with_fallback', { lang: fallback.toUpperCase() })
      : t('doc.pending_empty');
  }

  function loadColumn() {
    var tpl = currentTpl();
    var body = columnBody(tpl, state.lang);
    var html = isHtml(tpl);
    $('#rteToolbar').hidden = !html;
    $('#edArea').hidden = html;
    $('#edRte').hidden = !html;
    if (html) $('#edRte').innerHTML = body; else $('#edArea').value = body;
    renderPages();
    renderPreview();
  }

  function editorValue() {
    var tpl = currentTpl();
    return isHtml(tpl) ? $('#edRte').innerHTML : $('#edArea').value;
  }

  function setView(view) {
    state.view = view;
    Array.prototype.forEach.call(document.querySelectorAll('.doc-tab'), function (btn) {
      btn.setAttribute('aria-selected', String(btn.dataset.view === view));
    });
    $('#viewEdit').hidden = view !== 'edit';
    $('#viewPreview').hidden = view !== 'preview';
    $('#viewPages').hidden = view !== 'pages';
    if (view === 'preview') renderPreview();
  }

  /* ─── Предпросмотр ─── */

  /** Демонстрационные значения из реестра переменных — не выдуманные здесь. */
  function demoData() {
    var registry = self.CW_TEMPLATE_NAMESPACES || {};
    var data = {};
    Object.keys(registry).forEach(function (ns) {
      var fields = registry[ns].fields || {};
      data[ns] = {};
      Object.keys(fields).forEach(function (f) { data[ns][f] = fields[f].example || ''; });
    });
    if (self.CWSender) {
      var sender = self.CWSender.get();
      Object.keys(sender).forEach(function (k) { if (sender[k]) data.sender[k] = sender[k]; });
    }
    return data;
  }

  /** Текстовый формат: те же правила, что при печати письма в Конгрессах. */
  function plainToHtml(text) {
    return escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .split(/\n\s*\n/).map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
  }

  function renderPreview() {
    var tpl = currentTpl();
    if (!tpl) return;
    /* Экранирование ЗНАЧЕНИЙ включается только для html-шаблонов: результат
       текстового и так проходит через plainToHtml(), а двойное экранирование
       показало бы `&amp;` вместо `&`. Флаг ставится по формату шаблона —
       движку формат неизвестен. */
    var html = isHtml(tpl);
    var body = self.CWTemplates.render(editorValue(), demoData(), { escape: html });
    $('#edPreview').innerHTML = html ? body : plainToHtml(body);
  }

  /* ─── Переменные ─── */

  function renderVars() {
    var tpl = currentTpl();
    var list = NAMESPACES_BY_MODULE[tpl.module] || ['sender', 'doc'];
    var groups = {};
    self.CWTemplates.tokens(list).forEach(function (v) {
      (groups[v.ns] = groups[v.ns] || []).push(v);
    });
    $('#varsList').innerHTML = Object.keys(groups).map(function (ns) {
      return '<h4>' + ns + '.*</h4>' + groups[ns].map(function (v) {
        /* Прежнее написание показываем рядом: свой старый шаблон человек должен
           узнать с первого взгляда. Старые имена работают всегда. */
        var legacy = v.aliases.length ? '<small>' + escapeHtml(t('doc.was_named', { name: '{{' + v.aliases[0] + '}}' })) + '</small>' : '';
        return '<button type="button" data-token="' + escapeHtml(v.token) + '">' + escapeHtml(v.token) + legacy + '</button>';
      }).join('');
    }).join('');
  }

  function insertToken(token) {
    var tpl = currentTpl();
    if (isHtml(tpl)) {
      var rte = $('#edRte');
      rte.focus();
      var sel = window.getSelection();
      if (sel && sel.rangeCount && rte.contains(sel.anchorNode)) {
        var range = sel.getRangeAt(0);
        range.deleteContents();
        var node = document.createTextNode(token);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        rte.appendChild(document.createTextNode(token));
      }
    } else {
      var area = $('#edArea');
      var a = area.selectionStart || 0;
      var b = area.selectionEnd || 0;
      area.value = area.value.slice(0, a) + token + area.value.slice(b);
      area.focus();
      area.selectionStart = area.selectionEnd = a + token.length;
    }
    markDirty();
  }

  /* ─── Страницы ─── */

  function pagesOf() {
    var tpl = currentTpl();
    return (tpl && tpl.pages ? tpl.pages : []).map(function (p) {
      return { id: p.id, title: p.title || '', html: p.html || '' };
    });
  }

  var pagesDraft = [];

  function pageCardHtml(page, i) {
    return '<div class="page-card" data-page="' + escapeHtml(page.id) + '">'
      + '<div class="page-card__head">'
      + '<span class="md-chip">' + escapeHtml(t('doc.page_n', { n: i + 2 })) + '</span>'
      + '<input type="text" class="page-card__title" value="' + escapeHtml(page.title) + '"'
      + ' placeholder="' + escapeHtml(t('doc.page_title_placeholder')) + '" data-page-title="' + escapeHtml(page.id) + '">'
      + '<button type="button" class="md-btn md-btn-danger md-state-layer" data-remove-page="' + escapeHtml(page.id) + '">'
      + escapeHtml(t('doc.delete_page')) + '</button>'
      + '</div>'
      + '<div class="rte-editor" contenteditable="true" data-page-html="' + escapeHtml(page.id) + '">' + page.html + '</div>'
      + '</div>';
  }

  /** Перерисовка списка страниц из черновика — без чтения из хранилища. */
  function renderPagesFromDraft() {
    $('#pagesCount').textContent = pagesDraft.length ? '(' + pagesDraft.length + ')' : '';
    $('#pagesList').innerHTML = pagesDraft.length
      ? pagesDraft.map(pageCardHtml).join('')
      : '<div class="md-empty">' + escapeHtml(t('doc.no_pages')) + '</div>';
  }

  /** Загрузка страниц из хранилища в черновик и отрисовка. */
  function renderPages() {
    var tpl = currentTpl();
    if (!isHtml(tpl)) { pagesDraft = []; $('#pagesCount').textContent = ''; return; }
    pagesDraft = pagesOf();
    renderPagesFromDraft();
  }

  /* ─── Сохранение ─── */

  function markDirty() {
    state.dirty = true;
    status('doc.status_unsaved');
  }

  function collectPages() {
    return pagesDraft.map(function (page) {
      var titleEl = document.querySelector('[data-page-title="' + page.id + '"]');
      var htmlEl = document.querySelector('[data-page-html="' + page.id + '"]');
      return {
        id: page.id,
        title: titleEl ? titleEl.value : page.title,
        html: htmlEl ? htmlEl.innerHTML : page.html,
      };
    });
  }

  function save() {
    var tpl = currentTpl();
    if (!tpl) return;
    var patch = {
      body: editorValue(),
      context: tpl.context,
      module: tpl.module,
      format: tpl.format,
      title: tpl.title,
    };
    if (isHtml(tpl)) patch.pages = collectPages();
    status('doc.status_saving');
    self.CWTemplates.save(state.id, state.lang, patch).then(function () {
      state.dirty = false;
      status('doc.status_saved');
      var fresh = currentTpl();
      $('#edBadge').textContent = t('doc.badge_custom');
      $('#resetBtn').hidden = !fresh.custom;
      renderLangs();
    }).catch(function (error) {
      console.error('Документы: не удалось сохранить', error);
      status('doc.status_save_failed');
    });
  }

  function resetToOriginal() {
    var tpl = currentTpl();
    if (!tpl || !tpl.custom) return;
    if (!window.confirm(t('doc.confirm_restore'))) return;
    self.CWTemplates.reset(state.id).then(function () {
      var fresh = currentTpl();
      if (!fresh) { showLibrary(); return; }
      /* Пользовательской записи могло не быть в системном наборе вовсе
         (например, шаблон под конкретный тип задания) — тогда возвращаться
         некуда, и мы уходим в список. */
      state.dirty = false;
      $('#edBadge').textContent = t('doc.badge_system');
      $('#resetBtn').hidden = true;
      renderLangs();
      loadColumn();
      status('doc.status_restored');
    }).catch(function (error) {
      console.error('Документы: не удалось восстановить оригинал', error);
    });
  }

  /* ─────────────────────────  События  ───────────────────────── */

  function bind() {
    $('#filters').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter]');
      if (!btn) return;
      state.filter = btn.dataset.filter;
      renderFilters();
      renderList();
    });

    $('#search').addEventListener('input', function (e) {
      state.search = e.target.value.trim();
      renderList();
    });

    $('#list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-open]');
      if (btn) openEditor(btn.dataset.open);
    });

    $('#backBtn').addEventListener('click', function () {
      if (state.dirty && !window.confirm(t('doc.confirm_leave'))) return;
      showLibrary();
    });

    $('#edLangs').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lang]');
      if (!btn) return;
      if (state.dirty && !window.confirm(t('doc.confirm_leave'))) return;
      state.lang = btn.dataset.lang;
      state.dirty = false;
      renderLangs();
      loadColumn();
    });

    Array.prototype.forEach.call(document.querySelectorAll('.doc-tab'), function (btn) {
      btn.addEventListener('click', function () { setView(btn.dataset.view); });
    });

    $('#edArea').addEventListener('input', markDirty);
    $('#edRte').addEventListener('input', markDirty);

    $('#rteToolbar').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      $('#edRte').focus();
      document.execCommand(btn.dataset.cmd, false, null);
      markDirty();
    });

    $('#varsList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-token]');
      if (btn) insertToken(btn.dataset.token);
    });

    $('#pagesList').addEventListener('input', markDirty);
    $('#pagesList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove-page]');
      if (!btn) return;
      if (!window.confirm(t('doc.confirm_delete_page'))) return;
      pagesDraft = collectPages().filter(function (p) { return p.id !== btn.dataset.removePage; });
      renderPagesFromDraft();
      markDirty();
    });

    $('#addPageBtn').addEventListener('click', function () {
      pagesDraft = collectPages();
      pagesDraft.push({ id: 'lp' + Date.now().toString(36), title: '', html: '<div></div>' });
      renderPagesFromDraft();
      markDirty();
    });

    $('#screens').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-screen]');
      if (btn) showScreen(btn.dataset.screen);
    });

    $('#dirSearch').addEventListener('input', function (e) {
      directory.search = e.target.value;
      renderDirectory();
    });

    $('#archiveFilters').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-afilter]');
      if (!btn) return;
      archive.filter = btn.dataset.afilter;
      renderArchiveFilters();
      renderArchive();
    });

    $('#archiveSearch').addEventListener('input', function (e) {
      archive.search = e.target.value.trim();
      renderArchive();
    });

    /* Копирование и удаление карточек — тоже общий слой: он же и рисует
       кнопки, поэтому имена data-атрибутов знает только он. Подтверждение
       удаления и сообщение об успехе остаются за модулем — у каждого свой
       способ уведомления. */
    self.CWDocsView.bind($('#archiveList'), function () { return archive.rows || []; }, {
      onCopied: function () { status('doc.copied'); },
      onRemoved: function () { loadArchive(true); },
    });

    $('#newTypeTplBtn').addEventListener('click', createTypeTemplate);
    $('#saveBtn').addEventListener('click', save);
    $('#resetBtn').addEventListener('click', resetToOriginal);

    window.addEventListener('beforeunload', function (e) {
      if (!state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  /**
   * Создать письмо под конкретный тип задания в Конгрессах.
   *
   * Единственный документ, который заводит сам пользователь. Текст берётся из
   * действующего общего письма, а не с чистого листа: на практике нужен тот же
   * текст с парой правок, и пустое поле здесь было бы вредной строгостью.
   */
  function createTypeTemplate() {
    var type = (window.prompt(t('doc.new_type_prompt')) || '').trim();
    if (!type) return;
    var context = 'congress.assignment.invitation:' + type;
    var existing = self.CWTemplates.byContext(context);
    if (existing) {
      window.alert(t('doc.new_type_exists'));
      openEditor(existing.id);
      return;
    }
    var base = self.CWTemplates.text('congress.assignment.invitation', state.lang || 'uk');
    var id = 'usr.congress.assignment.invitation.' + type;
    self.CWTemplates.save(id, (base && base.lang) || 'uk', {
      body: (base && base.body) || '',
      context: context,
      module: 'congress-project',
      format: 'text',
      title: t('doc.name.congress_type_template', { type: type }),
    }).then(function () {
      renderList();
      openEditor(id);
    }).catch(function (error) {
      console.error('Документы: не удалось создать шаблон', error);
      status('doc.status_save_failed');
    });
  }

  /* ─────────────────────────  Запуск  ───────────────────────── */

  function initDocLangSelect() {
    var select = $('#docLang');
    if (!select || !self.CWDocLang) return;
    var langs = ['uk', 'ru', 'de', 'en', 'pl'];
    select.innerHTML = langs.map(function (l) {
      return '<option value="' + l + '">' + l.toUpperCase() + '</option>';
    }).join('');
    select.value = self.CWDocLang.get();
    select.addEventListener('change', function () {
      self.CWDocLang.set(select.value);
      if (state.id) { state.lang = select.value; renderLangs(); loadColumn(); }
    });
  }

  function boot() {
    if (self.CWI18n) {
      /* ИСПРАВЛЕНО 29.08.2026. Здесь стояло `init({ selectEl })` — опции с
         таким именем у init() нет и не было, поэтому аргумент молча
         игнорировался: `<select id="uiLanguage">` в разметке существовал, но
         НИКОГДА не заполнялся. Переключатель языка Документов стоял пустым, и
         поймать это можно было только глазами — ни одна проверка не смотрит
         на содержимое селектора.
         Заодно модуль впервые получил собственный язык: `init()` звался без
         `module`, то есть выбор в Документах был невозможен в принципе. */
      self.CWI18n.bindModule({
        module: MODULE_ID,
        select: 'uiLanguage',
        versionSlot: 'moduleVersion',
        onChange: function () { renderFilters(); renderArchiveFilters(); },
      });
    }
    if (self.CWDocLang) self.CWDocLang.init({ module: MODULE_ID, langs: ['uk', 'ru', 'de', 'en', 'pl'], apply: false });
    var version = (self.CW_MODULES && self.CW_MODULES[MODULE_ID] || {}).version;
    if (version) $('#moduleVersion').textContent = 'v' + version;

    bind();
    initDocLangSelect();
    renderFilters();
    renderArchiveFilters();

    /* Библиотека без хранилища бессмысленна: показать системные тексты и
       промолчать о том, что правок пользователя не видно, было бы хуже, чем
       честное сообщение. */
    $('#list').innerHTML = '<div class="md-empty">' + escapeHtml(t('doc.loading')) + '</div>';
    self.CWTemplates.init().then(function () {
      renderList();
    }).catch(function (error) {
      console.error('Документы: хранилище недоступно', error);
      $('#list').innerHTML = '<div class="md-banner md-banner--error">' + escapeHtml(t('doc.storage_failed')) + '</div>';
    });

    /* Справочник читается отдельно от шаблонов и НЕ блокирует их: экран
       «Собрания» — третий по счёту, а библиотека нужна сразу при открытии.
       `init()` обязателен — без него `CWDirectory.ready` остаётся false и
       `all()` отдавать нечего. Поймано живым прогоном: слой был подключён и
       разметка готова, а список выходил пустым.
       Отказ справочника не роняет модуль: экран просто покажет «ничего не
       найдено», как и при пустом справочнике. */
    if (self.CWDirectory) {
      self.CWDirectory.init().then(function () {
        if (state.screen === 'directory') loadDirectory();
      }).catch(function (error) {
        console.error('Документы: общий справочник недоступен', error);
      });
    }

    if (typeof self.CWUpdate !== 'undefined') self.CWUpdate.init({ swUrl: './sw.js' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
