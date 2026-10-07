/**
 * Circuit Workspace — shared/errors.js
 *
 * Кольцо последних ошибок и диагностика (аудит 03, P2-6).
 *
 * ЗАЧЕМ. Работа идёт с телефона, без DevTools. Глобальный обработчик ошибок
 * был только у Конгрессов; в остальных модулях сбой оседал в консоли, и
 * «кнопка ничего не сделала» нечем было диагностировать.
 *
 * ЧТО ДЕЛАЕТ.
 *   - ловит `error` и `unhandledrejection` на странице и складывает последние
 *     MAX записей в localStorage (`cw-errors-v1`) — общий для хаба и модулей,
 *     поэтому ошибку модуля видно в карточке «Диагностика» хаба;
 *   - при первой ошибке на странице показывает маленький значок: нажатие
 *     копирует диагностику;
 *   - `CWErrors.report()` — текст: версии хаба и модулей, браузер, ошибки.
 *
 * ЧЕГО НЕ ДЕЛАЕТ. Ничего не отправляет: текст уходит в буфер только по
 * нажатию. Не читает данные модулей и не пишет адрес с query/hash. Ключ
 * `cw-errors-v1` не входит в резервные копии (shared/backup.js берёт только
 * перечисленные ключи) и не относится к пользовательским данным.
 *
 * ОТКАЗОУСТОЙЧИВОСТЬ. Каждая ветка обёрнута: сбой самой диагностики не должен
 * стать новой ошибкой страницы или помешать модулю открыться.
 *
 * Подключается ПЕРВЫМ скриптом страницы: ошибки загрузки остальных скриптов
 * тоже должны попасть в кольцо.
 */
