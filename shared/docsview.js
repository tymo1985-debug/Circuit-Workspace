/**
 * Circuit Workspace — shared/docsview.js
 * Показ архива выданных документов: карточка снимка и её обработчики.
 *
 * ЗАЧЕМ. `shared/documents.js` (`CWDocs`) отвечает за ХРАНЕНИЕ снимков, но не
 * за их показ, и к 24.08.2026 один и тот же рендерер карточки существовал в
 * проекте дважды — `App.ui.docCardHtml` в Клиндарии и `docCardHtml` в
 * Документах, — причём копии уже разошлись по вёрстке. Конгрессам и Школе
 * экран архива тоже нужен; без общего слоя копий стало бы четыре.
 *
 * ГРАНИЦА. Здесь только представление одного снимка и стандартные состояния
 * списка (грузится / пусто / ничего не найдено). Ни чтения хранилища, ни
 * группировки, ни фильтров: что именно показывать — решает модуль, потому что
 * у каждого свой отбор (Клиндарий — документы одного визита, Документы — весь
 * архив с группировкой по сущностям, Конгрессы и Школа — свой модуль целиком).
 *
 * ПОДПИСИ берутся из `CWI18n` по ключам `doc.*`, которые с 24.08.2026 живут в
 * `shared/i18n/common.js` — там же, где остальные общие строки. В словарях
 * модулей их дублировать НЕЛЬЗЯ: `check-i18n-dupes.mjs` завалит гейт, и
 * правильно сделает — два места для одной строки расходятся молча.
 *
 * СТИЛИ не задаются: карточка размечена классами `.md-*` общего слоя и
 * `.cwdoc-*`, которые модуль оформляет сам, если хочет. Инлайновых стилей
 * здесь нет намеренно — именно из-за них разошлись прежние две копии.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И НЕ ДОЛЖНО БЫТЬ: удаления снимков без подтверждения. Снимок
 * документа — единственный след того, что бумага ушла людям (см. шапку
 * `shared/documents.js`), поэтому `bind()` всегда спрашивает подтверждение и
 * никакого «тихого» режима не предусматривает.
 */
