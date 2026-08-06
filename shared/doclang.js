/**
 * Circuit Workspace — shared/doclang.js
 * Язык ДОКУМЕНТА: письма, печатного плана, формуляра — того, что печатают и
 * отдают людям.
 *
 * ГЛАВНОЕ РАЗЛИЧЕНИЕ. Язык интерфейса (shared/i18n.js) и язык документа — две
 * независимые настройки. Секретарь может работать в польском интерфейсе и
 * печатать украинские письма: это нормальный рабочий случай, а не ошибка.
 * Поэтому смена языка в шапке приложения не трогает язык бумаги, и наоборот.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ФЛАГ В i18n.js. У языка документа другое
 * множество значений (не каждый интерфейсный язык имеет вычитанный шаблон
 * документа), другое хранилище и другой жизненный цикл: интерфейс
 * перерисовывается целиком, документ — только своей частью страницы.
 * Словари при этом общие: строки документа регистрируются тем же
 * `CWI18n.register()` под префиксом `doc.*`, а `CWI18n.t(key, vars, lang)`
 * умеет отдать перевод на явно заданном языке. Никакого второго механизма
 * перевода в проекте не появляется.
 *
 * РАЗРЕШЕНИЕ ЯЗЫКА, по убыванию приоритета:
 *   1. localStorage['cw-doclang:<module>'] — выбор внутри модуля;
 *   2. localStorage['cw-doclang']          — общий язык документов;
 *   3. fallback модуля (первый в списке langs).
 * Язык интерфейса в цепочке не участвует НИГДЕ — это и есть независимость.
 *
 * ПОДКЛЮЧЕНИЕ:
 *   <script src="../shared/i18n.js"></script>
 *   <script src="../shared/doclang.js"></script>
 *   <script src="i18n/dict.js"></script>          // строки doc.* внутри
 *   ...
 *   CWDocLang.init({ module: 'appointments', langs: ['uk', 'ru', 'de'] });
 *
 * РАЗМЕТКА документа помечается `data-doc-i18n` (и `data-doc-i18n-*` для
 * атрибутов) — отдельно от `data-i18n` интерфейса, чтобы общий `CWI18n.apply()`
 * не перевёл документ вместе с оболочкой.
 *
 * ДОБАВЛЕНИЕ ЯЗЫКА ДОКУМЕНТА: код в `langs` при init() + строки `doc.*` в
 * словаре модуля. Логику здесь трогать не нужно.
 */
(function (global) {
  'use strict';

  var GLOBAL_KEY = 'cw-doclang';
  var MODULE_PREFIX = 'cw-doclang:';

  var moduleId = null;
  var langs = [];
  var current = null;
  var listeners = [];

  function read(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* no-op */ }
  }

  function moduleKey() { return moduleId ? MODULE_PREFIX + moduleId : null; }

  function normalize(value) {
    if (!value) return null;
    var code = String(value).toLowerCase().slice(0, 2);
    return langs.indexOf(code) >= 0 ? code : null;
  }

  function resolve() {
    var key = moduleKey();
    return (key && normalize(read(key)))
      || normalize(read(GLOBAL_KEY))
      || langs[0]
      || 'uk';
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](current); } catch (e) { console.warn('CWDocLang listener failed', e); }
    }
  }

  var ATTRS = [
    ['data-doc-i18n-title', 'title'],
    ['data-doc-i18n-aria-label', 'aria-label'],
  ];

  /**
   * Переводит помеченную разметку документа. Значения подставляются из
   * data-doc-vars (JSON) — так шаблон вида «ЗБОРУ «{name}»» остаётся одной
   * строкой словаря, а не тремя кусками разметки.
   */
  function apply(root) {
    var scope = root || global.document;
    if (!scope || !scope.querySelectorAll || !global.CWI18n) return;

    scope.querySelectorAll('[data-doc-i18n]').forEach(function (el) {
      var vars = null;
      var raw = el.getAttribute('data-doc-vars');
      if (raw) { try { vars = JSON.parse(raw); } catch (e) { vars = null; } }
      el.textContent = global.CWI18n.t(el.getAttribute('data-doc-i18n'), vars, current);
    });

    ATTRS.forEach(function (pair) {
      scope.querySelectorAll('[' + pair[0] + ']').forEach(function (el) {
        el.setAttribute(pair[1], global.CWI18n.t(el.getAttribute(pair[0]), null, current));
      });
    });
  }

  var CWDocLang = {
    /**
     * @param {Object} options
     * @param {string} options.module — id модуля ('appointments' и т.п.)
     * @param {string[]} options.langs — доступные языки документа; первый — запасной
     * @param {boolean} [options.apply=true] — сразу перевести разметку документа
     */
    init: function (options) {
      var opts = options || {};
      moduleId = opts.module || null;
      langs = (opts.langs || []).slice();
      current = resolve();
      if (opts.apply !== false) apply();

      global.addEventListener('storage', function (e) {
        if (!e || (e.key !== GLOBAL_KEY && e.key !== moduleKey())) return;
        var next = resolve();
        if (next === current) return;
        current = next;
        apply();
        notify();
      });

      return current;
    },

    LANGS: function () { return langs.slice(); },

    get: function () { return current || (current = resolve()); },

    /**
     * @param {string} lang
     * @param {Object} [options]
     * @param {'global'|'module'} [options.scope] — по умолчанию 'module'.
     *   'global' задаёт язык документов для всей экосистемы.
     */
    set: function (lang, options) {
      var code = normalize(lang);
      if (!code) return CWDocLang.get();
      var scope = (options && options.scope) || (moduleId ? 'module' : 'global');

      if (scope === 'global') write(GLOBAL_KEY, code);
      else write(moduleKey(), code);

      if (code !== current) { current = code; apply(); notify(); }
      return current;
    },

    /**
     * Одноразовый перенос прежнего выбора модуля в общий механизм. Пишет
     * только если своего ключа ещё нет — повторный вызов безвреден.
     * @returns {boolean} true — значение принято
     */
    adopt: function (lang) {
      var code = normalize(lang);
      var key = moduleKey();
      if (!code || !key || read(key)) return false;
      write(key, code);
      if (code !== current) { current = code; apply(); notify(); }
      return true;
    },

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

  global.CWDocLang = CWDocLang;
})(typeof self !== 'undefined' ? self : this);
