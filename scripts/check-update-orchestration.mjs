#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-update-orchestration.mjs
 *
 * ЧТО ПРОВЕРЯЕТ. `shared/update.js`: checkAll()/applyAll() — единственное
 * место, где хаб решает, что модуль обновился, и доводит его до активации.
 * У этой оркестрации до сих пор не было НИ ОДНОЙ автоматической проверки —
 * только живой Chromium-прогон, который бьёт по всем сценариям сразу и не
 * ловит регресс конкретно в этом файле.
 *
 * ЧЕГО ЭТА ПРОВЕРКА НЕ ДОКАЗЫВАЕТ И НЕ ОБЯЗАНА. Реальный браузерный
 * update-алгоритм (побайтовое сравнение sw.js И его importScripts,
 * фактическую активацию воркера, clients.claim() над уже открытой
 * вкладкой) здесь НЕ смоделирован — это движок браузера, не код проекта, и
 * подделывать его значило бы проверять модель, а не регресс. Здесь
 * проверяется РОВНО оркестрация: правильно ли checkAll()/applyAll() читают
 * состояние ServiceWorkerRegistration, которое им подсунул браузер, —
 * включая гонки, которые уже описаны в комментариях самого файла.
 *
 *   node scripts/check-update-orchestration.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'shared/update.js'), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
};

/* --- минимальный EventTarget, которого хватает shared/update.js --------- */
class FakeTarget {
  constructor() { this._l = {}; }
  addEventListener(type, fn) { (this._l[type] = this._l[type] || []).push(fn); }
  emit(type) { (this._l[type] || []).slice().forEach((fn) => fn()); }
}

class FakeWorker extends FakeTarget {
  constructor() { super(); this.state = 'installing'; }
  set _state(v) { this.state = v; this.emit('statechange'); }
}

/**
 * Фабрика фейковой регистрации с УПРАВЛЯЕМЫМ по времени сценарием — именно
 * той гонкой, о которой предупреждают комментарии checkAll()/waitForOutcome():
 * `reg.update()` резолвится РАНЬШЕ, чем installing дошёл до installed/waiting.
 */
function makeRegistration(scope, scenario) {
  const reg = new FakeTarget();
  reg.scope = scope;
  reg.installing = null;
  reg.waiting = null;
  reg.active = { postMessage() {} };

  reg.update = () => {
    if (scenario === 'update-rejects') return Promise.reject(new Error('network'));
    if (scenario === 'no-update') return Promise.resolve();
    if (scenario === 'immediate-waiting') {
      const w = new FakeWorker(); w.state = 'installed';
      reg.waiting = w;
      return Promise.resolve();
    }
    if (scenario === 'delayed-installing') {
      // update() САМ резолвится сразу — сеть отработала, — а до installed
      // воркер доходит только через один макротик, ПОЗЖЕ. Ровно тот случай,
      // ради которого checkAll подписывается на updatefound/statechange
      // ДО чтения reg.waiting, а не просто опрашивает его один раз.
      setTimeout(() => {
        const w = new FakeWorker();
        reg.installing = w;
        reg.emit('updatefound');
        setTimeout(() => { w._state = 'installed'; reg.waiting = w; reg.installing = null; }, 5);
      }, 5);
      return Promise.resolve();
    }
    throw new Error('unknown scenario ' + scenario);
  };
  return reg;
}

function makeCtx() {
  const ctx = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    document: { readyState: 'complete', addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; }, head: { appendChild() {} }, body: { appendChild() {} } },
    navigator: { serviceWorker: Object.assign(new FakeTarget(), { controller: null, register: () => Promise.resolve(null), getRegistrations: () => Promise.resolve([]) }) },
    location: { reload() {} },
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}

console.log('\ncheckAll(): гонка update()-резолвится-раньше-installed');
{
  const ctx = makeCtx();
  const regHub = makeRegistration('/', 'no-update');
  const regSchool = makeRegistration('/pioneer-school/', 'delayed-installing');
  ctx.navigator.serviceWorker.getRegistrations = () => Promise.resolve([regHub, regSchool]);

  const result = await ctx.CWUpdate.checkAll();
  ok('School (installed ПОЗЖЕ update()) найден как ready',
    result.ready.some((r) => r.scope === '/pioneer-school/'));
  ok('Hub (без апдейта) НЕ попал ни в ready, ни в failed',
    !result.ready.some((r) => r.scope === '/') && !result.failed.some((r) => r.scope === '/'));
  ok('ничего не попало в failed при этой гонке', result.failed.length === 0, result.failed);
}

console.log('\ncheckAll(): update() уже отклонился (реальная сетевая ошибка)');
{
  const ctx = makeCtx();
  const regBroken = makeRegistration('/appointments/', 'update-rejects');
  ctx.navigator.serviceWorker.getRegistrations = () => Promise.resolve([regBroken]);
  const result = await ctx.CWUpdate.checkAll();
  ok('отклонённый update() — это failed, а не тихий noUpdate',
    result.failed.some((r) => r.scope === '/appointments/'));
  ok('и не ready одновременно', !result.ready.some((r) => r.scope === '/appointments/'));
}

console.log('\napplyAll(): SKIP_WAITING чужому scope + подтверждение активации');
{
  const ctx = makeCtx();
  const reg = makeRegistration('/pioneer-school/', 'immediate-waiting');
  await reg.update();   // тот же путь, что и в checkAll — воркер уже waiting
  let skipSent = false;
  reg.waiting.postMessage = (msg) => {
    if (msg && msg.type === 'SKIP_WAITING') {
      skipSent = true;
      // Активация — асинхронная, как и в браузере: waiting исчезает не
      // мгновенно после postMessage, а спустя реальное время.
      setTimeout(() => { reg.waiting = null; }, 20);
    }
  };
  const { results, allActivated } = await ctx.CWUpdate.applyAll([{ scope: reg.scope, reg }]);
  ok('SKIP_WAITING реально отправлен чужому (не-хабовому) scope', skipSent);
  ok('активация подтверждена по исчезновению reg.waiting (не по таймауту)',
    results[0].status === 'activated', results[0].status);
  ok('allActivated=true для полностью подтверждённого списка', allActivated === true);
}

console.log('\napplyAll(): активация не подтвердилась в пределах таймаута');
{
  const ctx = makeCtx();
  const reg = makeRegistration('/documents/', 'immediate-waiting');
  await reg.update();
  reg.waiting.postMessage = () => { /* воркер никогда не активируется в этом сценарии */ };
  const { results, allActivated } = await ctx.CWUpdate.applyAll([{ scope: reg.scope, reg }]);
  ok('timedOut — честный статус, а не молчаливый "activated"', results[0].status === 'timedOut', results[0].status);
  ok('allActivated=false, когда хоть один scope не подтвердился', allActivated === false);
}

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\ncheckAll()/applyAll(): гонки install/waiting/activate из собственных комментариев файла — под регрессом.');
process.exit(failed ? 1 : 0);
