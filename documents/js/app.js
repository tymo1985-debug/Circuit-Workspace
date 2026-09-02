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
    varsQuery: '',
  };

  /* ─── Desktop split-view: определение широкого экрана ───
     Порог — 1201px, уже одобренная парная граница «лестницы Клиндария»
     (docs/design-tokens/03-breakpoints.md, раздел «Про пары 767/768,
     1100/1101, 1200/1201»), а не заново введённое число. Ровно `1200px`
     нельзя: `circuit-planner/style.css` уже держит `max-width:1200px` для
     своей раскладки, и `min-width:1200px` здесь пересёкся бы с ним на
     ширине ровно 1200px — гейт `check-breakpoints.mjs` поймал это при первой
     попытке. `.doc-wrap{max-width:1180px}` достигает полной ширины около
     этой точки, то есть 1200/1201px — первая ширина, где на редактор и
     preview реально хватает места для двух читаемых колонок. `900` (tablet,
     уже используется для bottom sheet селектора переменных) для сплита
     тесен. Паттерн `matchMedia` — тот же, что уже используется в
     shared/theme.js для системной тёмной темы. */
  var wideQuery = self.matchMedia ? self.matchMedia('(min-width: 1201px)') : null;
  function isWide() { return !!(wideQuery && wideQuery.matches); }

  /* ─── Drag-позиция picker'а переменных ───
     `null` — пользователь ещё не двигал диалог в текущей сессии, значит при
     следующем открытии применяется дефолтная right-side позиция заново
     (computeDefaultVarsDialogPos). Не пустая строка/0 — именно `null`,
     чтобы отличать «ещё не трогали» от «подвинули ровно в дефолтную точку».
     Живёт только в памяти вкладки: перезагрузка страницы сбрасывает его —
     персистентность между сессиями не требуется на этой фазе (решение
     02.09.2026). Mobile эту переменную не читает и не пишет вовсе. */
  var varsDialogPos = null;

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

    var wide = isWide();
    /* Расклад по ширине и по вкладке — независимые оси. На mobile (не wide)
       ничего не меняется: строго одна вкладка видна за раз, как раньше.
       На wide вкладка «Текст» показывает и редактор, и preview одновременно
       (split), вкладка «Предпросмотр» — preview на всю ширину, «Страницы» —
       без изменений в обоих случаях. */
    if (wide && view === 'edit') {
      $('#viewEdit').hidden = false;
      $('#viewPreview').hidden = false;
      $('#viewPages').hidden = true;
    } else if (wide && view === 'preview') {
      $('#viewEdit').hidden = true;
      $('#viewPreview').hidden = false;
      $('#viewPages').hidden = true;
    } else {
      $('#viewEdit').hidden = view !== 'edit';
      $('#viewPreview').hidden = view !== 'preview';
      $('#viewPages').hidden = view !== 'pages';
    }

    /* Подсказка предпросмотра (см. documents/index.html — вынесена из
       #viewPreview структурно, чтобы верхний край textarea слева и
       preview-card справа совпадали на split). Видна ровно на вкладке
       «Предпросмотр», независимо от wide/mobile — тот же экран
       концептуально, просто разной ширины. */
    $('#previewHint').hidden = view !== 'preview';

    /* Класс включает grid-раскладку в две колонки — только когда реально
       нужен split (wide + «Текст»). CSS ничего не решает о видимости сам;
       hidden выше — единственный источник правды, класс лишь говорит, как
       расположить то, что уже видимо (см. documents/css/styles.css). */
    $('#viewEdit').closest('.ed__main').classList.toggle('ed__main--split', wide && view === 'edit');

    /* Меню «Вставка» и picker относятся ИСКЛЮЧИТЕЛЬНО к вкладке «Текст» —
       источник истины здесь `view === 'edit'` напрямую, а не видимость
       `#viewEdit`. Раньше (до удаления отдельной кнопки 02.09.2026) здесь
       стояло `$('#viewEdit').hidden` — ошибка: `#viewEdit.hidden` описывает
       РАСКЛАДКУ (что показано рядом с чем на экране), а не то, разрешено ли
       редактирование. Split-view держит #viewEdit видимым одновременно с
       #viewPreview именно на вкладке «Текст» — это единственный случай, где
       оба совпадают. Но смешивать эти два понятия хрупко: split не должен
       превращать Preview в editable режим ни при каком будущем изменении
       раскладки. */
    var editable = view === 'edit';
    /* Меню «Вставка» — единственная точка входа в variable picker (отдельная
       кнопка «+ Вставить переменную» убрана 02.09.2026, реальный тест
       показал, что меню полностью её заменяет). */
    $('#insertMenuBtn').closest('.md-menu').hidden = !editable;
    /* Уход с «Текста» закрывает диалог переменных, если он был открыт —
       иначе он остался бы открытым поверх Preview/Pages, где вставлять
       уже некуда. На wide-split редактор остаётся виден вместе с preview,
       поэтому диалог здесь не закрывается сам по себе — только когда
       вкладка реально не «Текст» (editable === false). Меню «Вставка»
       закрывается тем же условием — не должно оставаться открытым при
       переходе на Preview/Pages. */
    if (!editable) { closeVarsDialog(); closeInsertMenu(); }
    if (view === 'preview' || (wide && view === 'edit')) renderPreview();
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

  /* ─── Сохранение позиции курсора редактора ───
     ПОЧЕМУ ЭТО НУЖНО. insertToken() ниже читает `window.getSelection()` для
     RTE-режима — а это ГЛОБАЛЬНЫЙ Selection API, один на весь документ.
     `openVarsDialog()` намеренно переводит фокус в поле поиска (диалог открыт
     именно ради поиска), и как только фокус уходит из #edRte, его Range
     перестаёт быть текущим выделением документа: `rte.contains(sel.anchorNode)`
     в insertToken() перестаёт быть истиной, и функция молча уходит в свою
     аварийную ветку `else` — дописывает токен в КОНЕЦ редактора вместо места,
     где стоял курсор. Проверено экспериментом на jsdom (см. журнал 01.09.2026):
     `sel.rangeCount` остаётся 1 после фокуса на другом поле, но `anchorNode`
     перестаёт быть внутри #edRte. Для textarea риска нет: `selectionStart`/
     `selectionEnd` — свойства самого элемента, фокус на другом поле их не
     трогает.
     Решение — не трогать insertToken() (он и раньше вставлял верно, когда
     фокус не уходил), а вокруг него сохранять и восстанавливать позицию:
     сохранить перед открытием диалога, восстановить непосредственно перед
     каждым вызовом insertToken(). */
  var savedCaret = null;

  function saveEditorCaret() {
    var tpl = currentTpl();
    if (isHtml(tpl)) {
      var sel = window.getSelection();
      var rte = $('#edRte');
      if (sel && sel.rangeCount && rte.contains(sel.anchorNode)) {
        savedCaret = { html: true, range: sel.getRangeAt(0).cloneRange() };
      } else {
        /* Курсора в редакторе не было (например, фокус уже был не там) —
           вставлять в конец безопаснее, чем гадать. */
        savedCaret = { html: true, range: null };
      }
    } else {
      var area = $('#edArea');
      savedCaret = { html: false, start: area.selectionStart || 0, end: area.selectionEnd || 0 };
    }
  }

  /** Восстанавливает сохранённую позицию курсора НЕПОСРЕДСТВЕННО перед
      вставкой — insertToken() сам не трогается, он снова читает актуальное
      выделение/selectionStart, которое мы только что вернули на место. */
  function restoreEditorCaret() {
    if (!savedCaret) return;
    if (savedCaret.html) {
      if (!savedCaret.range) return;
      var rte = $('#edRte');
      rte.focus();
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedCaret.range);
    } else {
      var area = $('#edArea');
      area.focus();
      area.selectionStart = savedCaret.start;
      area.selectionEnd = savedCaret.end;
    }
  }

  /* ─── Селектор переменных ───
     UX-переделка 01.09.2026: постоянная колонка `<aside class="vars">`
     заменена на один `<dialog>` (desktop — компактное окно, mobile — bottom
     sheet через CSS, разметка и логика общие). Три источника данных, как и
     раньше:
       - self.CWTemplates.tokens(list) — какие поля вообще существуют и
         разрешены текущему module (без изменений, как в старой renderVars());
       - self.CWDocVariables — presentation-слой: человеческое название поля
         и что из списка скрыть (visit.type/typeLabel, doc.lang — решение
         01.09.2026, полей в реестре и в движке это не касается);
       - state.varsQuery — текст в поле поиска, ищет по label/ns.field/
         token/aliases (aliases только для поиска, в карточке не показываются).
     insertToken() ниже не тронут: вставка по курсору уже работала верно —
     проблему с потерей caret в RTE-режиме решает обвязка
     saveEditorCaret()/restoreEditorCaret() выше, а не сама функция вставки. */

  var varsAll = [];

  /** Строит плоский список видимых переменных для текущего шаблона.
      Скрытые поля (CWDocVariables.isHidden) выпадают здесь же, до рендера —
      это единственное место, которое их фильтрует. */
  function collectVars() {
    var tpl = currentTpl();
    var list = NAMESPACES_BY_MODULE[tpl.module] || ['sender', 'doc'];
    var registry = self.CWDocVariables;
    return self.CWTemplates.tokens(list).filter(function (v) {
      return !(registry && registry.isHidden(v.ns, v.field));
    }).map(function (v) {
      var labelKey = registry && registry.labelKey(v.ns, v.field);
      var nsLabelKey = registry && registry.namespaceLabelKey(v.ns);
      return {
        ns: v.ns,
        field: v.field,
        token: v.token,
        aliases: v.aliases,
        /* Без i18n-ключа (пока не покрыт перевод) — токен как запасной
           вариант названия, чтобы карточка не осталась пустой. */
        label: labelKey ? t(labelKey) : v.token,
        nsLabel: nsLabelKey ? t(nsLabelKey) : v.ns,
      };
    });
  }

  /** Совпадение с поисковой строкой: по человеческому названию, ns.field,
      текущему token и старым aliases (алиасы участвуют в поиске, но не
      выводятся в карточке — п.7 утверждённого плана). */
  function matchesVarQuery(v, q) {
    if (!q) return true;
    q = q.toLowerCase();
    if (v.label.toLowerCase().indexOf(q) >= 0) return true;
    if ((v.ns + '.' + v.field).toLowerCase().indexOf(q) >= 0) return true;
    if (v.token.toLowerCase().indexOf(q) >= 0) return true;
    return v.aliases.some(function (a) { return a.toLowerCase().indexOf(q) >= 0; });
  }

  function renderVarsList() {
    var q = (state.varsQuery || '').trim();
    var rows = varsAll.filter(function (v) { return matchesVarQuery(v, q); });
    if (!rows.length) {
      $('#varsList').innerHTML = '<div class="md-empty">' + escapeHtml(t('doc.variables_not_found')) + '</div>';
      return;
    }
    var groups = {};
    var order = [];
    rows.forEach(function (v) {
      if (!groups[v.ns]) { groups[v.ns] = []; order.push(v.ns); }
      groups[v.ns].push(v);
    });
    $('#varsList').innerHTML = order.map(function (ns) {
      var items = groups[ns].map(function (v) {
        return '<button type="button" data-token="' + escapeHtml(v.token) + '">'
          + '<span class="vars-dialog__item-label">' + escapeHtml(v.label) + '</span>'
          + '<span class="vars-dialog__item-token">' + escapeHtml(v.token) + '</span>'
          + '</button>';
      }).join('');
      return '<h4>' + escapeHtml(groups[ns][0].nsLabel) + '</h4>' + items;
    }).join('');
  }

  /* ─── Позиционирование и drag диалога переменных (desktop-only) ───
     Активно только при isWide() — на mobile ничего из этого не вызывается
     и не задаёт inline-стили, существующий bottom-sheet CSS (@media
     max-width:900px) остаётся единственным источником позиции там. */

  var MIN_VISIBLE_PX = 80; /* минимум шапки, который обязан остаться в
    границах viewport с любой стороны — требование «нельзя утащить
    полностью за край» (п.2/5 утверждённого плана). */

  /** Дефолтная позиция при первом открытии в сессии (или после
      close→reopen, если пользователь ещё не двигал): справа от рабочей
      области, над правой (preview) колонкой — редактор слева остаётся
      максимально открытым. Вычисляется от фактической ширины/высоты
      диалога и текущего viewport, а не хардкодом — чтобы корректно
      работать на разных размерах окна и при разной ширине diалога
      (min(420px, calc(100vw - 32px)) в CSS). */
  function computeDefaultVarsDialogPos() {
    var dlg = $('#varsDialog');
    var w = dlg.offsetWidth || 420;
    var margin = 24;
    return {
      left: Math.max(margin, window.innerWidth - w - margin),
      top: 96, /* чуть ниже тулбара редактора — не наезжает на кнопку
        «Вставить переменную» и заголовок документа сверху. */
    };
  }

  /** Не даёт окну уехать полностью за viewport ни с одной стороны:
      минимум MIN_VISIBLE_PX шапки должен остаться видимым. Переиспользуется
      и после drag (pointerup), и на resize — единая логика ограничения,
      как и требовалось (п.5). */
  function clampVarsDialogPos(pos) {
    var dlg = $('#varsDialog');
    var w = dlg.offsetWidth || 420;
    var h = dlg.offsetHeight || 200;
    var maxLeft = window.innerWidth - MIN_VISIBLE_PX;
    var maxTop = window.innerHeight - MIN_VISIBLE_PX;
    var minLeft = MIN_VISIBLE_PX - w;
    var minTop = 0; /* шапка — верхний край диалога; тащить его выше
      верхней границы экрана незачем, там и так некуда вставлять. */
    return {
      left: Math.min(Math.max(pos.left, minLeft), maxLeft),
      top: Math.min(Math.max(pos.top, minTop), maxTop),
    };
  }

  function applyVarsDialogPos(pos) {
    var dlg = $('#varsDialog');
    dlg.style.left = pos.left + 'px';
    dlg.style.top = pos.top + 'px';
  }

  /** Навешивается один раз (bind()). Drag активен только при isWide() —
      проверяется заново на каждый pointerdown, а не один раз при навеске,
      чтобы переход wide→mobile во время открытого диалога не оставлял
      «залипший» обработчик, ожидающий pointermove, которого на mobile быть
      не должно. */
  function bindVarsDialogDrag() {
    var head = $('#varsDialog .vars-dialog__head');
    var dragging = false;
    var startX = 0, startY = 0, origLeft = 0, origTop = 0;

    head.addEventListener('pointerdown', function (e) {
      if (!isWide()) return;
      /* Клик по кнопке закрытия (или любой другой интерактивный элемент,
         если он появится в шапке в будущем) не должен инициировать drag —
         п.3 утверждённого плана. Поиск/список физически вне .vars-dialog__head,
         так что для них проверка не нужна: pointerdown там просто не
         долетает до этого обработчика. */
      if (e.target.closest('button')) return;
      dragging = true;
      var dlg = $('#varsDialog');
      var rect = dlg.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      head.classList.add('is-dragging');
      head.setPointerCapture(e.pointerId);
    });

    head.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var pos = clampVarsDialogPos({
        left: origLeft + (e.clientX - startX),
        top: origTop + (e.clientY - startY),
      });
      applyVarsDialogPos(pos);
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      head.classList.remove('is-dragging');
      try { head.releasePointerCapture(e.pointerId); } catch (err) { /* уже отпущен браузером — не критично */ }
      var dlg = $('#varsDialog');
      /* Позиция фиксируется как «пользователь уже двигал» только здесь, по
         отпусканию — не на каждый pointermove, чтобы промежуточные кадры
         drag не считались завершённым перемещением сами по себе. */
      varsDialogPos = clampVarsDialogPos({ left: dlg.offsetLeft, top: dlg.offsetTop });
      applyVarsDialogPos(varsDialogPos);
    }
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
  }

  /** При изменении размеров окна: если пользователь уже задавал позицию
      вручную в этой сессии, зажимаем её обратно в границы — иначе окно
      могло бы остаться за пределами уменьшенного viewport (п.5). Дефолтная
      (ещё не тронутая) позиция ничего не зажимает: она пересчитывается
      заново при каждом следующем открытии (computeDefaultVarsDialogPos),
      поэтому нет смысла подстраивать её, пока диалог даже не открыт.
      Переход в mobile — отдельный случай: inline left/top от desktop-drag
      должны быть явно сняты, иначе их специфичность (inline style всегда
      выше любого класса/@media) перебила бы mobile-раскладку bottom-sheet
      целиком, даже если внешне кажется, что mobile CSS «просто должен
      сработать сам». varsDialogPos-состояние (последняя desktop-позиция)
      при этом НЕ обнуляется — она понадобится, когда пользователь вернётся
      на wide (п.6: «mobile → wide → корректный desktop default/last
      position»). */
  function reclampVarsDialogIfNeeded() {
    var dlg = $('#varsDialog');
    if (!isWide()) {
      dlg.style.left = '';
      dlg.style.top = '';
      return;
    }
    if (!varsDialogPos) return;
    if (!dlg.open) return;
    varsDialogPos = clampVarsDialogPos(varsDialogPos);
    applyVarsDialogPos(varsDialogPos);
  }

  /** Пересобрать список переменных для текущего шаблона и открыть диалог.
      Курсор редактора сохраняется ПЕРВЫМ действием — до того, как что-либо
      ещё (включая showModal()) успеет сдвинуть фокус или изменить DOM. */
  /* ─── Меню «Вставка» ───
     Второй способ вызвать существующий variable picker — не новая логика,
     переиспользует openVarsDialog() как есть. Поведение (open/close, клик
     мимо, Esc, стрелки) — тот же паттерн, что уже есть в
     congress-project/js/topbar-menu.js для общего примитива .md-menu
     (shared/style.css, раздел 5.2a): там это отдельный ES-модуль, здесь —
     часть общего IIFE Documents, стиль этого файла. Правило второго
     применения (см. комментарий в shared/style.css) не требует выносить
     JS-поведение в shared — оно всё ещё специфично каждому модулю. */
  function isInsertMenuOpen() {
    var panel = $('#insertMenu');
    return !!(panel && !panel.hidden);
  }

  function openInsertMenu() {
    var panel = $('#insertMenu');
    var trigger = $('#insertMenuBtn');
    if (!panel || !trigger) return;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    var first = panel.querySelector('.md-menu__item');
    if (first) first.focus();
  }

  function closeInsertMenu(returnFocus) {
    var panel = $('#insertMenu');
    var trigger = $('#insertMenuBtn');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus();
    }
  }

  /** Пересобрать список переменных для текущего шаблона и открыть диалог.
      Курсор редактора сохраняется ПЕРВЫМ действием — до того, как что-либо
      ещё (включая showModal()) успеет сдвинуть фокус или изменить DOM. */
  function openVarsDialog() {
    saveEditorCaret();
    varsAll = collectVars();
    state.varsQuery = '';
    $('#varsSearch').value = '';
    renderVarsList();
    var dlg = $('#varsDialog');
    if (dlg && !dlg.open) dlg.showModal();
    /* Позиция — только на desktop: mobile держит bottom-sheet целиком через
       CSS (@media max-width:900px), никаких inline left/top там не нужно и
       не должно быть — оставлять их означало бы тянуть desktop-координаты
       в mobile-раскладку при последующем resize обратно на wide. */
    if (dlg && isWide()) {
      applyVarsDialogPos(varsDialogPos || computeDefaultVarsDialogPos());
    }
    /* Фокус в поиск сразу — диалог открыт специально ради поиска переменной. */
    if (dlg) $('#varsSearch').focus();
  }

  function closeVarsDialog() {
    var dlg = $('#varsDialog');
    if (dlg && dlg.open) dlg.close();
  }

  /** Точка входа из клика по карточке переменной: восстанавливает курсор
      редактора и только потом зовёт insertToken() — саму функцию вставки
      это не меняет. Позиция пересохраняется СРАЗУ после вставки: диалог
      остаётся открытым (можно вставить несколько переменных подряд), а
      следующая вставка обязана попасть туда, где курсор оказался ПОСЛЕ
      этой вставки (insertToken() сам ставит его туда через
      range.setStartAfter/collapse для RTE, или selectionStart/End для
      textarea), а не туда, где он был до неё. */
  function insertTokenAtSavedCaret(token) {
    restoreEditorCaret();
    insertToken(token);
    saveEditorCaret();
    /* Вставка через picker — одиночное дискретное действие, не поток
       input-событий, поэтому без debounce: обновляем preview сразу, но
       только когда wide-split реально показан (иначе лишняя работа). */
    if (isWide() && state.view === 'edit') renderPreview();
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

    /* Live preview на wide-split: debounce, чтобы не гонять render на каждую
       букву (regex в plainToHtml() + innerHTML на длинном письме заметны).
       Работает только когда сплит реально показан — на mobile и на full
       Preview/Pages это лишняя работа впустую, поэтому проверяем условие
       заново на каждый input, а не полагаемся на то, что был верно в момент
       навешивания слушателя. renderPreview() не меняется, вызывается как есть. */
    var livePreviewTimer = null;
    function scheduleLivePreview() {
      if (!(isWide() && state.view === 'edit')) return;
      if (livePreviewTimer) clearTimeout(livePreviewTimer);
      livePreviewTimer = setTimeout(renderPreview, 200);
    }
    $('#edArea').addEventListener('input', scheduleLivePreview);
    $('#edRte').addEventListener('input', scheduleLivePreview);

    $('#rteToolbar').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      $('#edRte').focus();
      document.execCommand(btn.dataset.cmd, false, null);
      markDirty();
    });

    $('#varsList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-token]');
      if (btn) insertTokenAtSavedCaret(btn.dataset.token);
    });

    /* Диалог остаётся открытым после вставки: типичный сценарий — вставить
       подряд несколько переменных (имя, потом адрес, потом телефон), и
       закрывать/переоткрывать окно на каждую было бы лишним трением. */
    $('#varsDialogClose').addEventListener('click', closeVarsDialog);
    $('#varsSearch').addEventListener('input', function (e) {
      state.varsQuery = e.target.value;
      renderVarsList();
    });
    /* Клик по backdrop нативного <dialog> попадает в сам элемент (не в его
       детей): проверяем e.target === dialog, а не closest(). */
    $('#varsDialog').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeVarsDialog();
    });
    bindVarsDialogDrag();

    /* Меню «Вставка» — второй вход в тот же variable picker. Клик по пункту
       «Переменная…» закрывает меню и зовёт РОВНО ту же openVarsDialog(),
       что и существующая кнопка «+ Вставить переменную» — никакой новой
       caret-логики здесь нет и не нужно: saveEditorCaret() внутри
       openVarsDialog() сохраняет позицию курсора независимо от того, что
       именно вызвало открытие диалога. */
    $('#insertMenuBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      if (isInsertMenuOpen()) closeInsertMenu(false); else openInsertMenu();
    });
    $('#insertMenuVarItem').addEventListener('click', function () {
      closeInsertMenu(false);
      openVarsDialog();
    });
    document.addEventListener('click', function (e) {
      if (!isInsertMenuOpen()) return;
      if (e.target.closest('.md-menu')) return;
      closeInsertMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (!isInsertMenuOpen()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeInsertMenu(true);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var list = Array.prototype.filter.call(
        $('#insertMenu').querySelectorAll('.md-menu__item'),
        function (el) { return !el.hidden; }
      );
      if (!list.length) return;
      e.preventDefault();
      var i = list.indexOf(document.activeElement);
      var next = e.key === 'ArrowDown'
        ? list[(i + 1) % list.length]
        : list[(i - 1 + list.length) % list.length];
      next.focus();
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
    /* Пересечение порога wide/mobile при живом resize — не перезагрузка
       страницы, значит раскладку нужно пересчитать на лету. `change` тот же
       паттерн, что уже используется в shared/theme.js для системной тёмной
       темы. Трогаем DOM только если редактор реально открыт: setView() внутри
       и так безопасна (renderPreview() сама проверяет currentTpl()), но нет
       смысла лишний раз переключать hidden/классы на элементах, которые
       сейчас скрыты вместе со всем экраном редактора. */
    if (wideQuery) {
      var onWideChange = function () {
        if (state.id) setView(state.view);
        reclampVarsDialogIfNeeded();
      };
      if (wideQuery.addEventListener) wideQuery.addEventListener('change', onWideChange);
      else if (wideQuery.addListener) wideQuery.addListener(onWideChange); // Safari < 14
    }
    /* Resize внутри wide-диапазона (окно сужается, но остаётся ≥1201px) не
       пересекает порог matchMedia выше — нужен отдельный listener, иначе
       перетащенный диалог мог бы остаться за пределами уменьшенного
       viewport, пока пользователь не сделает что-то ещё (п.5 плана). */
    window.addEventListener('resize', reclampVarsDialogIfNeeded);
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
