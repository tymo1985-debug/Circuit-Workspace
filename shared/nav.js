/**
 * Circuit Workspace — shared/nav.js
 * Кнопка возврата в хаб для любого модуля, без изменения его разметки и логики.
 *
 * ГДЕ ОНА ПОЯВЛЯЕТСЯ. Скрипт ищет «ведущий слот» верхней панели модуля —
 * левый верхний угол, как предписывает Material Design 3 для навигации на
 * уровень выше (leading navigation icon). Раньше кнопка была плавающей в
 * правом нижнем углу: по MD3 это слот основного действия экрана, а не
 * навигации, и до него неудобно тянуться курсором.
 *
 * Порядок поиска слота (первое совпадение выигрывает) — см. SLOTS ниже.
 * Если ни один селектор не подошёл (новый модуль без топбара), скрипт
 * откатывается к прежней плавающей кнопке .cw-home-fab — поведение по
 * умолчанию не ломается никогда.
 *
 * Подключение (в конце <body> модуля, на один уровень вложенности от корня):
 *   <link rel="stylesheet" href="../shared/style.css">
 *   <script src="../shared/nav.js" defer></script>
 *
 * Модуль вложен глубже одного уровня — путь задаётся явно:
 *   <script>window.CW_HOME_URL = '../../index.html';</script>
 *
 * У модуля нестандартная шапка — слот задаётся явно:
 *   <script>
 *     window.CW_HOME_SLOT = '#myHeader';   // селектор контейнера
 *     window.CW_HOME_SLOT_MODE = 'prepend'; // 'prepend' | 'before'
 *   </script>
 *
 * Если модуль имеет собственную нижнюю мобильную навигацию (как Клиндарий),
 * класс "cw-has-bottom-nav" на <body> поднимает запасной FAB над ней.
 *
 * МЕНЮ МОДУЛЯ «⋮» (визуальный аудит 24.10.2026, Ф4). Версия модуля и
 * «Копия модуля» — редкие действия, им не место на самом дорогом месте шапки
 * рядом с кнопкой возврата. Обе живут в меню «⋮» в конце шапки:
 *  - у модуля своего «⋮» нет — скрипт заводит его сам (.md-menu в
 *    .md-topbar-v2__actions, поведение — открыть, клик мимо, Esc);
 *  - свой «⋮» есть и его панель статична — панель помечается
 *    `data-cw-module-menu`, и пункты дописываются в её конец;
 *  - панель перерисовывается модулем (Журнал) — модуль сам зовёт
 *    `CWNav.appendModuleItems(panel)` после каждой перерисовки.
 * Номер версии в подзаголовке шапки помечен классом `.cw-topbar-version` и
 * скрыт стилем: модули по-прежнему пишут его туда (на это опираются
 * проверки), но видно его теперь в меню.
 *
 * «Копия модуля» сохраняет ТОЛЬКО данные текущего модуля. Общий слой
 * (язык, отправитель, общая база) в неё не входит: он принадлежит хабу, там же
 * делается полная копия. Кнопка появляется, только если подключён
 * shared/backup.js и модуль есть в его реестре, поэтому подключение файла
 * остаётся делом самого модуля, а не навязывается всем подряд.
 *
 * id модуля берётся из пути (`/circuit-planner/index.html` → `circuit-planner`),
 * чтобы не заводить ещё одну настройку, которую придётся держать в согласии.
 *
 * ПОДПИСИ. Обе кнопки берут текст из общего слоя локализации
 * (`common.back_to_hub`, `backup.module`) и перерисовываются по
 * `CWI18n.onChange`. Если `shared/i18n.js` в модуле не подключён, обе
 * деградируют на русскую строку — кнопка остаётся подписанной всегда.
 */
