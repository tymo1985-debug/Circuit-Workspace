/**
 * Circuit Workspace — shared/templates.js
 * Движок подстановки переменных в шаблоны документов. Единственное место, где
 * в проекте выполняется `шаблон + данные → текст`.
 *
 * ЧТО ЭТО ЗАМЕНИЛО. Два независимых механизма, делавших одно и то же:
 *   congress-project/js/letters.js — `Object.keys(v).forEach(k => tpl.split(k).join(...))`
 *   circuit-planner/app.js         — `substitutePlaceholders()` с цепочкой .replace()
 * Каждый со своим синтаксисом (`{{camelCase}}` против `{snake_case}`) и своим
 * списком доступных переменных. Реестр переменных теперь один —
 * shared/templates/namespaces.js, синтаксис один — `{{namespace.field}}`,
 * а старые имена продолжают работать через алиасы (бессрочно, см. реестр).
 *
 * ЭТО ФАЗА 1: движок и только движок. Хранилище шаблонов не трогается — тексты
 * по-прежнему лежат в настройках модулей. Перенос в CWDB — фаза 2,
 * docs/documents/00-proposal.md.
 *
 * ── Три правила, от которых зависит корректность документов ──────────────
 *
 * 1. НЕИЗВЕСТНЫЙ ПЛЕЙСХОЛДЕР ОСТАЁТСЯ В ТЕКСТЕ ВИДИМЫМ, а не превращается в
 *    пустую строку. Пустое место вместо даты в готовом письме — ошибка,
 *    которую замечают на бумаге у собрания; `{{visit.startDate}}` в том же
 *    месте видно ещё в предпросмотре. Так же вела себя и прежняя реализация
 *    Конгрессов, и это поведение сохранено намеренно.
 *
 * 2. ИЗВЕСТНЫЙ ПЛЕЙСХОЛДЕР ПОДСТАВЛЯЕТСЯ ВСЕГДА, даже пустым значением —
 *    иначе шаблон с необязательным полем (второй телефон, примечание) печатал
 *    бы `{{sender.phone2}}` в готовом письме. «Известный» = пространство имён
 *    передано модулем в `data`. Именно поэтому Конгрессы не подставляют
 *    `{{visit.*}}`, а Клиндарий — `{{assignment.*}}`: чужое пространство не
 *    передано, значит плейсхолдер не наш и остаётся видимым.
 *
 * 3. ОДИН ПРОХОД. Значение, подставленное в текст, дальше не сканируется.
 *    Прежняя цепочка `.replace()` в Клиндарии этим свойством не обладала:
 *    название собрания, содержащее `{today}`, подменялось на следующем шаге.
 *    Данные не должны исполняться как шаблон.
 *
 * ── Экранирование ───────────────────────────────────────────────────────
 * Движок НЕ экранирует значения. Клиндарий подставляет в HTML (шаблон пришёл
 * из RTE), Конгрессы — в plain text, который экранируется позже целиком, при
 * рендере абзацев. Экранировать здесь — значит показать `&amp;` в письме
 * Конгрессов. Разделение форматов (`format: 'text' | 'html'`) и безопасная
 * подстановка в HTML — задача фазы 2, где у шаблона появится это поле.
 *
 * ЗАВИСИМОСТИ: shared/templates/namespaces.js обязателен, shared/sender.js —
 * желателен (иначе `sender.*` придётся передавать модулю самому).
 *
 * `self` вместо `window` — файл можно безопасно подключать и через
 * importScripts() в service worker'е, как shared/version.js.
 */
