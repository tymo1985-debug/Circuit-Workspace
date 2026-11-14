#!/usr/bin/env node
/**
 * Школа пионеров — рассылка по собраниям (Ф3, 14.11.2026).
 *
 * ЗАЧЕМ. Отказы Ф3 тихие:
 *  1. ZIP собирается своим упаковщиком (js/utils/zip.js). Битая контрольная
 *     сумма или смещение — архив «скачался», но не открывается у старейшин.
 *     §1 собирает архив и разбирает его обратно по центральному каталогу.
 *  2. Переменные писем старейшинам ({{congregation.*}}, {{school.pioneerList}})
 *     должны быть в реестре: незнакомая переменная уезжает в письмо как есть.
 *  3. «Письмо отправлено» — только кнопкой; снятие отметки не трогает
 *     ответивших; срок собрания перекрывает срок формуляра; «просрочено» —
 *     только отправленному и не полностью ответившему собранию.
 *  4. Формуляр в пакете приходит с вписанными именем и собранием.
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PS = join(ROOT, 'pioneer-school');
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond ? '' : ' — ' + (extra || ''))); if (!cond) fails++; };

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function unzip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.byteLength - 22;
  if (v.getUint32(eocd, true) !== 0x06054b50) throw new Error('нет конца каталога');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('битый центральный каталог');
    const flags = v.getUint16(p + 8, true);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (v.getUint32(local, true) !== 0x04034b50) throw new Error('битый локальный заголовок ' + name);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = buf.subarray(start, start + size);
    out.push({ name, flags, crcOk: crc32(data) === crc, data });
    p += 46 + nameLen;
  }
  return out;
}

(async () => {
  console.log('1. Упаковщик ZIP');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const ctxDom = dom.getInternalVMContext();
  vm.runInContext(readFileSync(join(PS, 'js/utils/zip.js'), 'utf8'), ctxDom);
  const Z = dom.window.PSZip;
  const enc = new TextEncoder();
  const blob = Z.build([
    { name: 'Прага-Русское/00 Письмо.pdf', data: enc.encode('%PDF-1.7 письмо') },
    { name: 'Прага-Русское/Новак Анна/Формуляр.pdf', data: new Uint8Array([1, 2, 3, 250]) },
  ], new Date(2026, 10, 14, 12, 30));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let files = [];
  try { files = unzip(bytes); } catch (e) { ok('архив разбирается', false, e.message); }
  ok('два файла в каталоге', files.length === 2, String(files.length));
  ok('имена UTF-8 с флагом 0x0800', files.every((f) => f.flags & 0x0800) && files[1].name === 'Прага-Русское/Новак Анна/Формуляр.pdf', files.map((f) => f.name).join());
  ok('контрольные суммы сходятся', files.every((f) => f.crcOk));
  ok('содержимое не искажено', new TextDecoder().decode(files[0].data) === '%PDF-1.7 письмо' && files[1].data[3] === 250);
  ok('запрещённые символы ОС убираются из имени', Z.safeName('A/B:C*?') === 'A B C' && Z.safeName('', 'x') === 'x');

  console.log('2. Шаблоны писем старейшинам');
  const tctx = { console };
  tctx.self = tctx; tctx.window = tctx;
  vm.createContext(tctx);
  vm.runInContext(readFileSync(join(ROOT, 'shared/templates/namespaces.js'), 'utf8'), tctx);
  vm.runInContext(readFileSync(join(ROOT, 'shared/templates/builtin.js'), 'utf8'), tctx);
  const NS = tctx.CW_TEMPLATE_NAMESPACES;
  for (const id of ['sys.school.congregation.letter', 'sys.school.congregation.reminder']) {
    const tpl = tctx.CW_BUILTIN_TEMPLATES.find((t) => t.id === id);
    ok(id + ' есть', !!tpl && tpl.module === 'pioneer-school');
    if (!tpl) continue;
    const unknown = new Set();
    Object.entries(tpl.translations).forEach(([, t]) => {
      (String(t.body).match(/\{\{\s*([a-z]+)\.([A-Za-z]+)\s*\}\}/g) || []).forEach((m) => {
        const [, ns, field] = m.match(/\{\{\s*([a-z]+)\.([A-Za-z]+)/);
        if (!NS[ns] || !NS[ns].fields[field]) unknown.add(ns + '.' + field);
      });
    });
    ok(id + ': все переменные в реестре', unknown.size === 0, [...unknown].join());
    ok(id + ': пять языков, список пионеров в каждом', ['ru', 'uk', 'en', 'pl', 'de'].every((l) => tpl.translations[l] && tpl.translations[l].body.includes('{{school.pioneerList}}')));
  }
  const docsApp = readFileSync(join(ROOT, 'documents/js/app.js'), 'utf8');
  ok('«Документы» предлагают {{congregation.*}} шаблонам Школы', /'pioneer-school':\s*\[[^\]]*'congregation'/.test(docsApp));

  console.log('3. Статусы, сроки, напоминание');
  const idb = new IDBFactory();
  const ctx = {
    indexedDB: idb, IDBKeyRange, console, Intl, Date, Math, JSON, Promise, Error, setTimeout,
    T: (k, v) => k + (v ? JSON.stringify(v) : ''),
    D: (k) => k,
    PSDocLang: { get: () => 'ru' },
    CWI18n: { lang: 'ru' },
    DateUtils: { todayIso: () => '2027-02-01' },
    CWDirectory: {
      ready: true,
      get: (id) => ({ c1: { id: 'c1', name: 'Прага-Русское', congNumber: '123', contactName: 'Иван', contactPhone: '+420 777 000 111', contactEmail: 'e@x.cz' } })[id] || null,
    },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['js/db.js', 'js/modules/students.js', 'js/modules/schools.js', 'js/modules/registrationSchema.js', 'js/modules/registration.js', 'js/modules/dispatch.js']) {
    vm.runInContext(readFileSync(join(PS, f), 'utf8'), ctx, { filename: f });
  }
  await ctx.DB.ready();
  const { Students, Dispatch } = ctx;
  await Students.getColumns();
  const add = (id, last, { values = {}, ...extra }) => Students.save({ id, classId: null, values: { lastName: last, firstName: 'И', ...values }, origin: 'branchList', status: 'invited', textbookLanguages: ['ru'], ...extra });
  await add('a', 'Альфа', { congregationId: 'c1' });
  await add('b', 'Бета', { congregationId: 'c1', status: 'willCome' });
  await add('c', 'Гамма', { congregationId: 'c1', status: 'wontCome', statusReason: 'работа' });
  await add('d', 'Дельта', { values: { congregation: 'Брно' } });
  await add('e', 'Эпсилон', {});

  const cfg = { deadline: '2027-01-15' };
  let groups = Dispatch.groups(await Students.list(), await Dispatch.getState(), cfg, '2027-02-01');
  const praha = groups.find((g) => g.key === 'c1');
  ok('группы: справочник + снимок названия', groups.length === 2 && praha && groups.some((g) => g.key === 'name:брно'), groups.map((g) => g.key).join());
  ok('без собрания — вне рассылки', Dispatch.orphans(await Students.list()).map((s) => s.id).join() === 'e');
  ok('название и контакт из справочника', praha.name === 'Прага-Русское' && praha.record.contactName === 'Иван');
  ok('пакет — только ожидаемым', praha.invitees.map((s) => s.id).sort().join() === 'a,b', praha.invitees.map((s) => s.id).join());
  ok('ответы: willCome и wontCome', praha.responded === 2 && praha.total === 3);
  ok('не отправлено — не просрочено', !praha.sent && !praha.overdue);
  ok('срок по умолчанию — из формуляра', praha.deadline === '2027-01-15' && !praha.ownDeadline);

  await Dispatch.markSent(praha, '2026-11-15');
  let list = await Students.list();
  ok('отметка: приглашён → письмо отправлено', list.find((s) => s.id === 'a').status === 'letterSent' && list.find((s) => s.id === 'b').status === 'willCome' && list.find((s) => s.id === 'd').status === 'invited');
  groups = Dispatch.groups(list, await Dispatch.getState(), cfg, '2027-02-01');
  let g = groups.find((x) => x.key === 'c1');
  ok('после срока без всех ответов — просрочено', g.sent && g.overdue && g.entry.sentAt === '2026-11-15');
  ok('напоминание — только неответившим', Dispatch.pending(g).map((s) => s.id).join() === 'a');
  const links = Dispatch.links(g, { title: 'Напоминание', body: 'Текст & список' });
  ok('ссылки WhatsApp и почты', links.whatsapp.startsWith('https://wa.me/420777000111?text=') && links.email.startsWith('mailto:e%40x.cz?subject='), JSON.stringify(links));

  await Dispatch.setDeadline(g, '2027-03-01');
  g = Dispatch.groups(await Students.list(), await Dispatch.getState(), cfg, '2027-02-01').find((x) => x.key === 'c1');
  ok('свой срок собрания перекрывает формуляр', g.deadline === '2027-03-01' && g.ownDeadline && !g.overdue);
  await Dispatch.markReminded(g);
  ok('дата напоминания запомнена', (await Dispatch.getState()).c1.remindedAt === '2027-02-01');

  await Students.saveCard('a', { status: 'willCome' });
  g = Dispatch.groups(await Students.list(), await Dispatch.getState(), cfg, '2027-12-01').find((x) => x.key === 'c1');
  ok('все ответили — не просрочено', g.complete && !g.overdue);

  await Dispatch.unmarkSent(g);
  list = await Students.list();
  const st = await Dispatch.getState();
  ok('снятие отметки: ответившие не тронуты', list.find((s) => s.id === 'a').status === 'willCome');
  ok('снятие отметки: срок сохранён, дата отправки снята', st.c1.deadline === '2027-03-01' && !st.c1.sentAt && !st.c1.remindedAt, JSON.stringify(st.c1));

  console.log('4. Формуляр с вписанным именем');
  const fdom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'https://example.test/pioneer-school/index.html' });
  const fw = fdom.window;
  const fctx = fdom.getInternalVMContext();
  const store = {};
  Object.defineProperty(fw, 'localStorage', { configurable: true, value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
  const run = (file) => vm.runInContext(readFileSync(file, 'utf8'), fctx, { filename: file });
  run(join(ROOT, 'shared/i18n.js'));
  run(join(ROOT, 'shared/doclang.js'));
  run(join(PS, 'i18n/doc.js'));
  run(join(PS, 'js/doclang.js'));
  fw.PSDocLang.init();
  run(join(PS, 'js/modules/registrationSchema.js'));
  run(join(ROOT, 'shared/vendor/pdf-lib.min.js'));
  run(join(ROOT, 'shared/vendor/fontkit.umd.min.js'));
  run(join(ROOT, 'shared/fonts/noto-sans-pdf-regular.js'));
  run(join(PS, 'js/export/pdfFormExport.js'));
  const pdf = await fw.PdfFormExport.generate({ title: 'Школа', deadline: '2027-01-15' }, fw.RegistrationSchema, { lastName: 'Новак', firstName: 'Анна', congregation: 'Прага-Русское' });
  const back = await fw.PdfFormExport.readFilled(pdf, fw.RegistrationSchema);
  ok('имя и собрание вписаны и читаются обратно', back.record.lastName === 'Новак' && back.record.firstName === 'Анна' && back.record.congregation === 'Прага-Русское', JSON.stringify(back.record));
  ok('остальные поля пустые', back.filled === 3, String(back.filled));

  console.log(fails ? `\nПровалено: ${fails}` : '\nВсе проверки пройдены.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
