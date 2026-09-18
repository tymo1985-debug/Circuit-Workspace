#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-state-envelope.mjs
 *
 * Фаза A трека «одна каноническая база»: конверт канонической записи
 * (`rev` / `savedAt` / `writerId`) и атомарный инкремент ревизии.
 *
 * ПОЧЕМУ ЭТА ПРОВЕРКА ЗДЕСЬ. Правило отбора в check-all.mjs — «этот класс
 * багов уже ломался повторно». Здесь то же осознанное исключение, что у
 * check-backup.mjs, и по тому же основанию: ошибка бесшумна и необратима.
 * Неатомарный инкремент не падает, не пишет в консоль и не виден на экране —
 * две вкладки просто получают один и тот же номер, и одна правка исчезает.
 * Узнать об этом можно только по жалобе пользователя, когда данных уже нет.
 *
 * Второе основание: на этих номерах будут строиться фазы B и C, где по ним
 * принимается решение «чьи данные свежее». Ошибка в фундаменте стоит дороже
 * ошибки в том, что на нём стоит.
 *
 * ЧЕГО ЭТА ПРОВЕРКА НЕ ДОКАЗЫВАЕТ. fake-indexeddb воспроизводит планировщик
 * транзакций в одном процессе. Упорядочивание readwrite-транзакций МЕЖДУ
 * ВКЛАДКАМИ — свойство платформы (спецификация IndexedDB упорядочивает
 * транзакции с пересекающейся областью в пределах базы). Оно потребует
 * отдельной живой проверки в той фазе, где от него начнёт зависеть
 * разрешение конфликтов пользователем. Здесь проверяется форма API: что
 * вычисление номера происходит внутри транзакции, а не снаружи.
 *
 *   node scripts/check-state-envelope.mjs
 *
 * Требует fake-indexeddb: npm install fake-indexeddb
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* --- Окружение браузера, которого нет в Node ---------------------------- */
globalThis.self = globalThis;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const storageListeners = [];
globalThis.addEventListener = (type, fn) => { if (type === 'storage') storageListeners.push(fn); };
/** Доставить маячок так, как это сделал бы браузер: событие `storage`.
 *  Транспорт остаётся прежним, тест не подменяет его своим вызовом. */
function fireStorage(key) {
  const newValue = globalThis.localStorage.getItem(key);
  storageListeners.forEach((fn) => fn({ key, newValue }));
  return waitForMicrotasks();
}

/** Дожидается оседания текущей очереди микрозадач/таймеров ГЛУБЖЕ одного
 *  тика: обработчик `storage` внутри CWState читает базу асинхронно
 *  (`store.get().then(...)`), а `get()` сам проходит через промис `openDb()`
 *  и завершение IndexedDB-транзакции — то есть минимум 2–3 уровня await,
 *  не один. Один `setTimeout(…, 0)` ловит их нестабильно (наблюдалось ~20%
 *  провалов при повторных прогонах). Здесь используется fake-indexeddb,
 *  которая планирует свои колбэки через реальные микрозадачи/макрозадачи
 *  событийного цикла Node — несколько последовательных `setTimeout`
 *  гарантированно дают вложенным цепочкам промисов и колбэков IDB
 *  завершиться, независимо от их точной глубины. */
