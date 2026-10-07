#!/usr/bin/env node
/**
 * Журнал — каждый динамический контейнер классифицирован для J8.
 *
 * Блокировка очищает раскрытый текст только в контейнерах из
 * `PLAIN_CONTAINERS` (journal/js/app/protection.js). Контейнер, добавленный
 * без записи туда, держит расшифрованный текст в скрытом экране до следующей
 * отрисовки — молча. Класс ломался дважды: 0.15.2 (экраны того времени) и
 * J10 (вкладка «Задачи» собрания, история проекта; аудит 06, JF-1).
 *
 * Правило: каждый пустой в разметке контейнер с id (его наполняет код)
 * либо в `PLAIN_CONTAINERS`, либо в `NOT_PLAIN` ниже — с причиной, почему
 * защищённого текста в нём не бывает. Счётчики, ошибки и подписи-«lede»
 * (`…Count`, `…Error`, `…Lede`) — только числа и служебный текст.
 *
 *   node scripts/check-journal-plain-containers.mjs
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

/* Защищённого текста здесь не бывает. Причина — коротко. */
const NOT_PLAIN = {
  moduleVersion: 'версия', topbarContext: 'имя узла и сезон', moreMenuPanel: 'действия меню',
  overviewStats: 'счётчики', overviewNextVisit: 'посещение: узел и даты', overviewVisits: 'посещения: узел и даты',
  circuitsListBody: 'узлы', districtTitle: 'имя района', districtCounts: 'счётчики', districtEntryChips: 'фильтр',
  congregationsTree: 'узлы', congTitle: 'имя собрания', congMeta: 'вид узла',
  congIdentityLine1: 'справочник', congIdentitySchedule: 'расписание встреч', congIdentityContact: 'справочник',
  congIdentityHint: 'подсказка', congUnlinkedLabel: 'подпись', congBrokenLabel: 'подпись', congUnavailableLabel: 'подпись',
  congChildrenTree: 'узлы', congVisitsList: 'посещения: даты', visitTitle: 'узел и сезон', visitStatusChip: 'статус',
  visitPlannerSlot: 'связь с Клиндарием', carryBannerTitle: 'число пунктов', carryBannerText: 'возраст пунктов',
  visitReadonly: 'подпись', projectStatusBadge: 'статус', projectReadonly: 'подпись',
  projectDocsNote: 'подпись', projectDocs: 'снимки писем — у защищённого проекта их нет (J9b)',
  letterInfo: 'подпись', letterStatus: 'состояние', projectDialogTitle: 'заголовок диалога', pickDialogTitle: 'заголовок диалога',
  pickDialogHint: 'подсказка', visitDialogTitle: 'заголовок диалога', plannerDialogCurrent: 'запись Клиндария',
  plannerDialogList: 'записи Клиндария', carrySheetKicker: 'номер пункта', carrySheetMeta: 'узел и счётчик',
  protectIco: 'значок', taskDialogTitle: 'заголовок диалога', noteDialogTitle: 'заголовок диалога',
  importBody: 'названия из календаря', linkDialogCandidates: 'карточки справочника',
  schedulePlannerPanel: 'расписание из Клиндария', nodeDialogTitle: 'заголовок диалога',
  rosterStatus: 'состояние', rosterList: 'узлы', searchFilters: 'фильтр', searchStatus: 'число найденного', fabLabel: 'подпись кнопки',
};
const SERVICE = /(Count(_[a-z]+)?|Error|Lede)$/;

const html = read('journal/index.html');
const dynamic = [...html.matchAll(/<(div|ul|ol|section|p|h[1-6]|span)\b[^>]*\bid="([^"]+)"[^>]*>\s*<\/\1>/g)].map((m) => m[2]);
const prot = read('journal/js/app/protection.js');
const m = prot.match(/var PLAIN_CONTAINERS = \[([\s\S]*?)\];/);
ok('PLAIN_CONTAINERS найден в protection.js', !!m);
const plain = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]));

console.log('\nКлассификация контейнеров');
ok('динамических контейнеров найдено разумно (разбор не сломался)', dynamic.length >= 80, dynamic.length);
const unknown = dynamic.filter((id) => !plain.includes(id) && !(id in NOT_PLAIN) && !SERVICE.test(id));
ok('каждый динамический контейнер — в PLAIN_CONTAINERS или NOT_PLAIN', unknown.length === 0, unknown.join(', '));
const both = plain.filter((id) => id in NOT_PLAIN);
ok('ни один контейнер не числится в обоих списках', both.length === 0, both.join(', '));
const missing = plain.filter((id) => !ids.has(id));
ok('каждый id из PLAIN_CONTAINERS есть в разметке', missing.length === 0, missing.join(', '));
const stale = Object.keys(NOT_PLAIN).filter((id) => !ids.has(id));
ok('NOT_PLAIN без устаревших id', stale.length === 0, stale.join(', '));

console.log('\nКонтейнеры, где уже находили текст после lock');
for (const id of ['congTasksList', 'projectHistory', 'pickDialogList']) ok(id + ' очищается при блокировке', plain.includes(id));

console.log(failed ? '\nПровалов: ' + failed : '\nКонтейнеры Журнала: всё в порядке');
process.exit(failed ? 1 : 0);
