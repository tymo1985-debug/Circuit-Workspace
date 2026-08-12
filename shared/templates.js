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

  global.CWTemplates = CWTemplates;
})(typeof self !== 'undefined' ? self : this);
