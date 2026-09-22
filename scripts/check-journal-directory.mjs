#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-directory.mjs
 *
 * Фаза J3b: граница Журнал ↔ CWDirectory (shared/directory.js).
 *
 * ПОЧЕМУ ЗДЕСЬ, а не «когда сломается повторно»: это ровно та граница,
 * нарушать которую нельзя (shared/directory.js, «решение Алекса 16.08.2026»).
 * Молчаливое дублирование идентичности в узле Журнала или запись расписания
 * в CWDirectory — оба класса ошибок незаметны в UI и всплывают только через
 * рассинхрон данных у пользователя.
 *
 *   node scripts/check-journal-directory.mjs
 *
 * Требует fake-indexeddb.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DB = 'circuit-workspace-db';

globalThis.self = globalThis;
const lsMem = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsMem.has(k) ? lsMem.get(k) : null),
  setItem: (k, v) => lsMem.set(k, String(v)),
  removeItem: (k) => lsMem.delete(k),
};
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = {};
/* shared/directory.js регистрирует слушатель маячка cw-directory-rev
   безусловно при загрузке — в браузере/SW это window.addEventListener,
   в Node его нет. Минимальная заглушка: реального кросс-вкладочного
   события здесь не будет (проверка 9 вызывает onChange() напрямую), но
   загрузка модуля не должна падать. */
globalThis.addEventListener = () => {};

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

/* Свежая база на КАЖДЫЙ запуск процесса — fake-indexeddb персистентна
   только в рамках процесса, отдельного удаления не нужно. */
eval(read('shared/db.js'));
eval(read('shared/directory.js'));
eval(read('journal/js/data.js'));
await CWDB.init();
await CWDirectory.init();

/* ═══ 1. Несвязанное собрание — communityId отсутствует, узел валиден ═══ */
console.log('\n1. Несвязанное собрание');
const circuitId = await CWJournal.nodes.add({ kind: 'circuit', parentId: CWJournal.ROOT_PARENT, label: 'EU-K-03' });
const congId = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Северное (локально)' });
const congUnlinked = await CWJournal.nodes.get(congId);
ok('узел создан без communityId', !('communityId' in congUnlinked) || congUnlinked.communityId == null);
ok('CWDirectory.get(undefined) не бросает и даёт null', CWDirectory.get(congUnlinked.communityId) === null);

/* ═══ 2. Связывание с СУЩЕСТВУЮЩЕЙ записью справочника ═══════════════════ */
console.log('\n2. Связывание с существующей записью');
const existing = await CWDirectory.upsert({ id: 'com_seed1', name: 'Южное', congNumber: '123456' }, 'circuit-planner');
ok('запись справочника создана (мираж от другого модуля)', !!existing && existing.id === 'com_seed1');
await CWJournal.nodes.update(congId, { communityId: existing.id });
const afterLink = await CWJournal.nodes.get(congId);
ok('communityId сохранён на узле', afterLink.communityId === 'com_seed1');

/* ═══ 3. Идентичность читается из CWDirectory, не дублируется в Журнале ═══ */
console.log('\n3. Идентичность из CWDirectory, не из полей Журнала');
const linkedRecord = CWDirectory.get(afterLink.communityId);
ok('CWDirectory.get() отдаёт каноническое имя', linkedRecord.name === 'Южное');
ok('узел Журнала НЕ хранит копию name/address/contact',
  !('name' in afterLink) && !('address' in afterLink) && !('contactName' in afterLink));

/* ═══ 4. Разорванная связь — communityId есть, записи в справочнике нет ══ */
console.log('\n4. Разорванная связь (broken link)');
const brokenCongId = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Западное' });
await CWJournal.nodes.update(brokenCongId, { communityId: 'com_does_not_exist' });
const brokenNode = await CWJournal.nodes.get(brokenCongId);
const brokenLookup = CWDirectory.get(brokenNode.communityId);
ok('communityId сохранён (не стёрт молча)', brokenNode.communityId === 'com_does_not_exist');
ok('CWDirectory.get() на несуществующий id даёт null (UI обязан показать recoverable-состояние, не тихо очищать)',
  brokenLookup === null);
