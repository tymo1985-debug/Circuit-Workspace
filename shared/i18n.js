/**
 * Circuit Workspace — shared/i18n.js
 * Единый механизм локализации для хаба и всех модулей.
 *
 * ЗАЧЕМ ОН ТАКОЙ. До него язык жил по-разному в каждом месте: хаб был
 * жёстко русским, Клиндарий хранил язык внутри своего блоба данных
 * (`app.settings.language`), Конгрессы и Школа пионеров интерфейс не
 * переводили вовсе. Здесь задано одно правило разрешения языка, одно
 * хранилище и один способ перерисовки — модули подключаются к нему
 * постепенно, ничего не ломая по дороге.
 *
 * ПРАВИЛО РАЗРЕШЕНИЯ ЯЗЫКА (по убыванию приоритета):
 *   1. localStorage['cw-lang:<module>'] — локальный выбор внутри модуля.
 *      Пишется ТОЛЬКО когда пользователь сам сменил язык в этом модуле.
 *   2. localStorage['cw-lang']          — язык, выбранный в хабе.
 *   3. navigator.language                — первый запуск, ничего не выбрано.
 *   4. 'ru'                              — финальный запасной вариант.
 *
 * Отсюда и наследование: пока у модуля нет своего ключа, он следует за
 * хабом. Появился ключ — модуль живёт своей жизнью. Удалили ключ
 * (`resetToHub()`) — снова следует за хабом.
 *
 * ПОДКЛЮЧЕНИЕ (хаб):
 *   <script src="shared/i18n.js"></script>
 *   <script src="shared/i18n/common.js"></script>   // регистрирует словари
 *   ... в конце <body>:
 *   CWI18n.init();               // модуль не указан → это хаб
 *
 * ПОДКЛЮЧЕНИЕ (модуль, на уровень ниже корня):
 *   <script src="../shared/i18n.js"></script>
 *   <script src="../shared/i18n/common.js"></script>
 *   <script src="i18n/dict.js"></script>            // словари модуля
 *   CWI18n.init({ module: 'congress-project' });
 *
 * ДОБАВЛЕНИЕ ЯЗЫКА: добавить код в LANGS ниже и переводы в словари.
 * Логику трогать не нужно — ни здесь, ни в модулях.
 *
 * `self` вместо `window` — чтобы файл можно было безопасно подключить и
 * через importScripts() в service worker'е (как shared/version.js).
 */
