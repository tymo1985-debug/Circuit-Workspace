#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-documents.mjs
 *
 * Живой прогон J9b (Chromium, чистый origin, 430×900): письмо проекта Журнала
 * → превью, одноразовая правка, сохранение, печать, история → «Документы»
 * (глубокие ссылки, фильтр Журнала, правка шаблона) → обратно в Журнал →
 * граница J8 → копия → офлайн.
 *
 *   node scripts/live-journal-documents.mjs   (playwright-core; из корня репозитория)
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const CHROME = process.env.CHROME_PATH || (() => {
  try {
    const dir = fs.readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d));
    if (dir) return path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
  } catch (e) { /* нет сборки Playwright */ }
  return undefined;
})();

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'ru-RU' });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const errors = [];
let dialogs = 0;
let acceptDialogs = true;
const watch = (page, name) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
  page.on('dialog', (d) => { dialogs++; if (acceptDialogs) d.accept(); else d.dismiss(); });
};
const J_URL = BASE + '/journal/index.html';
const D_URL = BASE + '/documents/index.html';
const pj = await ctx.newPage(); watch(pj, 'journal');
const settle = (p, ms = 400) => p.waitForTimeout(ms);
const docCount = (pid) => pj.evaluate((id) => CWDB.documents.getAll().then((r) => r.filter((d) => d.entityKey === 'journal:project:' + id).length), pid);
/* Окно печати: headless не показывает диалог, но окно открывается по-настоящему. */
ctx.on('page', (p) => { p.on('pageerror', (e) => errors.push('print: ' + String(e))); });

/* ═══ 1. Проект и письмо ═══════════════════════════════════════════════ */
console.log('\n1. Письмо проекта');
await pj.goto(J_URL + '#overview', { waitUntil: 'load' });
await pj.waitForFunction(() => !!self.CWJournal && !!self.CWDocs && !!self.CWTemplates);
await pj.evaluate(() => navigator.serviceWorker.ready);
const ids = await pj.evaluate(async () => {
  const J = CWJournal;
  const c = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-LIVE' });
  const p = await J.projects.add({ circuitId: c, title: 'Живой проект', body: 'Описание проекта\nвторая строка' });
  const p2 = await J.projects.add({ circuitId: c, title: 'Секретный проект', body: 'Секретное описание' });
  await CWDocs.save({ templateId: 'sys.school.student.invitation', context: 'school.student.invitation', title: 'x', lang: 'ru', format: 'text', body: 'Чужое письмо Школы', ref: { module: 'pioneer-school', entity: 'student', id: 's1' }, reason: 'print' });
  return { c, p, p2 };
});
const projUrl = J_URL + `#districts/${ids.c}/project/${ids.p}`;
await pj.goto(projUrl, { waitUntil: 'load' });
await pj.waitForSelector('#projectLetterBtn:not([disabled])');
ok('кнопка «Создать письмо» активна', /Создать письмо/.test(await pj.innerText('#projectLetterBtn')));
ok('история пуста', /нет|пуст/i.test(await pj.innerText('#projectDocs')));
ok('ссылка на архив проекта', (await pj.getAttribute('#projectArchiveLink', 'href')) === '../documents/index.html#archive/journal/project/' + encodeURIComponent(ids.p));
await pj.click('#projectLetterBtn');
await pj.waitForFunction(() => document.getElementById('letterBody').value.length > 0);
ok('превью: тема и текст подставлены', (await pj.inputValue('#letterSubject')) === 'Живой проект' && (await pj.inputValue('#letterBody')) === 'Описание проекта\nвторая строка');
ok('открытие композера снимка не создаёт', (await docCount(ids.p)) === 0);
await pj.click('#letterCopyBody'); await settle(pj);
ok('копирование: текст в буфере, снимка нет', (await pj.evaluate(() => navigator.clipboard.readText())) === 'Описание проекта\nвторая строка' && (await docCount(ids.p)) === 0);
await pj.selectOption('#letterLang', 'de'); await settle(pj);
ok('смена языка снимка не создаёт', (await docCount(ids.p)) === 0);
await pj.fill('#letterBody', 'Описание проекта\nвторая строка\nРазовая правка');
await pj.click('#letterSave'); await settle(pj);
ok('ручное сохранение: снимок с правкой', (await docCount(ids.p)) === 1 && await pj.evaluate((id) => CWDB.documents.getAll().then((r) => r.some((d) => d.entityKey === 'journal:project:' + id && /Разовая правка/.test(d.body) && d.edited === true && d.reason === 'manual')), ids.p));
ok('шаблон не изменён правкой', await pj.evaluate(() => CWDB.templates.getAll().then((r) => r.length === 0)));
const popup = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
await pj.click('#letterPrint');
const win = await popup;
await settle(pj, 700);
ok('печать: окно документа открыто', !!win && /Разовая правка/.test(await win.evaluate(() => document.body.innerText).catch(() => '')));
if (win) await win.close().catch(() => {});
/* Окно печати модально для той же вкладки: запись снимка завершается после его закрытия. */
const printed = await pj.waitForFunction((id) => CWDB.documents.getAll().then((r) => r.some((d) => d.entityKey === 'journal:project:' + id && (d.reasons || [d.reason]).includes('print'))), ids.p, { timeout: 10000 }).then(() => true, () => false);
ok('печать: снимок с причиной print', printed);
ok('journalLinks для документов нет', await pj.evaluate(() => CWDB.journalLinks.getAll().then((r) => r.length === 0)));
await pj.click('#letterClose'); await settle(pj);
ok('история показывает снимок', (await pj.locator('#projectDocs .cwdoc').count()) >= 1);

