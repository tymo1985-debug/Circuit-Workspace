/**
 * Архив — чистая логика отбора и группировки (без DOM и без базы).
 *
 * Вынесена отдельно, чтобы гейт проверял её без страницы: именно здесь
 * решается, что видно, пока раздел Клиндария закрыт PIN-ом, — а ошибка тут
 * показала бы закрытое.
 *
 * Строки приходят из `CWArchive.list()`: конверты БЕЗ `payload`. Архив
 * payload не читает никогда (см. шапку shared/archive.js).
 */
(function (global) {
  'use strict';

  /* Модуль, чьи конверты закрываются PIN-ом. Единственный: у Конгрессов
     собственного PIN нет и не вводится. */
  var GATED_MODULE = 'circuit-planner';

  /**
   * Что можно показывать при текущем состоянии замка.
   * Закрытые конверты не попадают ни в список, ни в годы, ни в счётчики,
   * ни в поиск: по числу строк тоже можно догадаться о содержимом.
   */
  function visible(rows, locked) {
    return (rows || []).filter(function (r) { return !(locked && r.module === GATED_MODULE); });
  }

  /** Служебные годы по видимым строкам, новые сверху. */
  function yearsOf(rows) {
    var seen = {};
    (rows || []).forEach(function (r) { seen[r.serviceYear] = true; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return b - a; });
  }

  /** Подпись служебного года: 2025 → «2025/2026». */
  function yearLabel(year) {
    return year + '/' + (year + 1);
  }

  /* Весь текст конверта, по которому ищем: заголовок, подписи разделов,
     строки display (дата, название, заметка, метки). Payload сюда не входит. */
  function haystack(row) {
    var parts = [row.title || '', yearLabel(row.serviceYear)];
    var sections = row.display && row.display.sections ? row.display.sections : [];
    sections.forEach(function (sec) {
      parts.push(sec.heading || '');
      (sec.rows || []).forEach(function (r) {
        parts.push(r.date || '', r.title || '', r.note || '');
        (r.tags || []).forEach(function (tag) { parts.push(String(tag)); });
      });
    });
    return parts.join('\n').toLowerCase();
  }

  /**
   * Отбор по запросу и году. Пустой запрос — всё; запрос из нескольких слов
   * требует каждое слово (порядок не важен).
   * @param {Object} [opts] — { query, year }
   */
  function filter(rows, opts) {
    var o = opts || {};
    var words = String(o.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    return (rows || []).filter(function (r) {
      if (o.year !== undefined && o.year !== null && r.serviceYear !== o.year) return false;
      if (!words.length) return true;
      var hay = haystack(r);
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }

  /**
   * Группировка по служебным годам, новые сверху. Порядок строк внутри года
   * сохраняется как пришёл из CWArchive.list() (последние записи сверху).
   * @returns {Array<{year:number,label:string,rows:Object[]}>}
   */
  function groupByYear(rows) {
    var map = {};
    (rows || []).forEach(function (r) { (map[r.serviceYear] = map[r.serviceYear] || []).push(r); });
    return Object.keys(map).map(Number).sort(function (a, b) { return b - a; }).map(function (y) {
      return { year: y, label: yearLabel(y), rows: map[y] };
    });
  }

  /** Строка docRefs `module:entity:id` → ref для CWDocs; id может содержать «:». */
  function parseDocRef(key) {
    var s = String(key || '');
    var a = s.indexOf(':');
    var b = a < 0 ? -1 : s.indexOf(':', a + 1);
    if (a <= 0 || b <= a + 1 || b === s.length - 1) return null;
    return { module: s.slice(0, a), entity: s.slice(a + 1, b), id: s.slice(b + 1) };
  }

  global.ArchiveLogic = {
    GATED_MODULE: GATED_MODULE,
    visible: visible,
    yearsOf: yearsOf,
    yearLabel: yearLabel,
    filter: filter,
    groupByYear: groupByYear,
    parseDocRef: parseDocRef,
  };
})(typeof self !== 'undefined' ? self : this);
