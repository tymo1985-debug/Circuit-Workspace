#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-documents.mjs
 *
 * Фаза J9b: проекты Журнала ↔ «Документы» (CWTemplates + CWDocs + CWDocsView).
 *  - системный шаблон sys.journal.project.letter и пространство project;
 *  - CWJournal.documents: compose/list/save, ref {journal, project, id},
 *    снимок только при печати и ручном сохранении, без journalLinks;
 *  - граница J8: защищённый проект — ни compose, ни save (и после unlock);
 *    проект со снимками не защищается; архив недоступен — отказ; гонки
 *    «защита ∥ снимок» не оставляют открытого текста рядом с защитой;
 *  - «Документы»: фильтры Журнала, глубокие ссылки;
 *  - копия Журнала: templates/documents сливаются, чужое не стирается.
 *
 *   node scripts/check-journal-documents.mjs   (fake-indexeddb)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

globalThis.self = globalThis;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.addEventListener = () => {};
globalThis.CW_VERSION = '0.0.0';
globalThis.CW_MODULES = { journal: { version: '0.0.0' } };

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e && e.message; } };

eval(read('shared/db.js'));
eval(read('shared/escape.js'));
eval(read('shared/templates/namespaces.js'));
eval(read('shared/templates/builtin.js'));
eval(read('shared/templates.js'));
eval(read('shared/doclang.js'));
eval(read('shared/documents.js'));
eval(read('shared/docsview.js'));
eval(read('journal/js/crypto.js'));
eval(read('journal/js/data.js'));
eval(read('shared/backup.js'));
await CWDB.init();
CWDocLang.init({ module: 'journal', langs: ['uk', 'ru', 'de', 'en', 'pl'], apply: false });
await CWTemplates.init();

const J = CWJournal;
const D = J.documents;
const P = J.protection;
const CANARY = 'CANARY-J9B-' + Math.random().toString(16).slice(2) + '-Ѫ';
const hasCanary = (s) => typeof s === 'string' && s.includes(CANARY);
const docsOf = async (id) => (await CWDB.documents.getAll()).filter((d) => d.entityKey === 'journal:project:' + id);

/* ═══ 1. Шаблон и пространство ═════════════════════════════════════════ */
console.log('\n1. Шаблон и пространство переменных');
const tpl = CWTemplates.get('sys.journal.project.letter');
ok('системный шаблон есть', !!tpl && tpl.scope === 'system');
ok('context/module/format', tpl.context === 'journal.project.letter' && tpl.module === 'journal' && tpl.format === 'text');
ok('минимальный: тема {{project.title}}, текст {{project.body}} во всех языках',
  ['uk', 'ru', 'en', 'pl', 'de'].every((l) => tpl.translations[l].subject === '{{project.title}}' && tpl.translations[l].body === '{{project.body}}'));
const toks = CWTemplates.tokens(['project']).map((x) => x.token).sort();
ok('пространство project: title, body', JSON.stringify(toks) === JSON.stringify(['{{project.body}}', '{{project.title}}']));
ok('байндинг по контексту', CWTemplates.byContext('journal.project.letter').id === 'sys.journal.project.letter');

