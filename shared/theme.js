/**
 * Circuit Workspace — shared/theme.js
 * Тема оформления (светлая / тёмная) — общая настройка на всё приложение.
 *
 * ЗАЧЕМ. До этого файла хаб был тёмным, а `appointments`, `congress-project`
 * и `pioneer-school` жёстко несли `data-theme="light"` в разметке. Пользователь
 * нажимал плитку на тёмном экране и попадал на белую страницу. Теперь тема —
 * одна на весь хаб и все модули, как язык интерфейса и язык документа.
 *
 * ОТЛИЧИЕ ОТ ЯЗЫКА ДОКУМЕНТА. У `shared/doclang.js` есть смысл в переопределении
 * на уровне модуля: секретарь работает в польском интерфейсе и печатает
 * украинские письма. У темы такого случая нет — «тёмный Клиндарий внутри
 * светлого приложения» это не рабочий сценарий, а рассинхрон. Поэтому здесь
 * ОДИН ключ на всё приложение и никакого `cw-theme:<module>`.
 *
 * ЗНАЧЕНИЯ: 'auto' | 'light' | 'dark'. По умолчанию 'auto' — системная
 * настройка ОС. Разрешение: 'auto' → prefers-color-scheme → 'light' | 'dark'.
 *
 * ГЛАВНОЕ ТЕХНИЧЕСКОЕ РЕШЕНИЕ. Наружу, в `data-theme` на <html>, всегда
 * выставляется РАЗРЕШЁННОЕ значение — только 'light' или 'dark', никогда 'auto'.
 * Благодаря этому `shared/style.css` не потребовалось менять: у него
 * `:root` = тёмная схема, `[data-theme="light"]` = светлые переопределения,
 * а `[data-theme="dark"]` просто попадает в `:root`. Ни одна существующая
 * строка стилей не тронута.
 *
 * ПОДКЛЮЧЕНИЕ — обязательно синхронным тегом в <head>, ДО остальных скриптов:
 *   <script src="../shared/theme.js"></script>
 * Причина: атрибут должен стоять на <html> до первой отрисовки, иначе будет
 * вспышка чужой темы. Файл специально маленький и без зависимостей, чтобы
 * его можно было держать в <head> и не тормозить загрузку.
 *
 * НЕЛЬЗЯ: оставлять `data-theme` в разметке модуля. Он перебьёт общий выбор
 * до того, как отработает скрипт, и вернёт рассинхрон, ради устранения
 * которого файл и написан.
 *
 * СИНХРОНИЗАЦИЯ между вкладками и модулями — через событие `storage`, как
 * в `shared/doclang.js`. Плюс подписка на смену системной темы, пока режим
 * 'auto'.
 */
