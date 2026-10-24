/* Circuit Workspace — hub.js
   Сценарий главной страницы хаба. Вынесен из inline <script> index.html ради
   Content-Security-Policy (CSP, 24.10.2026): политика страниц разрешает
   скрипты только из файлов (script-src 'self'). Подключается обычным
   (не модульным, не defer) тегом там же, где стоял inline-блок: порядок
   исполнения и глобальные имена прежние. */
// Версия хаба — единственный источник: shared/version.js. Никогда не хардкодим
// номер версии в разметке, чтобы он не мог "отстать" при очередном обновлении.
document.getElementById('hubVersion').textContent = 'v' + self.CW_VERSION;

// Версии модулей — тоже из shared/version.js (self.CW_MODULES), а не из
// разметки: раньше номер на плитке приходилось править вручную, и он отставал
// от реальной версии модуля. Если версии в реестре нет — элемент остаётся
// пустым, а не показывает неверный номер.
// Важно: номер лежит в ОТДЕЛЬНОМ <span>, а не в тексте всего бейджа —
// иначе смена языка затирала бы версию, а простановка версии затирала бы
// перевод статуса.
Object.keys(self.CW_MODULES || {}).forEach(function (key) {
  var tile = document.querySelector('[data-module="' + key + '"]');
  if (!tile) return;
  var slot = tile.querySelector('[data-module-version]');
  var version = self.CW_MODULES[key].version;
  // Разделитель «·» убран: слово «работает» на плитке скрыто (вариант C).
  if (slot && version) slot.textContent = 'v' + version;
});


/* ── Экран «Настройки» (#settings) ─────────────────────────────────────
   Один класс на <body>: главная скрывает рабочий ярус, настройки
   показываются. Адреса #settings, #senderCard, #backupCard и другие id
   внутри экрана открывают его сразу (модули ссылаются на эти якоря). */
(function () {
  var view = document.getElementById('hubSettings');
  if (!view) return;
  var chips = [].slice.call(document.querySelectorAll('[data-settings-jump]'));
  var lockUntil = 0;
  function markChip(id) {
    chips.forEach(function (c) {
      var on = c.getAttribute('data-settings-jump') === id;
      c.classList.toggle('is-active', on);
      if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
    });
  }
  function target() {
    var id = (location.hash || '').slice(1);
    if (!id) return null;
    if (id === 'settings') return { open: true, el: null };
    var el = document.getElementById(id);
    return el && view.contains(el) ? { open: true, el: el } : null;
  }
  function sync(initial) {
    var t = target();
    var was = document.body.classList.contains('cw-view-settings');
    document.body.classList.toggle('cw-view-settings', !!t);
    if (t && !was) {
      if (t.el) t.el.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
    } else if (t && t.el) {
      t.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (!t && was && !initial) {
      window.scrollTo(0, 0);
    }
  }
  chips.forEach(function (c) {
    c.addEventListener('click', function (e) {
      e.preventDefault();
      var el = document.getElementById(c.getAttribute('data-settings-jump'));
      if (!el) return;
      lockUntil = Date.now() + 1500;
      markChip(el.id);
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });
  var groups = chips.map(function (c) { return document.getElementById(c.getAttribute('data-settings-jump')); }).filter(Boolean);
  if (groups.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (Date.now() < lockUntil) return;
      var vis = entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (vis[0]) markChip(vis[0].target.id);
    }, { rootMargin: '-30% 0px -60% 0px' });
    groups.forEach(function (g) { io.observe(g); });
  }
  var back = document.getElementById('hubSettingsBack');
  if (back) back.addEventListener('click', function (e) {
    e.preventDefault();
    history.pushState(null, '', location.pathname + location.search);
    sync();
  });
  window.addEventListener('hashchange', function () { sync(); });
  window.addEventListener('popstate', function () { sync(); });
  markChip('hubSetProfile');
  sync(true);
})();

/* HUB-ORDER:BEGIN --------------------------------------------------------
   Пользовательский порядок плиток. Две НЕЗАВИСИМЫЕ зоны:
     work   — #moduleGrid (рабочие модули, id = data-module);
     (зона «system» снята 23.10.2026 — карточки на экране «Настройки»).
   Источник правды о принадлежности к зоне — только разметка index.html
   (тот же, что проверяет check-hub-tiles.mjs против CW_MODULES). Канон
   зоны снимается с DOM ДО применения сохранённого порядка. Сохранённое
   значение — только последовательность id внутри зоны: нормализация
   выбрасывает чужие/неизвестные/повторные id и дописывает новые в конец
   в каноническом порядке, поэтому повреждённая запись не может ни
   перенести элемент в другую зону, ни создать дубль.
   Хранение — localStorage['cw-hub-order'], как 'cw-theme': UI-настройка
   устройства, в резервную копию не входит. */
(function () {
  var KEY = 'cw-hub-order';
  var zones = {
    work: { grid: document.getElementById('moduleGrid'), idOf: function (el) { return el.getAttribute('data-module'); } }
  };
  /* Зона «system» снята 23.10.2026: системные карточки переехали на экран
     «Настройки» и больше не переставляются. Прежний ключ `system` в записи
     порядка игнорируется и при первой записи исчезает. */
  var ZONE_NAMES = ['work'];

  function itemsOf(z) {
    if (!z.grid) return [];
    return [].slice.call(z.grid.children).filter(function (el) {
      return !!z.idOf(el);
    });
  }
  function byId(z) {
    var map = {};
    itemsOf(z).forEach(function (el) { map[z.idOf(el)] = el; });
    return map;
  }

  ZONE_NAMES.forEach(function (name) {
    var z = zones[name];
    z.canonical = itemsOf(z).map(z.idOf);
  });

  function normalize(saved, canonical) {
    var out = [], seen = {};
    (Array.isArray(saved) ? saved : []).forEach(function (id) {
      if (typeof id === 'string' && canonical.indexOf(id) !== -1 && !seen[id]) {
        seen[id] = true; out.push(id);
      }
    });
    canonical.forEach(function (id) { if (!seen[id]) { seen[id] = true; out.push(id); } });
    return out;
  }

  function read() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    return (raw && typeof raw === 'object') ? raw : {};
  }
  function current(name) { return normalize(read()[name], zones[name].canonical); }

  function write(name, order) {
    var data = {};
    ZONE_NAMES.forEach(function (n) {
      // Каждая зона нормализуется по СВОЕМУ канону — в запись не может
      // попасть id чужой зоны, даже если вызвавший код ошибся.
      data[n] = normalize(n === name ? order : read()[n], zones[n].canonical);
    });
    data.v = 1;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* приватный режим */ }
  }

  function apply(name) {
    var z = zones[name];
    if (!z.grid) return;
    var map = byId(z);
    current(name).forEach(function (id) { if (map[id]) z.grid.appendChild(map[id]); });
    if (window.CWHubBoard) window.CWHubBoard.refresh();
  }

  // Перемещение — только внутри зоны: id ищется в каноне ИМЕННО этой зоны,
  // чужой id отклоняется до записи.
  function move(name, id, toIndex) {
    var z = zones[name];
    if (!z || z.canonical.indexOf(id) === -1) return false;
    var order = current(name);
    var from = order.indexOf(id);
    toIndex = Math.max(0, Math.min(order.length - 1, toIndex));
    if (from === toIndex) return false;
    order.splice(from, 1);
    order.splice(toIndex, 0, id);
    write(name, order);
    apply(name);
    syncControls();
    return true;
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* no-op */ }
    ZONE_NAMES.forEach(apply);
    syncControls();
  }

  function zoneOfEl(el) {
    for (var i = 0; i < ZONE_NAMES.length; i++) {
      var z = zones[ZONE_NAMES[i]];
      if (z.grid && el.parentNode === z.grid && z.idOf(el)) return ZONE_NAMES[i];
    }
    return null;
  }

  ZONE_NAMES.forEach(apply);

  // --- Режим настройки ------------------------------------------------
  var board = document.querySelector('.cw-board');
  var toggle = document.getElementById('orderToggle');
  var toggleLabel = document.getElementById('orderToggleLabel');
  var resetBtn = document.getElementById('orderReset');
  var hint = document.getElementById('orderHint');
  var editing = false;

  var ICON_HANDLE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  var ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  function button(cls, icon, key) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.innerHTML = icon;
    b.setAttribute('data-i18n-aria-label', key);
    b.setAttribute('data-i18n-title', key);
    return b;
  }

  function addControls(name) {
    itemsOf(zones[name]).forEach(function (el) {
      el.classList.add('cw-order-item');
      var ctl = document.createElement('div');
      ctl.className = 'cw-order-ctl';
      ctl.appendChild(button('cw-order-prev', ICON_PREV, 'hub.order_prev'));
      ctl.appendChild(button('cw-order-handle', ICON_HANDLE, 'hub.order_drag'));
      ctl.appendChild(button('cw-order-next', ICON_NEXT, 'hub.order_next'));
      el.appendChild(ctl);
      if (window.CWI18n) CWI18n.apply(ctl);
      if (el.tagName === 'A') {
        el.setAttribute('data-order-tabindex', el.getAttribute('tabindex') || '');
        el.setAttribute('tabindex', '-1');
      }
    });
  }
  function removeControls(name) {
    itemsOf(zones[name]).forEach(function (el) {
      el.classList.remove('cw-order-item', 'is-dragging');
      var ctl = el.querySelector(':scope > .cw-order-ctl');
      if (ctl) el.removeChild(ctl);
      if (el.hasAttribute('data-order-tabindex')) {
        var t = el.getAttribute('data-order-tabindex');
        if (t) el.setAttribute('tabindex', t); else el.removeAttribute('tabindex');
        el.removeAttribute('data-order-tabindex');
      }
    });
  }
  function syncControls() {
    if (!editing) return;
    ZONE_NAMES.forEach(function (name) {
      var list = itemsOf(zones[name]);
      list.forEach(function (el, i) {
        var p = el.querySelector(':scope > .cw-order-ctl .cw-order-prev');
        var n = el.querySelector(':scope > .cw-order-ctl .cw-order-next');
        if (p) p.disabled = i === 0;
        if (n) n.disabled = i === list.length - 1;
      });
    });
  }

  function setEditing(on) {
    if (on === editing) return;
    editing = on;
    board.classList.toggle('cw-ordering', on);
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggleLabel.setAttribute('data-i18n', on ? 'hub.order_done' : 'hub.order_edit');
    if (window.CWI18n) CWI18n.apply(toggle);
    resetBtn.hidden = !on;
    hint.hidden = !on;
    ZONE_NAMES.forEach(on ? addControls : removeControls);
    syncControls();
  }

  if (toggle) toggle.addEventListener('click', function () { setEditing(!editing); });
  if (resetBtn) resetBtn.addEventListener('click', reset);

  // В режиме настройки ссылка плитки модуль не открывает.
  board.addEventListener('click', function (e) {
    if (!editing) return;
    var link = e.target.closest && e.target.closest('.cw-order-item');
    if (link && link.tagName === 'A') e.preventDefault();
  }, true);

  // Стрелки — клавиатурный и простой сенсорный путь.
  board.addEventListener('click', function (e) {
    if (!editing || !e.target.closest) return;
    var b = e.target.closest('.cw-order-prev, .cw-order-next');
    if (!b) return;
    var item = b.closest('.cw-order-item');
    var name = item && zoneOfEl(item);
    if (!name) return;
    var id = zones[name].idOf(item);
    var idx = current(name).indexOf(id);
    if (move(name, id, idx + (b.classList.contains('cw-order-prev') ? -1 : 1))) {
      var again = item.querySelector(':scope > .cw-order-ctl ' + (b.classList.contains('cw-order-prev') ? '.cw-order-prev' : '.cw-order-next'));
      (again && !again.disabled ? again : item.querySelector(':scope > .cw-order-ctl .cw-order-handle')).focus();
    }
  });

  // Перетаскивание за ручку (pointer: мышь, палец, перо). Цель ищется
  // ТОЛЬКО среди элементов зоны перетаскиваемой плитки: над чужой зоной
  // целей нет, перемещения не происходит, запись не меняется.
  var drag = null;
  board.addEventListener('pointerdown', function (e) {
    if (!editing || !e.target.closest) return;
    var handle = e.target.closest('.cw-order-handle');
    if (!handle || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var item = handle.closest('.cw-order-item');
    var name = item && zoneOfEl(item);
    if (!name) return;
    e.preventDefault();
    drag = { name: name, id: zones[name].idOf(item), item: item, handle: handle, pointer: e.pointerId };
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* no-op */ }
    item.classList.add('is-dragging');
    document.body.classList.add('cw-order-dragging');
  });
  board.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.pointer) return;
    var z = zones[drag.name];
    var target = hitTest(z, e.clientX, e.clientY);
    if (!target || target === drag.item) return;
    var order = current(drag.name);
    move(drag.name, drag.id, order.indexOf(z.idOf(target)));
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pointer)) return;
    drag.item.classList.remove('is-dragging');
    document.body.classList.remove('cw-order-dragging');
    drag = null;
  }
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);

  function hitTest(z, x, y) {
    var g = z.grid.getBoundingClientRect();
    if (x < g.left || x > g.right || y < g.top || y > g.bottom) return null;
    var list = itemsOf(z);
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return list[i];
    }
    return null;
  }

  window.CWHubOrder = {
    KEY: KEY,
    normalize: normalize,
    canonical: function (name) { return zones[name] ? zones[name].canonical.slice() : []; },
    current: current,
    move: move,
    reset: reset,
    zoneOf: zoneOfEl,
    hitTest: function (name, x, y) { return zones[name] ? hitTest(zones[name], x, y) : null; },
    setEditing: setEditing,
    isEditing: function () { return editing; }
  };
})();
/* HUB-ORDER:END */

