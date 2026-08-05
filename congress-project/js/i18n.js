// Мост модуля «Конгрессы» к общей локализации хаба (shared/i18n.js).
//
// Разрешение языка и хранение выбора целиком на общем слое:
//   localStorage['cw-lang:congress-project'] → своё, если пользователь выбрал;
//   иначе localStorage['cw-lang'] → язык, заданный в Circuit Workspace.
// Своего ключа в данных модуля нет намеренно: язык интерфейса — это не часть
// программы конгресса, и он не должен попадать в резервные копии и экспорт.
//
// ВАЖНО: язык интерфейса и язык ПИСЕМ — разные вещи. Письма по-прежнему
// берут язык из settings.language (uk/ru/de) в настройках письма: секретарь
// может работать в польском интерфейсе и рассылать украинские письма.

export const MODULE = 'congress-project';
export const HUB_VALUE = '__hub';

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

// Заголовок вкладки: название модуля переводится, номер версии — нет.
function applyTitle() {
  const version = (self.CW_MODULES && self.CW_MODULES[MODULE] && self.CW_MODULES[MODULE].version) || '';
  document.title = t('cong.app.title') + (version ? ' v' + version : '');
  const slot = document.getElementById('moduleVersion');
  if (slot && version) slot.textContent = 'v' + version;
}

export function isInherited() { return ready() ? CWI18n.isInherited() : true; }

// Смена языка: __hub — вернуться к наследованию от хаба, иначе собственный выбор.
export function choose(value) {
  if (!ready()) return;
  if (value === HUB_VALUE) CWI18n.resetToHub();
  else CWI18n.setLang(value, { scope: 'module' });
}

export function currentValue() {
  if (!ready()) return HUB_VALUE;
  return CWI18n.isInherited() ? HUB_VALUE : CWI18n.getLang();
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
  CWI18n.init({ module: MODULE });
  applyTitle();
  fillLanguageSelect();

  CWI18n.onChange(() => {
    applyTitle();
    fillLanguageSelect();
    if (typeof rerender === 'function') rerender();
  });

  const select = document.getElementById('uiLanguage');
  if (select) select.addEventListener('change', (e) => {
    choose(e.target.value);
    applyTitle();
    fillLanguageSelect();
    if (typeof rerender === 'function') rerender();
  });
}

// Опции строятся из реестра языков хаба: добавление языка не требует правок
// ни здесь, ни в разметке.
function fillLanguageSelect() {
  const select = document.getElementById('uiLanguage');
  if (!select || !ready()) return;
  const options = [{ code: HUB_VALUE, label: t('common.language_inherit') }]
    .concat(CWI18n.LANGS.map((l) => ({ code: l.code, label: l.label })));
  select.innerHTML = options
    .map((o) => `<option value="${o.code}">${o.label}</option>`)
    .join('');
  select.value = currentValue();
}