(function (global) {
  'use strict';

  var HUB_KEY = 'cw-lang';
  /* Значение «наследовать язык хаба» в селекторах модулей. До 29.08.2026
     литерал '__hub' был объявлен в каждом модуле отдельно — четыре копии
     одной константы, которые обязаны совпадать, но ничем не связаны. */
  var HUB_VALUE = '__hub';
  var MODULE_KEY_PREFIX = 'cw-lang:';
  var FALLBACK = 'ru';

  /* Порядок здесь = порядок в переключателях языка. Подписи намеренно
     на самом языке (эндонимы) и НЕ переводятся: «Українська» должна
     оставаться «Українська» в любом интерфейсе. */
  var LANGS = [
    { code: 'ru', label: 'Русский' },
    { code: 'uk', label: 'Українська' },
    { code: 'en', label: 'English' },
    { code: 'pl', label: 'Polski' },
    { code: 'de', label: 'Deutsch' },
  ];

  var CODES = LANGS.map(function (l) { return l.code; });

  var dicts = {};        // { ru: { 'hub.title': '…' }, uk: { … } }
  var listeners = [];
  var moduleId = null;
  var current = null;
  var warned = {};
  /* Подписка на `storage` ставится один раз за жизнь страницы: init() зовут
     и модуль, и хаб-виджет, а снять обработчик было бы нечем. */
  var bound = false;

  /* --- Хранилище. Приватный режим Safari бросает на записи, поэтому все
     обращения обёрнуты: без localStorage приложение просто теряет память
     о выборе языка, но не падает. ------------------------------------ */
  function read(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* no-op */ }
  }
  function drop(key) {
    try { global.localStorage.removeItem(key); } catch (e) { /* no-op */ }
  }

  function normalize(value) {
    if (!value) return null;
    var code = String(value).toLowerCase().slice(0, 2);
    return CODES.indexOf(code) >= 0 ? code : null;
  }

  function moduleKey() {
    return moduleId ? MODULE_KEY_PREFIX + moduleId : null;
  }

  function fromBrowser() {
    var list = (global.navigator && (global.navigator.languages || [global.navigator.language])) || [];
    for (var i = 0; i < list.length; i++) {
      var code = normalize(list[i]);
      if (code) return code;
    }
    return null;
  }

  function resolve() {
    var key = moduleKey();
    return (key && normalize(read(key)))
      || normalize(read(HUB_KEY))
      || fromBrowser()
      || FALLBACK;
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](current); } catch (e) { console.warn('CWI18n listener failed', e); }
    }
  }

  /* --- Перевод ------------------------------------------------------- */
  function lookup(key, lang) {
    var dict = dicts[lang];
    return (dict && Object.prototype.hasOwnProperty.call(dict, key)) ? dict[key] : null;
  }

  /**
   * @param {string} key
   * @param {Object} [vars]
   * @param {string} [lang] — явный язык вместо текущего. Нужен модулям, чей
   *   словарь покрывает не все языки экосистемы: Клиндарий пока без немецкого,
   *   и при `cw-lang=de` он должен показать ближайший доступный язык, а не
   *   свалиться в русский запасной вариант.
   */
  function t(key, vars, lang) {
    // Ленивое разрешение языка: модуль может позвать t() раньше init()
    // (например, при первой отрисовке), и тогда без этой строки он получил бы
    // русский запасной вариант вместо выбранного языка.
    if (!current) current = resolve();
    var active = normalize(lang) || current;
    /* `||` здесь НАМЕРЕННО, и это рассмотренное решение (28.08.2026).
       Аудит предлагал заменить его на явную проверку `!= null`, чтобы
       намеренно пустой перевод не подменялся русским. Предпосылка проверена и
       не подтвердилась: во всех словарях проекта НОЛЬ пустых значений, а
       check-i18n-coverage считает ключ покрытым по самому факту его наличия —
       значит пустая строка уехала бы к пользователю как пустая подпись, и
       поймать это было бы нечем. Пустое значение в словаре сегодня означает
       недосмотр переводчика, а при недосмотре русский текст лучше пустоты.
       Если когда-нибудь понадобится намеренно пустая подпись, механизмом
       должен стать явный маркер, а не `''`, неотличимая от забытого поля. */
    var value = lookup(key, active) || lookup(key, FALLBACK);
    if (value == null) {
      /* Предупреждаем один раз на ключ: иначе перерисовка списка зальёт
         консоль сотней одинаковых строк и спрячет настоящие ошибки. */
      if (!warned[key]) { warned[key] = true; console.warn('CWI18n: нет перевода для ключа "' + key + '"'); }
      return key;
    }
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        value = value.split('{' + name + '}').join(String(vars[name]));
      });
    }
    return value;
  }

  /* --- Применение к DOM ---------------------------------------------
     Поддерживаемые атрибуты:
       data-i18n="ключ"                — textContent
       data-i18n-title="ключ"          — title
       data-i18n-aria-label="ключ"     — aria-label
       data-i18n-placeholder="ключ"    — placeholder
     Никакого innerHTML: перевод не должен уметь вставлять разметку. */
  var ATTRS = [
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-placeholder', 'placeholder'],
  ];

  /** @param {Element|Document} [root] @param {string} [lang] — см. t() */
  function apply(root, lang) {
    var scope = root || global.document;
    if (!scope || !scope.querySelectorAll) return;

    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'), null, lang);
    });

    ATTRS.forEach(function (pair) {
      scope.querySelectorAll('[' + pair[0] + ']').forEach(function (el) {
        el.setAttribute(pair[1], t(el.getAttribute(pair[0]), null, lang));
      });
    });

    if (global.document && global.document.documentElement) {
      global.document.documentElement.lang = normalize(lang) || current;
    }
  }

  /* --- Публичный API -------------------------------------------------- */
  var CWI18n = {
    LANGS: LANGS,
    FALLBACK: FALLBACK,

    /**
     * Регистрирует словари. Вызывается файлами переводов.
     * @param {Object} bundle — { ru: {ключ: строка}, uk: {…}, … }
     * Повторный вызов дополняет уже зарегистрированное, поэтому общий
     * словарь (shared/i18n/common.js) и словарь модуля не конфликтуют.
     */
    register: function (bundle) {
      Object.keys(bundle || {}).forEach(function (lang) {
        if (CODES.indexOf(lang) < 0) return;
        if (!dicts[lang]) dicts[lang] = {};
        var part = bundle[lang];
        Object.keys(part).forEach(function (key) { dicts[lang][key] = part[key]; });
      });
      return CWI18n;
    },

    /**
     * @param {Object} [options]
     * @param {string} [options.module] — id модуля ('congress-project' и т.п.).
     *   Не указан → это хаб: переключение языка пишется в общий ключ.
     * @param {boolean} [options.apply=true] — сразу перевести документ.
     */
    init: function (options) {
      var opts = options || {};
      moduleId = opts.module || null;
      current = resolve();
      if (opts.apply !== false) apply();

      /* Синхронизация между вкладками: сменили язык в хабе — открытый в
         соседней вкладке модуль, который язык не переопределял, должен
         перестроиться сам, без перезагрузки. */
      /* Повторный init() не должен удваивать обработчик: каждый лишний
         экземпляр — ещё одна полная перерисовка на каждое событие, и снять
         его потом нечем (ссылки на функцию не сохранялось). Флаг ставится до
         подписки, а не после: между ними нет await, но порядок читается
         однозначнее. */
      if (!bound) {
      bound = true;
      global.addEventListener('storage', function (e) {
        if (!e || (e.key !== HUB_KEY && e.key !== moduleKey())) return;
        var next = resolve();
        if (next === current) return;
        current = next;
        apply();
        notify();
      });
      }

      return current;
    },

    /**
     * Мост модуля к общей локализации: одна функция вместо пяти копий.
     *
     * ─── ЗАЧЕМ (29.08.2026) ─────────────────────────────────────────────
     *
     * Один и тот же код жил в `congress-project/js/i18n.js`,
     * `pioneer-school/js/i18n.js`, `appointments/js/app.js` и
     * `documents/js/app.js`: константа `'__hub'`, `ready()`, `currentValue()`,
     * `choose()`, `applyTitle()`, заполнение `<select>`, подписка на
     * `onChange`, обработчик `change`. Различались только имя модуля, id
     * селектора и ключ заголовка — то есть ПАРАМЕТРЫ, а не логика.
     *
     * Цена дубля здесь не «некрасиво»: правка разрешения языка требовала пяти
     * правок, и гейт совпадение не сторожил. Документы это и показали — их
     * `<select id="uiLanguage">` был объявлен в разметке, но НИКОГДА не
     * заполнялся: модуль звал `init({ selectEl })`, а такой опции у init нет
     * и не было. Переключатель языка стоял пустым, и заметить это можно было
     * только глазами.
     *
     * ─── ЧТО СЮДА НЕ ПЕРЕЕХАЛО И ПОЧЕМУ ─────────────────────────────────
     *
     * `App.i18nBridge` Клиндария остаётся своим. Он не мост, а зеркало: язык
     * дублируется в `settings.language` модуля, есть карта ближайших языков,
     * `apply: false` (разметка без `data-i18n`, переводит собственный
     * `renderAll()`) и флаг `_busy` против рекурсии. Свести его сюда значило
     * бы затащить в общий слой частный случай одного модуля.
     *
     * Своё остаётся своим и у остальных: `tStatus()` Конгрессов, псевдоним
     * `T()` Школы. Они действительно разные.
     *
     * @param {Object} opts
     * @param {string} opts.module — id модуля, как в CW_MODULES
     * @param {string|Element} [opts.select] — селектор языка: id или элемент
     * @param {string} [opts.titleKey] — ключ названия для document.title
     * @param {string} [opts.versionSlot] — id элемента для «v1.2.3»
     * @param {Function} [opts.onChange] — перерисовка динамических экранов
     * @param {boolean} [opts.apply] — как у init()
     * @returns {Object} api моста
     */
    bindModule: function (opts) {
      var o = opts || {};
      if (!o.module) throw new Error('CWI18n.bindModule: нужен module');

      var api = {
        /** Значение «наследовать от хаба» в селекторе. */
        HUB_VALUE: HUB_VALUE,
        t: function (key, vars) { return CWI18n.t(key, vars); },
        isInherited: function () { return CWI18n.isInherited(); },
        currentValue: function () {
          return CWI18n.isInherited() ? HUB_VALUE : CWI18n.getLang();
        },
        choose: function (value) {
          if (value === HUB_VALUE) CWI18n.resetToHub();
          else CWI18n.setLang(value, { scope: 'module' });
        },
      };

      function el() {
        if (!o.select) return null;
        return typeof o.select === 'string' ? global.document.getElementById(o.select) : o.select;
      }

      /* Опции строятся из реестра языков хаба: добавление языка не требует
         правок ни здесь, ни в разметке модуля. */
      function fill() {
        var select = el();
        if (!select) return;
        var options = [{ code: HUB_VALUE, label: CWI18n.t('common.language_inherit') }]
          .concat(CWI18n.LANGS.map(function (l) { return { code: l.code, label: l.label }; }));
        select.innerHTML = options.map(function (item) {
          /* Значения — коды языков из реестра, но экранирование ставится по
             правилу, а не по разбору: подписи приходят из словарей, а словарь
             правят люди. */
          return '<option value="' + CWEscape.attr(item.code) + '">'
            + CWEscape.html(item.label) + '</option>';
        }).join('');
        select.value = api.currentValue();
      }

      /* Название модуля переводится, номер версии — нет. */
      function title() {
        var version = (global.CW_MODULES && global.CW_MODULES[o.module]
          && global.CW_MODULES[o.module].version) || '';
        if (o.titleKey) {
          global.document.title = CWI18n.t(o.titleKey) + (version ? ' v' + version : '');
        }
        var slot = o.versionSlot && global.document.getElementById(o.versionSlot);
        if (slot && version) slot.textContent = 'v' + version;
      }

      /** Перечитать заголовок и селектор — после смены языка или данных. */
      api.refresh = function () { title(); fill(); };

      CWI18n.init({ module: o.module, apply: o.apply });
      api.refresh();

      var after = function () {
        api.refresh();
        if (typeof o.onChange === 'function') o.onChange();
      };
      CWI18n.onChange(after);

      var select = el();
      if (select) {
        select.addEventListener('change', function (e) {
          api.choose(e.target.value);
          after();
        });
      }

      return api;
    },

    /** Значение «наследовать язык хаба» в селекторах модулей. Публично,
     *  чтобы модуль мог сравнить с ним, не заводя своей копии литерала. */
    HUB_VALUE: HUB_VALUE,

    getLang: function () { return current || (current = resolve()); },

    /** Язык, выбранный в хабе (без учёта локального переопределения). */
    getHubLang: function () { return normalize(read(HUB_KEY)) || fromBrowser() || FALLBACK; },

    /** true — модуль следует за хабом (своего выбора нет). */
    isInherited: function () { return !moduleId || !normalize(read(moduleKey())); },

    /**
     * @param {string} lang
     * @param {Object} [options]
     * @param {'hub'|'module'} [options.scope] — по умолчанию 'module' внутри
     *   модуля и 'hub' в самом хабе. scope:'hub' из модуля меняет язык всей
     *   экосистемы — использовать осознанно.
     */
    setLang: function (lang, options) {
      var code = normalize(lang);
      if (!code) return CWI18n.getLang();
      var scope = (options && options.scope) || (moduleId ? 'module' : 'hub');

      if (scope === 'hub') write(HUB_KEY, code);
      else write(moduleKey(), code);

      if (code !== current) { current = code; apply(); notify(); }
      return current;
    },

    /** Убирает локальный выбор модуля — язык снова наследуется от хаба. */
    resetToHub: function () {
      var key = moduleKey();
      if (key) drop(key);
      var next = resolve();
      if (next !== current) { current = next; apply(); notify(); }
      return current;
    },

    t: t,
    apply: apply,

    /** @returns {Function} отписка */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
  };

  global.CWI18n = CWI18n;
})(typeof self !== 'undefined' ? self : this);
