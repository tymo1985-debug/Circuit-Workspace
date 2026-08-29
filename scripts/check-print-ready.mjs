#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-print-ready.mjs
 *
 * ЧТО ПРОВЕРЯЕТ. `CWPrint.document()` отправляет окно на печать по ГОТОВНОСТИ
 * окна и ровно ОДИН раз.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ПРОВЕРКА. Печать в этом проекте ломалась трижды, и все три
 * раза МОЛЧА — бумага выходила из принтера и выглядела как успех: `doPrint()`
 * печатал экран приложения вместо документа, `beforeprint` приходил дважды и
 * навсегда переименовывал вкладку, поля листа задавал диалог печати вместо
 * документа. Ошибку такого класса не видно ни в консоли, ни на экране; её
 * видно только на бумаге и только если приглядеться.
 *
 * ЧЕТЫРЕ ИСТОЧНИКА СИГНАЛА — И ПОЧЕМУ ИХ НАДО ПРОВЕРЯТЬ ВМЕСТЕ. `load`,
 * готовый `readyState` на момент подписки и страховочный таймер могут
 * сработать в любом сочетании. Каждый по отдельности обязан ДОВЕСТИ до
 * печати, а все вместе — не напечатать дважды: второй `window.print()` даёт
 * пользователю второй системный диалог на тот же документ.
 *
 * ГРАНИЦЫ, ЧЕСТНО.
 * - Окно поддельное. Проверяется ПОРЯДОК и КОЛИЧЕСТВО вызовов, а не то, что
 *   Safari действительно успел разложить страницу: это доказывается только
 *   бумагой, и доказывается Алексом после заливки.
 * - Часы поддельные. `setTimeout` подменён управляемым планировщиком, поэтому
 *   проверка говорит «печать не раньше страховки», а не «через три секунды».
 * - Содержимое документа (`BASE_CSS`, `@page`, язык) здесь не проверяется
 *   вовсе — это соседняя задача.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = await readFile(join(ROOT, 'shared/print.js'), 'utf8');
/* shared/escape.js грузится рядом, потому что так устроена настоящая страница:
   print.js зовёт CWEscape.html() без запасной ветки. Подставить сюда местную
   заглушку значило бы проверять не тот код, что работает у пользователя. */
const ESCAPE_SRC = await readFile(join(ROOT, 'shared/escape.js'), 'utf8');

let passed = 0;
const failures = [];

