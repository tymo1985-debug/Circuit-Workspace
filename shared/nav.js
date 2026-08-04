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

  var LABEL = 'На главную — Circuit Workspace';

  function homeUrl() {
    return window.CW_HOME_URL || '../index.html';
  }

  function makeLink(className) {
    var a = document.createElement('a');
    a.id = 'cwHomeFab';
    a.className = className;
    a.href = homeUrl();
    a.setAttribute('aria-label', LABEL);
    a.title = LABEL;
    a.innerHTML = ICON;
    return a;
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
  }

  function start() { inject(true); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