/* ═══ 2. Повторное открытие — один обработчик ═════════════════════════ */
console.log('\n2. Повторное открытие проекта');
for (let i = 0; i < 3; i++) {
  await pj.evaluate((h) => { location.hash = h; }, `#districts/${ids.c}`); await settle(pj, 250);
  await pj.evaluate((h) => { location.hash = h; }, `#districts/${ids.c}/project/${ids.p}`); await settle(pj, 350);
}
await pj.waitForSelector('#projectDocs [data-cwdoc-remove]');
dialogs = 0; acceptDialogs = false;
await pj.click('#projectDocs [data-cwdoc-remove] >> nth=0'); await settle(pj);
acceptDialogs = true;
ok('после 3 повторных входов — одно подтверждение удаления', dialogs === 1, dialogs);
ok('отказ в подтверждении — снимок цел', (await docCount(ids.p)) >= 1);

/* ═══ 3. «Документы»: ссылки, фильтры, правка шаблона ═════════════════ */
console.log('\n3. «Документы»');
const pd = await ctx.newPage(); watch(pd, 'documents');
await pd.goto(D_URL + '#template/sys.journal.project.letter', { waitUntil: 'load' });
await pd.waitForFunction(() => !document.getElementById('screenEditor').hidden, null, { timeout: 10000 });
ok('глубокая ссылка: редактор шаблона Журнала', /проекту района/i.test(await pd.innerText('#edTitle')));
await pd.evaluate(() => navigator.serviceWorker.ready);
await pd.evaluate(async () => { await CWTemplates.save('sys.journal.project.letter', 'ru', { subject: 'Тема: {{project.title}}', body: 'Дорогие братья!\n{{project.body}}' }); });
await pd.goto('about:blank');
await pd.goto(D_URL + '#archive/journal/project/' + encodeURIComponent(ids.p), { waitUntil: 'load' });
await pd.waitForFunction(() => !document.getElementById('screenArchive').hidden && document.querySelectorAll('#archiveList .cwdoc').length > 0, null, { timeout: 10000 });
const cards = () => pd.evaluate(() => [...document.querySelectorAll('#archiveList .arc-group')].map((g) => g.querySelector('.arc-group__title').textContent + ':' + g.querySelectorAll('.cwdoc').length));
const onlyOne = await cards();
ok('глубокая ссылка: архив только этого проекта', onlyOne.length === 1 && onlyOne[0].startsWith('Живой проект'), JSON.stringify(onlyOne));
await pd.click('#archiveFilters [data-afilter="all"]'); await settle(pd);
const allGroups = await cards();
ok('снятие отбора: видны и чужие письма', allGroups.length === 2, JSON.stringify(allGroups));
await pd.click('#archiveFilters [data-afilter="journal"]'); await settle(pd);
const jGroups = await cards();
ok('фильтр архива «Журнал»', jGroups.length === 1 && jGroups[0].startsWith('Живой проект'), JSON.stringify(jGroups));
await pd.goto('about:blank');
await pd.goto(D_URL, { waitUntil: 'load' });
await pd.waitForSelector('#filters [data-filter="journal"]');
await pd.click('#filters [data-filter="journal"]'); await settle(pd);
ok('фильтр библиотеки «Журнал»: один шаблон', (await pd.locator('#list .doc-row').count()) === 1 && /проекту района/i.test(await pd.innerText('#list')));
for (const bad of ['#template/nope.tpl', '#template/%3Cimg%20src%3Dx%3E', '#archive/../x', '#garbage']) {
  await pd.goto('about:blank');
  await pd.goto(D_URL + bad, { waitUntil: 'load' });
  await pd.waitForSelector('#filters [data-filter]');
  await settle(pd, 250);
  ok('кривая ссылка → обычное открытие: ' + bad, await pd.evaluate(() => document.getElementById('screenEditor').hidden && !document.querySelector('img[src="x"]')));
}
/* Журнал НЕ перезагружается: его кэш шаблонов прочитан до правки в «Документах». */
ok('Журнал открыт без перезагрузки на экране проекта', pj.url() === projUrl && await pj.evaluate(() => !!self.CWJournal));
await pj.click('#projectLetterBtn');
await pj.waitForFunction(() => document.getElementById('letterBody').value.length > 0);
ok('язык письма запомнен (CWDocLang: de)', (await pj.inputValue('#letterLang')) === 'de');
await pj.selectOption('#letterLang', 'ru'); await settle(pj);
ok('правка шаблона в другой вкладке → новый текст без перезагрузки Журнала', (await pj.inputValue('#letterSubject')) === 'Тема: Живой проект' && /^Дорогие братья!/.test(await pj.inputValue('#letterBody')));
await pj.click('#letterClose'); await settle(pj);
await pd.goto('about:blank');
await pd.goto(D_URL, { waitUntil: 'load' });
await pd.waitForFunction(() => !!self.CWTemplates && self.CWTemplates.stored);
await pd.evaluate(async () => { await CWTemplates.save('sys.journal.project.letter', 'ru', { subject: 'Вторая правка: {{project.title}}', body: 'Второй текст\n{{project.body}}' }); });
await pj.click('#projectLetterBtn');
await pj.waitForFunction(() => /Второй текст/.test(document.getElementById('letterBody').value), null, { timeout: 5000 }).catch(() => {});
ok('вторая правка — снова видна при следующем открытии композера', (await pj.inputValue('#letterSubject')) === 'Вторая правка: Живой проект');
/* Отказ архива: «сохранено» не показывается; печать — своя строка. */
await pj.evaluate(() => { self.__byIndex = CWDB.documents.byIndex; CWDB.documents.byIndex = () => Promise.reject(new Error('idb-read-failed')); });
await pj.click('#letterSave'); await settle(pj, 500);
const saveUi = await pj.evaluate(() => ({ err: document.getElementById('letterError').hidden ? '' : document.getElementById('letterError').textContent, st: document.getElementById('letterStatus').textContent }));
ok('сбой архива: ошибка, без «Сохранено»', /не удалось/i.test(saveUi.err) && !/Сохранено/.test(saveUi.st), JSON.stringify(saveUi));
const popup2 = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
await pj.click('#letterPrint');
const win2 = await popup2;
if (win2) await win2.close().catch(() => {});
await pj.waitForFunction(() => /не сохранено/.test(document.getElementById('letterStatus').textContent), null, { timeout: 5000 }).catch(() => {});
const printUi = await pj.evaluate(() => document.getElementById('letterStatus').textContent);
ok('сбой архива при печати: «напечатано, в архив не сохранено»', /на печать/.test(printUi) && /не сохранено/.test(printUi), printUi);
await pj.evaluate(() => { CWDB.documents.byIndex = self.__byIndex; });
await pj.evaluate(async () => { await CWTemplates.save('sys.journal.project.letter', 'ru', { subject: 'Тема: {{project.title}}', body: 'Дорогие братья!\n{{project.body}}' }); });
await pj.click('#letterClose'); await settle(pj);