/* ═══ 2. compose / list / save ═════════════════════════════════════════ */
console.log('\n2. Письмо проекта');
const circuit = await J.nodes.add({ kind: 'circuit', parentId: J.ROOT_PARENT, label: 'EU-K-03' });
const pid = await J.projects.add({ circuitId: circuit, title: 'Спецвстреча <b>&</b>', body: 'Строка 1\nСтрока 2' });
const linksBefore = JSON.stringify(await CWDB.journalLinks.getAll());
const doc = await D.compose(pid, 'ru');
ok('compose: подстановка', doc.subject === 'Спецвстреча <b>&</b>' && doc.body === 'Строка 1\nСтрока 2');
ok('compose: служебные поля', doc.templateId === 'sys.journal.project.letter' && doc.context === 'journal.project.letter' && doc.lang === 'ru' && doc.format === 'text');
ok('compose: data только { project: { title, body } }', JSON.stringify(Object.keys(doc.data)) === '["project"]' && JSON.stringify(Object.keys(doc.data.project).sort()) === '["body","title"]');
await D.compose(pid, 'uk'); await D.compose(pid, 'de');
ok('compose/смена языка — снимков нет (превью не пишет)', (await CWDB.documents.getAll()).length === 0);
ok('list пустой', (await D.list(pid)).length === 0);
const docUi = read('journal/js/app/documents.js');
const uiCode = strip(docUi);
ok('экран: save только в runSave', (uiCode.match(/CWJournal\.documents\.save\(/g) || []).length === 1 && /async function runSave\(reason\)/.test(uiCode));
ok('экран: save зовут только «Печать» (после открытия окна) и «Сохранить»', (uiCode.match(/runSave\(/g) || []).length === 3
  && /if \(opened\) runSave\('print'\)/.test(uiCode) && /runSave\('manual'\)/.test(uiCode));
ok('экран: копирование и открытие не пишут', !/copyText[\s\S]{0,200}runSave/.test(uiCode.slice(uiCode.indexOf('function copyText'), uiCode.indexOf('async function runSave'))));
ok('save: причина только print/manual', (await rejects(() => D.save(pid, doc, 'send'))) === 'journal-docs-invalid-reason' && (await rejects(() => D.save(pid, doc, 'preview'))) === 'journal-docs-invalid-reason');
ok('save: чужой doc → отказ', (await rejects(() => D.save(pid, { ...doc, projectId: 'x' }, 'manual'))) === 'journal-docs-invalid');
const edited = { ...doc, body: doc.body + '\nОдноразовая правка', title: 'Письмо по проекту' };
const s1 = await D.save(pid, edited, 'manual', true);
ok('ручное сохранение: снимок', !!s1 && (await docsOf(pid)).length === 1);
const row1 = (await docsOf(pid))[0];
ok('ref {journal, project, id}', JSON.stringify(row1.ref) === JSON.stringify({ module: 'journal', entity: 'project', id: pid }) && row1.module === 'journal' && row1.entityKey === 'journal:project:' + pid,
  JSON.stringify({ ref: row1.ref, m: row1.module, k: row1.entityKey }));
ok('снимок: подставленный текст, правка, пометка edited', row1.body.endsWith('Одноразовая правка') && row1.edited === true && row1.reason === 'manual' && row1.subject === doc.subject);
ok('правка экземпляра не трогает шаблон', CWTemplates.get('sys.journal.project.letter').translations.ru.body === '{{project.body}}' && (await CWDB.templates.getAll()).length === 0);
await D.save(pid, edited, 'print', true);
ok('печать того же текста — та же запись, +причина', (await docsOf(pid)).length === 1 && (await docsOf(pid))[0].count === 2 && (await docsOf(pid))[0].reasons.includes('print'));
await D.save(pid, doc, 'print');
ok('печать другого текста — новая запись', (await docsOf(pid)).length === 2);
ok('list: история проекта', (await D.list(pid)).length === 2 && (await D.list(pid)).some((r) => r.body === doc.body));
ok('journalLinks не созданы', JSON.stringify(await CWDB.journalLinks.getAll()) === linksBefore);

/* Пользовательский шаблон из «Документов» → новый render. */
await CWTemplates.save('sys.journal.project.letter', 'ru', { subject: 'Тема: {{project.title}}', body: 'Уважаемые братья!\n{{project.body}}' });
const d2 = await D.compose(pid, 'ru');
ok('правка шаблона в «Документах» → новый текст', d2.subject === 'Тема: Спецвстреча <b>&</b>' && d2.body.startsWith('Уважаемые братья!') && d2.custom === true);
ok('старые снимки не пересобраны', (await docsOf(pid)).every((r) => !r.body.startsWith('Уважаемые')));
/* Соседняя вкладка («Документы») правит шаблон в базе; эта страница не
   перезагружалась — её кэш устарел, reload() перечитывает базу. */
const stored = await CWDB.templates.get('sys.journal.project.letter');
const other = JSON.parse(JSON.stringify(stored));
other.translations.ru = { subject: 'Из другой вкладки: {{project.title}}', body: 'Новый текст\n{{project.body}}' };
await CWDB.templates.put(other);
ok('без перечитывания — прежний кэш (однократный init)', (await D.compose(pid, 'ru')).subject === 'Тема: Спецвстреча <b>&</b>');
await CWTemplates.reload();
const fresh = await D.compose(pid, 'ru');
ok('CWTemplates.reload() → текст из другой вкладки без перезагрузки', fresh.subject === 'Из другой вкладки: Спецвстреча <b>&</b>' && fresh.body.startsWith('Новый текст'));
const origGetAll = CWDB.templates.getAll;
CWDB.templates.getAll = () => Promise.reject(new Error('idb'));
ok('сбой перечитывания — отказ, прежний кэш цел', (await rejects(() => CWTemplates.reload())) === 'idb' && (await D.compose(pid, 'ru')).subject.startsWith('Из другой вкладки'));
CWDB.templates.getAll = origGetAll;
await CWTemplates.save('sys.journal.project.letter', 'ru', { subject: 'Тема: {{project.title}}', body: 'Уважаемые братья!\n{{project.body}}' });
ok('композер перечитывает шаблоны при каждом открытии', /dlg\.showModal\(\);\s*await templatesFresh\(\);\s*await loadLetter\(sel\.value\);/.test(docUi) && /T\.reload\(\)/.test(docUi));

/* ═══ 3. CWDocsView: один обработчик ════════════════════════════════════ */
console.log('\n3. Обработчики истории');
ok('bind — один раз, за флагом docsUi.bound', (uiCode.match(/CWDocsView\.bind\(/g) || []).length === 1 && /if \(docsUi\.bound\) return;\s*docsUi\.bound = true;/.test(uiCode));
ok('renderProjectDocs не вешает обработчиков', (() => { const seg = docUi.slice(docUi.indexOf('async function renderProjectDocs'), docUi.indexOf('/* ═══ Композер')); return seg.length > 100 && !/addEventListener|\.bind\(/.test(seg); })());
ok('wireProjectDocsChrome зовётся из wireProjectChrome (один раз за страницу)', /function wireProjectChrome\(\) \{\s*wireProjectDocsChrome\(\);/.test(read('journal/js/app/projects.js')));

/* ═══ 4. Удаление проекта не удаляет историю ═══════════════════════════ */
console.log('\n4. Удаление проекта');
const pDel = await J.projects.add({ circuitId: circuit, title: 'Удаляемый', body: 'x' });
await D.save(pDel, await D.compose(pDel, 'ru'), 'manual');
await J.projects.remove(pDel);
ok('проект удалён, снимок остался', !(await J.projects.get(pDel)) && (await docsOf(pDel)).length === 1);

/* ═══ 4b. Архивный проект — только чтение ════════════════════════════ */
console.log('\n4b. Архивный проект');
const pArc = await J.projects.add({ circuitId: circuit, title: 'Архивируемый', body: 'текст' });
const arcDoc = { ...(await D.compose(pArc, 'ru')), title: 't' };
ok('активный: compose/save работают', !!(await D.save(pArc, arcDoc, 'manual')) && (await docsOf(pArc)).length === 1);
await J.projects.archive(pArc);
ok('архивный: compose — только чтение', (await rejects(() => D.compose(pArc, 'ru'))) === 'journal-project-readonly');
ok('архивный: save — только чтение', (await rejects(() => D.save(pArc, arcDoc, 'print'))) === 'journal-project-readonly');
ok('архивный: история читается', (await D.list(pArc)).length === 1 && (await docsOf(pArc)).length === 1);
await J.projects.unarchive(pArc);
ok('после возврата из архива compose снова работает', (await D.compose(pArc, 'ru')).subject.endsWith('Архивируемый'));
const rpd = docUi.slice(docUi.indexOf('async function renderProjectDocs'), docUi.indexOf('/* ═══ Композер'));
ok('экран: «Создать письмо» скрыта и выключена у архивного', /btn\.hidden = archived;/.test(rpd) && /btn\.disabled = prot \|\| archived \|\| !avail;/.test(rpd) && /var archived = p\.status === 'archived';/.test(rpd));

/* ═══ 4c. Первая настройка защиты — всё или ничего ════════════════════ */
console.log('\n4c. Первая настройка: снимок между проверками');
ok('сейфа ещё нет', (await P.status()).state === 'off' && !(await CWDB.journalMeta.get('crypto:v1')));
const pFirst = await J.projects.add({ circuitId: circuit, title: 'Первая защита', body: 'открытое тело' });
const firstRaw = await CWDB.journalEntries.get(pFirst);
const firstDoc = { ...(await D.compose(pFirst, 'ru')), title: 't', ref: D.ref(pFirst), reason: 'manual' };
const strict0 = CWDocs.listStrict;
let firstCall = true;
CWDocs.listStrict = async (ref) => {
  const out = await strict0(ref);
  if (firstCall && ref && ref.id === pFirst) { firstCall = false; await CWDocs.save(firstDoc); }
  return out;
};
const firstErr = await rejects(() => P.setup('correct horse battery', pFirst));
CWDocs.listStrict = strict0;
ok('setup отказывает', firstErr === 'journal-protect-has-documents', firstErr);
const firstAfter = await CWDB.journalEntries.get(pFirst);
ok('проект открыт, строка как до setup', !firstAfter.sec && firstAfter.title === firstRaw.title && firstAfter.body === firstRaw.body && firstAfter.updatedAt === firstRaw.updatedAt);
ok('crypto:v1 удалён', !(await CWDB.journalMeta.get('crypto:v1')));
ok('status снова off, сессия не открыта', (await P.status()).state === 'off' && !P.isUnlocked());
ok('снимок остался (его не трогаем)', (await docsOf(pFirst)).length === 1);
ok('инвариант: нет «защищён + снимок»', !((await CWDB.journalEntries.getAll()).some((r) => r.sec && r.id === pFirst)));
for (const r of await docsOf(pFirst)) await CWDocs.remove(r.id);

/* ═══ 5. J8 ═════════════════════════════════════════════════════════════ */
console.log('\n5. Граница J8');
const task = await J.tasks.add({ nodeId: circuit, body: 'задача' });
await P.setup('correct horse battery', task);
const pProt = await J.projects.add({ circuitId: circuit, title: 'Секрет ' + CANARY, body: 'Тело ' + CANARY });
await P.protect(pProt);
ok('проект защищён', !!(await CWDB.journalEntries.get(pProt)).sec);
ok('разблокировано: compose — отказ', P.isUnlocked() && (await rejects(() => D.compose(pProt, 'ru'))) === 'journal-docs-protected');
ok('разблокировано: save — отказ', (await rejects(() => D.save(pProt, { projectId: pProt, templateId: 'x', lang: 'ru', subject: CANARY, body: CANARY }, 'manual'))) === 'journal-docs-protected');
P.lock();
ok('заблокировано: compose — отказ', (await rejects(() => D.compose(pProt, 'ru'))) === 'journal-docs-protected');
await P.unlock('correct horse battery');
ok('архив проекта пуст', (await docsOf(pProt)).length === 0);

ok('проект со снимками не защищается', (await rejects(() => P.protect(pid))) === 'journal-protect-has-documents');
ok('…и остаётся открытым', !(await CWDB.journalEntries.get(pid)).sec);
for (const r of await docsOf(pid)) await CWDocs.remove(r.id);
ok('снимки удалены → защита проходит', (await rejects(() => P.protect(pid))) === null && !!(await CWDB.journalEntries.get(pid)).sec);
await P.unprotect(pid);

const pNoDocs = await J.projects.add({ circuitId: circuit, title: 'Без архива', body: 'b' });
const realAvailable = CWDocs.available;
CWDocs.available = () => false;
ok('CWDocs недоступен → защита отказывает (fail closed)', (await rejects(() => P.protect(pNoDocs))) === 'journal-protect-docs-unknown');
CWDocs.available = realAvailable;
/* Отказ НИЖНЕГО хранилища при нетронутом API CWDocs: терпимый list()
   отдаёт [] («документов нет»), строгий — отказ; защита обязана отказать. */
const realByIndex = CWDB.documents.byIndex;
CWDB.documents.byIndex = () => Promise.reject(new Error('idb-read-failed'));
ok('сбой базы: CWDocs.list() терпимо отдаёт []', Array.isArray(await CWDocs.list(D.ref(pNoDocs))) && (await CWDocs.list(D.ref(pNoDocs))).length === 0);
ok('сбой базы: CWDocs.listStrict() отклоняется', (await rejects(() => CWDocs.listStrict(D.ref(pNoDocs)))) === 'idb-read-failed');
ok('сбой базы → защита проекта отказывает (fail closed)', (await rejects(() => P.protect(pNoDocs))) === 'journal-protect-docs-unknown');
ok('…проект остался открытым', !(await CWDB.journalEntries.get(pNoDocs)).sec);
CWDB.documents.byIndex = realByIndex;
const strictFn = CWDocs.listStrict; delete CWDocs.listStrict;
ok('нет строгого API → защита отказывает', (await rejects(() => P.protect(pNoDocs))) === 'journal-protect-docs-unknown');
CWDocs.listStrict = strictFn;
ok('слой данных не читает CWDB.documents напрямую', !/CWDB\.documents|db\(\)\.documents/.test(strip(read('journal/js/data.js'))));
const g = globalThis.CWDocs; delete globalThis.CWDocs;
ok('CWDocs не загружен → защита отказывает', (await rejects(() => P.protect(pNoDocs))) === 'journal-protect-docs-unknown');
globalThis.CWDocs = g;
ok('задача (не проект) защищается без архива', (await rejects(async () => { const tk = await J.tasks.add({ nodeId: circuit, body: 't2' }); CWDocs.available = () => false; try { await P.protect(tk); } finally { CWDocs.available = realAvailable; } })) === null);

/* Гонка 1: защита легла между проверкой save() и записью снимка — теперь это
   не уборка задним числом: снимок пишется одним пакетом с предусловием на
   строку проекта, и пакет просто не проходит. */
const pRace1 = await J.projects.add({ circuitId: circuit, title: 'Гонка ' + CANARY, body: 'Тело ' + CANARY });
const realGuarded = CWDocs.saveGuarded;
const realRemove = CWDocs.remove;
let removeCalls = 0;
CWDocs.remove = (...a) => { removeCalls++; return Promise.reject(new Error('remove-failed')); };
CWDocs.saveGuarded = async (input, guards) => { await P.protect(pRace1); return realGuarded(input, guards); };
const composed1 = await D.compose(pRace1, 'ru');
const race1 = await rejects(() => D.save(pRace1, { ...composed1, title: 't' }, 'manual'));
CWDocs.saveGuarded = realGuarded;
ok('снимок ∥ защита: save отказывает', race1 === 'journal-docs-protected', race1);
ok('…снимка нет вовсе (нечего убирать)', (await docsOf(pRace1)).length === 0);
ok('…удаление снимка ни разу не понадобилось', removeCalls === 0);

/* Прежний враждебный случай: remove всегда падает, защищённую строку меняют
   ещё раз — инвариант от remove больше не зависит, чужая правка цела. */
const pAdv = await J.projects.add({ circuitId: circuit, title: 'Враждебный', body: 'тело' });
const advDoc = { ...(await D.compose(pAdv, 'ru')), title: 't' };
let changedAt = null;
CWDocs.saveGuarded = async (input, guards) => {
  await P.protect(pAdv);
  await J.projects.update(pAdv, { title: 'Правка защищённого', body: 'новое тело' });
  changedAt = (await CWDB.journalEntries.get(pAdv)).updatedAt;
  return realGuarded(input, guards);
};
const adv = await rejects(() => D.save(pAdv, advDoc, 'manual'));
CWDocs.saveGuarded = realGuarded;
const advRow = await CWDB.journalEntries.get(pAdv);
ok('враждебный: save отказывает', adv === 'journal-docs-protected', adv);
ok('враждебный: снимка нет, remove не звался', (await docsOf(pAdv)).length === 0 && removeCalls === 0);
ok('враждебный: правка защищённой строки не потеряна', !!advRow.sec && advRow.updatedAt === changedAt
  && (await J.projects.get(pAdv)).title === 'Правка защищённого');
CWDocs.remove = realRemove;

/* Открытый проект правят между чтением и записью: предусловие срывается,
   снимок не пишется, второй круг берёт свежую строку. */
const pEd = await J.projects.add({ circuitId: circuit, title: 'До правки', body: 'тело' });
const edDoc = { ...(await D.compose(pEd, 'ru')), title: 't' };
let edCalls = 0;
CWDocs.saveGuarded = async (input, guards) => {
  edCalls++;
  if (edCalls === 1) await J.projects.update(pEd, { title: 'После правки' });
  return realGuarded(input, guards);
};
const edSaved = await D.save(pEd, edDoc, 'manual');
CWDocs.saveGuarded = realGuarded;
ok('правка открытого проекта в гонке: повтор со свежей строкой', edCalls === 2 && edSaved && edSaved.data.project.title === 'После правки' && (await docsOf(pEd)).length === 1);
ok('CWDB.batch: expectNone в публичном контракте', /'expectNone'/.test(read('shared/db.js')) && typeof CWDocs.saveGuarded === 'function' && typeof CWDocs.refKey === 'function');
ok('компенсаций больше нет (remove/откат после записи)', !/snapshotGone|revertProtectIfDocuments|D\.remove\(/.test(strip(read('journal/js/data.js'))));

/* Конкурентно, в обоих порядках, много раз: допустимы только
   «открыт + снимок» или «защищён + без снимка». */
const verdicts = { open_doc: 0, protected_nodoc: 0 };
let invariantOk = true, invInfo = '';
for (let i = 0; i < 40; i++) {
  const pc = await J.projects.add({ circuitId: circuit, title: 'Конкуренция ' + i, body: 'тело ' + i });
  const cdoc = { ...(await D.compose(pc, 'ru')), title: 't' };
  const tasks = i % 2 ? [() => D.save(pc, cdoc, i % 4 === 1 ? 'print' : 'manual'), () => P.protect(pc)] : [() => P.protect(pc), () => D.save(pc, cdoc, 'manual')];
  /* Разный сдвиг старта (0…~20 мс) — операции перекрываются по-разному. */
  const lag = (ms) => new Promise((r) => setTimeout(r, ms));
  const shift = (i * 7) % 23;
  const res = await Promise.allSettled([tasks[0](), lag(shift).then(() => tasks[1]())]);
  const r = await CWDB.journalEntries.get(pc);
  const n = (await docsOf(pc)).length;
  if (r.sec && n > 0) { invariantOk = false; invInfo = i + ': protected+snapshot ' + JSON.stringify(res.map((x) => x.status + ':' + (x.reason && x.reason.message))); break; }
  if (!r.sec && n > 0) verdicts.open_doc++;
  else if (r.sec && n === 0) verdicts.protected_nodoc++;
  else { invariantOk = false; invInfo = i + ': ни один не прошёл ' + JSON.stringify(res.map((x) => x.status + ':' + (x.reason && x.reason.message))); break; }
  const errs = res.filter((x) => x.status === 'rejected').map((x) => x.reason.message);
  if (!errs.every((m) => m === 'journal-docs-protected' || m === 'journal-protect-has-documents')) { invariantOk = false; invInfo = i + ': ' + errs.join(); break; }
}
ok('save ∥ protect ×40 (оба порядка): никогда «защищён + снимок»', invariantOk, invInfo);
ok('…встречаются оба законных исхода', verdicts.open_doc > 0 && verdicts.protected_nodoc > 0, JSON.stringify(verdicts));

/* Гонка 2: снимок лёг между проверкой защиты и её записью — защита откатывается. */
const pRace2 = await J.projects.add({ circuitId: circuit, title: 'Гонка2 открытая', body: 'Тело2 открытое' });
const early = await D.compose(pRace2, 'ru');
let first = true;
const realStrict = CWDocs.listStrict;
CWDocs.listStrict = async (ref) => {
  if (first && ref && ref.id === pRace2) { first = false; const out = await realStrict(ref); await CWDocs.save({ ...early, title: 't', ref: D.ref(pRace2), reason: 'manual' }); return out; }
  return realStrict(ref);
};
const race2 = await rejects(() => P.protect(pRace2));
CWDocs.listStrict = realStrict;
ok('защита ∥ снимок: защита отказывает', race2 === 'journal-protect-has-documents', race2);
ok('…строка возвращена в открытый вид', !(await CWDB.journalEntries.get(pRace2)).sec && (await CWDB.journalEntries.get(pRace2)).title.startsWith('Гонка2'));
for (const r of await docsOf(pRace2)) await CWDocs.remove(r.id);

/* Отказ архива: CWDocs.save() отвечает null — это не «сохранено». */
const pFail = await J.projects.add({ circuitId: circuit, title: 'Отказ архива', body: 'b' });
const failDoc = { ...(await D.compose(pFail, 'ru')), title: 't' };
CWDB.documents.byIndex = () => Promise.reject(new Error('idb-read-failed'));
ok('сбой базы: CWDocs.save() → null', (await CWDocs.save({ ...failDoc, ref: D.ref(pFail), reason: 'manual' })) === null);
ok('сбой архива: save → journal-docs-archive-failed (manual)', (await rejects(() => D.save(pFail, failDoc, 'manual'))) === 'journal-docs-archive-failed');
ok('сбой архива: save → journal-docs-archive-failed (print)', (await rejects(() => D.save(pFail, failDoc, 'print'))) === 'journal-docs-archive-failed');
CWDB.documents.byIndex = realByIndex;
ok('…снимков нет', (await docsOf(pFail)).length === 0);
const runSaveSrc = docUi.slice(docUi.indexOf('async function runSave'), docUi.indexOf('function printLetter'));
ok('экран: «сохранено» только после успешного save', /await CWJournal\.documents\.save\([^;]+;\s*setStatus\(reason === 'print' \? 'j\.pdoc\.printed' : 'j\.pdoc\.saved'\);/.test(runSaveSrc));
ok('экран: печать без архива — своя строка, без «сохранено»', /catch \(err\) \{[\s\S]*?if \(reason === 'print'\) setStatus\('j\.pdoc\.printed_not_archived'\);[\s\S]*?showError\(err\);/.test(runSaveSrc));
ok('ошибка архива сопоставлена ключу', /'journal-docs-archive-failed': 'j\.pdoc\.err\.archive_failed'/.test(read('journal/js/app/core.js')));

ok('канарейки нет в CWDB.documents', !hasCanary(JSON.stringify(await CWDB.documents.getAll())));
ok('канарейки нет в CWDB.templates', !hasCanary(JSON.stringify(await CWDB.templates.getAll())));
ok('канарейки нет в localStorage', !hasCanary(JSON.stringify([...mem.entries()])));
ok('канарейки нет в копии', !hasCanary(JSON.stringify(await CWBackup.snapshot(['journal']))) && !hasCanary(JSON.stringify(await CWBackup.snapshot())));
ok('канарейки нет в journalEntries открытым текстом', !hasCanary(JSON.stringify((await CWDB.journalEntries.getAll()).filter((r) => r.sec))));
P.lock();

/* ═══ 6. «Документы»: фильтры и глубокие ссылки ═════════════════════════ */
console.log('\n6. Модуль «Документы»');
const dapp = read('documents/js/app.js');
ok('фильтр библиотеки: Журнал', /var FILTERS = \[[\s\S]*?\{ key: 'journal', label: 'module\.journal\.title' \}[\s\S]*?\];/.test(dapp));
ok('фильтр архива: Журнал', /var ARCHIVE_FILTERS = \[[\s\S]*?\{ key: 'journal', label: 'module\.journal\.title' \}[\s\S]*?\];/.test(dapp));
ok('переменные Журнала: project, doc', /'journal': \['project', 'doc'\]/.test(dapp));
ok('имя шаблона в библиотеке', /'sys\.journal\.project\.letter': 'doc\.name\.journal_project_letter'/.test(dapp));
const pf = dapp.indexOf('  var DEEP_ID'), pt = dapp.indexOf('  function applyArchiveLink');
const parseDeepLink = new Function(dapp.slice(pf, pt) + '; return parseDeepLink;')();
ok('#template/<id>', JSON.stringify(parseDeepLink('#template/sys.journal.project.letter')) === JSON.stringify({ screen: 'library', templateId: 'sys.journal.project.letter' }));
ok('#archive', parseDeepLink('#archive').screen === 'archive' && !parseDeepLink('#archive').entityKey);
ok('#archive/journal/project/<id>', parseDeepLink('#archive/journal/project/' + encodeURIComponent(pid)).entityKey === 'journal:project:' + pid);
for (const bad of ['', '#', '#template/', '#template/a b', '#template/<img>', '#template/a/b', '#archive/Journal/project/x', '#archive/journal/project/', '#archive/journal/project/%E0%A4%A', '#archive/journal/project/a/b', '#editor/x', '#template/%3Cimg%3E']) {
  ok('кривая ссылка → обычное открытие: ' + JSON.stringify(bad), parseDeepLink(bad) === null);
}
ok('шаблон открывается только существующий', /templates\(\)\.some\(function \(tpl\) \{ return tpl\.id === link\.templateId; \}\)/.test(dapp));
ok('отбор архива по entityKey', /if \(archive\.entityKey && \(doc\.entityKey \|\| ''\) !== archive\.entityKey\) return false;/.test(dapp));
const jhtml = read('journal/index.html');
ok('Журнал: ссылка на шаблон', jhtml.includes('href="../documents/index.html#template/sys.journal.project.letter"'));
ok('Журнал: ссылка на архив проекта', /DOCS_PAGE \+ '#archive\/journal\/project\/' \+ encodeURIComponent\(projectId\)/.test(docUi));

/* ═══ 7. Копия: слияние templates/documents ═════════════════════════════ */
console.log('\n7. Резервная копия');
const reg = CWBackup.MODULES.journal;
const DB = 'circuit-workspace-db';
ok('templates/documents в копии Журнала', reg.sharedStores[DB].includes('templates') && reg.sharedStores[DB].includes('documents'));
ok('набор замены J8 — только четыре хранилища Журнала', JSON.stringify(reg.restoreReplace[DB].slice().sort()) === JSON.stringify(['journalEntries', 'journalLinks', 'journalMeta', 'journalNodes']));
const pB = await J.projects.add({ circuitId: circuit, title: 'Копия', body: 'b' });
await D.save(pB, { ...(await D.compose(pB, 'ru')), title: 't' }, 'manual');
const snap = await CWBackup.snapshot(['journal']);
ok('копия проходит проверку', CWBackup.inspect(snap).ok === true);
const stores = snap.sections.shared.idb[DB].stores;
ok('в копии снимок и правка шаблона', (stores.documents.rows || []).some((r) => r.entityKey === 'journal:project:' + pB) && (stores.templates.rows || []).some((r) => r.id === 'sys.journal.project.letter'));
/* После копии: чужие документы/шаблоны, свои снимки удалены. */
const foreignDoc = await CWDocs.save({ templateId: 'sys.school.student.invitation', context: 'school.student.invitation', title: 'x', lang: 'ru', format: 'text', body: 'Чужое письмо', ref: { module: 'pioneer-school', entity: 'student', id: 's1' }, reason: 'print' });
await CWTemplates.save('sys.school.student.invitation', 'ru', { subject: null, body: 'Чужой шаблон' });
for (const r of await docsOf(pB)) await CWDocs.remove(r.id);
await CWTemplates.reset('sys.journal.project.letter');
await CWBackup.restore(snap);
const docsAfter = await CWDB.documents.getAll();
const tplAfter = await CWDB.templates.getAll();
ok('восстановлено: снимок проекта', docsAfter.some((r) => r.entityKey === 'journal:project:' + pB));
ok('восстановлено: правка шаблона Журнала', tplAfter.some((r) => r.id === 'sys.journal.project.letter'));
ok('чужой снимок не стёрт', docsAfter.some((r) => r.id === foreignDoc.id && r.body === 'Чужое письмо'));
ok('чужой шаблон не стёрт', tplAfter.some((r) => r.id === 'sys.school.student.invitation'));
const full = await CWBackup.snapshot();
ok('полная копия проходит проверку', CWBackup.inspect(full).ok === true);

/* ═══ 8. Подключение и прекэш ═══════════════════════════════════════════ */
console.log('\n8. Оболочка Журнала');
const sw = read('journal/sw.js');
for (const f of ['../shared/templates/namespaces.js', '../shared/templates/builtin.js', '../shared/templates.js', '../shared/doclang.js', '../shared/documents.js', '../shared/docsview.js', '../shared/print.js', './js/app/documents.js']) {
  ok('прекэш и подключение: ' + f, sw.includes("'" + f + "'") && jhtml.includes('<script src="' + f.replace(/^\.\//, '') + '"></script>'));
}
const at = (src) => jhtml.indexOf('<script src="' + src + '"');
ok('порядок: реестр → системные тексты → движок → data.js', at('../shared/templates/namespaces.js') < at('../shared/templates/builtin.js') && at('../shared/templates/builtin.js') < at('../shared/templates.js') && at('../shared/documents.js') < at('js/data.js'));
ok('экраны не трогают CWDB/CWDocs.save напрямую', !/CWDB\.|CWDocs\.save/.test(uiCode));

console.log(failed ? `\n✗ check-journal-documents: ${failed} провал(ов)` : '\n✓ check-journal-documents: всё прошло');
process.exit(failed ? 1 : 0);
