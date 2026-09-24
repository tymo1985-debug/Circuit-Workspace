#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-app-split.mjs
 *
 * Разрезка экранов Журнала (0.9.1): js/app.js стал оркестровкой, экраны —
 * классические сценарии js/app/*.js с общим объектом self.CWJournalApp.
 * Проверка стережёт форму, которая молча ломается:
 *  - app.js и каждый файл экранов — ниже порога крупного файла и не в
 *    KNOWN_LARGE (исключение бюджета снято, новых не заведено);
 *  - index.html подключает каждый файл ровно один раз и в нужном порядке,
 *    sw.js кладёт каждый в прекэш;
 *  - верхнеуровневое имя объявлено ровно в одном файле; каждый
 *    переходник позднего связывания указывает на имя, которое файл-владелец
 *    действительно публикует, и публикуется оно один раз;
 *  - чужие изменяемые переменные не импортируются (состояние экрана — в
 *    его файле);
 *  - экраны без CWDB и localStorage/sessionStorage; маршрутизатор — только
 *    route.js; запуск (DOMContentLoaded, hashchange) — один раз, в app.js.
 *
 *   node scripts/check-journal-app-split.mjs   (acorn)
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as acorn from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const SCREENS = ['core', 'districts', 'visits', 'tasks', 'projects', 'documents', 'search-archive', 'protection'];
const FILES = SCREENS.map((n) => 'journal/js/app/' + n + '.js').concat(['journal/js/app.js']);
const LIMIT = 150 * 1024; // порог JS_WARN check-context-budget.mjs (символы)
const STUB = /^function ([\w$]+)\(\) \{ return A\.([\w$]+)\.apply\(this, arguments\); \}$/;

console.log('\n1. Файлы и бюджет контекста');
for (const f of FILES) ok('есть ' + f, existsSync(join(ROOT, f)));
const budget = read('scripts/check-context-budget.mjs');
const known = (budget.match(/const KNOWN_LARGE = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '';
for (const f of FILES) {
  const n = read(f).length;
  ok(`${f}: ${(n / 1024).toFixed(1)}K символов < 150K`, n < LIMIT, n);
}
ok('ни один файл экранов Журнала не в KNOWN_LARGE', !/journal\/js\//.test(strip(known)));
ok('js/app.js — компактная оркестровка (< 30K)', read('journal/js/app.js').length < 30 * 1024);

console.log('\n2. Подключение и прекэш');
const html = read('journal/index.html').replace(/<!--[\s\S]*?-->/g, '');
const srcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
const rel = (f) => f.replace('journal/', '');
for (const f of FILES) ok('index.html: ' + rel(f) + ' ровно один раз', srcs.filter((s) => s === rel(f)).length === 1);
const pos = (s) => srcs.indexOf(s);
const chain = ['js/data.js', 'js/route.js'].concat(FILES.map(rel));
ok('порядок: data → route → core → экраны → app.js', chain.every((s, i) => i === 0 || pos(chain[i - 1]) < pos(s)), chain.map(pos).join(','));
ok('ни один файл не подключён как модуль/defer/async', !FILES.some((f) => new RegExp('<script[^>]*src="' + rel(f) + '"[^>]*(type="module"|defer|async)').test(html)));
const sw = read('journal/sw.js');
for (const f of FILES) ok('sw.js прекэширует ' + rel(f), sw.includes("'./" + rel(f) + "'"));

console.log('\n3. Имена: объявлены один раз, переходники ведут к опубликованному');
const declared = {}, published = {}, stubs = [], imports = [], mutable = {};
for (const f of FILES) {
  const src = read(f);
  const ast = acorn.parse(src, { ecmaVersion: 2022 });
  const iifes = ast.body.filter((s) => s.expression && s.expression.type === 'CallExpression' && s.expression.callee.type === 'FunctionExpression');
  ok(f + ': один IIFE', iifes.length === 1);
  const body = iifes[0].expression.callee.body.body;
  for (const s of body) {
    const txt = src.slice(s.start, s.end);
    if (s.type === 'FunctionDeclaration') {
      const m = STUB.exec(txt);
      if (m) { stubs.push({ f, name: m[1], target: m[2] }); continue; }
      (declared[s.id.name] = declared[s.id.name] || []).push(f);
    } else if (s.type === 'VariableDeclaration') {
      for (const d of s.declarations) {
        if (d.id.name === 'A') continue;
        if (d.init && d.init.type === 'MemberExpression' && d.init.object.name === 'A') { imports.push({ f, name: d.id.name, target: d.init.property.name }); continue; }
        (declared[d.id.name] = declared[d.id.name] || []).push(f);
        if (/^[a-z]/.test(d.id.name)) mutable[d.id.name] = f;
      }
    } else if (s.type === 'ExpressionStatement') {
      const m = /^A\.([\w$]+) = ([\w$]+);$/.exec(txt);
      if (m) (published[m[1]] = published[m[1]] || []).push({ f, local: m[2] });
    }
  }
}
const dups = Object.keys(declared).filter((n) => declared[n].length > 1);
ok('каждое верхнеуровневое имя объявлено в одном файле', dups.length === 0, dups.join(' '));
const badPub = Object.keys(published).filter((n) => published[n].length !== 1 || published[n][0].local !== n || !(declared[n] || []).includes(published[n][0].f));
ok('A.x публикуется один раз, своим файлом, под своим именем', badPub.length === 0, badPub.join(' '));
const badStub = stubs.filter((s) => s.name !== s.target || !published[s.target] || published[s.target][0].f === s.f);
ok('переходники: имя = цель, цель опубликована другим файлом', badStub.length === 0, badStub.map((s) => s.f + ':' + s.name).join(' '));
const shadow = stubs.filter((s) => (declared[s.name] || []).includes(s.f));
ok('переходник не дублирует собственную реализацию файла', shadow.length === 0, shadow.map((s) => s.name).join(' '));
const badImp = imports.filter((i) => i.name !== i.target || !published[i.target] || mutable[i.target]
  || FILES.indexOf(published[i.target][0].f) >= FILES.indexOf(i.f));
ok('импорт по значению — только констант, загруженных раньше', badImp.length === 0, badImp.map((i) => i.f + ':' + i.name).join(' '));
ok('состояние экрана — в файле экрана', ['editor', 'carryView'].every((n) => mutable[n] === 'journal/js/app/visits.js')
  && mutable.taskTab === 'journal/js/app/tasks.js' && mutable.projectUi === 'journal/js/app/projects.js'
  && mutable.searchUi === 'journal/js/app/search-archive.js' && mutable.archiveTab === 'journal/js/app/search-archive.js'
  && mutable.directoryReady === 'journal/js/app/core.js');
ok('экраны на своих местах', declared.renderDistrictDetail?.[0] === 'journal/js/app/districts.js' && declared.renderVisitDetail?.[0] === 'journal/js/app/visits.js'
  && declared.renderTasks?.[0] === 'journal/js/app/tasks.js' && declared.renderProjectDetail?.[0] === 'journal/js/app/projects.js'
  && declared.renderSearch?.[0] === 'journal/js/app/search-archive.js' && declared.renderArchive?.[0] === 'journal/js/app/search-archive.js'
  && declared.applyRoute?.[0] === 'journal/js/app.js');
const appOwn = Object.keys(declared).filter((n) => declared[n][0] === 'journal/js/app.js');
ok('в app.js только оркестровка', appOwn.every((n) => ['fabSpecFor', 'applyRoute', 'initVersion', 'initLanguage'].includes(n)), appOwn.join(' '));
ok('CWJournalApp создаётся один раз — в core.js', FILES.filter((f) => /self\.CWJournalApp\s*=/.test(strip(read(f)))).join() === 'journal/js/app/core.js');

console.log('\n4. Границы');
for (const f of FILES) {
  const code = strip(read(f));
  ok(f + ': без CWDB', !/\bCWDB\b/.test(code));
  ok(f + ': без localStorage/sessionStorage', !/localStorage|sessionStorage/.test(code));
  ok(f + ': не разбирает хэш сам (только CWJournalRoute)', !/location\.hash\.(split|slice|substr|match|replace)\(|hash\.split\(/.test(code));
}
const all = FILES.map((f) => strip(read(f))).join('\n');
ok('DOMContentLoaded — ровно один раз (app.js)', (all.match(/DOMContentLoaded/g) || []).length === 1 && /DOMContentLoaded/.test(strip(read('journal/js/app.js'))));
ok('hashchange слушается ровно один раз (app.js)', (all.match(/addEventListener\('hashchange'/g) || []).length === 1 && /addEventListener\('hashchange'/.test(strip(read('journal/js/app.js'))));
ok('CWUpdate.init — один раз', (all.match(/CWUpdate\.init\(/g) || []).length === 1);
ok('разбор маршрута — один, через CWJournalRoute.parse', (all.match(/CWJournalRoute\.parse\(/g) || []).length === 1);
ok('без ESM/import()', !/^\s*(import|export)\s/m.test(all) && !/\bimport\(/.test(all));

console.log(failed ? `\n✗ Провалов: ${failed}` : '\n✓ Разрезка экранов Журнала — все проверки пройдены');
process.exit(failed ? 1 : 0);