// --- Плата: число колонок и мета-строка --------------------------------
// Скрипт задаёт только число колонок для широкого экрана (от числа плиток);
// ступени по ширине окна остаются в CSS в одном экземпляре. Декоративная
// шина (рёбра) снята 28.09.2026, вариант C.
(function () {
  var board = document.querySelector('.cw-board');
  var work = document.getElementById('moduleGrid');
  if (!board) return;

  function items(grid) {
    return [].slice.call(grid.children);
  }

  // Компактные плитки (вариант C): до шести модулей — все в один ряд.
  // Больше шести — шесть колонок, но ряда из одной плитки не бывает:
  // 7 → 5+2, 13 → 5+5+3.
  function wideCols(n) {
    if (n <= 6) return Math.max(n, 1);
    var cols = 6;
    while (cols > 3 && n % cols === 1) cols--;
    return cols;
  }

  // Строка мобильной шапки «6 модулей · v0.41.84». Склонение — тем же
  // приёмом, что у дней в резервной копии: Intl.PluralRules → ключ
  // unit.modules.<категория>, запасной — .other.
  var meta = document.getElementById('hubMeta');
  var metaCount = 0;
  function renderMeta(n) {
    if (typeof n === 'number') metaCount = n;
    if (!meta || !window.CWI18n) return;
    var category = 'other';
    try { category = new Intl.PluralRules(CWI18n.getLang()).select(metaCount); } catch (e) { /* старый браузер */ }
    var word = CWI18n.t('unit.modules.' + category);
    if (word === 'unit.modules.' + category) word = CWI18n.t('unit.modules.other');
    meta.textContent = metaCount + ' ' + word + ' · v' + (self.CW_VERSION || '');
  }
  if (window.CWI18n) CWI18n.onChange(function () { renderMeta(); });

  function refresh() {
    if (work) {
      var n = items(work).length;
      board.style.setProperty('--cw-cols-wide', wideCols(n));
      var counter = document.querySelector('[data-tier-count]');
      if (counter) counter.textContent = '· ' + n;
      renderMeta(n);
    }
  }

  refresh();
  window.CWHubBoard = { refresh: refresh };
})();

// --- Язык интерфейса ------------------------------------------------
// Хаб задаёт язык по умолчанию для всей экосистемы: CWI18n.setLang здесь
// пишет общий ключ 'cw-lang', модули подхватывают его сами.
// Своего языка у модулей больше нет (решение Алекса 23.10.2026, фаза 3):
// ключи 'cw-lang:<module>' не читаются, язык всегда отсюда.
(function () {
  /* Тема и язык есть в двух местах: быстрые переключатели в шапке и поля
     на экране «Настройки». Оба — один и тот же общий ключ, синхронизация
     через CWTheme / CWI18n.onChange. */
  ['hubTheme', 'settingsTheme'].forEach(function (id) {
    var el = document.getElementById(id);
    if (window.CWTheme && el) window.CWTheme.mountSelect(el);
  });
  var scaleEl = document.getElementById('settingsFontScale');
  if (window.CWTheme && window.CWTheme.mountScaleSelect && scaleEl) window.CWTheme.mountScaleSelect(scaleEl);
  var selects = ['hubLanguage', 'settingsLanguage'].map(function (id) { return document.getElementById(id); }).filter(Boolean);

  // Опции строим из реестра языков, а не из разметки: добавление языка =
  // одна строка в shared/i18n.js + переводы, без правки HTML.
  // Только включённые языки интерфейса (флаг `ui` в реестре).
  selects.forEach(function (select) {
    CWI18n.UI_LANGS.forEach(function (lang) {
      var option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.label;
      select.appendChild(option);
    });
  });

  var active = CWI18n.init();   // без module → это хаб
  selects.forEach(function (select) {
    select.value = active;
    select.addEventListener('change', function (e) {
      CWI18n.setLang(e.target.value);   // apply() внутри — перерисовка мгновенная
    });
  });

  // Смена языка в другой вкладке (событие storage) или в соседнем поле —
  // держим все селекты в курсе.
  CWI18n.onChange(function (lang) { selects.forEach(function (select) { select.value = lang; }); });
})();

