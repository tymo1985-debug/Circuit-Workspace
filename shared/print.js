/**
 * Circuit Workspace — shared/print.js
 * Общий слой печати. Две независимые функции, закрывающие два разных
 * механизма печати, которые в проекте сосуществуют намеренно.
 *
 * ─── CWPrint.document() — печать отдельного документа ───────────────────────
 *
 * Открывает изолированное окно с самодостаточным HTML и отправляет его на
 * печать. Не зависит от `@media print` приложения вообще — и в этом весь
 * смысл: у оболочки свои правила печати, и документ в них выглядел бы как
 * экран, а не как бумага.
 *
 * До появления этого файла тракт был написан дважды независимо — в композере
 * Клиндария (`App.ui.printComposerDoc`) и в композере Школы пионеров
 * (`printComposerDoc`). Совпадали не только стили, но и `setTimeout(…, 250)`
 * вместе с комментарием про Safari: одну задачу решали дважды и оба раза
 * одинаково (аудит — `docs/print/01-audit.md`, §2.1).
 *
 * ЗАБЛОКИРОВАННОЕ ОКНО — ЭТО ОТКАЗ, А НЕ ПОВОД НАПЕЧАТАТЬ ЧТО-НИБУДЬ ЕЩЁ.
 * Функция возвращает false и зовёт `onBlocked`; вызывающий показывает
 * сообщение. Откатываться на `window.print()` категорически нельзя: он
 * напечатает ЭКРАН приложения вместо документа, и пользователь получит бумагу,
 * которая выглядит как успех, но содержит не то. Ровно так вёл себя
 * `doPrint()` Клиндария до 15.08.2026 (аудит, §2.2).
 *
 * ПОЛЯ БУМАГИ ОБЪЯВЛЯЕТ ДОКУМЕНТ, А НЕ ДИАЛОГ ПЕЧАТИ. См. `DEFAULT_MARGIN`
 * ниже: до 15.08.2026 поля жили только на `body` и при печати обнулялись,
 * поэтому предпросмотр показывал одни поля, а печаталось другое.
 *
 * ПОЧЕМУ ВСЁ ЕЩЁ `setTimeout(250)`, А НЕ `onload`. Фиксированный таймаут —
 * не лучшее решение, но проверенное: без задержки Safari печатает пустой лист.
 * Переход на `onload` — отдельное изменение поведения с собственным риском
 * (сигнал может прийти раньше, чем движок разложил страницу), и делать его
 * заодно с выносом кода в общий слой значит смешать рефакторинг с правкой.
 * Вынесено в `TODO.md`.
 *
 * ─── CWPrint.filename() — имя файла при печати самой страницы ───────────────
 *
 * Второй механизм: печатается сама страница, `@media print` прячет интерфейс.
 * Так работают Назначения и все три печатных тракта Конгрессов. Имя PDF
 * браузер берёт из `document.title`, поэтому модули его подменяют — и делали
 * это тремя разными способами (аудит, §2.3).
 *
 * ЗАЧЕМ ЗАЩИТА ОТ ДВОЙНОГО СОБЫТИЯ. `beforeprint` приходит дважды: от
 * собственного вызова `window.print()` и от системного диалога печати. Без
 * проверки второе событие кладёт в резерв уже подменённый заголовок, и после
 * печати имя вкладки навсегда остаётся именем документа. В Назначениях этот
 * баг уже ловили и чинили, в Конгрессах такой защиты не было — здесь она одна
 * на всех.
 *
 * `self` вместо `window` — файл единообразен с остальным общим слоем.
 */
