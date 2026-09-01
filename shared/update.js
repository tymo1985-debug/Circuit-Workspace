/**
 * Circuit Workspace — shared/update.js
 * Единственное место, где живёт регистрация service worker'а и вся логика
 * обновления приложения.
 *
 * ЗАЧЕМ ОН ПОЯВИЛСЯ. Регистрация SW была написана заново в каждом из четырёх
 * модулей и в хабе — пять разных вариантов с разным поведением. Клиндарий
 * перезагружал страницу молча и сразу (прямо посреди заполнения формуляра),
 * остальные три не отслеживали обновление вообще: пользователь неделями
 * работал на старом коде и узнавал об этом только когда что-то переставало
 * работать. Именно так и вышло 11.08.2026: старый `app.js` из кэша рядом с
 * новой разметкой — кнопки выдачи формуляров и писем нажимались вхолостую.
 *
 * КАК ЭТО РАБОТАЕТ ТЕПЕРЬ.
 *  1. Ни один SW больше не зовёт skipWaiting() на установке. Новый worker
 *     доходит до состояния `waiting` и там останавливается — открытая
 *     страница продолжает работать на том наборе файлов, с которым
 *     запустилась. Смешения старого кода со свежими ассетами не возникает.
 *  2. Как только обновление готово, показывается ненавязчивая полоса внизу
 *     экрана: «Доступна новая версия» + «Обновить» / «Позже». Решает
 *     пользователь, а не приложение — потерять несохранённый формуляр
 *     из-за внезапной перезагрузки нельзя.
 *  3. Кнопка «Обновить» шлёт worker'у SKIP_WAITING; тот активируется, ловится
 *     `controllerchange`, страница перезагружается уже осознанно.
 *
 * ПОЧЕМУ CHECK() ОБХОДИТ ВСЕ РЕГИСТРАЦИИ. GitHub Pages — один origin на весь
 * монорепо, поэтому `getRegistrations()` со страницы хаба видит регистрации
 * всех четырёх модулей. Одна кнопка в шапке хаба форсирует проверку и хабу, и
 * каждому модулю: не нужно заходить в каждый и жать Shift+Cmd+R по очереди.
 * Чужим (не управляющим этой страницей) регистрациям обновление применяется
 * сразу и молча — их страницы не открыты, ломать нечего.
 *
 * `self` вместо `window` — единообразно с остальным общим слоем; файл
 * рассчитан на подключение обычным <script>, в service worker'е не нужен.
 */
