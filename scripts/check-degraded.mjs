#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-degraded.mjs
 *
 * Фаза B: режим только для чтения, когда каноническое хранилище недоступно.
 *
 * ЧТО ЭТА ПРОВЕРКА ДОКАЗЫВАЕТ. Структурные инварианты: реестры блокируемых
 * контролов ссылаются на существующие элементы; каждый частичный рендер,
 * пересоздающий доменные контролы, заново ставит блокировку; навигация в
 * реестры не попала; в модулях не осталось записи в прежние ключи.
 *
 * ЧЕГО НЕ ДОКАЗЫВАЕТ. Что браузер действительно не даст нажать кнопку. Это
 * поведение, и оно проверяется живым прогоном (L2/L3). Здесь нарочно НЕ
 * поднимается DOM-симуляция: она потребовала бы исполнять ES-модули модулей с
 * их импортами, то есть половину приложения, и доказывала бы работу мока, а не
 * приложения. Честнее оставить это живому прогону и не выдавать одно за другое.
 *
 *   node scripts/check-degraded.mjs
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

const congDeg = read('congress-project/js/degraded.js');
const congHtml = read('congress-project/index.html');
const congRender = read('congress-project/js/render.js');
const congState = read('congress-project/js/state.js');
const planner = read('circuit-planner/app.js');
const plannerHtml = read('circuit-planner/index.html');