(function (global) {
  'use strict';

  /* ═══ Печать отдельного документа ═══════════════════════════════════════ */

  /**
   * Базовая типографика бумаги. Сведена из двух совпадавших копий, значения
   * не менялись ни на единицу — задача выноса в общий слой была снять дубль,
   * а не переверстать готовые письма.
   *
   * Поля живут на `body`, а не в `@page`, и при печати обнуляются. Это не
   * случайность: на экране предпросмотра отступы показывают поля листа, а на
   * бумаге их задаёт сам браузер из настроек печати. Меняя это, проверять
   * ОБА состояния — окно и PDF.
   */
  var BASE_CSS = [
    '*{box-sizing:border-box}',
    'body{font:13.5px/1.62 Georgia,"Times New Roman",serif;color:#16251d;margin:28mm 20mm}',
    'h1{font-size:16px;margin:0 0 18px}',
    'pre{font:inherit;white-space:pre-wrap}',
    /* Разрыв страницы между вложениями письма. Нулевая высота — элемент
       служебный и на экране не должен занимать места. */
    '.pb{page-break-before:always;height:0}',
    '@media print{body{margin:0}}',
  ].join('');

  /**
   * Поля бумаги. ЗАЧЕМ ЭТО ЗДЕСЬ, А НЕ ОТДАНО БРАУЗЕРУ.
   *
   * До 15.08.2026 поля объявлялись только на `body` и при печати обнулялись —
   * то есть на бумаге их задавал диалог печати. Предпросмотр показывал одни
   * поля, печаталось другое, а при выборе «поля: нет» текст письма прижимался
   * к краю листа. Теперь их объявляет сам документ, и окно предпросмотра
   * совпадает с бумагой.
   *
   * Значение равно полям `body` намеренно — именно их пользователь видит в
   * окне перед печатью.
   *
   * ПОЧЕМУ НЕ `@page{margin:0}` С СОХРАНЁННЫМИ ПОЛЯМИ `body`. Такой вариант
   * держал бы поля даже при явном «поля: нет», но колонтитулы браузера (дата,
   * адрес, номер страницы) рисуются именно в области полей страницы — при
   * нулевом `@page` они легли бы поверх текста.
   */
  var DEFAULT_MARGIN = '28mm 20mm';

  /** Собирает правило `@page`. Поля есть всегда; размер — только если попросили. */
  function pageRule(page) {
    var p = page || {};
    var parts = [];
    if (p.size) parts.push('size:' + p.size);
    parts.push('margin:' + (p.margin || DEFAULT_MARGIN));
    return '@media print{@page{' + parts.join(';') + '}}';
  }

  function escapeText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Язык изолированной страницы. Влияет на переносы слов и на подстановку
   *  недостающих глифов — оба композера его теряли, задавая голое `<html>`. */
  function resolveLang(explicit) {
    if (explicit) return explicit;
    try {
      if (global.CWDocLang && typeof global.CWDocLang.get === 'function') {
        var d = global.CWDocLang.get();
        if (d) return d;
      }
    } catch (_) {}
    try {
      /* Именно `getLang`. Голого `lang()` у CWI18n нет — на этом уже
         спотыкались 13.08.2026 («CWI18n.lang is not a function»). */
      if (global.CWI18n && typeof global.CWI18n.getLang === 'function') {
        var i = global.CWI18n.getLang();
        if (i) return i;
      }
    } catch (_) {}
    return document.documentElement.getAttribute('lang') || 'ru';
  }

  /**
   * Открыть изолированное окно с документом и отправить его на печать.
   *
   * @param {object}   opts
   * @param {string}   opts.title    заголовок окна; из него браузер берёт имя PDF
   * @param {string}   opts.html     тело документа (уже готовый HTML)
   * @param {string}  [opts.lang]    язык страницы; по умолчанию язык документа
   * @param {string}  [opts.css]     дополнительный CSS поверх базового
   * @param {object}  [opts.page]    { size, margin } → правило `@page`
   * @param {Function}[opts.onBlocked] вызывается, если окно заблокировано
   * @returns {boolean} удалось ли открыть окно
   */
  function printDocument(opts) {
    var o = opts || {};
    var win = null;
    try { win = global.open('', '_blank'); } catch (_) {}
    if (!win) {
      if (typeof o.onBlocked === 'function') o.onBlocked();
      return false;
    }

    var css = BASE_CSS + pageRule(o.page) + (o.css || '');
    var html = '<!DOCTYPE html><html lang="' + escapeText(resolveLang(o.lang)) + '">'
      + '<head><meta charset="utf-8">'
      + '<title>' + escapeText(o.title) + '</title>'
      + '<style>' + css + '</style></head>'
      + '<body>' + (o.html || '') + '</body></html>';

    /* `document.open()` перед записью: запись в уже загруженный документ без
       него формально некорректна. Из трёх прежних реализаций его звала одна. */
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();

    /* См. шапку файла: задержка проверена, `onload` — отдельная задача. */
    setTimeout(function () {
      try { win.print(); } catch (_) {}
    }, 250);

    return true;
  }

  /* ═══ Имя файла при печати самой страницы ═══════════════════════════════ */

  var resolver = null;    // постоянный: зовётся на каждый beforeprint
  var once = null;        // разовый: действует на ближайшую печать
  var backup = null;      // прежний document.title; null = печать не идёт
  var bound = false;

  function onBeforePrint() {
    var name = once;
    if (name == null && typeof resolver === 'function') {
      try { name = resolver(); } catch (_) { name = null; }
    }
    if (!name) return;
    /* Событие приходит дважды — от своего window.print() и от системного
       диалога. Без этой проверки во второй раз в резерв попадёт уже
       подменённый заголовок, и вкладка навсегда останется названной
       документом. */
    if (backup === null) backup = document.title;
    document.title = String(name);
  }

  function onAfterPrint() {
    once = null;
    if (backup === null) return;
    document.title = backup;
    backup = null;
  }

  function bind() {
    if (bound) return;
    bound = true;
    global.addEventListener('beforeprint', onBeforePrint);
    global.addEventListener('afterprint', onAfterPrint);
  }

  /**
   * Задать имя файла для печати страницы.
   *
   * Строка — на ближайшую печать (так печатают Конгрессы: имя известно в
   * момент вызова). Функция — постоянный источник, вызывается на каждый
   * `beforeprint` (так печатают Назначения: имя собирается из текущего
   * состава письма и меняется, пока пользователь правит форму). Функция может
   * вернуть пустое значение — тогда заголовок не подменяется.
   *
   * @param {string|Function|null} nameOrFn
   */
  function filename(nameOrFn) {
    bind();
    if (typeof nameOrFn === 'function') resolver = nameOrFn;
    else once = nameOrFn || null;
  }

  global.CWPrint = {
    document: printDocument,
    filename: filename,
    /** Только для проверок: базовая типографика бумаги. */
    baseCss: BASE_CSS,
  };
})(typeof self !== 'undefined' ? self : this);
