// Регрессия по языку документа Школы пионеров (shared/doclang.js).
//
// ЗАПУСК из корня монорепо:
//   npm install jsdom jspdf
//   node scripts/check-doclang.mjs
//
// ЗАЧЕМ. Задача «подключить модуль к языку документа» выглядит как перенос
// строк в словарь, но три вещи в ней ломаются молча, без единой ошибки:
//
//  1. jsPDF обрезает ВЕСЬ вызов text() на первом символе вне встроенного
//     шрифта. До пересборки субсета «Grüße Straße Übung» превращалось в «Gr»,
//     а «Szkoła» — в «Szkoa». Проверка §9 собирает настоящий PDF и вычитывает
//     из него текст обратно: измерять ширину глифов бесполезно, jsPDF отдаёт
//     для отсутствующего глифа обычную ширину (проверено).
//  2. Схема анкеты, собранная как обычный массив, застывает на языке, который
//     был при загрузке скрипта. Проверка §2 меняет язык на лету.
//  3. Непереведённый язык обязан отдавать русский ТЕКСТ, а не имя ключа,
//     иначе анкета уходит пионеру набором doc.ps.*. Проверка §2.
//
// Пути — от корня монорепо, как в scripts/check-versions.mjs.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import vm from 'node:vm';

const ROOT = '.';
const PS = './pioneer-school';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
};

function makeEnv({ uiLang = null, docLang = null, search = '' } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/pioneer-school/index.html' + search });
  const store = {};
  if (uiLang) store['cw-lang'] = uiLang;
  if (docLang) store['cw-doclang:pioneer-school'] = docLang;
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
  });
  const ctx = vm.createContext(w);
  ctx.self = w; ctx.console = console;
  const run = (file) => vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: file });
  run(ROOT + '/shared/i18n.js');
  run(ROOT + '/shared/doclang.js');
  run(PS + '/i18n/doc.js');
  run(PS + '/js/doclang.js');
  run(PS + '/js/modules/registrationSchema.js');
  return { ctx, run, store, window: w };
}

console.log('\n1. Разрешение языка документа');
{
  const { ctx } = makeEnv();
  ctx.PSDocLang.init();
  ok('без настроек — русский', ctx.PSDocLang.get() === 'ru', ctx.PSDocLang.get());
}
{
  const { ctx } = makeEnv({ docLang: 'pl' });
  ctx.PSDocLang.init();
  ok('свой ключ модуля выигрывает', ctx.PSDocLang.get() === 'pl', ctx.PSDocLang.get());
}
{
  // Язык интерфейса не должен влиять на язык документа НИГДЕ.
  const { ctx } = makeEnv({ uiLang: 'de' });
  ctx.PSDocLang.init();
  ok('язык интерфейса de не двигает документ', ctx.PSDocLang.get() === 'ru', ctx.PSDocLang.get());
}
{
  const { ctx } = makeEnv({ docLang: 'uk', search: '?lang=pl' });
  ctx.PSDocLang.init({ allowUrlOverride: true });
  ok('?lang= перебивает сохранённый выбор', ctx.PSDocLang.get() === 'pl', ctx.PSDocLang.get());
}
{
  const { ctx, store } = makeEnv({ docLang: 'uk', search: '?lang=pl' });
  ctx.PSDocLang.init({ allowUrlOverride: true });
  ok('?lang= НЕ пишется в хранилище', store['cw-doclang:pioneer-school'] === 'uk', store['cw-doclang:pioneer-school']);
}
{
  const { ctx } = makeEnv({ search: '?lang=zz' });
  ctx.PSDocLang.init({ allowUrlOverride: true });
  ok('мусор в ?lang= игнорируется', ctx.PSDocLang.get() === 'ru', ctx.PSDocLang.get());
}
{
  const { ctx } = makeEnv({ docLang: 'pl', search: '?lang=de' });
  ctx.PSDocLang.init(); // без allowUrlOverride — приложение
  ok('в приложении ?lang= не действует', ctx.PSDocLang.get() === 'pl', ctx.PSDocLang.get());
}

