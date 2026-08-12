#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-backup.mjs
 *
 * Проверяет резервное копирование: что копия модуля везёт с собой те части
 * общего слоя, без которых её данные неполны, и что её восстановление
 * СЛИВАЕТ общий слой, а не заменяет его.
 *
 * ПОЧЕМУ ЭТА ПРОВЕРКА ЗДЕСЬ, хотя правило отбора в check-all.mjs говорит
 * «только то, что уже ломалось повторно». Это осознанное исключение, и вот
 * основание. Ошибка в этой области необратима: пользователь узнаёт о ней в
 * момент, когда восстанавливается после потери устройства, то есть когда
 * исправлять уже нечего. При этом ошибка бесшумна — копия сохраняется, файл
 * скачивается, никакого сообщения нет. Так и была устроена та, что нашлась
 * 12.08.2026: копия модуля не включала `cw-sender`, и восстановление на чистом
 * устройстве давало письма с пустой шапкой.
 *
 * Второе основание — реестр MODULES будет пополняться. Фаза 2 общего слоя
 * документов добавит туда хранилище `templates`, новые модули добавят себя.
 * Забыть объявить зависимость легко, а последствие — та же тихая потеря.
 * Поэтому проверка следит и за самим реестром: каждый модуль обязан ЯВНО
 * сказать, что ему нужно от общего слоя, пусть даже «ничего».
 *
 * Если решишь, что проверка лишняя — убери запись из CHECKS в check-all.mjs.
 *
 *   node scripts/check-backup.mjs
 *
 * Требует fake-indexeddb: npm install fake-indexeddb
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = 'circuit-workspace-db';

/* --- Окружение браузера, которого нет в Node ---------------------------- */
globalThis.self = globalThis;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = {};

eval(readFileSync(join(ROOT, 'shared/backup.js'), 'utf8'));

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

/* --- Помощники IndexedDB ------------------------------------------------ */
const open = (name, version, build) => new Promise((res, rej) => {
  const r = indexedDB.open(name, version);
  if (build) r.onupgradeneeded = () => build(r.result);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const put = (db, store, rows) => new Promise((res, rej) => {
  const tx = db.transaction([store], 'readwrite');
  rows.forEach((row) => tx.objectStore(store).put(row));
  tx.oncomplete = res;
  tx.onerror = () => rej(tx.error);
});
const rows = (name, store) => new Promise((res, rej) => {
  const r = indexedDB.open(name);
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains(store)) { db.close(); return res([]); }
    const q = db.transaction([store]).objectStore(store).getAll();
    q.onsuccess = () => { db.close(); res(q.result); };
    q.onerror = () => rej(q.error);
  };
  r.onerror = () => rej(r.error);
});

/* --- 1. Реестр: каждый модуль объявил зависимости явно ------------------- */
console.log('\nРеестр модулей');
Object.keys(CWBackup.MODULES).forEach((id) => {
  const entry = CWBackup.MODULES[id];
  ok(id + ': объявлены зависимости от общего слоя',
    Array.isArray(entry.sharedLocal) && entry.sharedStores && typeof entry.sharedStores === 'object',
    'нужны поля sharedLocal (массив) и sharedStores (объект), пусть и пустые');
});

/* --- 2. Сценарий: копия модуля и её восстановление ----------------------- */
console.log('\nКопия модуля');

/* Общая база с данными ДВУХ модулей: так проверяется, что чужое уцелеет. */
let db = await open(DB, 1, (d) => {
  d.createObjectStore('templates', { keyPath: 'id' });
  d.createObjectStore('communities', { keyPath: 'id' });
});
await put(db, 'templates', [
  { id: 'tpl_own', body: 'шаблон проверяемого модуля' },
  { id: 'tpl_neighbour', body: 'шаблон соседнего модуля' },
]);
await put(db, 'communities', [{ id: 'c1', name: 'Тестовое собрание' }]);
db.close();

/* Берём первый модуль, которому реально что-то нужно от общего слоя. */
const subject = Object.keys(CWBackup.MODULES).find((id) => (CWBackup.MODULES[id].sharedLocal || []).length);
if (!subject) {
  console.log('  ! ни один модуль не объявил зависимости — сценарий пропущен');
} else {
  /* Хранилище общей базы подмешиваем на время проверки: пока ни один модуль
     от неё не зависит, но фаза 2 это изменит, и механизм должен работать
     заранее, а не «когда понадобится». */
  CWBackup.MODULES[subject].sharedStores = { [DB]: ['templates'] };

  mem.set('cw-sender', JSON.stringify({ name: 'Тест Тестович' }));
  mem.set('cw-lang', 'pl');

  const snap = await CWBackup.snapshot([subject]);
  const shared = snap.sections.shared || {};
  ok(subject + ': копия модуля включает общий слой', !!snap.sections.shared);
  ok('секция помечена частичной (partial)', shared.partial === true);
  ok('объявленные ключи попали в копию',
    (CWBackup.MODULES[subject].sharedLocal || []).every((k) => shared.local && shared.local[k] !== undefined));
  ok('глобальный язык хаба НЕ захвачен', !shared.local || shared.local['cw-lang'] === undefined);
  ok('объявленное хранилище попало в копию', (shared.idb?.[DB]?.stores?.templates?.rows || []).length === 2);
  ok('необъявленное хранилище НЕ попало', !shared.idb?.[DB]?.stores?.communities);

  /* Портим состояние и восстанавливаем: сосед обязан уцелеть. */
  mem.set('cw-sender', JSON.stringify({ name: 'испорчено' }));
  db = await open(DB, 1);
  await put(db, 'templates', [{ id: 'tpl_own', body: 'испорчено' }, { id: 'tpl_late', body: 'появился позже копии' }]);
  db.close();

  await CWBackup.restore(snap);
  console.log('\nВосстановление копии модуля');
  ok('свои данные восстановлены', JSON.parse(mem.get('cw-sender')).name === 'Тест Тестович');
  ok('глобальный язык хаба не тронут', mem.get('cw-lang') === 'pl');
  const t = Object.fromEntries((await rows(DB, 'templates')).map((r) => [r.id, r]));
  ok('своё хранилище восстановлено', t.tpl_own?.body === 'шаблон проверяемого модуля');
  ok('ЧУЖИЕ записи уцелели', !!t.tpl_neighbour && !!t.tpl_late,
    'восстановление копии одного модуля не имеет права стирать данные соседей');
  ok('необъявленное хранилище уцелело', (await rows(DB, 'communities')).length === 1);
}

/* --- 3. Полная копия хаба по-прежнему заменяет целиком ------------------- */
console.log('\nПолная копия хаба');
const full = await CWBackup.snapshot();
ok('без пометки partial', full.sections.shared.partial === undefined);
ok('берёт общую базу целиком', !!full.sections.shared.idb?.[DB]?.stores?.communities);
db = await open(DB, 1);
await put(db, 'templates', [{ id: 'tpl_stale', body: 'мусор' }]);
db.close();
await CWBackup.restore(full);
ok('восстановление убирает лишние записи', !(await rows(DB, 'templates')).some((r) => r.id === 'tpl_stale'));

/* --- 4. Версия формата -------------------------------------------------- */
console.log('\nФормат файла');
ok('формат не ниже 2 — частичная секция требует нового номера', CWBackup.FORMAT_VERSION >= 2,
  'иначе прежний код примет файл и сотрёт ключи, которых в частичной секции нет');
ok('файлы прежнего формата всё ещё читаются', CWBackup.inspect({ ...full, formatVersion: 1 }).ok);

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nВсе проверки резервного копирования пройдены.');
process.exit(failed ? 1 : 0);
