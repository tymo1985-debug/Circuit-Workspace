#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-journal-polish.mjs
 *
 * Финальная polishing-проверка Журнала уровня C: мелкие UX/a11y/robustness
 * правки, без изменения архитектуры, интеграций, шифрования и контрактов
 * Клиндарий/Документы/To Do.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫМ ФАЙЛОМ: точечная регрессия конкретно этого прохода, не
 * дублирует существующие J1–J9-проверки (данные, маршрут посещения и т.д. —
 * там же, где были). Здесь — только то, что добавлено/исправлено в этом
 * проходе: `aria-expanded` у переключателей `.md-menu`, перенос длинных слов
 * в `.j-row__title`, безопасность неизвестного хэш-маршрута (`#nope`).
 *
 *   node scripts/check-journal-polish.mjs   (без внешних зависимостей)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failed++;
  console.log('  ✗ ' + label + (extra === undefined ? '' : ' — ' + extra));
};

/* ═══ 1. CSS: длинное слово не раздвигает строку на mobile ═══════════════ */
console.log('1. Перенос длинных слов (.j-row__title)');
{
  const css = read('journal/css/styles.css');
  const rule = /^\.j-row__title\s*\{[^}]*\}/m.exec(css);
  ok('.j-row__title объявлен', !!rule);
  ok('.j-row__title включает overflow-wrap: anywhere', !!rule && /overflow-wrap:\s*anywhere/.test(rule[0]));
}

/* ═══ 2. aria-expanded у переключателей .md-menu ══════════════════════════ */
console.log('\n2. aria-expanded (#moreBtn и .j-row__chevronbtn)');
{
  const core = read('journal/js/app/core.js');
  ok('wireMenuToggle выставляет aria-expanded при клике',
    /wireMenuToggle[\s\S]*?aria-expanded[\s\S]*?willOpen/.test(core));
  ok('closeAllMenus сбрасывает aria-expanded закрываемых панелей',
    /closeAllMenus[\s\S]*?aria-expanded.*false/.test(core.replace(/\n/g, ' ')));
  const html = read('journal/index.html');
  ok('#moreBtn имеет исходный aria-expanded="false"',
    /id="moreBtn"[^>]*aria-expanded="false"/.test(html) || /aria-expanded="false"[^>]*id="moreBtn"/.test(html));
  const districts = read('journal/js/app/districts.js');
  ok('шаблон .j-row__chevronbtn несёт исходный aria-expanded="false"',
    /j-row__chevronbtn[^"]*"[^>]*aria-expanded="false"/.test(districts));
}

/* ═══ 3. Неизвестный/некорректный route/hash ══════════════════════════════ */
console.log('\n3. Безопасный fallback неизвестного маршрута');
{
  globalThis.self = globalThis;
  eval(read('journal/js/route.js'));
  const P = globalThis.CWJournalRoute.parse;
  ok('#nope → overview, без исключения', P('#nope').route === 'overview');
  ok('#nope/x/y → overview, без исключения', P('#nope/x/y').route === 'overview');
  ok('пустой хэш → overview', P('').route === 'overview');
  ok('только "#" → overview', P('#').route === 'overview');
}

console.log('\n' + (failed ? failed + ' провал(а)' : 'Всё прошло'));
process.exit(failed ? 1 : 0);
