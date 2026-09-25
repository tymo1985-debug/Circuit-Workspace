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
const SRC = readFileSync(join(ROOT, 'shared/update.js'), 'utf8')
  // Gate проверяет ветвление, а не реальные wall-clock лимиты браузера.
  // Укорачиваем bounded waits только внутри VM, чтобы regression был быстрым.
  .replace('var UPDATE_TIMEOUT_MS = 10000;', 'var UPDATE_TIMEOUT_MS = 80;')
  .replace('var ACTIVATE_TIMEOUT_MS = 6000;', 'var ACTIVATE_TIMEOUT_MS = 500;')
  .replace('var VERIFY_TIMEOUT_MS = 10000;', 'var VERIFY_TIMEOUT_MS = 240;')
  .replace('var VERIFY_POLL_MS = 250;', 'var VERIFY_POLL_MS = 10;');
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
  reg.active = new FakeWorker({ module: id, version: versions[id], ...(id === 'hub' ? {} : { hub: '0.41.58' }) });

  reg.update = () => {
    reg._updateCalled = true;
    if (scenario === 'update-rejects') return Promise.reject(new Error('network'));
    if (scenario === 'no-update') return Promise.resolve();
    if (scenario === 'immediate-waiting') {
      const w = new FakeWorker({ module: id, version: versions[id], ...(id === 'hub' ? {} : { hub: '0.41.58' }) }); w.state = 'installed';
      reg.waiting = w;
      return Promise.resolve();
    }
    if (scenario === 'delayed-installing') {
      // update() САМ резолвится сразу — сеть отработала, — а до installed
      // воркер доходит только через один макротик, ПОЗЖЕ. Ровно тот случай,
      // ради которого checkAll подписывается на updatefound/statechange
      // ДО чтения reg.waiting, а не просто опрашивает его один раз.
      setTimeout(() => {
        const w = new FakeWorker({ module: id, version: versions[id], ...(id === 'hub' ? {} : { hub: '0.41.58' }) });
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
  const storage = new Map();
  const ctx = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval, MessageChannel: FakeMessageChannel, URL,
    document: { baseURI: 'https://example.test/', readyState: 'complete', addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }; }, head: { appendChild() {} }, body: { appendChild() {} } },
    navigator: { serviceWorker: Object.assign(new FakeTarget(), { controller: null, register: () => Promise.resolve(null), getRegistrations: () => Promise.resolve([]) }) },
    location: { href: 'https://example.test/', reload() {} },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
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

console.log('\napplyAll(): target берётся из waiting worker, а не из старой страницы');
{
  const ctx = makeCtx();
  const reg = makeRegistration('/pioneer-school/', 'immediate-waiting');
  await reg.update();
  const target = { module: 'pioneer-school', version: '1.14.57', hub: '0.41.59' };
  ctx.sessionStorage.setItem('cwPendingRelease', JSON.stringify({
    version: '0.41.59',
    changes: [{ module: 'pioneer-school', version: '1.14.57', technical: true }],
    failed: [],
  }));
  reg.waiting.info = target;
  const waiting = reg.waiting;
  reg.waiting.postMessage = (msg, ports) => {
    if (msg && msg.type === 'CW_VERSION' && ports && ports[0]) {
      ports[0].postMessage(target);
      return;
    }
    if (msg && msg.type === 'SKIP_WAITING') {
      // waiting исчезает раньше, чем registration.active переключается —
      // именно production-race, который раньше давал versionMismatch.
      reg.waiting = null;
      setTimeout(() => { reg.active = waiting; }, 40);
    }
  };
  const { results, allActivated } = await ctx.CWUpdate.applyAll([{ scope: reg.scope, reg, info: target }]);
  ok('новая версия waiting worker принимается, хотя CW_MODULES старой страницы ещё прежний',
    results[0].status === 'activated' && results[0].info.version === '1.14.57', results[0]);
  ok('delayed active swap не превращается в ложный versionMismatch', allActivated === true, results);
  const persisted = JSON.parse(ctx.sessionStorage.getItem('cwPendingRelease'));
  const persistedSchool = persisted.expected.find((item) => item.target.module === 'pioneer-school');
  const persistedHub = persisted.expected.find((item) => item.target.module === 'hub');
  ok('до SKIP_WAITING marker дополнен точным scope/version/hub target waiting worker',
    persistedSchool && persistedSchool.target.version === '1.14.57' && persistedSchool.target.hub === '0.41.59', persistedSchool);
  ok('marker хранит ожидаемое Hub-поколение для post-reload проверки',
    persistedHub && persistedHub.target.version === '0.41.59', persistedHub);
}

console.log('\nverifyCurrent(): проверяет Hub-generation даже при неизменной версии модуля');
{
  const ctx = makeCtx();
  ctx.CW_MODULES = { 'circuit-planner': { version: '9.95.1' } };
  const hub = makeRegistration('/', 'no-update');
  hub.scope = 'https://example.test/';
  hub.active.info = { module: 'hub', version: '0.41.58' };
  const planner = makeRegistration('/circuit-planner/', 'no-update');
  planner.scope = 'https://example.test/circuit-planner/';
  planner.active.info = { module: 'circuit-planner', version: '9.95.1', hub: '0.41.57' };
  ctx.navigator.serviceWorker.getRegistrations = () => Promise.resolve([hub, planner]);
  setTimeout(() => { planner.active.info = { module: 'circuit-planner', version: '9.95.1', hub: '0.41.58' }; }, 40);
  const result = await ctx.CWUpdate.verifyCurrent();
  const plannerResult = result.results.find((r) => r.module === 'circuit-planner');
  ok('та же module-version считается текущей только после перехода на новое Hub-generation',
    plannerResult && plannerResult.status === 'activated' && plannerResult.info.hub === '0.41.58', plannerResult);
  ok('финальная проверка подтверждает весь ожидаемый набор', result.allActivated === true, result);
}

console.log('\npost-update финализация: статус строится по active workers, не по старому marker');
ok('post-update offerHubBanner перехватывает installed/partial и запускает verifyAndShowCurrentRelease()',
  /opts\.applyKey === 'update\.dismiss'[\s\S]*verifyAndShowCurrentRelease\(\)/.test(SRC));
ok('applyAll сравнивает active worker с targetFromReady(item)',
  /var target = targetFromReady\(item\)[\s\S]*waitForExpectedActive\(item\.reg, target/.test(SRC));
ok('verifyCurrent проверяет hub-generation module worker',
  /target\.module !== 'hub' && target\.hub && info\.hub !== target\.hub/.test(SRC));

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

console.log('\nisBusy()/showBar(): гонка МЕЖДУ post-update верификацией и фоновой автопроверкой хаба');
{
  const ctx = makeCtx();
  ctx.CW_RELEASE = { version: '0.41.58', changes: [] };
  ok('isBusy()=false, пока верификация не запущена', ctx.CWUpdate.isBusy() === false);

  // Регистрация без совпадающей версии никогда не резолвится в 'activated' —
  // держит finalVerificationPromise pending достаточно долго, чтобы застать
  // isBusy()=true и попытку showBar() посреди верификации.
  const reg = makeRegistration('/', 'no-update');
  reg.scope = 'https://example.test/';
  reg.active.info = { module: 'hub', version: 'stale' };
  ctx.navigator.serviceWorker.getRegistrations = () => Promise.resolve([reg]);
  ctx.sessionStorage.setItem('cwPendingRelease', JSON.stringify({
    version: '0.41.58',
    changes: [],
    failed: [],
    expected: [{ scope: 'https://example.test/', target: { module: 'hub', version: '0.41.58', hub: null } }],
  }));
  ctx.CWUpdate.notify('update.partial', 'x'); // pending есть → уходит в verifyAndShowCurrentRelease() (fire-and-forget)
  ok('isBusy()=true, пока идёт финальная верификация', ctx.CWUpdate.isBusy() === true);

  // notify() не возвращает промис верификации наружу (намеренно — вызывающий
  // код не должен ждать); дожидаемся реального завершения через таймер,
  // дольше укороченного VERIFY_TIMEOUT_MS этого VM (240 мс).
  await new Promise((r) => setTimeout(r, 400));
  ok('isBusy()=false после завершения (даже с versionMismatch — deadline истёк)', ctx.CWUpdate.isBusy() === false);
}

console.log('\nshowBar(): не рисует ничего после уже запланированного собственного reload');
ok('showBar() ранний return при reloading — до injectStyle()/hideBar()',
  /function showBar\(opts\) \{\s*if \(unsupported\(\)\) return;[\s\S]{0,500}if \(reloading\) return;\s*injectStyle\(\);/.test(SRC));

console.log('\nindex.html: фоновая автопроверка (cw-update-available) пропускается во время check/apply/verify');
ok('applying — отдельный флаг, не совпадающий с checking (закрывает окно между checkAll() и concом apply)',
  /var applying = false;/.test(HUB));
ok('applying=true выставляется в onApply ДО applyAll()',
  /onApply: function \(\) \{\s*CWUpdate\.dismiss\(\);\s*applying = true;/.test(HUB));
ok('applying сбрасывается только в исходе applyAll().then(outcome), не раньше',
  /applying = false;\s*btn\.disabled = false;/.test(HUB));
ok('auto-listener пропускает runCheck(), пока checking || applying || CWUpdate.isBusy()',
  /document\.addEventListener\('cw-update-available', function \(\) \{\s*if \(checking \|\| applying \|\| \(CWUpdate\.isBusy && CWUpdate\.isBusy\(\)\)\) return;\s*runCheck\(\);\s*\}\);/.test(HUB));

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\ncheckAll()/applyAll(): гонки install/waiting/activate из собственных комментариев файла — под регрессом.');
process.exit(failed ? 1 : 0);
