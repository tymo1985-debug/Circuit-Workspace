#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-inline-lang-tables.mjs
 *
 * Один вопрос: если в коде модуля лежит таблица, у которой ключами стоят коды
 * языков, перечислены ли в ней ВСЕ языки экосистемы — а если нет, записано ли
 * это как осознанное исключение с причиной.
 *
 * ЗАЧЕМ ЭТА ПРОВЕРКА СУЩЕСТВУЕТ. Класс ошибок сработал дважды подряд и оба раза
 * дошёл до живого прогона. 18.08.2026 немецкий Клиндария объявили готовым по
 * словарям `i18n/dict.js` — носитель закрыл их полностью. Но у модуля есть ещё
 * инлайновые языковые таблицы прямо в `app.js` (`config.monthNames`,
 * `config.dayNames`, `utils.colorName`, `VP_I18N_DICTS`), и немецкого блока не
 * было ни в одной: экран показал «Август 2026» и «Зелёный» посреди немецкого
 * интерфейса. Сверка полноты шла по каталогу `i18n/`, а язык модуля этим
 * каталогом не исчерпывается.
 *
 * ПОЧЕМУ НЕ ЛОВИТСЯ ОСТАЛЬНЫМИ ПРОВЕРКАМИ. `check-i18n-placeholders` и
 * `check-i18n-dupes` работают по файлам словарей — они и не должны знать про
 * литералы в коде. Приложение при этом не падает и в консоли пусто: строка
 * просто уходит человеку на чужом языке. Единственный сигнал — глаз на живом
 * прогоне, то есть последняя линия обороны вместо первой.
 *
 * ЭТАЛОН БЕРЁТСЯ ИЗ КОДА, А НЕ ЗАШИТ ЗДЕСЬ. Список языков читается из `LANGS`
 * в `shared/i18n.js` — единственного места, где он объявлен. Появится шестой
 * язык — проверка сама начнёт требовать его во всех таблицах, и заодно заставит
 * пересмотреть список исключений ниже, а не молча пропустит.
 *
 * ЧТО СЧИТАЕТСЯ ЯЗЫКОВОЙ ТАБЛИЦЕЙ. Объектный литерал, среди ключей которого
 * есть минимум ДВА кода языка. Одного мало: `{ ru: … }` встречается как
 * фрагмент данных, а два подряд — уже намерение перечислить языки.
 *
 * ИСКЛЮЧЕНИЯ. Неполнота бывает осознанной (язык документа ≠ язык интерфейса;
 * список языков ученика — не список локалей). Такие таблицы перечислены в
 * EXCEPTIONS с причиной. Реестр проверяется в обе стороны: если исключение
 * пополнилось до полного состава, проверка потребует убрать запись — иначе
 * реестр за год превращается в свалку, которая гасит настоящие находки.
 *
 *   node scripts/check-inline-lang-tables.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { ancestor } from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Осознанно неполные таблицы: `путь:имя` → причина. */
const EXCEPTIONS = {
  'circuit-planner/app.js:monthNames':
    'немецкий и все следующие языки берутся из Intl (utils._intlNames); свои таблицы ru/uk/en/pl оставлены намеренно — Intl дал бы для pl «pon., wt.» вместо «Pn, Wt»',
  'circuit-planner/app.js:dayNames':
    'то же, что monthNames: недостающий язык закрывает Intl, а не таблица',
  'appointments/js/app.js:DOC_LOCALE':
    'языки ДОКУМЕНТА Назначений — три (DOC_LANGS строкой выше), а не пять языков интерфейса; карта локалей обязана совпадать с DOC_LANGS, а не с интерфейсом',
  'pioneer-school/js/modules/registration.js:LANGUAGE_LABELS':
    'это языки УЧЕНИКА в анкете (ru/uk/pl/de/other), предметные данные, а не локали интерфейса; английского среди них нет намеренно',
  'shared/templates/builtin.js:translations':
    'тексты писем принадлежат пользователю, а не интерфейсу: перевод появляется тогда, когда его написал носитель, и пустой заготовки здесь быть не должно',
};