(function (global) {
  'use strict';

  if (global.CWErrors) return;

  var KEY = 'cw-errors-v1';
  var MAX = 20;
  var MAX_MSG = 300;
  var MAX_STACK = 700;
  var MAX_REPEAT = 100;   // одна и та же ошибка в цикле не должна молотить localStorage

  /* Корень приложения — по адресу самого скрипта: `…/shared/errors.js`. */
  var root = '';
  try {
    var own = document.currentScript && document.currentScript.src;
    if (own) root = own.replace(/shared\/errors\.js(\?.*)?$/, '');
  } catch (e) { /* без корня модуль определяется как '?' */ }

  function moduleId() {
    try {
      if (!root) return '?';
      var rest = location.pathname.slice(new URL(root).pathname.length);
      return rest.indexOf('/') > 0 ? rest.split('/')[0] : 'hub';
    } catch (e) { return '?'; }
  }

  function clip(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* Убирает origin, корень приложения и (для адресов) `?v=…` — остаётся
     «journal/js/app.js:12:3». В тексте сообщения query не режется: там `?` — обычный знак. */
  function tidy(s, urls) {
    s = String(s == null ? '' : s);
    try {
      if (root) s = s.split(root).join('');
      s = s.split(location.origin).join('');
    } catch (e) { /* оставляем как есть */ }
    return urls ? s.replace(/\?[^\s):]*/g, '') : s;
  }

  function load() {
    try {
      var d = JSON.parse(global.localStorage.getItem(KEY) || 'null');
      if (d && d.v === 1 && Array.isArray(d.items)) return d.items;
    } catch (e) { /* пусто или повреждено — начинаем заново */ }
    return [];
  }
  function save(items) {
    try { global.localStorage.setItem(KEY, JSON.stringify({ v: 1, items: items })); return true; }
    catch (e) { return false; }
  }

  var listeners = [];
  function notify() {
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* подписчик не должен рвать запись */ } });
  }

  var seen = {};

  function record(kind, msg, src, stack) {
    var sig = kind + '|' + msg + '|' + src;
    seen[sig] = (seen[sig] || 0) + 1;
    if (seen[sig] > MAX_REPEAT) return;

    var entry = {
      t: Date.now(), k: kind, m: moduleId(),
      msg: clip(tidy(msg), MAX_MSG), src: clip(tidy(src, true), 160),
      stack: clip(tidy(stack, true), MAX_STACK), n: 1,
    };
    var items = load();
    var last = items[items.length - 1];
    if (last && last.k === entry.k && last.m === entry.m && last.msg === entry.msg && last.src === entry.src) {
      last.n = (last.n || 1) + 1;
      last.t = entry.t;
    } else {
      items.push(entry);
      if (items.length > MAX) items = items.slice(items.length - MAX);
    }
    save(items);
    notify();
    showBadge();
  }

  /* --- Перехват ------------------------------------------------------- */
  try {
    global.addEventListener('error', function (e) {
      try {
        if (e.target && e.target !== global) return;          // ресурс не загрузился — не ошибка кода
        var msg = (e.error && e.error.message) || e.message || 'error';
        if (/ResizeObserver loop/i.test(msg)) return;         // безвредное уведомление браузера
        var src = e.filename ? e.filename + ':' + (e.lineno || 0) + ':' + (e.colno || 0) : '';
        record('error', msg, src, e.error && e.error.stack);
      } catch (x) { /* см. «Отказоустойчивость» */ }
    });
    global.addEventListener('unhandledrejection', function (e) {
      try {
        var r = e.reason;
        var msg = r && r.message ? r.message : String(r);
        record('rejection', msg, '', r && r.stack);
      } catch (x) { /* см. «Отказоустойчивость» */ }
    });
  } catch (e) { /* окружение без window — нечего ловить */ }

  /* --- Тексты --------------------------------------------------------- */
  /* Значок появляется и там, где словарь ещё не подгружен, — три строки по-русски
     как запасной вариант. Остальное живёт в shared/i18n/common.js. */
  var FALLBACK = {
    'errors.badge': 'Записана ошибка. Нажмите, чтобы скопировать диагностику',
    'errors.copied': 'Диагностика скопирована',
    'errors.copy_failed': 'Не удалось скопировать',
  };
  function t(key, vars) {
    try {
      if (global.CWI18n) {
        var s = global.CWI18n.t(key, vars);
        if (s && s !== key) return s;
      }
    } catch (e) { /* ниже запасной вариант */ }
    return FALLBACK[key] || key;
  }

  /* --- Диагностика ---------------------------------------------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function report() {
    var out = [];
    var mods = global.CW_MODULES || {};
    var off = -new Date().getTimezoneOffset() / 60;
    out.push('Circuit Workspace — диагностика');
    out.push('Снято: ' + stamp(Date.now()) + ' (UTC' + (off >= 0 ? '+' : '') + off + ')');
    out.push('Страница: ' + moduleId());
    out.push('Хаб: ' + (global.CW_VERSION || '?'));
    out.push('Модули: ' + (Object.keys(mods).map(function (id) { return id + ' ' + mods[id].version; }).join('; ') || '?'));
    try {
      var nav = global.navigator || {};
      var standalone = global.matchMedia && global.matchMedia('(display-mode: standalone)').matches;
      out.push('Браузер: ' + (nav.userAgent || '?'));
      out.push('Язык: ' + (nav.language || '?') + (global.CWI18n ? ' / интерфейс ' + global.CWI18n.getLang() : ''));
      out.push('Экран: ' + global.innerWidth + '×' + global.innerHeight + ' @' + (global.devicePixelRatio || 1));
      out.push('Сеть: ' + (nav.onLine === false ? 'нет' : 'есть') + '; режим: ' + (standalone ? 'установленное' : 'браузер') +
        '; worker: ' + (nav.serviceWorker && nav.serviceWorker.controller ? 'активен' : 'нет'));
    } catch (e) { /* часть строк может отсутствовать */ }
    var items = load();
    out.push('');
    out.push('Ошибки (' + items.length + '):');
    if (!items.length) out.push('  нет');
    items.forEach(function (it, i) {
      out.push((i + 1) + '. ' + stamp(it.t) + ' · ' + it.m + ' · ' + it.k + (it.n > 1 ? ' ×' + it.n : ''));
      out.push('   ' + it.msg + (it.src ? ' — ' + it.src : ''));
      if (it.stack) out.push('   ' + it.stack.split('\n').slice(0, 6).join('\n   '));
    });
    return out.join('\n');
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  /** @returns {Promise<boolean>} удалось ли положить текст в буфер. */
  function copy() {
    var text = report();
    try {
      if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
      }
    } catch (e) { /* ниже запасной путь */ }
    return Promise.resolve(legacyCopy(text));
  }

  function clear() {
    try { global.localStorage.removeItem(KEY); } catch (e) { /* no-op */ }
    seen = {};
    notify();
  }

  /* --- Значок --------------------------------------------------------- */
  var badge = null;
  var hideTimer = null;

  function showBadge() {
    try {
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', showBadge, { once: true });
        return;
      }
      if (document.getElementById('errorsCard')) return;       // в хабе информация уже на карточке
      if (!badge) {
        var css = document.createElement('style');
        css.textContent =
          '.cw-errbadge{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:9000;' +
          'width:32px;height:32px;border-radius:50%;border:0;padding:0;font:700 16px/32px system-ui,sans-serif;' +
          'text-align:center;color:#fff;background:#b3261e;opacity:.55;cursor:pointer}' +
          '.cw-errbadge:hover,.cw-errbadge:focus-visible{opacity:1}' +
          '@media print{.cw-errbadge{display:none!important}}';
        document.head.appendChild(css);
        badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'cw-errbadge';
        badge.addEventListener('click', function () {
          copy().then(function (ok) {
            badge.textContent = ok ? '✓' : '?';
            badge.title = t(ok ? 'errors.copied' : 'errors.copy_failed');
            badge.setAttribute('aria-label', badge.title);
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function () { badge.hidden = true; }, 2500);
          });
        });
        document.body.appendChild(badge);
      }
      badge.hidden = false;
      badge.textContent = '!';
      badge.title = t('errors.badge');
      badge.setAttribute('aria-label', badge.title);
    } catch (e) { /* значок — удобство, не обязанность */ }
  }

  global.CWErrors = {
    KEY: KEY,
    MAX: MAX,
    list: load,
    count: function () { return load().length; },
    report: report,
    copy: copy,
    clear: clear,
    /** Подписка на запись/очистку на ЭТОЙ странице; чужие вкладки — через `storage`. */
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
  };
})(self);