function waitForMicrotasks(rounds = 5) {
  let p = Promise.resolve();
  for (let i = 0; i < rounds; i++) {
    p = p.then(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  return p;
}

eval(readFileSync(join(ROOT, 'shared/db.js'), 'utf8'));
eval(readFileSync(join(ROOT, 'shared/state.js'), 'utf8'));

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

/** Прямое чтение записи мимо CWState — чтобы проверять то, что на диске. */
const raw = (id) => CWDB.state.get(id);

async function run() {
  console.log('\nАтомарность CWDB.mutate');

  /* 1. Создание из пустоты. */
  {
    const rec = await CWDB.state.mutate('m-create', (current) => {
      if (current !== null) throw new Error('current должен быть null');
      return { payload: 'A', rev: 1 };
    });
    const disk = await raw('m-create');
    ok('создание из null', rec && rec.rev === 1 && disk && disk.payload === 'A');
  }

  /* 2. Обновление существующей. */
  {
    await CWDB.state.mutate('m-upd', () => ({ payload: 'A', rev: 1 }));
    await CWDB.state.mutate('m-upd', (c) => ({ payload: 'B', rev: c.rev + 1 }));
    const disk = await raw('m-upd');
    ok('обновление существующей', disk.payload === 'B' && disk.rev === 2);
  }

  /* 3. undefined = не писать, но транзакция успешна. */
  {
    await CWDB.state.mutate('m-noop', () => ({ payload: 'A', rev: 1 }));
    let resolved = false;
    const rec = await CWDB.state.mutate('m-noop', () => undefined).then((r) => { resolved = true; return r; });
    const disk = await raw('m-noop');
    ok('undefined = no-op, промис разрешается', resolved && rec && rec.payload === 'A' && disk.rev === 1);
  }

  /* 4. Исключение из fn: ничего не записано. */
  {
    await CWDB.state.mutate('m-throw', () => ({ payload: 'A', rev: 1 }));
    let caught = null;
    try {
      await CWDB.state.mutate('m-throw', () => { throw new Error('нарочно'); });
    } catch (e) { caught = e; }
    const disk = await raw('m-throw');
    ok('исключение из fn: reject и ни одной записи',
      caught && caught.message === 'нарочно' && disk.payload === 'A' && disk.rev === 1);
  }

  /* 5. id не может уехать. */
  {
    await CWDB.state.mutate('m-id', () => ({ id: 'ЧУЖОЙ', payload: 'A', rev: 1 }));
    const mine = await raw('m-id');
    const alien = await raw('ЧУЖОЙ');
    ok('id не подменяется значением из fn', mine && mine.id === 'm-id' && alien === null);
  }

  /* 6. Конкурентные mutate дают РАЗНЫЕ последовательные ревизии.
        Обе записи заводятся, не дожидаясь первой, — так же, как это делают
        две вкладки. Контрольный прогон ниже показывает, что было бы без
        транзакции. */
  {
    await CWDB.state.mutate('m-conc', () => ({ payload: 'base', rev: 0 }));
    const seen = [];
    const bump = () => CWDB.state.mutate('m-conc', (c) => {
      const next = (c && c.rev ? c.rev : 0) + 1;
      seen.push(next);
      return { payload: 'p' + next, rev: next };
    });
    await Promise.all([bump(), bump(), bump()]);
    const disk = await raw('m-conc');
    const unique = new Set(seen).size === seen.length;
    ok('три конкурентных mutate дают 1, 2, 3 без повторов',
      unique && disk.rev === 3, 'получено: ' + seen.join(', '));

    /* Контроль: get + put вне транзакции — то, от чего уходим. */
    await CWDB.state.put({ id: 'm-ctrl', payload: 'base', rev: 0 });
    const naive = async () => {
      const c = await CWDB.state.get('m-ctrl');
      return CWDB.state.put({ id: 'm-ctrl', payload: 'x', rev: c.rev + 1 });
    };
    await Promise.all([naive(), naive(), naive()]);
    const ctrl = await raw('m-ctrl');
    ok('контроль: get+put вне транзакции теряет ревизии (ожидаемо)',
      ctrl.rev < 3, 'rev = ' + ctrl.rev + ', ожидалось меньше 3');
  }

  /* 7. Старая ревизия не перезаписывает новую: механизм — отказ из fn. */
  {
    await CWDB.state.mutate('m-older', () => ({ payload: 'new', rev: 5 }));
    const heldRev = 3;                       // писатель держит устаревший номер
    await CWDB.state.mutate('m-older', (c) => {
      if (c && c.rev > heldRev) return undefined;   // отказ внутри транзакции
      return { payload: 'old', rev: heldRev + 1 };
    });
    const disk = await raw('m-older');
    ok('запись со старой ревизией не затирает новую', disk.payload === 'new' && disk.rev === 5);
  }

  console.log('\nКонверт CWState');

  /* 8. Старая запись { id, payload, savedAt } читается. */
  {
    await CWDB.state.put({ id: 'legacy-rec', payload: '{"a":1}', savedAt: 1000 });
    const st = CWState.create('legacy-rec');
    const got = await st.init();
    ok('запись без rev читается', got === '{"a":1}');
    ok('отсутствующий rev трактуется как ноль', st.currentRev() === 0);

    /* 9. Чтение НЕ переписывает запись ради миграции. */
    const disk = await raw('legacy-rec');
    ok('чтение не мигрирует запись', disk.rev === undefined && disk.savedAt === 1000);

    /* 10. Первая новая запись поверх старой — ревизия 1. */
    await st.write('{"a":2}');
    const after = await raw('legacy-rec');
    ok('первый новый commit поверх старой записи даёт rev = 1',
      after.rev === 1 && after.payload === '{"a":2}', 'rev = ' + after.rev);
    ok('writerId проставлен', typeof after.writerId === 'string' && after.writerId.length > 1);
    ok('savedAt проставлен', typeof after.savedAt === 'number' && after.savedAt > 0);
  }

  /* 11. Round-trip нового формата + последовательный рост ревизии. */
  {
    const st = CWState.create('round');
    await st.init();
    await st.write('{"n":1}');
    const r1 = await raw('round');
    await st.write('{"n":2}');
    const r2 = await raw('round');
    ok('round-trip сохраняет payload и метаданные',
      r2.payload === '{"n":2}' && r2.id === 'round' && r2.writerId === r1.writerId);
    ok('последовательные commit-ы увеличивают rev', r1.rev === 1 && r2.rev === 2,
      'получено ' + r1.rev + ' → ' + r2.rev);
    ok('savedAt не используется как порядок (rev растёт независимо)',
      typeof r2.savedAt === 'number' && r2.rev > r1.rev);
  }

  /* 12. Повторный запуск на новом формате ничего не мигрирует. */
  {
    const before = await raw('round');
    const st = CWState.create('round');
    await st.init();
    const after = await raw('round');
    ok('повторный запуск не трогает запись',
      after.rev === before.rev && after.savedAt === before.savedAt && after.payload === before.payload);
    ok('прочитанная ревизия подхвачена', st.currentRev() === before.rev);
  }

  /* 13. Отказ записи не выдаётся за успех. */
  {
    const st = CWState.create('fail');
    await st.init();
    const store = CWDB.state;
    const real = store.mutate;
    store.mutate = () => Promise.reject(new Error('транзакция прервана'));
    const result = await st.write('{"x":1}');
    // Другой payload: тот же самый попал бы под проверку «канон уже это содержит».
    const outcome = await st.writeOutcome('{"x":2}');
    store.mutate = real;
    ok('провалившаяся запись возвращает false, а не успех', result === false);
    ok('технический отказ различим как failed', outcome === 'failed');
    const mirror = globalThis.localStorage.getItem('cw-state-mirror:fail');
    const parsed = mirror ? JSON.parse(mirror) : null;
    ok('провалившаяся запись уходит в зеркало', !!parsed && parsed.payload === '{"x":2}');
  }

  /* 14. Зеркало несёт конверт и остаётся читаемым прежним разбором. */
  {
    const mirror = JSON.parse(globalThis.localStorage.getItem('cw-state-mirror:fail'));
    ok('зеркало: прежние поля на месте',
      typeof mirror.payload === 'string' && typeof mirror.at === 'number');
    ok('зеркало: конверт добавлен',
      typeof mirror.rev === 'number' && typeof mirror.writerId === 'string');
  }

  /* 15. Формат прежнего ключа localStorage не тронут. */
  {
    const src = readFileSync(join(ROOT, 'shared/state.js'), 'utf8');
    ok('CWState не пишет в прежний ключ модуля',
      !/localStorage\.setItem\(\s*['"]service-year|congress-pwa/.test(src));
    const planner = readFileSync(join(ROOT, 'circuit-planner/app.js'), 'utf8');
    ok('Клиндарий по-прежнему пишет в прежний ключ голый JSON',
      planner.includes('localStorage.setItem(App.config.storageKey, payload)'),
      'обёртка вокруг legacy-блоба сломала бы откат версии');
  }

  /* 16. IDB-ONLY backward compatibility. Без зеркала: старый код должен
        прочитать НОВУЮ каноническую запись из самой базы, а не победить за
        счёт того, что зеркало оказалось новее. Пункт 14 показывает, что
        зеркало нового формата не смущает старый разбор JSON; здесь нарочно
        убираем зеркало из уравнения, чтобы доказать именно чтение записи.

        Загружается ДОСЛОВНЫЙ файл shared/state.js из коммита ПЕРЕД Phase A
        (scripts/fixtures/state.pre-phase-a.js, git show 0638d50:shared/state.js) —
        не реконструкция логики, а тот же код, что был в проде. */
  {
    await CWDB.state.mutate('compat-idb', () => ({ payload: '{"v":"new-idb"}', rev: 1, writerId: 'w-x' }));
    globalThis.localStorage.removeItem('cw-state-mirror:compat-idb');

    const preSrc = readFileSync(join(ROOT, 'scripts/fixtures/state.pre-phase-a.js'), 'utf8');
    /* Старый файл сам вызывает `(function (global) { ... })(typeof self !==
       'undefined' ? self : this)` и пишет результат в `global.CWState`. Чтобы
       не перезатереть НОВЫЙ CWState в этом же процессе, подсовываем прокси:
       тот же globalThis (там уже живёт настоящий CWDB), но с отдельным
       именем для результата. */
    const oldGlobal = Object.create(globalThis);
    let capturedOldCWState = null;
    Object.defineProperty(oldGlobal, 'CWState', {
      get() { return capturedOldCWState; },
      set(v) { capturedOldCWState = v; },
    });
    const loadOld = new Function('self', preSrc + '\nreturn self.CWState;');
    const OldCWState = loadOld(oldGlobal);
    const oldInstance = OldCWState.create('compat-idb');
    const got = await oldInstance.init();
    ok('старый CWState (файл до Phase A) читает НОВУЮ каноническую IDB-запись без зеркала',
      got === '{"v":"new-idb"}' && oldInstance.migrated() === true && oldInstance.available() === true,
      'получено: ' + got);
  }

  /* 17. Fallback без mutate: смешанный кэш service worker'а мог отдать старый
        shared/db.js рядом с новым shared/state.js. Запись не должна теряться,
        а следующий нормальный запуск (с mutate) обязан продолжить с rev = 0,
        то есть первый его commit становится rev = 1 — без ручной миграции. */
  {
    await CWDB.state.mutate('m-no-mutate', () => ({ payload: '{"v":"init"}', rev: 1, writerId: 'w-init' }));

    const st = CWState.create('m-no-mutate');
    await st.init();
    const realMutate = CWDB.state.mutate;
    CWDB.state.mutate = undefined; // имитируем старый shared/db.js
    const outcome = await st.writeOutcome('{"v":"no-mutate-fallback"}');
    CWDB.state.mutate = realMutate;

    const onDisk = await raw('m-no-mutate');
    ok('Q: без mutate() канон НЕ перезаписывается вслепую',
      onDisk.payload === '{"v":"init"}' && onDisk.rev === 1);
    ok('Q: исход не выдаётся за успех', outcome === 'failed');
    const mirrorRaw = globalThis.localStorage.getItem('cw-state-mirror:m-no-mutate');
    const mirrorRec = mirrorRaw ? JSON.parse(mirrorRaw) : null;
    ok('Q: правка не потеряна — лежит в зеркале с базовой ревизией',
      !!mirrorRec && mirrorRec.payload === '{"v":"no-mutate-fallback"}' && mirrorRec.rev === 1);

    // Канон с тех пор не двигался → восстановление допустимо.
    const st2 = CWState.create('m-no-mutate');
    const got2 = await st2.init();
    ok('Q: при совпадении baseRev зеркало принимается', got2 === '{"v":"no-mutate-fallback"}');
  }


  console.log('\nCross-tab: чистое применение и конфликт');

  /* Две вкладки на одном модуле. Событие `storage` в Node не ходит, поэтому
     чужую запись доставляем тем же способом, каким её доставил бы браузер:
     вызываем зарегистрированный обработчик. Проверяется логика принятия
     решения, а не транспорт — транспорт остаётся прежним маячком. */
  function twoTabs(moduleId) {
    const A = CWState.create(moduleId);
    const B = CWState.create(moduleId);
    return { A, B, beacon: () => fireStorage('cw-state-rev:' + moduleId) };
  }

  /* A. Tab A commit → clean Tab B получает новый payload.
     B. Foreign apply не вызывает обратную запись.
     I. После собственного commit baseRev обновлён. */
  {
    const { A, B, beacon } = twoTabs('ct-clean');
    await A.init(); await B.init();

    let applied = null;
    let saveCalls = 0;
    B.onForeign((payload) => { applied = payload; saveCalls++; return true; });  // clean apply

    await A.writeOutcome('{"v":"from-A"}');
    ok('I: после собственного commit baseRev обновлён', A.baseRev() === 1, 'baseRev = ' + A.baseRev());

    await beacon();   // то, что делает обработчик маячка
    ok('A: чистая вкладка B получила payload вкладки A', applied === '{"v":"from-A"}');
    ok('B: применение чужого состояния не вызвало повторную запись',
      saveCalls === 1 && (await raw('ct-clean')).rev === 1, 'rev = ' + (await raw('ct-clean')).rev);
    ok('B: baseRev и seenRev выровнены после clean apply',
      B.baseRev() === 1 && B.seenRev() === 1);
  }

  /* C. Clean B после foreign apply и unload не создаёт новую ревизию.
     J. Нет ping-pong. */
  {
    const { A, B, beacon } = twoTabs('ct-unload');
    await A.init(); await B.init();
    B.onForeign(() => true);
    await A.writeOutcome('{"v":"x"}');
    await beacon();

    const before = (await raw('ct-unload')).rev;
    // Вкладка B закрывается, ничего не меняв: payload совпадает с каноном.
    const outcome = B.writeSyncOutcome('{"v":"x"}');
    const after = (await raw('ct-unload')).rev;
    ok('C: unload чистой вкладки не создаёт новую ревизию',
      after === before, before + ' → ' + after);
    ok('J: повторное применение не порождает цепочку записей', outcome !== 'written' || after === before);
  }

  /* D. A rev1 → B принимает rev1 → A rev2 → B принимает rev2. */
  {
    const { A, B, beacon } = twoTabs('ct-seq');
    await A.init(); await B.init();
    const seen = [];
    B.onForeign((payload) => { seen.push(payload); return true; });

    await A.writeOutcome('{"n":1}'); await beacon();
    await A.writeOutcome('{"n":2}'); await beacon();
    ok('D: последовательные чужие ревизии приняты по порядку',
      seen.length === 2 && seen[0] === '{"n":1}' && seen[1] === '{"n":2}' && B.baseRev() === 2,
      seen.join(' | ') + ' baseRev=' + B.baseRev());
  }

  /* E. Dirty A(baseRev=N) + B commits N+1 → commit A блокируется. */
  {
    const { A, B, beacon } = twoTabs('ct-dirty');
    await A.init(); await B.init();
    await A.writeOutcome('{"v":"base"}');          // rev 1, baseRev A = 1
    B.onForeign(() => true); await beacon();                  // B знает про rev 1

    await B.writeOutcome('{"v":"from-B"}');        // rev 2
    // A — грязная: отказывается принимать чужое.
    A.onForeign(() => false);
    await beacon();

    ok('E: baseRev грязной вкладки НЕ сдвинут чужим уведомлением',
      A.baseRev() === 1 && A.seenRev() === 2, 'base=' + A.baseRev() + ' seen=' + A.seenRev());
    ok('E: вкладка в явном состоянии конфликта', A.conflicted() === true);

    const outcome = await A.writeOutcome('{"v":"stale-from-A"}');
    const disk = await raw('ct-dirty');
    ok('E: commit устаревшей вкладки отклонён', outcome === 'refused');
    ok('E: канон остался версией B', disk.payload === '{"v":"from-B"}' && disk.rev === 2);
  }

  /* F. Conflict-state unload не перезаписывает канон.
     G/K. И не оставляет зеркала, способного победить при следующем старте. */
  {
    const { A, B, beacon } = twoTabs('ct-conflict-unload');
    await A.init(); await B.init();
    await A.writeOutcome('{"v":"base"}');
    B.onForeign(() => true); await beacon();
    await B.writeOutcome('{"v":"newer-B"}');
    A.onForeign(() => false);
    await beacon();

    globalThis.localStorage.removeItem('cw-state-mirror:ct-conflict-unload');
    const outcome = A.writeSyncOutcome('{"v":"stale-A"}');
    const disk = await raw('ct-conflict-unload');
    const mirror = globalThis.localStorage.getItem('cw-state-mirror:ct-conflict-unload');

    ok('F: unload конфликтной вкладки не пишет канон',
      outcome === 'refused' && disk.payload === '{"v":"newer-B"}' && disk.rev === 2);
    ok('K/G: unload конфликтной вкладки не создаёт устаревшее зеркало', mirror === null);

    // И следующий старт действительно остаётся на версии B.
    const C = CWState.create('ct-conflict-unload');
    const got = await C.init();
    ok('G: следующий старт остаётся на каноне B', got === '{"v":"newer-B"}');
  }

  /* H. Обычная перезагрузка не создаёт ложный конфликт. */
  {
    const st = CWState.create('ct-reload');
    await st.init();
    await st.writeOutcome('{"v":"1"}');
    const again = CWState.create('ct-reload');
    await again.init();
    ok('H: после обычного reload конфликта нет',
      again.conflicted() === false && again.baseRev() === 1);
  }

  console.log('\nВосстановление из зеркала по базовой ревизии');

  /* L. mirror baseRev = N, canonical = N → восстановление применяется. */
  {
    await CWDB.state.mutate('rec-equal', () => ({ payload: '{"v":"canon"}', rev: 4, writerId: 'w' }));
    globalThis.localStorage.setItem('cw-state-mirror:rec-equal',
      JSON.stringify({ at: Date.now() + 10000, payload: '{"v":"mirror"}', rev: 4, writerId: 'w-old' }));
    const st = CWState.create('rec-equal');
    const got = await st.init();
    ok('L: зеркало с совпадающей базовой ревизией принято', got === '{"v":"mirror"}');
  }

  /* M. mirror baseRev = N, canonical = N+1 → не применяется. */
  {
    await CWDB.state.mutate('rec-stale', () => ({ payload: '{"v":"canon-newer"}', rev: 5, writerId: 'w' }));
    globalThis.localStorage.setItem('cw-state-mirror:rec-stale',
      JSON.stringify({ at: Date.now() + 10000, payload: '{"v":"mirror-stale"}', rev: 4, writerId: 'w-old' }));
    const st = CWState.create('rec-stale');
    const got = await st.init();
    const disk = await raw('rec-stale');
    ok('M: устаревшее зеркало не применяется, канон не тронут',
      got === '{"v":"canon-newer"}' && disk.rev === 5);
    ok('M: устаревшее зеркало не удалено молча',
      globalThis.localStorage.getItem('cw-state-mirror:rec-stale') !== null);
  }

  /* N/R. mirror baseRev > canonical → смена линии данных (restore/rollback). */
  {
    await CWDB.state.mutate('rec-lineage', () => ({ payload: '{"v":"restored"}', rev: 2, writerId: 'w' }));
    globalThis.localStorage.setItem('cw-state-mirror:rec-lineage',
      JSON.stringify({ at: Date.now() + 10000, payload: '{"v":"pre-restore"}', rev: 9, writerId: 'w-old' }));
    const st = CWState.create('rec-lineage');
    const got = await st.init();
    ok('N/R: зеркало с более высокой базой не отменяет восстановленный канон',
      got === '{"v":"restored"}');
    ok('N/R: конфликт линии зафиксирован, зеркало сохранено',
      globalThis.localStorage.getItem('cw-state-mirror:rec-lineage') !== null
      && !!st.recovery() && st.recovery().reason === 'lineage-conflict');
  }

  /* O. legacy зеркало + legacy канон → прежняя логика по времени. */
  {
    await CWDB.state.put({ id: 'rec-legacy', payload: '{"v":"old-canon"}', savedAt: 1000 });
    globalThis.localStorage.setItem('cw-state-mirror:rec-legacy',
      JSON.stringify({ at: 5000, payload: '{"v":"old-mirror"}' }));
    const st = CWState.create('rec-legacy');
    const got = await st.init();
    ok('O: обе стороны старого формата — прежняя совместимость по времени',
      got === '{"v":"old-mirror"}');
  }

  /* P. legacy зеркало + versioned канон → не применяется и не удаляется. */
  {
    await CWDB.state.mutate('rec-mixed', () => ({ payload: '{"v":"versioned"}', rev: 3, writerId: 'w' }));
    globalThis.localStorage.setItem('cw-state-mirror:rec-mixed',
      JSON.stringify({ at: Date.now() + 10000, payload: '{"v":"legacy-mirror"}' }));
    const st = CWState.create('rec-mixed');
    const got = await st.init();
    ok('P: зеркало без ревизии не побеждает версионированный канон',
      got === '{"v":"versioned"}');
    ok('P: такое зеркало не удалено автоматически',
      globalThis.localStorage.getItem('cw-state-mirror:rec-mixed') !== null);
  }

  console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nКонверт записи и атомарность ревизии соблюдены.');
  process.exit(failed ? 1 : 0);
}

run().catch((error) => {
  console.error('check-state-envelope: непредвиденная ошибка');
  console.error(error);
  process.exit(1);
});
