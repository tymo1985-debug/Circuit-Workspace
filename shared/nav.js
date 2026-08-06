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
 * КНОПКА КОПИИ МОДУЛЯ. Рядом с кнопкой возврата встраивается кнопка
 * «Копия модуля» — она сохраняет ТОЛЬКО данные текущего модуля. Общий слой
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
  var SLOTS = [
    { sel: '.topbar .topbar-title-row', mode: 'prepend' },
    { sel: 'header.topbar', mode: 'prepend' },
    { sel: '.topbar', mode: 'prepend' },
    { sel: '.sidebar .brand', mode: 'before', variant: 'sidebar' },
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

  function makeBackupButton() {
    var id = moduleId();
    if (!window.CWBackup || !window.CWBackup.MODULES[id]) return null;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'cwBackupBtn';
    btn.className = 'cw-home-btn';
    btn.innerHTML = BACKUP_ICON;
    var title = label('backup.module', 'Копия модуля');
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('click', function () {
      btn.disabled = true;
      window.CWBackup.saveModule(id)
        .then(function () { btn.title = label('backup.module_done', 'Копия модуля сохранена'); })
        .catch(function (e) { console.error('CWBackup: копия модуля не удалась', e); })
        .then(function () { btn.disabled = false; });
    });
    if (window.CWI18n) {
      window.CWI18n.onChange(function () {
        var next = label('backup.module', 'Копия модуля');
        btn.title = next;
        btn.setAttribute('aria-label', next);
      });
    }
    return btn;
  }

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

    var backup = makeBackupButton();
    if (backup && link.parentNode) link.parentNode.insertBefore(backup, link.nextSibling);
  }

  function start() { inject(true); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
