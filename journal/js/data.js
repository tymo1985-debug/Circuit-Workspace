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
 *  - title/body/sec — граница защиты (J8): строка с `sec` не хранит ни
 *    title, ни body; проверка — на КАЖДОЙ записи journalEntries этого файла
 *    (assertEntryPersistable), а не в экранах. См. раздел «Защита (J8)».
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
 * J6: CWJournal.search (только чтение, в памяти, без индекса) и
 * CWJournal.archive (выборка по status, восстановление через циклы узла/
 * посещения).
 * J7: CWJournal.links — доменный фасад связей (проверка URN, концов,
 * самосвязи, дубликатов, правила «только чтение») и CWJournal.projects —
 * проект района как строка journalEntries (type 'project') со своим циклом;
 * отношения проекта — только строки journalLinks, без копий в fields.
 */
(function (global) {
  'use strict';

  function db() {
    if (!global.CWDB || !global.CWDB.journalNodes) {
      throw new Error('CWJournal: shared/db.js не подключён или без хранилищ Журнала');
    }
    return signalingDb(global.CWDB);
  }

  /* ═══ Сигнал изменений записей (J9c) ═══════════════════════════════════
   * Без опроса: после каждой ЗАФИКСИРОВАННОЙ записи в journalEntries или (с O2)
   * journalNodes (прямой CRUD или пакет CWDB.batch с этим хранилищем) —
   * уведомление подписчиков
   * этой вкладки и сообщение в BroadcastChannel `cw-journal` для соседних.
   * Сообщение ничего не хранит и ничего не несёт, кроме непрозрачной метки:
   * ни id, ни текста, ни счётчиков. Постоянного следа нет вовсе — ни в
   * базе, ни в копии, ни в хранилищах браузера (правило модуля: доменных и
   * служебных данных Журнала там нет). Обёртка прозрачна: читает текущий
   * CWDB при каждом вызове, поэтому подмены методов в проверках видны. */
  var CHANNEL_NAME = 'cw-journal';
  /* O2: узлы (районы/собрания/группы) тоже сигналят — тем же каналом, тем
     же подписчикам: Обзор считает районы. Сообщение по-прежнему только
     непрозрачная метка вида: 'entries' | 'nodes'. */
  var CHANGE_KINDS = ['entries', 'nodes'];
  var changeKinds = {};
  var changeListeners = [];
  var changeQueued = false;
  var channel = null;
  function journalChannel() {
    if (channel || typeof global.BroadcastChannel !== 'function') return channel;
    try {
      channel = new global.BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = function (e) { if (e && e.data && CHANGE_KINDS.indexOf(e.data.kind) !== -1) notifyChange(); };
    } catch (e) { channel = null; }
    return channel;
  }
  /* Открытый канал мешает странице попасть в bfcache — закрываем при уходе
     и открываем снова при возврате (подписчики сами перечитают данные). */
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('pagehide', function () {
      if (channel) { try { channel.close(); } catch (e) { /* уже закрыт */ } channel = null; }
    });
    global.addEventListener('pageshow', function (e) {
      if (e && e.persisted && changeListeners.length) { journalChannel(); notifyChange(); }
    });
  }
  function notifyChange() {
    changeListeners.slice().forEach(function (fn) { try { fn(); } catch (err) { console.error('CWJournal: подписчик изменений упал', err); } });
  }
  function signalChange(kind) {
    changeKinds[kind === 'nodes' ? 'nodes' : 'entries'] = true;
    if (changeQueued) return;
    changeQueued = true;
    Promise.resolve().then(function () {
      changeQueued = false;
      var kinds = CHANGE_KINDS.filter(function (k) { return changeKinds[k]; });
      changeKinds = {};
      var ch = journalChannel();
      var rev = Date.now().toString(36);
      if (ch) kinds.forEach(function (k) { try { ch.postMessage({ kind: k, rev: rev }); } catch (e) { /* закрыт */ } });
      notifyChange();
    });
  }
  var ENTRY_WRITES = ['add', 'update', 'put', 'mutate', 'remove', 'clear'];
  var wrapped = { src: null, db: null };
  function signalingStore(C, name, kind) {
    var w = Object.create(C[name]);
    ENTRY_WRITES.forEach(function (m) {
      w[m] = function () {
        return C[name][m].apply(C[name], arguments).then(function (r) { signalChange(kind); return r; });
      };
    });
    return w;
  }
  function signalingDb(C) {
    if (wrapped.src === C) return wrapped.db;
    var entriesW = signalingStore(C, 'journalEntries', 'entries');
    var nodesW = signalingStore(C, 'journalNodes', 'nodes');
    var out = Object.create(C);
    Object.defineProperty(out, 'journalEntries', { get: function () { return entriesW; } });
    Object.defineProperty(out, 'journalNodes', { get: function () { return nodesW; } });
    out.batch = function (ops) {
      return C.batch(ops).then(function (r) {
        if (Array.isArray(ops) && ops.some(function (o) { return o && o.store === 'journalEntries'; })) signalChange('entries');
        if (Array.isArray(ops) && ops.some(function (o) { return o && o.store === 'journalNodes'; })) signalChange('nodes');
        return r;
      });
    };
    wrapped = { src: C, db: out };
    return out;
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
      /* J6: архив узла — только archive()/unarchive(). Патч со статусом,
         отличным от текущего, или с archivedAt — отказ, а не молчаливая
         переадресация (тот же класс защиты, что у посещений). */
      if ('status' in patch || 'archivedAt' in patch) {
        var cur = await nodesBase.get(id);
        if (!cur) throw new Error('journal-node-not-found');
        if ('archivedAt' in patch || patch.status !== cur.status) throw new Error('journal-node-use-lifecycle');
      }
      return nodesBase.update(id, patch);
    },

    /** J6: в архив — status 'archived' + archivedAt. Каскада нет: дети
     *  не меняются, «архивность в контексте» вычисляется при чтении
     *  (search.effectiveArchived), не записывается. */
    archive: async function (id) {
      var cur = await nodesBase.get(id);
      if (!cur) throw new Error('journal-node-not-found');
      if (cur.status === 'archived') throw new Error('journal-node-invalid-transition');
      return nodesBase.update(id, { status: 'archived', archivedAt: now() });
    },
    /** Восстановление ТОЛЬКО этого узла: status 'active', archivedAt
     *  удаляется физически. Легаси-строка без archivedAt восстанавливается
     *  так же. Родитель в архиве восстановлению не мешает — узел остаётся
     *  достижим по дереву, архивным его делает родитель (см. AGENTS.md). */
    unarchive: async function (id) {
      var cur = await nodesBase.get(id);
      if (!cur) throw new Error('journal-node-not-found');
      if (cur.status !== 'archived') throw new Error('journal-node-invalid-transition');
      return db().journalNodes.mutate(id, function (row) {
        if (!row) throw new Error('journal-node-not-found');
        var next = Object.assign({}, row, { status: 'active', updatedAt: now() });
        delete next.archivedAt;
        return next;
      });
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

  /* J8: единственная дорога записи в journalEntries — через этот набор и
     replaceEntry()/пакеты защиты; каждая итоговая строка проходит
     assertEntryPersistable(). update() — слияние ВНУТРИ транзакции (mutate),
     иначе итоговая строка была бы не видна до записи. */
  var entriesBase = (function () {
    var base = rowsApi('journalEntries');
    return {
      get: base.get,
      getAll: base.getAll,
      remove: base.remove,
      by: base.by,
      add: function (record) {
        var row = stamped(record || {});
        try { assertEntryPersistable(row); } catch (e) { return Promise.reject(e); }
        return db().journalEntries.add(row);
      },
      update: function (id, patch) {
        var p = touchPatch(patch || {});
        return db().journalEntries.mutate(id, function (current) {
          if (!current) throw new Error('CWDB.journalEntries.update: запись ' + id + ' не найдена');
          var merged = Object.assign({}, current, p, { id: id });
          assertEntryPersistable(merged);
          return merged;
        });
      },
    };
  })();
  /* Общий фасад записей НЕ мутирует посещения. Инварианты посещения
     (родитель, даты, неизменяемые поля, статус только через жизненный
     цикл, удаление только без записей/связей) держит CWJournal.visits;
     без этого стража entries.add/update/remove обходили бы их все через
     тот же официальный фасад. Вызов не перенаправляется молча — вызывающий
     обязан явно выбрать API посещения. Чтение не ограничено.
     Сам CWJournal.visits работает через приватный entriesBase. */
  var VISIT_USE_FACADE = 'journal-visit-use-facade';
  /* J4b: тот же класс защиты для записей ПОСЕЩЕНИЯ (fields.visitId). Их
     инварианты (узел/район от посещения, неизменяемая привязка, правка
     только в открытом посещении, удаление без связей) держит
     CWJournal.visitRecords; общий фасад их не создаёт, не правит и не
     удаляет и не может «приписать» обычную запись к посещению. */
  var VISIT_RECORD_USE_FACADE = 'journal-visit-record-use-facade';
  function hasVisitRef(obj) { return !!(obj && obj.fields && obj.fields.visitId !== undefined && obj.fields.visitId !== null); }
  /* J5: задачи (type 'todo') — только через CWJournal.tasks, перенос
     (carryKey/touches) — только через CWJournal.carry. Общий фасад их не
     создаёт, не правит и не удаляет; молчаливого перенаправления нет. */
  var TASK_USE_FACADE = 'journal-task-use-facade';
  var CARRY_USE_FACADE = 'journal-carry-use-facade';
  /* J7: проект (type 'project') — только через CWJournal.projects: цикл
     active ↔ completed → archived, неизменяемые type/nodeId/circuitId,
     удаление без связей. Общий фасад его не создаёт, не правит, не удаляет. */
  var PROJECT_USE_FACADE = 'journal-project-use-facade';
  function hasCarryFields(obj) { return !!(obj && ('carryKey' in obj || 'touches' in obj)); }
  var entries = {
    get: entriesBase.get,
    getAll: entriesBase.getAll,
    add: function (record) {
      if (record && record.type === 'visit') return Promise.reject(new Error(VISIT_USE_FACADE));
      if (hasVisitRef(record)) return Promise.reject(new Error(VISIT_RECORD_USE_FACADE));
      if (record && record.type === 'todo') return Promise.reject(new Error(TASK_USE_FACADE));
      if (hasCarryFields(record)) return Promise.reject(new Error(CARRY_USE_FACADE));
      if (record && record.type === 'project') return Promise.reject(new Error(PROJECT_USE_FACADE));
      return entriesBase.add(record);
    },
    update: async function (id, patch) {
      var current = await entriesBase.get(id);
      if ((current && current.type === 'visit') || (patch && patch.type === 'visit')) {
        throw new Error(VISIT_USE_FACADE);
      }
      if (hasVisitRef(current) || hasVisitRef(patch)) throw new Error(VISIT_RECORD_USE_FACADE);
      if ((current && current.type === 'todo') || (patch && patch.type === 'todo')) throw new Error(TASK_USE_FACADE);
      if (hasCarryFields(current) || hasCarryFields(patch)) throw new Error(CARRY_USE_FACADE);
      if ((current && current.type === 'project') || (patch && patch.type === 'project')) throw new Error(PROJECT_USE_FACADE);
      return entriesBase.update(id, patch);
    },
    remove: async function (id) {
      var current = await entriesBase.get(id);
      if (current && current.type === 'visit') throw new Error(VISIT_USE_FACADE);
      if (hasVisitRef(current)) throw new Error(VISIT_RECORD_USE_FACADE);
      if (current && current.type === 'todo') throw new Error(TASK_USE_FACADE);
      if (hasCarryFields(current)) throw new Error(CARRY_USE_FACADE);
      if (current && current.type === 'project') throw new Error(PROJECT_USE_FACADE);
      return entriesBase.remove(id);
    },
    byNode: function (nodeId) { return entriesBase.by('nodeId', nodeId); },
    byCircuit: function (circuitId) { return entriesBase.by('circuitId', circuitId); },
    byType: function (type) { return entriesBase.by('type', type); },
    byStatus: function (status) { return entriesBase.by('status', status); },
    /** Открытые пункты «на следующее посещение» одного узла. */
    openCarry: function (nodeId) { return entriesBase.by('carryKey', carryKeyFor(nodeId)); },
  };

  /* ═══ Посещения (J4a) ═══════════════════════════════════════════════════
   * Посещение — строка journalEntries с type:'visit'. Пятого хранилища нет.
   *  - родитель: собрание, группа или предгруппа (VISIT_PARENT_KINDS);
   *    circuitId наследуется от узла; type/nodeId/circuitId неизменяемы;
   *  - dateFrom/dateTo — 'YYYY-MM-DD', обе обязательны, настоящие даты
   *    календаря, dateTo >= dateFrom; пересечение посещений одного узла НЕ
   *    запрещено (требования такого нет);
   *  - status: 'open' → 'completed' (reopen обратно разрешён); из любого из
   *    двух → 'archived' c archivedAt, unarchive возвращает прежний статус
   *    (fields.statusBeforeArchive). Статус меняется ТОЛЬКО через complete/
   *    reopen/archive/unarchive — update() его отклоняет;
   *  - записи, созданные внутри посещения (J4b), несут fields.visitId и тот же
   *    nodeId; remove() отказывает, пока такие записи или связи существуют;
   *  - порядок byNode: dateFrom по убыванию, затем createdAt, затем id. */
  var VISIT_PARENT_KINDS = ['congregation', 'group', 'pregroup'];
  var VISIT_STATUSES = ['open', 'completed', 'archived'];

  function isIsoDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var d = new Date(v + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }
  function assertVisitDates(from, to) {
    if (!isIsoDate(from) || !isIsoDate(to) || to < from) throw new Error('journal-visit-invalid-dates');
  }
  async function visitOrThrow(id) {
    var v = await entriesBase.get(id);
    if (!v || v.type !== 'visit') throw new Error('journal-visit-not-found');
    return v;
  }
  function sortVisits(list) {
    return list.slice().sort(function (a, b) {
      if (a.dateFrom !== b.dateFrom) return a.dateFrom < b.dateFrom ? 1 : -1;
      if ((a.createdAt || '') !== (b.createdAt || '')) return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
  async function visitChildren(visit) {
    return (await entriesBase.by('nodeId', visit.nodeId)).filter(function (e) {
      return e.id !== visit.id && e.fields && e.fields.visitId === visit.id;
    });
  }
  async function setVisitStatus(id, from, to, extra) {
    var v = await visitOrThrow(id);
    if (from.indexOf(v.status) === -1) throw new Error('journal-visit-invalid-transition');
    return entriesBase.update(id, Object.assign({ status: to }, extra ? extra(v) : {}));
  }

  var visits = {
    STATUSES: VISIT_STATUSES,
    PARENT_KINDS: VISIT_PARENT_KINDS,
    isIsoDate: isIsoDate,
    get: async function (id) {
      var v = await entriesBase.get(id);
      return v && v.type === 'visit' ? v : null;
    },
    byNode: async function (nodeId) {
      return sortVisits((await entriesBase.by('nodeId', nodeId)).filter(function (e) { return e.type === 'visit'; }));
    },
    /** Записи посещения (J4b), без сортировки — для порядка см. visitRecords.byVisit. */
    children: async function (id) { return visitChildren(await visitOrThrow(id)); },
    add: async function (record) {
      record = record || {};
      var node = record.nodeId ? await db().journalNodes.get(record.nodeId) : null;
      if (!node || VISIT_PARENT_KINDS.indexOf(node.kind) === -1) throw new Error('journal-visit-invalid-parent');
      assertVisitDates(record.dateFrom, record.dateTo);
      return entriesBase.add({
        type: 'visit',
        nodeId: node.id,
        circuitId: node.circuitId,
        status: 'open',
        dateFrom: record.dateFrom,
        dateTo: record.dateTo,
        fields: Object.assign({}, record.fields || {}),
      });
    },
    /** Правка данных посещения. type/nodeId/circuitId неизменяемы, статус —
     *  только через функции жизненного цикла. Даты проверяются на ИТОГОВОЙ
     *  паре (одна дата может прийти без другой). */
    update: async function (id, patch) {
      patch = Object.assign({}, patch || {});
      var v = await visitOrThrow(id);
      ['type', 'nodeId', 'circuitId'].forEach(function (k) {
        if (k in patch && patch[k] !== v[k]) throw new Error('journal-visit-immutable');
      });
      if (('status' in patch && patch.status !== v.status) || 'archivedAt' in patch) {
        throw new Error('journal-visit-invalid-transition');
      }
      var from = 'dateFrom' in patch ? patch.dateFrom : v.dateFrom;
      var to = 'dateTo' in patch ? patch.dateTo : v.dateTo;
      assertVisitDates(from, to);
      if (patch.fields) patch.fields = Object.assign({}, v.fields || {}, patch.fields);
      return entriesBase.update(id, patch);
    },
    complete: function (id) { return setVisitStatus(id, ['open'], 'completed'); },
    reopen: function (id) { return setVisitStatus(id, ['completed'], 'open'); },
    archive: function (id) {
      return setVisitStatus(id, ['open', 'completed'], 'archived', function (v) {
        return { archivedAt: now(), fields: Object.assign({}, v.fields || {}, { statusBeforeArchive: v.status }) };
      });
    },
    unarchive: function (id) {
      return visitOrThrow(id).then(function (v) {
        var back = (v.fields && v.fields.statusBeforeArchive) || 'completed';
        return setVisitStatus(id, ['archived'], back, function (cur) {
          var f = Object.assign({}, cur.fields || {});
          delete f.statusBeforeArchive;
          return { archivedAt: null, fields: f };
        });
      });
    },
    /** Удаление только «пустого» посещения: ни записей внутри, ни связей.
     *  Иначе — отказ; безопасная альтернатива — archive(). */
    remove: async function (id) {
      var v = await visitOrThrow(id);
      if ((await visitChildren(v)).length) throw new Error('journal-visit-has-entries');
      // J5: история переноса ссылается на посещение — удалить его значит
      // оставить в touches[] висячий visitId.
      var touched = (await entriesBase.by('nodeId', v.nodeId)).some(function (e) {
        return Array.isArray(e.touches) && e.touches.some(function (tc) { return tc.visitId === id; });
      });
      if (touched) throw new Error('journal-visit-has-carry');
      var ref = 'journal:entry/' + id;
      var asFrom = await db().journalLinks.byIndex('from', ref);
      var asTo = await db().journalLinks.byIndex('to', ref);
      if (asFrom.length || asTo.length) throw new Error('journal-visit-has-links');
      return entriesBase.remove(id);
    },
  };

  /* ═══ Записи посещения (J4b) ═════════════════════════════════════════════
   * Строки journalEntries с fields.visitId. Пятого хранилища нет.
   *  - type: note | observation | question | todo (VISIT_RECORD_TYPES);
   *  - nodeId/circuitId берутся ИЗ посещения; fields.visitId ставит фасад;
   *    все три неизменяемы — перенос записи между посещениями не поддержан;
   *  - текст пользователя — ТОЛЬКО верхнеуровневый body (граница J8: позже он
   *    уйдёт в sec). fields несёт лишь { visitId, format, seq } — ни копии
   *    текста, ни HTML;
   *  - format: paragraph | heading2 | list | quote; у todo — checklist;
   *  - status: note/observation/question — 'open' (стабильные записи);
   *    todo — 'open' ↔ 'done' только через complete/reopen;
   *  - тип меняется в пределах note/observation/question через update();
   *    превращение в задачу — явный convertToTodo() (однонаправленно);
   *  - править/создавать/удалять можно только в ОТКРЫТОМ посещении;
   *    завершённое/архивное — только чтение (journal-visit-readonly);
   *  - порядок: fields.seq (max+1 при создании), затем createdAt, затем id;
   *  - remove() отказывает, если на запись/от записи есть связи. */
  var VISIT_RECORD_TYPES = ['note', 'observation', 'question', 'todo'];
  var TEXT_TYPES = ['note', 'observation', 'question'];
  var TEXT_FORMATS = ['paragraph', 'heading2', 'list', 'quote'];

  function cleanBody(body) {
    if (typeof body !== 'string' || !body.trim()) throw new Error('journal-visit-record-empty');
    return body.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  }
  async function editableVisit(visitId) {
    var v = visitId ? await entriesBase.get(visitId) : null;
    if (!v || v.type !== 'visit') throw new Error('journal-visit-not-found');
    if (v.status !== 'open') throw new Error('journal-visit-readonly');
    return v;
  }
  async function recordOrThrow(id) {
    var r = await entriesBase.get(id);
    if (!r || r.type === 'visit' || !hasVisitRef(r)) throw new Error('journal-visit-record-not-found');
    return r;
  }
  function sortRecords(list) {
    return list.slice().sort(function (a, b) {
      var sa = a.fields && typeof a.fields.seq === 'number' ? a.fields.seq : Number.MAX_SAFE_INTEGER;
      var sb = b.fields && typeof b.fields.seq === 'number' ? b.fields.seq : Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      if ((a.createdAt || '') !== (b.createdAt || '')) return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  var visitRecords = {
    TYPES: VISIT_RECORD_TYPES,
    TEXT_TYPES: TEXT_TYPES,
    FORMATS: TEXT_FORMATS.concat(['checklist']),
    get: async function (id) {
      var r = await entriesBase.get(id);
      return r && r.type !== 'visit' && hasVisitRef(r) ? r : null;
    },
    byVisit: async function (visitId) {
      var v = await entriesBase.get(visitId);
      if (!v || v.type !== 'visit') return [];
      return sortRecords(await visitChildren(v));
    },
    /** add(visitId, { type, body, format }). Остальные поля вызывающего
     *  (nodeId, circuitId, fields.visitId, status, title…) не принимаются. */
    add: async function (visitId, record) {
      record = record || {};
      if (VISIT_RECORD_TYPES.indexOf(record.type) === -1) throw new Error('journal-visit-record-invalid-type');
      var v = await editableVisit(visitId);
      var body = cleanBody(record.body);
      var format = record.type === 'todo' ? 'checklist' : (record.format || 'paragraph');
      if (record.type !== 'todo' && TEXT_FORMATS.indexOf(format) === -1) throw new Error('journal-visit-record-invalid-format');
      var siblings = await visitChildren(v);
      var seq = siblings.reduce(function (m, r) {
        return Math.max(m, r.fields && typeof r.fields.seq === 'number' ? r.fields.seq : 0);
      }, 0) + 1;
      return entriesBase.add({
        type: record.type,
        nodeId: v.nodeId,
        circuitId: v.circuitId,
        status: 'open',
        body: body,
        fields: { visitId: v.id, format: format, seq: seq },
      });
    },
    /** update(id, { body?, format?, type? }). Любое другое поле — отказ:
     *  привязка неизменяема, статус задачи — только complete/reopen. */
    update: async function (id, patch) {
      patch = patch || {};
      var r = await recordOrThrow(id);
      await editableVisit(r.fields.visitId);
      var allowed = ['body', 'format', 'type'];
      Object.keys(patch).forEach(function (k) {
        if (allowed.indexOf(k) === -1) throw new Error('journal-visit-record-immutable');
      });
      var out = {};
      if ('body' in patch) out.body = cleanBody(patch.body);
      var nextType = 'type' in patch ? patch.type : r.type;
      if ('type' in patch && patch.type !== r.type) {
        if (r.type === 'todo' || TEXT_TYPES.indexOf(patch.type) === -1) throw new Error('journal-visit-record-invalid-type');
        out.type = patch.type;
      }
      if ('format' in patch && patch.format !== r.fields.format) {
        if (nextType === 'todo' || TEXT_FORMATS.indexOf(patch.format) === -1) throw new Error('journal-visit-record-invalid-format');
        out.fields = Object.assign({}, r.fields, { format: patch.format });
      }
      if (isProtected(r) && 'body' in out) {
        var nextBody = out.body;
        delete out.body;
        return writeProtectedText(r, { body: nextBody }, function (next) { Object.assign(next, out); });
      }
      return entriesBase.update(id, out);
    },
    /** Явное превращение текстовой записи в задачу (кнопки «Сделать
     *  задачей» / «Галочки»). Однонаправленно, статус — open. */
    convertToTodo: async function (id) {
      var r = await recordOrThrow(id);
      await editableVisit(r.fields.visitId);
      if (r.type === 'todo') throw new Error('journal-visit-record-invalid-type');
      return entriesBase.update(id, { type: 'todo', status: 'open', fields: Object.assign({}, r.fields, { format: 'checklist' }) });
    },
    /* Жизненный цикл задачи — один: CWJournal.tasks (J5). Обёртки J4b
       сохраняют свой API и делегируют ему. */
    complete: async function (id) {
      var r = await recordOrThrow(id);
      await editableVisit(r.fields.visitId);
      if (r.type !== 'todo') throw new Error('journal-visit-record-invalid-transition');
      return todoTransition(id, 'open', 'done', 'journal-visit-record-invalid-transition');
    },
    reopen: async function (id) {
      var r = await recordOrThrow(id);
      await editableVisit(r.fields.visitId);
      if (r.type !== 'todo') throw new Error('journal-visit-record-invalid-transition');
      return todoTransition(id, 'done', 'open', 'journal-visit-record-invalid-transition');
    },
    remove: async function (id) {
      var r = await recordOrThrow(id);
      await editableVisit(r.fields.visitId);
      await assertRemovable(r, 'journal-visit-record-has-links');
      return entriesBase.remove(id);
    },
  };

  /* ═══ Физическая замена записи (J5) ═════════════════════════════════════
   * Слияние update() не умеет УДАЛИТЬ свойство, а закрытый перенос обязан
   * потерять carryKey физически (индекс «открытых» держится на отсутствии
   * поля; null/''/false туда не пишутся). mutate() в общей базе пишет запись
   * целиком — fn получает копию и может удалить поле. Только для данных
   * модуля; id и createdAt не меняются, updatedAt продвигается. */
  function replaceEntry(id, fn) {
    return db().journalEntries.mutate(id, function (current) {
      if (!current) throw new Error('journal-entry-not-found');
      var next = fn(Object.assign({}, current));
      next.id = current.id;
      next.createdAt = current.createdAt;
      next.updatedAt = now();
      assertEntryPersistable(next);
      return next;
    });
  }

  /** Общие правила удаления записи с содержимым (задача/запись посещения):
   *  ни связей (from/to), ни истории переноса в других посещениях. */
  async function assertRemovable(r, linksError) {
    var ref = 'journal:entry/' + r.id;
    if ((await db().journalLinks.byIndex('from', ref)).length || (await db().journalLinks.byIndex('to', ref)).length) {
      throw new Error(linksError);
    }
    var origin = hasVisitRef(r) ? r.fields.visitId : null;
    if (Array.isArray(r.touches) && r.touches.some(function (tc) { return tc.visitId !== origin; })) {
      throw new Error('journal-carry-has-history');
    }
  }

  /* ═══ Задачи (J5) ═══════════════════════════════════════════════════════
   * ОДИН жизненный цикл todo для всего Журнала:
   *  - type 'todo', status 'open' | 'done' — только через complete/reopen;
   *  - body — текст (только верхний уровень), dueDate — необязательная дата
   *    'YYYY-MM-DD' в индексируемом верхнем поле; снятие срока — физическое
   *    удаление поля (replaceEntry), не null;
   *  - самостоятельная задача: узел любого вида, circuitId от узла, без
   *    fields.visitId; задача посещения — та же строка с fields.visitId
   *    (создаётся через visitRecords) и меняется ТОЛЬКО пока её посещение
   *    открыто — экран «Задачи» этого правила не обходит;
   *  - порядок: открытые — сначала со сроком, ранний срок раньше, затем
   *    createdAt, id; выполненные — updatedAt по убыванию, затем id. */
  async function taskOrThrow(id) {
    var r = await entriesBase.get(id);
    if (!r || r.type !== 'todo') throw new Error('journal-task-not-found');
    return r;
  }
  async function assertTaskMutable(r) {
    if (hasVisitRef(r)) await editableVisit(r.fields.visitId);
  }
  async function todoTransition(id, from, to, errCode) {
    var r = await taskOrThrow(id);
    await assertTaskMutable(r);
    if (r.status !== from) throw new Error(errCode || 'journal-task-invalid-transition');
    return entriesBase.update(id, { status: to });
  }
  function sortTasks(list) {
    var open = list.filter(function (r) { return r.status !== 'done'; });
    var done = list.filter(function (r) { return r.status === 'done'; });
    open.sort(function (a, b) {
      var ad = a.dueDate || null, bd = b.dueDate || null;
      if (!!ad !== !!bd) return ad ? -1 : 1;
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
      if ((a.createdAt || '') !== (b.createdAt || '')) return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    done.sort(function (a, b) {
      if ((a.updatedAt || '') !== (b.updatedAt || '')) return (a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return open.concat(done);
  }

  var tasks = {
    get: async function (id) {
      var r = await entriesBase.get(id);
      return r && r.type === 'todo' ? r : null;
    },
    /** Все задачи Журнала (самостоятельные и из посещений) в порядке контракта. */
    list: async function () { return sortTasks(await entriesBase.by('type', 'todo')); },
    sort: sortTasks,
    /** Можно ли сейчас менять задачу (для экрана): false, если её
     *  посещение завершено/в архиве. Само правило держат методы ниже. */
    isMutable: async function (id) {
      var r = await taskOrThrow(id);
      if (!hasVisitRef(r)) return true;
      var v = await entriesBase.get(r.fields.visitId);
      return !!(v && v.type === 'visit' && v.status === 'open');
    },
    /** Самостоятельная задача узла: add({ nodeId, body, dueDate? }). */
    add: async function (record) {
      record = record || {};
      var node = record.nodeId ? await db().journalNodes.get(record.nodeId) : null;
      if (!node) throw new Error('journal-task-invalid-node');
      var body = cleanBody(record.body);
      if (record.dueDate !== undefined && record.dueDate !== null && record.dueDate !== '' && !isIsoDate(record.dueDate)) {
        throw new Error('journal-task-invalid-due');
      }
      var row = { type: 'todo', nodeId: node.id, circuitId: node.circuitId, status: 'open', body: body };
      if (record.dueDate) row.dueDate = record.dueDate;
      return entriesBase.add(row);
    },
    /** update(id, { body?, dueDate? }). dueDate: 'YYYY-MM-DD' или null/'' —
     *  снять срок (поле удаляется физически). Другие поля — отказ. */
    update: async function (id, patch) {
      patch = patch || {};
      var r = await taskOrThrow(id);
      await assertTaskMutable(r);
      Object.keys(patch).forEach(function (k) {
        if (k !== 'body' && k !== 'dueDate') throw new Error('journal-task-immutable');
      });
      var body = 'body' in patch ? cleanBody(patch.body) : undefined;
      var clearDue = 'dueDate' in patch && (patch.dueDate === null || patch.dueDate === '');
      if ('dueDate' in patch && !clearDue && !isIsoDate(patch.dueDate)) throw new Error('journal-task-invalid-due');
      var applyDue = function (next) {
        if (clearDue) delete next.dueDate;
        else if ('dueDate' in patch) next.dueDate = patch.dueDate;
      };
      // J8: текст защищённой задачи — только через шифрование; срок —
      // метаданные, sec при этом переносится байт в байт.
      if (isProtected(r) && body !== undefined) return writeProtectedText(r, { body: body }, applyDue);
      return replaceEntry(id, function (next) {
        if (body !== undefined) next.body = body;
        applyDue(next);
        return next;
      });
    },
    complete: function (id) { return todoTransition(id, 'open', 'done'); },
    reopen: function (id) { return todoTransition(id, 'done', 'open'); },
    remove: async function (id) {
      var r = await taskOrThrow(id);
      await assertTaskMutable(r);
      await assertRemovable(r, 'journal-task-has-links');
      return entriesBase.remove(id);
    },
  };

  /* ═══ Перенос «на следующее посещение» (J5) ════════════════════════════
   * Один логический пункт — одна строка; между посещениями не копируется.
   *  - переносимы записи посещения: note | observation | question | todo;
   *    само посещение — нет; fields.visitId остаётся посещением-источником;
   *  - открыт: carryKey = '<nodeId>:open'; закрыт: поля carryKey НЕТ;
   *  - touches[] — история: { visitId, at, action }, action ∈ raised |
   *    kept («оставить открытым») | deferred («перенести дальше») | closed.
   *    Без текста пользователя (граница J8). Порядок — порядок добавления;
   *  - mark/unmark — в открытом посещении-источнике; unmark — только пока
   *    пункт не трогали другие посещения;
   *  - touch — в открытом посещении V того же узла, строго ПОСЛЕ источника
   *    (по dateFrom, затем createdAt, id); closed физически снимает carryKey;
   *  - входящие для V: открытые пункты узла из более ранних посещений +
   *    пункты, уже тронутые в V (в любом состоянии). Пункт, поднятый в самом
   *    V, входящим для V не считается — он в markedIn(V). */
  var CARRY_ACTIONS = ['raised', 'kept', 'deferred', 'closed'];

  function visitBefore(a, b) {
    if (a.dateFrom !== b.dateFrom) return a.dateFrom < b.dateFrom;
    if ((a.createdAt || '') !== (b.createdAt || '')) return (a.createdAt || '') < (b.createdAt || '');
    return a.id < b.id;
  }
  async function carryItemOrThrow(id) {
    var r = await entriesBase.get(id);
    if (!r || r.type === 'visit' || !hasVisitRef(r) || VISIT_RECORD_TYPES.indexOf(r.type) === -1) {
      throw new Error('journal-carry-not-eligible');
    }
    return r;
  }
  function lastTouch(r) { return Array.isArray(r.touches) && r.touches.length ? r.touches[r.touches.length - 1] : null; }

  var carry = {
    ACTIONS: CARRY_ACTIONS,
    isOpen: function (r) { return !!(r && 'carryKey' in r); },
    /** Открытые пункты узла (индекс carryKey). */
    openForNode: async function (nodeId) {
      return (await entriesBase.by('carryKey', carryKeyFor(nodeId))).filter(hasVisitRef);
    },
    mark: async function (id) {
      var r = await carryItemOrThrow(id);
      var origin = await editableVisit(r.fields.visitId);
      if ('carryKey' in r) throw new Error('journal-carry-already-open');
      if (Array.isArray(r.touches) && r.touches.length) throw new Error('journal-carry-has-history');
      return replaceEntry(id, function (next) {
        next.carryKey = carryKeyFor(r.nodeId);
        next.touches = [{ visitId: origin.id, at: now(), action: 'raised' }];
        return next;
      });
    },
    /** Снять пометку ошибочно поднятого пункта: только в посещении-источнике
     *  и только пока его не трогали другие посещения. carryKey и touches
     *  удаляются физически. */
    unmark: async function (id) {
      var r = await carryItemOrThrow(id);
      var origin = await editableVisit(r.fields.visitId);
      if (!('carryKey' in r)) throw new Error('journal-carry-not-open');
      if ((r.touches || []).some(function (tc) { return tc.visitId !== origin.id; })) throw new Error('journal-carry-has-history');
      return replaceEntry(id, function (next) {
        delete next.carryKey;
        delete next.touches;
        return next;
      });
    },
    /** Решение по пункту в более позднем посещении того же узла. */
    touch: async function (id, visitId, action) {
      if (['kept', 'deferred', 'closed'].indexOf(action) === -1) throw new Error('journal-carry-invalid-action');
      var r = await carryItemOrThrow(id);
      if (!('carryKey' in r)) throw new Error('journal-carry-not-open');
      var v = await editableVisit(visitId);
      if (v.nodeId !== r.nodeId) throw new Error('journal-carry-foreign-visit');
      var origin = await entriesBase.get(r.fields.visitId);
      if (!origin || origin.id === v.id || !visitBefore(origin, v)) throw new Error('journal-carry-not-incoming');
      var last = lastTouch(r);
      if (last && last.visitId === v.id && last.action === action) return r;
      return replaceEntry(id, function (next) {
        next.touches = (next.touches || []).concat([{ visitId: v.id, at: now(), action: action }]);
        if (action === 'closed') delete next.carryKey;
        return next;
      });
    },
    /** Входящие пункты посещения V (см. контракт выше), по порядку источника. */
    incoming: async function (visitId) {
      var v = await entriesBase.get(visitId);
      if (!v || v.type !== 'visit') return [];
      var rows = (await entriesBase.by('nodeId', v.nodeId)).filter(function (e) {
        return hasVisitRef(e) && e.type !== 'visit' && e.fields.visitId !== v.id;
      });
      var origins = {};
      for (var i = 0; i < rows.length; i++) {
        var oid = rows[i].fields.visitId;
        if (!(oid in origins)) origins[oid] = await entriesBase.get(oid);
      }
      var list = rows.filter(function (e) {
        var o = origins[e.fields.visitId];
        var touchedHere = (e.touches || []).some(function (tc) { return tc.visitId === v.id; });
        return touchedHere || ('carryKey' in e && o && visitBefore(o, v));
      });
      return list.sort(function (a, b) {
        var oa = origins[a.fields.visitId], ob = origins[b.fields.visitId];
        if (oa && ob && oa.id !== ob.id) return visitBefore(oa, ob) ? -1 : 1;
        var sa = a.fields.seq || 0, sb = b.fields.seq || 0;
        if (sa !== sb) return sa - sb;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    },
    /** Помечено в посещении V на следующее: открытые пункты, чьё последнее
     *  событие — в V (поднят, оставлен или перенесён дальше). */
    markedIn: async function (visitId) {
      var v = await entriesBase.get(visitId);
      if (!v || v.type !== 'visit') return [];
      return (await carry.openForNode(v.nodeId)).filter(function (e) {
        var last = lastTouch(e);
        return last && last.visitId === v.id && last.action !== 'closed';
      });
    },
    /** Состояние пункта относительно посещения V: 'pending' | 'kept' |
     *  'deferred' | 'closed' — для экрана. */
    stateIn: function (r, visitId) {
      var mine = (r.touches || []).filter(function (tc) { return tc.visitId === visitId; });
      return mine.length ? mine[mine.length - 1].action : 'pending';
    },
  };

  /* ═══ Поиск (J6) ═════════════════════════════════════════════════════════
   * Только чтение, по требованию, в памяти. НЕТ ни сохранённого индекса, ни
   * истории запросов, ни кэша открытого текста — ни в IndexedDB, ни в
   * localStorage/CWState (граница J8: забытый индекс пережил бы шифрование).
   * Каждый run() читает строки заново — поэтому архив/восстановление видны
   * сразу, без перезагрузки.
   *
   * Нормализация (fold): toLowerCase → NFD → у ЛАТИНСКОЙ базы снимаются
   * диакритики (é→e, ä→a, ó→o…), у кириллицы только ё→е (й, ї, ґ — отдельные
   * буквы, не трогаются) → NFC; ß→ss, ł→l; любой пробельный символ → ' '.
   * Запрос: fold, trim, схлопнуть пробелы, разбить на токены. Семантика — И:
   * каждый токен обязан найтись подстрокой в тексте результата ИЛИ его
   * контекста (район/собрание/группа/подпись справочника). Без нечёткого
   * поиска и стемминга.
   *
   * Ранг (детерминированный): 3 — собственное поле целиком равно запросу;
   * 2 — поле начинается с запроса; 1 — запрос целиком подстрока поля;
   * 0 — совпало только по токенам/контексту. Далее updatedAt по убыванию,
   * затем id. Группы экрана сохраняют этот порядок внутри себя.
   *
   * Строка с `sec` (защищённая, J8) текстом НЕ ищется вовсе — ни title/body,
   * ни шифротекст; она только считается (protectedCount).
   *
   * Архивность «в контексте» вычисляется при чтении и нигде не пишется:
   * узел — свой status или архивный предок; посещение — своё или узла;
   * запись/задача — своя, узла или посещения-источника. Выполненная задача
   * и закрытый перенос архивом НЕ являются. */
  var FOLD_LATIN = /[a-z]/;
  function foldChar(ch) {
    if (/\s/.test(ch)) return ' ';
    var low = ch.toLowerCase();
    if (low === 'ß') return 'ss';
    if (low === 'ł') return 'l';
    var d = low.normalize('NFD');
    if (d.length > 1) {
      var base = d.charAt(0);
      if (FOLD_LATIN.test(base)) return base;
      if (base === 'е' && d.charAt(1) === '\u0308') return 'е';
    }
    return low.normalize('NFC');
  }
  /** fold(text) → { s, start[], end[] }: start[i]/end[i] — диапазон исходной
   *  строки, из которого получен i-й символ s (для безопасной подсветки). */
  function foldMap(text) {
    text = String(text == null ? '' : text);
    var s = '', start = [], end = [];
    for (var i = 0; i < text.length;) {
      var cp = text.codePointAt(i);
      var len = cp > 0xffff ? 2 : 1;
      var f = foldChar(text.slice(i, i + len));
      for (var k = 0; k < f.length; k++) { s += f.charAt(k); start.push(i); end.push(i + len); }
      i += len;
    }
    return { s: s, start: start, end: end };
  }
  function fold(text) { return foldMap(text).s; }
  function normalizeQuery(q) { return fold(q).replace(/ +/g, ' ').trim(); }
  function tokensOf(q) { var n = normalizeQuery(q); return n ? n.split(' ') : []; }

  /** Сегменты текста с отметкой совпадений: [{ text, hit }]. Позиции — по
   *  ИСХОДНОЙ строке; разметку строит вызывающий из текстовых узлов. */
  function highlight(text, query) {
    text = String(text == null ? '' : text);
    var toks = tokensOf(query).filter(Boolean);
    if (!toks.length || !text) return [{ text: text, hit: false }];
    var m = foldMap(text);
    var marks = [];
    toks.forEach(function (tok) {
      var from = 0, at;
      while ((at = m.s.indexOf(tok, from)) >= 0) {
        marks.push([m.start[at], m.end[at + tok.length - 1]]);
        from = at + tok.length;
      }
    });
    if (!marks.length) return [{ text: text, hit: false }];
    marks.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var merged = [];
    marks.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    });
    var out = [], pos = 0;
    merged.forEach(function (r) {
      if (r[0] > pos) out.push({ text: text.slice(pos, r[0]), hit: false });
      out.push({ text: text.slice(r[0], r[1]), hit: true });
      pos = r[1];
    });
    if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
    return out;
  }

  /** Отрывок вокруг первого совпадения: переносы строк → пробел, края
   *  обрезаются по словам с «…». Возвращает сегменты highlight(). */
  function snippet(text, query, before, after) {
    before = before || 40; after = after || 110;
    var flat = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    var segs = highlight(flat, query);
    var first = 0, found = false;
    for (var i = 0; i < segs.length; i++) { if (segs[i].hit) { found = true; break; } first += segs[i].text.length; }
    var a = found ? Math.max(0, first - before) : 0;
    var b = Math.min(flat.length, (found ? first : 0) + after);
    if (a > 0) { var sp = flat.indexOf(' ', a); if (sp >= 0 && sp < first) a = sp + 1; }
    if (b < flat.length) { var sb = flat.lastIndexOf(' ', b); if (sb > first) b = sb; }
    var cut = flat.slice(a, b);
    var out = highlight(cut, query);
    if (a > 0) out.unshift({ text: '…', hit: false });
    if (b < flat.length) out.push({ text: '…', hit: false });
    return out;
  }

  function isProtected(row) { return !!(row && row.sec !== undefined && row.sec !== null); }
  function ts(r) { return (r && (r.updatedAt || r.createdAt)) || ''; }

  /** Снимок данных на один run(): узлы/записи читаются ОДИН раз, дальше —
   *  словари в памяти (без квадратичных повторных выборок). */
  async function snapshot(reveal) {
    var nodesAll = await nodesBase.getAll();
    var entriesAll = await entriesBase.getAll();
    // J8: при разблокированном сейфе — расшифрованные копии, только в памяти.
    if (reveal) entriesAll = await revealList(entriesAll);
    var nodeById = {}, entryById = {};
    nodesAll.forEach(function (n) { nodeById[n.id] = n; });
    entriesAll.forEach(function (e) { entryById[e.id] = e; });
    var archMemo = {};
    function nodeArchived(id) {
      if (id in archMemo) return archMemo[id];
      archMemo[id] = false; // защита от цикла в повреждённых данных
      var n = nodeById[id];
      var res = !!n && (n.status === 'archived' || (!!n.parentId && n.parentId !== ROOT_PARENT && nodeArchived(n.parentId)));
      archMemo[id] = res;
      return res;
    }
    function entryArchived(e) {
      if (!e) return false;
      if (e.status === 'archived' || nodeArchived(e.nodeId)) return true;
      if (e.type !== 'visit' && hasVisitRef(e)) {
        var v = entryById[e.fields.visitId];
        if (v && (v.status === 'archived' || nodeArchived(v.nodeId))) return true;
      }
      return false;
    }
    /** Цепочка предков узла сверху вниз (включая сам узел). */
    function chain(id) {
      var out = [], seen = {}, cur = nodeById[id];
      while (cur && !seen[cur.id]) {
        seen[cur.id] = true;
        out.unshift(cur);
        cur = cur.parentId && cur.parentId !== ROOT_PARENT ? nodeById[cur.parentId] : null;
      }
      return out;
    }
    return { nodes: nodesAll, entries: entriesAll, nodeById: nodeById, entryById: entryById,
      nodeArchived: nodeArchived, entryArchived: entryArchived, chain: chain };
  }

  /** Тексты контекста (район/собрание/группа) — с подписью справочника,
   *  если resolve() её дал. Обогащение ТОЛЬКО в памяти, никуда не пишется. */
  function contextTexts(snap, nodeId, resolve) {
    var out = [];
    snap.chain(nodeId).forEach(function (n) {
      if (n.label) out.push(n.label);
      if (n.kind === 'congregation' && n.communityId && resolve) {
        var d = null;
        try { d = resolve(n.communityId); } catch (_) { d = null; }
        if (d) ['name', 'congNumber', 'address', 'contactName'].forEach(function (k) { if (d[k]) out.push(String(d[k])); });
      }
    });
    return out;
  }
  function ownNodeTexts(n, resolve) {
    var own = [n.label || ''];
    if (n.kind === 'congregation' && n.communityId && resolve) {
      var d = null;
      try { d = resolve(n.communityId); } catch (_) { d = null; }
      if (d) {
        if (d.name) own.unshift(String(d.name));
        ['congNumber', 'address', 'contactName'].forEach(function (k) { if (d[k]) own.push(String(d[k])); });
      }
    }
    return own.filter(Boolean);
  }

  function scoreOf(ownFolded, q) {
    var best = 0;
    ownFolded.forEach(function (f) {
      var t = f.replace(/ +/g, ' ').trim();
      if (!t) return;
      if (t === q) best = Math.max(best, 3);
      else if (t.indexOf(q) === 0) best = Math.max(best, 2);
      else if (t.indexOf(q) >= 0) best = Math.max(best, 1);
    });
    return best;
  }

  /** Вид результата по строке: node | visit | record (запись посещения) |
   *  project (проект района, J7) | entry (самостоятельная запись) |
   *  task (любая задача). */
  function entryKind(e) {
    if (e.type === 'visit') return 'visit';
    if (e.type === 'todo') return 'task';
    if (e.type === 'project') return 'project';
    return hasVisitRef(e) ? 'record' : 'entry';
  }

  var search = {
    fold: fold,
    normalizeQuery: normalizeQuery,
    tokens: tokensOf,
    highlight: highlight,
    snippet: snippet,
    isProtected: isProtected,
    /**
     * run(query, { includeArchive, resolveCommunity, labelVisit }) →
     *   { query, tokens, results[], archivedCount, protectedCount }
     * results[]: { kind, id, row, nodeId, visitId, archived, score, texts,
     *   chain, visit } — texts: собственные поля (для отрывка) в исходном
     *   виде; chain: узлы сверху вниз; visit: посещение-источник. Ссылки на
     *   строки снимка этого прогона — нигде не сохраняются.
     * resolveCommunity(id) → запись справочника или null; labelVisit(v) →
     * производная подпись («осень 2027»). Обе — только в памяти.
     * При includeArchive=false архивные в контексте результаты не
     * возвращаются, но считаются (archivedCount) — для счётчика фильтра.
     */
    run: async function (query, opts) {
      opts = opts || {};
      var q = normalizeQuery(query);
      var toks = q ? q.split(' ') : [];
      var out = { query: q, tokens: toks, results: [], archivedCount: 0, protectedCount: 0 };
      if (!toks.length) return out;
      var resolve = typeof opts.resolveCommunity === 'function' ? opts.resolveCommunity : null;
      var labelVisit = typeof opts.labelVisit === 'function' ? opts.labelVisit : null;
      function visitTexts(v) {
        var t = [];
        if (labelVisit) { try { var l = labelVisit(v); if (l) t.push(String(l)); } catch (_) { /* подпись — только представление */ } }
        if (v.dateFrom) t.push(v.dateFrom);
        if (v.dateTo && v.dateTo !== v.dateFrom) t.push(v.dateTo);
        return t;
      }
      var snap = await snapshot(true);
      var ctxMemo = {};
      function ctxFolded(nodeId) {
        if (!(nodeId in ctxMemo)) ctxMemo[nodeId] = contextTexts(snap, nodeId, resolve).map(fold).join(' \u0000 ');
        return ctxMemo[nodeId];
      }
      /* Контекст дополняет, но не подменяет: у узла и записи хотя бы один
         токен обязан быть в СОБСТВЕННОМ тексте — иначе запрос «Приозёрное»
         вернул бы каждую запись собрания. Посещению своего текста нет,
         оно находится и по одному контексту. */
      function consider(kind, row, own, nodeId, archived, extraCtx) {
        var ownFolded = own.map(fold);
        var ownHay = ownFolded.join(' \u0000 ');
        var hay = ownHay + ' \u0000 ' + ctxFolded(nodeId) + (extraCtx ? ' \u0000 ' + extraCtx : '');
        for (var i = 0; i < toks.length; i++) if (hay.indexOf(toks[i]) === -1) return;
        if (kind !== 'visit' && !toks.some(function (tk) { return ownHay.indexOf(tk) >= 0; })) return;
        if (archived) out.archivedCount++;
        if (archived && !opts.includeArchive) return;
        out.results.push({
          kind: kind, id: row.id, row: row, nodeId: nodeId,
          visitId: kind === 'visit' ? row.id : (hasVisitRef(row) ? row.fields.visitId : null),
          archived: archived, score: scoreOf(ownFolded, q), texts: own,
          chain: snap.chain(nodeId),
          visit: kind === 'visit' ? row : (hasVisitRef(row) ? snap.entryById[row.fields.visitId] || null : null),
        });
      }

      snap.nodes.forEach(function (n) {
        consider('node', n, ownNodeTexts(n, resolve), n.id, snap.nodeArchived(n.id));
      });
      snap.entries.forEach(function (e) {
        var kind = entryKind(e);
        var archived = snap.entryArchived(e);
        if (isProtected(e) && !REVEALED.has(e)) {
          if (archived && !opts.includeArchive) return;
          out.protectedCount++;
          return;
        }
        var own = [];
        if (typeof e.title === 'string' && e.title) own.push(e.title);
        if (typeof e.body === 'string' && e.body) own.push(e.body);
        var extra = '';
        if (kind === 'visit') {
          // У посещения своего текста нет: ищется по контексту и датам.
          own = visitTexts(e);
        } else if (hasVisitRef(e)) {
          var v = snap.entryById[e.fields.visitId];
          if (v) extra = visitTexts(v).map(fold).join(' \u0000 ');
        }
        if (!own.length && kind !== 'visit') return;
        consider(kind, e, own, e.nodeId, archived, extra);
      });

      out.results.sort(function (a, b) {
        if (a.score !== b.score) return b.score - a.score;
        var ta = ts(a.row), tb = ts(b.row);
        if (ta !== tb) return ta < tb ? 1 : -1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      return out;
    },
  };

  /* ═══ Архив (J6) ═════════════════════════════════════════════════════════
   * Не хранилище, а выборка по status 'archived' — узлы, посещения и
   * (J7) проекты, у которых ЕСТЬ жизненный цикл архива. Выполненные задачи, закрытый
   * перенос и обычные записи посещения сюда не входят — это другие понятия.
   * Показываются только НАПРЯМУЮ архивные объекты (потомки архивного узла
   * не размножаются); у объекта с архивным предком — флаг parentArchived.
   * Порядок: archivedAt ‖ updatedAt ‖ createdAt по убыванию (легаси-узел
   * без archivedAt не теряется), затем id. Восстановление — только
   * nodes.unarchive / visits.unarchive / projects.unarchive, без каскада. */
  var archive = {
    list: async function () {
      var snap = await snapshot(true);
      var items = [];
      snap.nodes.forEach(function (n) {
        if (n.status !== 'archived') return;
        var parentArchived = !!(n.parentId && n.parentId !== ROOT_PARENT && snap.nodeArchived(n.parentId));
        items.push({ kind: 'node', id: n.id, row: n, archivedAt: n.archivedAt || null,
          sortAt: n.archivedAt || n.updatedAt || n.createdAt || '', parentArchived: parentArchived });
      });
      snap.entries.forEach(function (e) {
        if (e.type === 'project' && e.status === 'archived') {
          items.push({ kind: 'project', id: e.id, row: e, archivedAt: e.archivedAt || null,
            sortAt: e.archivedAt || e.updatedAt || e.createdAt || '', parentArchived: snap.nodeArchived(e.nodeId) });
          return;
        }
        if (e.type !== 'visit' || e.status !== 'archived') return;
        items.push({ kind: 'visit', id: e.id, row: e, archivedAt: e.archivedAt || null,
          sortAt: e.archivedAt || e.updatedAt || e.createdAt || '', parentArchived: snap.nodeArchived(e.nodeId) });
      });
      items.forEach(function (it) { it.chain = snap.chain(it.kind === 'node' ? it.row.parentId : it.row.nodeId); });
      return items.sort(function (a, b) {
        if (a.sortAt !== b.sortAt) return a.sortAt < b.sortAt ? 1 : -1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    },
    restore: function (item) {
      if (!item) return Promise.reject(new Error('journal-node-not-found'));
      if (item.kind === 'project') return projects.unarchive(item.id);
      return item.kind === 'visit' ? visits.unarchive(item.id) : nodes.unarchive(item.id);
    },
  };

  /* ═══ Связи (J7) ═════════════════════════════════════════════════════════
   * journalLinks — граф отношений. Строка несёт ТОЛЬКО { id, from, to, rel,
   * createdAt }: ни подписей, ни названий, ни текста, ни данных справочника
   * (граница J8 — связь не может стать копией открытого текста).
   *  - концы — канонические URN: journal:node/<id> | journal:entry/<id> |
   *    cw:<module>/<kind>/<id> (module ≠ journal: локальный объект имеет
   *    одну форму). Id — без '/', '|' и пробелов;
   *  - хотя бы один конец локальный; локальный конец обязан существовать
   *    (висячих локальных ссылок нет); внешний проверяется только по
   *    синтаксису — чужой модуль не загружается и не меняется;
   *  - самосвязь (from === to) — отказ;
   *  - rel — из RELS; значение — данные, не подпись;
   *  - дубликат (тот же from/to/rel) НЕ создаётся: add() идемпотентен и
   *    возвращает id уже существующей строки. Id детерминирован от тройки
   *    (jl_<rel>|<from>|<to>), поэтому и две одновременные вставки (двойной
   *    клик, две вкладки) дают одну строку — второй store.add упирается в
   *    ключ;
   *  - связи неизменяемы: поменять = удалить + добавить;
   *  - «только чтение»: связь с посещением или записью посещения меняется
   *    только пока посещение открыто (journal-visit-readonly), с архивным
   *    проектом — никогда (journal-project-readonly); новая связь с
   *    архивным узлом — отказ. Правило держит слой данных, не кнопка;
   *  - связи ПРОЕКТА — только через CWJournal.projects (канон направления:
   *    проект → цель); общий add/remove их отклоняет (journal-project-use-facade).
   * Обратных индексов/кэшей нет: чтение — индексы from/to/rel этого же
   * хранилища. */
  var LINK_RELS = ['relates', 'covers', 'source', 'mentions', 'external'];
  var URN_ID = /^[A-Za-z0-9._~@+-]{1,200}$/;
  function parseUrn(ref) {
    if (typeof ref !== 'string') return null;
    var m = /^journal:(node|entry)\/(.+)$/.exec(ref);
    if (m) return URN_ID.test(m[2]) ? { scope: 'journal', kind: m[1], id: m[2], ref: ref } : null;
    m = /^cw:([a-z][a-z0-9-]{0,39})\/([A-Za-z][A-Za-z0-9-]{0,39})\/(.+)$/.exec(ref);
    if (m && m[1] !== 'journal' && URN_ID.test(m[3])) return { scope: 'cw', module: m[1], kind: m[2], id: m[3], ref: ref };
    return null;
  }
  function linkKey(from, to, rel) { return 'jl_' + rel + '|' + from + '|' + to; }
  function sortLinks(list) {
    return list.slice().sort(function (a, b) {
      if ((a.createdAt || '') !== (b.createdAt || '')) return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
  /** Локальный конец → строка (или отказ); внешний → null. */
  async function endpointRow(p) {
    if (p.scope !== 'journal') return null;
    var row = p.kind === 'node' ? await db().journalNodes.get(p.id) : await entriesBase.get(p.id);
    if (!row) throw new Error('journal-link-missing-endpoint');
    return row;
  }
  function isProjectRow(p, row) { return !!(row && p.kind === 'entry' && row.type === 'project'); }
  /** Можно ли сейчас менять связи этого конца. adding — новая связь. */
  async function assertAssociationMutable(p, row, adding) {
    if (!row) return;
    if (p.kind === 'node') {
      if (adding && row.status === 'archived') throw new Error('journal-link-archived-endpoint');
      return;
    }
    if (row.type === 'project') {
      if (row.status === 'archived') throw new Error('journal-project-readonly');
      return;
    }
    if (row.type === 'visit') {
      if (row.status !== 'open') throw new Error('journal-visit-readonly');
      return;
    }
    if (hasVisitRef(row)) await editableVisit(row.fields.visitId);
  }
  /** Вставка после проверок. Идемпотентна: существующая тройка → её id. */
  async function insertLink(from, to, rel) {
    var existing = (await db().journalLinks.byIndex('from', from)).filter(function (l) { return l.to === to && l.rel === rel; });
    if (existing.length) return sortLinks(existing)[0].id;
    var id = linkKey(from, to, rel);
    try {
      return await db().journalLinks.add({ id: id, from: from, to: to, rel: rel, createdAt: now() });
    } catch (err) {
      // Параллельная вставка той же тройки: ключ уже занят — это та же связь.
      if (await db().journalLinks.get(id)) return id;
      throw err;
    }
  }
  async function linkEnds(from, to) {
    var pf = parseUrn(from), pt = parseUrn(to);
    if (!pf || !pt) throw new Error('journal-link-invalid-urn');
    if (pf.scope !== 'journal' && pt.scope !== 'journal') throw new Error('journal-link-invalid-urn');
    if (from === to) throw new Error('journal-link-self');
    return { pf: pf, pt: pt, rf: await endpointRow(pf), rt: await endpointRow(pt) };
  }

  var links = {
    RELS: LINK_RELS,
    parse: parseUrn,
    isValid: function (ref) { return !!parseUrn(ref); },
    get: function (id) { return db().journalLinks.get(id); },
    /** add({ from, to, rel }) → id (существующей строки при дубликате).
     *  Остальные поля вызывающего не принимаются. */
    add: async function (record) {
      record = record || {};
      if (LINK_RELS.indexOf(record.rel) === -1) throw new Error('journal-link-invalid-rel');
      var e = await linkEnds(record.from, record.to);
      if (isProjectRow(e.pf, e.rf) || isProjectRow(e.pt, e.rt)) throw new Error(PROJECT_USE_FACADE);
      if (isPlannerVisitPair(record.from, e.rf, record.to, e.rt)) throw new Error(PLANNER_USE_FACADE);
      await assertAssociationMutable(e.pf, e.rf, true);
      await assertAssociationMutable(e.pt, e.rt, true);
      return insertLink(record.from, record.to, record.rel);
    },
    /** Удаление строки связи. Отсутствующая — не ошибка (уже удалена). */
    remove: async function (id) {
      var l = await db().journalLinks.get(id);
      if (!l) return;
      if (await isPlannerVisitLink(l)) throw new Error(PLANNER_USE_FACADE);
      await assertLinkRemovable(l, false);
      return db().journalLinks.remove(id);
    },
    outgoing: async function (ref) { return sortLinks(await db().journalLinks.byIndex('from', ref)); },
    incoming: async function (ref) { return sortLinks(await db().journalLinks.byIndex('to', ref)); },
    /** Обе стороны: связи, где ref — from ИЛИ to (без повторов). */
    forRef: async function (ref) {
      var out = {}, all = (await db().journalLinks.byIndex('from', ref)).concat(await db().journalLinks.byIndex('to', ref));
      all.forEach(function (l) { out[l.id] = l; });
      return sortLinks(Object.keys(out).map(function (k) { return out[k]; }));
    },
    /** Связи строго from → to (любого rel). */
    between: async function (from, to) {
      return sortLinks((await db().journalLinks.byIndex('from', from)).filter(function (l) { return l.to === to; }));
    },
    /* Прежние имена (J2) — те же индексные выборки. */
    from: function (ref) { return db().journalLinks.byIndex('from', ref); },
    to: function (ref) { return db().journalLinks.byIndex('to', ref); },
    byRel: function (rel) { return db().journalLinks.byIndex('rel', rel); },
  };

  /** Правила удаления строки связи; viaProject — вызов из фасада проекта. */
  async function assertLinkRemovable(l, viaProject) {
    var pf = parseUrn(l.from), pt = parseUrn(l.to);
    var rf = null, rt = null;
    if (pf && pf.scope === 'journal') rf = pf.kind === 'node' ? await db().journalNodes.get(pf.id) : await entriesBase.get(pf.id);
    if (pt && pt.scope === 'journal') rt = pt.kind === 'node' ? await db().journalNodes.get(pt.id) : await entriesBase.get(pt.id);
    if (!viaProject && ((pf && isProjectRow(pf, rf)) || (pt && isProjectRow(pt, rt)))) throw new Error(PROJECT_USE_FACADE);
    if (pf) await assertAssociationMutable(pf, rf, false);
    if (pt) await assertAssociationMutable(pt, rt, false);
  }

  /* ═══ Посещение ↔ запись Клиндария (J9a) ══════════════════════════════
   * Связь — обычная строка journalLinks, rel 'external':
   *   journal:entry/<visitId> → cw:circuit-planner/entry/<plannerEntryId>
   * Ни заголовка, ни дат, ни названия собрания Журнал не хранит: всё это
   * разрешается на лету через shared/planner.js (CWPlanner). Поля вроде
   * plannerId в строке посещения нет и не будет — граф единственный
   * источник правды об отношении.
   *  - у посещения не больше ОДНОЙ прямой связи с записью Клиндария, и это
   *    держит КЛЮЧ, а не проверка: связь живёт в одном «слоте» с постоянным
   *    id на посещение (plannerSlotId: 'jl_planner|journal:entry/<v>').
   *    set() делает put в тот же ключ, меняя только `to`, — два set() из
   *    разных вкладок упираются в один ключ IndexedDB и не могут оставить
   *    две строки. Поэтому id этой строки НАМЕРЕННО не тройной id обычной
   *    связи J7 (jl_<rel>|<from>|<to>): связь-слот меняет цель, не меняя id.
   *    Строки Клиндария с другим id (кривое/старое состояние) set()/clear()
   *    удаляют тем же пакетом — состояние сходится к одному слоту;
   *  - менять связь можно только у открытого посещения (journal-visit-
   *    readonly) — правило J7 для посещения то же;
   *  - запись Клиндария исчезла — связь НЕ удаляется: экран показывает
   *    «не найдена», человек сам чинит или снимает. Восстановление копии
   *    одного модуля законно даёт такую внешнюю «висячую» ссылку;
   *  - общий links.add/remove такие связи не создаёт и не снимает
   *    (journal-planner-use-facade), чтобы правило «одна» держал слой данных;
   *  - на другие внешние связи (J7) правило не распространяется. */
  var PLANNER_MODULE = 'circuit-planner';
  var PLANNER_KIND = 'entry';
  var PLANNER_REL = 'external';
  var PLANNER_USE_FACADE = 'journal-planner-use-facade';
  function plannerSlotId(visitId) { return 'jl_planner|journal:entry/' + visitId; }
  function isPlannerEntryRef(ref) {
    var p = parseUrn(ref);
    return !!(p && p.scope === 'cw' && p.module === PLANNER_MODULE && p.kind === PLANNER_KIND);
  }
  function isPlannerVisitPair(from, rowFrom, to, rowTo) {
    return !!((isPlannerEntryRef(to) && rowFrom && rowFrom.type === 'visit')
      || (isPlannerEntryRef(from) && rowTo && rowTo.type === 'visit'));
  }
  /** Строка связи «посещение ↔ запись Клиндария» (в любом направлении). */
  async function isPlannerVisitLink(l) {
    var local = isPlannerEntryRef(l.to) ? parseUrn(l.from) : isPlannerEntryRef(l.from) ? parseUrn(l.to) : null;
    if (!local || local.scope !== 'journal' || local.kind !== 'entry') return false;
    var row = await entriesBase.get(local.id);
    return !!(row && row.type === 'visit');
  }
  function plannerUrn(entryId) {
    var ref = 'cw:' + PLANNER_MODULE + '/' + PLANNER_KIND + '/' + String(entryId == null ? '' : entryId);
    if (typeof entryId !== 'string' || !isPlannerEntryRef(ref)) throw new Error('journal-planner-invalid-id');
    return ref;
  }
  async function plannerVisit(visitId) {
    var v = typeof visitId === 'string' ? await entriesBase.get(visitId) : null;
    if (!v || v.type !== 'visit') throw new Error('journal-visit-not-found');
    return v;
  }
  async function plannerLinksOf(visitId) {
    return sortLinks((await db().journalLinks.byIndex('from', 'journal:entry/' + visitId)).filter(function (l) {
      return l.rel === PLANNER_REL && isPlannerEntryRef(l.to);
    }));
  }
  async function plannerBatch(ops) {
    try { await db().batch(ops); }
    catch (err) {
      if (err && err.message === 'cwdb-batch-precondition') throw new Error('journal-planner-changed');
      throw err;
    }
  }
  function expectOpenVisit(visitId) {
    return { store: 'journalEntries', type: 'expect', key: visitId, match: { type: 'visit', status: 'open' } };
  }
  /* Удаление идемпотентно: строку могла уже снять соседняя вкладка. */
  function dropLinkOps(list) {
    return list.map(function (l) { return { store: 'journalLinks', type: 'delete', key: l.id }; });
  }

  var planner = {
    MODULE: PLANNER_MODULE,
    KIND: PLANNER_KIND,
    REL: PLANNER_REL,
    urn: plannerUrn,
    isRef: isPlannerEntryRef,
    /** URN → id записи Клиндария (или null). */
    entryId: function (ref) { return isPlannerEntryRef(ref) ? parseUrn(ref).id : null; },
    /** Текущая связь посещения: { linkId, entryId } или null. Слот —
     *  первым; строка вне слота видна только до ближайшего set()/clear(). */
    get: async function (visitId) {
      await plannerVisit(visitId);
      var list = await plannerLinksOf(visitId);
      var slot = plannerSlotId(visitId);
      var l = list.filter(function (x) { return x.id === slot; })[0] || list[0];
      return l ? { linkId: l.id, entryId: parseUrn(l.to).id } : null;
    },
    slotId: plannerSlotId,
    /** Все прямые связи посещения с Клиндарием (штатно — не больше одной). */
    list: async function (visitId) { await plannerVisit(visitId); return plannerLinksOf(visitId); },
    /** Связать/перевязать: put в слот посещения. Та же запись — без записи. */
    set: async function (visitId, entryId) {
      var to = plannerUrn(entryId);
      var v = await plannerVisit(visitId);
      if (v.status !== 'open') throw new Error('journal-visit-readonly');
      var from = 'journal:entry/' + visitId;
      var slot = plannerSlotId(visitId);
      var current = await plannerLinksOf(visitId);
      var strays = current.filter(function (l) { return l.id !== slot; });
      var inSlot = current.filter(function (l) { return l.id === slot; })[0];
      if (inSlot && inSlot.to === to && !strays.length) return slot;
      var ops = [expectOpenVisit(visitId)].concat(dropLinkOps(strays));
      ops.push({ store: 'journalLinks', type: 'put', value: { id: slot, from: from, to: to, rel: PLANNER_REL, createdAt: now() } });
      await plannerBatch(ops);
      return slot;
    },
    /** Снять связь посещения с Клиндарием. Возвращает число снятых строк. */
    clear: async function (visitId) {
      var v = await plannerVisit(visitId);
      var current = await plannerLinksOf(visitId);
      if (!current.length) return 0;
      if (v.status !== 'open') throw new Error('journal-visit-readonly');
      var slot = plannerSlotId(visitId);
      var ops = [expectOpenVisit(visitId)].concat(dropLinkOps(current));
      if (!current.some(function (l) { return l.id === slot; })) ops.push({ store: 'journalLinks', type: 'delete', key: slot });
      await plannerBatch(ops);
      return current.length;
    },
  };

  /* ═══ Документы проекта (J9b) ═════════════════════════════════════════
   * Письма по проекту района — через существующие CWTemplates + CWDocs,
   * второго механизма документов нет. Снимок: ref { module:'journal',
   * entity:'project', id }, только при печати и явном «Сохранить в архив»;
   * просмотр/копирование снимков не создают. journalLinks для документов
   * не заводятся — связь несёт ref самого снимка.
   *
   * ГРАНИЦА J8 (правило слоя данных, не кнопок):
   *  - защищённый проект письма не собирает и в архив не пишет — даже
   *    разблокированным: открытый текст не должен попасть в CWDB.documents;
   *    данные берутся из СЫРОЙ строки, не из раскрытой копии;
   *  - проект, по которому в архиве есть снимки, защитить нельзя
   *    (journal-protect-has-documents): открытый текст уже лежит в архиве;
   *    сначала снимки удаляются (в «Документах» или в истории проекта);
   *  - архив недоступен и проверить нечем — защита проекта отказывает
   *    (journal-protect-docs-unknown): fail closed;
   *  - «сохранение ∥ защита» не гонка, а сериализация: снимок пишется
   *    CWDocs.saveGuarded() одним CWDB.batch с предусловием «строка проекта
   *    та же и без sec», защита — одним пакетом с expectNone «у проекта нет
   *    снимков». Обе проверки ВНУТРИ транзакции записи, IndexedDB сама
   *    упорядочивает вкладки: кто первым закоммитил — тот и прав, второй
   *    отказывает. «Защищён + снимок» невозможно без уборки задним числом. */
  var DOC_TEMPLATE_ID = 'sys.journal.project.letter';
  var DOC_CONTEXT = 'journal.project.letter';
  var DOC_REASONS = ['print', 'manual'];
  function docRef(projectId) { return { module: 'journal', entity: 'project', id: String(projectId) }; }
  function docsApi() {
    var D = global.CWDocs;
    return D && typeof D.available === 'function' && D.available() ? D : null;
  }
  /* Архивный проект — только чтение и для писем (как для правок J7):
     история видна, новое письмо не собирается и не сохраняется. */
  async function docProject(projectId) {
    var row = typeof projectId === 'string' ? await entriesBase.get(projectId) : null;
    if (!row || row.type !== 'project') throw new Error('journal-project-not-found');
    if (isProtected(row)) throw new Error('journal-docs-protected');
    if (row.status === 'archived') throw new Error('journal-project-readonly');
    return row;
  }
  function docData(row) {
    return { project: { title: typeof row.title === 'string' ? row.title : '', body: typeof row.body === 'string' ? row.body : '' } };
  }
  /** Для J8: у проекта нет снимков в архиве; нечем проверить — отказ. */
  async function assertNoProjectDocuments(row) {
    if (!row || row.type !== 'project') return;
    /* Только строгое чтение: терпимый list() отдаёт [] и при сбое базы —
       это выглядело бы как «документов нет» и пропустило бы защиту. */
    var D = docsApi();
    if (!D || typeof D.listStrict !== 'function') throw new Error('journal-protect-docs-unknown');
    var rows;
    try { rows = await D.listStrict(docRef(row.id)); } catch (e) { throw new Error('journal-protect-docs-unknown'); }
    if (!Array.isArray(rows)) throw new Error('journal-protect-docs-unknown');
    if (rows.length) throw new Error('journal-protect-has-documents');
  }

  var documents = {
    TEMPLATE_ID: DOC_TEMPLATE_ID,
    CONTEXT: DOC_CONTEXT,
    ref: docRef,
    available: function () { return !!docsApi(); },
    /** История выданных документов проекта, свежие сверху. */
    list: async function (projectId) {
      var D = docsApi();
      return D ? D.list(docRef(projectId)) : [];
    },
    /** Собрать письмо (без записи). Защищённый проект → journal-docs-protected. */
    compose: async function (projectId, lang) {
      var row = await docProject(projectId);
      var T = global.CWTemplates;
      if (!T || typeof T.text !== 'function' || typeof T.render !== 'function') throw new Error('journal-docs-unavailable');
      var picked = T.text(DOC_CONTEXT, lang);
      if (!picked) throw new Error('journal-docs-unavailable');
      var data = docData(row);
      return {
        projectId: row.id,
        templateId: picked.id,
        context: DOC_CONTEXT,
        lang: picked.lang,
        pending: !!picked.pending,
        custom: !!picked.custom,
        format: 'text',
        subject: picked.subject ? T.render(picked.subject, data) : '',
        body: T.render(picked.body, data),
        data: data,
      };
    },
    /**
     * Снимок в архив: reason 'print' | 'manual'. doc — результат compose(),
     * subject/body могут быть исправлены вручную (одноразово, шаблон не
     * меняется) — тогда edited: true.
     */
    save: async function (projectId, doc, reason, edited) {
      if (DOC_REASONS.indexOf(reason) < 0) throw new Error('journal-docs-invalid-reason');
      if (!doc || doc.projectId !== projectId) throw new Error('journal-docs-invalid');
      var D = docsApi();
      if (!D || typeof D.saveGuarded !== 'function') throw new Error('journal-docs-unavailable');
      /* Строка проекта меняется между чтением и записью (правка текста в
         соседней вкладке) — один повтор с перечитанной строкой. */
      for (var attempt = 0; attempt < 2; attempt++) {
        var row = await docProject(projectId);
        var guard = { type: 'expect', store: 'journalEntries', key: projectId,
          match: { type: 'project', sec: undefined, status: row.status, updatedAt: row.updatedAt, title: row.title, body: row.body } };
        try {
          return await D.saveGuarded({
            templateId: doc.templateId || DOC_TEMPLATE_ID,
            context: DOC_CONTEXT,
            title: typeof doc.title === 'string' ? doc.title : '',
            lang: doc.lang || '',
            format: 'text',
            subject: doc.subject || null,
            body: String(doc.body || ''),
            pages: [],
            edited: !!edited,
            ref: docRef(projectId),
            entityTitle: row.title || '',
            data: docData(row),
            reason: reason,
          }, [guard]);
        } catch (err) {
          if (!(err && err.message === 'cwdb-batch-precondition' && err.store === 'journalEntries')) {
            throw new Error('journal-docs-archive-failed');
          }
          /* Предусловие сорвалось — снимок НЕ записан. Причину уточняет
             docProject() на следующем круге (защищён / архив / удалён). */
        }
      }
      await docProject(projectId);
      throw new Error('journal-docs-changed');
    },
  };

  /* ═══ Проекты района (J7) ════════════════════════════════════════════════
   * Проект — строка journalEntries с type:'project'. Своего хранилища нет.
   *  - владелец — район: nodeId = circuitId = id района; type/nodeId/
   *    circuitId неизменяемы;
   *  - текст пользователя — только title (обязателен) и body
   *    (необязателен; пустой — поля нет физически). fields во время жизни
   *    проекта нет вовсе; в архиве — только { statusBeforeArchive } (enum);
   *  - status: 'active' ↔ 'completed' (complete/reopen); любой из двух →
   *    'archived' (archivedAt); unarchive — прежний статус, archivedAt и
   *    statusBeforeArchive удаляются физически. «Завершён» ≠ архив.
   *    update() статус не меняет (journal-project-use-lifecycle);
   *  - архивный проект — только чтение (текст и связи);
   *  - отношения — ТОЛЬКО строки journalLinks, всегда от проекта:
   *    journal:entry/<проект> → цель. Узел (собрание/группа/предгруппа) —
   *    rel 'covers'; посещение, запись, задача — 'relates'; внешняя ссылка
   *    cw: — 'external'. Цель — только из того же района. Никаких
   *    projectIds/linkedItems в fields ни у проекта, ни у цели;
   *  - прогресс, счётчики, «история» — вычисление при чтении, не запись;
   *  - remove() — только без связей (в обе стороны); каскада нет — ни
   *    задачи, ни записи, ни узлы с проектом не удаляются. Безопасная
   *    альтернатива — archive(). */
  var PROJECT_STATUSES = ['active', 'completed', 'archived'];
  var PROJECT_NODE_TARGETS = ['congregation', 'group', 'pregroup'];
  var PROJECT_ENTRY_TARGETS = ['visit', 'note', 'observation', 'question', 'todo'];
  var PROJECT_STATUS_RANK = { active: 0, completed: 1, archived: 2 };

  async function projectOrThrow(id) {
    var p = id ? await entriesBase.get(id) : null;
    if (!p || p.type !== 'project') throw new Error('journal-project-not-found');
    return p;
  }
  function cleanTitle(v) {
    if (typeof v !== 'string' || !v.trim()) throw new Error('journal-project-empty-title');
    return v.replace(/\s+/g, ' ').trim();
  }
  function cleanProjectBody(v) {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') throw new Error('journal-project-invalid-body');
    return v.replace(/\r\n?/g, '\n').replace(/\s+$/, '').replace(/^(?:[ \t]*\n)+/, '');
  }
  function sortProjects(list) {
    return list.slice().sort(function (a, b) {
      var ra = PROJECT_STATUS_RANK[a.status] === undefined ? 9 : PROJECT_STATUS_RANK[a.status];
      var rb = PROJECT_STATUS_RANK[b.status] === undefined ? 9 : PROJECT_STATUS_RANK[b.status];
      if (ra !== rb) return ra - rb;
      if ((a.createdAt || '') !== (b.createdAt || '')) return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
  async function setProjectStatus(id, from, to) {
    var p = await projectOrThrow(id);
    if (from.indexOf(p.status) === -1) throw new Error('journal-project-invalid-transition');
    return entriesBase.update(id, { status: to });
  }
  /** Цель связи проекта → rel; все отказы — до записи. */
  async function projectTarget(p, ref) {
    var t = parseUrn(ref);
    if (!t) throw new Error('journal-link-invalid-urn');
    if (t.scope === 'cw') return { parsed: t, row: null, rel: 'external' };
    var row = await endpointRow(t);
    if (t.kind === 'node') {
      if (PROJECT_NODE_TARGETS.indexOf(row.kind) === -1) throw new Error('journal-project-invalid-target');
    } else {
      if (row.id === p.id) throw new Error('journal-link-self');
      if (PROJECT_ENTRY_TARGETS.indexOf(row.type) === -1) throw new Error('journal-project-invalid-target');
    }
    if (row.circuitId !== p.circuitId) throw new Error('journal-link-cross-circuit');
    return { parsed: t, row: row, rel: t.kind === 'node' ? 'covers' : 'relates' };
  }

  var projects = {
    STATUSES: PROJECT_STATUSES,
    NODE_TARGETS: PROJECT_NODE_TARGETS,
    ENTRY_TARGETS: PROJECT_ENTRY_TARGETS,
    sort: sortProjects,
    get: async function (id) {
      var p = id ? await entriesBase.get(id) : null;
      return p && p.type === 'project' ? p : null;
    },
    /** Все проекты Журнала: active → completed → archived, новые сверху, id. */
    list: async function () { return sortProjects(await entriesBase.by('type', 'project')); },
    byCircuit: async function (circuitId) {
      return sortProjects((await entriesBase.by('circuitId', circuitId)).filter(function (e) { return e.type === 'project'; }));
    },
    /** add({ circuitId, title, body? }). Остальные поля не принимаются. */
    add: async function (record) {
      record = record || {};
      var c = record.circuitId ? await db().journalNodes.get(record.circuitId) : null;
      if (!c || c.kind !== 'circuit' || c.status === 'archived') throw new Error('journal-project-invalid-circuit');
      var title = cleanTitle(record.title);
      var body = cleanProjectBody(record.body);
      var row = { type: 'project', nodeId: c.id, circuitId: c.id, status: 'active', title: title };
      if (body) row.body = body;
      return entriesBase.add(row);
    },
    /** update(id, { title?, body? }). body '' / null — описание снимается
     *  (поле удаляется физически). type/nodeId/circuitId — неизменяемы;
     *  status/archivedAt/fields — только через цикл. */
    update: async function (id, patch) {
      patch = patch || {};
      var p = await projectOrThrow(id);
      Object.keys(patch).forEach(function (k) {
        if (k === 'title' || k === 'body') return;
        if (k === 'status' || k === 'archivedAt' || k === 'fields') throw new Error('journal-project-use-lifecycle');
        if ((k === 'type' || k === 'nodeId' || k === 'circuitId') && patch[k] === p[k]) return;
        throw new Error('journal-project-immutable');
      });
      if (p.status === 'archived') throw new Error('journal-project-readonly');
      var title = 'title' in patch ? cleanTitle(patch.title) : undefined;
      var body = 'body' in patch ? cleanProjectBody(patch.body) : undefined;
      if (isProtected(p) && (title !== undefined || body !== undefined)) {
        var textPatch = {};
        if (title !== undefined) textPatch.title = title;
        if (body !== undefined) textPatch.body = body || undefined; // пусто — поля нет
        return writeProtectedText(p, textPatch);
      }
      return replaceEntry(id, function (next) {
        if (title !== undefined) next.title = title;
        if (body !== undefined) { if (body) next.body = body; else delete next.body; }
        return next;
      });
    },
    complete: function (id) { return setProjectStatus(id, ['active'], 'completed'); },
    reopen: function (id) { return setProjectStatus(id, ['completed'], 'active'); },
    archive: async function (id) {
      var p = await projectOrThrow(id);
      if (p.status !== 'active' && p.status !== 'completed') throw new Error('journal-project-invalid-transition');
      return replaceEntry(id, function (next) {
        next.fields = Object.assign({}, next.fields || {}, { statusBeforeArchive: p.status });
        next.status = 'archived';
        next.archivedAt = now();
        return next;
      });
    },
    unarchive: async function (id) {
      var p = await projectOrThrow(id);
      if (p.status !== 'archived') throw new Error('journal-project-invalid-transition');
      return replaceEntry(id, function (next) {
        var back = next.fields && next.fields.statusBeforeArchive;
        next.status = back === 'completed' ? 'completed' : 'active';
        delete next.archivedAt;
        if (next.fields) {
          delete next.fields.statusBeforeArchive;
          if (!Object.keys(next.fields).length) delete next.fields;
        }
        return next;
      });
    },
    /** Удаление только проекта без связей (from/to). Каскада нет. */
    remove: async function (id) {
      await projectOrThrow(id);
      if ((await links.forRef(urn.entry(id))).length) throw new Error('journal-project-has-links');
      return entriesBase.remove(id);
    },

    /** Связать проект с целью (URN). Направление всегда проект → цель,
     *  rel выводится из вида цели. Повтор — тот же id, без новой строки. */
    link: async function (projectId, ref) {
      var p = await projectOrThrow(projectId);
      if (p.status === 'archived') throw new Error('journal-project-readonly');
      var tg = await projectTarget(p, ref);
      await assertAssociationMutable(tg.parsed, tg.row, true);
      return insertLink(urn.entry(p.id), ref, tg.rel);
    },
    /** Снять связь проект → цель (любого rel). Цель не удаляется. → число снятых. */
    unlink: async function (projectId, ref) {
      var p = await projectOrThrow(projectId);
      var rows = await links.between(urn.entry(p.id), ref);
      if (!rows.length) return 0;
      for (var i = 0; i < rows.length; i++) await assertLinkRemovable(rows[i], true);
      for (var j = 0; j < rows.length; j++) await db().journalLinks.remove(rows[j].id);
      return rows.length;
    },
    /** Исходящие связи проекта (канон: всё, чем проект владеет). */
    links: function (projectId) { return links.outgoing(urn.entry(projectId)); },
    /** Проекты, связанные с целью (входящие от проектов), по порядку проектов. */
    forTarget: async function (ref) {
      var rows = await links.incoming(ref);
      var out = [], seen = {};
      for (var i = 0; i < rows.length; i++) {
        var pr = parseUrn(rows[i].from);
        if (!pr || pr.kind !== 'entry' || seen[pr.id]) continue;
        var p = await entriesBase.get(pr.id);
        if (p && p.type === 'project') { seen[p.id] = true; out.push(p); }
      }
      return sortProjects(out);
    },
    /**
     * Связанное с проектом — разрешённое в памяти, ничего не пишется:
     *   { project, nodes[{link,node}], tasks[{link,row}], items[{link,row,
     *     visit}], external[{link,parsed}], missing, progress{done,total} }
     * tasks — все связанные todo (самостоятельные и из посещений) в порядке
     * связывания; items — прочие записи/посещения, новые связи сверху.
     */
    related: async function (projectId) {
      var p = await projectOrThrow(projectId);
      var rows = await links.outgoing(urn.entry(p.id));
      var out = { project: p, nodes: [], tasks: [], items: [], external: [], missing: 0, progress: { done: 0, total: 0 } };
      var taskLink = {};
      for (var i = 0; i < rows.length; i++) {
        var l = rows[i], t = parseUrn(l.to);
        if (!t) { out.missing++; continue; }
        if (t.scope === 'cw') { out.external.push({ link: l, parsed: t }); continue; }
        if (t.kind === 'node') {
          var n = await db().journalNodes.get(t.id);
          if (n) out.nodes.push({ link: l, node: n }); else out.missing++;
          continue;
        }
        var e = await entriesBase.get(t.id);
        if (!e) { out.missing++; continue; }
        if (e.type === 'todo') { taskLink[e.id] = l; out.tasks.push(e); continue; }
        out.items.push({ link: l, row: e, visit: e.type === 'visit' ? e : (hasVisitRef(e) ? await entriesBase.get(e.fields.visitId) : null) });
      }
      // Порядок чек-листа проекта — порядок связывания (связи уже по
      // createdAt): отметка «выполнено» не переставляет строку.
      out.tasks = out.tasks.map(function (r) { return { link: taskLink[r.id], row: r }; });
      out.progress.total = out.tasks.length;
      out.progress.done = out.tasks.filter(function (x) { return x.row.status === 'done'; }).length;
      out.items.reverse();
      return out;
    },
    /** Прогресс: выполненные / все связанные задачи. Не хранится. */
    progress: async function (projectId) { return (await projects.related(projectId)).progress; },
    /** Новая задача проекта: задача района через CWJournal.tasks + связь
     *  проект → задача. Если связь не записалась — только что созданная
     *  (ещё ни с чем не связанная) задача удаляется: полусостояния
     *  «задача без проекта» после ошибки не остаётся. */
    addTask: async function (projectId, record) {
      var p = await projectOrThrow(projectId);
      if (p.status === 'archived') throw new Error('journal-project-readonly');
      record = record || {};
      var taskId = await tasks.add({ nodeId: p.nodeId, body: record.body, dueDate: record.dueDate });
      try {
        await projects.link(p.id, urn.entry(taskId));
      } catch (err) {
        try { await entriesBase.remove(taskId); } catch (_) { err.orphanTaskId = taskId; }
        throw err;
      }
      return taskId;
    },
  };

  /* J8: `crypto:*` — только через CWJournal.protection. Общий meta.put мог
     бы заменить обёртку ключа и оставить шифротексты без ключа. */
  function assertMetaId(id) {
    if (typeof id === 'string' && id.indexOf('crypto:') === 0) throw new Error('journal-meta-reserved');
  }
  var meta = {
    get: function (id) { return db().journalMeta.get(id); },
    put: function (record) {
      try { assertMetaId(record && record.id); } catch (e) { return Promise.reject(e); }
      return db().journalMeta.put(record);
    },
    update: function (id, patch) {
      try { assertMetaId(id); } catch (e) { return Promise.reject(e); }
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


  /* ═══ Защита (J8) ═══════════════════════════════════════════════════════
   * Шифрование при хранении для явно защищённого текста записей. Примитивы
   * и сессия — journal/js/crypto.js (CWJournalCrypto); здесь — политика
   * хранения и доменные правила.
   *
   *  - Защищаются только title/body (проект — оба, задача/запись посещения/
   *    перенос — body). Всё остальное (id, type, status, nodeId, circuitId,
   *    даты, dueDate, carryKey, touches, fields, archivedAt, метки времени,
   *    связи) остаётся открытым — это метаданные.
   *  - Строка с `sec` НЕ хранит title/body ни в каком виде
   *    (assertEntryPersistable — на каждой записи).
   *  - Чтение при открытой сессии отдаёт ВРЕМЕННЫЕ копии: title/body на них —
   *    неперечислимые свойства, поэтому структурное клонирование IndexedDB,
   *    JSON и Object.assign/спред их не переносят; прямая запись такой
   *    копии отклоняется стражем (sec + title/body).
   *  - Смена текста: расшифровать → применить → зашифровать с новым iv →
   *    записать только шифротекст. Метаданные — без расшифровки, sec байт в
   *    байт. Удаление — без расшифровки.
   *  - Запись идёт пакетом CWDB.batch с предусловиями: строка не менялась с
   *    чтения, сейф тот же, от которого получен ключ (восстановление копии в
   *    другой вкладке не смешает шифротексты двух ключей).
   *  - Сейф (`crypto:v1`) заводится только при первой защите, тем же
   *    пакетом, что и первая зашифрованная строка. Автоматического
   *    «восстановления» нет: потерянная фраза = потерянный текст.
   */
  var PROTECTED_FIELDS = ['title', 'body'];
  var VAULT_ID = 'crypto:v1';
  var REVEALED = new WeakSet();
  var UNREADABLE = new WeakSet();

  function cryptoApi() { return global.CWJournalCrypto || null; }
  function requireCrypto() {
    var C = cryptoApi();
    if (!C) throw new Error('journal-crypto-unavailable');
    return C;
  }
  function unlockedKey() {
    var C = cryptoApi();
    return C && C.session.isUnlocked() ? C.session.key() : null;
  }

  function assertEntryPersistable(row) {
    if (!row || !('sec' in row)) return;
    var bad = requireCrypto().validateSec(row.sec);
    if (bad) throw new Error(bad);
    for (var i = 0; i < PROTECTED_FIELDS.length; i++) {
      if (PROTECTED_FIELDS[i] in row) throw new Error('journal-protected-plaintext');
    }
  }

  function textOf(row) {
    var out = {};
    PROTECTED_FIELDS.forEach(function (k) { if (typeof row[k] === 'string') out[k] = row[k]; });
    return out;
  }
  function makeView(row, plain) {
    var v = Object.assign({}, row);
    PROTECTED_FIELDS.forEach(function (k) {
      if (typeof plain[k] === 'string') {
        Object.defineProperty(v, k, { value: plain[k], enumerable: false, writable: false, configurable: false });
      }
    });
    REVEALED.add(v);
    return v;
  }
  function vaultRow() { return db().journalMeta.get(VAULT_ID); }
  function vaultExpect(vault) {
    return { type: 'expect', store: 'journalMeta', key: VAULT_ID, match: { wrap: vault.wrap } };
  }
  /** Сейф, от которого получен ключ сессии, на месте? Иначе — блокировка. */
  async function sessionVault() {
    var C = requireCrypto();
    if (!C.session.isUnlocked()) throw new Error('journal-vault-locked');
    var vault = await vaultRow();
    if (!vault || C.validateVault(vault) || vault.wrap.ct !== C.session.mark()) {
      C.session.lock('vault-changed');
      throw new Error('journal-vault-changed');
    }
    return vault;
  }
  async function revealRow(row) {
    if (!isProtected(row) || REVEALED.has(row) || UNREADABLE.has(row)) return row;
    var key = unlockedKey();
    if (!key) return row;
    try {
      return makeView(row, await cryptoApi().decryptEntry(key, row.id, row.sec));
    } catch (e) {
      var copy = Object.assign({}, row);
      UNREADABLE.add(copy);
      return copy;
    }
  }
  async function revealList(list) {
    if (!Array.isArray(list) || !unlockedKey()) return list;
    if (!list.some(function (r) { return isProtected(r) && !REVEALED.has(r); })) return list;
    try { await sessionVault(); } catch (e) { return list; }
    return Promise.all(list.map(revealRow));
  }
  async function revealOne(row) { return row && isProtected(row) ? (await revealList([row]))[0] : row; }
  function revealing(fn) {
    return async function () {
      var res = await fn.apply(this, arguments);
      return Array.isArray(res) ? revealList(res) : revealOne(res);
    };
  }

  async function commitBatch(ops) {
    try {
      return await db().batch(ops);
    } catch (e) {
      if (e && e.message === 'cwdb-batch-precondition') {
        var op = ops[e.opIndex] || {};
        if (op.store === 'documents') throw new Error('journal-protect-has-documents');
        if (op.store === 'journalMeta') {
          var C = cryptoApi();
          if (C) C.session.lock('vault-changed');
          throw new Error('journal-vault-changed');
        }
        throw new Error('journal-protected-conflict');
      }
      if (e && e.name === 'ConstraintError') throw new Error('journal-vault-exists');
      throw e;
    }
  }

  /* J8-H1: предусловие «строка та же, что до шифрования». Пути J8, которые
     после асинхронной криптографии пишут строку ЦЕЛИКОМ из ранее прочитанной
     сырой копии (защита/первая настройка, снятие защиты, правка
     защищённого текста), требуют, чтобы строка в базе совпала со снимком
     полностью: те же поля и значения, ни одного добавленного (dueDate,
     carryKey, touches, fields, archivedAt, …; общий фасад записей допускает
     и произвольные поля — поэтому целиком, а не по списку). updatedAt в ту
     же миллисекунду больше ничего не решает. Не совпало — пакет отказывает
     (journal-protected-conflict), чужая строка не тронута. Снимок — только
     сырые перечислимые поля (раскрытые копии J8 сюда не попадают). */
  function snapshotGuard(cur) {
    return { match: JSON.parse(JSON.stringify(cur)), exact: true };
  }
  function guardedPut(cur, next) {
    var g = snapshotGuard(cur);
    return { type: 'put', store: 'journalEntries', value: next, match: g.match, exact: g.exact };
  }

  /** Защищённый текст: новое значение шифруется новым iv; открытый текст
   *  не пишется; `applyMeta` добавляет метаданные той же записью. */
  async function writeProtectedText(cur, textPatch, applyMeta) {
    var C = requireCrypto();
    var vault = await sessionVault();
    var key = C.session.key();
    var plain = await C.decryptEntry(key, cur.id, cur.sec);
    Object.keys(textPatch).forEach(function (k) {
      if (textPatch[k] === undefined) delete plain[k]; else plain[k] = textPatch[k];
    });
    var sec = await C.encryptEntry(key, cur.id, plain);
    var next = Object.assign({}, cur);
    delete next.title;
    delete next.body;
    if (applyMeta) applyMeta(next);
    next.sec = sec;
    next.id = cur.id;
    next.updatedAt = now();
    assertEntryPersistable(next);
    await commitBatch([vaultExpect(vault), guardedPut(cur, next)]);
    return next;
  }

  async function assertProtectable(r) {
    if (!r) throw new Error('journal-entry-not-found');
    if (r.type === 'visit') throw new Error('journal-protect-unsupported');
    if (hasVisitRef(r)) await editableVisit(r.fields.visitId);
    if (r.type === 'project' && r.status === 'archived') throw new Error('journal-project-readonly');
  }
  function protectOp(cur, sec) {
    var next = Object.assign({}, cur);
    delete next.title;
    delete next.body;
    next.sec = sec;
    next.updatedAt = now();
    assertEntryPersistable(next);
    return guardedPut(cur, next);
  }
  /* J9b: предусловие «у проекта нет снимков в архиве» — внутри пакета
     защиты (expectNone по индексу entityKey хранилища documents). Сорвалось
     → commitBatch() отвечает journal-protect-has-documents, строка остаётся
     открытой. Для не-проектов — ничего. */
  function noDocumentsOps(row) {
    if (!row || row.type !== 'project') return [];
    var D = docsApi();
    if (!D || typeof D.refKey !== 'function') throw new Error('journal-protect-docs-unknown');
    return [{ type: 'expectNone', store: 'documents', index: 'entityKey', value: D.refKey(docRef(row.id)) }];
  }
  async function countProtected() { return (await entriesBase.getAll()).filter(isProtected).length; }

  var protection = {
    VAULT_ID: VAULT_ID,
    FIELDS: PROTECTED_FIELDS.slice(),
    isProtected: isProtected,
    /** Защищена и текста в этой копии нет (заблокировано или не читается). */
    isLocked: function (row) { return isProtected(row) && !REVEALED.has(row); },
    isUnreadable: function (row) { return !!row && UNREADABLE.has(row); },
    isUnlocked: function () { return !!unlockedKey(); },
    minPassphrase: function () { var C = cryptoApi(); return C ? C.MIN_PASSPHRASE : 8; },
    canProtect: function (row) { return !!row && row.type !== 'visit'; },
    onChange: function (fn) { var C = cryptoApi(); return C ? C.session.onChange(fn) : function () {}; },
    lock: function (reason) { var C = cryptoApi(); if (C) C.session.lock(reason || 'manual'); },

    /** { state: off|locked|unlocked|broken|unavailable, protectedCount, error? }
     *  Сломанное состояние не чинится автоматически: ни новый сейф поверх
     *  шифротекстов, ни перезапись испорченного `crypto:v1`. */
    status: async function () {
      var C = cryptoApi();
      var vault = await vaultRow();
      var count = await countProtected();
      if (!C) return { state: 'unavailable', protectedCount: count };
      if (vault) {
        var bad = C.validateVault(vault);
        if (bad) { C.session.lock('vault-invalid'); return { state: 'broken', error: bad, protectedCount: count }; }
        if (C.session.isUnlocked() && C.session.mark() !== vault.wrap.ct) C.session.lock('vault-changed');
        return { state: C.session.isUnlocked() ? 'unlocked' : 'locked', protectedCount: count };
      }
      if (C.session.isUnlocked()) C.session.lock('vault-changed');
      return count ? { state: 'broken', error: 'journal-vault-missing', protectedCount: count } : { state: 'off', protectedCount: 0 };
    },

    /** Неверная фраза или подменённая обёртка — отказ; в базу ничего. */
    unlock: async function (passphrase) {
      var C = requireCrypto();
      var vault = await vaultRow();
      if (!vault) throw new Error((await countProtected()) ? 'journal-vault-missing' : 'journal-vault-off');
      var key = await C.openVault(vault, passphrase);
      C.session.open(key, vault.wrap.ct);
      return true;
    },

    /** Первая защита: сейф и (если задана) первая строка — ОДНИМ пакетом.
     *  Отмена/ошибка до пакета — ноль изменений; сбой пакета — откат обоих. */
    setup: async function (passphrase, entryId) {
      var C = requireCrypto();
      if (await vaultRow()) throw new Error('journal-vault-exists');
      if (await countProtected()) throw new Error('journal-vault-missing');
      var cur = null;
      if (entryId !== undefined && entryId !== null) {
        cur = await entriesBase.get(entryId);
        await assertProtectable(cur);
        if (isProtected(cur)) throw new Error('journal-protect-already');
        await assertNoProjectDocuments(cur);
      }
      var v = await C.createVault(passphrase);
      var ops = [{ type: 'add', store: 'journalMeta', value: v.meta }];
      if (cur) ops.push(protectOp(cur, await C.encryptEntry(v.key, cur.id, textOf(cur))));
      /* J9b: сейф + первая защищённая строка фиксируются, только если у
         проекта нет снимков — проверка в той же транзакции. Иначе не пишется
         ничего; сессия открывается лишь после успешной записи. */
      if (cur) ops = ops.concat(noDocumentsOps(cur));
      await commitBatch(ops);
      C.session.open(v.key, v.meta.wrap.ct);
      return true;
    },

    protect: async function (entryId) {
      var C = requireCrypto();
      var vault = await sessionVault();
      var cur = await entriesBase.get(entryId);
      await assertProtectable(cur);
      if (isProtected(cur)) throw new Error('journal-protect-already');
      await assertNoProjectDocuments(cur);
      var sec = await C.encryptEntry(C.session.key(), cur.id, textOf(cur));
      await commitBatch([vaultExpect(vault), protectOp(cur, sec)].concat(noDocumentsOps(cur)));
      return true;
    },

    /** Явное возвращение записи в открытое хранение. */
    unprotect: async function (entryId) {
      var C = requireCrypto();
      var vault = await sessionVault();
      var cur = await entriesBase.get(entryId);
      await assertProtectable(cur);
      if (!isProtected(cur)) throw new Error('journal-protect-not-protected');
      var plain = await C.decryptEntry(C.session.key(), cur.id, cur.sec);
      var next = Object.assign({}, cur);
      delete next.sec;
      PROTECTED_FIELDS.forEach(function (k) { if (typeof plain[k] === 'string') next[k] = plain[k]; });
      next.updatedAt = now();
      await commitBatch([vaultExpect(vault), guardedPut(cur, next)]);
      return true;
    },

    /** Тот же DEK под новой фразой; записи не перешифровываются. */
    changePassphrase: async function (oldPassphrase, newPassphrase) {
      var C = requireCrypto();
      var vault = await vaultRow();
      if (!vault) throw new Error('journal-vault-off');
      var next = await C.rewrapVault(vault, oldPassphrase, newPassphrase);
      await commitBatch([{ type: 'put', store: 'journalMeta', value: next, match: { wrap: vault.wrap } }]);
      if (C.session.isUnlocked() && C.session.mark() === vault.wrap.ct) C.session.remark(next.wrap.ct);
      return true;
    },
  };

  /* Публичные чтения отдают временные копии при открытой сессии. Внутренние
     пути (entriesBase, *OrThrow) по-прежнему видят сырые строки. */
  ['get', 'getAll', 'byNode', 'byCircuit', 'byType', 'byStatus', 'openCarry'].forEach(function (k) { entries[k] = revealing(entries[k]); });
  visits.children = revealing(visits.children);
  visitRecords.get = revealing(visitRecords.get);
  visitRecords.byVisit = revealing(visitRecords.byVisit);
  tasks.get = revealing(tasks.get);
  tasks.list = revealing(tasks.list);
  ['openForNode', 'incoming', 'markedIn'].forEach(function (k) { carry[k] = revealing(carry[k]); });
  ['get', 'list', 'byCircuit', 'forTarget'].forEach(function (k) { projects[k] = revealing(projects[k]); });
  var relatedRaw = projects.related;
  projects.related = async function (projectId) {
    var out = await relatedRaw(projectId);
    if (!unlockedKey()) return out;
    out.project = await revealOne(out.project);
    var tRows = await revealList(out.tasks.map(function (x) { return x.row; }));
    out.tasks.forEach(function (x, i) { x.row = tRows[i]; });
    var iRows = await revealList(out.items.map(function (x) { return x.row; }));
    out.items.forEach(function (x, i) { x.row = iRows[i]; });
    return out;
  };

  /* ═══ Данные Обзора (O1) ═════════════════════════════════════════════
   * ТОЛЬКО ЧТЕНИЕ, по требованию, в памяти: одно чтение узлов и записей
   * (snapshot) — пять выборок для Обзора. Ничего не пишется, не кэшируется
   * и не индексируется: ни хранилища Обзора, ни материализованного списка,
   * ни следа в localStorage/CWState. Каждый read() читает базу заново.
   *
   * Архивность «в контексте» — то же вычисление, что у поиска/архива
   * (snap.nodeArchived/entryArchived), не новое правило:
   *  - circuits — районы вне архива, порядок sortNodes;
   *  - tasks    — открытые задачи (status ≠ 'done') вне архивного контекста
   *               (своего, узла или посещения-источника), порядок
   *               tasks.sort — тот же, что у экрана «Задачи»;
   *  - carry    — открытые пункты переноса (carryKey есть) вне архивного
   *               контекста; порядок — посещение-источник (visitBefore),
   *               затем fields.seq, id — как у carry.incoming;
   *  - projects — active-проекты существующих неархивных районов (семантика
   *               блока «Проекты района» Обзора), порядок projects.sort;
   *  - visits   — посещения вне архивного контекста (open и completed),
   *               новые сверху (порядок visits.byNode). Элемент —
   *               { visit, nodeId, nodeKind, circuitId, congregationId }:
   *               congregationId — сам узел-собрание или собрание-родитель
   *               группы/предгруппы (для CWJournalRoute.build.visit/visits).
   *
   * J8: строки берутся сырыми и раскрываются только ИТОГОВЫЕ — тем же
   * revealList, что у tasks.list, carry и projects: заблокировано — строка
   * с sec и без title/body; разблокировано — временная копия с
   * неперечислимым текстом. Счётчиков записей «для красоты» нет. */
  function sortCarryItems(list, entryById) {
    return list.slice().sort(function (a, b) {
      var oa = entryById[a.fields.visitId], ob = entryById[b.fields.visitId];
      if (oa && ob && oa.id !== ob.id) return visitBefore(oa, ob) ? -1 : 1;
      if (!!oa !== !!ob) return oa ? -1 : 1;
      var sa = a.fields.seq || 0, sb = b.fields.seq || 0;
      if (sa !== sb) return sa - sb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
  var overview = {
    read: async function () {
      var snap = await snapshot(false);
      var circuits = sortNodes(snap.nodes.filter(function (n) {
        return n.kind === 'circuit' && !snap.nodeArchived(n.id);
      }));
      var liveCircuit = {};
      circuits.forEach(function (c) { liveCircuit[c.id] = true; });
      var taskRows = [], carryRows = [], projectRows = [], visitRows = [];
      snap.entries.forEach(function (e) {
        if (!e || snap.entryArchived(e)) return;
        if (e.type === 'todo' && e.status !== 'done') taskRows.push(e);
        if (e.type !== 'visit' && 'carryKey' in e && hasVisitRef(e) && VISIT_RECORD_TYPES.indexOf(e.type) !== -1) carryRows.push(e);
        if (e.type === 'project' && e.status === 'active' && liveCircuit[e.circuitId]) projectRows.push(e);
        if (e.type === 'visit') visitRows.push(e);
      });
      var visitsOut = sortVisits(visitRows).map(function (v) {
        var node = snap.nodeById[v.nodeId] || null;
        var cong = node && node.kind === 'congregation' ? node
          : node && snap.nodeById[node.parentId] && snap.nodeById[node.parentId].kind === 'congregation' ? snap.nodeById[node.parentId] : null;
        return { visit: v, nodeId: v.nodeId, nodeKind: node ? node.kind : null,
          circuitId: v.circuitId || (node && node.circuitId) || null, congregationId: cong ? cong.id : null };
      });
      return {
        circuits: circuits,
        tasks: await revealList(sortTasks(taskRows)),
        carry: await revealList(sortCarryItems(carryRows, snap.entryById)),
        projects: await revealList(sortProjects(projectRows)),
        visits: visitsOut,
      };
    },
  };

  /* ═══ Граница интеграции (J9c): задачи Журнала для общего To Do ══════
   * ТОЛЬКО ЧТЕНИЕ. Владелец данных и правил — CWJournal.tasks; здесь нет ни
   * complete/reopen, ни правки, ни удаления. Строки читаются СЫРЫМИ
   * (entriesBase, без раскрытия J8): у защищённой задачи text = null даже
   * при разблокированном Журнале, sec/шифротекст наружу не выходят. Одна
   * строка type='todo' — одна задача; перенос и связи проектов в новую
   * структуру не копируются. Результат — свежие объекты, нигде не хранятся. */
  var TASK_ID = /^[A-Za-z0-9._~@+-]{1,200}$/;
  function taskView(r, visitsById) {
    var prot = isProtected(r);
    var visitId = hasVisitRef(r) ? r.fields.visitId : null;
    var v = visitId ? visitsById[visitId] : null;
    return {
      id: r.id,
      status: r.status === 'done' ? 'done' : 'open',
      dueDate: isIsoDate(r.dueDate) ? r.dueDate : null,
      text: prot ? null : (typeof r.body === 'string' ? r.body : ''),
      protected: prot,
      mutable: visitId ? !!(v && v.type === 'visit' && v.status === 'open') : true,
      origin: visitId
        ? { kind: 'visit', nodeId: r.nodeId || null, circuitId: r.circuitId || null, visitId: visitId }
        : { kind: 'standalone', nodeId: r.nodeId || null, circuitId: r.circuitId || null },
      createdAt: r.createdAt || null,
      updatedAt: r.updatedAt || null,
    };
  }
  async function taskViews(rows) {
    var ids = {};
    rows.forEach(function (r) { if (hasVisitRef(r)) ids[r.fields.visitId] = true; });
    var visitsById = {};
    await Promise.all(Object.keys(ids).map(async function (id) { visitsById[id] = await entriesBase.get(id); }));
    return sortTasks(rows).map(function (r) { return taskView(r, visitsById); });
  }
  var integration = {
    CHANNEL: CHANNEL_NAME,
    /** Все задачи Журнала (open сначала — порядок контракта tasks.list()). */
    tasks: async function () { return taskViews(await entriesBase.by('type', 'todo')); },
    /** Одна задача по родному id или null (кривой id — null). */
    task: async function (id) {
      if (typeof id !== 'string' || !TASK_ID.test(id)) return null;
      var r = await entriesBase.get(id);
      return r && r.type === 'todo' ? (await taskViews([r]))[0] : null;
    },
    isTaskId: function (id) { return typeof id === 'string' && TASK_ID.test(id); },
    /** Изменения записей и узлов: в этой вкладке и в соседних (BroadcastChannel). */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      journalChannel();
      changeListeners.push(fn);
      return function () { changeListeners = changeListeners.filter(function (x) { return x !== fn; }); };
    },
  };

  global.CWJournal = {
    nodes: nodes,
    entries: entries,
    visits: visits,
    visitRecords: visitRecords,
    tasks: tasks,
    carry: carry,
    search: search,
    archive: archive,
    links: links,
    planner: planner,
    documents: documents,
    integration: integration,
    overview: overview,
    projects: projects,
    meta: meta,
    protection: protection,
    urn: urn,
    carryKeyFor: carryKeyFor,
    sortNodes: sortNodes,
    ROOT_PARENT: ROOT_PARENT,
    KINDS: KINDS,
    TYPES: ['note', 'project', 'question', 'todo', 'visit', 'observation'],
    RELS: ['relates', 'covers', 'source', 'mentions', 'external'],
  };
})(typeof self !== 'undefined' ? self : globalThis);