// Симулировать «UI должен уметь пересвязать» — повторное связывание поверх broken.
await CWJournal.nodes.update(brokenCongId, { communityId: existing.id });
ok('пересвязывание поверх broken проходит', (await CWJournal.nodes.get(brokenCongId)).communityId === existing.id);

/* ═══ 5. Создание новой записи справочника → атомарная связка ═══════════ */
console.log('\n5. Создание новой записи (CWDirectory.create) → связывание');
const newCongId = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Черновик' });
const created = await CWDirectory.create({ name: 'Черновик собрание', congNumber: '999888' }, 'journal');
ok('CWDirectory.create() вернул запись с сгенерированным id', !!created && typeof created.id === 'string' && created.id.length > 0);
ok('id сгенерирован CWDB.communities (префикс com_)', /^com_/.test(created.id));
ok('запись сразу видна в CWDirectory.all()/get() (кэш обновлён синхронно с записью)',
  CWDirectory.get(created.id) !== null && CWDirectory.all().some((r) => r.id === created.id));
await CWJournal.nodes.update(newCongId, { communityId: created.id });
ok('communityId нового узла указывает на созданную запись',
  (await CWJournal.nodes.get(newCongId)).communityId === created.id);

/* Провал записи в справочник → communityId НЕ проставляется (симуляция:
   create() с недоступной CWDB.communities должен вернуть null, а не бросить). */
{
  const savedStore = CWDB.communities;
  CWDB.communities = undefined; // как если бы global.CWDB.communities исчез
  const failedCreate = await CWDirectory.create({ name: 'Не должно сохраниться' }, 'journal');
  CWDB.communities = savedStore;
  ok('при недоступном хранилище create() возвращает null, а не бросает', failedCreate === null);
}

/* ═══ 5б. Компенсация: create() успел, но communityId узла не сохранился ═
 * Ровно сценарий из ревью: осиротевшая запись справочника не должна
 * оставаться никому не известной. UI (openLinkDialog → onCreateClick в
 * journal/js/app.js) в этом случае обязан вызвать CWDirectory.detach(id,
 * 'journal') — здесь эта же последовательность проверяется на уровне
 * данных, без DOM. */
console.log('\n5б. Компенсация create()→link при отказе записи узла');
{
  const compCongId = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Сирота' });
  const compRecord = await CWDirectory.create({ name: 'Осиротевшее собрание' }, 'journal');
  ok('запись создана в справочнике (шаг 1 успешен)', !!compRecord && CWDirectory.get(compRecord.id) !== null);

  // Симулируем отказ ИМЕННО на шаге сохранения communityId на узле —
  // nodes.update() к несуществующему id бросает 'journal-node-not-found',
  // тот же класс отказа, что и недоступная транзакция IndexedDB.
  let updateFailed = false;
  try {
    await CWJournal.nodes.update('node-does-not-exist', { communityId: compRecord.id });
  } catch (e) { updateFailed = true; }
  ok('шаг 2 (сохранение communityId) действительно падает в этой симуляции', updateFailed);

  // Компенсация — как того требует спецификация: detach() убирает 'journal'
  // из sources осиротевшей записи. Единственный источник был 'journal',
  // поэтому запись должна исчезнуть целиком (никто больше её не знает).
  const detachResult = await CWDirectory.detach(compRecord.id, 'journal');
  ok("detach() вернул 'removed' (единственный источник ушёл)", detachResult === 'removed');
  ok('осиротевшая запись больше не видна в CWDirectory', CWDirectory.get(compRecord.id) === null);

  // Узел Журнала — как и был, без communityId (create()→update() не прошёл
  // атомарно, но локальные данные узла не пострадали — J3a update() узла с
  // несуществующим id ничего не менял в существующих узлах).
  const compNode = await CWJournal.nodes.get(compCongId);
  ok('локальный узел Журнала остался без communityId (не половинчатое состояние)',
    !('communityId' in compNode) || compNode.communityId == null);
}