/** Каталоги, куда смотреть не нужно. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'docs', 'scripts', 'vendor', 'fonts', 'forms']);

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (entry.endsWith('.js') && !entry.endsWith('.min.js')) out.push(full);
  }
  return out;
}

/** Эталонный список языков — из LANGS в shared/i18n.js. */
function ecosystemLangs() {
  const src = readFileSync(join(ROOT, 'shared/i18n.js'), 'utf8');
  const block = src.match(/var LANGS = \[([\s\S]*?)\];/);
  if (!block) {
    console.error('✗ не найден LANGS в shared/i18n.js — эталон языков брать неоткуда');
    process.exit(1);
  }
  const codes = [...block[1].matchAll(/code:\s*'([a-z]{2})'/g)].map((m) => m[1]);
  if (codes.length < 2) {
    console.error('✗ в LANGS меньше двух языков — похоже, изменился формат объявления');
    process.exit(1);
  }
  return codes;
}

/** Имя таблицы = имя переменной или свойства, в котором лежит литерал. */
function tableName(ancestors) {
  for (let i = ancestors.length - 2; i >= 0; i--) {
    const node = ancestors[i];
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') return node.id.name;
    if (node.type === 'Property' && !node.computed) return node.key.name || String(node.key.value);
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.property) {
      return node.left.property.name || String(node.left.property.value);
    }
    if (node.type === 'ReturnStatement') continue;
    if (node.type === 'ObjectExpression') break; // вложенный литерал: имя даст внешний
  }
  return null;
}

const LANGS = ecosystemLangs();
const problems = [];
const findings = [];
const hitExceptions = new Set();
let tables = 0;

for (const file of collect(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const src = readFileSync(file, 'utf8');
  let ast = null;
  for (const sourceType of ['script', 'module']) {
    try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType, locations: true }); break; } catch { /* пробуем другой режим */ }
  }
  if (!ast) {
    problems.push({ rel, line: 0, name: '—', text: 'файл не разобрался ни как script, ни как module' });
    continue;
  }

  ancestor(ast, {
    ObjectExpression(node, _state, ancestors) {
      const keys = node.properties
        .filter((p) => p.type === 'Property' && !p.computed)
        .map((p) => p.key.name ?? p.key.value);
      const present = LANGS.filter((code) => keys.includes(code));
      if (present.length < 2) return;
      tables++;
      const missing = LANGS.filter((code) => !present.includes(code));
      const name = tableName(ancestors) || `(без имени, строка ${node.loc.start.line})`;
      // Одно имя может встретиться в файле несколько раз (в builtin.js
      // `translations` есть у каждого шаблона, и полнота у них разная).
      // Поэтому решение принимается не здесь, а после обхода — по всем
      // вхождениям сразу, иначе полное вхождение объявляло бы исключение
      // устаревшим, пока рядом живёт неполное.
      if (missing.length === 0) return;
      const id = `${rel}:${name}`;
      findings.push({
        id, rel, line: node.loc.start.line, name,
        text: `нет языков: ${missing.join(', ')} (есть: ${present.join(', ')})`,
      });
    },
  });
}

for (const f of findings) {
  if (EXCEPTIONS[f.id]) { hitExceptions.add(f.id); continue; }
  problems.push(f);
}

for (const id of Object.keys(EXCEPTIONS)) {
  if (!hitExceptions.has(id)) {
    const [rel, name] = [id.slice(0, id.lastIndexOf(':')), id.slice(id.lastIndexOf(':') + 1)];
    problems.push({ rel, line: 0, name, text: 'исключение записано, а неполной таблицы с таким именем в коде нет — запись устарела, убрать из EXCEPTIONS' });
  }
}

console.log(`Языки экосистемы (shared/i18n.js): ${LANGS.join(', ')}`);
console.log(`Языковых таблиц в коде модулей: ${tables}; осознанных исключений: ${Object.keys(EXCEPTIONS).length}`);

if (problems.length) {
  console.error('\n✗ Языковые таблицы в коде неполны:\n');
  for (const p of problems) console.error(`  ${p.rel}${p.line ? ':' + p.line : ''} → ${p.name}\n      ${p.text}`);
  console.error('\nЛибо дописать недостающий язык (текст пишет носитель), либо добавить запись в EXCEPTIONS с причиной.');
  process.exit(1);
}

console.log('\n✓ Все языковые таблицы в коде модулей полны или объявлены исключениями.');
