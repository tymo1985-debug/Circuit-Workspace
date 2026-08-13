/**
 * Документы — словарь модуля.
 *
 * ГРАНИЦА: здесь переводится только интерфейс. Тексты самих документов —
 * писем, памяток, обращений — живут в общем слое (`shared/templates/builtin.js`
 * и `CWDB.templates`) и к этому файлу отношения не имеют. Язык интерфейса и
 * язык документа независимы: секретарь может работать в польском интерфейсе и
 * править украинское письмо.
 *
 * ⚠️ ЗАПОЛНЕНА ТОЛЬКО РУССКАЯ КОЛОНКА. Остальные четыре языка ждут носителя —
 * тот же порядок, что в Школе пионеров. Пустая строка НЕ ломает интерфейс:
 * `CWI18n.t()` берёт русский запасной вариант (см. `lookup(key, active) ||
 * lookup(key, FALLBACK)` в shared/i18n.js), поэтому до перевода модуль честно
 * говорит по-русски вместо того, чтобы показывать ключи.
 *
 * КАК ПЕРЕВОДИТЬ: заполнить пустые строки в блоке нужного языка, ничего не
 * переставляя. Ключи и порядок трогать не нужно.
 *
 * Название и описание модуля здесь отсутствуют намеренно: они лежат в
 * shared/i18n/common.js под ключами module.documents.title/desc — одно место
 * и для плитки хаба, и для шапки модуля.
 */
(function (global) {
  'use strict';

  if (!global.CWI18n) {
    console.error('documents/i18n/dict.js подключён раньше shared/i18n.js');
    return;
  }

  var KEYS = [
    'doc.search_label',
    'doc.doclang_label',
    'doc.filters_label',
    'doc.filter_all',
    'doc.filter_custom',
    'doc.badge_system',
    'doc.badge_custom',
    'doc.kind_letter',
    'doc.kind.letter',
    'doc.kind.email',
    'doc.kind.salutation',
    'doc.extra_pages',
    'doc.nothing_found',
    'doc.loading',
    'doc.storage_failed',
    'doc.back_to_list',
    'doc.restore_original',
    'doc.save',
    'doc.tab_text',
    'doc.tab_preview',
    'doc.tab_pages',
    'doc.preview_hint',
    'doc.pages_hint',
    'doc.add_page',
    'doc.no_pages',
    'doc.page_n',
    'doc.page_title_placeholder',
    'doc.delete_page',
    'doc.variables',
    'doc.variables_hint',
    'doc.was_named',
    'doc.lang_columns_label',
    'doc.lang_empty',
    'doc.pending_with_fallback',
    'doc.pending_empty',
    'doc.confirm_restore',
    'doc.confirm_leave',
    'doc.confirm_delete_page',
    'doc.status_unsaved',
    'doc.status_saving',
    'doc.status_saved',
    'doc.status_save_failed',
    'doc.status_restored',
    'doc.name.congress_invitation',
    'doc.name.visit_letter_congregation',
    'doc.name.visit_letter_group',
    'doc.name.visit_letter_pregroup',
    'doc.name.visit_email_congregation',
    'doc.name.visit_email_group',
    'doc.name.visit_email_pregroup',
    'doc.name.visit_salutation_congregation',
    'doc.name.visit_salutation_group',
    'doc.name.visit_salutation_pregroup',
  ];

  /** Пустая колонка языка: те же ключи, пустые значения — заготовка для носителя. */
  function blank() {
    var out = {};
    KEYS.forEach(function (key) { out[key] = ''; });
    return out;
  }

  global.CWI18n.register({
    ru: {
      'doc.search_label': 'Поиск по названию и тексту',
      'doc.doclang_label': 'Язык документа',
      'doc.filters_label': 'Фильтр по модулю',
      'doc.filter_all': 'Все',
      'doc.filter_custom': 'Изменённые',
      'doc.badge_system': 'системный',
      'doc.badge_custom': 'изменён',
      'doc.kind_letter': 'Письмо',
      'doc.kind.letter': 'Письмо',
      'doc.kind.email': 'Тело письма',
      'doc.kind.salutation': 'Обращение',
      'doc.extra_pages': 'ещё {n} стр.',
      'doc.nothing_found': 'Ничего не найдено.',
      'doc.loading': 'Загружаем документы…',
      'doc.storage_failed': 'Не удалось открыть хранилище документов. Правки могут быть не видны — перезагрузите страницу.',
      'doc.back_to_list': 'К списку',
      'doc.restore_original': 'Восстановить оригинал',
      'doc.save': 'Сохранить',
      'doc.tab_text': 'Текст',
      'doc.tab_preview': 'Предпросмотр',
      'doc.tab_pages': 'Страницы',
      'doc.preview_hint': 'Переменные подставлены примерами значений — так документ будет выглядеть в готовом виде.',
      'doc.pages_hint': 'Дополнительные страницы печатаются после основного текста. У письма перед визитом это памятка координатору.',
      'doc.add_page': 'Добавить страницу',
      'doc.no_pages': 'Дополнительных страниц нет.',
      'doc.page_n': 'Страница {n}',
      'doc.page_title_placeholder': 'Заголовок страницы',
      'doc.delete_page': 'Удалить',
      'doc.variables': 'Переменные',
      'doc.variables_hint': 'Нажмите, чтобы вставить в текст.',
      'doc.was_named': 'раньше: {name}',
      'doc.lang_columns_label': 'Языковые версии документа',
      'doc.lang_empty': 'перевода нет',
      'doc.pending_with_fallback': 'Перевода на этот язык нет. Пока он пуст, документ печатается на {lang}.',
      'doc.pending_empty': 'Текста пока нет ни на одном языке.',
      'doc.confirm_restore': 'Вернуть системный текст? Ваша версия будет удалена.',
      'doc.confirm_leave': 'Изменения не сохранены. Уйти и потерять их?',
      'doc.confirm_delete_page': 'Удалить эту страницу?',
      'doc.status_unsaved': 'есть несохранённые изменения',
      'doc.status_saving': 'сохраняем…',
      'doc.status_saved': 'сохранено',
      'doc.status_save_failed': 'не удалось сохранить',
      'doc.status_restored': 'восстановлен оригинал',
      'doc.name.congress_invitation': 'Приглашение к участию в задании',
      'doc.name.visit_letter_congregation': 'Письмо перед визитом к собранию',
      'doc.name.visit_letter_group': 'Письмо перед визитом к группе',
      'doc.name.visit_letter_pregroup': 'Письмо перед визитом к предгруппе',
      'doc.name.visit_email_congregation': 'Тело сопроводительного письма (собрание)',
      'doc.name.visit_email_group': 'Тело сопроводительного письма (группа)',
      'doc.name.visit_email_pregroup': 'Тело сопроводительного письма (предгруппа)',
      'doc.name.visit_salutation_congregation': 'Обращение в шапке письма (собрание)',
      'doc.name.visit_salutation_group': 'Обращение в шапке письма (группа)',
      'doc.name.visit_salutation_pregroup': 'Обращение в шапке письма (предгруппа)',
    },

    /* ↓ Ждут носителей языка. Заполнять значения, ключи не трогать. */
    uk: blank(),
    en: blank(),
    pl: blank(),
    de: blank(),
  });
})(typeof self !== 'undefined' ? self : this);
