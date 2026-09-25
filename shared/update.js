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
 * ПОЧЕМУ CHECKALL() ФИЛЬТРУЕТ РЕГИСТРАЦИИ. GitHub Pages — один origin для
 * нескольких независимых проектов владельца, поэтому `getRegistrations()`
 * со страницы хаба видит не только Circuit Workspace. Оркестрация работает
 * только с точными scope хаба и шести модулей из CW_MODULES; чужой worker не
 * проверяется и ни при каких обстоятельствах не получает SKIP_WAITING.
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
  /* Финальный post-update статус проверяется уже по active worker'ам. Это
     отдельное окно: apply-страница может исчезнуть по controllerchange, а
     после reload браузеру нужно дать немного времени стабилизировать все
     регистрации прежде, чем объявлять реальный partial failure. */
  var VERIFY_TIMEOUT_MS = 10000;
  var VERIFY_POLL_MS = 250;

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
  /* Снимок marker на старте Hub сохраняется в памяти раньше, чем inline-код
     index.html удалит sessionStorage-запись для one-shot показа. Благодаря
     этому финальная verifier-ветка всё ещё знает точные target versions. */
  var bootPendingRelease = null;

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
    /* Реальный reload уже запланирован (controllerchange своей страницы) —
       рисовать что-либо бессмысленно и опасно: DOM вот-вот заменится, а
       успевший отрисоваться баннер может на долю секунды показать неверный
       текст поверх уже устаревшей страницы. location.reload() не обрывает
       текущий тик синхронно, поэтому код после него может ещё выполниться. */
    if (reloading) return;
    injectStyle();
    hideBar();

    var bar = doc.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'status');

    var text = doc.createElement('span');
    text.className = 'cw-update__text';
    /* CWI18n.apply() replaces textContent of data-i18n nodes. If the list is
       nested here, that replacement silently deletes the changelog. */
    if (!opts.listItems || !opts.listItems.length) text.setAttribute('data-i18n', opts.textKey);
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
    /* Generic own-scope banner used to race the Hub orchestration banner and
       hide the changelog. Let Hub run the same full check as its toolbar. */
    if (doc && typeof global.Event === 'function') {
      doc.dispatchEvent(new global.Event('cw-update-available'));
    }
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

  /* ServiceWorkerRegistration не сообщает версию active/waiting worker.
     Без handshake исчезновение reg.waiting ошибочно считалось доказательством
     успеха, хотя активироваться мог не тот build. */
  function readWorkerVersion(worker) {
    return new Promise(function (resolve) {
      if (!worker || typeof global.MessageChannel !== 'function') { resolve(null); return; }
      var channel = new global.MessageChannel();
      var done = false;
      var timer = global.setTimeout(function () { finish(null); }, 2000);
      function finish(value) {
        if (done) return;
        done = true;
        global.clearTimeout(timer);
        try { channel.port1.close(); } catch (e) {}
        resolve(value);
      }
      channel.port1.onmessage = function (event) { finish(event.data || null); };
      try { worker.postMessage({ type: 'CW_VERSION' }, [channel.port2]); }
      catch (e) { finish(null); }
    });
  }

  function scopeMap() {
    var base = new URL('./', (doc && doc.baseURI) || global.location.href);
    var map = {};
    map[base.href] = 'hub';
    Object.keys(global.CW_MODULES || {}).forEach(function (id) {
      map[new URL(id + '/', base).href] = id;
    });
    return map;
  }

  function moduleIdForScope(scope) {
    try { return scopeMap()[new URL(scope, global.location.href).href] || null; }
    catch (e) { return null; }
  }

  function expectedVersion(id) {
    return id === 'hub' ? global.CW_VERSION : ((global.CW_MODULES[id] || {}).version || null);
  }

  function expectedTarget(id) {
    return {
      module: id,
      version: expectedVersion(id),
      hub: id === 'hub' ? null : global.CW_VERSION,
    };
  }

  function targetFromReady(item) {
    var id = moduleIdForScope(item && item.scope);
    var info = item && item.info;
    /* Главный race-fix: страница, на которой пользователь нажал «Обновить»,
       ещё работает на СТАРОМ shared/version.js. Поэтому expectedVersion(id)
       на ней может быть старее waiting-worker'а. checkAll() уже сделал
       handshake с waiting worker и положил точную цель в item.info — ей и
       доверяем. Fallback нужен только для старых/ручных callers API. */
    if (id && info && info.module === id && info.version) {
      return { module: id, version: info.version, hub: id === 'hub' ? null : (info.hub || null) };
    }
    return id ? expectedTarget(id) : null;
  }

  function workerMatchesTarget(info, target) {
    if (!info || !target) return false;
    if (info.module !== target.module || info.version !== target.version) return false;
    /* Все module workers сообщают поколение общего Hub-слоя. Это важно для
       Клиндария: его собственная версия может не меняться при shared/*
       release, но worker всё равно обязан перейти на новое CW_VERSION. */
    if (target.module !== 'hub' && target.hub && info.hub !== target.hub) return false;
    return true;
  }

  function waitForExpectedActive(reg, target, timeoutMs) {
    return new Promise(function (resolve) {
      var deadline = Date.now() + (timeoutMs || VERIFY_TIMEOUT_MS);
      var lastInfo = null;

      function attempt() {
        readWorkerVersion(reg && reg.active).then(function (info) {
          lastInfo = info;
          if (workerMatchesTarget(info, target)) {
            resolve({ status: 'activated', info: info });
            return;
          }
          if (Date.now() >= deadline) {
            resolve({ status: 'versionMismatch', info: lastInfo });
            return;
          }
          global.setTimeout(attempt, VERIFY_POLL_MS);
        });
      }
      attempt();
    });
  }

  function currentExpectedList() {
    var map = scopeMap();
    return Object.keys(map).map(function (scope) {
      var id = map[scope];
      return { scope: scope, target: expectedTarget(id) };
    });
  }

  function expectedListForPending(pending, readyList) {
    var base = new URL('./', (doc && doc.baseURI) || global.location.href);
    var releaseVersion = pending && pending.version || global.CW_VERSION;
    var releaseVersions = {};
    ((pending && pending.changes) || []).forEach(function (change) {
      if (change && change.module && change.version) releaseVersions[change.module] = change.version;
    });
    var items = [{
      scope: base.href,
      target: { module: 'hub', version: releaseVersion, hub: null },
    }];
    Object.keys(global.CW_MODULES || {}).forEach(function (id) {
      items.push({
        scope: new URL(id + '/', base).href,
        target: {
          module: id,
          version: releaseVersions[id] || expectedVersion(id),
          hub: releaseVersion,
        },
      });
    });
    /* Handshake waiting-worker'а точнее release metadata и старой страницы. */
    (readyList || []).forEach(function (ready) {
      var id = moduleIdForScope(ready && ready.scope);
      var target = targetFromReady(ready);
      if (!id || !target) return;
      var canonical = new URL(ready.scope, global.location.href).href;
      var found = items.find(function (item) { return item.scope === canonical; });
      if (found) found.target = target;
      else items.push({ scope: canonical, target: target });
    });
    return items;
  }

  function persistPendingTargets(readyList) {
    var pending = readPendingRelease();
    if (!pending) return null;
    pending.expected = expectedListForPending(pending, readyList);
    bootPendingRelease = pending;
    try {
      if (global.sessionStorage) global.sessionStorage.setItem('cwPendingRelease', JSON.stringify(pending));
    } catch (e) {}
    return pending;
  }

  function verifyCurrentRelease(expectedList) {
    if (unsupported()) return Promise.resolve({ results: [], allActivated: false });
    return ensureRegistrations().then(function () {
      return nav.serviceWorker.getRegistrations();
    }).then(function (regs) {
      var byScope = {};
      (regs || []).forEach(function (reg) {
        var id = moduleIdForScope(reg.scope);
        if (!id) return;
        try { byScope[new URL(reg.scope, global.location.href).href] = reg; } catch (e) {}
      });
      var expected = Array.isArray(expectedList) && expectedList.length
        ? expectedList
        : currentExpectedList();
      return Promise.all(expected.map(function (item) {
        var reg = byScope[item.scope];
        if (!reg) return Promise.resolve({
          scope: item.scope, module: item.target.module, status: 'missing', info: null,
        });
        return waitForExpectedActive(reg, item.target, VERIFY_TIMEOUT_MS).then(function (result) {
          return {
            scope: item.scope, module: item.target.module,
            status: result.status, info: result.info,
          };
        });
      })).then(function (results) {
        return {
          results: results,
          allActivated: results.length > 0 && results.every(function (r) { return r.status === 'activated'; }),
        };
      });
    }).catch(function (err) {
      return {
        results: [{ scope: '*', module: null, status: 'verifyFailed', info: null, error: errorDetails(err) }],
        allActivated: false,
      };
    });
  }

  function moduleTitle(id) {
    if (id === 'hub') return 'Circuit Workspace';
    return id && global.CW_MODULES && global.CW_MODULES[id]
      ? global.CW_MODULES[id].title
      : 'Circuit Workspace';
  }

  var finalVerificationPromise = null;
  var suppressNextApplyPartial = false;

  function readPendingRelease() {
    try {
      var raw = global.sessionStorage && global.sessionStorage.getItem('cwPendingRelease');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearPendingRelease() {
    try { if (global.sessionStorage) global.sessionStorage.removeItem('cwPendingRelease'); }
    catch (e) {}
    bootPendingRelease = null;
  }

  function releaseLines() {
    var release = global.CW_RELEASE;
    if (!release || !Array.isArray(release.changes)) return [];
    return release.changes.filter(function (change) {
      return change && !change.technical;
    }).map(function (change) {
      var title = moduleTitle(change.module);
      var version = change.version ? ' ' + change.version : '';
      return change.note ? (title + version + ' — ' + change.note) : (title + version);
    });
  }

  function showVerifiedRelease(result) {
    var bad = (result.results || []).filter(function (r) { return r.status !== 'activated'; });
    var lines = releaseLines();
    bad.forEach(function (r) {
      lines.push(moduleTitle(r.module) + ' — не обновлён');
    });
    showBar({
      textKey: bad.length ? 'update.partial' : 'update.installed_multi',
      textFallback: bad.length ? 'Обновление установлено не для всех модулей' : 'Обновление установлено',
      listItems: lines,
      applyKey: 'update.dismiss',
      applyFallback: 'Понятно',
      onApply: hideBar,
    });
  }

  function verifyAndShowCurrentRelease(options) {
    if (finalVerificationPromise) return finalVerificationPromise;
    var expected = bootPendingRelease && bootPendingRelease.expected;
    finalVerificationPromise = verifyCurrentRelease(expected).then(function (result) {
      clearPendingRelease();
      if (options && options.suppressNextPartial) suppressNextApplyPartial = true;
      showVerifiedRelease(result);
      return result;
    }).then(function (result) {
      finalVerificationPromise = null;
      return result;
    }, function (err) {
      finalVerificationPromise = null;
      throw err;
    });
    return finalVerificationPromise;
  }

  function errorDetails(err) {
    return {
      name: err && err.name ? String(err.name) : 'Error',
      message: err && err.message ? String(err.message) : String(err || 'Unknown error'),
    };
  }

  function scopeFailure(module, scope, phase, err) {
    return { module: module, scope: scope, phase: phase, error: errorDetails(err) };
  }

  /* «Все модули» означает весь реестр, а не только модули, которые
     пользователь уже когда-то открывал. Регистрация из хаба разрешена,
     потому что scope каждого worker лежит внутри каталога его script URL. */
  function versionedWorkerUrl(url, releaseVersion) {
    var parsed = new URL(url, (doc && doc.baseURI) || global.location.href);
    if (releaseVersion) parsed.searchParams.set('cw-release', releaseVersion);
    return parsed.href;
  }

  /* Imported scripts are part of the service-worker update graph in the
     specification, but Chromium can legitimately reuse an unchanged top-level
     worker while several registrations are checked together. Read the tiny
     deployment manifest first and put its version in every top-level worker
     URL. A release then changes the script URL deterministically and every
     scope gets an independent install cycle. */
  function deployedReleaseVersion() {
    if (typeof global.fetch !== 'function') return Promise.resolve(global.CW_VERSION || null);
    var base = new URL('./', (doc && doc.baseURI) || global.location.href);
    var manifestUrl = new URL('shared/release-manifest.js', base);
    /* The active Hub worker is cache-first. A unique probe URL is therefore
       required in addition to Request.cache=no-store; otherwise the old SW
       may answer with its cached manifest before the network is consulted. */
    manifestUrl.searchParams.set('cw-probe', String(Date.now()));
    return global.fetch(manifestUrl.href, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('release manifest HTTP ' + response.status);
        return response.text();
      })
      .then(function (source) {
        var match = source.match(/\bversion\s*:\s*['\"]([^'\"]+)['\"]/);
        return match && match[1] ? match[1] : (global.CW_VERSION || null);
      }, function () { return global.CW_VERSION || null; });
  }

  function ensureRegistrations(releaseVersion) {
    if (uiMode !== 'hub') return Promise.resolve([]);
    var modules = global.CW_MODULES || {};
    var base = new URL('./', (doc && doc.baseURI) || global.location.href);
    return Promise.all(Object.keys(modules).map(function (id) {
      var worker = modules[id] && modules[id].worker;
      if (!worker) return Promise.resolve(null);
      var script = versionedWorkerUrl(new URL(worker, base).href, releaseVersion);
      var scope = new URL(id + '/', base).href;
      return nav.serviceWorker.register(script, { scope: scope, updateViaCache: 'none' }).then(
        function () { return null; },
        function (err) { return scopeFailure(id, scope, 'register', err); }
      );
    })).then(function (results) { return results.filter(Boolean); });
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
      if (uiMode === 'hub') bootPendingRelease = readPendingRelease();

      nav.serviceWorker.addEventListener('controllerchange', function () {
        /* Первая установка: контроллера не было, перезагружать нечего. */
        if (!hadController || reloading) return;
        reloading = true;
        global.location.reload();
      });

      /* Регистрируем после load: до него страница ещё борется за сеть
         с ассетами первой отрисовки. */
      var start = function () {
        return nav.serviceWorker.register(versionedWorkerUrl(swUrl, global.CW_VERSION), { updateViaCache: 'none' })
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
     * точному whitelist регистраций (хаб + шесть модулей), для каждой форсирует
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
     * @returns {Promise<{ready: Array<{scope:string,reg:Object}>, failed: Array<{module:(string|null),scope:string,phase:string,error:{name:string,message:string}}>} >}
     *   ready  — hasWaiting: у регистрации к концу цикла есть reg.waiting;
     *   failed — updateFailed: сам reg.update() отклонился (реальная
     *            сетевая/иная ошибка на этот scope). noUpdate нигде не
     *            накапливается отдельно — это отсутствие записи в обоих
     *            списках.
     */
    checkAll: function () {
      if (unsupported()) return Promise.resolve({ ready: [], failed: [] });
      var checkedReleaseVersion = global.CW_VERSION || null;

      return deployedReleaseVersion().then(function (releaseVersion) {
        checkedReleaseVersion = releaseVersion || checkedReleaseVersion;
        return ensureRegistrations(releaseVersion);
      }).then(function (registrationFailures) {
        return nav.serviceWorker.getRegistrations().then(function (regs) {
          regs = regs.filter(function (reg) { return !!moduleIdForScope(reg.scope); });
          if (!regs.length) return { ready: [], failed: registrationFailures };

          return Promise.all(regs.map(function (reg) {
            var module = moduleIdForScope(reg.scope);
            /* Подписка на исход СНАЧАЛА, update() запускается следом —
               иначе updatefound мог бы сработать до того, как мы начали
               слушать. */
            var outcome = waitForOutcome(reg);
            return reg.update().then(
              function () { return { reg: reg, module: module, updateError: null }; },
              function (err) { return { reg: reg, module: module, updateError: err }; }
            ).then(function (r) {
            /* updateError уже известен независимо от outcome — но если
               update() сам отклонился, waiting всё равно может однажды
               появиться (installed от прошлой фоновой проверки браузера).
               Ждём outcome в любом случае, updateError решает КАТЕГОРИЮ
               результата ниже, не отменяет сам факт reg.waiting. */
              return outcome.then(function (hasWaiting) {
                r.hasWaiting = hasWaiting;
                return r;
              });
            });
          })).then(function (results) {
            var ready = [];
            var activatedDuringCheck = [];
            var failed = registrationFailures.slice();
            results.forEach(function (r) {
              if (r.reg.waiting) { ready.push({ scope: r.reg.scope, reg: r.reg }); return; }
            /* Регистрация без waiting: updateError → реальная ошибка на
               этот scope (failed); иначе — noUpdate, не попадает никуда. */
              if (r.updateError) failed.push(scopeFailure(r.module, r.reg.scope, 'update', r.updateError));
              else if (r.module && r.module !== 'hub') activatedDuringCheck.push(r);
            });
            /* A module scope with no open client can skip the waiting phase and
               activate immediately. That is a successful update, not
               `noUpdate`. Confirm it by handshake and keep it in the same
               ready/apply transaction so changelog and final verification are
               complete. */
            return Promise.all(activatedDuringCheck.map(function (r) {
              return readWorkerVersion(r.reg.active).then(function (info) {
                if (info && info.module === r.module && info.hub === checkedReleaseVersion &&
                    checkedReleaseVersion !== global.CW_VERSION) {
                  ready.push({ scope: r.reg.scope, reg: r.reg, info: info, alreadyActive: true });
                }
              });
            })).then(function () { return Promise.all(ready.map(function (item) {
              if (item.info) return item;
              return readWorkerVersion(item.reg.waiting).then(function (info) {
                item.info = info;
                return item;
              });
            })); }).then(function () {
              var hub = ready.find(function (item) { return moduleIdForScope(item.scope) === 'hub'; });
              return { ready: ready, failed: failed, release: hub && hub.info && hub.info.release || null };
            });
          });
        }, function (err) {
          /* getRegistrations() сам отклонился — это не про сеть отдельного
             scope, а про API целиком; единственный разумный сигнал —
             «ничего не проверено». */
          return { ready: [], failed: registrationFailures.concat([{
            module: null, scope: '*', phase: 'enumerate', error: errorDetails(err),
          }]) };
        });
      }).then(function (result) {
        if (result.failed.length && global.console && global.console.warn) {
          global.console.warn('CWUpdate: не удалось проверить часть service workers', result.failed);
        }
        return result;
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
      /* Defense in depth: readyList обычно приходит из checkAll(), но API
         публичный. Повторная точная проверка не позволяет вызывающему коду
         случайно применить update чужого проекта на том же origin. */
      var list = (readyList || []).filter(function (item) {
        return item && !!moduleIdForScope(item.scope) && item.reg &&
          moduleIdForScope(item.reg.scope) === moduleIdForScope(item.scope);
      });
      /* index.html пишет marker до applyAll(); дополняем его точными
         module/scope/version/hub targets ДО первого SKIP_WAITING, чтобы
         reload не успел оборвать запись ожидаемого поколения. */
      persistPendingTargets(list);
      list.forEach(function (item) {
        if (!item.reg || !item.reg.waiting) return;
        try { item.reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }
        catch (e) { /* воркер уже активируется */ }
      });
      return Promise.all(list.map(function (item) {
        if (!item.reg) return Promise.resolve({ status: 'activated', info: null });
        var target = targetFromReady(item);
        return waitForActivation(item.reg).then(function (status) {
          if (status !== 'activated') return { status: status, info: null };
          /* reg.waiting исчез — но reg.active может ещё на короткое время
             указывать на прежний worker. Не делаем одноразовый snapshot:
             ждём именно target, полученный от waiting-worker ДО apply. */
          return waitForExpectedActive(item.reg, target, VERIFY_TIMEOUT_MS);
        });
      })).then(function (statuses) {
        var results = list.map(function (item, i) {
          return { scope: item.scope, status: statuses[i].status, info: statuses[i].info };
        });
        var allActivated = statuses.every(function (s) { return s.status === 'activated'; });
        var outcome = { results: results, allActivated: allActivated };

        /* Если Hub сам не был waiting, controllerchange/reload не случится.
           Раньше cwPendingRelease оставался до случайного будущего reload.
           Здесь завершаем тот же post-update flow на месте, но всё равно
           через фактическую проверку active workers. */
        var hubWasApplied = list.some(function (item) {
          return moduleIdForScope(item.scope) === 'hub';
        });
        var pending = readPendingRelease();
        if (!hubWasApplied && pending && pending.version === global.CW_VERSION) {
          var shouldSuppress = !allActivated || !!(pending.failed && pending.failed.length);
          return verifyAndShowCurrentRelease({ suppressNextPartial: shouldSuppress }).then(function () {
            return outcome;
          });
        }
        return outcome;
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
      if (uiMode === 'hub' && key === 'update.partial') {
        if (suppressNextApplyPartial) {
          suppressNextApplyPartial = false;
          return;
        }
        var pending = readPendingRelease();
        if (pending) {
          /* Если marker относится к следующему Hub-поколению, старая страница
             уже не имеет права объявлять failure: controllerchange/reload
             перенесёт решение на новую страницу. Если Hub уже текущий —
             финализируем здесь реальной проверкой active workers. */
          if (pending.version === global.CW_VERSION) verifyAndShowCurrentRelease();
          return;
        }
      }
      showBar({ textKey: key, textFallback: fallback, autoHide: autoHide || 4000 });
    },

    /** Показать баннер хаба со списком модулей и одной кнопкой действия.
        Только для ui:'hub'. По умолчанию — предложение обновиться
        («Доступно обновление» + «Обновить всё»); post-update использует тот
        же баннер с другим текстом и кнопкой-подтверждением через opts. */
    offerHubBanner: function (opts) {
      if (uiMode !== 'hub') return;
      /* index.html post-update ветка уже прочитала marker и может даже
         удалить его до этого вызова. Не доверяем сохранённому старой
         страницей success/failed: перед финальным баннером заново читаем
         реальные active workers и их версии/Hub-generation. */
      if (opts && opts.applyKey === 'update.dismiss' && opts.onApply &&
          (opts.textKey === 'update.installed_multi' || opts.textKey === 'update.partial')) {
        verifyAndShowCurrentRelease();
        return;
      }
      showBar({
        textKey: opts.textKey || 'update.available_multi',
        textFallback: opts.textFallback || 'Доступно обновление Circuit Workspace',
        listItems: opts.listItems,
        onApply: opts.onApply,
        applyKey: opts.applyKey || 'update.apply_all',
        applyFallback: opts.applyFallback || 'Обновить всё',
      });
    },

    /** Проверка фактически активного поколения всех Circuit Workspace SW.
        Публична прежде всего для gate/live regression; UI вызывает её через
        post-update финализатор выше. */
    verifyCurrent: verifyCurrentRelease,

    /**
     * true, пока идёт финальная post-update верификация (verifyAndShowCurrentRelease).
     * ЗАЧЕМ. `watch()` слушает СОБСТВЕННУЮ SW-регистрацию хаба независимо от
     * ручного check/apply-цикла и через событие `cw-update-available` может
     * запустить ПОЛНЫЙ параллельный runCheck() ровно в момент, когда страница
     * (после reload или в конце applyAll()) ещё проверяет, что реально
     * активировалось. Два независимых showBar() почти одновременно — и есть
     * тот самый «сначала partial, потом сразу installed»: не гонка внутри
     * самой верификации (она уже последовательна и подтверждена gate-тестами
     * выше), а гонка МЕЖДУ верификацией и посторонним авто-check. Hub-код
     * обязан пропускать авто-триггер, пока isBusy() === true.
     */
    isBusy: function () { return !!finalVerificationPromise; },
  };

  global.CWUpdate = CWUpdate;
})(typeof self !== 'undefined' ? self : this);