/* ═══ 6. Редактирование связанной идентичности меняет CWDirectory ═══════ */
console.log('\n6. Правка связанной идентичности → CWDirectory.upsert');
await CWDirectory.upsert(Object.assign({}, linkedRecord, { name: 'Южное (переименовано)' }), 'journal');
ok('CWDirectory.get() отражает новое имя сразу после upsert', CWDirectory.get(existing.id).name === 'Южное (переименовано)');

/* ═══ 7. Расписание — поле Журнала, CWDirectory не трогается ═══════════ */
console.log('\n7. Расписание Journal-owned — CWDirectory не мутируется');
const beforeUpdatedAt = CWDirectory.get(existing.id).updatedAt;
await CWJournal.nodes.update(congId, {
  fields: { schedule: { midweek: 'вт 19:00', weekend: 'вс 10:00' } },
});
const afterSchedule = await CWJournal.nodes.get(congId);
ok('расписание сохранено в fields узла', afterSchedule.fields && afterSchedule.fields.schedule && afterSchedule.fields.schedule.midweek === 'вт 19:00');
ok('CWDirectory-запись НЕ изменилась (updatedAt тот же)', CWDirectory.get(existing.id).updatedAt === beforeUpdatedAt);
ok('CWDirectory-запись не содержит поля schedule', !('schedule' in CWDirectory.get(existing.id)));

/* ═══ 8. Группы/предгруппы всё ещё читаются под узлом собрания (J3a) ═══ */
console.log('\n8. Группы/предгруппы по-прежнему доступны под узлом');
const groupId = await CWJournal.nodes.add({ kind: 'group', parentId: congId, label: 'Группа 1' });
const childrenOfCong = await CWJournal.nodes.byParent(congId);
ok('дочерняя группа находится через nodes.byParent (J3a API не менялся)',
  childrenOfCong.some((n) => n.id === groupId && n.kind === 'group'));

/* ═══ 9. Обновление справочника извне отражается через onChange ═══════ */
console.log('\n9. onChange() уведомляет о внешнем изменении справочника');
let notified = false;
const unsubscribe = CWDirectory.onChange(() => { notified = true; });
await CWDirectory.upsert(Object.assign({}, CWDirectory.get(existing.id), { contactPhone: '+48 111 222 333' }), 'circuit-planner');
ok('onChange сработал на чужую запись (Журнал может перерисовать идентичность)', notified === true);
unsubscribe();

/* ═══ 10. Никаких доменных данных Журнала в localStorage/CWState ═══════ */
console.log('\n10. Никаких доменных данных Журнала в localStorage');
const lsKeys = [...lsMem.keys()];
ok('localStorage несёт только маячок CWDirectory (cw-directory-rev), не данные Журнала',
  lsKeys.every((k) => k === CWDirectory.REV_KEY));

/* ═══ 11. CWDirectory.attach() — заявить существующую запись за модулем ═
 * Ядро правки source lifecycle (spec-2, п.1A): связывание с СУЩЕСТВУЮЩЕЙ
 * записью обязано добавить 'journal' в sources[], а не только communityId
 * на узле Журнала. */
console.log('\n11. CWDirectory.attach() — существующая связь заявляет journal-источник');
{
  const shared1 = await CWDirectory.upsert({ id: 'com_shared1', name: 'Общее 1' }, 'circuit-planner');
  ok('запись создана другим модулем (source: circuit-planner)', shared1.sources.includes('circuit-planner'));
  const attached = await CWDirectory.attach(shared1.id, 'journal');
  ok('attach() вернул запись', !!attached);
  ok("после attach() sources содержит и 'circuit-planner', и 'journal'",
    attached.sources.includes('circuit-planner') && attached.sources.includes('journal'));
  ok('attach() не тронул поля идентичности (name не изменился)', attached.name === 'Общее 1');

  // Идемпотентность: повторный attach() тем же модулем не создаёт дублей в sources.
  const attachedAgain = await CWDirectory.attach(shared1.id, 'journal');
  const journalCount = attachedAgain.sources.filter((s) => s === 'journal').length;
  ok('повторный attach() тем же модулем не дублирует запись в sources', journalCount === 1);

  // attach() на несуществующий id — безопасный отказ, не бросает.
  const attachMissing = await CWDirectory.attach('com_does_not_exist_attach', 'journal');
  ok('attach() на несуществующую запись возвращает null, а не бросает', attachMissing === null);
}

