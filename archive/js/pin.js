/**
 * Архив — барьер PIN Клиндария (шаг A2, 05.10.2026).
 *
 * PIN не меняется (решение Алекса, docs/db-migration/05-archive-schema.md §7).
 * Пока `localStorage['syp-pin-hash']` задан, раздел Клиндария в Архиве
 * открывается только после ввода того же PIN.
 *
 * ПОЧЕМУ ЗДЕСЬ ЕСТЬ КОПИЯ ФУНКЦИИ ХЭША. Модули — отдельные страницы, `App`
 * Клиндария из Архива не виден, а выносить функцию в `shared/` значило бы
 * править код Клиндария, его PIN и его хранение — вне области этого шага
 * («логика самого модуля не меняется»). Поэтому хэш повторён побайтно, а
 * расхождение стережёт `scripts/check-archive-module.mjs`: он достаёт
 * `pinHash` из `circuit-planner/app.js` и сравнивает результат на наборе PIN.
 * Изменится алгоритм в Клиндарии — гейт покажет, что копия здесь отстала.
 *
 * ЭТО ЛОКАЛЬНЫЙ БАРЬЕР, А НЕ КРИПТОГРАФИЯ (как и у Клиндария): хэш лежит в
 * localStorage открыто, а данные в IndexedDB не зашифрованы. Барьер защищает
 * от взгляда через плечо, не от человека с доступом к устройству.
 *
 * Состояние «открыто» живёт только в памяти страницы: перезагрузка спрашивает
 * PIN снова. Ничего о вводе в хранилище не пишется.
 */
(function (global) {
  'use strict';

  var KEY = 'syp-pin-hash';

  /* Алгоритм Клиндария (circuit-planner/app.js, App.ui.pinHash). */
  function hash(pin) {
    var h = 5381;
    var s = 'syp:' + pin;
    for (var i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h);
  }

  /** Сохранённый хэш или '' — PIN не задан (или localStorage недоступен). */
  function stored() {
    try { return global.localStorage.getItem(KEY) || ''; } catch (_) { return ''; }
  }

  var unlocked = false;

  var ArchivePin = {
    KEY: KEY,
    hash: hash,
    stored: stored,
    /** Задан ли PIN у Клиндария. */
    isSet: function () { return stored() !== ''; },
    /** Закрыт ли сейчас раздел Клиндария: PIN задан и ещё не введён. */
    isLocked: function () { return stored() !== '' && !unlocked; },
    /**
     * Проверить ввод. Пробелы по краям срезаются, как при установке PIN в
     * Клиндарии (`pin.trim()`). Верный ввод открывает раздел до перезагрузки.
     * @returns {boolean}
     */
    unlock: function (input) {
      var want = stored();
      if (!want) return true;
      if (hash(String(input == null ? '' : input).trim()) !== want) return false;
      unlocked = true;
      return true;
    },
    /** Закрыть раздел снова (кнопка «Заблокировать»). */
    lock: function () { unlocked = false; },
  };

  global.ArchivePin = ArchivePin;
})(typeof self !== 'undefined' ? self : this);