// Общая БД теперь подключена статическим script-тегом в head (см. комментарий
// там) — гарантированно загружена и выполнена к этому месту документа.
// Явный CWDB.init() здесь не нужен: makeCrud()/openDb() открывают
// соединение лениво при первом реальном обращении (CWState изнутри
// CWSender.ready() ниже), тем же путём, что и на остальных пяти оболочках,
// ни одна из которых не вызывает CWDB.init() проактивно.

// Возврат из модуля должен ощущаться как «назад», а не как открытие хаба
// заново. Хаб — обычная страница (плитки это <a href>), поэтому состояние
// между переходами не живёт само: запоминаем позицию прокрутки перед уходом
// и восстанавливаем при следующем открытии. Работает одинаково при любом
// способе возврата — кнопкой из модуля, браузерным «назад», из закладки.
(function () {
  var KEY = 'cw-hub-scroll';

  // Отключаем штатное восстановление: иначе браузер и скрипт будут
  // прокручивать страницу наперегонки, и итог зависит от того, кто успел.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  try {
    var saved = parseInt(sessionStorage.getItem(KEY) || '', 10);
    if (saved > 0) window.scrollTo(0, saved);
  } catch (e) { /* приватный режим — просто без восстановления */ }

  function remember() {
    try { sessionStorage.setItem(KEY, String(window.scrollY)); } catch (e) {}
  }

  // pagehide покрывает переход по ссылке, закрытие и уход в bfcache;
  // visibilitychange добавляет iOS, где pagehide срабатывает не всегда.
  window.addEventListener('pagehide', remember);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') remember();
  });
})();

