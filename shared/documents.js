/**
 * Circuit Workspace — shared/documents.js
 * Архив выданных документов. Единственная точка входа к хранилищу
 * `CWDB.documents`; модули не обращаются к нему напрямую.
 *
 * ЧТО ЗДЕСЬ ЛЕЖИТ И ЧЕГО НЕ ЛЕЖИТ. Снимок пишется только тогда, когда документ
 * ПОКИНУЛ приложение: печать, выгрузка PDF, отправка письма — либо по явной
 * кнопке «сохранить». Предпросмотр и правка черновика не сохраняются: иначе
 * список забивается почти одинаковыми записями и перестаёт быть полезным.
 * Черновик остаётся на самой сущности (`entry.emailBody` в Клиндарии) — он
 * принадлежит визиту, а не архиву.
 *
 * ТЕКСТ ХРАНИТСЯ ПОДСТАВЛЕННЫМ, а не шаблоном. Это и есть смысл архива: шаблон
 * потом правят, письмо, которое уже ушло людям, измениться не должно. По той же
 * причине снимок не пересобирается при чтении.
 *
 * ЧЕГО В МОДЕЛИ НЕТ НАМЕРЕННО: названий собраний, имён участников, дат визита
 * отдельными полями. Только `ref` на сущность-владельца и `data` — слепок
 * входа движка. Второй копии справочников архив не заводит (правило из
 * docs/documents/00-proposal.md, раздел 7).
 *
 * ПОВТОРНАЯ ВЫДАЧА НЕ ПЛОДИТ ЗАПИСИ. Три нажатия «Печать» подряд — это одно
 * письмо, напечатанное трижды, а не три письма. Совпал текст (шаблон, язык,
 * тема, тело, страницы) с последним снимком той же сущности — обновляем
 * счётчик и время, а не создаём запись. Момент первой выдачи при этом
 * сохраняется: `createdAt` не двигается никогда.
 *
 * УДАЛЕНИЕ СУЩНОСТИ НЕ УДАЛЯЕТ СНИМКИ. Визит можно стереть из календаря, но
 * письмо к нему уже существует в мире. Осиротевшая запись остаётся и в списке
 * помечается как относящаяся к удалённой сущности; убрать её можно только
 * руками.
 *
 * `self` вместо `window` — файл можно подключать и через importScripts().
 */
