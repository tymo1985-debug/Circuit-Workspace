#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-db-indexes.mjs
 *
 * Аудит 03, P2-5. Индекс, объявленный в STORES shared/db.js у хранилища,
 * которое у пользователя УЖЕ существует, обязан появиться при подъёме схемы.
 * Прежний onupgradeneeded создавал индексы только у новых хранилищ: у
 * вернувшегося пользователя byIndex() падал бы NotFoundError, а у разработчика
 * (чистая база) всё работало — отказ бесшумный.
 *
 * Сценарий: база старой версии, где `communities` есть, но без индекса
 * `congNumber`, и в ней лежит запись → CWDB.init() → индекс есть, запись цела,
 * byIndex() по новому индексу её находит.
 *
 *   node scripts/check-db-indexes.mjs   (fake-indexeddb)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = 'circuit-workspace-db';
let failed = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (cond || extra === undefined ? '' : ' — ' + extra));
  if (!cond) failed++;
};

/* Старая установка: версия 1, communities только с индексом name. */
await new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => {
    const s = r.result.createObjectStore('communities', { keyPath: 'id' });
    s.createIndex('name', 'name', { unique: false });
  };
  r.onsuccess = () => {
    const tx = r.result.transaction(['communities'], 'readwrite');
    tx.objectStore('communities').put({ id: 'c1', name: 'Старое собрание', congNumber: '4711' });
    tx.oncomplete = () => { r.result.close(); res(); };
    tx.onerror = () => rej(tx.error);
  };
  r.onerror = () => rej(r.error);
});

const sandbox = { self: {}, indexedDB, IDBKeyRange, console, Promise, Date, Math, JSON, setTimeout };
sandbox.self = sandbox;
vm.runInNewContext(readFileSync(join(ROOT, 'shared/db.js'), 'utf8'), sandbox);
const CWDB = sandbox.CWDB;

console.log('\nИндексы существующих хранилищ при подъёме схемы');
const db = await CWDB.init();
const names = [...db.transaction(['communities']).objectStore('communities').indexNames];
ok('у существующего хранилища появился недостающий индекс', names.includes('congNumber'), names.join(','));
ok('прежний индекс на месте', names.includes('name'));
const found = await CWDB.communities.byIndex('congNumber', '4711');
ok('данные пережили апгрейд и находятся по новому индексу', found.length === 1 && found[0].name === 'Старое собрание', JSON.stringify(found));
ok('недостающие хранилища тоже созданы', db.objectStoreNames.contains('journalNodes') && db.objectStoreNames.contains('archive'));

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nИндексы схемы доезжают до существующих хранилищ.');
process.exit(failed ? 1 : 0);
