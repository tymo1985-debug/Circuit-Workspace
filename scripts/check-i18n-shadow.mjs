// Затенение функции перевода t() локальной переменной задачи.
//
// ЗАПУСК из корня монорепо:
//   npm install acorn acorn-walk
//   node scripts/check-i18n-shadow.mjs
//
// ЗАЧЕМ. В Конгрессах функция перевода импортируется как `t`, а переменная
// задачи в коллбэках исторически тоже называется `t`. Там, где они встречаются
// в одной области видимости, `t("cong.…")` вызывает ОБЪЕКТ задания —
// `TypeError: t is not a function`, и весь экран не открывается.
//
// Класс багов рецидивирующий, поэтому у него своя проверка:
//   render.js и tasks.js — поймано при локализации (обошли псевдонимом tr_);
//   letters.js — НЕ поймано: `openLettersMode()` падал целиком, то есть кнопка
//   «Письма» не открывала ничего. Прожило от v4.19.0 до 14.08.2026, потому что
//   статический разбор такое не видит, а `check-all.mjs` страницу не открывает.
//
// ПОЧЕМУ НЕ grep. Наивный поиск даёт ложные срабатывания: в `plan.js` есть и
// `c.tasks.map(t => …)`, и законный `t("cong.alert.column_required")` — но во
// втором случае вызов стоит в другой функции, где `t` не затенён. Отличить их
// можно только по области видимости, поэтому здесь acorn: правило простое —
// вызов `t(...)` ВНУТРИ функции, которая сама связывает имя `t` (параметром
// или локальной переменной), обращается к этой связке, а не к импорту.
//
// Если проверка сработала, чинить нужно ПЕРЕИМЕНОВАНИЕМ локальной переменной
// (task), а не псевдонимом для перевода: псевдоним прячет ловушку, а не
// убирает её, и следующий коллбэк наступит на неё снова.
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// ТОЛЬКО Конгрессы — намеренно. Это единственный модуль, где перевод
// импортируется коротким именем `t` (ES-модули). Клиндарий зовёт
// `App.utils.t()`, Школа — глобальные `T()`/`D()`, Документы и Назначения —
// `CWI18n.t()`: там затенять нечего. Появится модуль с таким же импортом —
// дописать сюда путь, больше ничего не меняется.
const DIRS = ['./congress-project/js'];
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
};

let acorn, walk;
try {
  acorn = await import('acorn');
  walk = await import('acorn-walk');
} catch {
  console.log('  Нет пакетов: acorn, acorn-walk');
  console.log('  Установить:  npm install acorn acorn-walk');
  process.exit(3); // SKIP — «не смогли проверить» не равно «проверили, всё хорошо»
}

// Имена, которые связывает функция: параметры + var/let/const её тела.
function boundNames(node) {
  const names = new Set();
  const addPattern = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') names.add(p.name);
    else if (p.type === 'AssignmentPattern') addPattern(p.left);
    else if (p.type === 'RestElement') addPattern(p.argument);
    else if (p.type === 'ObjectPattern') p.properties.forEach((x) => addPattern(x.value || x.argument));
    else if (p.type === 'ArrayPattern') p.elements.forEach(addPattern);
  };
  (node.params || []).forEach(addPattern);
  // Локальные объявления верхнего уровня тела — без захода во вложенные функции.
  const body = node.body && node.body.type === 'BlockStatement' ? node.body.body : [];
  body.forEach((st) => {
    if (st.type === 'VariableDeclaration') st.declarations.forEach((d) => addPattern(d.id));
  });
  return names;
}

const findings = [];
for (const dir of DIRS) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
    const path = dir + '/' + file;
    const src = readFileSync(path, 'utf8');
    let tree;
    try {
      tree = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (e) {
      findings.push(`${path}: не разобрался — ${e.message}`);
      continue;
    }
    walk.ancestor(tree, {
      CallExpression(node, _state, ancestors) {
        if (!node.callee || node.callee.type !== 'Identifier' || node.callee.name !== 't') return;
        // Ближайшая функция-предок, связывающая имя `t`, перекрывает импорт.
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const a = ancestors[i];
          if (!/Function/.test(a.type)) continue;
          if (boundNames(a).has('t')) {
            const arg = node.arguments[0];
            const key = arg && arg.type === 'Literal' ? String(arg.value) : '…';
            findings.push(`${path}:${node.loc.start.line} — t("${key}") внутри функции, где t связан локально`);
            return;
          }
        }
      }
    });
  }
}

console.log('\nВызовы перевода в затенённой области');
ok('t() нигде не затенён локальной переменной', findings.length === 0, '\n    ' + findings.join('\n    '));

console.log(`\nИтого: ${pass} пройдено, ${fail} провалено\n`);
process.exit(fail ? 1 : 0);
