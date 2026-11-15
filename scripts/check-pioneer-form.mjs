#!/usr/bin/env node
/**
 * Школа пионеров — формуляр пионера (Ф2, 14.11.2026).
 *
 * ЗАЧЕМ. Ф2 замыкает круг «анкета → карточка». Ломается он молча:
 *  1. Имена полей PDF — контракт между генератором и разборщиком
 *     (pdfFormExport.js). Переименованное поле не даёт ошибки — ответ пионера
 *     просто пропадает. §1 генерирует НАСТОЯЩУЮ анкету, заполняет её pdf-lib,
 *     как это сделал бы просмотрщик, и вычитывает обратно.
 *  2. Анкеты, разосланные до Ф2, несут один язык радиогруппой `language`.
 *  3. Перенос в карточку не должен стирать то, что уже было в карточке, и
 *     переписывать итог школы (attended / notAttended). §2 гоняет настоящие
 *     db.js / students.js / registration.js на fake-indexeddb.
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PS = join(ROOT, 'pioneer-school');
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond ? '' : ' — ' + (extra || ''))); if (!cond) fails++; };

function docEnv() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'https://example.test/pioneer-school/index.html' });
  const w = dom.window;
  const vmCtx = dom.getInternalVMContext();
  const store = {};
  Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
  const run = (file) => vm.runInContext(readFileSync(file, 'utf8'), vmCtx, { filename: file });
  run(join(ROOT, 'shared/i18n.js'));
  run(join(ROOT, 'shared/doclang.js'));
  run(join(PS, 'i18n/doc.js'));
  run(join(PS, 'js/doclang.js'));
  w.PSDocLang.init();
  run(join(PS, 'js/modules/registrationSchema.js'));
  run(join(ROOT, 'shared/vendor/pdf-lib.min.js'));
  run(join(ROOT, 'shared/vendor/fontkit.umd.min.js'));
  run(join(ROOT, 'shared/fonts/noto-sans-pdf-regular.js'));
  run(join(PS, 'js/export/pdfFormExport.js'));
  return w;
}

(async () => {
  console.log('1. Анкета: генерация → заполнение → чтение');
  const w = docEnv();
  const S = w.RegistrationSchema;
  const PFE = w.PdfFormExport;
  ok('pdf-lib и fontkit загружены', !!w.PDFLib && !!w.fontkit);
  const bytes = await PFE.generate({ title: 'Школа 2027', deadline: '2027-01-15', email: 'a@b.c', whatsapp: '+420 1' }, S);
  const { PDFDocument } = w.PDFLib;
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  const names = new Set(form.getFields().map((f) => f.getName()));
  const expected = [];
  S.allFields().forEach((f) => {
    if (f.type === 'checkboxes') f.options.forEach((o) => expected.push(f.key + '_' + o.value));
    else expected.push(f.key);
  });
  const missing = expected.filter((n) => !names.has(n));
  ok('каждое поле схемы есть в PDF', missing.length === 0, missing.join());

  const empty = await PFE.readFilled(bytes, S);
  ok('пустая анкета: ни одного ответа', empty.filled === 0 && empty.fields > 0, JSON.stringify(empty));

  const set = (n, v) => form.getTextField(n).setText(v);
  set('lastName', 'Новак'); set('firstName', 'Анна'); set('congregation', 'Прага-Русское');
  set('phone', '+420 777 000 123'); form.getCheckBox('phoneWhatsapp').check();
  set('email', 'anna@example.org'); set('address', 'Прага, Длоуга 1');
  form.getRadioGroup('attending').select('no'); set('attendReason', 'Работа');
  form.getRadioGroup('lodging').select('yes');
  form.getCheckBox('languages_ru').check(); form.getCheckBox('languages_de').check();
  form.getCheckBox('languages_other').check(); set('languageOther', 'Словацкий');
  form.getCheckBox('format_jwpub').check(); form.getCheckBox('format_pdf').check();
  set('specialNeeds', 'Слуховой аппарат');
  // Внешний вид полей не перестраиваем: стандартный шрифт pdf-lib без
  // кириллицы, а просмотрщику его строит /DR анкеты.
  const filledBytes = await doc.save({ updateFieldAppearances: false });
  const { record } = await PFE.readFilled(filledBytes, S);
  ok('текстовые поля', record.lastName === 'Новак' && record.congregation === 'Прага-Русское' && record.specialNeeds === 'Слуховой аппарат', JSON.stringify(record));
  ok('радиогруппа → ключ варианта', record.attending === 'no' && record.lodging === 'yes' && !record.transport, JSON.stringify(record));
  ok('условное поле', record.attendReason === 'Работа');
  ok('WhatsApp → yes', record.phoneWhatsapp === 'yes');
  ok('несколько языков', JSON.stringify(record.languages) === '["ru","de","other"]' && record.languageOther === 'Словацкий', JSON.stringify(record.languages));
  ok('формат — массив', JSON.stringify(record.format) === '["jwpub","pdf"]', JSON.stringify(record.format));
  ok('подписи языков', S.languageLabels(record).join() === 'Русский,Немецкий,Словацкий', S.languageLabels(record).join());

  // Анкета версии 1: язык — одна радиогруппа `language`.
  const old = await PDFDocument.create();
  const page = old.addPage();
  const oldForm = old.getForm();
  const ln = oldForm.createTextField('lastName'); ln.addToPage(page, { x: 10, y: 700 }); ln.setText('Ким');
  const rg = oldForm.createRadioGroup('language');
  ['ru', 'de'].forEach((v, i) => rg.addOptionToPage(v, page, { x: 10 + i * 30, y: 600 }));
  rg.select('de');
  const legacy = await PFE.readFilled(await old.save({ updateFieldAppearances: false }), S);
  ok('анкета v1: language → languages', JSON.stringify(legacy.record.languages) === '["de"]' && legacy.record.lastName === 'Ким', JSON.stringify(legacy.record));

  const plain = await PDFDocument.create(); plain.addPage();
  const none = await PFE.readFilled(await plain.save(), S);
  ok('в анкете только ru/uk/de + «Другой»', S.LANGUAGE_OPTIONS.join() === 'ru,uk,de,other', S.LANGUAGE_OPTIONS.join());
  ok('PDF без формы распознаётся', none.fields === 0 && none.filled === 0);

  console.log('2. Ответы → карточка пионера');
  const idb = new IDBFactory();
  const ctx = {
    indexedDB: idb, IDBKeyRange, console, Intl, Date, Math, JSON, Promise, Error, setTimeout,
    T: (k, v) => k + (v ? JSON.stringify(v) : ''),
    D: (k) => k,
    PSDocLang: { get: () => 'ru' },
    CWI18n: { lang: 'ru' },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['js/db.js', 'js/modules/history.js', 'js/modules/students.js', 'js/modules/schools.js', 'js/modules/registrationSchema.js', 'js/modules/registration.js']) {
    vm.runInContext(readFileSync(join(PS, f), 'utf8'), ctx, { filename: f });
  }
  await ctx.DB.ready();
  const { Students, Registration } = ctx;
  await Students.getColumns();
  await Students.save({ id: 'st-a', classId: null, values: { lastName: 'Новак', firstName: 'Анна', email: 'old@example.org', phone: '+1' }, origin: 'branchList', status: 'invited', textbookLanguages: ['ru'] });
  await Students.save({ id: 'st-b', classId: null, values: { lastName: 'Ким', firstName: 'Ира' }, origin: 'branchList', status: 'attended', textbookLanguages: ['ru'] });

  const reg1 = await Registration.saveImported({ ...record, lastName: ' НОВАК ', email: '' }, 'novak.pdf');
  ok('регистрация из PDF помечена', reg1.source === 'pdf' && reg1.schemaVersion === 2 && reg1.sourceFile === 'novak.pdf');
  const match = await Registration.findStudentMatch(reg1);
  ok('совпадение по фамилии и имени без учёта регистра', match && match.id === 'st-a');
  const r1 = await Registration.applyToStudent(reg1, match.id);
  const a = (await Students.list()).find((s) => s.id === 'st-a');
  ok('статус и причина из анкеты', a.status === 'wontCome' && a.statusReason === 'Работа', a.status + ' ' + a.statusReason);
  ok('языки → модель пионера', JSON.stringify(a.textbookLanguages) === '["ru","de","Словацкий"]', JSON.stringify(a.textbookLanguages));
  ok('пустой ответ не стирает карточку', a.values.email === 'old@example.org', a.values.email);
  ok('ответ заменяет устаревшее', a.values.phone === '+420 777 000 123' && a.values.phoneWhatsapp === 'yes' && a.values.specialNeeds === 'Слуховой аппарат');
  ok('имя в карточке не переписывается', a.values.lastName === 'Новак');
  ok('регистрация связана с карточкой', reg1.convertedToStudentId === 'st-a');
  ok('без справочника — без предупреждения о собрании', r1.warnings.length === 0, r1.warnings.join());
  const cols = await Students.getColumns();
  ok('столбцы WhatsApp и особых потребностей заведены', cols.some((c) => c.key === 'phoneWhatsapp') && cols.some((c) => c.key === 'specialNeeds'));

  const regB = await Registration.saveImported({ lastName: 'Ким', firstName: 'Ира', attending: 'no', languages: [] }, '');
  const r2 = await Registration.applyToStudent(regB, 'st-b');
  const b = (await Students.list()).find((s) => s.id === 'st-b');
  ok('итог школы анкета не переписывает', b.status === 'attended', b.status);
  ok('без языка — предупреждение, язык карточки сохранён', r2.warnings.some((x) => x.includes('no_language')) && b.textbookLanguages[0] === 'ru', r2.warnings.join());

  const regC = await Registration.saveImported({ lastName: 'Ли', firstName: 'Ян', attending: 'no', languages: ['de'] }, '');
  ok('нового совпадения нет', (await Registration.findStudentMatch(regC)) === null);
  const r3 = await Registration.applyToStudent(regC, null);
  const c = (await Students.list()).find((s) => s.id === r3.student.id);
  ok('новый пионер создан', c && c.values.lastName === 'Ли' && c.textbookLanguages[0] === 'de');
  ok('«не приду» без причины: заглушка + предупреждение', c.status === 'wontCome' && c.statusReason.includes('reason_missing') && r3.warnings.some((x) => x.includes('no_reason')));

  const regD = await Registration.saveImported({ lastName: 'Оль', firstName: 'Ева', language: 'pl' }, '');
  const r4 = await Registration.applyToStudent(regD, null);
  ok('запись v1 (language) → языки', JSON.stringify(r4.student.textbookLanguages) === '["pl"]' && r4.student.status === 'invited');

  const errs = Registration.validate({ lastName: 'A', firstName: 'B', email: 'e', phone: 'p', attending: 'no', attendReason: ' ' });
  ok('ручной ввод: «Нет» без причины отклонён', errs.some((x) => x.includes('enter_reason')), errs.join());

  console.log(fails ? `\nПровалено: ${fails}` : '\nВсе проверки пройдены.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