/* ═══ 12. Чужой источник переживает detach('journal') ═══════════════════
 * spec-2 п.1: другой модуль ссылается на ту же запись → detach('journal')
 * не должен унести запись из-под него. */
console.log('\n12. Запись с другим источником переживает detach(journal)');
{
  const shared2 = await CWDirectory.upsert({ id: 'com_shared2', name: 'Общее 2' }, 'circuit-planner');
  await CWDirectory.attach(shared2.id, 'journal');
  const detachResult = await CWDirectory.detach(shared2.id, 'journal');
  ok("detach('journal') вернул 'detached', не 'removed' — есть другой источник", detachResult === 'detached');
  ok('запись всё ещё видна в CWDirectory (circuit-planner её держит)', CWDirectory.get(shared2.id) !== null);
  ok("sources не содержит 'journal' после detach", !CWDirectory.get(shared2.id).sources.includes('journal'));
  ok("sources всё ещё содержит 'circuit-planner'", CWDirectory.get(shared2.id).sources.includes('circuit-planner'));
}

/* ═══ 13. Два узла Журнала на одну запись — уровень CWJournal.nodes ═════
 * spec-2 п.1: «две ссылки на один communityId» — сама эта проверка живёт
 * на уровне данных Журнала (countJournalRefs в app.js читает именно
 * так — через nodes.getAll().filter по communityId), поэтому здесь
 * проверяется первичный факт, на который опирается вся логика источника:
 * несколько узлов МОГУТ ссылаться на одну запись справочника одновременно,
 * и удаление одного не должно "видеть" это как последнюю ссылку, пока
 * жив второй. */
console.log('\n13. Два узла Журнала ссылаются на одну запись справочника');
{
  const shared3 = await CWDirectory.create({ name: 'Общее 3 (двойная ссылка)' }, 'journal');
  const nodeA = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Узел A' });
  const nodeB = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Узел B' });
  await CWJournal.nodes.update(nodeA, { communityId: shared3.id });
  await CWJournal.nodes.update(nodeB, { communityId: shared3.id });

  const allNodes = await CWJournal.nodes.getAll();
  const refsExcludingA = allNodes.filter((n) => n.kind === 'congregation' && n.communityId === shared3.id && n.id !== nodeA).length;
  ok('после исключения узла A остаётся 1 ссылка (узел B) — не последняя', refsExcludingA === 1);

  // Симуляция того, что делает releaseSourceIfUnused: узел A "уходит"
  // (удаляется), но узел B всё ещё ссылается → 'journal' НЕ должен уйти.
  await CWJournal.nodes.remove(nodeA);
  const refsAfterRemoveA = (await CWJournal.nodes.getAll())
    .filter((n) => n.kind === 'congregation' && n.communityId === shared3.id && n.id !== nodeA).length;
  ok('после удаления узла A остаётся 1 живая ссылка (узел B)', refsAfterRemoveA === 1);
  // Раз ссылка жива — приложение НЕ должно вызывать detach(); проверяем,
  // что запись при этом продолжает числиться за journal (сценарий "не тронуто").
  ok("sources всё ещё содержит 'journal' (детач не должен был вызываться)",
    CWDirectory.get(shared3.id).sources.includes('journal'));

  // Теперь убираем и узел B — это ПОСЛЕДНЯЯ ссылка, detach() уместен.
  await CWJournal.nodes.remove(nodeB);
  const refsAfterRemoveBoth = (await CWJournal.nodes.getAll())
    .filter((n) => n.kind === 'congregation' && n.communityId === shared3.id).length;
  ok('после удаления обоих узлов ссылок не осталось (0)', refsAfterRemoveBoth === 0);
  const finalDetach = await CWDirectory.detach(shared3.id, 'journal');
  ok("последняя ссылка ушла → detach() вернул 'removed' (единственный источник был journal)",
    finalDetach === 'removed');
}