(function (global) {
  'use strict';

  var KEY = 'cw-theme';
  var MODES = ['auto', 'light', 'dark'];
  var DARK_QUERY = '(prefers-color-scheme: dark)';

  var mode = null;          // что выбрал пользователь: auto | light | dark
  var resolved = null;      // что реально применено: light | dark
  var listeners = [];
  var mediaQuery = null;
  var started = false;

  function read() {
    try { return global.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(value) {
    try { global.localStorage.setItem(KEY, value); } catch (e) { /* приватный режим — не падаем */ }
  }

  function normalize(value) {
    if (!value) return null;
    var v = String(value).toLowerCase();
    return MODES.indexOf(v) >= 0 ? v : null;
  }

  function systemPrefersDark() {
    try {
      return !!(global.matchMedia && global.matchMedia(DARK_QUERY).matches);
    } catch (e) {
      return false;
    }
  }

  /** 'auto' превращается в конкретную схему; всё остальное — само собой. */
  function resolveMode(value) {
    return value === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : value;
  }

  /**
   * Единственное место, где меняется DOM. Пишем только при реальном изменении:
   * лишняя запись атрибута заставляет браузер пересчитывать стили всей страницы.
   */
  function paint() {
    var next = resolveMode(mode);
    if (next === resolved) return false;
    resolved = next;
    var root = global.document && global.document.documentElement;
    if (root) root.setAttribute('data-theme', resolved);
    return true;
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](resolved, mode); } catch (e) { console.warn('CWTheme listener failed', e); }
    }
  }

  function watchSystem() {
    if (mediaQuery || !global.matchMedia) return;
    try { mediaQuery = global.matchMedia(DARK_QUERY); } catch (e) { return; }

    var onSystemChange = function () {
      if (mode !== 'auto') return;   // системная тема важна только в режиме auto
      if (paint()) notify();
    };

    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', onSystemChange);
    else if (mediaQuery.addListener) mediaQuery.addListener(onSystemChange);  // Safari < 14
  }

  function watchStorage() {
    global.addEventListener('storage', function (e) {
      if (!e || e.key !== KEY) return;
      var next = normalize(e.newValue) || 'auto';
      if (next === mode) return;
      mode = next;
      if (paint()) notify();
    });
  }

  /**
   * Применяет тему как можно раньше. Вызывается автоматически при загрузке
   * файла — ждать DOMContentLoaded нельзя, иначе будет вспышка чужой темы.
   */
  function start() {
    if (started) return;
    started = true;
    mode = normalize(read()) || 'auto';
    paint();
    watchSystem();
    watchStorage();
  }

  var CWTheme = {
    MODES: function () { return MODES.slice(); },

    /** @returns {'auto'|'light'|'dark'} выбор пользователя */
    get: function () { start(); return mode; },

    /** @returns {'light'|'dark'} что реально применено сейчас */
    getResolved: function () { start(); return resolved; },

    /**
     * @param {'auto'|'light'|'dark'} value
     * @returns {'light'|'dark'} применённая схема
     */
    set: function (value) {
      start();
      var next = normalize(value);
      if (!next) return resolved;
      mode = next;
      write(next);
      if (paint()) notify();
      else notify();          // 'auto' → 'light' при светлой системе: схема та же, выбор другой
      return resolved;
    },

    /** Переключает светлую и тёмную. Из 'auto' уходит в противоположную текущей. */
    toggle: function () {
      start();
      return CWTheme.set(resolved === 'dark' ? 'light' : 'dark');
    },

    /**
     * Одноразовый перенос прежнего выбора модуля в общий механизм — по образцу
     * CWDocLang.adopt(). Пишет только если общего ключа ещё нет, поэтому
     * повторный вызов безвреден, а чужой выбор не затирается.
     * Нужен Клиндарию: у него тема жила в собственных настройках, и терять
     * выбор пользователя при переходе на общий механизм нельзя.
     * @returns {boolean} true — значение принято
     */
    adopt: function (value) {
      start();
      var next = normalize(value);
      if (!next || read()) return false;
      mode = next;
      write(next);
      if (paint()) notify();
      return true;
    },

    /** @returns {Function} отписка */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    /**
     * Наполняет <select> тремя вариантами и связывает его с настройкой.
     * Подписи берутся из CWI18n (ключи common.theme_*), поэтому переключатель
     * переводится вместе с остальным интерфейсом. Без i18n — русские запасные.
     * @param {HTMLSelectElement} el
     */
    mountSelect: function (el) {
      if (!el || el.tagName !== 'SELECT') return;
      start();

      var FALLBACK = { auto: 'Как в системе', light: 'Светлая', dark: 'Тёмная' };
      var label = function (m) {
        var key = 'common.theme_' + m;
        var text = global.CWI18n ? global.CWI18n.t(key) : null;
        return (text && text !== key) ? text : FALLBACK[m];
      };

      var fill = function () {
        el.textContent = '';
        MODES.forEach(function (m) {
          var opt = global.document.createElement('option');
          opt.value = m;
          opt.textContent = label(m);
          el.appendChild(opt);
        });
        el.value = mode;
      };

      fill();
      el.addEventListener('change', function () { CWTheme.set(el.value); });
      CWTheme.onChange(function () { el.value = mode; });
      if (global.CWI18n && global.CWI18n.onChange) global.CWI18n.onChange(fill);
    },
  };

  global.CWTheme = CWTheme;
  start();
})(typeof self !== 'undefined' ? self : this);