/* ═══ 4. J8 ═════════════════════════════════════════════════════════════ */
console.log('\n4. Граница J8');
const p2Url = J_URL + `#districts/${ids.c}/project/${ids.p2}`;
const r1 = await pj.evaluate(async (p2) => { await CWJournal.protection.setup('живая фраза J9b 2026', p2); return !!(await CWDB.journalEntries.get(p2)).sec; }, ids.p2);
ok('проект без писем защищается', r1);
await pj.goto('about:blank');
await pj.goto(p2Url, { waitUntil: 'load' });
await pj.waitForSelector('#projectLetterBtn');
await settle(pj, 600);
ok('защищённый: «Создать письмо» недоступно, пояснение', await pj.evaluate(() => document.getElementById('projectLetterBtn').disabled && !document.getElementById('projectDocsNote').hidden));
await pj.evaluate(() => CWJournal.protection.unlock('живая фраза J9b 2026'));
await settle(pj, 600);
ok('разблокировано: кнопка по-прежнему недоступна', await pj.evaluate(() => document.getElementById('projectLetterBtn').disabled));
ok('разблокировано: compose/save — отказ', await pj.evaluate(async (p2) => {
  const a = await CWJournal.documents.compose(p2, 'ru').then(() => null, (e) => e.message);
  const b = await CWJournal.documents.save(p2, { projectId: p2, subject: 'x', body: 'x' }, 'manual').then(() => null, (e) => e.message);
  return a === 'journal-docs-protected' && b === 'journal-docs-protected';
}, ids.p2));
ok('проект с письмами не защищается', (await pj.evaluate((p) => CWJournal.protection.protect(p).then(() => null, (e) => e.message), ids.p)) === 'journal-protect-has-documents');
await pj.goto('about:blank');
await pj.goto(projUrl, { waitUntil: 'load' });
await pj.waitForSelector('#projectDocs [data-cwdoc-remove]');
while (await pj.locator('#projectDocs [data-cwdoc-remove]').count()) {
  await pj.click('#projectDocs [data-cwdoc-remove] >> nth=0'); await settle(pj, 500);
}
ok('письма удалены из истории', (await docCount(ids.p)) === 0);
await pj.evaluate(() => CWJournal.protection.unlock('живая фраза J9b 2026'));
ok('после удаления писем защита проходит', (await pj.evaluate((p) => CWJournal.protection.protect(p).then(() => null, (e) => e.message), ids.p)) === null);
await pj.evaluate((p) => CWJournal.protection.unprotect(p), ids.p);
ok('канарейки защищённого нет в documents/templates', await pj.evaluate(() => Promise.all([CWDB.documents.getAll(), CWDB.templates.getAll()]).then(([d, t]) => !/Секретн/.test(JSON.stringify(d) + JSON.stringify(t)))));