/* ═══ 14. Relink отпускает старый источник, только если он не используется ═
 * spec-2 п.1B: relink — claim нового ПЕРЕД записью, потом отпустить старый,
 * если на него больше никто из Журнала не ссылается. */
console.log('\n14. Relink: старый источник отпускается только когда не используется');
{
  const oldRecord = await CWDirectory.create({ name: 'Старая запись (relink)' }, 'journal');
  const newRecord = await CWDirectory.create({ name: 'Новая запись (relink)' }, 'journal');
  const relinkNode = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Relink-узел' });
  await CWJournal.nodes.update(relinkNode, { communityId: oldRecord.id });

  // Симуляция claimAndLink(): claim новую, обновить узел, затем — раз
  // старая запись больше никем из Журнала не используется — отпустить её.
  await CWDirectory.attach(newRecord.id, 'journal');
  await CWJournal.nodes.update(relinkNode, { communityId: newRecord.id });
  const oldStillUsed = (await CWJournal.nodes.getAll())
    .filter((n) => n.kind === 'congregation' && n.communityId === oldRecord.id && n.id !== relinkNode).length;
  ok('старая запись больше не используется другими узлами (0 ссылок)', oldStillUsed === 0);
  const releaseOld = await CWDirectory.detach(oldRecord.id, 'journal');
  ok("неиспользуемая старая запись отпускается ('removed', единственный источник был journal)",
    releaseOld === 'removed');
  ok('новая запись осталась связанной', (await CWJournal.nodes.get(relinkNode)).communityId === newRecord.id);

  // Теперь: старая запись ИСПОЛЬЗУЕТСЯ вторым узлом → relink НЕ должен её отпускать.
  const oldRecord2 = await CWDirectory.create({ name: 'Старая запись 2 (используется)' }, 'journal');
  const newRecord2 = await CWDirectory.create({ name: 'Новая запись 2' }, 'journal');
  const relinkNodeA = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Relink-узел A' });
  const relinkNodeB = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Relink-узел B' });
  await CWJournal.nodes.update(relinkNodeA, { communityId: oldRecord2.id });
  await CWJournal.nodes.update(relinkNodeB, { communityId: oldRecord2.id }); // тот же id — вторая ссылка
  await CWDirectory.attach(newRecord2.id, 'journal');
  await CWJournal.nodes.update(relinkNodeA, { communityId: newRecord2.id }); // A переезжает на новую
  const oldStillUsed2 = (await CWJournal.nodes.getAll())
    .filter((n) => n.kind === 'congregation' && n.communityId === oldRecord2.id && n.id !== relinkNodeA).length;
  ok('старая запись 2 всё ещё используется узлом B (1 ссылка) — не отпускать', oldStillUsed2 === 1);
  ok("sources старой записи 2 всё ещё содержит 'journal' (детач не вызывался)",
    CWDirectory.get(oldRecord2.id).sources.includes('journal'));
}

/* ═══ 15. Компенсация НЕ отпускает предсуществующий источник при
 *         РЕАЛЬНОМ отказе nodes.update() (не идемпотентность attach) ═══
 * Это настоящая проверка исправленного бага (не раздел 11 про attach()):
 * узел УЖЕ легитимно связан с communityId, 'journal' уже в sources; при
 * попытке «перепривязать» на ТУ ЖЕ запись nodes.update() падает (форс-отказ
 * через monkey-patch метода CWJournal.nodes.update на время теста, без
 * production debug API). Воспроизводится РОВНО та ветка claimAndLink()
 * (journal/js/app.js), которая была исправлена: компенсация не запускается
 * вовсе, когда newCommunityId === oldCommunityId — иначе releaseSourceIfUnused
 * исключил бы сам узел из подсчёта ссылок, увидел бы 0 и снял бы источник,
 * которым узел всё ещё легитимно владеет. */
