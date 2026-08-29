// Мост модуля «Конгрессы» к общей локализации хаба (shared/i18n.js).
//
// Разрешение языка и хранение выбора целиком на общем слое:
//   localStorage['cw-lang:congress-project'] → своё, если пользователь выбрал;
//   иначе localStorage['cw-lang'] → язык, заданный в Circuit Workspace.
// Своего ключа в данных модуля нет намеренно: язык интерфейса — это не часть
// программы конгресса, и он не должен попадать в резервные копии и экспорт.
//
// ВАЖНО: язык интерфейса и язык ПИСЕМ — разные вещи. Письма по-прежнему
// берут язык из общего слоя CWDocLang (shared/doclang.js): секретарь
// может работать в польском интерфейсе и рассылать украинские письма.

export const MODULE = 'congress-project';

/* Мост целиком в общем слое (29.08.2026): CWI18n.bindModule(). Здесь остаётся
   только то, что у Конгрессов действительно своё, — перевод статусов. */
let bridge = null;

/* Константа общего слоя, а не своя копия: значение обязано совпадать с тем,
   что кладёт в селектор bindModule, но раньше их ничто не связывало. */
export const HUB_VALUE = (typeof CWI18n !== 'undefined' && CWI18n.HUB_VALUE) || '\u005f\u005fhub';

export function ready() { return typeof CWI18n !== 'undefined'; }

export function t(key, vars) {
  return ready() ? CWI18n.t(key, vars) : key;
}

// Статусы заданий хранятся в данных ПО-РУССКИ и такими остаются: по ним
// сравнивают, их пишут в JSON, их видят старые резервные копии. Переводится
// только показ. Значение, которого нет в таблице (пользователь мог завести
// своё), показывается как есть.
const STATUS_KEYS = {
  'Не назначено': 'cong.status.unassigned',
  'Назначено': 'cong.status.assigned',
  'Ожидает ответа': 'cong.status.awaiting',
  'Подтверждено': 'cong.status.confirmed',
  'Нужно письмо': 'cong.status.letter_needed',
  'Письмо отправлено': 'cong.status.letter_sent',
  'Запись получена': 'cong.status.record_received',
  'Готово': 'cong.status.done',
};

export function tStatus(value) {
  const key = STATUS_KEYS[value];
  return key ? t(key) : (value || '');
}

export function isInherited() { return ready() ? CWI18n.isInherited() : true; }

// Смена языка: __hub — вернуться к наследованию от хаба, иначе собственный выбор.
export function choose(value) {
  if (!bridge) return;
  bridge.choose(value);
  bridge.refresh();
}

export function currentValue() {
  return bridge ? bridge.currentValue() : HUB_VALUE;
}

/**
 * @param {Function} rerender — перерисовка динамических экранов. Статическую
 *   разметку переводит сам CWI18n.apply() по атрибутам data-i18n; всё, что
 *   собирается в JS (таблица заданий, список конгрессов), нужно построить заново.
 */
export function init(rerender) {
  if (!ready()) {
    console.error('congress-project: shared/i18n.js не подключён — интерфейс останется русским');
    return;
  }
  bridge = CWI18n.bindModule({
    module: MODULE,
    select: 'uiLanguage',
    titleKey: 'cong.app.title',
    versionSlot: 'moduleVersion',
    onChange: rerender,
  });
}