(function () {
  /* Все четыре модуля переведены на общую оболочку, поэтому слот один.
     Прежние пять селекторов (.topbar .topbar-title-row, header.topbar,
     .topbar, .sidebar .brand) удалены как леса миграции — они были нужны,
     пока модули жили в двух видах шапок одновременно.

     ВАЖНО, не «упрощать» дальше:
     - .cw-home-fab ниже НЕ запасной вариант «на всякий случай», а рабочий
       путь для страниц без общей шапки. Такая уже есть:
       pioneer-school/register.html (отдельный бланк со своей вёрсткой).
     - window.CW_HOME_SLOT остаётся точкой расширения для будущих модулей
       с нестандартной шапкой — дешевле, чем дописывать сюда селекторы.
     Осторожно с .topbar: в Клиндарии класс с таким именем ЖИВ, но это
     строка заголовка экрана внутри .main, а не шапка приложения. Вернуть
     его сюда — значит поставить кнопку возврата не туда. */
  var SLOTS = [
    { sel: '.md-topbar-v2__lead', mode: 'prepend' },
  ];

  var ICON =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>';

  /* Русская строка остаётся запасным вариантом: nav.js подключают и модули,
     в которых общий слой локализации ещё не поднят, — без CWI18n кнопка
     должна оставаться подписанной, а не безымянной. */
  var LABEL_FALLBACK = 'На главную — Circuit Workspace';

  function homeUrl() {
    return window.CW_HOME_URL || '../index.html';
  }

  function makeLink(className) {
    var a = document.createElement('a');
    a.id = 'cwHomeFab';
    a.className = className;
    a.href = homeUrl();
    applyHomeLabel(a);
    a.innerHTML = ICON;

    /* Язык можно сменить, не перезагружая страницу, — подписываемся на смену,
       иначе кнопка осталась бы на языке, который был при первой отрисовке. */
    if (window.CWI18n) {
      window.CWI18n.onChange(function () { applyHomeLabel(a); });
    }
    return a;
  }

  function applyHomeLabel(node) {
    var text = label('common.back_to_hub', LABEL_FALLBACK);
    node.setAttribute('aria-label', text);
    node.title = text;
  }

  function findSlot() {
    if (window.CW_HOME_SLOT) {
      var custom = document.querySelector(window.CW_HOME_SLOT);
      if (custom) {
        return { node: custom, mode: window.CW_HOME_SLOT_MODE || 'prepend', variant: '' };
      }
    }
    for (var i = 0; i < SLOTS.length; i++) {
      var node = document.querySelector(SLOTS[i].sel);
      if (node) return { node: node, mode: SLOTS[i].mode, variant: SLOTS[i].variant || '' };
    }
    return null;
  }

  var BACKUP_ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>';

  function moduleId() {
    var parts = location.pathname.split('/').filter(Boolean);
    // Последний сегмент может быть файлом (index.html, register.html).
    if (parts.length && parts[parts.length - 1].indexOf('.') >= 0) parts.pop();
    return parts.length ? parts[parts.length - 1] : '';
  }

  function label(key, fallback) {
    return (window.CWI18n && window.CWI18n.t(key)) || fallback;
  }

  var MORE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="5" r="1.4"/>' +
    '<circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>';
  var INFO_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';

  function moduleVersion() {
    var m = window.CW_MODULES && window.CW_MODULES[moduleId()];
    return m && m.version ? 'v' + m.version : '';
  }

  function closePanel(panel) {
    if (!panel) return;
    panel.hidden = true;
    var host = panel.closest('.md-menu');
    var trigger = host && host.querySelector('[aria-expanded]');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  /* Пункты меню модуля: «Копия модуля» (если модуль есть в реестре копий)
     и строка версии. Возвращает фрагмент — его можно дописать в любую
     .md-menu__panel, в том числе в перерисованную модулем. */
  function moduleItems(panel) {
    var frag = document.createDocumentFragment();
    var id = moduleId();
    var nodes = [];

    var sep = document.createElement('div');
    sep.className = 'md-menu__sep cw-module-menu__part';
    sep.setAttribute('role', 'separator');

    if (window.CWBackup && window.CWBackup.MODULES[id]) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'cwBackupBtn';
      btn.className = 'md-menu__item cw-module-menu__part';
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = BACKUP_ICON + '<span></span>';
      var text = btn.querySelector('span');
      var paint = function () { text.textContent = label('backup.module', 'Копия модуля'); };
      paint();
      btn.addEventListener('click', function () {
        btn.disabled = true;
        closePanel(panel);
        window.CWBackup.saveModule(id)
          .then(function () { btn.title = label('backup.module_done', 'Копия модуля сохранена'); })
          .catch(function (e) { console.error('CWBackup: копия модуля не удалась', e); })
          .then(function () { btn.disabled = false; });
      });
      if (window.CWI18n) window.CWI18n.onChange(paint);
      nodes.push(btn);
    }

    var ver = moduleVersion();
    if (ver) {
      var row = document.createElement('div');
      row.className = 'md-menu__meta cw-module-menu__part';
      row.innerHTML = INFO_ICON + '<span></span>';
      var vText = row.querySelector('span');
      var paintVer = function () { vText.textContent = label('backup.col_version', 'Версия') + ' ' + ver; };
      paintVer();
      if (window.CWI18n) window.CWI18n.onChange(paintVer);
      nodes.push(row);
    }

    if (!nodes.length) return frag;
    if (panel && panel.querySelector('.md-menu__item, .md-menu__meta')) frag.appendChild(sep);
    nodes.forEach(function (n) { frag.appendChild(n); });
    return frag;
  }

  function appendModuleItems(panel) {
    if (!panel) return;
    Array.prototype.forEach.call(panel.querySelectorAll('.cw-module-menu__part'), function (n) { n.remove(); });
    panel.appendChild(moduleItems(panel));
  }

  /* Своё «⋮», когда у модуля его нет. Поведение — минимальное общее:
     открыть/закрыть, клик мимо, Esc с возвратом фокуса. */
  function makeModuleMenu(actions) {
    var host = document.createElement('div');
    host.className = 'md-menu cw-module-menu';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-icon-btn';
    btn.id = 'cwModuleMenuBtn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = MORE_ICON;
    var paint = function () {
      var t = label('common.more', 'Ещё');
      btn.title = t; btn.setAttribute('aria-label', t);
    };
    paint();
    if (window.CWI18n) window.CWI18n.onChange(paint);
    var panel = document.createElement('div');
    panel.className = 'md-menu__panel';
    panel.id = 'cwModuleMenu';
    panel.setAttribute('role', 'menu');
    panel.hidden = true;
    host.appendChild(btn);
    host.appendChild(panel);
    appendModuleItems(panel);
    if (!panel.children.length) return null;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { var first = panel.querySelector('.md-menu__item'); if (first) first.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !host.contains(e.target)) closePanel(panel);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { closePanel(panel); btn.focus(); }
    });
    actions.appendChild(host);
    return host;
  }

  function injectModuleMenu() {
    var bar = document.querySelector('.md-topbar-v2');
    if (!bar || document.getElementById('cwModuleMenuBtn')) return;
    var own = document.querySelector('[data-cw-module-menu]');
    if (own) { appendModuleItems(own); return; }
    if (document.querySelector('[data-cw-module-menu-dynamic]')) return; // модуль зовёт appendModuleItems сам
    var actions = bar.querySelector('.md-topbar-v2__actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'md-topbar-v2__actions';
      if (!bar.querySelector('.md-topbar-v2__spacer')) {
        var spacer = document.createElement('span');
        spacer.className = 'md-topbar-v2__spacer';
        bar.appendChild(spacer);
      }
      bar.appendChild(actions);
    }
    makeModuleMenu(actions);
  }

  window.CWNav = { appendModuleItems: appendModuleItems };

  function injectFab() {
    document.body.appendChild(makeLink('cw-home-fab'));
  }

  function inject(allowRetry) {
    if (document.getElementById('cwHomeFab')) return;

    var slot = findSlot();

    // Шапка может дорисовываться скриптом модуля — даём ей один кадр,
    // и только потом откатываемся к плавающей кнопке.
    if (!slot) {
      if (allowRetry) {
        window.setTimeout(function () { inject(false); }, 0);
        return;
      }
      injectFab();
      return;
    }

    var link = makeLink('cw-home-btn' + (slot.variant === 'sidebar' ? ' cw-home-btn--sidebar' : ''));

    if (slot.mode === 'before' && slot.node.parentNode) {
      slot.node.parentNode.insertBefore(link, slot.node);
    } else {
      slot.node.insertBefore(link, slot.node.firstChild);
    }

    injectModuleMenu();
  }

  function start() { inject(true); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