// --- Резервное копирование -------------------------------------------
// Хаб читает хранилища модулей напрямую (один origin), поэтому полная копия
// всегда собирается свежей и не может состоять из кусков разного возраста.
(function () {
  var rows = document.getElementById('backupRows');
  var status = document.getElementById('backupStatus');
  var fileInput = document.getElementById('backupFile');
  if (!rows || typeof CWBackup === 'undefined') return;

  function say(key, vars) { status.textContent = CWI18n.t(key, vars); }

  function fmt(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    return isNaN(d) ? null : d.toLocaleString(CWI18n.getLang(), {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  var card = document.getElementById('backupCard');
  var ageSlot = document.getElementById('backupAge');

  // Возраст считается от ПОЛНОЙ копии (scope: 'full'), а не от последней
  // копии любого модуля: копия одного модуля не должна гасить предупреждение,
  // пока данные остальных не сохранены. Журнал уже различает эти случаи —
  // note() пишет scope, отдельного хранилища заводить не нужно.
  function lastFullAt(log) {
    return Object.keys(log).reduce(function (best, id) {
      var entry = log[id];
      if (!entry || entry.scope !== 'full' || !entry.at) return best;
      return (!best || entry.at > best) ? entry.at : best;
    }, null);
  }

  // Аудит 03, P1-3: где браузер умеет отправлять файл, копией считается
  // только ОТПРАВЛЕННАЯ полная копия — скачанная остаётся на том же
  // устройстве. offsiteAt ставит лишь noteShared() полной копии. Где
  // отправки нет (часть настольных браузеров), считается скачанная — иначе
  // предупреждение там горело бы вечно без способа его погасить.
  var SHARE = CWBackup.canShareFiles();
  function lastOffsiteAt(log) {
    return Object.keys(log).reduce(function (best, id) {
      var at = log[id] && log[id].offsiteAt;
      if (!at) return best;
      return (!best || at > best) ? at : best;
    }, null);
  }

  // Склонение числа дней отдаём Intl.PluralRules: он знает категории всех
  // пяти языков, а словарь хранит только сами формы. Иначе пришлось бы
  // держать в словаре по три-четыре готовые фразы на язык и помнить о
  // правилах ru/uk/pl при каждой правке.
  function days(n) {
    var category = 'other';
    try { category = new Intl.PluralRules(CWI18n.getLang()).select(n); } catch (e) { /* старый браузер */ }
    var word = CWI18n.t('unit.days.' + category);
    if (word === 'unit.days.' + category) word = CWI18n.t('unit.days.other');
    return n + ' ' + word;
  }

  var LEVELS = ['cw-syscard--ok', 'cw-syscard--warn', 'cw-syscard--alert'];

  function renderState() {
    if (!card || !ageSlot) return;
    var log = CWBackup.log();
    var at = SHARE ? lastOffsiteAt(log) : lastFullAt(log);
    var k = SHARE ? 'backup.offsite_' : 'backup.age_';
    var level, text;

    if (!at) {
      level = 'alert';
      text = CWI18n.t(k + 'never');
    } else {
      var age = Math.floor((Date.now() - new Date(at).getTime()) / 86400000);
      if (!(age >= 0)) age = 0;
      level = age > 30 ? 'alert' : (age > 10 ? 'warn' : 'ok');
      if (age === 0) text = CWI18n.t(k + 'today');
      else if (level === 'alert') text = CWI18n.t(k + 'stale', { age: days(age) });
      else text = CWI18n.t(k + 'last', { age: days(age) });
    }

    ageSlot.textContent = text;
    var nudge = document.getElementById('backupNudge');
    if (nudge) {
      nudge.hidden = level === 'ok';
      nudge.classList.toggle('is-warn', level === 'warn');
      document.getElementById('backupNudgeText').textContent = text;
    }
    LEVELS.forEach(function (cls) { card.classList.remove(cls); });
    card.classList.add('cw-syscard--' + level);
  }

  function renderRows() {
    var log = CWBackup.log();
    rows.innerHTML = Object.keys(CWBackup.MODULES).map(function (id) {
      var version = (self.CW_MODULES && self.CW_MODULES[id] || {}).version || '—';
      var at = fmt((log[id] || {}).at);
      var cell = at
        ? '<span>' + at + '</span>'
        : '<span class="cw-backup__never">' + CWEscape.html(CWI18n.t('backup.never')) + '</span>';
      return '<tr><td>' + CWEscape.html(CWI18n.t('module.' + id + '.title')) + '</td><td>v' + version + '</td><td>' + cell + '</td></tr>';
    }).join('');
  }

  document.getElementById('backupSaveAll').addEventListener('click', function () {
    say('backup.working');
    CWBackup.saveAll().then(function (snap) {
      renderRows();
      renderState();
      say('backup.saved', { count: snap.modules.length });
    }).catch(function (e) {
      console.error(e);
      say('backup.failed');
    });
  });

  // Отправка копии. Снимок собирается асинхронно, и к моменту share()
  // браузер (особенно Safari) может счесть жест пользователя истёкшим —
  // NotAllowedError. Тогда готовый файл остаётся в памяти, и следующее
  // нажатие отправляет его сразу, внутри жеста. Готовый файл живёт минуту,
  // чтобы не отправить устаревшие данные.
  var shareBtn = document.getElementById('backupShareAll');
  var shareLabel = shareBtn && shareBtn.querySelector('span');
  var pending = null;
  function setPending(p) {
    pending = p;
    if (shareLabel) {
      shareLabel.setAttribute('data-i18n', p ? 'backup.share_ready' : 'backup.share_all');
      shareLabel.textContent = CWI18n.t(p ? 'backup.share_ready' : 'backup.share_all');
    }
  }
  function runShare(prepared) {
    return CWBackup.shareFile(prepared.file).then(function (result) {
      setPending(null);
      if (result === 'shared') {
        CWBackup.noteShared(prepared.snap);
        renderRows();
        renderState();
        say('backup.shared', { count: prepared.snap.modules.length });
      } else {
        say('backup.share_cancelled');
      }
    });
  }
  // Отказ готового файла (13.10.2026). Готовый файл уходит в share() сразу,
  // внутри жеста, — значит, NotAllowedError на нём уже не «жест истёк», а
  // отказ самого браузера. Раньше это крутило ту же надпись по кругу
  // («ничего не происходит»). Теперь: отказ пишется в «Диагностику»,
  // кнопка отправки прячется до перезагрузки, главной снова становится
  // «Сохранить всё», и возраст копии считается по скачанной — иначе
  // предупреждение горело бы без способа его погасить.
  function disableShare(e) {
    setPending(null);
    SHARE = false;
    shareBtn.hidden = true;
    document.getElementById('backupSaveAll').classList.add('cw-btn--primary');
    if (typeof CWErrors !== 'undefined' && CWErrors.note) CWErrors.note(e, 'hub:backup.share');
    renderState();
    say('backup.share_unavailable');
  }
  if (shareBtn && SHARE) {
    shareBtn.hidden = false;
    document.getElementById('backupSaveAll').classList.remove('cw-btn--primary');
    shareBtn.addEventListener('click', function () {
      var ready = pending && (Date.now() - pending.t < 60000) ? pending : null;
      var flow = ready ? runShare(ready) : (function () {
        say('backup.working');
        return CWBackup.snapshot().then(function (snap) {
          var prepared = { snap: snap, file: CWBackup.makeFile(snap), t: Date.now() };
          setPending(prepared);
          return runShare(prepared);
        });
      })();
      flow.catch(function (e) {
        if (e && e.name === 'NotAllowedError' && pending) {
          if (ready) { disableShare(e); return; }
          say('backup.share_again');
          return;
        }
        setPending(null);
        console.error(e);
        if (typeof CWErrors !== 'undefined' && CWErrors.note) CWErrors.note(e, 'hub:backup.share');
        say('backup.failed');
      });
    });
  }

  document.getElementById('backupRestoreBtn').addEventListener('click', function () { fileInput.click(); });

  fileInput.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { say('backup.unreadable'); };
    reader.onload = function () {
      var check = CWBackup.inspect(reader.result);
      if (!check.ok) {
        // `too-new` — слишком новый формат файла, `schema-too-new` — слишком
        // новая схема общей базы внутри него. Для пользователя это один и тот
        // же случай и один и тот же ответ: сначала обновить приложение.
        // Оба отказа наступают до подтверждения и до первой записи, поэтому
        // обещание «данные не изменены» в тексте правдиво.
        var early = check.error === 'too-new' || check.error === 'schema-too-new';
        // J8: копия узнана, но защищённые данные Журнала или набор его
        // хранилищ не проходят проверку формы — «повреждена», а не «не копия».
        var damaged = /^journal-backup-/.test(check.error) || check.error === 'backup-incomplete-set';
        say(early ? 'backup.too_new' : damaged ? 'backup.damaged' : 'backup.not_a_backup');
        return;
      }
      var snap = check.snapshot;
      var when = fmt(snap.createdAt) || snap.createdAt;
      if (!confirm(CWI18n.t('backup.confirm_restore', { date: when, version: snap.app && snap.app.hub || '—' }))) return;

      // Перед заменой данных выгружаем текущее состояние: если файл окажется
      // не тем, откатиться будет нечем — модули уже перезаписаны.
      //
      // ФАЙЛА ОДНОГО МАЛО (исправлено 28.08.2026). `download()` кликает по
      // `<a download>`, и браузер вправе отказать молча: блокировка
      // автозагрузок, iOS Safari в режиме PWA, нет места, отменённый диалог.
      // Функция ничего не возвращает и не бросает — обещанный откат мог
      // просто не существовать. Поэтому тот же снимок кладётся в отдельную
      // базу приложения, которую полное восстановление не заменяет.
      say('backup.working');
      CWBackup.snapshot().then(function (before) {
        return CWBackup.guard.save(before).then(function (guardId) {
          CWBackup.download(before, 'circuit-workspace-before-restore-' + before.createdAt.slice(0, 10) + '.json');
          return CWBackup.restore(snap).then(function (r) { return { r: r, guardId: guardId }; });
        });
      }).then(function () {
        say('backup.restored');
        setTimeout(function () { location.reload(); }, 1200);
      }).catch(function (err) {
        console.error(err);
        // Потолок версии базы срабатывает и внутри восстановления — на
        // случай копии, прошедшей разбор (схема в норме), но содержащей
        // хранилище, неизвестное этой версии приложения.
        //
        // ЗДЕСЬ НАМЕРЕННО `backup.failed`, а не `backup.too_new`, хотя причина
        // та же. Текст `too_new` обещает «Данные не изменены», а к этому
        // моменту restore() уже переписал localStorage: он делает это до
        // заданий IndexedDB. Обещание стало бы ложью ровно в том сообщении,
        // которое человек читает в момент неудачного восстановления.
        // Порядок операций исправлен 28.08.2026: localStorage пишется только
        // после успешной записи всех баз, поэтому обещание «Данные не
        // изменены» для отказов ОТКРЫТИЯ теперь правдиво.
        //   `backup-newer-schema` — копия требует схемы новее нашей;
        //   `db-blocked`          — база занята другой вкладкой.
        // Оба наступают в фазе A, до первой записи.
        var msg = 'backup.failed';
        if (err && err.message === 'backup-newer-schema') msg = 'backup.too_new';
        if (err && err.message === 'db-blocked') msg = 'backup.blocked';
        say(msg);
        // Отказ — ровно тот момент, когда человеку важно знать, что снимок
        // предыдущего состояния сохранён и до него можно дотянуться. Кнопка
        // отката появляется при загрузке страницы, а перезагрузки после
        // неудачи не будет: показываем её здесь же (29.08.2026, N-2).
        if (CWBackup.guard) {
          CWBackup.guard.list().then(function (list) {
            if (!list.length) return;
            var btn = document.getElementById('backupGuardBtn');
            if (btn) btn.hidden = false;
            status.textContent += ' ' + CWI18n.t('backup.guard_saved');
          });
        }
      });
    };
    reader.readAsText(file);
  });

  // Откат к состоянию перед восстановлением. Снимок лежит в отдельной базе
  // приложения, которую полное восстановление не заменяет.
  //
  // ПОЧЕМУ КНОПКА ТЕПЕРЬ ОТКАТЫВАЕТ, А НЕ ВЫГРУЖАЕТ ФАЙЛ (29.08.2026,
  // находка N-2 повторного аудита). Раньше она отдавала снимок файлом, а
  // дальше работал обычный путь «Восстановить из файла»; отдельного пути
  // восстановления не было намеренно — второй такой путь пришлось бы
  // проверять и поддерживать наравне с первым.
  //
  // Возражение верное в общем виде, но здесь второго пути и не появляется:
  // CWBackup.restore(snap) — ТА ЖЕ функция, что вызывается после разбора
  // файла. Пропускается только круг через файловую систему, а не проверенный
  // код. А круг этот и есть слабое место: отдельная база `circuit-workspace-
  // guard` заведена ровно потому, что download() может отказать МОЛЧА —
  // блокировка автозагрузок, iOS Safari в режиме PWA, нет места, отменённый
  // диалог. Там, где он не работает, кнопка рапортовала «сохранено», файла
  // не было, а снимок лежал в IndexedDB недосягаемым.
  //
  // Подпись кнопки (`backup.guard_restore` — «Откатиться к состоянию перед
  // восстановлением») и текст `backup.guard_saved` («откат доступен кнопкой
  // ниже») уже обещали именно откат на всех пяти языках. Новых строк
  // перевода не понадобилось: код приведён к тому, что интерфейс и так
  // говорил пользователю.
  (function () {
    var guardBtn = document.getElementById('backupGuardBtn');
    if (!guardBtn || !CWBackup.guard) return;
    var newest = null;
    CWBackup.guard.list().then(function (list) {
      if (!list.length) return;
      newest = list[0];
      guardBtn.hidden = false;
    });
    guardBtn.addEventListener('click', function () {
      if (!newest) return;
      var when = fmt(String(newest.id).slice(8)) || String(newest.id).slice(8, 18);
      // Подтверждение то же, что у обычного восстановления: откат заменяет
      // данные ровно так же, и человек должен видеть одинаковый вопрос.
      if (!confirm(CWI18n.t('backup.confirm_restore', { date: when, version: CW_VERSION || '—' }))) return;
      say('backup.working');
      CWBackup.guard.get(newest.id).then(function (snap) {
        if (!snap) { say('backup.failed'); return; }
        // Файл всё равно отдаём: если откат почему-то не доедет, у человека
        // на руках останется то же состояние в виде файла.
        CWBackup.download(snap, 'circuit-workspace-before-restore-' + String(newest.id).slice(8, 18) + '.json');
        return CWBackup.restore(snap).then(function () {
          say('backup.restored');
          setTimeout(function () { location.reload(); }, 1200);
        });
      }).catch(function (err) {
        console.error(err);
        // Те же три исхода, что и у восстановления из файла: отказы
        // наступают в фазе A, до первой записи.
        var msg = 'backup.failed';
        if (err && err.message === 'backup-newer-schema') msg = 'backup.too_new';
        if (err && err.message === 'db-blocked') msg = 'backup.blocked';
        say(msg);
      });
    });
  })();

  // Постоянное хранилище: без него браузер вправе стереть IndexedDB и
  // localStorage при нехватке места. persist() вызывается один раз при
  // загрузке хаба (молчаливый запрос, диалога нет); результат показывается
  // текстом рядом с возрастом копии. API нет — строка остаётся скрытой.
  var persistSlot = document.getElementById('backupPersist');
  var persistState = null;
  function renderPersist() {
    if (!persistSlot || persistState === null) return;
    persistSlot.textContent = CWI18n.t(persistState ? 'backup.persist_on' : 'backup.persist_off');
    persistSlot.hidden = false;
  }
  (function () {
    var st = navigator.storage;
    if (!st || !st.persisted) return;
    st.persisted().then(function (ok) {
      return ok || !st.persist ? ok : st.persist();
    }).then(function (ok) {
      persistState = !!ok;
      renderPersist();
    }).catch(function () { /* без индикатора, поведение прежнее */ });
  })();

  renderRows();
  renderState();
  CWI18n.onChange(function () { renderRows(); renderState(); renderPersist(); });
})();

// --- Офлайн-готовность (аудит 03, P1-5) ------------------------------
// Каждый worker сверяет свой versioned cache со своим прекэшем
// (shared/offline-check.js). Онлайн недостающее докачивается сразу (решение
// Алекса, 07.10.2026); в режиме экономии трафика и без сети — только
// проверка, докачка по кнопке. Модули без регистрации (ни разу не
// открывались) регистрируются тем же versioned URL, что и при обновлении.
(function () {
  var card = document.getElementById('offlineCard');
  var stateSlot = document.getElementById('offlineState');
  var btn = document.getElementById('offlineRepairBtn');
  if (!card || !stateSlot || !btn || !('serviceWorker' in navigator) || typeof CWUpdate === 'undefined') return;
  card.hidden = false;

  var LEVELS = ['cw-syscard--ok', 'cw-syscard--warn', 'cw-syscard--alert'];
  var last = { key: 'offline.checking', vars: null, level: null };
  var running = false;

  function show(key, vars, level) {
    last = { key: key, vars: vars, level: level };
    stateSlot.textContent = CWI18n.t(key, vars);
    LEVELS.forEach(function (c) { card.classList.remove(c); });
    if (level) card.classList.add('cw-syscard--' + level);
  }
  function title(id) { return CWI18n.t(id === 'hub' ? 'offline.hub_name' : 'module.' + id + '.title'); }

  function ask(worker, repair) {
    return new Promise(function (resolve) {
      var ch = new MessageChannel();
      var timer = setTimeout(function () { resolve(null); }, repair ? 180000 : 15000);
      ch.port1.onmessage = function (e) { clearTimeout(timer); resolve(e.data || null); };
      try { worker.postMessage({ type: 'CW_OFFLINE', repair: !!repair }, [ch.port2]); }
      catch (e) { clearTimeout(timer); resolve(null); }
    });
  }
  function waitActive(reg, ms) {
    return new Promise(function (resolve) {
      var until = Date.now() + ms;
      (function poll() {
        if (reg.active || Date.now() >= until) { resolve(reg.active || null); return; }
        setTimeout(poll, 250);
      })();
    });
  }

  function run(forceRepair) {
    if (running) return;
    if (CWUpdate.isBusy && CWUpdate.isBusy()) { setTimeout(function () { run(forceRepair); }, 3000); return; }
    running = true;
    btn.hidden = true;
    var online = navigator.onLine !== false;
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    var repair = online && (forceRepair || !saveData);
    show('offline.checking', null, null);

    var base = new URL('./', document.baseURI).href;
    var ids = ['hub'].concat(Object.keys(self.CW_MODULES || {}));
    var done = 0;
    (repair ? CWUpdate.registerMissing().catch(function () { return []; }) : Promise.resolve([]))
      .then(function () { return navigator.serviceWorker.getRegistrations(); })
      .then(function (regs) {
        var byScope = {};
        regs.forEach(function (r) { byScope[r.scope] = r; });
        if (repair) show('offline.preparing', { done: 0, total: ids.length }, 'warn');
        return Promise.all(ids.map(function (id) {
          var reg = byScope[id === 'hub' ? base : base + id + '/'];
          var step = reg ? waitActive(reg, repair ? 120000 : 0).then(function (w) {
            return w ? ask(w, repair) : null;
          }) : Promise.resolve(null);
          return step.then(function (res) {
            done++;
            if (repair && done < ids.length) show('offline.preparing', { done: done, total: ids.length }, 'warn');
            return { id: id, ok: !!(res && !res.error && res.missing && res.missing.length === 0) };
          });
        }));
      })
      .then(function (results) {
        var bad = results.filter(function (r) { return !r.ok; }).map(function (r) { return title(r.id); });
        if (!bad.length) { show('offline.ready', null, 'ok'); return; }
        show(online ? 'offline.not_ready' : 'offline.not_ready_offline', { list: bad.join(', ') }, 'alert');
        btn.hidden = !online;
      })
      .catch(function (e) {
        console.error(e);
        show('offline.failed', null, 'alert');
        btn.hidden = !online;
      })
      .then(function () { running = false; });
  }

  btn.addEventListener('click', function () { run(true); });
  CWI18n.onChange(function () { show(last.key, last.vars, last.level); });
  show('offline.checking', null, null);
  // После load и паузы: первая отрисовка и проверка обновлений идут первыми.
  var start = function () { setTimeout(function () { run(false); }, 3000); };
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
  window.addEventListener('online', function () { run(false); });
})();

// --- Диагностика (аудит 03, P2-6) -------------------------------------
// Кольцо ошибок общее для хаба и модулей (shared/errors.js, localStorage), а
// модуль — отдельная страница: сюда ошибка попадает через общий ключ, поэтому
// состояние перечитывается при возврате на страницу и по событию storage.
(function () {
  var card = document.getElementById('errorsCard');
  var stateSlot = document.getElementById('errorsState');
  var copyBtn = document.getElementById('errorsCopyBtn');
  var clearBtn = document.getElementById('errorsClearBtn');
  if (!card || !stateSlot || !copyBtn || !clearBtn || typeof CWErrors === 'undefined') return;

  var LEVELS = ['cw-syscard--ok', 'cw-syscard--warn', 'cw-syscard--alert'];
  var flashTimer = null;

  function level(name) {
    LEVELS.forEach(function (c) { card.classList.remove(c); });
    if (name) card.classList.add('cw-syscard--' + name);
  }
  function render() {
    clearTimeout(flashTimer);
    var items = CWErrors.list();
    var last = items[items.length - 1];
    clearBtn.hidden = !items.length;
    if (!last) { stateSlot.textContent = CWI18n.t('errors.none'); level('ok'); return; }
    var text = last.m + ': ' + last.msg;
    stateSlot.textContent = CWI18n.t('errors.some', {
      count: items.length,
      last: text.length > 80 ? text.slice(0, 79) + '…' : text,
    });
    level('warn');
  }
  function flash(key) {
    stateSlot.textContent = CWI18n.t(key);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(render, 2500);
  }

  copyBtn.addEventListener('click', function () {
    CWErrors.copy().then(function (ok) { flash(ok ? 'errors.copied' : 'errors.copy_failed'); });
  });
  clearBtn.addEventListener('click', function () { CWErrors.clear(); });
  CWErrors.onChange(render);
  CWI18n.onChange(render);
  window.addEventListener('storage', function (e) { if (e.key === null || e.key === CWErrors.KEY) render(); });
  window.addEventListener('pageshow', render);
  render();
})();

// --- Отправитель ------------------------------------------------------
// Хаб — первое место, где общую запись можно увидеть и править: до сих пор
// она редактировалась только внутри трёх модулей, каждым своей формой.
// Хранилище общее (CWSender), поэтому правка здесь и правка в модуле — это
// одна и та же запись; подписка onChange держит открытые вкладки в согласии.
(function () {
  var card = document.getElementById('senderCard');
  var stateSlot = document.getElementById('senderState');
  if (!card || !stateSlot || typeof CWSender === 'undefined') return;

  var inputs = {};
  CWSender.FIELDS.forEach(function (field) {
    var el = document.getElementById('sender-' + field);
    if (el) inputs[field] = el;
  });

  var LEVELS = ['cw-syscard--ok', 'cw-syscard--warn', 'cw-syscard--alert'];

  function renderState(data) {
    var name = String(data.name || '').trim();
    var code = String(data.code || '').trim();
    // Жёлтый, а не красный: незаполненный отправитель ещё ничего не испортил,
    // но испортит первый же напечатанный документ. Красный оставлен потере
    // данных.
    var level = name ? 'ok' : 'warn';
    renderPreview(data);
    stateSlot.textContent = name
      ? (code ? name + ' · ' + code : name)
      : CWI18n.t('sender.state_empty');
    LEVELS.forEach(function (cls) { card.classList.remove(cls); });
    card.classList.add('cw-syscard--' + level);
  }

  var preview = document.getElementById('senderPreview');

  // Шапка письма собирается в том же порядке, что и CWSender.FIELDS —
  // порядок полей там и означает порядок строк документа.
  function renderPreview(data) {
    if (!preview) return;
    var lines = [];
    var missing = [];
    CWSender.FIELDS.forEach(function (field) {
      var value = String(data[field] || '').trim();
      if (value) lines.push(value);
      else missing.push(CWI18n.t('sender.f_' + field));
    });

    preview.innerHTML = '';
    lines.forEach(function (line) {
      var p = document.createElement('p');
      // Адрес может быть многострочным — переносы сохраняем как есть.
      p.textContent = line;
      preview.appendChild(p);
    });
    if (missing.length) {
      var note = document.createElement('p');
      note.className = 'cw-sender-preview__missing';
      note.textContent = CWI18n.t('sender.missing', { fields: missing.join(', ') });
      preview.appendChild(note);
    }
  }

  function fill() {
    var data = CWSender.get();
    Object.keys(inputs).forEach(function (field) {
      // Сравнение до присваивания: иначе перерисовка по onChange сбрасывала
      // бы каретку в поле, в котором пользователь сейчас печатает.
      if (inputs[field].value !== data[field]) inputs[field].value = data[field];
    });
    renderState(data);
  }

  // Канон недоступен (фаза C2, сеть CWState) — поля закрываются для правки.
  // Липкая деградация: обратно не открываются без перезагрузки, ровно как
  // сам CWSender не выходит из read-only без неё.
  function applySenderLock() {
    var locked = (typeof CWSender.status === 'function') && CWSender.status() === 'degraded';
    Object.keys(inputs).forEach(function (field) { inputs[field].disabled = locked; });
  }

  Object.keys(inputs).forEach(function (field) {
    inputs[field].addEventListener('input', function () {
      var patch = {};
      patch[field] = inputs[field].value;
      renderState(CWSender.set(patch));
    });
  });

  function offerParkedSender() {
    if (!self.CWParked) return;
    /* Аудит 03, P2-1: правка отправителя из закрытой вкладки (любого
       модуля), которую нельзя было применить автоматически, отложена
       общим слоем. Истории у отправителя нет — решает пользователь.
       Восстановленной считается только подтверждённая запись: пока
       CWSender.dirty(), отложенная копия не удаляется. */
    self.CWParked.offerChoice('shared:sender', function (payload) {
      if (typeof CWSender.status === 'function' && CWSender.status() === 'degraded') return false;
      var parsed;
      try { parsed = JSON.parse(payload); } catch (e) { return false; }
      if (!parsed || typeof parsed !== 'object') return false;
      var patch = {};
      CWSender.FIELDS.forEach(function (f) { patch[f] = typeof parsed[f] === 'string' ? parsed[f] : ''; });
      renderState(CWSender.set(patch));
      fill();
      return new Promise(function (resolve) {
        var until = Date.now() + 8000;
        (function poll() {
          var dirty = typeof CWSender.dirty === 'function' && CWSender.dirty();
          if (!dirty) { resolve(true); return; }
          if (Date.now() > until) { resolve(false); return; }
          setTimeout(poll, 200);
        })();
      });
    });
  }

  CWSender.onChange(fill);
  if (typeof CWSender.onStatusChange === 'function') CWSender.onStatusChange(applySenderLock);
  CWI18n.onChange(function () { renderState(CWSender.get()); });
  /* Фаза C1: ready() пока разрешается сразу после уже синхронного load() —
     видимой задержки нет. Точка ожидания нужна уже сейчас, чтобы фаза C2
     (канон — общая база) не потребовала находить и править это место снова. */
  /* ЗАЩИТА ОБНОВЛЕНИЯ: новый хаб может встретиться со СТАРЫМ shared/sender.js
     из прежнего кэша (смешанное поколение при апгрейде). Старый CWSender не
     имеет ready(), и прямой вызов падал с TypeError. Готовность —
     аддитивный API: нет ready() — значит sender синхронный и уже готов. */
  (self.CWSender && typeof self.CWSender.ready === 'function'
    ? self.CWSender.ready()
    : Promise.resolve()).then(function () { fill(); applySenderLock(); }).then(offerParkedSender);
})();

// --- Профиль: формуляр, дом, почта (фаза 4, 23.10.2026) ---------------
// Общая запись `shared:profile` (shared/profile.js, тот же движок, что у
// отправителя). Правится только здесь; Клиндарий читает. Координаты дома
// хаб определяет сам после ввода адреса (shared/geocode.js); при правке
// адреса прежние координаты сбрасываются — они относились к старому.
(function () {
  if (typeof CWProfile === 'undefined') return;
  var FIELDS = ['overseerName', 'wifeName', 'homeAddress', 'mailMethod', 'owaUrl'];
  var inputs = {};
  FIELDS.forEach(function (f) { var el = document.getElementById('profile-' + f); if (el) inputs[f] = el; });
  var homeStatus = document.getElementById('profileHomeStatus');
  var owaRow = document.getElementById('profileOwaRow');
  var geoSeq = 0;
  var t = function (k, v) { return CWI18n.t(k, v); };

  var homeRetry = document.getElementById('profileHomeRetry');
  var locating = false;

  function renderHome(p) {
    var hasAddr = !!String(p.homeAddress || '').trim();
    var hasCoords = typeof p.homeLat === 'number' && typeof p.homeLng === 'number';
    if (homeRetry) homeRetry.hidden = !hasAddr || hasCoords || locating || typeof CWGeocode === 'undefined';
    if (!homeStatus) return;
    if (!hasAddr) { homeStatus.textContent = t('profile.home_empty'); return; }
    if (hasCoords) {
      homeStatus.textContent = t('profile.home_found', { place: p.homePlace || p.homeAddress, lat: p.homeLat.toFixed(3), lng: p.homeLng.toFixed(3) });
    } else {
      homeStatus.textContent = t('profile.home_nocoords');
    }
  }

  function fill() {
    var p = CWProfile.get();
    FIELDS.forEach(function (f) {
      var el = inputs[f];
      if (!el) return;
      var v = f === 'mailMethod' ? (p.mailMethod === 'owa' ? 'owa' : 'mailto') : String(p[f] || '');
      if (el.value !== v && document.activeElement !== el) el.value = v;
    });
    if (inputs.owaUrl) inputs.owaUrl.placeholder = CWProfile.OWA_DEFAULT;
    if (owaRow) owaRow.hidden = p.mailMethod !== 'owa';
    if (inputs.overseerName && typeof CWSender !== 'undefined') inputs.overseerName.placeholder = String(CWSender.get().name || '');
    renderHome(p);
  }

  function lock() {
    var locked = CWProfile.status() === 'degraded';
    Object.keys(inputs).forEach(function (f) { inputs[f].disabled = locked; });
    if (homeRetry) homeRetry.disabled = locked;
  }

  ['overseerName', 'wifeName', 'owaUrl'].forEach(function (f) {
    if (!inputs[f]) return;
    inputs[f].addEventListener('input', function () { var patch = {}; patch[f] = inputs[f].value; CWProfile.set(patch); });
  });
  if (inputs.mailMethod) inputs.mailMethod.addEventListener('change', function () {
    CWProfile.set({ mailMethod: inputs.mailMethod.value === 'owa' ? 'owa' : '' });
    fill();
  });
  if (inputs.homeAddress) {
    inputs.homeAddress.addEventListener('input', function () {
      CWProfile.set({ homeAddress: inputs.homeAddress.value, homeLat: null, homeLng: null, homePlace: '' });
      renderHome(CWProfile.get());
    });
    inputs.homeAddress.addEventListener('change', locateHome);
  }
  if (homeRetry) homeRetry.addEventListener('click', locateHome);

  function locateHome() {
    var addr = String(CWProfile.get().homeAddress || '').trim();
    if (!addr || typeof CWGeocode === 'undefined' || CWProfile.status() === 'degraded') return;
    var mine = ++geoSeq;
    locating = true;
    if (homeRetry) homeRetry.hidden = true;
    if (homeStatus) homeStatus.textContent = t('profile.home_locating');
    CWGeocode.address(addr).then(function (r) {
      // Пока искали, адрес могли поменять — чужие координаты не пишем.
      if (mine !== geoSeq) return;
      locating = false;
      if (String(CWProfile.get().homeAddress || '').trim() !== addr) { renderHome(CWProfile.get()); return; }
      if (!r) {
        renderHome(CWProfile.get());
        if (homeStatus) homeStatus.textContent = t('profile.home_failed');
        return;
      }
      CWProfile.set({ homeLat: r.lat, homeLng: r.lng, homePlace: r.displayName || '' });
      renderHome(CWProfile.get());
    }, function () {
      if (mine !== geoSeq) return;
      locating = false;
      renderHome(CWProfile.get());
      if (homeStatus) homeStatus.textContent = t('profile.home_failed');
    });
  }

  function offerParkedProfile() {
    /* Новый потребитель CWState обязан показать отложенное зеркало
       (shared/AGENTS.md §5): истории у профиля нет — решает пользователь. */
    if (!self.CWParked) return;
    self.CWParked.offerChoice('shared:profile', function (payload) {
      if (CWProfile.status() === 'degraded') return false;
      var parsed;
      try { parsed = JSON.parse(payload); } catch (e) { return false; }
      if (!parsed || typeof parsed !== 'object') return false;
      CWProfile.set(parsed);
      fill();
      return new Promise(function (resolve) {
        var until = Date.now() + 8000;
        (function poll() {
          if (!CWProfile.dirty()) { resolve(true); return; }
          if (Date.now() > until) { resolve(false); return; }
          setTimeout(poll, 200);
        })();
      });
    });
  }

  CWProfile.onChange(fill);
  CWProfile.onStatusChange(lock);
  CWI18n.onChange(fill);
  if (typeof CWSender !== 'undefined') CWSender.onChange(fill);
  CWProfile.ready().then(function () { fill(); lock(); }).then(offerParkedProfile);
})();

// Регистрация SW и слежение за обновлениями — общий слой (shared/update.js).
// Хаб — ЕДИНСТВЕННОЕ место с ui:'hub': только здесь существует кнопка
// «Обновить всё» и полоса с apply. Все четыре модуля подключают тот же
// файл с ui:'silent' (см. их index.html/app.js) и никогда не показывают
// локальную кнопку «Обновить».
CWUpdate.init({ swUrl: 'service-worker.js', ui: 'hub' });

// Пост-update блок «Обновление установлено» — показывается один раз для
// конкретного release, сразу после reload, который CWUpdate.init() делает
// автоматически по controllerchange. Marker пишется в sessionStorage ДО
// applyAll() (см. onApply ниже) именно из-за этой гонки: reload может
// случиться раньше, чем код после applyAll().then() успел бы что-то
// сохранить. Источник текста — тот же shared/release-manifest.js
// (self.CW_RELEASE), CHANGELOG.md не парсится и не читается.
(function () {
  var raw;
  try { raw = sessionStorage.getItem('cwPendingRelease'); } catch (e) { return; }
  if (!raw) return;

  var pending;
  try { pending = JSON.parse(raw); } catch (e) { sessionStorage.removeItem('cwPendingRelease'); return; }

  // Совпадение версии — единственное условие показа. Если после reload
  // текущий CW_RELEASE.version не совпал с тем, что было применено (сборка
  // не долетела, откат, ошибка деплоя), молча не показываем и не повторяем
  // попытку — marker всё равно удаляется ниже, чтобы не залипнуть навечно.
  var currentVersion = self.CW_RELEASE && self.CW_RELEASE.version;
  var matches = pending.version && pending.version === currentVersion;

  // Удаляем marker сразу после чтения, а не после показа: повторный показ
  // при следующей загрузке (даже с тем же release) — не то поведение,
  // которое нужно ("один раз"), а sessionStorage переживает обычный
  // reload, но не переживает закрытие вкладки — двойной защиты достаточно.
  try { sessionStorage.removeItem('cwPendingRelease'); } catch (e) { /* уже нечего чистить */ }

  if (!matches) return;

  // Служебный version/cache cascade нужен release metadata, но не пользователю.
  // После reload применяем то же правило, что и в pre-update баннере.
  var lines = (pending.changes || []).filter(function (c) {
    return c && !c.technical;
  }).map(function (c) {
    var title = c.module === 'hub' ? 'Circuit Workspace' : ((self.CW_MODULES[c.module] && self.CW_MODULES[c.module].title) || c.module);
    var version = c.version ? ' ' + c.version : '';
    return c.note ? (title + version + ' — ' + c.note) : (title + version);
  });
  (pending.failed || []).forEach(function (line) { lines.push(line); });

  CWUpdate.offerHubBanner({
    textKey: pending.failed && pending.failed.length ? 'update.partial' : 'update.installed_multi',
    textFallback: pending.failed && pending.failed.length ? 'Обновление установлено не для всех модулей' : 'Обновление установлено',
    listItems: lines,
    applyKey: 'update.dismiss',
    applyFallback: 'Понятно',
    onApply: function () { CWUpdate.dismiss(); },
  });
})();

// Сопоставление только с точными scope Circuit Workspace. На GitHub Pages
// тот же origin содержит другие приложения, и их URL нельзя показывать в UI.
function moduleIdForScope(scope) {
  var base = new URL('./', document.baseURI);
  var exact = {};
  exact[base.href] = 'hub';
  Object.keys(self.CW_MODULES || {}).forEach(function (id) {
    exact[new URL(id + '/', base).href] = id;
  });
  try { return exact[new URL(scope, location.href).href] || null; }
  catch (e) { return null; }
}

function updateModuleTitle(item) {
  var id = item && (item.module || moduleIdForScope(item.scope));
  if (id === 'hub') return 'Circuit Workspace';
  return id && self.CW_MODULES[id] ? self.CW_MODULES[id].title : 'Circuit Workspace';
}

function failedUpdateLines(failed, suffix) {
  return (failed || []).filter(function (item) { return item.scope !== '*'; }).map(function (item) {
    return updateModuleTitle(item) + ' — ' + suffix;
  });
}

// Строит подписи для баннера из CW_RELEASE.changes (текущий release,
// shared/release-manifest.js), но ТОЛЬКО для тех модулей, что реально
// оказались в списке ready — совпадение release-манифеста с фактически
// найденными waiting-воркерами, а не слепое доверие манифесту.
function buildChangeLines(release, ready) {
  if (!release || !Array.isArray(release.changes)) return [];
  var readyIds = (ready || []).map(function (item) { return moduleIdForScope(item.scope); });
  return release.changes.filter(function (change) {
    return !change.technical && readyIds.indexOf(change.module) !== -1;
  }).map(function (change) {
    var id = change.module;
    var title = id === 'hub' ? 'Circuit Workspace' : ((self.CW_MODULES[id] && self.CW_MODULES[id].title) || id);
    var version = change.version ? ' ' + change.version : '';
    return change.note ? (title + version + ' — ' + change.note) : (title + version);
  });
}

// Кнопка «Проверить обновления / Обновить всё». Один и тот же элемент
// проходит два состояния: сначала bounded-проверка всех registrations,
// затем (если что-то нашлось) сама кнопка предлагает применить всё разом.
(function () {
  var btn = document.getElementById('hubUpdateBtn');
  var label = btn && btn.querySelector('.cw-update-btn__label');
  if (!btn) return;
  var checking = false;
  /* Отдельно от checking: checking снимается сразу после checkAll() —
     предложение «Обновить всё» уже показано, но сам apply (клик пользователя
     → applyAll() → подтверждение активации каждого scope) идёт дольше и раньше
     ничем не был отмечен. Без этого флага фоновый автопроверка hub'а (событие
     cw-update-available, см. ниже) могла запустить параллельный runCheck()
     прямо во время применения и показать свой баннер поверх/раньше настоящего
     apply-результата — источник «сначала partial, потом сразу installed». */
  var applying = false;

  var MESSAGE = {
    current: ['update.current', 'Установлена последняя версия.'],
    partial: ['update.partial', 'Не удалось проверить некоторые модули. Попробуйте ещё раз.'],
    offline: ['update.offline', 'Нет соединения — проверить обновления не удалось.'],
  };

  function runCheck() {
    if (checking) return Promise.resolve();
    checking = true;
    btn.disabled = true;
    var restore = label ? label.textContent : '';
    if (label) label.textContent = CWI18n.t('update.checking');

    return CWUpdate.checkAll().then(function (result) {
      var ready = result.ready || [];
      var failed = result.failed || [];

      if (!ready.length) {
        // Ничего не нашлось. Различаем три исхода, а не два:
        //  - failed пуст → все регистрации проверены, апдейта нет — «последняя версия».
        //  - failed есть, но не все — часть проверок реально не удалась
        //    (updateFailed на конкретном scope), не весь набор — нейтральное
        //    сообщение, не утверждение «нет соединения».
        //  - failed покрывает вообще все проверенные (или пришёл единственный
        //    маркер '*' — getRegistrations() сам отклонился) — тогда это
        //    единственный случай, где «нет соединения» оправдано.
        var globalFailure = failed.some(function (f) { return f.scope === '*'; });
        var msg;
        if (!failed.length) msg = MESSAGE.current;
        else if (globalFailure) msg = MESSAGE.offline;
        else msg = MESSAGE.partial;
        if (msg === MESSAGE.partial) {
          CWUpdate.offerHubBanner({
            textKey: msg[0],
            textFallback: msg[1],
            listItems: failedUpdateLines(failed, 'не удалось проверить'),
          });
        } else {
          CWUpdate.notify(msg[0], msg[1]);
        }
        return;
      }

      var pendingRelease = result.release || self.CW_RELEASE;
      var lines = buildChangeLines(pendingRelease, ready);
      lines = lines.concat(failedUpdateLines(failed, 'не удалось проверить'));
      // Хаб сам мог оказаться среди ready (свой scope) — для него отдельной
      // строки в списке нет (moduleIdForScope возвращает null), баннер в
      // этом случае просто говорит про сам Circuit Workspace без деталей.
      //
      // failed здесь не теряется молча: если что-то из ready нашлось, а
      // другие scope при этом реально не проверились, баннер про apply
      // всё равно применяет то, что нашлось — частичный отказ проверки
      // остальных не блокирует применение уже готового.

      CWUpdate.offerHubBanner({
        listItems: lines,
        onApply: function () {
          CWUpdate.dismiss();
          applying = true;
          if (label) label.textContent = CWI18n.t('update.checking');
          btn.disabled = true;
          // Marker пишется ДО applyAll(), не в .then(): controllerchange
          // может вызвать location.reload() (см. CWUpdate.init) раньше,
          // чем этот .then() успеет отработать — гонка. sessionStorage
          // переживает reload (в отличие от переменных в памяти), поэтому
          // после перезагрузки есть с чем сверять текущий CW_RELEASE.
          try {
            var failedLines = failedUpdateLines(failed, 'не обновлён');
            sessionStorage.setItem('cwPendingRelease', JSON.stringify({
              version: pendingRelease && pendingRelease.version,
              changes: (pendingRelease && pendingRelease.changes) || [],
              failed: failedLines,
            }));
          } catch (e) { /* приватный режим/квота — просто не покажем post-update блок */ }
          CWUpdate.applyAll(ready).then(function (outcome) {
            // Own-scope (хаб), если был в ready и подтвердил activation,
            // перезагрузится сам через controllerchange, подписанный в
            // CWUpdate.init(). allActivated=false значит хотя бы один
            // scope не уложился в bounded timeout — показываем partial,
            // а не молчаливый success (иначе хаб солгал бы, что apply
            // завершён полностью, пока какой-то scope ещё pending).
            // Если own-scope всё же перезагрузится, этот .then() до конца
            // не дойдёт — applying корректно останется true до самого
            // reload, что и требуется (см. объявление applying выше).
            applying = false;
            btn.disabled = false;
            if (outcome.allActivated && !failed.length) {
              if (label) label.textContent = CWI18n.t('hub.update_label');
            } else {
              var bad = outcome.results.filter(function (r) { return r.status !== 'activated'; }).map(function (r) {
                var id = moduleIdForScope(r.scope);
                var title = id && self.CW_MODULES[id] ? self.CW_MODULES[id].title : 'Circuit Workspace';
                return title + ' (' + r.status + ')';
              });
              failed.forEach(function (r) { bad.push(updateModuleTitle(r) + ' (checkFailed)'); });
              CWUpdate.notify('update.partial', 'Не обновились: ' + bad.join(', ') + '. Попробуйте ещё раз.');
              if (label) label.textContent = CWI18n.t('hub.update_label');
            }
          });
        },
      });
    }).catch(function (err) {
      console.warn('Проверка обновлений не удалась', err);
      CWUpdate.notify(MESSAGE.offline[0], MESSAGE.offline[1]);
    }).then(function () {
      checking = false;
      btn.disabled = false;
      // Подпись возвращаем через словарь, а не сохранённой строкой: язык
      // мог смениться, пока шла проверка. Не трогаем, если баннер с
      // «Обновить всё» уже показан выше — там своя подпись кнопки.
      if (label && !document.getElementById('cwUpdateBar')) {
        label.textContent = CWI18n.t('hub.update_label');
      }
    });
  }

  btn.addEventListener('click', runCheck);
  // Хаб-регистрация отслеживается независимо (shared/update.js: watch()) и
  // это событие может прилететь САМО ПО СЕБЕ — сразу после reload, пока
  // post-update верификация ещё проверяет активные workers (CWUpdate.isBusy()),
  // или прямо во время ручного apply (applying, см. объявление выше). Два
  // независимых showBar() почти одновременно — и есть «сначала partial,
  // потом сразу installed». Пропускаем, а не откладываем: следующий реальный
  // повод (новый updatefound, ручная кнопка) прилетит сам, очередь не нужна.
  document.addEventListener('cw-update-available', function () {
    if (checking || applying || (CWUpdate.isBusy && CWUpdate.isBusy())) return;
    runCheck();
  });
})();

// Меню «⋮» резервного копирования. С варианта C (28.09.2026) кнопка видна
// на всех ширинах: системные карточки — компактные строки.
// Пункты меню — существующие кнопки .cw-backup__actions со своими
// обработчиками; здесь только открытие/закрытие и фокус.
(function () {
  var card = document.getElementById('backupCard');
  var btn = document.getElementById('backupMenuBtn');
  var menu = document.getElementById('backupActions');
  if (!card || !btn || !menu) return;
  var details = card.querySelector('.cw-disclose');
  var detailsBtn = document.getElementById('backupDetailsBtn');
  function isOpen() { return card.classList.contains('is-menu-open'); }
  function set(open, returnFocus) {
    card.classList.toggle('is-menu-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var first = menu.querySelector('button:not([hidden])');
      if (first) first.focus();
    } else if (returnFocus) {
      btn.focus();
    }
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); set(!isOpen()); });
  // Обработчик самой кнопки уже отработал (всплытие) — закрываем после.
  menu.addEventListener('click', function (e) { if (isOpen() && e.target.closest('button')) set(false); });
  document.addEventListener('click', function (e) { if (isOpen() && !menu.contains(e.target)) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) set(false, true); });
  if (details) {
    details.addEventListener('toggle', function () { card.classList.toggle('is-details', details.open); });
    if (detailsBtn) detailsBtn.addEventListener('click', function () {
      details.open = true;
      card.classList.add('is-details');
      var summary = details.querySelector('summary');
      if (summary) summary.focus();
    });
  }
})();

