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

  /* Ключ хранилища Конгрессов. Читаем строго на чтение и только поле
     settings — модуль «Назначения» никогда не пишет в чужое хранилище. */
  var CONGRESS_KEY = 'congress-pwa-v34-speakers';

  /* Запасные данные отправителя — байт-в-байт те же значения, что в
     congress-project/js/state.js → baseSettings(). Нужны только когда
     Конгрессы на этом устройстве ещё ни разу не открывали. */
  var SENDER_FALLBACK = {
    senderName: 'Олексій Тимощук',
    senderCode: 'EU-K-01',
    senderEmail: 'tymoshchuk@jwpub.org',
    senderPhone1: '+48 886 260 883',
    senderPhone2: '+49 1573 62 69 572 (WhatsApp)',
    senderAddress: 'Przejazd 2,\n05-082 Blizne Łaszczyńskiego',
  };

  var SENDER_FIELDS = ['senderName', 'senderCode', 'senderEmail', 'senderPhone1', 'senderPhone2', 'senderAddress'];
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
      senderFromCongress: true,
      sender: {},
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
      state.sender = saved.sender || {};
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
        if (el) el.textContent = t('ap.saved_at', { time: time });
      } catch (e) {
        var s = $('#saveStatus');
        if (s) s.textContent = t('ap.save_failed');
      }
    }, 400);
  }

  /* --- Данные отправителя ------------------------------------------- */
  /* Единый источник — настройки Конгрессов: письма обоих модулей уходят от
     одного человека, и расхождение в адресе или коде района означало бы два
     разных документа от одного отправителя. */
  function congressSettings() {
    var raw = read(CONGRESS_KEY);
    if (!raw) return null;
    try {
      var st = JSON.parse(raw);
      return (st && st.settings) ? st.settings : null;
    } catch (e) { return null; }
  }

  function effectiveSender() {
    if (!state.senderFromCongress) {
      return Object.assign({}, SENDER_FALLBACK, state.sender);
    }
    return Object.assign({}, SENDER_FALLBACK, congressSettings() || {});
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
  function ukDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    /* Дата письма форматируется по-украински всегда — вместе с остальным
       текстом документа, независимо от языка интерфейса. */
    try {
      return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
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
    var sender = effectiveSender();

    var senderLines = [
      sender.senderName,
      sender.senderCode,
      sender.senderAddress,
      sender.senderPhone1,
      sender.senderPhone2,
      sender.senderEmail,
    ].filter(function (line) { return String(line || '').trim(); });
    $('#outSender').textContent = senderLines.join('\n');

    $('#outDate').textContent = ukDate(state.date);
    $('#outCong').textContent = state.congregation.trim() || '—';
    $('#outCoordinator').textContent = state.coordinator.trim()
      ? 'ЧЕРЕЗ ' + state.coordinator.trim()
      : '';
    $('#outCoordinatorAddress').textContent = state.coordinatorAddress.trim();

    fillNames('outElders', names('elders'));
    fillNames('outServants', names('servants'));
    fillNames('outRemoved', names('removed'));

    $('#outSignName').textContent = sender.senderName || '';
    $('#outSignCode').textContent = sender.senderCode || '';
  }

  /* --- Панель отправителя -------------------------------------------- */
  function renderSenderPanel() {
    var sender = effectiveSender();
    SENDER_FIELDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = sender[id] || '';
    });
    $('#senderFromCongress').checked = !!state.senderFromCongress;
    $('#senderFields').classList.toggle('locked', !!state.senderFromCongress);
    $('#senderSourceHint').textContent = state.senderFromCongress
      ? (congressSettings() ? t('ap.sender.hint_linked') : t('ap.sender.hint_no_congress'))
      : t('ap.sender.hint_local');
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
    if (appointed.length) parts.push('призначення – ' + appointed.join('; '));
    if (removed.length) parts.push('викреслення – ' + removed.join('; '));
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

    $('#senderFromCongress').addEventListener('change', function (e) {
      /* Снимая связь, забираем текущие значения как отправную точку — иначе
         поля обнулились бы до значений по умолчанию. Читать их нужно ДО
         смены флага: после неё effectiveSender() уже смотрит в пустой
         локальный набор, а не в настройки Конгрессов. */
      var current = effectiveSender();
      state.senderFromCongress = e.target.checked;
      if (!state.senderFromCongress) state.sender = current;
      renderSenderPanel();
      renderLetter();
      save();
    });

    SENDER_FIELDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        if (state.senderFromCongress) return;
        state.sender[id] = el.value;
        renderLetter();
        save();
      });
    });

    $('#printBtn').addEventListener('click', function () { window.print(); });
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
  }

  /* --- Справочник собраний из Конгрессов ------------------------------ */
  function fillCongregations() {
    var settings = congressSettings();
    var list = (settings && Array.isArray(settings.congregations)) ? settings.congregations : [];
    var datalist = $('#congList');
    if (!datalist) return;
    datalist.innerHTML = '';
    list.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      datalist.appendChild(option);
    });
  }

  /* --- Старт ----------------------------------------------------------- */
  function start() {
    initLanguage();
    load();

    var version = (self.CW_MODULES && self.CW_MODULES[MODULE_ID] || {}).version;
    if (version) $('#moduleVersion').textContent = 'v' + version;

    bind();
    fillCongregations();
    LISTS.forEach(renderList);
    renderSenderPanel();
    renderLetter();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js'); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