/* ── Конгрессы: статический реестр ────────────────────────────────────────── */
console.log('\nКонгрессы: реестр блокируемых контролов');
{
  const block = congDeg.slice(congDeg.indexOf('MUTATING_IDS = ['), congDeg.indexOf('/* Контролы, которые'));
  const ids = [...block.matchAll(/'([a-zA-Z][a-zA-Z0-9]*)'/g)].map((m) => m[1]);
  const missing = ids.filter((id) => !congHtml.includes(`id="${id}"`));
  ok(`все ${ids.length} статических идентификатора есть в разметке`, missing.length === 0, missing.join(', '));

  const containers = [...new Set([...congDeg.matchAll(/#([a-zA-Z]+)/g)].map((m) => m[1]))];
  const missingC = containers.filter((c) => !congHtml.includes(`id="${c}"`));
  ok(`все ${containers.length} контейнера есть в разметке`, missingC.length === 0, missingC.join(', '));
}

/* ── Конгрессы: динамические контролы ─────────────────────────────────────── */
console.log('\nКонгрессы: динамические контролы и частичный рендер');
{
  /* Эти классы создаются через innerHTML в renderTasks()/renderCongresses(),
     в index.html их нет — значит сверять нужно с исходником рендера. */
  const dynamic = ['status-sel', 'rm', 'ed', 'le'];
  dynamic.forEach((cls) => {
    ok(`.${cls} создаётся рендером и учтён в реестре`,
      congRender.includes(cls) && congDeg.includes(`.${cls}`));
  });
  ['data-addc', 'data-delseries', 'data-linkseries'].forEach((attr) => {
    ok(`[${attr}] создаётся рендером и учтён в реестре`,
      congRender.includes(attr) && congDeg.includes(attr));
  });

  /* Каждая частичная перерисовка обязана заново поставить блокировку. */
  ['render', 'renderTasks', 'renderCongresses'].forEach((fn) => {
    const i = congRender.indexOf(`export function ${fn}(`);
    const next = congRender.indexOf('\nexport function ', i + 10);
    const body = congRender.slice(i, next === -1 ? undefined : next);
    ok(`${fn}() заново применяет блокировку`, body.includes('applyDegradedUI()'));
  });
}

/* ── Конгрессы: навигация НЕ блокируется ──────────────────────────────────── */
console.log('\nКонгрессы: навигация остаётся рабочей');
{
  ok('выбор конгресса не в реестре', !congDeg.includes("'#congressList .congress'"));
  /* Точная проверка селекторов, а не подстрок: '.rm' содержится в '.row-more'
     как подстрока, и наивный includes давал ложный провал. */
  const congSelectors = [...congDeg.matchAll(/'([^']*\.[a-z][a-z-]*)'/g)].map((m) => m[1]);
  ok('меню строки не в реестре',
    !congSelectors.some((x) => /\.row-more|\.row-menu/.test(x)), congSelectors.join(' '));
  ok('activeId исключён из признака доменной правки',
    congState.includes('delete o.activeId'));
  ok('выбранный конгресс сохраняется при приёме чужого состояния',
    congState.includes('keepActive'));
}

/* ── Конгрессы: устойчивость статуса и крупные операции ───────────────────── */
console.log('\nКонгрессы: статус и крупные операции');
{
  ok('обычная отметка «сохранено» не снимает degraded/conflict',
    /if\(degraded\|\|conflict\)return/.test(congState));
  ok('deg/conflict выставляются до обычного статуса',
    congState.includes('enterDegraded') && congState.includes('enterConflict'));
  ok('сброс приложения в реестре', congDeg.includes('resetAppBtn'));
  ok('импорт/восстановление копий в реестре', congDeg.includes('backupBtn'));
}

/* ── Клиндарий ────────────────────────────────────────────────────────────── */
console.log('\nКлиндарий: реестр и частичный рендер');
{
  const block = planner.slice(planner.indexOf('DEGRADED_MUTATING_IDS: ['), planner.indexOf('DEGRADED_MUTATING_SELECTORS'));
  const ids = [...block.matchAll(/'([a-zA-Z][a-zA-Z0-9]*)'/g)].map((m) => m[1]);
  const missing = ids.filter((id) => !plannerHtml.includes(`id="${id}"`));
  ok(`все ${ids.length} статических идентификатора есть в разметке`, missing.length === 0, missing.join(', '));

  ['data-entry-flag', 'data-week-flag'].forEach((attr) => {
    ok(`[${attr}] учтён в динамическом реестре`, planner.includes(`'[${attr}]'`));
  });

  /* renderAll() и оба частичных рендера, создающих эти контролы. */
  ['renderAll', 'renderCalendarDetails', 'renderServiceYearDayDetails'].forEach((fn) => {
    const i = planner.indexOf(`\n      ${fn}(`);
    const m = /\n {6}\w+\([^)]*\) \{/.exec(planner.slice(i + 10));
    const body = planner.slice(i, m ? i + 10 + m.index : i + 4000);
    ok(`${fn}() заново применяет блокировку`, /applyDegraded\(\)/.test(body));
  });

  ok('навигация по экранам не в реестре', !planner.includes("'[data-screen]',"));
  ok('печать и экспорт не в реестре',
    !planner.includes("'[data-pdf-type]',") && !planner.includes("'[data-export-type]',"));
}

/* ── Записи в прежние ключи не осталось ───────────────────────────────────── */
console.log('\nПрежние ключи: только чтение');
{
  ok('Клиндарий не пишет состояние в прежний ключ',
    !planner.includes('localStorage.setItem(App.config.storageKey'));
  ok('Клиндарий не пишет историю в прежний ключ',
    !planner.includes('localStorage.setItem(App.config.historyKey'));
  ok('Конгрессы не пишут состояние в прежний ключ', !congState.includes('localStorage.setItem(KEY'));
  ok('Конгрессы не пишут копии в прежний ключ', !congState.includes('localStorage.setItem(BACKUP_KEY'));
  ok('чтение прежних ключей сохранено',
    planner.includes('localStorage.getItem(App.config.storageKey)')
    && planner.includes('localStorage.getItem(App.config.historyKey)')
    && congState.includes('localStorage.getItem(KEY)'));
}

/* ── Baseline ставится в правильной точке ─────────────────────────────────── */
console.log('\nBaseline стартового состояния');
{
  /* Конгрессы: после migrate/adoptShared/newC, до пользовательского ввода. */
  const i = congState.indexOf('domainBaselinePayload=JSON.stringify(store.st)');
  ok('Конгрессы: baseline после стартовой нормализации',
    i > congState.indexOf('migrate();adoptShared();') && i > congState.indexOf('newC(t("cong.msg.first_congress")'));

  /* Клиндарий: после всех детерминированных стартовых правок, ДО bind(). */
  const b = planner.indexOf('App.store.domainBaselinePayload = JSON.stringify(App.state.app)');
  ok('Клиндарий: baseline после ensureServiceYear/getWeeksForYear',
    b > planner.indexOf('this.data.getWeeksForYear(currentSY)'));
  ok('Клиндарий: baseline после нормализации настроек',
    b > planner.indexOf("this.state.app.settings.showTeamPanel = true"));
  ok('Клиндарий: baseline ДО bind()', b < planner.indexOf('\n      this.bind();'));
  ok('Клиндарий: baseline ДО подписки на чужую запись', b < planner.indexOf('remote.onForeign'));
}

console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nРежим только для чтения: структурные инварианты соблюдены.');
process.exit(failed ? 1 : 0);