(function (global) {
  'use strict';

  var nav = global.navigator;
  var doc = global.document;

  var BAR_ID = 'cwUpdateBar';
  var STYLE_ID = 'cwUpdateStyle';

  /* Своя регистрация: та, что управляет текущей страницей. */
  var ownReg = null;
  /* Был ли контроллер в момент запуска. Первая в жизни установка SW тоже
     вызывает controllerchange (через clients.claim), но перезагружать там
     нечего — страница уже свежая. */
  var hadController = !!(nav && nav.serviceWorker && nav.serviceWorker.controller);
  var reloading = false;
  var barShown = false;

  function unsupported() {
    return !nav || !doc || !('serviceWorker' in nav);
  }

  /* Перевод с запасным вариантом: модуль может быть открыт без общего слоя
     локализации, и тогда полоса всё равно должна быть читаемой. */
  function t(key, fallback) {
    if (global.CWI18n) {
      try {
        var value = global.CWI18n.t(key);
        if (value && value !== key) return value;
      } catch (e) { /* словарь ещё не зарегистрирован */ }
    }
    return fallback;
  }

  function injectStyle() {
    if (doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    /* Токены MD3 общего слоя с запасными значениями: файл должен выглядеть
       прилично и в модуле, открытом без shared/style.css. */
    style.textContent = [
      '#' + BAR_ID + '{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom, 0px));transform:translateX(-50%);',
      'z-index:2147483000;display:flex;align-items:center;gap:12px;flex-wrap:wrap;',
      'max-width:min(560px,calc(100vw - 24px));padding:12px 16px;border-radius:16px;',
      'background:var(--md-inverse-surface,#2f2f33);color:var(--md-inverse-on-surface,#f2f0f4);',
      'box-shadow:0 12px 32px rgba(0,0,0,.28);font:inherit;font-size:14px;line-height:1.35}',
      '#' + BAR_ID + ' .cw-update__text{flex:1 1 200px;min-width:0}',
      '#' + BAR_ID + ' button{flex:0 0 auto;min-height:36px;padding:7px 16px;border-radius:999px;',
      'border:0;font:inherit;font-size:14px;font-weight:600;cursor:pointer}',
      '#' + BAR_ID + ' .cw-update__apply{background:var(--md-inverse-primary,#c9a3ff);',
      'color:var(--md-on-primary-container,#22005d)}',
      '#' + BAR_ID + ' .cw-update__later{background:transparent;color:inherit;font-weight:500;opacity:.85}',
      '@media print{#' + BAR_ID + '{display:none !important}}',
    ].join('');
    (doc.head || doc.documentElement).appendChild(style);
  }

  function hideBar() {
    var bar = doc.getElementById(BAR_ID);
    if (bar) bar.remove();
    barShown = false;
  }

  /**
   * Полоса обновления.
   * @param {Object} opts
   * @param {string} opts.textKey  ключ i18n основного текста
   * @param {string} opts.textFallback
   * @param {Function} [opts.onApply] если не задан — кнопка действия не рисуется
   *                                  (полоса становится просто уведомлением)
   * @param {number} [opts.autoHide] мс до автоскрытия
   */
  function showBar(opts) {
    if (unsupported()) return;
    injectStyle();
    hideBar();

    var bar = doc.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'status');

    var text = doc.createElement('span');
    text.className = 'cw-update__text';
    text.setAttribute('data-i18n', opts.textKey);
    text.textContent = t(opts.textKey, opts.textFallback);
    bar.appendChild(text);

    if (opts.onApply) {
      var apply = doc.createElement('button');
      apply.type = 'button';
      apply.className = 'cw-update__apply';
      apply.setAttribute('data-i18n', 'update.apply');
      apply.textContent = t('update.apply', 'Обновить');
      apply.addEventListener('click', opts.onApply);
      bar.appendChild(apply);

      var later = doc.createElement('button');
      later.type = 'button';
      later.className = 'cw-update__later';
      later.setAttribute('data-i18n', 'update.later');
      later.textContent = t('update.later', 'Позже');
      later.addEventListener('click', hideBar);
      bar.appendChild(later);
    }

    doc.body.appendChild(bar);
    barShown = true;
    /* Смена языка на лету не должна оставлять полосу на прежнем языке. */
    if (global.CWI18n && global.CWI18n.apply) {
      try { global.CWI18n.apply(bar); } catch (e) { /* словарь не готов */ }
    }
    if (opts.autoHide) {
      global.setTimeout(function () { if (barShown) hideBar(); }, opts.autoHide);
    }
  }

  /** Применить уже дождавшееся обновление своей страницы. */
  function applyOwn() {
    var waiting = ownReg && ownReg.waiting;
    if (!waiting) { global.location.reload(); return; }
    hideBar();
    try { waiting.postMessage({ type: 'SKIP_WAITING' }); }
    catch (e) { global.location.reload(); }
  }

  function offerOwn() {
    showBar({
      textKey: 'update.available',
      textFallback: 'Доступна новая версия приложения.',
      onApply: applyOwn,
    });
  }

  /* Обновление могло дойти до `waiting` ещё до загрузки этой страницы —
     тогда никакого updatefound уже не будет, и без этой проверки полоса
     не появилась бы никогда. */
  function watch(reg) {
    if (!reg) return;
    if (reg.waiting && nav.serviceWorker.controller) offerOwn();
    reg.addEventListener('updatefound', function () {
      var installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', function () {
        if (installing.state === 'installed' && nav.serviceWorker.controller) offerOwn();
      });
    });
  }

  var CWUpdate = {
    /**
     * Регистрирует SW модуля/хаба и включает слежение за обновлениями.
     * @param {Object} [options]
     * @param {string} [options.swUrl='./sw.js'] путь к service worker'у
     */
    init: function (options) {
      if (unsupported()) return Promise.resolve(null);
      var swUrl = (options && options.swUrl) || './sw.js';

      nav.serviceWorker.addEventListener('controllerchange', function () {
        /* Первая установка: контроллера не было, перезагружать нечего. */
        if (!hadController || reloading) return;
        reloading = true;
        global.location.reload();
      });

      /* Регистрируем после load: до него страница ещё борется за сеть
         с ассетами первой отрисовки. */
      var start = function () {
        return nav.serviceWorker.register(swUrl, { updateViaCache: 'none' })
          .then(function (reg) {
            ownReg = reg;
            watch(reg);
            /* Тихая проверка на старте — без неё браузер сверяет sw.js
               по своему расписанию и обновление могло висеть сутками. */
            reg.update().catch(function () { /* нет сети */ });
            return reg;
          })
          .catch(function (err) {
            console.warn('CWUpdate: регистрация service worker не удалась', err);
            return null;
          });
      };

      if (doc.readyState === 'complete') return start();
      return new Promise(function (resolve) {
        global.addEventListener('load', function () { resolve(start()); }, { once: true });
      });
    },

    /**
     * Ручная проверка обновлений — то, что делает кнопка в шапке хаба.
     * Проходит по ВСЕМ регистрациям origin: хаб + все четыре модуля.
     *
     * @returns {Promise<'ready'|'others'|'current'|'offline'|'unsupported'>}
     *   ready  — обновилась сама эта страница, показана полоса с «Обновить»;
     *   others — обновились другие модули (их страницы не открыты, применено сразу);
     *   current — всё уже актуально;
     *   offline — ни одну регистрацию не удалось проверить (нет сети).
     */
    check: function () {
      if (unsupported()) return Promise.resolve('unsupported');

      return nav.serviceWorker.getRegistrations().then(function (regs) {
        if (!regs.length) return 'current';

        var reachable = 0;
        return Promise.all(regs.map(function (reg) {
          return reg.update().then(function () { reachable++; }, function () { /* нет сети */ });
        })).then(function () {
          if (!reachable) return 'offline';

          var ownScope = ownReg ? ownReg.scope : null;
          var mineReady = false;
          var othersReady = false;

          regs.forEach(function (reg) {
            if (!reg.waiting) return;
            if (ownScope && reg.scope === ownScope) { mineReady = true; return; }
            /* Чужой модуль: его страница не открыта, применяем молча. */
            othersReady = true;
            try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) { /* уже активируется */ }
          });

          if (mineReady) { offerOwn(); return 'ready'; }
          if (othersReady) return 'others';
          return 'current';
        });
      }, function () { return 'offline'; });
    },

    /** Применить обновление своей страницы (кнопка «Обновить»). */
    apply: applyOwn,

    /** Скрыть полосу — на случай, если модулю нужно место внизу экрана. */
    dismiss: hideBar,

    /** Показать произвольное уведомление той же полосой (без кнопки действия). */
    notify: function (key, fallback, autoHide) {
      showBar({ textKey: key, textFallback: fallback, autoHide: autoHide || 4000 });
    },
  };

  global.CWUpdate = CWUpdate;
})(typeof self !== 'undefined' ? self : this);