function check(title, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${title}`);
  } else {
    failures.push(title);
    console.log(`  ✗ ${title}${detail ? ` → ${detail}` : ''}`);
  }
}

/** Управляемые часы: задачи не выполняются, пока их не выпустят. */
function makeClock() {
  let now = 0;
  let seq = 0;
  const tasks = [];
  return {
    setTimeout(fn, ms) {
      const id = ++seq;
      tasks.push({ id, at: now + (ms || 0), fn });
      return id;
    },
    clearTimeout(id) {
      const i = tasks.findIndex((t) => t.id === id);
      if (i >= 0) tasks.splice(i, 1);
    },
    /** Выполнить всё, что назначено не позже `until`. */
    advance(until) {
      now = until;
      for (;;) {
        tasks.sort((a, b) => a.at - b.at || a.id - b.id);
        const i = tasks.findIndex((t) => t.at <= now);
        if (i < 0) return;
        const [task] = tasks.splice(i, 1);
        task.fn();
      }
    },
    pending: () => tasks.length,
  };
}

/**
 * Поддельное окно печати.
 * @param {object} opts
 *   readyState  — состояние документа сразу после записи
 *   raf         — есть ли requestAnimationFrame
 *   throwOnPrint— print() бросает исключение
 */
function makeWindow(opts) {
  const o = opts || {};
  const frames = [];
  const listeners = {};
  const win = {
    printed: 0,
    document: {
      readyState: o.readyState || 'loading',
      open() {},
      write() {},
      close() {},
    },
    focus() {},
    print() {
      win.printed += 1;
      if (o.throwOnPrint) throw new Error('печать недоступна');
    },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    /** Прогнать `load` так, как это сделал бы движок. */
    fireLoad() {
      win.document.readyState = 'complete';
      for (const fn of listeners.load || []) fn();
    },
    /** Отрисовать n кадров. */
    drawFrames(n) {
      for (let i = 0; i < (n || 1); i += 1) {
        const batch = frames.splice(0, frames.length);
        for (const fn of batch) fn();
      }
    },
    framesPending: () => frames.length,
  };
  if (o.raf !== false) win.requestAnimationFrame = (fn) => frames.push(fn);
  return win;
}

/** Загрузить shared/print.js в изолированный контекст с поддельным окружением. */
function loadPrint(clock, opener) {
  const ctx = {
    console,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    document: {
      title: 'Хаб',
      documentElement: { getAttribute: () => 'ru' },
    },
    open: opener,
    addEventListener() {},
  };
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(ESCAPE_SRC, ctx, { filename: 'shared/escape.js' });
  vm.runInContext(SRC, ctx, { filename: 'shared/print.js' });
  return ctx.CWPrint;
}

const DOC = { title: 'Письмо', html: '<p>текст</p>', lang: 'ru' };

console.log('Старт печати по готовности окна\n');

/* ── §1. Обычный путь: сигнал load ───────────────────────────────────────── */
console.log('§1. Обычный путь');
{
  const clock = makeClock();
  const win = makeWindow({ readyState: 'loading' });
  const CWPrint = loadPrint(clock, () => win);

  const ok = CWPrint.document(DOC);
  check('окно открыто, функция ответила true', ok === true, String(ok));
  check('до готовности окна печати нет', win.printed === 0, `printed=${win.printed}`);

  win.fireLoad();
  check('сразу по load печати ещё нет — ждём кадры', win.printed === 0, `printed=${win.printed}`);

  win.drawFrames(1);
  check('после первого кадра печати ещё нет', win.printed === 0, `printed=${win.printed}`);

  win.drawFrames(1);
  check('после второго кадра документ ушёл в печать', win.printed === 1, `printed=${win.printed}`);

  // Страховка обязана не добавить второй печати.
  clock.advance(60000);
  check('страховка не печатает повторно', win.printed === 1, `printed=${win.printed}`);
}

/* ── §2. Документ готов раньше подписки ──────────────────────────────────── */
console.log('\n§2. Документ уже готов, load не придёт');
{
  const clock = makeClock();
  const win = makeWindow({ readyState: 'complete' });
  const CWPrint = loadPrint(clock, () => win);

  CWPrint.document(DOC);
  win.drawFrames(2);
  check('печать состоялась без события load', win.printed === 1, `printed=${win.printed}`);

  clock.advance(60000);
  check('страховка не добавила вторую печать', win.printed === 1, `printed=${win.printed}`);
}

/* ── §3. Сигнала нет вовсе ───────────────────────────────────────────────── */
console.log('\n§3. Сигнала нет вовсе — работает страховка');
{
  const clock = makeClock();
  const win = makeWindow({ readyState: 'loading' });
  const CWPrint = loadPrint(clock, () => win);

  CWPrint.document(DOC);
  const guard = CWPrint._readyGuardMs;

  clock.advance(guard - 1);
  check('до истечения страховки печати нет', win.printed === 0, `printed=${win.printed}`);

  clock.advance(guard);
  check('по страховке документ всё же напечатан', win.printed === 1, `printed=${win.printed}`);

  clock.advance(60000);
  check('и ровно один раз', win.printed === 1, `printed=${win.printed}`);
}

/* ── §4. Сигнал и страховка вместе ───────────────────────────────────────── */
console.log('\n§4. load и страховка вместе — печать одна');
{
  const clock = makeClock();
  const win = makeWindow({ readyState: 'loading' });
  const CWPrint = loadPrint(clock, () => win);

  CWPrint.document(DOC);
  clock.advance(CWPrint._readyGuardMs);          // сработала страховка
  check('страховка напечатала', win.printed === 1, `printed=${win.printed}`);

  win.fireLoad();                                 // а сигнал пришёл после неё
  win.drawFrames(2);
  check('опоздавший load не даёт второго диалога печати', win.printed === 1, `printed=${win.printed}`);
}

/* ── §5. Движок без requestAnimationFrame ────────────────────────────────── */
console.log('\n§5. Движок без requestAnimationFrame');
{
  const clock = makeClock();
  const win = makeWindow({ readyState: 'loading', raf: false });
  const CWPrint = loadPrint(clock, () => win);

  CWPrint.document(DOC);
  win.fireLoad();
  check('без кадров печать не мгновенная', win.printed === 0, `printed=${win.printed}`);

  clock.advance(50);
  check('запасной путь довёл до печати', win.printed === 1, `printed=${win.printed}`);
  check('и не стал ждать страховку', clock.pending() >= 0 && win.printed === 1);
}

/* ── §6. Отказ печати не роняет вызывающего ──────────────────────────────── */
console.log('\n§6. Отказ печати');
{
  const clock = makeClock();
  const win = makeWindow({ readyState: 'complete', throwOnPrint: true });
  const CWPrint = loadPrint(clock, () => win);

  let threw = false;
  try {
    CWPrint.document(DOC);
    win.drawFrames(2);
  } catch (_) {
    threw = true;
  }
  check('исключение window.print() не уходит наружу', !threw);
  check('повтора после отказа нет', win.printed === 1, `printed=${win.printed}`);
}

/* ── §7. Заблокированное окно ────────────────────────────────────────────── */
console.log('\n§7. Заблокированное окно — отказ, а не печать чего-нибудь');
{
  const clock = makeClock();
  let blocked = 0;
  const CWPrint = loadPrint(clock, () => null);

  const ok = CWPrint.document({ ...DOC, onBlocked: () => { blocked += 1; } });
  check('функция ответила false', ok === false, String(ok));
  check('onBlocked позван ровно один раз', blocked === 1, `blocked=${blocked}`);

  clock.advance(60000);
  check('ни одного отложенного вызова печати не осталось', clock.pending() === 0, `pending=${clock.pending()}`);
}

/* ── §8. Фиксированной задержки в коде не осталось ───────────────────────── */
console.log('\n§8. Прежняя фиксированная задержка');
{
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const legacy = /setTimeout\s*\([^)]*win\.print\s*\(\s*\)[\s\S]{0,80}?,\s*250\s*\)/.test(body);
  check('setTimeout(…, 250) вокруг win.print() отсутствует', !legacy);
}

console.log('');
if (failures.length) {
  console.error(`Проверка старта печати не пройдена: провалено ${failures.length} из ${passed + failures.length}`);
  console.error(`- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Все ${passed} проверок пройдены: печать стартует по готовности окна и ровно один раз.`);
}
