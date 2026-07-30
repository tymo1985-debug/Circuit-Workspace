/**
 * Circuit Workspace — shared/nav.js
 * Добавляет плавающую кнопку «На главную» в любой модуль хаба, без изменения
 * собственной разметки/логики модуля.
 *
 * Подключение (в конце <body> модуля, на один уровень вложенности от корня хаба):
 *   <link rel="stylesheet" href="../shared/style.css">
 *   <script src="../shared/nav.js" defer></script>
 *
 * Если модуль вложен глубже одного уровня — передайте свой путь явно:
 *   <script>window.CW_HOME_URL = '../../index.html';</script>
 *   <script src="../../shared/nav.js" defer></script>
 *
 * Если у модуля есть собственная нижняя мобильная навигация (как в Клиндарии),
 * добавьте класс "cw-has-bottom-nav" на <body>, чтобы кнопка поднялась над ней
 * на мобильных экранах — см. .cw-home-fab в shared/style.css.
 */
(function () {
  function inject() {
    if (document.getElementById('cwHomeFab')) return;

    var homeUrl = window.CW_HOME_URL || '../index.html';

    var a = document.createElement('a');
    a.id = 'cwHomeFab';
    a.className = 'cw-home-fab';
    a.href = homeUrl;
    a.setAttribute('aria-label', 'На главную — Circuit Workspace');
    a.title = 'На главную (Circuit Workspace)';
    a.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 11l9-8 9 8"/>' +
      '<path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>' +
      '</svg>';

    document.body.appendChild(a);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
