#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-pioneer-blank.mjs
 *
 * Печатный бланк регистрации Школы пионеров собирается ИЗ СХЕМЫ анкеты
 * (RegistrationSchema + раскладочные подсказки `pdf`) с 18.11.2026.
 *
 * Что ловит:
 *  1) поле или вариант, добавленные в схему, не дошли до бумаги — бланк снова
 *     разошёлся бы с онлайн-формой и интерактивным PDF;
 *  2) пропала линия ответа у «Другой: ____» (до Ф2 немецкая подпись съедала
 *     всё место, и поле для ответа исчезало молча) — в том числе при
 *     нарочно длинной подписи;
 *  3) текстовое поле, раскрываемое вариантом, напечатано ещё и отдельно.
 *
 * Отрисовка снимается подменой jsPDF записывающей обёрткой; метрики текста —
 * от настоящего jsPDF (Helvetica): проверяются связи, а не точные пункты.
 *
 *   node scripts/check-pioneer-blank.mjs
 */
import { JSDOM } from 'jsdom';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
};

async function render(lang, override = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { runScripts: 'outside-only', url: 'https://example.test/pioneer-school/index.html' });
  const w = dom.window, c = dom.getInternalVMContext();
  const store = { 'cw-doclang:pioneer-school': lang };
  Object.defineProperty(w, 'localStorage', { configurable: true, value: {
    getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
  const run = (f) => vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
  ['shared/i18n.js', 'shared/doclang.js', 'pioneer-school/i18n/doc.js', 'pioneer-school/js/doclang.js',
    'pioneer-school/js/modules/registrationSchema.js', 'pioneer-school/js/export/pdfExport.js'].forEach(run);
  w.PSDocLang.init();
  if (Object.keys(override).length) {
    const D0 = w.D;
    w.D = (k, ...a) => (k in override ? override[k] : D0(k, ...a));
  }
  const log = [];
  class Fake {
    constructor() { this.real = new jsPDF({ unit: 'pt', format: 'a4' }); this.internal = this.real.internal; }
    setFontSize(s) { this.real.setFontSize(s); }
    getTextWidth(t) { return this.real.getTextWidth(t); }
    splitTextToSize(t, m) { return this.real.splitTextToSize(t, m); }
  }
  for (const m of ['setFont', 'setTextColor', 'setDrawColor', 'text', 'line', 'rect', 'addPage', 'save']) {
    Fake.prototype[m] = function (...a) { log.push([m, ...a]); };
  }
  w.jspdf = { jsPDF: Fake };
  w.PdfExport._ensureCyrillicFont = () => {};
  await w.PdfExport.downloadRegistrationBlankForm({ title: 'T' });
  const san = (s) => w.PdfExport._sanitizeForFont(s);
  const texts = log.filter((e) => e[0] === 'text').map((e) => ({ s: [].concat(e[1]).join(' '), x: e[2], y: e[3] }));
  return { w, log, texts, san };
}

const has = (texts, s) => texts.some((t) => t.s.replace(/\s+/g, ' ').includes(s.replace(/\s+/g, ' ')));
const exact = (texts, s) => texts.some((t) => t.s === s);
const firstWords = (s) => s.split(/\s+/).slice(0, 2).join(' ');

for (const lang of ['ru', 'uk', 'en', 'pl', 'de']) {
  console.log('\n' + lang);
  const { w, log, texts, san } = await render(lang);
  const S = w.RegistrationSchema;
  const missing = [];
  S.sections.forEach((sec) => {
    if (!has(texts, san(sec.heading))) missing.push('раздел ' + sec.id);
    sec.fields.forEach((f) => {
      const opener = f.type === 'text' && f.showIf && sec.fields.some((g) => g.key === f.showIf.field && g.type === 'checkboxes');
      if (opener) return;
      const label = san((f.pdf && f.pdf.label) || f.label);
      // Подпись галочки — отдельный текст целиком (иначе «WhatsApp» нашёлся бы
      // в строке «- WhatsApp: …» внизу бланка); длинная подпись вопроса
      // переносится строками — у неё сверяем начало.
      const found = f.type === 'check' ? exact(texts, label) : has(texts, firstWords(label));
      if (!found) missing.push('поле ' + f.key);
      (f.options || []).forEach((o) => {
        // Вариант, раскрывающий поле, печатается своим рядом с двоеточием.
        const opens = sec.fields.some((g) => g.showIf && g.showIf.field === f.key && g.showIf.includes === o.value);
        if (!exact(texts, san((o.pdfLabel || o.label) + (opens ? ':' : '')))) missing.push(f.key + '=' + o.value);
      });
    });
  });
  ok('все разделы, поля и варианты схемы на бумаге', !missing.length, missing.join(', '));

  const other = S.fieldByKey('languageOther');
  ok('раскрываемое поле не напечатано отдельной подписью', !has(texts, san(other.label)));

  const otherLabel = san(S.labelForValue('languages', 'other') + ':');
  const row = texts.find((t) => t.s === otherLabel);
  const line = row && log.find((e) => e[0] === 'line' && e[2] === row.y + 2 && e[1] > row.x);
  ok('у «' + otherLabel + '» есть линия для ответа', !!line);
}

console.log('\nДлинная подпись «Другой»');
{
  const long = 'Andere Sprache, bitte unten angeben';
  const { log, texts } = await render('de', { 'doc.ps.reg.opt.lang.other': long });
  const row = texts.find((t) => t.s === long + ':');
  const line = row && log.find((e) => e[0] === 'line' && e[2] === row.y + 2);
  ok('линия ответа рисуется и при длинном переводе', !!line && line[3] - line[1] > 100,
    line ? 'длина ' + Math.round(line[3] - line[1]) : 'линии нет');
}

console.log(`\n${pass} ✓, ${fail} ✗`);
process.exit(fail ? 1 : 0);