console.log('\n2. Схема анкеты следует языку документа');
{
  const { ctx } = makeEnv();
  ctx.PSDocLang.init();
  const s = ctx.RegistrationSchema;
  ok('раздел 1 по-русски', s.sections[0].title === '1. Личные данные', s.sections[0].title);
  ok('подпись Да', s.labelForValue('attending', 'yes') === 'Да');
  ok('ключи опций не переведены', s.fieldByKey('attending').options.map((o) => o.value).join() === 'yes,no');
  ok('ключи формата не переведены', s.fieldByKey('format').options.map((o) => o.value).join() === 'print,jwpub,pdf,epub');
  ok('closingText — текст, а не ключ', s.closingText.startsWith('Пожалуйста, заполните и отправьте'));
}
{
  // Непереведённый язык обязан отдавать РУССКИЙ ТЕКСТ, а не имя ключа:
  // иначе польская анкета вышла бы набором doc.ps.*.
  const { ctx } = makeEnv({ docLang: 'pl' });
  ctx.PSDocLang.init();
  const s = ctx.RegistrationSchema;
  ok('pl без перевода → русский текст, не ключ', s.sections[0].title === '1. Личные данные', s.sections[0].title);
  ok('pl помечен как непереведённый', ctx.PSDocLang.isTranslated('pl') === false);
  ok('ru помечен как переведённый', ctx.PSDocLang.isTranslated('ru') === true);
}
{
  // Ловушка «застывшего массива»: sections должен пересчитываться.
  const { ctx } = makeEnv();
  ctx.PSDocLang.init();
  const before = ctx.RegistrationSchema.sections[0].title;
  ctx.CWI18n.register({ pl: { 'doc.ps.reg.section.personal': '1. Dane osobowe' } });
  ctx.PSDocLang.set('pl', { scope: 'module' });
  const after = ctx.RegistrationSchema.sections[0].title;
  ok('sections пересчитывается после смены языка', before !== after && after === '1. Dane osobowe', `${before} → ${after}`);
}

console.log('\n3. Дата в языке документа');
{
  const cases = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL', de: 'de-DE' };
  for (const [code, locale] of Object.entries(cases)) {
    const { ctx } = makeEnv({ docLang: code });
    ctx.PSDocLang.init();
    const got = ctx.PSDocLang.date('2026-03-12');
    const want = new Date('2026-03-12').toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    ok(`дата ${code} → ${locale}`, got === want, `${got} ≠ ${want}`);
  }
  const { ctx } = makeEnv();
  ctx.PSDocLang.init();
  ok('пустая дата — пустая строка', ctx.PSDocLang.date('') === '' && ctx.PSDocLang.date(null) === '');
}

