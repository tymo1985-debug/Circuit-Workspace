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
 * HUB AS SINGLE UPDATE AUTHORITY (введено 04.09.2026). До этой правки каждая
 * страница (хаб и все четыре модуля) сама решала, показывать ли пользователю
 * баннер «Обновить», и сама слала SKIP_WAITING. Открытая вкладка модуля
 * могла показать собственный баннер независимо от хаба — двойной UI одного
 * и того же события. Теперь:
 *
 *  1. Ни один SW по-прежнему не зовёт skipWaiting() на установке. Новый
 *     worker доходит до `waiting` и там останавливается.
 *  2. Пользовательский UI обновления (баннер со списком изменившихся
 *     модулей, кнопка «Обновить всё») существует ТОЛЬКО на странице хаба —
 *     режим `ui: 'hub'`.
 *  3. Все четыре модуля подключают этот же файл в режиме `ui: 'silent'`:
 *     SW регистрируется и отслеживается, но локальная кнопка «Обновить»
 *     никогда не рисуется и локальный пользовательский SKIP_WAITING никогда
 *     не отправляется. Единственное, что может увидеть пользователь модуля,
 *     — нейтральное уведомление без кнопки действия: «Доступно обновление —
 *     открыть Hub» со ссылкой на хаб. Это не самостоятельный update-flow:
 *     уведомление не предлагает применить обновление на месте, только
 *     перейти туда, где это можно сделать. Никакого таймера, превращающего
 *     это уведомление обратно в локальный apply, не существует.
 *  4. Хаб находит все обновившиеся scopes через ограниченный по времени
 *     orchestration-цикл (`checkAll`, ниже) и применяет их одной кнопкой.
 *
 * ПОЧЕМУ CHECKALL() ОБХОДИТ ВСЕ РЕГИСТРАЦИИ. GitHub Pages — один origin на
 * весь монорепо, поэтому `getRegistrations()` со страницы хаба видит
 * регистрации всех четырёх модулей. Одна кнопка в хабе форсирует проверку
 * всем сразу — не нужно заходить в каждый модуль по очереди.
 *
 * ПОЧЕМУ update() НЕДОСТАТОЧНО САМ ПО СЕБЕ. Промис `reg.update()` резолвится,
 * когда сеть отработала — это НЕ означает, что новый worker уже дошёл до
 * `installed`/`waiting`: установка идёт по отдельному пайплайну (`installing`
 * → событие `statechange`). Опрос `reg.waiting` сразу после `update()` мог бы
 * пропустить модуль, чей worker всё ещё в `installing` в момент проверки.
 * Поэтому `checkAll()` после `update()` дожидается исхода (уже готовый
 * `waiting`, либо `updatefound` → `installed`) с ограничением по времени —
 * не бесконечно, но и не мгновенным опросом.
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

  /* Сколько ждать исход update-цикла одной регистрации (installed/waiting
     либо явное отсутствие изменений) прежде чем считать её недоступной. */
  var UPDATE_TIMEOUT_MS = 10000;
  /* Сколько ждать активацию (controllerchange) после SKIP_WAITING одному
     scope, прежде чем всё равно продолжить — воркер мог активироваться и
     без немедленного события в редких браузерах/условиях. */
  var ACTIVATE_TIMEOUT_MS = 6000;

  /* Своя регистрация: та, что управляет текущей страницей. */
  var ownReg = null;
  /* Режим страницы: 'hub' — полный UI и apply; 'silent' — только нейтральное
     уведомление-ссылка, никогда кнопка «Обновить», никогда локальный
     SKIP_WAITING по инициативе пользователя. */
  var uiMode = 'hub';
  /* Куда ведёт нейтральное уведомление в silent-режиме. */
  var hubHref = '../index.html';
  /* Был ли контроллер в момент запуска. Первая в жизни установка SW тоже
     вызывает controllerchange (через clients.claim), но перезагружать там
     нечего — страница уже свежая. */
  var hadController = !!(nav && nav.serviceWorker && nav.serviceWorker.controller);
  var reloading = false;
  var barShown = false;
  /* Нейтральное уведомление silent-режима показывается один раз за время
     жизни страницы — повторный updatefound не должен спамить тем же текстом. */
  var neutralShown = false;

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
      '#' + BAR_ID + ' .cw-update__list{margin:4px 0 0;padding:0;list-style:none;font-size:13px;opacity:.92}',
      '#' + BAR_ID + ' .cw-update__list li{padding:1px 0}',
      '#' + BAR_ID + ' button,#' + BAR_ID + ' a.cw-update__link{flex:0 0 auto;min-height:36px;padding:7px 16px;border-radius:999px;',
      'border:0;font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}',
      '#' + BAR_ID + ' .cw-update__apply,#' + BAR_ID + ' a.cw-update__link{background:var(--md-inverse-primary,#c9a3ff);',
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
   * @param {Array<string>} [opts.listItems] построчный список (уже переведённые строки)
   * @param {Function} [opts.onApply] кнопка действия «Обновить» (только hub-режим)
   * @param {string} [opts.linkHref] если задан вместо onApply — рисуется ссылка,
   *                                 не кнопка (silent-режим: переход, не apply)
   * @param {string} [opts.linkKey] ключ i18n подписи ссылки
   * @param {string} [opts.linkFallback]
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

    if (opts.listItems && opts.listItems.length) {
      var list = doc.createElement('ul');
      list.className = 'cw-update__list';
      opts.listItems.forEach(function (line) {
        var li = doc.createElement('li');
        li.textContent = line;
        list.appendChild(li);
      });
      text.appendChild(list);
    }

    if (opts.onApply) {
      var apply = doc.createElement('button');
      apply.type = 'button';
      apply.className = 'cw-update__apply';
      apply.setAttribute('data-i18n', opts.applyKey || 'update.apply');
      apply.textContent = t(opts.applyKey || 'update.apply', opts.applyFallback || 'Обновить');
      apply.addEventListener('click', opts.onApply);
      bar.appendChild(apply);

      var later = doc.createElement('button');
      later.type = 'button';
      later.className = 'cw-update__later';
      later.setAttribute('data-i18n', 'update.later');
      later.textContent = t('update.later', 'Позже');
      later.addEventListener('click', hideBar);
      bar.appendChild(later);
    } else if (opts.linkHref) {
      /* Ссылка, а не кнопка-действие: silent-режим никогда не применяет
         обновление на месте, только предлагает переход туда, где это можно
         сделать. */
      var link = doc.createElement('a');
      link.className = 'cw-update__link';
      link.href = opts.linkHref;
      link.setAttribute('data-i18n', opts.linkKey || 'update.open_hub');
      link.textContent = t(opts.linkKey || 'update.open_hub', opts.linkFallback || 'Открыть Hub');
      bar.appendChild(link);
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

  /** Применить уже дождавшееся обновление своей страницы. Доступно только
      из hub-режима (кнопка «Обновить всё» зовёт это для scope хаба) — из
      silent-режима эта функция никогда не вызывается пользовательским
      действием. */
  function applyOwn() {
    var waiting = ownReg && ownReg.waiting;
    if (!waiting) { global.location.reload(); return; }
    hideBar();
    try { waiting.postMessage({ type: 'SKIP_WAITING' }); }
    catch (e) { global.location.reload(); }
  }

  /* Нейтральное уведомление silent-режима: только ссылка на хаб, без кнопки
     применения. Показывается один раз за время жизни страницы. */
  function offerNeutral() {
    if (neutralShown) return;
    neutralShown = true;
    showBar({
      textKey: 'update.available_open_hub',
      textFallback: 'Доступно обновление Circuit Workspace — открыть Hub',
      linkHref: hubHref,
      linkKey: 'update.open_hub',
      linkFallback: 'Открыть Hub',
    });
  }

  function offerOwn() {
    if (uiMode !== 'hub') { offerNeutral(); return; }
    showBar({
      textKey: 'update.available',
      textFallback: 'Доступна новая версия приложения.',
      onApply: applyOwn,
    });
  }

  /* Grace period перед показом neutral-banner в silent-режиме: устойчивый
     ли это waiting, или воркер уже в процессе activate после недавнего
     Hub-apply (SKIP_WAITING мог прийти секунду назад с другой вкладки/со
     страницы хаба). Никакого нового reg.update() здесь не вызывается —
     только слушаем statechange уже существующего waiting-воркера и
     повторно проверяем reg.waiting по таймауту. */
  var NEUTRAL_GRACE_MS = 2500;

  function confirmStaleWaiting(reg) {
    return new Promise(function (resolve) {
      if (!reg.waiting) { resolve(false); return; }
      var settled = false;
      var w = reg.waiting;

      function finish(stillWaiting) {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        resolve(stillWaiting);
      }

      /* Если этот конкретный worker уходит из waiting (activating/activated/
         redundant), значит он был в процессе перехода, а не устойчивым
         pending-состоянием — banner не нужен. */
      w.addEventListener('statechange', function onState() {
        if (w.state !== 'installed') finish(!!reg.waiting);
      });

      var timer = global.setTimeout(function () { finish(!!reg.waiting); }, NEUTRAL_GRACE_MS);
    });
  }

  /* Обновление могло дойти до `waiting` ещё до загрузки этой страницы —
     тогда никакого updatefound уже не будет, и без этой проверки полоса
     не появилась бы никогда. */
  function watch(reg) {
    if (!reg) return;
    if (reg.waiting && nav.serviceWorker.controller) {
      if (uiMode === 'hub') {
        offerOwn();
      } else {
        /* silent-режим: не доверяем waiting мгновенно — короткий grace
           period на случай, если это transient-состояние сразу после
           Hub-apply (worker уже переходит в activating, просто ещё не
           долетело событие до этой, только что открытой страницы). */
        confirmStaleWaiting(reg).then(function (stillWaiting) {
          if (stillWaiting) offerNeutral();
        });
      }
    }
    reg.addEventListener('updatefound', function () {
      var installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', function () {
        if (installing.state === 'installed' && nav.serviceWorker.controller) offerOwn();
      });
    });
  }

  /**
   * Дожидается появления waiting-воркера у регистрации: либо он уже есть,
   * либо доходит до этого через `updatefound` → `installed`, в пределах
   * таймаута. Подписка ставится ДО вызова reg.update() снаружи (см.
   * checkAll) — иначе есть риск гонки, если updatefound сработает уже
   * внутри промиса update().
   *
   * ВАЖНО: таймаут здесь НЕ означает ошибку. Если у scope нет нового
   * release, `updatefound` не произойдёт никогда — это нормальный исход
   * «обновления нет», а не «не удалось проверить». Решение о том,
   * `updateFailed`/`hasWaiting`/`noUpdate`, принимает checkAll на основе
   * реального success/reject самого reg.update(), а не этой функции.
   *
   * @returns {Promise<boolean>} true — появился waiting worker
   */
  function waitForOutcome(reg) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = null;

      function finish(result) {
        if (settled) return;
        settled = true;
        if (timer) global.clearTimeout(timer);
        resolve(result);
      }

      if (reg.waiting) { finish(true); return; }

      var installing = reg.installing;
      if (installing) {
        installing.addEventListener('statechange', function onState() {
          if (installing.state === 'installed') finish(!!reg.waiting);
          else if (installing.state === 'redundant') finish(!!reg.waiting);
        });
      }

      /* updatefound может сработать позже (update() ещё сетевой запрос
         отправляет) — слушаем и его, на случай если installing выше был
         ещё пуст в момент вызова. */
      reg.addEventListener('updatefound', function onFound() {
        var inst = reg.installing;
        if (!inst) return;
        inst.addEventListener('statechange', function onState2() {
          if (inst.state === 'installed') finish(!!reg.waiting);
          else if (inst.state === 'redundant') finish(!!reg.waiting);
        });
      });

      /* Таймаут — не находка «offline», а просто «дальше не ждём»: если к
         этому моменту waiting нет, значит нет и нового release (при
         условии, что reg.update() выше уже успешно отработал — это
         проверяется в checkAll, не здесь). */
      timer = global.setTimeout(function () { finish(!!reg.waiting); }, UPDATE_TIMEOUT_MS);
    });
  }

  /** Дожидается активации конкретной регистрации после SKIP_WAITING — по
      исчезновению `waiting`. Ограничено по времени; возвращает статус,
      а не просто резолвится молча: хабу нужно знать, подтвердился ли
      конкретный scope, а не считать бездоказательный timeout успехом. */
  function waitForActivation(reg) {
    return new Promise(function (resolve) {
      var settled = false;
      var poll = null;
      var timer = global.setTimeout(function () { finish('timedOut'); }, ACTIVATE_TIMEOUT_MS);

      function finish(status) {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        if (poll) global.clearInterval(poll);
        resolve(status);
      }

      poll = global.setInterval(function () {
        if (!reg.waiting) finish('activated');
      }, 300);
    });
  }

  var CWUpdate = {
    /**
     * Регистрирует SW модуля/хаба и включает слежение за обновлениями.
     * @param {Object} [options]
     * @param {string} [options.swUrl='./sw.js'] путь к service worker'у
     * @param {string} [options.ui='hub'] 'hub' — полный UI (баннер + apply);
     *   'silent' — модуль: без кнопки «Обновить», без пользовательского
     *   SKIP_WAITING; максимум нейтральная ссылка на хаб.
     * @param {string} [options.hubHref='../index.html'] куда ведёт ссылка
     *   «Открыть Hub» в silent-режиме.
     */
    init: function (options) {
      if (unsupported()) return Promise.resolve(null);
      var swUrl = (options && options.swUrl) || './sw.js';
      uiMode = (options && options.ui) || 'hub';
      if (options && options.hubHref) hubHref = options.hubHref;

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
     * Bounded orchestration для кнопки «Обновить всё» в хабе. Проходит по
     * ВСЕМ регистрациям origin (хаб + четыре модуля), для каждой форсирует
     * update() и ДОЖИДАЕТСЯ появление waiting-воркера (installed/waiting
     * либо явный таймаут) — не просто опрашивает reg.waiting сразу после
     * update(), которое могло бы пропустить регистрацию, всё ещё
     * находящуюся в installing.
     *
     * Три состояния на регистрацию, а не одно бинарное: успешный
     * reg.update() без найденного waiting — это `noUpdate` (обновления нет,
     * нормальный результат), а НЕ `updateFailed`. Смешивать их и раньше
     * приводило к тому, что обычное «обновлений нет» показывалось
     * пользователю как «нет соединения».
     *
     * @returns {Promise<{ready: Array<{scope:string,reg:Object}>, failed: Array<{scope:string}>}>}
     *   ready  — hasWaiting: у регистрации к концу цикла есть reg.waiting;
     *   failed — updateFailed: сам reg.update() отклонился (реальная
     *            сетевая/иная ошибка на этот scope). noUpdate нигде не
     *            накапливается отдельно — это отсутствие записи в обоих
     *            списках.
     */
    checkAll: function () {
      if (unsupported()) return Promise.resolve({ ready: [], failed: [] });

      return nav.serviceWorker.getRegistrations().then(function (regs) {
        if (!regs.length) return { ready: [], failed: [] };

        return Promise.all(regs.map(function (reg) {
          /* Подписка на исход СНАЧАЛА, update() запускается следом —
             иначе updatefound мог бы сработать до того, как мы начали
             слушать. */
          var outcome = waitForOutcome(reg);
          return reg.update().then(
            function () { return { reg: reg, updateFailed: false }; },
            function () { return { reg: reg, updateFailed: true }; }
          ).then(function (r) {
            /* updateFailed уже известен независимо от outcome — но если
               update() сам отклонился, waiting всё равно может однажды
               появиться (installed от прошлой фоновой проверки браузера).
               Ждём outcome в любом случае, updateFailed решает КАТЕГОРИЮ
               результата ниже, не отменяет сам факт reg.waiting. */
            return outcome.then(function (hasWaiting) {
              r.hasWaiting = hasWaiting;
              return r;
            });
          });
        })).then(function (results) {
          var ready = [];
          var failed = [];
          results.forEach(function (r) {
            if (r.reg.waiting) { ready.push({ scope: r.reg.scope, reg: r.reg }); return; }
            /* Регистрация без waiting: updateFailed → реальная ошибка на
               этот scope (failed); иначе — noUpdate, не попадает никуда. */
            if (r.updateFailed) failed.push({ scope: r.reg.scope, reg: r.reg });
          });
          return { ready: ready, failed: failed };
        });
      }, function () {
        /* getRegistrations() сам отклонился — это не про сеть отдельного
           scope, а про API целиком; единственный разумный сигнал —
           «ничего не проверено». */
        return { ready: [], failed: [{ scope: '*' }] };
      });
    },

    /**
     * Применяет обновление ко всем переданным регистрациям (результат
     * `checkAll().ready`) и дожидается активации каждой в пределах таймаута
     * — не молча резолвится после SKIP_WAITING, а ждёт исчезновения
     * `reg.waiting` для КАЖДОГО scope и возвращает статус по каждому.
     * Хаб не может полагаться на `controllerchange` для чужих module
     * scopes (страница хаба ими не контролируется) — поэтому per-scope
     * подтверждение идёт по состоянию самой регистрации (`waiting`
     * исчез = activated), не по событию контроллера.
     *
     * Own-scope (хаб), если был среди readyList, после активации
     * перезагрузится сам — controllerchange уже подписан в init(). Чужие
     * scopes просто получают новый активный worker; если вкладка модуля
     * всё же открыта в фоне, её собственный controllerchange (тот же
     * механизм init()) сам перезагрузит её позже — без участия хаба.
     *
     * @param {Array<{scope:string, reg:ServiceWorkerRegistration}>} readyList
     * @returns {Promise<{results: Array<{scope:string, status:string}>, allActivated: boolean}>}
     *   status — 'activated' | 'timedOut'. allActivated=false означает
     *   ПОЛНЫЙ успех подтверждён НЕ для всех — вызывающий код (хаб) должен
     *   показать partial result, а не «обновлено полностью».
     */
    applyAll: function (readyList) {
      var list = readyList || [];
      list.forEach(function (item) {
        if (!item.reg || !item.reg.waiting) return;
        try { item.reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }
        catch (e) { /* воркер уже активируется */ }
      });
      return Promise.all(list.map(function (item) {
        if (!item.reg) return Promise.resolve('activated');
        return waitForActivation(item.reg);
      })).then(function (statuses) {
        var results = list.map(function (item, i) {
          return { scope: item.scope, status: statuses[i] };
        });
        var allActivated = statuses.every(function (s) { return s === 'activated'; });
        return { results: results, allActivated: allActivated };
      });
    },

    /** Применить обновление своей страницы (используется хабом внутри
        applyAll для собственного scope через общий механизм; напрямую из
        silent-режима не вызывается). */
    apply: applyOwn,

    /** Скрыть полосу — на случай, если модулю нужно место внизу экрана. */
    dismiss: hideBar,

    /** Показать произвольное уведомление той же полосой (без кнопки действия). */
    notify: function (key, fallback, autoHide) {
      showBar({ textKey: key, textFallback: fallback, autoHide: autoHide || 4000 });
    },

    /** Показать баннер хаба со списком модулей и одной кнопкой действия.
        Только для ui:'hub'. По умолчанию — предложение обновиться
        («Доступно обновление» + «Обновить всё»); post-update использует тот
        же баннер с другим текстом и кнопкой-подтверждением через opts. */
    offerHubBanner: function (opts) {
      if (uiMode !== 'hub') return;
      showBar({
        textKey: opts.textKey || 'update.available_multi',
        textFallback: opts.textFallback || 'Доступно обновление Circuit Workspace',
        listItems: opts.listItems,
        onApply: opts.onApply,
        applyKey: opts.applyKey || 'update.apply_all',
        applyFallback: opts.applyFallback || 'Обновить всё',
      });
    },
  };

  global.CWUpdate = CWUpdate;
})(typeof self !== 'undefined' ? self : this);