/* ═══ 4b. Две вкладки: сохранение ∥ защита ═══════════════════════════ */
console.log('\n4b. Две вкладки: письмо ∥ защита');
const pj2 = await ctx.newPage(); watch(pj2, 'journal-2');
await pj2.goto(J_URL + '#overview', { waitUntil: 'load' });
await pj2.waitForFunction(() => !!self.CWJournal && !!self.CWDocs);
await pj.evaluate(() => CWJournal.protection.isUnlocked() || CWJournal.protection.unlock('живая фраза J9b 2026'));
await pj2.evaluate(() => CWJournal.protection.unlock('живая фраза J9b 2026'));
const seen = { open_doc: 0, protected_nodoc: 0 };
let liveInv = true, liveInfo = '';
for (let i = 0; i < 16; i++) {
  const pc = await pj.evaluate(async ([c, i]) => CWJournal.projects.add({ circuitId: c, title: 'Две вкладки ' + i, body: 'тело' }), [ids.c, i]);
  const saveP = pj.evaluate(async ([p, lag]) => {
    const d = await CWJournal.documents.compose(p, 'ru');
    await new Promise((r) => setTimeout(r, lag));
    return CWJournal.documents.save(p, Object.assign({}, d, { title: 't' }), 'manual').then(() => 'ok', (e) => e.message);
  }, [pc, (i * 5) % 17]);
  const protP = pj2.evaluate((p) => CWJournal.protection.protect(p).then(() => 'ok', (e) => e.message), pc);
  const [a, b] = await Promise.all([saveP, protP]);
  const st = await pj.evaluate(async (p) => ({ sec: !!(await CWDB.journalEntries.get(p)).sec, n: (await CWDocs.listStrict(CWJournal.documents.ref(p))).length }), pc);
  if (st.sec && st.n) { liveInv = false; liveInfo = i + ' ' + a + ' ' + b; break; }
  if (!st.sec && st.n) seen.open_doc++; else if (st.sec && !st.n) seen.protected_nodoc++; else { liveInv = false; liveInfo = 'ни один: ' + a + ' ' + b; break; }
}
ok('две вкладки ×16: никогда «защищён + снимок»', liveInv, liveInfo);
ok('…каждый прогон — законный исход ' + JSON.stringify(seen), seen.open_doc + seen.protected_nodoc === 16);
await pj2.close();