(function (global) {
  'use strict';

  /* `{{ ns.field }}` (пробелы допускаются) либо старая одинарная форма
     `{snake_case}`. Одинарная намеренно узкая: только строчные буквы, цифры и
     подчёркивание — чтобы обычная фигурная скобка в тексте письма и любые
     конструкции вида `{Имя}` не считались плейсхолдером. */
  var TOKEN = /\{\{\s*([A-Za-z][\w]*(?:\.[A-Za-z][\w]*)?)\s*\}\}|\{([a-z][a-z0-9_]*)\}/g;

  var aliasMap = null;   // 'senderName' → { ns:'sender', field:'name' }
  var fieldSet = null;   // 'sender.name' → true

  function registry() {
    return global.CW_TEMPLATE_NAMESPACES || {};
  }

  /* Индексы строятся один раз и лениво: реестр статичен, а модули дёргают
     render() десятки раз за отрисовку списка писем. */
  function buildIndex() {
    if (aliasMap && fieldSet) return;
    aliasMap = {};
    fieldSet = {};
    var ns = registry();
    Object.keys(ns).forEach(function (nsName) {
      var fields = (ns[nsName] && ns[nsName].fields) || {};
      Object.keys(fields).forEach(function (field) {
        fieldSet[nsName + '.' + field] = true;
        (fields[field].aliases || []).forEach(function (alias) {
          /* Коллизия алиасов означала бы, что одно старое имя ведёт в два
             разных поля — молча победило бы последнее, и чьи-то письма стали
             бы подставлять не то. Лучше шумно в консоль, чем тихо в бумагу. */
          if (aliasMap[alias]) {
            console.warn('CWTemplates: алиас «' + alias + '» объявлен дважды: '
              + aliasMap[alias].ns + '.' + aliasMap[alias].field
              + ' и ' + nsName + '.' + field);
          }
          aliasMap[alias] = { ns: nsName, field: field };
        });
      });
    });
  }

  /** Имя из шаблона → каноническое поле реестра, либо null. */
  function resolve(name) {
    buildIndex();
    if (name.indexOf('.') > 0) {
      if (!fieldSet[name]) return null;
      var parts = name.split('.');
      return { ns: parts[0], field: parts[1] };
    }
    return aliasMap[name] || null;
  }

  /* Данные отправителя — общие для всей экосистемы, тянуть их через каждый
     вызов render() модулю незачем. Значения модуля при этом приоритетнее:
     он может знать больше (например, подставлять другого отправителя). */
  function withDefaults(data) {
    var out = {};
    Object.keys(data || {}).forEach(function (k) { out[k] = data[k]; });

    if (global.CWSender) {
      var shared = global.CWSender.get();
      var own = out.sender || {};
      var merged = {};
      Object.keys(shared).forEach(function (k) { merged[k] = shared[k]; });
      Object.keys(own).forEach(function (k) {
        if (own[k] !== undefined && own[k] !== null) merged[k] = own[k];
      });
      out.sender = merged;
    }

    /* Копия, а не ссылка: движок не имеет права дописывать поля в объект,
       который ему передал модуль. */
    var doc = {};
    Object.keys(out.doc || {}).forEach(function (k) { doc[k] = out.doc[k]; });
    if (doc.today === undefined) {
      /* Локаль здесь намеренно не задана: формат даты — свойство документа,
         его знает модуль. Это лишь запасной вариант, чтобы `{{doc.today}}` в
         пользовательском шаблоне не остался неподставленным. */
      doc.today = new Date().toLocaleDateString();
    }
    if (doc.lang === undefined && global.CWDocLang) doc.lang = global.CWDocLang.get();
    out.doc = doc;

    return out;
  }

  var CWTemplates = {
    /**
     * Подставить данные в шаблон.
     *
     * @param {string} template — текст или HTML с плейсхолдерами
     * @param {Object} data — вложенный объект: { congregation:{…}, visit:{…} }.
     *   Модуль ОБЯЗАН привести свои данные к именам реестра сам: движок не
     *   знает про `entry`, `task`, `student` и знать не должен.
     * @returns {string}
     */
    render: function (template, data) {
      if (template === null || template === undefined) return '';
      var values = withDefaults(data);

      return String(template).replace(TOKEN, function (match, dotted, legacy) {
        var target = resolve(dotted || legacy);
        if (!target) return match;                      // правило 1
        var bag = values[target.ns];
        if (!bag) return match;                          // правило 1: чужое пространство
        var value = bag[target.field];
        if (value === undefined || value === null) return '';  // правило 2
        return String(value);
      });
    },

    /**
     * Список переменных для панели вставки.
     * @param {string[]} [namespaces] — какие пространства показывать; по
     *   умолчанию все. Модуль перечисляет те, что реально передаёт в render().
     * @returns {Array<{ns, field, token, aliases, example}>}
     *
     * Старое написание переменной движок НЕ форматирует: в Конгрессах оно было
     * `{{senderName}}`, в Клиндарии — `{congregation}`, и одно и то же поле
     * `sender.name` писалось в этих модулях по-разному. Как показать прежнее
     * имя своему пользователю, знает только сам модуль — он и решает, из
     * массива `aliases`.
     */
    tokens: function (namespaces) {
      var ns = registry();
      var names = namespaces && namespaces.length ? namespaces : Object.keys(ns);
      var out = [];
      names.forEach(function (nsName) {
        var fields = (ns[nsName] && ns[nsName].fields) || {};
        Object.keys(fields).forEach(function (field) {
          var aliases = fields[field].aliases || [];
          out.push({
            ns: nsName,
            field: field,
            token: '{{' + nsName + '.' + field + '}}',
            aliases: aliases.slice(),
            example: fields[field].example || '',
          });
        });
      });
      return out;
    },

    /** Каноническое имя для старого — для однократной нормализации в фазе 2. */
    canonical: function (name) {
      var target = resolve(String(name || '').replace(/^\{+|\}+$/g, '').trim());
      return target ? target.ns + '.' + target.field : null;
    },
  };

  /* ══════════════════════════════════════════════════════════════════════
     ХРАНИЛИЩЕ ШАБЛОНОВ (фаза 2, 12.08.2026)

     Системные тексты — в коде (shared/templates/builtin.js). Правки
     пользователя — в `CWDB.templates` под ТЕМ ЖЕ `id`. Отсутствие записи
     означает «не правил», и тогда действует системный текст; поэтому
     «восстановить оригинал» — это удаление записи, а не перезапись.

     ПОЧЕМУ API СИНХРОННЫЙ, А ЗАГРУЗКА АСИНХРОННАЯ. `letterHTML()` в Конгрессах
     синхронна, её зовут из обработчиков кликов и из печати. Сделать её
     асинхронной — значит переписать половину модуля и получить мигание при
     печати. Поэтому всё хранилище один раз вычитывается в память при `init()`
     (шаблонов десятки, не тысячи), а дальше чтение синхронное. Тот же приём и
     по той же причине, что в CWSender.

     ⚠️ ОКНО МЕЖДУ ЗАГРУЗКОЙ СТРАНИЦЫ И `init()`. Пока хранилище не прочитано,
     `stored` равен false, и модуль ОБЯЗАН читать свой прежний источник
     (настройки в localStorage). Иначе в эту долю секунды пользователь получил
     бы системное письмо вместо своего, ничего не заметив. Ради этого свойства
     миграция и устроена так, что старые ключи живут до подтверждённого
     переноса, а не удаляются заранее.
     ══════════════════════════════════════════════════════════════════════ */

  var cache = null;      // id → пользовательская запись
  var readyPromise = null;

  function builtins() {
    return global.CW_BUILTIN_TEMPLATES || [];
  }

  function builtinById(id) {
    var list = builtins();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** Слияние системной основы и пользовательской правки в один объект. */
  function effective(id) {
    var base = builtinById(id);
    var own = cache && cache[id];
    if (!base && !own) return null;
    var merged = {};
    Object.keys(base || {}).forEach(function (k) { merged[k] = base[k]; });
    if (!own) { merged.scope = 'system'; merged.custom = false; return merged; }
    Object.keys(own).forEach(function (k) { if (own[k] !== undefined) merged[k] = own[k]; });
    merged.scope = 'user';
    merged.custom = true;
    return merged;
  }

  /* --- Правила выбора языка -------------------------------------------- */
  /**
   * Колонка перевода для запрошенного языка.
   * Пустая колонка — это НЕ ошибка и не пустой документ: это «перевода пока
   * нет». Отдаём первый непустой язык и честно сообщаем об этом флагом
   * `pending`, чтобы интерфейс мог показать пометку, а документ остался
   * читаемым. Тихо вернуть пустое письмо было бы худшим из вариантов.
   */
  function pickTranslation(tpl, lang) {
    if (!tpl || !tpl.translations) return null;
    var tr = tpl.translations;
    var wanted = tr[lang];
    if (wanted && wanted.body) return { lang: lang, entry: wanted, pending: false };
    var langs = Object.keys(tr);
    for (var i = 0; i < langs.length; i++) {
      var entry = tr[langs[i]];
      if (entry && entry.body) return { lang: langs[i], entry: entry, pending: true };
    }
    return null;
  }

  var storage = {
    /** Прочитано ли хранилище. Пока false — модуль читает свой прежний источник. */
    stored: false,

    /**
     * Вычитать пользовательские шаблоны в память. Идемпотентно.
     * @returns {Promise<void>}
     */
    init: function () {
      if (readyPromise) return readyPromise;
      if (!global.CWDB || !global.CWDB.templates) {
        /* Без общей базы работаем на одних системных текстах: это рабочее
           состояние, а не сбой — модуль просто не получит правок. */
        cache = {};
        CWTemplates.stored = true;
        readyPromise = Promise.resolve();
        return readyPromise;
      }
      readyPromise = global.CWDB.templates.getAll().then(function (rows) {
        cache = {};
        (rows || []).forEach(function (row) { if (row && row.id) cache[row.id] = row; });
        CWTemplates.stored = true;
      }).catch(function (e) {
        console.error('CWTemplates: не удалось прочитать хранилище шаблонов', e);
        cache = {};
        /* stored НЕ выставляем: пусть модуль продолжает читать прежний
           источник, это безопаснее, чем подсунуть системный текст вместо
           пользовательского. */
        readyPromise = null;
        throw e;
      });
      return readyPromise;
    },

    /** Промис готовности (или уже разрешённый, если init не звали). */
    ready: function () { return readyPromise || storage.init(); },

    /** Шаблон по id: системный, поверх него — правка пользователя. */
    get: function (id) { return effective(id); },

    /** Шаблон по контексту. Пользовательские записи ищутся первыми. */
    byContext: function (context) {
      if (cache) {
        var ids = Object.keys(cache);
        for (var i = 0; i < ids.length; i++) {
          if (cache[ids[i]].context === context) return effective(ids[i]);
        }
      }
      var list = builtins();
      for (var j = 0; j < list.length; j++) {
        if (list[j].context === context) return effective(list[j].id);
      }
      return null;
    },

    /**
     * Готовый текст шаблона на нужном языке.
     * @returns {{id, subject, body, lang, pending, custom}|null}
     */
    text: function (contextOrId, lang) {
      var tpl = storage.byContext(contextOrId) || effective(contextOrId);
      if (!tpl) return null;
      var picked = pickTranslation(tpl, lang || (global.CWDocLang && global.CWDocLang.get()));
      if (!picked) return null;
      return {
        id: tpl.id,
        subject: picked.entry.subject || null,
        body: picked.entry.body || '',
        lang: picked.lang,
        pending: picked.pending,
        custom: !!tpl.custom,
        format: tpl.format || 'text',
      };
    },

    /** Правил ли пользователь этот шаблон. */
    isCustom: function (id) { return !!(cache && cache[id]); },

    /**
     * Сохранить пользовательскую версию текста на одном языке.
     * @returns {Promise<void>}
     */
    save: function (id, lang, patch) {
      if (!global.CWDB || !global.CWDB.templates) {
        return Promise.reject(new Error('CWTemplates.save: общая база недоступна'));
      }
      var base = builtinById(id);
      var own = (cache && cache[id]) || null;
      var record = {
        id: id,
        context: (own && own.context) || (base && base.context) || id,
        module: (own && own.module) || (base && base.module) || '',
        format: (own && own.format) || (base && base.format) || 'text',
        title: (own && own.title) || (base && base.title) || '',
        scope: 'user',
        baseId: base ? base.id : null,
        translations: {},
        updatedAt: new Date().toISOString(),
      };
      var pages = (own && own.pages) || (base && base.pages);
      if (pages) record.pages = pages;
      var source = (own && own.translations) || {};
      Object.keys(source).forEach(function (k) { record.translations[k] = source[k]; });
      /* Если правки ещё не было, остальные языки берём из системного шаблона:
         иначе сохранение украинской версии обнулило бы немецкую. */
      if (!own && base && base.translations) {
        Object.keys(base.translations).forEach(function (k) {
          if (!record.translations[k]) record.translations[k] = base.translations[k];
        });
      }
      var current = record.translations[lang] || {};
      record.translations[lang] = {
        subject: patch.subject !== undefined ? patch.subject : (current.subject || null),
        body: patch.body !== undefined ? patch.body : (current.body || ''),
      };
      return global.CWDB.templates.put(record).then(function () {
        if (!cache) cache = {};
        cache[id] = record;
      });
    },

    /**
     * Убрать пользовательскую версию — снова действует системный текст.
     * @returns {Promise<void>}
     */
    reset: function (id) {
      if (!cache || !cache[id]) return Promise.resolve();
      if (!global.CWDB || !global.CWDB.templates) {
        return Promise.reject(new Error('CWTemplates.reset: общая база недоступна'));
      }
      return global.CWDB.templates.remove(id).then(function () { delete cache[id]; });
    },

    /**
     * Однократный перенос текста из настроек модуля в общее хранилище.
     *
     * ⚠️ НЕ ПЕРЕЗАПИСЫВАЕТ уже существующую запись. Повторный вызов безвреден —
     * это обязательное свойство: adopt зовётся при каждой загрузке модуля, и
     * второй запуск не должен затирать то, что пользователь успел исправить
     * уже в новом хранилище.
     *
     * @param {string} id
     * @param {Object} record — { context, module, format, title, translations }
     * @returns {Promise<boolean>} перенос выполнен (true) или запись уже была
     */
    adopt: function (id, record) {
      if (cache && cache[id]) return Promise.resolve(false);
      if (!global.CWDB || !global.CWDB.templates) return Promise.resolve(false);
      var payload = {
        id: id,
        context: record.context || id,
        module: record.module || '',
        format: record.format || 'text',
        title: record.title || '',
        scope: 'user',
        baseId: builtinById(id) ? id : null,
        translations: record.translations || {},
        adoptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (record.pages) payload.pages = record.pages;
      return global.CWDB.templates.put(payload).then(function () {
        if (!cache) cache = {};
        cache[id] = payload;
        return true;
      });
    },

    /** Все известные шаблоны (системные + правки) — для будущей библиотеки. */
    all: function () {
      var ids = {};
      builtins().forEach(function (b) { ids[b.id] = true; });
      Object.keys(cache || {}).forEach(function (k) { ids[k] = true; });
      return Object.keys(ids).map(effective).filter(Boolean);
    },
  };

  Object.keys(storage).forEach(function (k) { CWTemplates[k] = storage[k]; });

  global.CWTemplates = CWTemplates;
})(typeof self !== 'undefined' ? self : this);
