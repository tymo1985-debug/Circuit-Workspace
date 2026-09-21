/**
 * Журнал — слой данных (фаза J2).
 *
 * Единственная точка входа модуля к его хранилищам в общей базе
 * `circuit-workspace-db`: journalNodes / journalEntries / journalLinks /
 * journalMeta. Собственной обёртки IndexedDB здесь нет — всё идёт через
 * CRUD-наборы CWDB (shared/db.js), включая индексные выборки.
 *
 * Инварианты (см. journal/AGENTS.md):
 *  - никаких доменных данных в localStorage и CWState;
 *  - статусы/виды/типы — канонические значения данных, не подписи;
 *  - «открыт на следующее посещение» — строка carryKey = '<nodeId>:open',
 *    а не булево поле: булево значение не является ключом IndexedDB;
 *  - архив — это status/archivedAt, а не отдельное хранилище;
 *  - title/body/sec — граница будущей защиты (J8); этот файл их не трогает.
 *
 * Бизнес-логики визитов/задач/переноса здесь нет — только доступ к строкам.
 */
(function (global) {
  'use strict';

  function db() {
    if (!global.CWDB || !global.CWDB.journalNodes) {
      throw new Error('CWJournal: shared/db.js не подключён или без хранилищ Журнала');
    }
    return global.CWDB;
  }

  function now() { return new Date().toISOString(); }

  /* Метки времени проставляются здесь, а не в вызывающем коде: иначе каждый
     экран начнёт писать их по-своему, и сортировка «недавно изменённые»
     сломается на первой же записи без updatedAt. */
  function stamped(record) {
    var t = now();
    var out = Object.assign({}, record);
    if (!out.createdAt) out.createdAt = t;
    out.updatedAt = t;
    return out;
  }

  function touchPatch(patch) {
    var out = Object.assign({}, patch);
    delete out.id;
    delete out.createdAt;
    out.updatedAt = now();
    return out;
  }

  function carryKeyFor(nodeId) { return String(nodeId) + ':open'; }

  function rowsApi(storeName) {
    return {
      get: function (id) { return db()[storeName].get(id); },
      getAll: function () { return db()[storeName].getAll(); },
      add: function (record) { return db()[storeName].add(stamped(record || {})); },
      update: function (id, patch) { return db()[storeName].update(id, touchPatch(patch || {})); },
      remove: function (id) { return db()[storeName].remove(id); },
      by: function (index, value) { return db()[storeName].byIndex(index, value); },
    };
  }

  var nodesBase = rowsApi('journalNodes');
  var nodes = {
    get: nodesBase.get,
    getAll: nodesBase.getAll,
    add: nodesBase.add,
    update: nodesBase.update,
    remove: nodesBase.remove,
    byParent: function (parentId) { return nodesBase.by('parentId', parentId); },
    byCircuit: function (circuitId) { return nodesBase.by('circuitId', circuitId); },
    byKind: function (kind) { return nodesBase.by('kind', kind); },
    byStatus: function (status) { return nodesBase.by('status', status); },
  };

  var entriesBase = rowsApi('journalEntries');
  var entries = {
    get: entriesBase.get,
    getAll: entriesBase.getAll,
    add: entriesBase.add,
    update: entriesBase.update,
    remove: entriesBase.remove,
    byNode: function (nodeId) { return entriesBase.by('nodeId', nodeId); },
    byCircuit: function (circuitId) { return entriesBase.by('circuitId', circuitId); },
    byType: function (type) { return entriesBase.by('type', type); },
    byStatus: function (status) { return entriesBase.by('status', status); },
    /** Открытые пункты «на следующее посещение» одного узла. */
    openCarry: function (nodeId) { return entriesBase.by('carryKey', carryKeyFor(nodeId)); },
  };

  /* Связи неизменяемы: поменять связь = удалить и завести новую. updatedAt им
     не нужен, поэтому свой add без stamped(). */
  var links = {
    get: function (id) { return db().journalLinks.get(id); },
    add: function (record) {
      var r = Object.assign({}, record || {});
      if (!r.createdAt) r.createdAt = now();
      return db().journalLinks.add(r);
    },
    remove: function (id) { return db().journalLinks.remove(id); },
    from: function (ref) { return db().journalLinks.byIndex('from', ref); },
    to: function (ref) { return db().journalLinks.byIndex('to', ref); },
    byRel: function (rel) { return db().journalLinks.byIndex('rel', rel); },
  };

  var meta = {
    get: function (id) { return db().journalMeta.get(id); },
    put: function (record) { return db().journalMeta.put(record); },
    update: function (id, patch) {
      var p = Object.assign({}, patch || {});
      delete p.id;
      return db().journalMeta.update(id, p);
    },
  };

  /* URN-помощники: одно место, где формируется ссылка на объект, чтобы
     `journal:entry/…` не собирался строкой в десяти экранах по-разному. */
  var urn = {
    node: function (id) { return 'journal:node/' + id; },
    entry: function (id) { return 'journal:entry/' + id; },
    external: function (module, kind, id) { return 'cw:' + module + '/' + kind + '/' + id; },
  };

  global.CWJournal = {
    nodes: nodes,
    entries: entries,
    links: links,
    meta: meta,
    urn: urn,
    carryKeyFor: carryKeyFor,
    KINDS: ['circuit', 'congregation', 'group', 'pregroup'],
    TYPES: ['note', 'project', 'question', 'todo', 'visit', 'observation'],
    RELS: ['relates', 'covers', 'source', 'mentions', 'external'],
  };
})(typeof self !== 'undefined' ? self : globalThis);