(function (global) {
  'use strict';

  /** Ключ сущности-владельца. Один формат на запись и на выборку. */
  function refKey(ref) {
    if (!ref) return '';
    return [ref.module || '', ref.entity || '', ref.id || ''].join(':');
  }

  function db() {
    return global.CWDB && global.CWDB.documents ? global.CWDB.documents : null;
  }

  /* Сравниваем именно то, что увидит получатель. Служебные поля (`reason`,
     `data`, версия шаблона) в сравнение не входят: перепечатка того же письма
     после правки справочника — всё ещё та же бумага. */
  function sameContent(a, b) {
    if (!a || !b) return false;
    if ((a.templateId || '') !== (b.templateId || '')) return false;
    if ((a.lang || '') !== (b.lang || '')) return false;
    if ((a.subject || '') !== (b.subject || '')) return false;
    if ((a.body || '') !== (b.body || '')) return false;
    return pagesText(a.pages) === pagesText(b.pages);
  }

  function pagesText(pages) {
    return (pages || []).map(function (p) {
      return String(p.title || '') + '\u0000' + String(p.html || p.body || '');
    }).join('\u0001');
  }

  function byNewest(a, b) {
    return String(b.lastAt || b.createdAt || '').localeCompare(String(a.lastAt || a.createdAt || ''));
  }

  var CWDocs = {
    /** Доступно ли хранилище. Без общей базы архив просто не ведётся. */
    available: function () { return !!db(); },

    refKey: refKey,

    /**
     * Записать снимок документа.
     *
     * @param {Object} input
     *   {string} input.templateId    — id шаблона, из которого собран документ
     *   {string} [input.context]     — контекст шаблона: по нему интерфейс
     *                                  определяет вид документа, не заводя
     *                                  своей таблицы соответствий
     *   {string} input.title         — человеческое имя документа для списка
     *   {string} input.lang          — фактически использованный язык
     *   {string} input.format        — 'text' | 'html'
     *   {string} [input.subject]
     *   {string} input.body          — ГОТОВЫЙ текст, подстановка выполнена
     *   {Array}  [input.pages]
     *   {Object} input.ref           — { module, entity, id }
     *   {string} [input.entityTitle] — подпись сущности на момент выдачи
     *   {Object} [input.data]        — слепок входа движка
     *   {string} [input.reason]      — 'print' | 'send' | 'manual'
     * @returns {Promise<Object|null>} записанный снимок, либо null без базы
     */
    save: function (input) {
      var store = db();
      if (!store || !input) return Promise.resolve(null);
      var ref = input.ref || {};
      var key = refKey(ref);
      var now = new Date().toISOString();
      var reason = input.reason || 'manual';
      var draft = {
        templateId: input.templateId || '',
        context: input.context || '',
        templateUpdatedAt: input.templateUpdatedAt || null,
        title: input.title || '',
        lang: input.lang || '',
        format: input.format || 'text',
        subject: input.subject || null,
        body: input.body || '',
        pages: input.pages || [],
      };

      return store.byIndex('entityKey', key).then(function (rows) {
        /* Сравнивать нужно с последним снимком ТОГО ЖЕ документа, а не с
           последним снимком сущности вообще. Первая версия брала просто самую
           свежую запись визита — и повторная выдача письма после снимка e-mail
           создавала дубль письма, потому что «последним» оказывался e-mail.
           Поймано живым прогоном 13.08.2026. */
        var same = (rows || []).filter(function (row) {
          return (row.templateId || '') === draft.templateId;
        });
        var last = same.sort(byNewest)[0];
        if (last && sameContent(last, draft)) {
          /* Та же бумага, выданная ещё раз. Причину дописываем к списку —
             «напечатал, потом отправил» это одна и та же бумага, но знать об
             обоих событиях полезно. */
          var reasons = (last.reasons || [last.reason]).filter(Boolean);
          if (reasons.indexOf(reason) < 0) reasons.push(reason);
          var patch = {
            reasons: reasons,
            reason: reason,
            count: (last.count || 1) + 1,
            lastAt: now,
            entityTitle: input.entityTitle || last.entityTitle || '',
          };
          return global.CWDB.documents.update(last.id, patch);
        }
        var record = {
          templateId: draft.templateId,
          context: draft.context,
          templateUpdatedAt: draft.templateUpdatedAt,
          title: draft.title,
          lang: draft.lang,
          format: draft.format,
          subject: draft.subject,
          body: draft.body,
          pages: draft.pages,
          ref: { module: ref.module || '', entity: ref.entity || '', id: ref.id || '' },
          entityKey: key,
          module: ref.module || '',
          entityTitle: input.entityTitle || '',
          data: input.data || null,
          reason: reason,
          reasons: [reason],
          count: 1,
          createdAt: now,
          lastAt: now,
        };
        return store.add(record).then(function (id) {
          record.id = id;
          return record;
        });
      }).catch(function (error) {
        /* Отказ архива не должен мешать выдаче документа: письмо уже собрано и
           уходит адресату. Сообщаем в консоль и продолжаем. */
        console.error('CWDocs: не удалось записать снимок документа', error);
        return null;
      });
    },

    /** История одной сущности, свежие сверху. */
    list: function (ref) {
      var store = db();
      if (!store) return Promise.resolve([]);
      return store.byIndex('entityKey', refKey(ref)).then(function (rows) {
        return (rows || []).sort(byNewest);
      }).catch(function (error) {
        console.error('CWDocs: не удалось прочитать историю документов', error);
        return [];
      });
    },

    /**
     * Весь архив, свежие сверху.
     * @param {Object} [opts] — { module, limit }
     */
    listAll: function (opts) {
      var store = db();
      if (!store) return Promise.resolve([]);
      opts = opts || {};
      var read = opts.module
        ? store.byIndex('module', opts.module)
        : store.getAll();
      return read.then(function (rows) {
        var list = (rows || []).sort(byNewest);
        return opts.limit ? list.slice(0, opts.limit) : list;
      }).catch(function (error) {
        console.error('CWDocs: не удалось прочитать архив документов', error);
        return [];
      });
    },

    /** Сколько документов выдано по этой сущности. */
    count: function (ref) {
      return CWDocs.list(ref).then(function (rows) { return rows.length; });
    },

    get: function (id) {
      var store = db();
      return store ? store.get(id) : Promise.resolve(null);
    },

    /** Удалить снимок. Единственный способ убрать запись из архива. */
    remove: function (id) {
      var store = db();
      return store ? store.remove(id) : Promise.resolve();
    },
  };

  global.CWDocs = CWDocs;
})(typeof self !== 'undefined' ? self : this);