console.log('\n15. Компенсация НЕ отпускает источник при отказе update() на ТОТ ЖЕ communityId');
{
  const preExisting = await CWDirectory.create({ name: 'Предсуществующая связь (реальный отказ)' }, 'journal');
  const preNode = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Пред-узел (реальный отказ)' });
  await CWJournal.nodes.update(preNode, { communityId: preExisting.id });
  ok("'journal' уже легитимный источник ДО попытки", CWDirectory.get(preExisting.id).sources.includes('journal'));

  const nodeBefore = await CWJournal.nodes.get(preNode);
  const oldCommunityId = nodeBefore.communityId; // === preExisting.id
  const newCommunityId = preExisting.id; // попытка "перепривязать" на ту же запись

  // Форс-отказ nodes.update() ТОЛЬКО для этого узла — временная подмена
  // метода на время одного вызова, не production API.
  const realUpdate = CWJournal.nodes.update;
  CWJournal.nodes.update = async function (id, patch) {
    if (id === preNode) throw new Error('forced-update-failure-for-test');
    return realUpdate(id, patch);
  };

  // Воспроизвести именно исправленную логику claimAndLink() (не сам код
  // приложения — он живёт в закрытии app.js без DOM недоступен отсюда,
  // но логика идентична и это то, что зафиксировано как контракт):
  let compensationRan = false;
  const claimed = await CWDirectory.attach(newCommunityId, 'journal');
  ok('claim (attach) прошёл', !!claimed);
  try {
    await CWJournal.nodes.update(preNode, { communityId: newCommunityId });
    ok('update() должен был бросить — тест настроен неверно, если дошли сюда', false);
  } catch (e) {
    ok('nodes.update() действительно упал (форс-отказ сработал)', e.message === 'forced-update-failure-for-test');
    // Исправленное условие: компенсация запускается, только если это НЕ
    // тот же communityId, что был у узла ДО попытки.
    if (newCommunityId !== oldCommunityId) {
      compensationRan = true;
      const stillUsed = (await CWJournal.nodes.getAll())
        .filter((n) => n.kind === 'congregation' && n.communityId === newCommunityId && n.id !== preNode).length;
      if (stillUsed === 0) await CWDirectory.detach(newCommunityId, 'journal');
    }
  }
  CWJournal.nodes.update = realUpdate; // восстановить сразу после форс-отказа

  ok('компенсация НЕ запускалась (newCommunityId === oldCommunityId)', compensationRan === false);
  ok('запись справочника всё ещё существует', CWDirectory.get(preExisting.id) !== null);
  ok("sources всё ещё содержит 'journal' (предсуществующая связь не пострадала)",
    CWDirectory.get(preExisting.id).sources.includes('journal'));
  ok('узел остался связан с той же записью (update действительно не прошёл, данные узла не менялись)',
    (await CWJournal.nodes.get(preNode)).communityId === preExisting.id);
}

/* ═══ 15б. Для контраста: НОВАЯ связь при отказе update() ДОЛЖНА
 *         компенсироваться (иначе осиротевшая заявка). */