(function (global) {
  'use strict';

  function t(key, vars) {
    return global.CWI18n ? global.CWI18n.t(key, vars) : key;
  }

  function lang() {
    return global.CWI18n ? global.CWI18n.getLang() : 'ru';
  }

  /* Делегирование в общий слой (28.08.2026). Своя редакция убрана: их было
     шесть, и они расходились — три экранировали апостроф, три нет.
     Обоснование набора символов — в шапке shared/escape.js. */
  function escapeHtml(value) {
    return global.CWEscape.html(value);
  }

  /**
   * Вид документа выводится из контекста шаблона, своей таблицы видов нет:
   * иначе она разошлась бы с реальными контекстами при добавлении шаблона.
   */
  function kindLabel(doc) {
    var ctx = String((doc && (doc.context || doc.templateId)) || '');
    if (/\.email$/.test(ctx)) return t('doc.kind.email');
    if (/\.salutation$/.test(ctx)) return t('doc.kind.salutation');
    return (doc && doc.title) || t('doc.kind.letter');
  }

  /**
   * Причин может быть несколько: «напечатал, потом отправил» — это одна бумага
   * и одна запись, но оба события стоит показать (см. дедупликацию в CWDocs).
   */
  function reasonLabel(doc) {
    var list = (doc.reasons && doc.reasons.length ? doc.reasons : [doc.reason]).filter(Boolean);
    var map = { print: 'doc.reason_print', send: 'doc.reason_send', manual: 'doc.reason_manual' };
    return list.map(function (r) { return t(map[r] || 'doc.reason_manual'); }).join(' · ');
  }

  var CWDocsView = {
    kindLabel: kindLabel,
    reasonLabel: reasonLabel,

    /** Текст снимка для копирования: html разворачиваем в обычный текст. */
    plainText: function (doc) {
      if (!doc) return '';
      if (doc.format !== 'html') return doc.body || '';
      var box = document.createElement('div');
      box.innerHTML = doc.body || '';
      return box.innerText || box.textContent || '';
    },

    /**
     * Разметка одной карточки снимка.
     *
     * @param {Object} doc
     * @param {Object} [opts] — { kindLabel: (doc) => string }
     *
     * `kindLabel` существует ради Клиндария и подобных случаев. Общий слой
     * выводит вид документа из контекста шаблона и отдаёт нейтральные
     * «Тело письма» / «Письмо». Клиндарий знает свои документы точнее и
     * называет их «Текст email-сообщения» и «Письмо перед визитом» — и терять
     * эту точность при переезде на общий слой нельзя: рефакторинг обязан быть
     * визуально нулевым, иначе потом не отличить «изменилось от переноса» от
     * «изменилось от правки». Дублирования это не возвращает: общими остаются
     * разметка, обработчики и остальные семь подписей, своей у модуля —
     * одна строка выбора названия.
     */
    cardHtml: function (doc, opts) {
      if (!doc) return '';
      var kind = (opts && typeof opts.kindLabel === 'function') ? opts.kindLabel(doc) : kindLabel(doc);
      var when = doc.lastAt || doc.createdAt;
      var meta = [
        when ? new Date(when).toLocaleString(lang()) : '',
        reasonLabel(doc),
        String(doc.lang || '').toUpperCase(),
        (doc.count || 1) > 1 ? t('doc.times', { n: doc.count }) : '',
        doc.edited ? t('doc.edited_mark') : '',
      ].filter(Boolean).join(' · ');

      /* html-снимок показываем разметкой: она пришла из собственного редактора
         писем модуля-владельца, а не извне. Текстовый — с сохранением
         переносов, иначе письмо схлопывается в один абзац. */
      var body = doc.format === 'html'
        ? (doc.body || '')
        : '<div class="cwdoc-plain">' + escapeHtml(doc.body || '') + '</div>';

      var pages = (doc.pages || []).map(function (page, i) {
        return '<div class="cwdoc-page"><div class="cwdoc-page__title">'
          + escapeHtml(page.title || t('doc.page_n', { n: i + 2 }))
          + '</div>' + (page.html || '') + '</div>';
      }).join('');

      return '<article class="cwdoc">'
        + '<header class="cwdoc__head"><strong class="cwdoc__kind">' + escapeHtml(kind) + '</strong>'
        + '<span class="cwdoc__meta">' + escapeHtml(meta) + '</span></header>'
        + (doc.subject ? '<p class="cwdoc__subject">' + escapeHtml(doc.subject) + '</p>' : '')
        + '<details class="cwdoc__text"><summary>' + escapeHtml(t('doc.show_text')) + '</summary>'
        + '<div class="cwdoc__body">' + body + pages + '</div></details>'
        + '<div class="cwdoc__actions">'
        + '<button type="button" class="md-btn md-btn-text md-state-layer" data-cwdoc-copy="' + escapeHtml(doc.id) + '">' + escapeHtml(t('doc.copy')) + '</button>'
        + '<button type="button" class="md-btn md-btn-text md-state-layer" data-cwdoc-remove="' + escapeHtml(doc.id) + '">' + escapeHtml(t('doc.delete_doc')) + '</button>'
        + '</div></article>';
    },

    /** Стандартное состояние списка: грузится / пусто / ничего не найдено. */
    stateHtml: function (kind) {
      var map = {
        loading: 'doc.archive_loading',
        empty: 'doc.archive_empty',
        nothing: 'doc.archive_nothing_found',
      };
      return '<div class="md-empty">' + escapeHtml(t(map[kind] || map.empty)) + '</div>';
    },

    /**
     * Обработчики кнопок карточки внутри контейнера.
     *
     * Снимок ищется по id в переданном списке, а НЕ читается из data-атрибута:
     * письмо целиком в атрибуте — это килобайты разметки и потерянные переносы
     * строк, потому что парсер HTML нормализует пробелы в значениях атрибутов.
     * Ошибка была поймана живым прогоном в Клиндарии; повторять её в общем
     * слое не будем.
     *
     * @param {Element} root       контейнер со списком карточек
     * @param {Function} getRows   () => массив снимков, показанных сейчас
     * @param {Object} hooks       { onCopied, onRemoved, confirm }
     * @returns {Function}         отписка
     */
    bind: function (root, getRows, hooks) {
      if (!root) return function () {};
      hooks = hooks || {};
      var confirmFn = hooks.confirm || function (message) { return global.confirm(message); };

      function onClick(event) {
        var copyBtn = event.target.closest('[data-cwdoc-copy]');
        var delBtn = event.target.closest('[data-cwdoc-remove]');
        if (!copyBtn && !delBtn) return;
        var rows = (typeof getRows === 'function' ? getRows() : getRows) || [];
        var id = (copyBtn || delBtn).getAttribute(copyBtn ? 'data-cwdoc-copy' : 'data-cwdoc-remove');
        var doc = rows.filter(function (row) { return String(row.id) === String(id); })[0];
        if (!doc) return;

        if (copyBtn) {
          var plain = CWDocsView.plainText(doc);
          var text = doc.subject ? doc.subject + '\n\n' + plain : plain;
          /* Хук зовётся БЕЗ аргумента и называется `onCopied`, а не `onToast`.
             Первая редакция передавала сюда `t('doc.copy')` — подпись кнопки
             «Копировать», а не сообщение «Скопировано». Пока оба потребителя
             передавали пустышку, ошибка не проявлялась; она вскрылась при
             переносе «Документов» на слой 25.08.2026, где хук впервые
             показывает текст пользователю. Сообщение выбирает модуль: у него
             свой способ уведомления (строка состояния, подпись на кнопке или
             ничего), и общий слой не должен решать это за него. */
          var done = function () { if (hooks.onCopied) hooks.onCopied(); };
          /* Буфер обмена может быть недоступен (нет разрешения, не защищённый
             контекст). Это не повод показывать ошибку: сообщаем как об успехе
             тем же способом, что и модули до общего слоя. */
          if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
            global.navigator.clipboard.writeText(text).then(done, done);
          } else { done(); }
          return;
        }

        if (!confirmFn(t('doc.confirm_delete_doc'))) return;
        if (!global.CWDocs) return;
        global.CWDocs.remove(doc.id).then(function () {
          if (hooks.onRemoved) hooks.onRemoved(doc);
        });
      }

      root.addEventListener('click', onClick);
      return function () { root.removeEventListener('click', onClick); };
    },
  };

  global.CWDocsView = CWDocsView;
})(typeof self !== 'undefined' ? self : this);
