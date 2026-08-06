/**
 * Circuit Workspace — shared/sender.js
 * Единственное место, где живут данные отправителя: имя, код района, адрес,
 * телефоны и почта человека, от которого уходят все документы экосистемы.
 *
 * ЗАЧЕМ ОН ПОЯВИЛСЯ. До него одни и те же данные лежали в трёх местах:
 * в настройках писем Конгрессов, в настройках Клиндария (своя копия, без кода
 * района) и в Назначениях, которые читали чужой ключ Конгрессов напрямую.
 * Последнее особенно плохо: модуль лез во внутреннее хранилище соседа, то есть
 * зависел от его схемы данных и от того, открывали ли его вообще.
 *
 * ПРАВИЛО: ни один модуль не читает хранилище другого модуля. Общее живёт в
 * общем слое, своё — у себя.
 *
 * ИМЕНА ПОЛЕЙ намеренно нейтральные (name/code/address/phone1/phone2/email), а
 * не скопированные из какого-то одного модуля: у Конгрессов было
 * `senderName`/`senderPhone1`, у Клиндария — `senderName`/`senderPhone`.
 * Побеждать не должна ни одна из схем.
 *
 * ХРАНИЛИЩЕ. localStorage под ключом `cw-sender`, а не IndexedDB (shared/db.js):
 * запись крошечная, нужна синхронно на первой отрисовке письма, и модули
 * читают её десятки раз за сессию. Асинхронный доступ здесь дал бы мигание
 * пустой шапки документа без единого выигрыша.
 *
 * `self` вместо `window` — файл можно безопасно подключать и через
 * importScripts() в service worker'е, как shared/version.js.
 */
(function (global) {
  'use strict';

  var KEY = 'cw-sender';

  /* Порядок = порядок строк в шапке документа. */
  var FIELDS = ['name', 'code', 'address', 'phone1', 'phone2', 'email'];

  var listeners = [];
  var cache = null;

  function read() {
    try { return global.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(value) {
    try { global.localStorage.setItem(KEY, value); } catch (e) { /* приватный режим Safari */ }
  }

  function blank() {
    var out = {};
    FIELDS.forEach(function (f) { out[f] = ''; });
    return out;
  }

  /* Приводим что угодно к полному набору строковых полей: подсунутый мусор
     не должен превращаться в undefined посреди готового документа. */
  function normalize(raw) {
    var out = blank();
    if (!raw || typeof raw !== 'object') return out;
    FIELDS.forEach(function (f) {
      if (typeof raw[f] === 'string') out[f] = raw[f];
    });
    return out;
  }

  function load() {
    if (cache) return cache;
    var raw = read();
    if (!raw) { cache = blank(); return cache; }
    try { cache = normalize(JSON.parse(raw)); }
    catch (e) { cache = blank(); }
    return cache;
  }

  function notify() {
    var value = load();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](value); } catch (e) { console.warn('CWSender listener failed', e); }
    }
  }

  function isEmptyRecord(record) {
    return FIELDS.every(function (f) { return !String(record[f] || '').trim(); });
  }

  var CWSender = {
    FIELDS: FIELDS,

    /** @returns {Object} копия — вызывающий не может испортить кэш. */
    get: function () {
      var value = load();
      var copy = {};
      FIELDS.forEach(function (f) { copy[f] = value[f]; });
      return copy;
    },

    /** Частичное обновление: передавать можно одно поле. */
    set: function (patch) {
      var next = load();
      var changed = false;
      FIELDS.forEach(function (f) {
        if (patch && typeof patch[f] === 'string' && patch[f] !== next[f]) {
          next[f] = patch[f];
          changed = true;
        }
      });
      if (!changed) return CWSender.get();
      cache = next;
      write(JSON.stringify(next));
      notify();
      return CWSender.get();
    },

    isEmpty: function () { return isEmptyRecord(load()); },

    /**
     * Одноразовый перенос данных из модуля в общий слой.
     *
     * Вызывается модулем при загрузке со своими прежними данными. Записывает
     * их ТОЛЬКО если общая запись ещё пуста, поэтому порядок открытия модулей
     * не важен и повторный вызов ничего не портит: первый модуль с непустыми
     * данными задаёт значение, остальные его не перетирают.
     *
     * @returns {boolean} true — данные приняты (модулю можно удалять свою копию)
     */
    adopt: function (seed) {
      var incoming = normalize(seed);
      if (isEmptyRecord(incoming)) return false;
      if (!isEmptyRecord(load())) return false;
      cache = incoming;
      write(JSON.stringify(incoming));
      notify();
      return true;
    },

    /** @returns {Function} отписка */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
  };

  /* Смена данных в другой вкладке (или в другом модуле, открытом рядом) —
     подписчики должны узнать без перезагрузки. */
  global.addEventListener('storage', function (e) {
    if (!e || e.key !== KEY) return;
    cache = null;
    notify();
  });

  global.CWSender = CWSender;
})(typeof self !== 'undefined' ? self : this);
