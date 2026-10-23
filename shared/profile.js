/**
 * Circuit Workspace — shared/profile.js
 * Профиль человека, общий для всего приложения (решение Алекса 23.10.2026,
 * фаза 4 общих настроек): имена для формуляра визита, дом для маршрутов,
 * способ отправки почты. Правится только в хабе («Настройки» → «Профиль»),
 * модули читают.
 *
 * ОТДЕЛЬНО ОТ ОТПРАВИТЕЛЯ. `shared:sender` — шапка документа (6 полей) и не
 * меняется; здесь — то, что шапкой не является. Одна запись `shared:profile`
 * в хранилище `state` общей базы, тот же движок, что у отправителя
 * (`CWRecord` из shared/sender.js): ревизии, отказ соседней вкладке, режим
 * только для чтения, adopt().
 *
 * ПОДКЛЮЧЕНИЕ: после shared/db.js, shared/state.js и shared/sender.js —
 * движок записи живёт в последнем. Без него профиль не создаётся, и
 * потребитель обязан пережить отсутствие `CWProfile` (Клиндарий читает свои
 * прежние настройки).
 *
 * ПОЛЯ:
 *   overseerName, wifeName — имена в формуляре визита (пусто → имя отправителя);
 *   homeAddress — дом текстом; homeLat/homeLng — его координаты (числа или
 *     null), homePlace — найденное место (для показа);
 *   mailMethod — '' | 'mailto' | 'owa' (пусто = почтовая программа);
 *   owaUrl — ссылка OWA (пусто = стандартная).
 *
 * ПРЕЖНЕГО КЛЮЧА НЕТ: значения приходят из настроек Клиндария через adopt()
 * при первом его запуске; сами настройки Клиндария при этом не удаляются.
 */
(function (global) {
  'use strict';
  if (!global.CWRecord || typeof global.CWRecord.create !== 'function') return;

  var CWProfile = global.CWRecord.create({
    stateId: 'shared:profile',
    legacyKey: null,
    fields: ['overseerName', 'wifeName', 'homeAddress', 'homeLat', 'homeLng', 'homePlace', 'mailMethod', 'owaUrl'],
    types: { homeLat: 'number', homeLng: 'number' },
    name: 'CWProfile',
  });

  /** Стандартная ссылка OWA для нового письма. */
  CWProfile.OWA_DEFAULT = 'https://outlook.office.com/mail/deeplink/compose';

  global.CWProfile = CWProfile;
})(typeof self !== 'undefined' ? self : this);
