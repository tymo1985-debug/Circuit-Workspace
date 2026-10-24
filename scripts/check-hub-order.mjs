#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-hub-order.mjs
 *
 * ЧТО ЛОВИТ. Пользовательский порядок плиток хаба (блок HUB-ORDER в
 * index.html): одна зона — рабочие модули (системные карточки с 23.10.2026 живут на экране «Настройки» и не переставляются).
 * Проверяется, что сохранённый порядок никогда не переносит элемент в чужую
 * зону, не создаёт дублей, переживает перезагрузку, добавление и удаление
 * модулей, а сброс возвращает канон обеих зон.
 *
 * ЗАЧЕМ. Сохранённая запись живёт между выпусками: после обновления список
 * модулей меняется, а запись — нет. Ошибка нормализации здесь бесшумна —
 * пустая плитка, потерянный модуль или модуль не в своём разделе.
 *
 * КАК. Исходная разметка index.html загружается в jsdom без её скриптов;
 * исполняется только блок HUB-ORDER. «Перезагрузка» — новый jsdom с тем же
 * localStorage. Коды: 0 — чисто; 1 — провал; 2 — нет jsdom.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hubSource } from './lib/hub-source.mjs';

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); } catch (e) {
  console.log('SKIP: jsdom не установлен (npm i jsdom)'); process.exit(2);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = hubSource(ROOT);
const m = HTML.match(/\/\* HUB-ORDER:BEGIN[\s\S]*?\/\* HUB-ORDER:END \*\//);
if (!m) { console.log('FAIL: блок HUB-ORDER не найден в index.html'); process.exit(1); }
const BLOCK = m[0];
const KEY = 'cw-hub-order';

let failed = 0;
function ok(cond, msg) { if (cond) console.log('  ok  ' + msg); else { failed++; console.log('  FAIL ' + msg); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Разметка без скриптов: исполняем только блок порядка.
const MARKUP = HTML.replace(/<script\b[\s\S]*?<\/script>/g, '');

function boot(storage, markup = MARKUP) {
  const dom = new JSDOM(markup, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.eval(BLOCK);
  const save = () => { const s = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); s[k] = w.localStorage.getItem(k); } return s; };
  const dom_ = (sel, attr) => [...w.document.querySelector(sel).children]
    .filter((el) => (attr === 'id' ? el.id : el.getAttribute(attr)))
    .map((el) => attr === 'id' ? el.id : el.getAttribute(attr));
  return {
    w, O: w.CWHubOrder, save,
    work: () => dom_('#moduleGrid', 'data-module'),
  };
}

const b0 = boot({});
const CW = b0.O.canonical('work');
ok(CW.length >= 2, `канон снят с разметки: work=${CW.join(',')}`);
ok(!b0.w.document.querySelector('.cw-grid--system') && !b0.O.canonical('system').length, '0. системной зоны на главной нет (карточки живут на экране «Настройки»)');

// 1. default order без preference
ok(eq(b0.work(), CW), '1. без сохранённого порядка — канонический порядок');

// 2. custom order
const W2 = CW.slice().reverse();
const b1 = boot({});
b1.O.move('work', CW[0], CW.length - 1);
b1.O.move('work', CW[1], 0);
const expW = (() => { const o = CW.slice(); o.push(o.shift()); const i = o.indexOf(CW[1]); o.splice(i, 1); o.unshift(CW[1]); return o; })();
ok(eq(b1.work(), expW), '2. пользовательский порядок рабочих модулей применён');

// 4. reload
const b2 = boot(b1.save());
ok(eq(b2.work(), expW), '4. после перезагрузки порядок сохранён');

// 5. move() отклоняет чужую/старую зону и чужие id
const b3 = boot({});
ok(b3.O.move('system', CW[0], 0) === false && b3.O.move('work', 'backupCard', 0) === false, '5. move() отклоняет зону system и id карточек настроек');
ok(!(JSON.parse(b3.save()[KEY] || '{}').system), '5. в записи нет ключа system');

// 6. старая запись с ключом system (до 23.10.2026) не ломает порядок и очищается при первой записи
const bX = boot({ [KEY]: JSON.stringify({ v: 1, work: ['backupCard', ...W2], system: ['senderCard', 'backupCard'] }) });
ok(eq(bX.work(), W2), '6. старая запись: чужие id и ключ system игнорируются');
bX.O.move('work', W2[0], 1);
const raw = JSON.parse(bX.save()[KEY]);
ok(!raw.system && !raw.work.includes('backupCard'), '6. при первой записи ключ system и чужие id вычищены');

// 7. перетаскивание внутри зоны
const b4 = boot({});
const rect = (el, l, t, r, bt) => { el.getBoundingClientRect = () => ({ left: l, top: t, right: r, bottom: bt, width: r - l, height: bt - t }); };
const wg = b4.w.document.getElementById('moduleGrid');
rect(wg, 0, 0, 1000, 500);
[...wg.children].forEach((el, i) => rect(el, i * 100, 0, i * 100 + 90, 200));
ok(b4.O.hitTest('work', 150, 50) && b4.O.hitTest('work', 150, 50).getAttribute('data-module') === CW[1], '7. внутри зоны цель находится');
ok(b4.O.hitTest('work', 150, 700) === null, '7. точка вне зоны цели не даёт');
const pe = (el, type, x, y) => { const ev = new b4.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }); Object.defineProperty(ev, 'pointerId', { value: 1 }); Object.defineProperty(ev, 'pointerType', { value: 'mouse' }); el.dispatchEvent(ev); };
b4.O.setEditing(true);
const h0 = b4.w.document.querySelector(`[data-module="${CW[0]}"] .cw-order-handle`);
ok(!!h0, '7. в режиме настройки у плитки есть ручка');
pe(h0, 'pointerdown', 10, 10); pe(h0, 'pointermove', 250, 50); pe(h0, 'pointerup', 250, 50);
b4.O.setEditing(false);
ok(b4.work()[2] === CW[0], '7. перетаскивание внутри рабочей зоны переставляет плитку');
ok(!b4.w.document.querySelector('.cw-order-ctl') && !b4.w.document.querySelector('#moduleGrid a[tabindex="-1"]'), 'выход из режима снимает элементы управления и возвращает фокусируемость ссылок');

// 8. неизвестный id отбрасывается
const b5 = boot({ [KEY]: JSON.stringify({ v: 1, work: ['ghost-module', ...W2] }) });
ok(eq(b5.work(), W2), '8. неизвестные id игнорируются, пустых плиток нет');

// 9. обновление: новый модуль, один удалён; порядок сохранён
const saved = boot({}); saved.O.move('work', CW[0], CW.length - 1);
const store = saved.save();
const removed = CW[1];
const upd = MARKUP
  .replace(/(<div class="cw-grid" id="moduleGrid">)/, '$1<a class="cw-tile-link" href="x/index.html" data-module="zz-new"><article class="cw-card cw-tile"></article></a>')
  .replace(new RegExp(`<a class="cw-tile-link"[^>]*data-module="${removed}"[\\s\\S]*?</a>`), '');
const b6 = boot(store, upd);
const userW = CW.slice(1).concat(CW[0]).filter((id) => id !== removed);
ok(eq(b6.work(), userW.concat('zz-new')), '9. новый модуль — в конце, пользовательский порядок и удаление модуля учтены');

// 11. reset
const b7 = boot(store);
b7.O.reset();
ok(eq(b7.work(), CW) && !(KEY in b7.save()), '11. сброс возвращает канон и удаляет запись');
ok(eq(boot(b7.save()).work(), CW), '11. после сброса и перезагрузки — канон');

// 12. дубли
const b8 = boot({ [KEY]: JSON.stringify({ v: 1, work: [CW[2], CW[2], CW[0], CW[2]] }) });
ok(b8.work().length === CW.length && new Set(b8.work()).size === CW.length && b8.work()[0] === CW[2], '12. повторные id не дают дублей плиток');

// Мусор в хранилище
for (const junk of ['{', 'null', '"x"', '[1,2]', JSON.stringify({ work: 'x', system: 5 })]) {
  const b = boot({ [KEY]: junk });
  if (!eq(b.work(), CW)) { ok(false, 'мусор в записи: ' + junk); }
}
ok(true, 'мусор в записи (битый JSON, не объект, не массивы) даёт канон без ошибок');

// Вне режима настройки клик по плитке не перехватывается
const b9 = boot({});
const link = b9.w.document.querySelector('#moduleGrid a');
const ev = new b9.w.MouseEvent('click', { bubbles: true, cancelable: true });
link.dispatchEvent(ev);
ok(!ev.defaultPrevented, 'вне режима настройки клик по плитке открывает модуль');
b9.O.setEditing(true);
const ev2 = new b9.w.MouseEvent('click', { bubbles: true, cancelable: true });
link.dispatchEvent(ev2);
ok(ev2.defaultPrevented, 'в режиме настройки клик по плитке модуль не открывает');

console.log(failed ? `\nFAIL: ${failed}` : '\nOK');
process.exit(failed ? 1 : 0);
