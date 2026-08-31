#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-tracts.mjs
 *
 * Живой прогон ПЯТИ ТРАКТОВ ВЫДАЧИ БУМАГ Школы пионеров в Chromium.
 * НЕ ВХОДИТ В ГЕЙТ — как и остальные live-*.mjs: `check-all.mjs` обязан
 * работать на машине без браузера.
 *
 * ─── ЗАЧЕМ ─────────────────────────────────────────────────────────────────
 *
 * 30.08.2026 (находка N-3) ПДФ/Excel-стек Школы переведён на догрузку по
 * требованию. Статика проверяет связи — что файл лежит в прекэше, что он не
 * вернулся в разметку, что перед сборщиком стоит `ensure()`. Чего она не
 * видит: действительно ли после `ensure()` собирается НАСТОЯЩАЯ бумага.
 *
 * «Объект загрузился» ничего не значит. Здесь каждый тракт доводится до
 * готового документа, а содержимое снимается на входе — оборачиванием
 * КОНСТРУКТОРА jsPDF. Прочитать текст из готового PDF нельзя: со субсеченным
 * шрифтом в потоке лежат индексы глифов, а не буквы. Патчить прототип или
 * `jsPDF.API` бесполезно — методы висят на экземпляре.
 *
 * ─── ЗАПУСК ────────────────────────────────────────────────────────────────
 *
 *     npm i playwright-core
 *     CHROME_PATH=/opt/pw-browsers/chromium-*\/chrome-linux/chrome \
 *       node scripts/live-tracts.mjs
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PORT = 8141;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  \u2713 ' + label); return; }
  failed++;
  console.log('  \u2717 ' + label + (extra === undefined ? '' : '\n      ' + extra));
};

await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--proxy-bypass-list=<-loopback>'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`http://127.0.0.1:${PORT}/pioneer-school/`, { waitUntil: 'networkidle', timeout: 20000 });

/* --- 1. Холодный старт: тяжёлого стека в странице нет -------------------- */
console.log('\n1. Холодный старт Школы');
const cold = await page.evaluate(() => {
  const scripts = performance.getEntriesByType('resource')
    .filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js'));
  return {
    bytes: scripts.reduce((s, r) => s + (r.decodedBodySize || 0), 0),
    count: scripts.length,
    globals: ['jspdf', 'pdfjsLib', 'XLSX', 'PDFLib', 'fontkit',
      'PdfExport', 'PdfImport', 'PdfFormExport', 'XlsxExport',
      'PDF_FONT_DEJAVU_SANS', 'PDF_FORM_FONT_B64']
      .filter((n) => typeof window[n] !== 'undefined'),
    loader: typeof window.CWPdfStack !== 'undefined' && typeof window.PSPdf !== 'undefined',
  };
});
console.log('  · JS на холодный старт: ' + Math.round(cold.bytes / 1024) + ' КБ в '
  + cold.count + ' файлах');
ok('ни одного имени ПДФ/Excel-стека до нажатия кнопки', cold.globals.length === 0,
  'нашлись: ' + cold.globals.join(', '));
ok('загрузчик на месте', cold.loader);

/* --- 2. Наборы догружаются и не грузятся дважды -------------------------- */
console.log('\n2. Догрузка наборов');
for (const [kind, names] of Object.entries({
  pdf: ['jspdf', 'PDF_FONT_DEJAVU_SANS', 'PdfExport'],
  import: ['pdfjsLib', 'PdfImport'],
  excel: ['XLSX', 'XlsxExport'],
  form: ['PDFLib', 'fontkit', 'PDF_FORM_FONT_B64', 'PdfFormExport'],
})) {
  const r = await page.evaluate(async ([k, ns]) => {
    const before = document.querySelectorAll('script').length;
    const okFirst = await window.PSPdf.ensure(k);
    const missing = ns.filter((n) => typeof window[n] === 'undefined');
    const mid = document.querySelectorAll('script').length;
    await window.PSPdf.ensure(k);           // второй раз — ничего нового
    const after = document.querySelectorAll('script').length;
    return { okFirst, missing, added: mid - before, addedTwice: after - mid };
  }, [kind, names]);
  ok('набор «' + kind + '» подготовлен', r.okFirst && r.missing.length === 0,
    'не появилось: ' + r.missing.join(', '));
  ok('набор «' + kind + '»: повторный ensure() не грузит заново', r.addedTwice === 0,
    'добавлено тегов: ' + r.addedTwice);
}

/* --- 3. Пять трактов доводятся до настоящей бумаги ------------------------ */
console.log('\n3. Тракты выдачи');

/* Перехват КОНСТРУКТОРА, а не прототипа: методы висят на экземпляре. */
await page.evaluate(() => {
  window.__drawn = [];
  window.__saved = [];
  const Orig = window.jspdf.jsPDF;
  window.jspdf.jsPDF = function (...a) {
    const i = new Orig(...a);
    const text = i.text.bind(i);
    i.text = (t, x, y, opt) => { window.__drawn.push(String(t)); return text(t, x, y, opt); };
    const save = i.save.bind(i);
    /* Только save(): он пишет файл на диск, а в прогоне это не нужно.
       output() НЕ трогаем — им тракт импорта делает себе тестовый PDF.
       Прототип здесь бесполезен (методы висят на экземпляре), поэтому
       первая редакция перехвата с `Orig.prototype.output.call` падала. */
    i.save = (name) => { window.__saved.push(name); return save; };
    return i;
  };
  /* Анкета pdf-lib и .xlsx уходят не через jsPDF. */
  window.__blobs = [];
  const origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { window.__blobs.push(b.size || 0); return origCreate(b); };
  const origWrite = window.XLSX.writeFile;
  window.XLSX.writeFile = (wb, name) => { window.__saved.push(name); window.__xlsx = wb; };
});

