#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-hub-order.mjs
 *
 * ЧТО ЛОВИТ. Пользовательский порядок плиток хаба (блок HUB-ORDER в
 * index.html): две независимые зоны — рабочие модули и системные карточки.
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

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); } catch (e) {
  console.log('SKIP: jsdom не установлен (npm i jsdom)'); process.exit(2);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
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
    .filter((el) => !el.className.includes('cw-rib') && (attr === 'id' ? el.id : el.getAttribute(attr)))
    .map((el) => attr === 'id' ? el.id : el.getAttribute(attr));
  return {
    w, O: w.CWHubOrder, save,
    work: () => dom_('#moduleGrid', 'data-module'),
    system: () => dom_('.cw-grid--system', 'id'),
  };
}

const b0 = boot({});
const CW = b0.O.canonical('work');
const CS = b0.O.canonical('system');
ok(CW.length >= 2 && CS.length >= 2, `канон снят с разметки: work=${CW.join(',')} system=${CS.join(',')}`);

// 1. default order без preference
ok(eq(b0.work(), CW) && eq(b0.system(), CS), '1. без сохранённого порядка — канонический порядок обеих зон');

// 2, 3. custom order
const W2 = CW.slice().reverse(), S2 = CS.slice().reverse();
const b1 = boot({});
b1.O.move('work', CW[0], CW.length - 1);
b1.O.move('work', CW[1], 0);
const expW = (() => { const o = CW.slice(); o.push(o.shift()); const i = o.indexOf(CW[1]); o.splice(i, 1); o.unshift(CW[1]); return o; })();
ok(eq(b1.work(), expW), '2. пользовательский порядок рабочих модулей применён');
b1.O.move('system', CS[0], CS.length - 1);
const expS = CS.slice(1).concat(CS[0]);
ok(eq(b1.system(), expS) && eq(b1.work(), expW), '3. пользовательский порядок системных карточек применён, рабочие не тронуты');

// 4. reload
const b2 = boot(b1.save());
ok(eq(b2.work(), expW) && eq(b2.system(), expS), '4. после перезагрузки оба порядка сохранены');

// 5, 6. чужой id не сохраняется
const b3 = boot({});
ok(b3.O.move('system', CW[0], 0) === false && b3.O.move('work', CS[0], 0) === false, '5/6. move() отклоняет id чужой зоны');
const rawSaved = JSON.parse(b3.save()[KEY] || '{}');
ok(!(rawSaved.system || []).some((id) => CW.includes(id)) && !(rawSaved.work || []).some((id) => CS.includes(id)), '5/6. в записи нет id чужой зоны');
const bX = boot({ [KEY]: JSON.stringify({ v: 1, work: [CS[0], ...W2], system: [CW[0], ...S2] }) });
bX.O.move('work', W2[0], 1);
const raw = JSON.parse(bX.save()[KEY]);
ok(!raw.work.includes(CS[0]) && !raw.system.includes(CW[0]), '5/6. повреждённая запись с чужими id очищается при первой записи');
ok(eq(bX.system(), S2) && !bX.work().includes(CS[0]) && !bX.system().includes(CW[0]), '13. повреждённая запись не меняет зону элемента');

