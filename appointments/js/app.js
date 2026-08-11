/**
 * Назначения — логика модуля.
 *
 * Исходный автономный бланк (Formuliar v5) не сохранял ничего: перезагрузка
 * страницы стирала все введённые фамилии. Здесь состояние живёт в localStorage
 * под собственным ключом модуля и пишется с задержкой после каждого ввода.
 *
 * ЯЗЫК. Интерфейс переводится общим слоем (data-i18n + CWI18n). Текст самого
 * письма НЕ переводится и остаётся украинским: это готовый документ, который
 * уходит в собрание, его язык — свойство документа, а не оболочки. То же
 * правило действует для печатного плана Конгрессов и формуляров Школы.
 */
(function () {
  'use strict';

  var MODULE_ID = 'appointments';
  var STORE_KEY = 'cw-appointments-v1';

  /* Языки документа. Язык интерфейса сюда не заглядывает вообще — это две
     независимые настройки (см. shared/doclang.js). Добавление языка = код
     в этот список + строки doc.* в i18n/dict.js. */
  var DOC_LANGS = ['uk', 'ru', 'de'];

  /* Локаль форматирования даты для каждого языка документа. */
  var DOC_LOCALE = { uk: 'uk-UA', ru: 'ru-RU', de: 'de-DE' };

  /* Поля формы отправителя → поля общего слоя. Имена элементов разметки не
     менялись, чтобы правка не разошлась по всему модулю. */
  var SENDER_MAP = {
    senderName: 'name',
    senderCode: 'code',
    senderAddress: 'address',
    senderPhone1: 'phone1',
    senderPhone2: 'phone2',
    senderEmail: 'email',
  };

  var LISTS = ['elders', 'servants', 'removed'];

  var $ = function (sel) { return document.querySelector(sel); };
  var t = function (key, vars) { return self.CWI18n ? self.CWI18n.t(key, vars) : key; };

  /* --- Хранилище ---------------------------------------------------- */
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function defaults() {
    return {
      date: new Date().toISOString().slice(0, 10),
      congregation: '',
      coordinator: '',
      coordinatorAddress: '',
      /* Названия собраний, которые уже вводили — подсказки в поле ввода.
         Собственные данные модуля: раньше список тянулся из справочника
         Конгрессов, то есть модуль читал чужое хранилище. */
      knownCongregations: [],
      lists: { elders: [''], servants: [''], removed: [''] },
    };
  }

  var state = defaults();

  function load() {
    var raw = read(STORE_KEY);
    if (!raw) return;
    try {
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      state = Object.assign(defaults(), saved);
      state.lists = Object.assign(defaults().lists, saved.lists || {});
      if (!Array.isArray(state.knownCongregations)) state.knownCongregations = [];
    } catch (e) {
      console.warn('Назначения: сохранённые данные повреждены, начинаем с чистого листа', e);
    }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        var el = $('#saveStatus');
        var time = new Date().toLocaleTimeString(self.CWI18n ? self.CWI18n.getLang() : 'ru',
          { hour: '2-digit', minute: '2-digit' });
        /* data-state красит точку .md-savestatus: зелёная при успехе,
           красная при ошибке. Текст без состояния оставлял бы точку
           всегда зелёной, в том числе на неудавшемся сохранении. */
        if (el) { el.textContent = t('ap.saved_at', { time: time }); el.dataset.state = 'saved'; }
      } catch (e) {
        var s = $('#saveStatus');
        if (s) { s.textContent = t('ap.save_failed'); s.dataset.state = 'error'; }
      }
    }, 400);
  }

  /* --- Данные отправителя ---------------------------------------------
     Единственный источник — общий слой shared/sender.js. Модуль не знает и не
     должен знать, какие ещё модули пишут туда же. */
  var EMPTY_SENDER = { name: '', code: '', address: '', phone1: '', phone2: '', email: '' };

  function sender() {
    return self.CWSender ? self.CWSender.get() : Object.assign({}, EMPTY_SENDER);
  }

  /* --- Отрисовка списков в панели ----------------------------------- */
  function listBox(name) { return document.querySelector('[data-list="' + name + '"]'); }

  function renderList(name) {
    var box = listBox(name);
    if (!box) return;
    box.innerHTML = '';
    var values = state.lists[name];
    if (!values.length) values.push('');

    values.forEach(function (value, index) {
      var row = document.createElement('div');
      row.className = 'list-row';

      var input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.placeholder = t('ap.placeholder.name');
      input.addEventListener('input', function () {
        state.lists[name][index] = input.value;
        renderLetter();
        save();
      });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'md-icon-btn';
      remove.textContent = '−';
      remove.title = t('ap.btn.remove_row');
      remove.setAttribute('aria-label', t('ap.btn.remove_row'));
      remove.addEventListener('click', function () {
        state.lists[name].splice(index, 1);
        renderList(name);
        renderLetter();
        save();
      });

      row.appendChild(input);
      row.appendChild(remove);
      box.appendChild(row);
    });
  }

  function names(name) {
    return state.lists[name].map(function (v) { return String(v || '').trim(); }).filter(Boolean);
  }

  /* --- Отрисовка письма --------------------------------------------- */
  function docLang() { return self.CWDocLang ? self.CWDocLang.get() : DOC_LANGS[0]; }

  /** Строка документа: тот же словарь CWI18n, но на языке документа. */
  function d(key, vars) {
    return self.CWI18n ? self.CWI18n.t(key, vars, docLang()) : key;
  }

  function docDate(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date)) return '';
    /* Локаль берётся от языка документа: дата — часть бумаги, а не оболочки. */
    try {
      return new Intl.DateTimeFormat(DOC_LOCALE[docLang()] || 'uk-UA',
        { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    } catch (e) { return iso; }
  }

  function fillNames(nodeId, list) {
    var ul = document.getElementById(nodeId);
    if (!ul) return;
    ul.innerHTML = '';
    if (!list.length) {
      /* Раздел остаётся в письме даже без данных — печатается короткая
         линия-плейсхолдер (см. .names-empty в css/styles.css). */
      var placeholder = document.createElement('li');
      placeholder.className = 'names-empty';
      placeholder.setAttribute('aria-hidden', 'true');
      ul.appendChild(placeholder);
      return;
    }
    list.forEach(function (value) {
      var li = document.createElement('li');
      li.textContent = value;
      ul.appendChild(li);
    });
  }

  function renderLetter() {
    var sd = sender();

    var senderLines = [sd.name, sd.code, sd.address, sd.phone1, sd.phone2, sd.email]
      .filter(function (line) { return String(line || '').trim(); });
    $('#outSender').textContent = senderLines.join('\n');

    /* Постоянные строки документа переводит CWDocLang.apply() по разметке;
       здесь — только те, в которые подставляются данные. */
    if (self.CWDocLang) self.CWDocLang.apply($('#letter'));
    document.getElementById('letter').setAttribute('lang', docLang());

    $('#outDate').textContent = docDate(state.date);
    $('#outCong').textContent = d('doc.ap.congregation', { name: state.congregation.trim() || '—' });
    $('#outCoordinator').textContent = state.coordinator.trim()
      ? d('doc.ap.via', { name: state.coordinator.trim() })
      : '';
    $('#outCoordinatorAddress').textContent = state.coordinatorAddress.trim();

    fillNames('outElders', names('elders'));
    fillNames('outServants', names('servants'));
    fillNames('outRemoved', names('removed'));

    $('#outSignName').textContent = sd.name || '';
    $('#outSignCode').textContent = sd.code || '';
  }

  /* --- Панель отправителя -------------------------------------------- */
  function renderSenderPanel() {
    var sd = sender();
    Object.keys(SENDER_MAP).forEach(function (id) {
      var el = document.getElementById(id);
      /* Не перетираем поле, в котором сейчас печатают: обновление может
         прийти из другой вкладки или другого модуля. */
      if (el && document.activeElement !== el) el.value = sd[SENDER_MAP[id]] || '';
    });
  }

  /* --- Имя файла при печати ------------------------------------------
     Сохранено из исходного бланка: браузер подставляет document.title в
     имя PDF, поэтому на время печати заголовок подменяется на состав
     письма и возвращается обратно после. */
  function sanitize(value) {
    return String(value).replace(/[\\/:*?"<>|]/g, '').trim();
  }

  function printTitle() {
    var appointed = names('elders').concat(names('servants')).map(sanitize).filter(Boolean);
    var removed = names('removed').map(sanitize).filter(Boolean);
    var parts = [];
    if (appointed.length) parts.push(d('doc.ap.print.appointed') + ' – ' + appointed.join('; '));
    if (removed.length) parts.push(d('doc.ap.print.removed') + ' – ' + removed.join('; '));
    return parts.length ? parts.join('; ') : null;
  }

  var titleBackup = null;
  function beforePrint() {
    var built = printTitle();
    if (!built) return;
    /* beforeprint может прийти дважды (свой вызов window.print() плюс
       системный диалог печати). Без этой проверки второе событие клало в
       резерв уже подменённый заголовок, и после печати имя вкладки
       навсегда оставалось составом письма. */
    if (titleBackup === null) titleBackup = document.title;
    document.title = built;
  }
  function afterPrint() {
    if (titleBackup === null) return;
    document.title = titleBackup;
    titleBackup = null;
  }

  /* --- Переключатель языка -------------------------------------------- */
  function initLanguage() {
    var select = $('#uiLanguage');
    if (!select || !self.CWI18n) return;

    var inherit = document.createElement('option');
    inherit.value = '__hub';
    inherit.textContent = t('common.language_inherit');
    select.appendChild(inherit);

    self.CWI18n.LANGS.forEach(function (lang) {
      var option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.label;
      select.appendChild(option);
    });

    var active = self.CWI18n.init({ module: MODULE_ID });
    select.value = self.CWI18n.isInherited() ? '__hub' : active;

    select.addEventListener('change', function (e) {
      if (e.target.value === '__hub') self.CWI18n.resetToHub();
      else self.CWI18n.setLang(e.target.value);
    });

    /* Панель и списки строятся скриптом, а не разметкой, поэтому общий
       apply() их не достаёт — перерисовываем сами. */
    self.CWI18n.onChange(function () {
      LISTS.forEach(renderList);
      renderSenderPanel();
      select.value = self.CWI18n.isInherited() ? '__hub' : self.CWI18n.getLang();
    });
  }

  /* --- Связывание полей ----------------------------------------------- */
  function bindField(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = state[key];
    el.addEventListener('input', function () {
      state[key] = el.value;
      renderLetter();
      save();
    });
  }

  function bind() {
    bindField('letterDate', 'date');
    bindField('congName', 'congregation');
    bindField('coordinator', 'coordinator');
    bindField('coordinatorAddress', 'coordinatorAddress');

    document.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-add');
        state.lists[name].push('');
        renderList(name);
        var rows = listBox(name).querySelectorAll('input');
        if (rows.length) rows[rows.length - 1].focus();
        save();
      });
    });

    document.querySelectorAll('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-clear');
        state.lists[name] = [''];
        renderList(name);
        renderLetter();
        save();
      });
    });

    /* Отправитель живёт в общем слое: пишем сразу туда, в состоянии модуля
       его копии нет. Своё хранилище save() при этом не трогаем. */
    Object.keys(SENDER_MAP).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || !self.CWSender) return;
      el.addEventListener('input', function () {
        var patch = {};
        patch[SENDER_MAP[id]] = el.value;
        self.CWSender.set(patch);
      });
    });

    /* Данные могли поменять в другом модуле или в соседней вкладке. */
    if (self.CWSender) {
      self.CWSender.onChange(function () { renderSenderPanel(); renderLetter(); });
    }

    /* Собрание запоминается в подсказки — но только когда его дописали до
       конца, а не после каждой нажатой буквы. */
    $('#congName').addEventListener('change', function () {
      var name = $('#congName').value.trim();
      if (!name || state.knownCongregations.indexOf(name) >= 0) return;
      state.knownCongregations.push(name);
      state.knownCongregations = state.knownCongregations.slice(-20);
      fillCongregations();
      save();
    });

    $('#printBtn').addEventListener('click', function () { window.print(); });
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
  }

  /* --- Подсказки собраний ---------------------------------------------
     Собственная история ввода. Раньше список приходил из справочника
     Конгрессов — удобно, но это было чтение чужого хранилища. */
  function fillCongregations() {
    var datalist = $('#congList');
    if (!datalist) return;
    datalist.innerHTML = '';
    state.knownCongregations.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      datalist.appendChild(option);
    });
  }

  /* --- Переключатель языка документа ------------------------------------
     Отдельный от языка интерфейса контрол: смена одного не трогает другое. */
  function initDocLanguage() {
    var select = $('#docLanguage');
    if (!select || !self.CWDocLang) return;

    self.CWDocLang.init({ module: MODULE_ID, langs: DOC_LANGS, apply: false });

    /* Подписи языков — эндонимы из общего реестра, они не переводятся. */
    var labels = {};
    if (self.CWI18n) self.CWI18n.LANGS.forEach(function (l) { labels[l.code] = l.label; });

    DOC_LANGS.forEach(function (code) {
      var option = document.createElement('option');
      option.value = code;
      option.textContent = labels[code] || code;
      select.appendChild(option);
    });
    select.value = self.CWDocLang.get();

    select.addEventListener('change', function (e) {
      self.CWDocLang.set(e.target.value);
      renderLetter();
    });

    self.CWDocLang.onChange(function (lang) { select.value = lang; renderLetter(); });
  }

  /* --- Старт ----------------------------------------------------------- */
  function start() {
    initLanguage();
    load();

    var version = (self.CW_MODULES && self.CW_MODULES[MODULE_ID] || {}).version;
    if (version) $('#moduleVersion').textContent = 'v' + version;

    initDocLanguage();
    bind();
    fillCongregations();
    LISTS.forEach(renderList);
    renderSenderPanel();
    renderLetter();

    // Регистрация SW и отслеживание обновлений — общий слой (shared/update.js).
    if (typeof CWUpdate !== 'undefined') CWUpdate.init({ swUrl: 'sw.js' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