/* Тракт 1 — письмо учащемуся. */
const letter = await page.evaluate(() => {
  window.__drawn = [];
  const doc = window.PdfExport.buildLetterDoc({
    title: 'Priglashenie', body: 'Dorogi brat!\n\nShkola nachnetsya v mae.',
  });
  return { pages: doc.internal.getNumberOfPages(), drawn: window.__drawn.join(' ') };
});
ok('письмо: документ собран', letter.pages >= 1);
ok('письмо: текст дошёл до бумаги', letter.drawn.includes('Priglashenie')
  && letter.drawn.includes('Shkola'), letter.drawn.slice(0, 120));

/* Тракт 2 — печатный бланк регистрации. */
const blank = await page.evaluate(async () => {
  window.__drawn = []; window.__saved = [];
  await window.PdfExport.downloadRegistrationBlankForm({ title: 'Blank Shkoly' });
  return { drawn: window.__drawn.join(' '), saved: window.__saved.slice() };
});
ok('печатный бланк: файл сохранён', blank.saved.length === 1, blank.saved.join(','));
ok('печатный бланк: заголовок на бумаге', blank.drawn.includes('Blank'), blank.drawn.slice(0, 120));

/* Тракт 3 — список учащихся (canvas-растр, текст в PDF идёт картинкой). */
const list = await page.evaluate(async () => {
  window.__saved = [];
  await window.PdfExport.downloadStudentList(
    [{ id: 's1', classId: 'c1', values: { name: 'Ivanov' } }],
    [{ key: 'name', label: 'Familiya' }],
    { c1: { id: 'c1', name: 'Klass A' } });
  return window.__saved.slice();
});
ok('список учащихся: файл сохранён', list.length === 1, list.join(','));

/* Тракт 4 — экспорт .xlsx. */
const xlsx = await page.evaluate(() => {
  window.__saved = []; window.__xlsx = null;
  window.XlsxExport.downloadStudents(
    [{ id: 's1', classId: 'c1', values: { name: 'Ivanov' } }],
    [{ key: 'name', label: 'Familiya' }],
    { c1: { id: 'c1', name: 'Klass A' } });
  const wb = window.__xlsx;
  const sheet = wb && wb.Sheets[wb.SheetNames[0]];
  return { saved: window.__saved.slice(), a1: sheet && sheet.A1 && sheet.A1.v, a2: sheet && sheet.A2 && sheet.A2.v };
});
ok('экспорт .xlsx: файл сохранён', xlsx.saved.length === 1, xlsx.saved.join(','));
ok('экспорт .xlsx: строки собраны через ExcelExport', xlsx.a1 === 'Familiya' && xlsx.a2 === 'Ivanov',
  'A1=' + xlsx.a1 + ' A2=' + xlsx.a2);

/* Тракт 5 — интерактивная анкета (pdf-lib, AcroForm). */
const form = await page.evaluate(async () => {
  window.__blobs = [];
  await window.PdfFormExport.download({ title: 'Anketa' }, window.RegistrationSchema);
  return window.__blobs.slice();
});
ok('интерактивная анкета: PDF собран', form.length >= 1 && form[0] > 20000,
  'размер блоба: ' + form.join(','));

/* Тракт 6 (сверх пяти) — импорт PDF: собственный документ читается обратно. */
const imported = await page.evaluate(async () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFontSize(11);
  doc.text('Familiya Imya', 40, 60);
  doc.text('Ivanov Ivan', 40, 80);
  const buf = doc.output('arraybuffer');
  const file = new File([buf], 'test.pdf', { type: 'application/pdf' });
  const res = await window.PdfImport.extractTable(file);
  return { headers: res.headers, rows: res.rows.length };
});
ok('импорт PDF: документ разобран', imported.headers.length > 0,
  'заголовков: ' + JSON.stringify(imported.headers));

/* --- 4. Кнопка целиком, от клика до файла -------------------------------- */
console.log('\n4. Сквозной клик по кнопке');
const click = await page.evaluate(async () => {
  window.__saved = [];
  /* Кнопка живёт в модальном окне выбора столбцов, а не в стартовой
     разметке: сначала открываем окно, иначе проверка молча не находит
     элемент и «проходит» на пустом месте. */
  await window.openExportPicker();
  await new Promise((r) => setTimeout(r, 200));
  const btn = document.getElementById('export-do-xlsx');
  if (!btn) return { found: false };
  btn.click();
  await new Promise((r) => setTimeout(r, 800));
  return { found: true, saved: window.__saved.slice() };
});
ok('#export-do-xlsx доводит до файла', click.found && click.saved.length === 1,
  JSON.stringify(click));

console.log('\n5. Консоль');
ok('ни одной ошибки за весь прогон', errors.length === 0, errors.slice(0, 5).join('\n      '));

await browser.close();
server.close();

console.log(failed
  ? `\nПРОВАЛЕНО проверок: ${failed}`
  : '\nВсе тракты выдачи доведены до настоящей бумаги.');
process.exit(failed ? 1 : 0);
