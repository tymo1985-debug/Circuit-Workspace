/**
 * Журнал — оболочка модуля (J1).
 *
 * Никакой доменной логики здесь нет: ни CWState, ни CWDB не подключены
 * (см. заголовок index.html и запись в shared/backup.js). Всё, что делает
 * этот файл — переключает пять статических секций по хэшу адреса и
 * синхронизирует подпись/видимость единственного FAB. Обзор и Районы
 * показывают детерминированную фикстуру; Задачи/Поиск/Архив — заглушку
 * .md-emptystate.
 */
(function () {
  'use strict';

  var MODULE_ID = 'journal';
  var ROUTES = ['overview', 'districts', 'tasks', 'search', 'archive'];
  var DEFAULT_ROUTE = 'overview';

  /* Только на этих двух маршрутах FAB виден в J1 — у остальных трёх ещё
     нет действия, которое он мог бы запускать. */
  var FAB = {
    overview: { icon: 'plus', labelKey: 'j.fab.new_entry' },
    districts: { icon: 'plus', labelKey: 'j.fab.new_congregation' },
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function currentRoute() {
    var hash = (location.hash || '').replace(/^#/, '');
    return ROUTES.indexOf(hash) >= 0 ? hash : DEFAULT_ROUTE;
  }

  function applyRoute() {
    var route = currentRoute();

    $all('[data-route]', document).forEach(function (el) {
      var isSection = el.tagName === 'SECTION';
      var match = el.getAttribute('data-route') === route;
      if (isSection) {
        el.hidden = !match;
      } else {
        el.classList.toggle('active', match);
      }
    });

    var fab = $('#fab');
    var fabLabel = $('#fabLabel');
    var spec = FAB[route];
    if (fab && fabLabel) {
      if (spec) {
        fab.hidden = false;
        fabLabel.setAttribute('data-i18n', spec.labelKey);
        if (self.CWI18n) fabLabel.textContent = CWI18n.t(spec.labelKey);
      } else {
        fab.hidden = true;
      }
    }
  }

  function initVersion() {
    var version = (self.CW_MODULES && self.CW_MODULES[MODULE_ID] || {}).version;
    if (version) $('#moduleVersion').textContent = 'v' + version;
  }

  function initLanguage() {
    if (!self.CWI18n) return;
    self.CWI18n.bindModule({
      module: MODULE_ID,
      select: 'uiLanguage',
      onChange: function () {
        // Единственный кусок текста, который data-i18n не достаёт сам —
        // подпись FAB, потому что она переставляется вручную в applyRoute().
        applyRoute();
      },
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (self.CWI18n) self.CWI18n.init({ module: MODULE_ID });
    initLanguage();
    initVersion();
    applyRoute();

    $('#searchBtn').addEventListener('click', function () {
      location.hash = '#search';
    });

    window.addEventListener('hashchange', applyRoute);

    if (typeof CWUpdate !== 'undefined') {
      CWUpdate.init({ swUrl: 'sw.js', ui: 'silent', hubHref: '../index.html' });
    }
  });
})();