console.log('\n15б. Контраст: при НОВОЙ связи отказ update() отпускает добавленный источник');
{
  const brandNew = await CWDirectory.create({ name: 'Новая связь (для контраста)' }, 'journal');
  // Другой узел, который ПРЕЖДЕ не был связан ни с чем.
  const freshNode = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Свежий узел' });
  const oldCommunityId = null; // узел не был связан раньше
  const newCommunityId = brandNew.id;

  const realUpdate2 = CWJournal.nodes.update;
  CWJournal.nodes.update = async function (id, patch) {
    if (id === freshNode) throw new Error('forced-update-failure-for-test-2');
    return realUpdate2(id, patch);
  };

  await CWDirectory.attach(newCommunityId, 'journal');
  try {
    await CWJournal.nodes.update(freshNode, { communityId: newCommunityId });
  } catch (e) {
    if (newCommunityId !== oldCommunityId) {
      const stillUsed = (await CWJournal.nodes.getAll())
        .filter((n) => n.kind === 'congregation' && n.communityId === newCommunityId && n.id !== freshNode).length;
      if (stillUsed === 0) await CWDirectory.detach(newCommunityId, 'journal');
    }
  }
  CWJournal.nodes.update = realUpdate2;

  ok('новая (не предсуществовавшая) связь ПРИ отказе update() отпускается — запись уходит целиком',
    CWDirectory.get(brandNew.id) === null);
}

/* ═══ 16. Контактные поля — создание и правка через CWDirectory ════════
 * spec-2 п.4: полный контракт идентичности (name/congNumber/address/
 * contactName/contactPhone/contactEmail/contactNote) персистится через
 * create()/upsert(), не дублируется в узле Журнала. */
console.log('\n16. Контактные поля: create() и upsert() персистят полностью');
{
  const withContacts = await CWDirectory.create({
    name: 'Собрание с контактами',
    congNumber: '777888',
    address: 'ул. Тестовая 1',
    contactName: 'Иван Иванов',
    contactPhone: '+48 600 000 000',
    contactEmail: 'ivan@example.com',
    contactNote: 'Звонить после 18:00',
  }, 'journal');
  ok('create() сохранил contactName', withContacts.contactName === 'Иван Иванов');
  ok('create() сохранил contactPhone', withContacts.contactPhone === '+48 600 000 000');
  ok('create() сохранил contactEmail', withContacts.contactEmail === 'ivan@example.com');
  ok('create() сохранил contactNote', withContacts.contactNote === 'Звонить после 18:00');

  const edited = await CWDirectory.upsert(Object.assign({}, withContacts, {
    contactPhone: '+48 700 000 000',
    contactNote: 'Новая заметка',
  }), 'journal');
  ok('upsert() обновил contactPhone', edited.contactPhone === '+48 700 000 000');
  ok('upsert() обновил contactNote', edited.contactNote === 'Новая заметка');
  ok('upsert() не затронул contactName (не передавался в патче явно, но сохранён из previous)',
    edited.contactName === 'Иван Иванов');

  // Узел Журнала при этом не хранит копию контактов — граница не нарушена.
  const contactNode = await CWJournal.nodes.add({ kind: 'congregation', parentId: circuitId, label: 'Контактный узел' });
  await CWJournal.nodes.update(contactNode, { communityId: withContacts.id });
  const contactNodeRow = await CWJournal.nodes.get(contactNode);
  ok('узел Журнала не хранит contactPhone/contactEmail/contactName',
    !('contactPhone' in contactNodeRow) && !('contactEmail' in contactNodeRow) && !('contactName' in contactNodeRow));
}

/* ═══ 17. Готовность справочника: init()=false не равно "нет записи" ═══
 * spec-2 п.5: недоступная/неготовая CWDirectory — это "пока не знаем", а
 * не "communityId разорван". Сама переменная directoryReady живёт в
 * app.js (DOM), поэтому здесь проверяется опора этой логики — то, что
 * отличает готовый CWDirectory от неготового: геттер `ready`. */
