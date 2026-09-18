/**
 * Circuit Workspace — shared/state.js
 * Состояние модуля в общей базе. Фаза 2 трека «миграция на shared/db.js».
 *
 * ─── ЧТО ЭТО ────────────────────────────────────────────────────────────────
 *
 * Один модуль — одна запись в хранилище `state` общей базы: тот же JSON-блоб,
 * что раньше лежал в localStorage под ключом модуля. Схема данных при этом НЕ
 * меняется: разбор блоба на записи (`events[]` → `communities`) — фаза 5, и
 * смешивать её с переездом нельзя. Здесь меняется только место хранения:
 * снимается лимит в 5 МБ, из-за которого модуль однажды упирался в квоту
 * посреди работы.
 *
 * Пара к `shared/persist.js`: тот решает КОГДА писать, этот — КУДА.
 *
 * ─── ГЛАВНАЯ ТРУДНОСТЬ: ЗАПИСЬ ПРИ ЗАКРЫТИИ ВКЛАДКИ ─────────────────────────
 *
 * `pagehide` синхронен и промис ждать не умеет — а запись в IndexedDB
 * асинхронна. Значит последняя правка перед закрытием уедет в никуда, причём
 * бесшумно: пользователь видел её на экране, а после перезапуска её нет. Это
 * было названо обязательным условием фазы 2 ещё в аудите.
 *
 * РЕШЕНИЕ — СИНХРОННОЕ ЗЕРКАЛО. На закрытии блоб пишется в localStorage под
 * `cw-state-mirror:<module>` вместе с отметкой времени. При следующей загрузке
 * зеркало сверяется с записью в базе, и если оно новее — оно и есть истина:
 * содержимое уезжает в базу, зеркало стирается. То есть localStorage остаётся
 * в схеме, но не как хранилище, а как записка «вот это не успело доехать».
 *
 * ПОЧЕМУ НЕ ПИСАТЬ ЗЕРКАЛО ВСЕГДА. Тогда переезд не дал бы ничего: квота
 * упиралась бы в те же 5 МБ. Зеркало живёт от закрытия вкладки до следующей
 * загрузки и стирается сразу после сверки.
 *
 * ─── ВТОРАЯ ТРУДНОСТЬ: СОСЕДНЯЯ ВКЛАДКА ─────────────────────────────────────
 *
 * Запись в IndexedDB НЕ порождает событие `storage`, а синхронизация между
 * вкладками в Клиндарии построена именно на нём. Молча потерять её при
 * переезде было бы легко: в одной вкладке работает, в двух — расходятся, и
 * никакой ошибки. Поэтому после каждой успешной записи в базу обновляется
 * маячок `cw-state-rev:<module>` — крошечное значение в localStorage,
 * единственная задача которого разбудить соседнюю вкладку. Соседка по
 * событию перечитывает базу.
 *
 * ─── ЧТО ОСТАЁТСЯ В СТАРОМ КЛЮЧЕ ────────────────────────────────────────────
 *
 * Прежний ключ модуля (`service-year-planner-v9-4-2` и т.п.) в фазе 2 НЕ
 * удаляется и не переписывается. Он остаётся снимком «как было до переезда» —
 * это и есть обратимость фазы: откат версии возвращает пользователя к своим
 * данным. Удаление — отдельное решение, после того как переезд отработает у
 * живого пользователя. Ключ Клиндария нельзя менять категорически.
 *
 * `self` вместо `window` — файл единообразен с остальным общим слоем.
 */