console.log('\n4. Шрифт и санитайзер PDF');
{
  const pdfSrc = readFileSync(PS + '/js/export/pdfExport.js', 'utf8');
  const m = pdfSrc.match(/_sanitizeForFont\(str\) \{\s*return String\(str \?\? ''\)\.replace\((\/\[\^[^/]+\/g), '-'\);/);
  ok('регулярка санитайзера найдена', !!m);
  const re = new RegExp(m[1].slice(1, -2), 'g');
  const sanitize = (s) => String(s).replace(re, '-');
  const probes = 'łżąęśćńóźäöüßÄÖÜéàçñ';
  ok('латинские диакритики проходят санитайзер', sanitize(probes) === probes, sanitize(probes));
  ok('кириллица и uk проходят', sanitize('Школа піонерського служіння ґ') === 'Школа піонерського служіння ґ');
  ok('№ « » — … проходят', sanitize('№ «…» —') === '№ «…» —');
  ok('emoji и стрелки по-прежнему режутся', sanitize('a🙂b→c') === 'a--b-c', sanitize('a🙂b→c'));

  // Каждый символ русской колонки словаря документов обязан быть в шрифте:
  // иначе jsPDF молча обрежет всю строку.
  const { ctx } = makeEnv();
  const b64 = readFileSync(PS + '/js/export/fonts/dejavu-sans-subset.js', 'utf8').match(/[A-Za-z0-9+/=]{500,}/)[0];
  ok('субсет шрифта не пустой', b64.length > 10000);
  const docSrc = readFileSync(PS + '/i18n/doc.js', 'utf8');
  const strings = [...docSrc.matchAll(/':\s*'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]);
  // Порог — страховка от «парсер ничего не нашёл и проверка вхолостую
  // прошла», а не смысловое правило: точное число строк меняется при каждой
  // правке текстов. 09.08.2026 словарь легально похудел со 152 до 140 строк
  // — двенадцать дублей doc.ps.blank.* сведены с doc.ps.reg.*, поэтому
  // прежний порог 150 пришлось опустить. Опускать его дальше без такой же
  // причины нельзя: смысл порога в том, чтобы падать, если разбор сломался.
  ok('строк словаря найдено', strings.length > 120, String(strings.length));
  const bad = new Set();
  for (const s of strings) for (const ch of s) if (sanitize(ch) !== ch) bad.add(ch);
  ok('ни один символ словаря не режется санитайзером', bad.size === 0, [...bad].join(' '));
}

console.log('\n5. Разметка register.html');
{
  const html = readFileSync(PS + '/register.html', 'utf8');
  const { ctx } = makeEnv();
  ctx.PSDocLang.init();
  const keys = [...html.matchAll(/data-doc-i18n(?:-placeholder|-title)?="([^"]+)"/g)].map((m) => m[1]);
  ok('атрибуты языка документа расставлены', keys.length >= 25, String(keys.length));
  const missing = keys.filter((k) => ctx.CWI18n.t(k) === k);
  ok('все ключи разметки есть в словаре', missing.length === 0, missing.join(', '));
  ok('registration.js больше не подключается', !/src="js\/modules\/registration\.js"/.test(html));
  ok('схема анкеты подключается', /src="js\/modules\/registrationSchema\.js"/.test(html));
  ok('слои языка документа подключены',
    /shared\/i18n\.js/.test(html) && /shared\/doclang\.js/.test(html) && /i18n\/doc\.js/.test(html) && /js\/doclang\.js/.test(html));
  ok('в разметке не осталось Registration.*_LABELS', !/Registration\.[A-Z_]+_LABELS/.test(html));
}

console.log('\n6. Живой прогон публичной страницы');
{
  const html = readFileSync(PS + '/register.html', 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.test/pioneer-school/register.html?lang=pl' });
  const w = dom.window;
  const ctx = vm.createContext(w);
  ctx.self = w; ctx.console = { log() {}, warn() {}, error() {} };
  const run = (f) => vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
  run(ROOT + '/shared/i18n.js');
  run(ROOT + '/shared/doclang.js');
  run(PS + '/i18n/doc.js');
  run(PS + '/js/doclang.js');
  run(PS + '/js/modules/registrationSchema.js');
  ctx.PSDocLang.init({ allowUrlOverride: true });
  ctx.PSDocLang.applyDoc();
  const title = w.document.getElementById('page-title').textContent;
  ok('заголовок переведён через applyDoc', title === 'Формуляр для Школы пионерского служения', title);
  const legend = w.document.querySelector('legend');
  ok('легенда раздела на месте', legend.textContent === '1. Личные данные', legend.textContent);
  ok('язык страницы выставлен по ?lang=', w.document.documentElement.lang === 'pl', w.document.documentElement.lang);
}

console.log('\n7. Прежний баг публичной страницы: T is not defined');
{
  const w = new JSDOM('<!doctype html>').window;
  const ctx = vm.createContext(w);
  ctx.self = w; ctx.console = console;
  let threw = null;
  try { vm.runInContext(readFileSync(PS + '/js/modules/registration.js', 'utf8'), ctx, { filename: 'registration.js' }); }
  catch (e) { threw = e; }
  ok('registration.js грузится без T()', threw === null, threw && threw.message);
  ok('Registration определён', typeof ctx.Registration === 'object');
  // Суть правки: справочники стали ГЕТТЕРАМИ, поэтому T() зовётся при
  // обращении, а не при загрузке файла — и следует текущему языку интерфейса.
  const desc = Object.getOwnPropertyDescriptor(ctx.Registration, 'YES_NO_LABELS');
  ok('YES_NO_LABELS — геттер, а не статическое поле', typeof desc.get === 'function' && desc.value === undefined);
  ctx.T = (key) => ({ 'ps.ui.da': 'Ja', 'ps.ui.net': 'Nein' }[key] || key);
  ok('геттер берёт перевод в момент обращения', ctx.Registration.YES_NO_LABELS.yes === 'Ja');
  ctx.T = (key) => ({ 'ps.ui.da': 'Tak', 'ps.ui.net': 'Nie' }[key] || key);
  ok('смена языка интерфейса доходит до справочника', ctx.Registration.YES_NO_LABELS.yes === 'Tak');
}

console.log('\n8. В генераторах не осталось захардкоженных строк документов');
{
  for (const f of ['js/export/pdfExport.js', 'js/export/pdfFormExport.js', 'js/export/excelExport.js', 'js/modules/registrationSchema.js']) {
    const src = readFileSync(PS + '/' + f, 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const lits = [...code.matchAll(/(['"])((?:(?!\1)[^\\\n]|\\.)*?[А-Яа-яЁё](?:(?!\1)[^\\\n]|\\.)*?)\1/g)].map((m) => m[2]);
    const allowed = (s) => /Не удалось|не загруз|обновите страницу|Проверьте подключение/i.test(s);
    const left = lits.filter((s) => !allowed(s));
    ok(`${f} — без документных литералов`, left.length === 0, left.slice(0, 4).join(' | '));
  }
}

console.log('\n9. Сквозная проверка PDF: текст доезжает до файла');
{
  // ЕДИНСТВЕННЫЙ надёжный способ поймать обрезание jsPDF — посчитать глифы в
  // готовом потоке страницы. Ширина глифа тут бесполезна: для отсутствующего
  // символа jsPDF отдаёт обычную ширину (проверено, контрольный прогон на
  // старом шрифте её не ловил). А в потоке текст лежит как <hex> Tj, где на
  // каждый символ ровно четыре шестнадцатеричные цифры — недостача видна сразу.
  //
  // Для справки, что ловила эта проверка до пересборки субсета:
  //   «Grüße Straße Übung» → 2 глифа из 18 (вся строка обрывалась на ü)
  //   «Szkoła zgłoszenie ćwiczenia» → 24 из 27
  //   «Школа № 12» → 9 из 10 (пропадал №)
  const { jsPDF } = await import('jspdf');
  const b64 = readFileSync(PS + '/js/export/fonts/dejavu-sans-subset.js', 'utf8').match(/[A-Za-z0-9+/=]{500,}/)[0];
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.addFileToVFS('DejaVuSans.ttf', b64);
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  doc.setFont('DejaVuSans');
  doc.setFontSize(12);

  const probes = [
    'Szkoła zgłoszenie ćwiczenia ąęśńóźż',
    'Grüße Straße Übung Änderung Öl',
    'Школа пионерского служения № 12',
    'Школа піонерського служіння ґанок єдність',
    'Pioneer School registration form',
    '«Цитата» — многоточие… и тире',
  ];
  let y = 50;
  probes.forEach((t) => { doc.text(t, 40, y); y += 24; });
  const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  const runs = [...raw.matchAll(/<([0-9A-Fa-f]{4,})>\s*Tj/g)].map((m) => m[1].length / 4);

  ok('строк в потоке PDF столько же, сколько отрисовано', runs.length === probes.length, `${runs.length} ≠ ${probes.length}`);
  probes.forEach((t, i) => {
    ok(`строка ${i + 1} не потеряла ни символа`, runs[i] === t.length, `${runs[i]} из ${t.length} — «${t.slice(0, 28)}…»`);
  });

  // Весь русский словарь целиком — не только контрольные фразы.
  const docSrc2 = readFileSync(PS + '/i18n/doc.js', 'utf8');
  const all = [...docSrc2.matchAll(/':\s*'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]).filter((x) => x.length);
  const doc2 = new jsPDF({ unit: 'pt', format: 'a4' });
  doc2.addFileToVFS('DejaVuSans.ttf', b64);
  doc2.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  doc2.setFont('DejaVuSans');
  doc2.setFontSize(8);
  all.forEach((t, i) => { if (i % 90 === 0) doc2.addPage(); doc2.text(t, 20, 20 + (i % 90) * 9); });
  const raw2 = Buffer.from(doc2.output('arraybuffer')).toString('latin1');
  const runs2 = [...raw2.matchAll(/<([0-9A-Fa-f]{4,})>\s*Tj/g)].map((m) => m[1].length / 4);
  const lost = all.map((t, i) => [t, runs2[i]]).filter(([t, n]) => n !== t.length);
  ok('весь словарь документов проходит в PDF без потерь', lost.length === 0,
    lost.slice(0, 3).map(([t, n]) => `${n}/${t.length} «${t.slice(0, 30)}»`).join(' | '));
}

console.log(`\nИтого: ${pass} пройдено, ${fail} провалено\n`);
process.exit(fail ? 1 : 0);