// 7. cross-group drag: над чужой зоной целей нет
const b4 = boot({});
const rect = (el, l, t, r, bt) => { el.getBoundingClientRect = () => ({ left: l, top: t, right: r, bottom: bt, width: r - l, height: bt - t }); };
const wg = b4.w.document.getElementById('moduleGrid');
const sg = b4.w.document.querySelector('.cw-grid--system');
rect(wg, 0, 0, 1000, 500); rect(sg, 0, 600, 1000, 900);
[...wg.children].forEach((el, i) => rect(el, i * 100, 0, i * 100 + 90, 200));
[...sg.children].forEach((el, i) => rect(el, i * 500, 600, i * 500 + 490, 900));
ok(b4.O.hitTest('work', 100, 700) === null, '7. точка над системной зоной не даёт цели при перетаскивании рабочей плитки');
ok(b4.O.hitTest('system', 50, 50) === null, '7. точка над рабочей зоной не даёт цели при перетаскивании системной карточки');
ok(b4.O.hitTest('work', 150, 50) && b4.O.hitTest('work', 150, 50).getAttribute('data-module') === CW[1], '7. внутри своей зоны цель находится');
// сквозной сценарий через pointer-события: «Резервное копирование» → рабочая зона
b4.O.setEditing(true);
const handle = b4.w.document.querySelector('#backupCard .cw-order-handle');
ok(!!handle, '7. в режиме настройки у карточки есть ручка');
const fire = (el, type, x, y) => el.dispatchEvent(new b4.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
// jsdom без PointerEvent: подменяем pointerId/pointerType
const pe = (el, type, x, y) => { const ev = new b4.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }); Object.defineProperty(ev, 'pointerId', { value: 1 }); Object.defineProperty(ev, 'pointerType', { value: 'mouse' }); el.dispatchEvent(ev); };
pe(handle, 'pointerdown', 10, 610);
pe(handle, 'pointermove', 150, 50);
pe(handle, 'pointerup', 150, 50);
b4.O.setEditing(false);
ok(eq(b4.system(), CS) && eq(b4.work(), CW) && b4.w.document.getElementById('backupCard').parentNode === sg, '7. «Резервное копирование» не переносится в рабочие модули');
const b4r = boot(b4.save());
ok(b4r.w.document.getElementById('backupCard').parentNode === b4r.w.document.querySelector('.cw-grid--system'), '7. после перезагрузки «Резервное копирование» в системной секции');
if (CW.includes('journal')) {
  b4.O.setEditing(true);
  const jh = b4.w.document.querySelector('[data-module="journal"] .cw-order-handle');
  pe(jh, 'pointerdown', 10, 10); pe(jh, 'pointermove', 100, 700); pe(jh, 'pointerup', 100, 700);
  b4.O.setEditing(false);
  ok(eq(b4.work(), CW) && eq(b4.system(), CS) && !(b4.save()[KEY]), '7. «Журнал» не переносится в системную секцию, запись не создана');
}
// drag внутри зоны работает
b4.O.setEditing(true);
const h0 = b4.w.document.querySelector(`[data-module="${CW[0]}"] .cw-order-handle`);
pe(h0, 'pointerdown', 10, 10); pe(h0, 'pointermove', 250, 50); pe(h0, 'pointerup', 250, 50);
b4.O.setEditing(false);
ok(b4.work()[2] === CW[0] && eq(b4.system(), CS), '7. перетаскивание внутри рабочей зоны переставляет плитку');
ok(!b4.w.document.querySelector('.cw-order-ctl') && !b4.w.document.querySelector('#moduleGrid a[tabindex="-1"]'), 'выход из режима снимает элементы управления и возвращает фокусируемость ссылок');

// 8. неизвестный id отбрасывается
const b5 = boot({ [KEY]: JSON.stringify({ v: 1, work: ['ghost-module', ...W2], system: ['ghostCard', ...S2] }) });
ok(eq(b5.work(), W2) && eq(b5.system(), S2), '8. неизвестные id игнорируются, пустых плиток нет');

// 9, 10. обновление: новый модуль в каждой зоне, один удалён; оба порядка сохранены
const saved = boot({}); saved.O.move('work', CW[0], CW.length - 1); saved.O.move('system', CS[0], CS.length - 1);
const store = saved.save();
const removed = CW[1];
let upd = MARKUP
  .replace(/(<div class="cw-grid" id="moduleGrid">)/, '$1<a class="cw-tile-link" href="x/index.html" data-module="zz-new"><article class="cw-card cw-tile"></article></a>')
  .replace(new RegExp(`<a class="cw-tile-link"[^>]*data-module="${removed}"[\\s\\S]*?</a>`), '')
  .replace(/(<div class="cw-grid cw-grid--system">)/, '$1<article class="cw-card cw-syscard" id="zzNewCard"></article>');
const b6 = boot(store, upd);
const userW = CW.slice(1).concat(CW[0]).filter((id) => id !== removed);
ok(eq(b6.work(), userW.concat('zz-new')), '9. новый рабочий модуль — в конце рабочей секции, пользовательский порядок и удаление модуля учтены');
ok(eq(b6.system(), CS.slice(1).concat(CS[0], 'zzNewCard')), '10. новая системная карточка — в конце системной секции, порядок сохранён');
ok(!b6.system().includes('zz-new') && !b6.work().includes('zzNewCard'), '9/10. между секциями ничего не переместилось');

// 11. reset
const b7 = boot(store);
b7.O.reset();
ok(eq(b7.work(), CW) && eq(b7.system(), CS) && !(KEY in b7.save()), '11. сброс возвращает канон обеих зон и удаляет запись');
ok(eq(boot(b7.save()).work(), CW), '11. после сброса и перезагрузки — канон');

// 12. дубли
const b8 = boot({ [KEY]: JSON.stringify({ v: 1, work: [CW[2], CW[2], CW[0], CW[2]], system: [CS[1], CS[1]] }) });
ok(b8.work().length === CW.length && new Set(b8.work()).size === CW.length && b8.work()[0] === CW[2], '12. повторные id в рабочей записи не дают дублей плиток');
ok(eq(b8.system(), [CS[1], ...CS.filter((x) => x !== CS[1])]), '12. повторные id в системной записи не дают дублей');

// Мусор в хранилище
for (const junk of ['{', 'null', '"x"', '[1,2]', JSON.stringify({ work: 'x', system: 5 })]) {
  const b = boot({ [KEY]: junk });
  if (!(eq(b.work(), CW) && eq(b.system(), CS))) { ok(false, 'мусор в записи: ' + junk); }
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
