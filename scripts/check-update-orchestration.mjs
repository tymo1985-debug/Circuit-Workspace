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
const HUB = readFileSync(join(ROOT, 'index.html'), 'utf8');

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
  constructor(info = null) { super(); this.state = 'installing'; this.info = info; }
  set _state(v) { this.state = v; this.emit('statechange'); }
  postMessage(msg, ports) { if (msg.type === 'CW_VERSION' && ports && ports[0]) ports[0].postMessage(this.info); }
}

class FakeMessageChannel {
  constructor() {
    this.port1 = { onmessage: null, close() {} };
    this.port2 = { postMessage: (data) => setTimeout(() => this.port1.onmessage && this.port1.onmessage({ data }), 0) };
  }
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
  const id = scope === '/' ? 'hub' : scope.split('/').filter(Boolean).pop();
  const versions = { hub: '0.41.58', 'pioneer-school': '1.14.56', appointments: '5.5.95', documents: '1.11.5' };
  reg.active = new FakeWorker({ module: id, version: versions[id] });

  reg.update = () => {
    reg._updateCalled = true;
    if (scenario === 'update-rejects') return Promise.reject(new Error('network'));
    if (scenario === 'no-update') return Promise.resolve();
    if (scenario === 'immediate-waiting') {
      const w = new FakeWorker({ module: id, version: versions[id] }); w.state = 'installed';
      reg.waiting = w;
      return Promise.resolve();
    }
    if (scenario === 'delayed-installing') {
      // update() САМ резолвится сразу — сеть отработала, — а до installed
      // воркер доходит только через один макротик, ПОЗЖЕ. Ровно тот случай,
      // ради которого checkAll подписывается на updatefound/statechange
      // ДО чтения reg.waiting, а не просто опрашивает его один раз.
      setTimeout(() => {
        const w = new FakeWorker({ module: id, version: versions[id] });
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
    setTimeout, clearTimeout, setInterval, clearInterval, MessageChannel: FakeMessageChannel, URL,
    document: { baseURI: 'https://example.test/', readyState: 'complete', addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; }, head: { appendChild() {} }, body: { appendChild() {} } },
    navigator: { serviceWorker: Object.assign(new FakeTarget(), { controller: null, register: () => Promise.resolve(null), getRegistrations: () => Promise.resolve([]) }) },
    location: { href: 'https://example.test/', reload() {} },
    CW_VERSION: '0.41.58',
    CW_MODULES: {
      'pioneer-school': { version: '1.14.56' },
      appointments: { version: '5.5.95' },
      documents: { version: '1.11.5' },
    },
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}

console.log('\ncheckAll(): отказ register() изолирован и сохраняет диагностику');
{
  const ctx = makeCtx();
  const ids = ['congress-project', 'circuit-planner', 'pioneer-school', 'appointments', 'documents', 'journal'];
  ids.forEach((id) => { ctx.CW_MODULES[id] = { version: '1.0.0', worker: id + '/sw.js' }; });
  const registrations = [makeRegistration('/', 'no-update')];
  let successfulRegistrations = 0;
  ctx.navigator.serviceWorker.register = (_script, options) => {
    const id = new URL(options.scope).pathname.split('/').filter(Boolean).pop();
    if (id === 'journal') {
      const err = new Error('registration blocked');
      err.name = 'SecurityError';
      return Promise.reject(err);
    }
    successfulRegistrations++;
    registrations.push(makeRegistration(new URL(options.scope).pathname, 'no-update'));
    return Promise.resolve(registrations.at(-1));
  };
  ctx.navigator.serviceWorker.getRegistrations = () => Promise.resolve(registrations);
  const result = await ctx.CWUpdate.checkAll();
  const failure = result.failed.find((item) => item.module === 'journal');
  ok('после одного register rejection остальные пять модулей зарегистрированы', successfulRegistrations === 5, successfulRegistrations);
  ok('Hub и остальные пять scope всё равно прошли update()', registrations.every((reg) => reg._updateCalled === true), registrations.map((reg) => reg.scope));
  ok('register failure содержит module/scope/phase', failure && failure.scope === 'https://example.test/journal/' && failure.phase === 'register', failure);
  ok('register failure сохраняет error.name/message', failure && failure.error.name === 'SecurityError' && failure.error.message === 'registration blocked', failure);
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
  const failure = result.failed.find((r) => r.scope === '/appointments/');
  ok('update failure содержит точный module/phase/error', failure && failure.module === 'appointments' && failure.phase === 'update' &&
    failure.error.name === 'Error' && failure.error.message === 'network', failure);
  ok('и не ready одновременно', !result.ready.some((r) => r.scope === '/appointments/'));
}

console.log('\ncheckAll(): foreign scope того же origin полностью игнорируется');
{
  const ctx = makeCtx();
  const regHub = makeRegistration('/', 'no-update');
  const regForeign = makeRegistration('/Weather-App-Claude/', 'update-rejects');
  let foreignChecks = 0;
  const foreignUpdate = regForeign.update;
  regForeign.update = () => { foreignChecks++; return foreignUpdate(); };
  ctx.navigator.serviceWorker.getRegistrations = () => Promise.resolve([regHub, regForeign]);
  const result = await ctx.CWUpdate.checkAll();
  ok('foreign worker не получает update()', foreignChecks === 0, foreignChecks);
  ok('foreign scope не попадает в ready/failed',
    !result.ready.some((r) => r.scope === regForeign.scope) &&
    !result.failed.some((r) => r.scope === regForeign.scope), result);
}

console.log('\nHub UI: partial failure использует только friendly module name');
ok('failure label берётся из module/CW_MODULES, без raw scope fallback',
  /function updateModuleTitle\(item\)[\s\S]*item\.module \|\| moduleIdForScope\(item\.scope\)[\s\S]*return id && self\.CW_MODULES\[id\] \? self\.CW_MODULES\[id\]\.title : 'Circuit Workspace'/.test(HUB));
ok('все partial failure строки строятся одним safe helper',
  /lines = lines\.concat\(failedUpdateLines\(failed, 'не удалось проверить'\)\)/.test(HUB) &&
  /var failedLines = failedUpdateLines\(failed, 'не обновлён'\)/.test(HUB));

console.log('\nHub UI: post-update баннер скрывает technical release entries');
ok('после reload pending.changes фильтруется по !technical до map()',
  /\(pending\.changes \|\| \[\]\)\.filter\(function \(c\) \{\s*return c && !c\.technical;\s*\}\)\.map\(function \(c\)/.test(HUB));

console.log('\napplyAll(): SKIP_WAITING чужому scope + подтверждение активации');
{
  const ctx = makeCtx();
  const reg = makeRegistration('/pioneer-school/', 'immediate-waiting');
  await reg.update();   // тот же путь, что и в checkAll — воркер уже waiting
  let skipSent = false;
  const versionResponder = reg.waiting.postMessage.bind(reg.waiting);
  reg.waiting.postMessage = (msg, ports) => {
    if (msg && msg.type === 'CW_VERSION') { versionResponder(msg, ports); return; }
    if (msg && msg.type === 'SKIP_WAITING') {
      skipSent = true;
      // Активация — асинхронная, как и в браузере: waiting исчезает не
      // мгновенно после postMessage, а спустя реальное время.
      setTimeout(() => { reg.active = reg.waiting; reg.waiting = null; }, 20);
    }
  };
  const { results, allActivated } = await ctx.CWUpdate.applyAll([{ scope: reg.scope, reg }]);
  ok('SKIP_WAITING реально отправлен чужому (не-хабовому) scope', skipSent);
  ok('активация подтверждена по исчезновению reg.waiting (не по таймауту)',
    results[0].status === 'activated', results[0]);
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

console.log('\napplyAll(): foreign scope не получает SKIP_WAITING даже во входном списке');
{
  const ctx = makeCtx();
  const reg = makeRegistration('/Language-Teacher/', 'immediate-waiting');
  await reg.update();
  let skipSent = false;
  reg.waiting.postMessage = (msg) => { if (msg && msg.type === 'SKIP_WAITING') skipSent = true; };
  const { results, allActivated } = await ctx.CWUpdate.applyAll([{ scope: reg.scope, reg }]);
  ok('foreign worker не получает SKIP_WAITING', skipSent === false);
  ok('foreign scope отсутствует в apply result', results.length === 0 && allActivated === true, results);
}

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\ncheckAll()/applyAll(): гонки install/waiting/activate из собственных комментариев файла — под регрессом.');
process.exit(failed ? 1 : 0);