(function (global) {
  'use strict';

  var STORE = 'state';
  var MIRROR_PREFIX = 'cw-state-mirror:';
  var REV_PREFIX = 'cw-state-rev:';

  /* Сколько ждём базу при запуске. Модуль не может начать отрисовку, пока не
     знает своих данных, поэтому ожидание здесь блокирует старт — и именно
     поэтому у него обязан быть предел. Заблокированное обновление схемы
     (открыта вкладка со старой версией) иначе означало бы не «медленно», а
     «приложение не открылось вообще». По истечении срока работаем на прежнем
     ключе: данные пользователя на месте, переезд повторится в следующий раз. */
  var OPEN_TIMEOUT_MS = 4000;

  /* ─── КОНВЕРТ ЗАПИСИ (фаза A трека «одна каноническая база») ───────────────
     Каноническая запись: { id, payload, savedAt, rev, writerId }.
     Прежняя { id, payload, savedAt } читается как есть и НЕ переписывается
     ради миграции: отсутствующий `rev` считается нулём, и первая же новая
     запись получит 1. Перезапись «просто чтобы завести поле» стоила бы
     пользователю необратимой операции ради удобства кода.

     `rev` — порядок версий, целое, растёт строго на единицу внутри одной
     транзакции (CWDB.mutate). `savedAt` — время для человека и диагностики,
     порядком НЕ является: часы можно перевести, а Date.now() двух вкладок
     совпадает чаще, чем кажется.

     Прежний ключ модуля в localStorage конверта НЕ получает и формат не
     меняет — иначе предыдущая версия приложения перестала бы его читать.
     Он считается `rev = null` («порядок неизвестен»), и автоматических
     решений о свежести по нему не принимается. */

  /* Кто писал. Идентифицирует РАНТАЙМ — одну вкладку/сессию, не пользователя
     и не модуль. Живёт ровно столько, сколько живёт этот JS-реалм: создаётся
     при загрузке файла, нигде не сохраняется, при закрытии исчезает.
     Возврат из bfcache сохраняет реалм и вместе с ним идентификатор — это
     верно: состояние то же самое, вкладка та же. Новая вкладка — новый id. */
  var WRITER_ID = (function () {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return 'w-' + global.crypto.randomUUID();
      }
    } catch (e) { /* randomUUID требует защищённого контекста — не беда */ }
    return 'w-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }());

  /* Исходы записи. Строки, а не булево: «отказано по ревизии» и «сломалось»
     требуют разной реакции — первое не должно порождать зеркало, второе
     обязано. Публичный write() ниже остаётся булевым ради Клиндария. */
  var WRITTEN = 'written';
  var REFUSED = 'refused';
  var FAILED = 'failed';

  /** Номер ревизии записи. Старая запись без поля — ноль. */
  function revOf(record) {
    if (!record) return 0;
    var n = record.rev;
    return (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : 0;
  }

  function lsGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { global.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function lsDel(key) {
    try { global.localStorage.removeItem(key); } catch (e) { /* приватный режим */ }
  }

  function create(moduleId) {
    var mirrorKey = MIRROR_PREFIX + moduleId;
    var revKey = REV_PREFIX + moduleId;

    var cache = null;        // последний известный блоб (строка) или null
    var ready = false;       // init() отработал
    var usable = false;      // база доступна и ей можно пользоваться
    var hadRecord = false;   // в базе уже была запись — значит переезд состоялся раньше
    var ownRev = null;       // маячок, который поставили мы сами
    /* baseRev — каноническая ревизия, НА КОТОРОЙ основан блоб в памяти этой
       вкладки. Двигается только при initial load, своём подтверждённом
       commit и ЧИСТОМ принятии чужого состояния.
       seenRev — последняя каноническая ревизия, о которой вкладка узнала.
       Расхождение baseRev < seenRev и есть признак конфликта: локальная
       правка основана на версии, которой на диске уже нет. */
    var baseRev = 0;
    var seenRev = 0;
    /* Нерешённая ситуация со стартовым зеркалом. null = всё чисто. */
    var recoveryState = null;
    var inFlight = null;     // текущая запись
    var queued = null;       // последняя нагрузка, ждущая своей очереди (last-wins)
    var queuedPromise = null; // промис ожидающих: разрешается итогом записи queued
    var queuedResolve = null;
    /* Подписка на `storage` ставится РОВНО ОДИН РАЗ (29.08.2026, находка N-6).
       Второй вызов onForeign() прежде вешал второй слушатель, и каждая чужая
       запись читалась из базы дважды, а обработчик модуля вызывался дважды —
       для перерисовки списка это двойная работа, для обработчика с побочным
       действием могло быть и хуже. Такой же флаг уже стоит в shared/i18n.js. */
    var foreignBound = false;
    var foreignCallbacks = [];

    function db() {
      return global.CWDB && global.CWDB[STORE] ? global.CWDB[STORE] : null;
    }

    function readMirror() {
      var raw = lsGet(mirrorKey);
      if (!raw) return null;
      try {
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.payload !== 'string') return null;
        /* `rev` зеркала — БАЗОВАЯ ревизия: та, на которой основан payload,
           а не та, которую собирались создать. Её отсутствие означает
           зеркало прежнего формата, и обращаться с ним нужно осторожнее. */
        var hasRev = typeof parsed.rev === 'number' && isFinite(parsed.rev) && parsed.rev >= 0;
        return {
          at: Number(parsed.at) || 0,
          payload: parsed.payload,
          baseRev: hasRev ? Math.floor(parsed.rev) : null,
          writerId: typeof parsed.writerId === 'string' ? parsed.writerId : null,
        };
      } catch (e) {
        /* Битое зеркало — не повод падать: в базе лежит предыдущее состояние,
           и оно заведомо целое. */
        console.error('CWState: зеркало не разобрано, игнорируем', e);
        return null;
      }
    }

    function bumpRev() {
      ownRev = String(Date.now()) + '.' + Math.random().toString(36).slice(2, 8);
      lsSet(revKey, ownRev);
    }

    /* Запись в базу с очередью. Без очереди две быстрые записи ушли бы в базу
       параллельно, и порядок их завершения не гарантирован — на диске могла
       бы остаться более старая. Здесь одновременно идёт максимум одна, а
       ждущая всегда одна и та же: самая свежая. */
    function put(payload) {
      /* Отложенной нагрузке отдаём СВОЙ промис, а не текущий. Прежде вызывающий
         получал промис уже идущей записи: она относилась к предыдущему блобу и
         разрешалась успехом раньше, чем его собственный доезжал до базы, —
         статус «сохранено» появлялся до подтверждения (I16). Все ожидающие
         разрешаются вместе, по итогу последней нагрузки: очередь last-wins,
         и записанное состояние заведомо не старше их собственного. */
      if (inFlight) {
        queued = payload;
        if (!queuedPromise) {
          queuedPromise = new Promise(function (resolve) { queuedResolve = resolve; });
        }
        return queuedPromise;
      }
      var store = db();
      if (!store) return Promise.resolve(FAILED);
      inFlight = writeRecord(store, payload)
        .then(function (outcome) {
          if (outcome === FAILED) {
            /* Технический отказ БЕЗ исключения — сейчас это путь «нет
               mutate()». Зеркало уже записано в writeRecord(), и стирать его
               здесь нельзя: кроме него правки нигде нет. Маячок тоже не
               трогаем — канон не двигался, будить соседей не о чем. */
            return FAILED;
          }
          if (outcome === REFUSED) {
            /* Канон ушёл вперёд. Ничего не записано, номер не сдвинут.
               Зеркало ЗДЕСЬ НЕ ПИШЕТСЯ: устаревший блоб в нём при следующем
               старте оказался бы кандидатом на восстановление — тот самый
               обходной путь, ради закрытия которого guard и заводился. */
            return REFUSED;
          }
          hadRecord = true;
          bumpRev();
          /* Зеркало сыграло свою роль: то, что оно везло, теперь в базе. */
          lsDel(mirrorKey);
          recoveryState = null;
          return WRITTEN;
        })
        .catch(function (error) {
          /* НАСТОЯЩИЙ технический отказ — квота, прерванная транзакция,
             закрытая база. Здесь зеркало уместно: это спасение одной
             незавершённой правки, основанной на актуальной ревизии. */
          console.error('CWState: запись в базу не удалась, состояние ушло в зеркало', error);
          writeMirror(payload);
          return FAILED;
        })
        .then(function (outcome) {
          inFlight = null;
          if (queued !== null) {
            var next = queued; queued = null;
            var resolve = queuedResolve;
            queuedPromise = null; queuedResolve = null;
            var chained = put(next);
            if (resolve) chained.then(resolve, function () { resolve(FAILED); });
          }
          return outcome;
        });
      return inFlight;
    }

    /* Собственно запись конверта. Номер ревизии берётся из ТЕКУЩЕЙ записи и
       увеличивается внутри той же транзакции — см. CWDB.mutate. Считать его
       снаружи нельзя: две вкладки получили бы одно и то же число.

       Запасной путь через put() нужен только для смешанного кэша: service
       worker мог отдать старый shared/db.js без mutate рядом с этим файлом.
       Тогда запись сохраняется, как раньше, но без `rev` — то есть остаётся
       в прежнем формате, который и так обязан читаться. Терять правку из-за
       отсутствующего метода нельзя. */
    function writeRecord(store, payload) {
      if (typeof store.mutate !== 'function') {
        /* Смешанный кэш service worker'а: новый state.js рядом со старым
           db.js. Прежде здесь шёл обычный put() — теперь так нельзя, он
           обходит guard и затирает канон вслепую. Правку не теряем: она
           уходит в зеркало со своей базовой ревизией, и при следующем
           нормальном запуске будет принята, только если канон с тех пор
           не сдвинулся. */
        console.warn('CWState: CWDB без mutate() — канон не трогаем, правка в зеркало');
        writeMirror(payload);
        return Promise.resolve(FAILED);
      }
      var refused = false;
      return store.mutate(moduleId, function (current) {
        /* ЕДИНСТВЕННОЕ место проверки — внутри транзакции. Снаружи она
           бессмысленна: между чтением номера и записью влезает соседняя
           вкладка, и защита превращается в её иллюзию. */
        if (revOf(current) > baseRev) { refused = true; return undefined; }
        return {
          id: moduleId,
          payload: payload,
          savedAt: Date.now(),
          rev: revOf(current) + 1,
          writerId: WRITER_ID,
        };
      }).then(function (record) {
        if (refused) {
          seenRev = revOf(record);
          return REFUSED;
        }
        /* Номер принимаем только после oncomplete. Присвоить его внутри fn
           значило бы поверить в запись, которая ещё может быть прервана. */
        baseRev = revOf(record);
        seenRev = baseRev;
        return WRITTEN;
      });
    }

    /* Зеркало несёт тот же конверт. Поля добавлены, ничего не убрано: прежний
       CWState читает `payload` и `at` и лишнего не замечает — откат версии
       работает. `rev` здесь — номер, НА КОТОРОМ основан блоб; сравнение при
       загрузке в этой фазе по-прежнему идёт по времени, менять правило
       разрешения конфликтов — задача следующих фаз. */
    function writeMirror(payload) {
      cache = payload;
      return lsSet(mirrorKey, JSON.stringify({
        at: Date.now(),
        payload: payload,
        rev: baseRev,          // БАЗОВАЯ ревизия, а не будущая
        writerId: WRITER_ID,
      }));
    }

    return {
      /**
       * Прочитать состояние до старта модуля. Возвращает промис, который
       * НИКОГДА не отклоняется: отказ базы — это не ошибка приложения, а
       * причина остаться на прежнем ключе.
       */
      init: function () {
        if (ready) return Promise.resolve(cache);
        var store = db();
        if (!store) { ready = true; return Promise.resolve(null); }

        var mirror = readMirror();
        var timeout = new Promise(function (resolve) {
          global.setTimeout(function () { resolve('timeout'); }, OPEN_TIMEOUT_MS);
        });

        return Promise.race([store.get(moduleId).catch(function (e) { return e; }), timeout])
          .then(function (record) {
            if (record === 'timeout' || record instanceof Error) {
              console.error('CWState: база недоступна, модуль работает на прежнем ключе', record);
              ready = true;
              return null;
            }
            usable = true;
            ownRev = lsGet(revKey);
            hadRecord = !!(record && typeof record.payload === 'string');
            /* Старая запись без `rev` даёт ноль — первая новая станет первой
               ревизией. Саму запись при этом не трогаем. */
            var canonicalRev = revOf(record);
            baseRev = canonicalRev;
            seenRev = canonicalRev;
            recoveryState = null;

            var fromDb = hadRecord ? record.payload : null;
            var savedAt = hadRecord ? Number(record.savedAt) || 0 : 0;

            /* ─── ПРИЁМ ЗЕРКАЛА ──────────────────────────────────────────
               Зеркало годится в восстановление ТОЛЬКО если оно основано на
               той же канонической ревизии, что лежит на диске. Время —
               вторичный признак ВНУТРИ равной базы, а не самостоятельный
               критерий: «свежее по часам» ничего не говорит о том, на какой
               версии данных правка сделана. */
            if (mirror) {
              if (mirror.baseRev === null) {
                /* Зеркало прежнего формата. Совместимость сохраняем только
                   там, где и канон дореформенный: две старые вещи понимают
                   друг друга. Против versioned-канона старое зеркало не
                   выигрывает — и не удаляется: в нём могут быть данные. */
                if (canonicalRev === 0) {
                  if (mirror.at > savedAt) {
                    cache = mirror.payload;
                    ready = true;
                    put(cache);
                    return cache;
                  }
                  lsDel(mirrorKey);
                } else {
                  recoveryState = { reason: 'legacy-mirror', canonicalRev: canonicalRev };
                  console.warn('CWState: зеркало прежнего формата рядом с versioned-записью — не применяем и не удаляем');
                }
              } else if (mirror.baseRev === canonicalRev) {
                if (mirror.at > savedAt) {
                  cache = mirror.payload;
                  ready = true;
                  put(cache);          // догоняем базу и стираем зеркало
                  return cache;
                }
                lsDel(mirrorKey);      // база уже содержит не старее — зеркало лишнее
              } else if (mirror.baseRev < canonicalRev) {
                /* Правка основана на версии, которой на диске уже нет.
                   Если её содержимое совпадает с каноном — она попросту
                   доехала, и зеркало можно убрать без потерь. Иначе это
                   нерешённый конфликт, и тихо применять его нельзя. */
                if (mirror.payload === fromDb) {
                  lsDel(mirrorKey);
                } else {
                  recoveryState = { reason: 'stale-mirror', mirrorBaseRev: mirror.baseRev, canonicalRev: canonicalRev };
                  console.warn('CWState: зеркало основано на устаревшей ревизии — не применяем');
                }
              } else {
                /* baseRev зеркала ВЫШЕ канона: линия данных сменилась —
                   восстановление из копии, откат. Автоматически отменять
                   восстановленное состояние нельзя ни при каких часах. */
                recoveryState = { reason: 'lineage-conflict', mirrorBaseRev: mirror.baseRev, canonicalRev: canonicalRev };
                console.warn('CWState: зеркало из другой линии данных — не применяем');
              }
            }
            cache = fromDb;
            ready = true;
            return cache;
          });
      },

      /** Состояние из базы, синхронно. `null` = записи не было, модуль должен
       *  прочитать свой прежний ключ и перенести его через `write()`. */
      get: function () { return cache; },

      /** База доступна и переезд возможен. */
      available: function () { return usable; },

      /** В базе УЖЕ была запись на момент запуска — то есть переезд состоялся
       *  раньше и повторять его не нужно. */
      migrated: function () { return hadRecord; },

      /** Асинхронная запись. Вызывающему ждать не нужно и не следует.
       *  Контракт прежний — булево, `true` только при реальной записи.
       *  Клиндарий и прочие потребители не меняются. */
      write: function (payload) {
        return this.writeOutcome(payload).then(function (outcome) { return outcome === WRITTEN; });
      },

      /** Та же запись, но с различимым исходом: 'written' | 'refused' | 'failed'.
       *  'refused' — канон ушёл вперёд, ничего не записано и ничего не сломано.
       *  Показывать его как успех нельзя. */
      writeOutcome: function (payload) {
        /* Канон уже содержит ровно это состояние — писать нечего. Без этой
           проверки безусловный flush() на закрытии создавал бы новую ревизию
           из ничего, в том числе у вкладки, которая только что приняла чужое
           состояние и ничего не меняла. Успех здесь честен: требуемое
           содержимое на диске есть. */
        if (payload === cache && baseRev === seenRev) return Promise.resolve(WRITTEN);
        cache = payload;
        if (!usable) return Promise.resolve(FAILED);
        return put(payload);
      },

      /**
       * Синхронная запись на пути закрытия вкладки. Зеркало ложится сразу,
       * запись в базу заводится следом — успеет так успеет: если не успеет,
       * зеркало прочитается при следующей загрузке.
       */
      writeSync: function (payload) {
        return this.writeSyncOutcome(payload) === WRITTEN;
      },

      /** Путь закрытия вкладки с различимым исходом.
       *
       *  Синхронная проверка baseRev < seenRev — РАННИЙ отсев, а не гарантия:
       *  соседняя запись могла ещё не долететь маячком. Окончательную защиту
       *  даёт стартовое сравнение базовой ревизии зеркала с канонической —
       *  поэтому зеркало и несёт baseRev. */
      writeSyncOutcome: function (payload) {
        // То же, что в writeOutcome: совпадающее состояние не порождает ревизию.
        if (payload === cache && baseRev === seenRev) return WRITTEN;
        if (!usable) return FAILED;
        if (baseRev < seenRev) {
          /* Конфликт известен уже сейчас: ни зеркала, ни записи. Закрытие
             конфликтной вкладки не должно оставлять после себя ничего. */
          console.warn('CWState: закрытие в состоянии конфликта — не пишем ни базу, ни зеркало');
          return REFUSED;
        }
        writeMirror(payload);
        put(payload);
        return WRITTEN;
      },

      /** Писала ли в базу другая вкладка после нашей последней записи. */
      foreignWrote: function () {
        var current = lsGet(revKey);
        return !!current && current !== ownRev;
      },

      /**
       * Подписка на запись из соседней вкладки. Событие `storage` приходит
       * только на маячок, поэтому состояние перечитывается из базы.
       *
       * Слушатель ставится один раз на экземпляр, а обработчики копятся в
       * списке: повторный вызов добавляет получателя, но не вторую подписку.
       */
      onForeign: function (callback) {
        if (typeof callback === 'function') foreignCallbacks.push(callback);
        if (foreignBound) return;
        foreignBound = true;
        global.addEventListener('storage', function (event) {
          if (event.key !== revKey || !event.newValue) return;
          if (event.newValue === ownRev) return;      // наша же запись
          ownRev = event.newValue;
          var store = db();
          if (!store) return;
          store.get(moduleId).then(function (record) {
            if (!record || typeof record.payload !== 'string') return;
            var foreignRev = revOf(record);
            seenRev = foreignRev;

            /* По умолчанию считаем, что подписчик принял чужое состояние —
               так вело себя прежнее поведение, и Клиндарий на него опирается.
               Подписчик, у которого есть НЕЗАПИСАННАЯ правка, возвращает
               ровно `false`: тогда baseRev остаётся на старой версии, и
               guard при следующей записи честно откажет. */
            var prevBase = baseRev;
            baseRev = foreignRev;
            cache = record.payload;

            var rejected = false;
            foreignCallbacks.forEach(function (cb) {
              if (cb(record.payload, { rev: foreignRev }) === false) rejected = true;
            });
            if (rejected) {
              baseRev = prevBase;
              /* Кэш тоже откатываем: в памяти вкладки живёт СВОЙ блоб, и
                 выдавать чужой за последний известный этой вкладке нельзя. */
              cache = null;
            }
          }).catch(function (error) { console.error('CWState: чтение после чужой записи не удалось', error); });
        });
      },

      /** Ревизия, на которой основан блоб в памяти вкладки. */
      baseRev: function () { return baseRev; },

      /** Последняя каноническая ревизия, о которой вкладка узнала. */
      seenRev: function () { return seenRev; },

      /** Локальное состояние основано на версии, которой на диске уже нет. */
      conflicted: function () { return baseRev < seenRev; },

      /** Нерешённая ситуация со стартовым зеркалом, либо null. */
      recovery: function () { return recoveryState; },

      /** Прежнее имя. Оставлено ради совместимости: это baseRev. */
      currentRev: function () { return baseRev; },

      /** Идентификатор пишущего рантайма (вкладки/сессии). */
      writerId: function () { return WRITER_ID; },

      /** Только для проверок. */
      keys: { mirror: mirrorKey, rev: revKey },
    };
  }

  global.CWState = { create: create, STORE: STORE, MIRROR_PREFIX: MIRROR_PREFIX, REV_PREFIX: REV_PREFIX };
})(typeof self !== 'undefined' ? self : this);