/* ── «Сегодня» (визуальный аудит, Ф5) ───────────────────────────────────
   Идущее или ближайшее посещение и ближайший конгресс. Источник — только
   сводки, которые модули публикуют сами (shared/summary.js): хаб не знает
   схем их баз. «Через сколько дней» и «день N из M» считаются здесь, от
   сегодняшней даты, поэтому сводка не устаревает от течения времени.
   Пока ни один модуль сводку не опубликовал (свежая установка, модуль ещё
   не открывали после выпуска) — раздел скрыт целиком. */
(function () {
  var section = document.getElementById('hubToday');
  var grid = document.getElementById('hubTodayGrid');
  if (!section || !grid || !window.CWSummary) return;

  var DAY = 86400000;
  function parse(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function t(key, vars) { return window.CWI18n ? CWI18n.t(key, vars) : key; }
  function fmt(iso, opts) {
    var d = parse(iso); if (!d) return '';
    try { return new Intl.DateTimeFormat(window.CWI18n ? CWI18n.getLang() : 'ru', opts || { day: 'numeric', month: 'short' }).format(d); }
    catch (e) { return iso; }
  }
  function range(a, b) { return a === b ? fmt(a) : fmt(a) + ' – ' + fmt(b); }
  function until(iso, todayD) {
    var n = Math.round((parse(iso) - todayD) / DAY);
    if (n <= 0) return t('hub.today_today');
    if (n === 1) return t('hub.today_tomorrow');
    return t('hub.today_in', { n: n, unit: window.CWI18n ? CWI18n.tn('unit.days', n) : '' });
  }

  function card(moduleId, href, kicker, title, meta, go, progress) {
    var a = document.createElement('a');
    a.className = 'cw-card cw-today__card';
    a.href = href;
    a.setAttribute('data-module', moduleId);
    var img = document.createElement('img');
    img.className = 'cw-today__icon'; img.alt = ''; img.width = 36; img.height = 36;
    img.src = 'shared/brand/' + moduleId + '-icon-source.svg';
    var body = document.createElement('div'); body.className = 'cw-today__body';
    [['cw-today__kicker', kicker], ['cw-today__title', title], ['cw-today__meta', meta]].forEach(function (p) {
      if (!p[1]) return;
      var el = document.createElement('p'); el.className = p[0]; el.textContent = p[1]; body.appendChild(el);
    });
    if (progress != null) {
      var bar = document.createElement('div'); bar.className = 'cw-today__progress';
      bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      var fill = document.createElement('span'); fill.style.width = Math.round(progress * 100) + '%';
      bar.appendChild(fill); body.appendChild(bar);
    }
    var goEl = document.createElement('span'); goEl.className = 'cw-today__go'; goEl.textContent = go + ' →';
    a.appendChild(img); a.appendChild(body); a.appendChild(goEl);
    return a;
  }

  function render() {
    var today = CWSummary.today();
    var todayD = parse(today);
    var planner = CWSummary.read('circuit-planner');
    var congress = CWSummary.read('congress-project');
    grid.textContent = '';
    if (!planner && !congress) { section.hidden = true; return; }
    section.hidden = false;

    var visit = planner && (planner.data.visits || []).filter(function (v) { return v.end >= today; })[0];
    if (visit) {
      var running = visit.start <= today;
      var total = Math.round((parse(visit.end) - parse(visit.start)) / DAY) + 1;
      var dayN = Math.round((todayD - parse(visit.start)) / DAY) + 1;
      grid.appendChild(card('circuit-planner', 'circuit-planner/index.html',
        t(running ? 'hub.today_visit_now' : 'hub.today_visit_next'),
        visit.title,
        (running ? t('hub.today_day_of', { n: dayN, total: total }) : until(visit.start, todayD)) + ' · ' + range(visit.start, visit.end),
        t('hub.today_open_calendar'),
        running ? dayN / total : null));
    }

    var cong = congress && (congress.data.congresses || []).filter(function (c) { return c.date >= today; })[0];
    if (cong) {
      var meta = [until(cong.date, todayD), fmt(cong.date, { day: 'numeric', month: 'long' }), cong.place].filter(Boolean).join(' · ');
      if (cong.responseDeadline && cong.responseDeadline >= today) meta += ' · ' + t('hub.today_reply_by', { date: fmt(cong.responseDeadline) });
      grid.appendChild(card('congress-project', 'congress-project/index.html',
        t('hub.today_congress_next'), cong.name, meta, t('hub.today_open_program'), null));
    }

    if (!grid.children.length) {
      var empty = document.createElement('p'); empty.className = 'cw-today__empty'; empty.textContent = t('hub.today_empty');
      grid.appendChild(empty);
    }
  }

  render();
  if (window.CWI18n) CWI18n.onChange(render);
  // Модуль, открытый в соседней вкладке, обновил сводку — перерисовываем.
  window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf(CWSummary.PREFIX) === 0) render(); });
  // Вернулись на вкладку на следующий день — «через N дней» должно пересчитаться.
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') render(); });
})();
