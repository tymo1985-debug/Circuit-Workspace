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
 * J3a добавляет дереву узлов то, чего требует безопасное CRUD-дерево:
 *  - parentId корневого узла (район) — строка ROOT_PARENT ('root'), не
 *    null/undefined: по той же причине, что и у carryKey — не валидный
 *    ключ IndexedDB, значит недостижим через индекс;
 *  - иерархия (kind ↔ parentId) проверяется в nodes.add/update, а не
 *    только в разметке экрана — невалидную комбинацию нельзя завести в
 *    обход интерфейса;
 *  - nodes.remove отказывает, если у узла есть дети, собственные записи
 *    или связи (as from/to) — каскадного удаления в J3a нет.
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

  /* Корень дерева. НЕ null: null/undefined не являются валидным ключом
     IndexedDB — IDBKeyRange.only(null) бросает DataError, и запись с таким
     полем индексом просто никогда не находится (тот же класс проблемы, что
     булево carryKey, см. заголовок файла). Круговые узлы (район как
     собственный родитель) исключаются тем, что 'root' не является id ни
     одного реального узла. */
  var ROOT_PARENT = 'root';

  var KINDS = ['circuit', 'congregation', 'group', 'pregroup'];

  /* Единая точка правды о том, что разрешено в дереве, — вызывается из
     add() и из update() при смене parentId/kind. UI обязан предлагать только
     валидные действия, но сама гарантия — здесь, а не в разметке. */
  async function assertValidParent(kind, parentId) {
    if (KINDS.indexOf(kind) === -1) throw new Error('journal-invalid-kind');
    if (kind === 'circuit') {
      if (parentId !== ROOT_PARENT) throw new Error('journal-invalid-hierarchy');
      return null;
    }
    if (!parentId || parentId === ROOT_PARENT) throw new Error('journal-invalid-hierarchy');
    var parent = await db().journalNodes.get(parentId);
    if (!parent) throw new Error('journal-invalid-hierarchy');
    if (kind === 'congregation' && parent.kind !== 'circuit') throw new Error('journal-invalid-hierarchy');
    if ((kind === 'group' || kind === 'pregroup') && parent.kind !== 'congregation') {
      throw new Error('journal-invalid-hierarchy');
    }
    return parent;
  }

  /** Сортировка одноуровневых узлов: по `sort`, затем по label, затем по id —
   *  детерминированно даже когда `sort` совпадает или отсутствует. */
  function sortNodes(list) {
    return (list || []).slice().sort(function (a, b) {
      var sa = typeof a.sort === 'number' ? a.sort : Number.MAX_SAFE_INTEGER;
      var sb = typeof b.sort === 'number' ? b.sort : Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      var la = (a.label || ''), lb = (b.label || '');
      if (la !== lb) return la < lb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

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
    remove: guardedRemove,
    byParent: function (parentId) { return nodesBase.by('parentId', parentId); },
    byCircuit: function (circuitId) { return nodesBase.by('circuitId', circuitId); },
    byKind: function (kind) { return nodesBase.by('kind', kind); },
    byStatus: function (status) { return nodesBase.by('status', status); },

    /**
     * Создание узла. Проверяет иерархию (assertValidParent), проставляет
     * `circuitId` от родителя (для района — от самого себя, вторым патчем,
     * т.к. id известен только после add) и `sort` — по умолчанию «после
     * текущих братьев» (max(sort) + 1 среди узлов с тем же parentId).
     * Оба поведения — только если вызывающий их не задал сам.
     */
    add: async function (record) {
      record = record || {};
      var parent = await assertValidParent(record.kind, record.parentId);
      var payload = Object.assign({ status: 'active' }, record);
      if (parent) payload.circuitId = parent.circuitId;
      if (payload.sort === undefined || payload.sort === null) {
        var siblings = await nodesBase.by('parentId', record.parentId);
        payload.sort = siblings.reduce(function (max, r) {
          return Math.max(max, typeof r.sort === 'number' ? r.sort : 0);
        }, -1) + 1;
      }
      var id = await nodesBase.add(payload);
      if (record.kind === 'circuit') await nodesBase.update(id, { circuitId: id });
      return id;
    },

    /** Обновление. `kind`/`parentId` неизменяемы после создания (J3a не
     *  поддерживает перенос узла между родителями/видами — частичная
     *  поддержка была бы хуже отсутствия: узел мог бы стать сам себе
     *  родителем через одновременную смену kind+parentId, а перенос между
     *  районами оставлял бы устаревший circuitId у всех потомков).
     *  Патч с тем же значением, что уже стоит, — не ошибка, просто ничего
     *  не меняет. Перенос подцеревьев — отдельная будущая фаза. */
    update: async function (id, patch) {
      patch = patch || {};
      if ('kind' in patch || 'parentId' in patch) {
        var current = await nodesBase.get(id);
        if (!current) throw new Error('journal-node-not-found');
        if ('kind' in patch && patch.kind !== current.kind) throw new Error('journal-immutable-kind');
        if ('parentId' in patch && patch.parentId !== current.parentId) throw new Error('journal-immutable-parent');
      }
      return nodesBase.update(id, patch);
    },
  };

  /** Удаление разрешено только когда узел ничего за собой не оставляет:
   *  ни детей, ни собственных записей, ни связей (как источник, так и как
   *  цель). Инвариант — здесь, а не только в UI: тихого каскадного удаления
   *  в J3a нет и не будет обходного пути через прямой вызов данных. */
  async function guardedRemove(id) {
    var children = await nodesBase.by('parentId', id);
    if (children.length) throw new Error('journal-node-has-children');
    var ownEntries = await entriesBase.by('nodeId', id);
    if (ownEntries.length) throw new Error('journal-node-has-entries');
    var asFrom = await db().journalLinks.byIndex('from', 'journal:node/' + id);
    var asTo = await db().journalLinks.byIndex('to', 'journal:node/' + id);
    if (asFrom.length || asTo.length) throw new Error('journal-node-has-links');
    return nodesBase.remove(id);
  }

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
    sortNodes: sortNodes,
    ROOT_PARENT: ROOT_PARENT,
    KINDS: KINDS,
    TYPES: ['note', 'project', 'question', 'todo', 'visit', 'observation'],
    RELS: ['relates', 'covers', 'source', 'mentions', 'external'],
  };
})(typeof self !== 'undefined' ? self : globalThis);
