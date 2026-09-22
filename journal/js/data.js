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

  var entriesBase = rowsApi('journalEntries');
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
      return replaceEntry(id, function (next) {
        if (body !== undefined) next.body = body;
        if (clearDue) delete next.dueDate;
        else if ('dueDate' in patch) next.dueDate = patch.dueDate;
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
  async function snapshot() {
    var nodesAll = await nodesBase.getAll();
    var entriesAll = await entriesBase.getAll();
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
      var snap = await snapshot();
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
        if (isProtected(e)) {
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
      var snap = await snapshot();
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
      await assertAssociationMutable(e.pf, e.rf, true);
      await assertAssociationMutable(e.pt, e.rt, true);
      return insertLink(record.from, record.to, record.rel);
    },
    /** Удаление строки связи. Отсутствующая — не ошибка (уже удалена). */
    remove: async function (id) {
      var l = await db().journalLinks.get(id);
      if (!l) return;
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
    visits: visits,
    visitRecords: visitRecords,
    tasks: tasks,
    carry: carry,
    search: search,
    archive: archive,
    links: links,
    projects: projects,
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