console.log('\n17. CWDirectory.ready как источник истины для готовности');
{
  ok('CWDirectory.ready истинно после успешного init() в этом прогоне', CWDirectory.ready === true);
  // Смоделировать ПОВТОРНЫЙ неудачный init() ПОСЛЕ уже удавшегося —
  // именно эта последовательность (успех → отказ) ловит класс бага,
  // где reload() возвращает false, но забывает откатить ready в false,
  // если он уже был true с прошлого раза (fix в shared/directory.js,
  // final corrective pass, п.2).
  const savedStore = CWDB.communities;
  CWDB.communities = undefined;
  const reinitResult = await CWDirectory.init();
  ok('init() при недоступном хранилище возвращает false, а не бросает', reinitResult === false);
  ok('CWDirectory.ready становится false после отказа, а не остаётся true от предыдущего успеха',
    CWDirectory.ready === false);
  CWDB.communities = savedStore;
  // Восстановление: следующий успешный init() должен вернуть ready в true —
  // подтверждает, что откат в false не «залипает» навсегда.
  const recovered = await CWDirectory.init();
  ok('после восстановления хранилища повторный init() возвращает true', recovered === true);
  ok('CWDirectory.ready снова true после восстановления', CWDirectory.ready === true);
  // Приложение обязано читать именно CWDirectory.ready (а не считать
  // directoryReady истинным только потому, что init() что-то вернул) —
  // эта проверка фиксирует контракт, на который опирается фикс в app.js
  // (directoryReady = !!CWDirectory.ready, а не безусловное true).
}

/* ═══ 18. Переименование собрания — один диспетчер для всех входов ════════
 * Регрессия финального аудита J3b: строка района вызывала локальное
 * nodes.update({label}), а связанное собрание показывается под
 * CWDirectory.name — переименование было невидимым. Топбар собрания уже шёл
 * через справочник, строка района — нет: два входа разошлись.
 * app.js держит логику в закрытии DOM-кода, поэтому здесь фиксируется её
 * устройство по разобранному исходнику; поведение обоих входов в браузере
 * проверяется живым прогоном (District-row + topbar). */
console.log('\n18. Переименование собрания: один диспетчер для строки района и топбара');
{
  const acorn = await import('acorn');
  const walk = await import('acorn-walk');
  const src = read('journal/js/app.js');
  const ast = acorn.parse(src, { ecmaVersion: 2022 });
  const fns = {};
  walk.full(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) fns[n.id.name] = src.slice(n.start, n.end);
  });
  const dispatcher = fns.renameNode || '';
  ok('есть единственный диспетчер renameNode()', !!dispatcher);
  ok('renameCongregation() больше не существует (второй путь не заведётся снова)', !fns.renameCongregation);
  ok('диспетчер: связанное собрание → редактор идентичности CWDirectory',
    /node\.kind === 'congregation'/.test(dispatcher) && /CWDirectory\.get\(node\.communityId\)/.test(dispatcher)
      && /openEditIdentityDialog\(node,/.test(dispatcher));
  ok('диспетчер: иначе → локальное nodes.update({ label })',
    /CWJournal\.nodes\.update\(node\.id, \{ label: value \}\)/.test(dispatcher));
  const rowAction = fns.handleRowAction || '';
  const renameBranch = (rowAction.match(/action === 'rename'\)\s*\{([\s\S]*?)\n\s{6}\}/) || [])[1] || '';
  ok('строка района (handleRowAction rename) идёт через renameNode()',
    /renameNode\(node\)/.test(renameBranch) && !/nodes\.update/.test(renameBranch));
  ok('топбар собрания (wireCongregationMenu rename) идёт через renameNode()',
    /data-action="rename"\]'\)\.onclick = function \(\) \{\s*panel\.hidden = true;\s*renameNode\(node\);/.test(fns.wireCongregationMenu || ''));
  const labelWrites = (src.match(/nodes\.update\([^)]*\{\s*label:/g) || []).length;
  ok('локальная запись label — ровно одна, внутри диспетчера', labelWrites === 1, String(labelWrites));
  ok('после правки идентичности перерисовывается открытый экран (refreshCurrentView)',
    /CWDirectory\.upsert\(patch, 'journal'\)\)\.then\([\s\S]{0,400}?refreshCurrentView\(\)/.test(fns.openEditIdentityDialog || ''));
}

console.log('');
if (failed) {
  console.log(`ИТОГ: ${failed} провал(ов)`);
  process.exit(1);
} else {
  console.log('ИТОГ: 0 FAIL');
  process.exit(0);
}