/* ═══ 5. Копия ══════════════════════════════════════════════════════════ */
console.log('\n5. Резервная копия');
const bk = await pj.evaluate(async (p) => {
  const doc = await CWJournal.documents.compose(p, 'ru');
  await CWJournal.documents.save(p, Object.assign({}, doc, { title: 'Письмо по проекту' }), 'manual');
  const snap = await CWBackup.snapshot(['journal']);
  const foreign = await CWDocs.save({ templateId: 'sys.congress.assignment.invitation', context: 'congress.assignment.invitation', title: 'y', lang: 'ru', format: 'text', body: 'Чужое письмо Конгрессов', ref: { module: 'congress-project', entity: 'assignment', id: 'a1' }, reason: 'print' });
  for (const r of await CWDocs.list(CWJournal.documents.ref(p))) await CWDocs.remove(r.id);
  await CWTemplates.reset('sys.journal.project.letter');
  await CWBackup.restore(snap);
  const all = await CWDB.documents.getAll();
  const tpls = await CWDB.templates.getAll();
  return {
    inspect: CWBackup.inspect(snap).ok,
    own: all.some((d) => d.entityKey === 'journal:project:' + p),
    foreign: all.some((d) => d.id === foreign.id),
    school: all.some((d) => d.body === 'Чужое письмо Школы'),
    tpl: tpls.some((r) => r.id === 'sys.journal.project.letter'),
    full: CWBackup.inspect(await CWBackup.snapshot()).ok,
  };
}, ids.p);
ok('копия Журнала: проверка', bk.inspect && bk.full);
ok('восстановлено: письмо проекта и правка шаблона', bk.own && bk.tpl);
ok('чужие письма (Конгрессы, Школа) не стёрты', bk.foreign && bk.school);

/* ═══ 5b. Архивный проект ═════════════════════════════════════════════ */
console.log('\n5b. Архивный проект');
await pj.evaluate((p) => CWJournal.projects.archive(p), ids.p);
await pj.goto('about:blank');
await pj.goto(projUrl, { waitUntil: 'load' });
await pj.waitForSelector('#projectDocs .cwdoc');
ok('архивный: «Создать письмо» скрыта, история видна', await pj.evaluate(() => document.getElementById('projectLetterBtn').hidden && document.querySelectorAll('#projectDocs .cwdoc').length > 0));
ok('архивный: compose — только чтение', (await pj.evaluate((p) => CWJournal.documents.compose(p, 'ru').then(() => null, (e) => e.message), ids.p)) === 'journal-project-readonly');
await pj.evaluate((p) => CWJournal.projects.unarchive(p), ids.p);

/* ═══ 6. Перезагрузка, офлайн, раскладка ════════════════════════════════ */
console.log('\n6. Офлайн и раскладка');
await pj.goto('about:blank');
await pj.goto(projUrl, { waitUntil: 'load' });
await pj.waitForSelector('#projectDocs .cwdoc');
ok('после перезагрузки история на месте', (await pj.locator('#projectDocs .cwdoc').count()) >= 1);
ok('ширина 430: без горизонтальной прокрутки', await pj.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await pj.click('#projectLetterBtn');
await pj.waitForFunction(() => document.getElementById('letterBody').value.length > 0);
ok('композер влезает в 430', await pj.evaluate(() => document.getElementById('letterDialog').getBoundingClientRect().width <= window.innerWidth));
await pj.screenshot({ path: '/tmp/j9b-composer-430.png' });
await pj.click('#letterClose');
await ctx.setOffline(true);
await pj.reload({ waitUntil: 'load' });
await pj.waitForSelector('#projectLetterBtn:not([disabled])', { timeout: 10000 });
await pj.waitForSelector('#projectDocs .cwdoc', { timeout: 10000 }).catch(() => {});
ok('офлайн: Журнал, история и письмо', (await pj.locator('#projectDocs .cwdoc').count()) >= 1);
await pd.goto('about:blank');
await pd.goto(D_URL + '#archive/journal/project/' + encodeURIComponent(ids.p), { waitUntil: 'load' });
await pd.waitForFunction(() => !document.getElementById('screenArchive').hidden, null, { timeout: 10000 });
ok('офлайн: «Документы» и архив проекта', /Живой проект/.test(await pd.innerText('#archiveList')));
await ctx.setOffline(false);

/* Сбой архива смоделирован намеренно (шаг 3) — его журнальная строка ожидаема. */
const noise = errors.filter((e) => !/favicon|net::ERR_INTERNET_DISCONNECTED|Failed to load resource|CWDocs: не удалось записать снимок документа/.test(e));
ok('ошибок консоли/страницы нет', noise.length === 0, noise.join(' | '));

await browser.close();
server.close();
console.log(failed ? `\n✗ live-journal-documents: ${failed} провал(ов)` : '\n✓ live-journal-documents: всё прошло');
process.exit(failed ? 1 : 0);
