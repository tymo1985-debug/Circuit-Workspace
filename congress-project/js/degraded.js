/**
 * Circuit Workspace — congress-project/js/degraded.js
 * Блокировка ДОМЕННЫХ правок, когда каноническое хранилище недоступно.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Реестр должен читаться как документ: что именно
 * запрещено в read-only и почему. Размазанный по обработчикам, он устаревает
 * молча — новый контрол просто не попадает в список, и пользователь снова
 * правит данные, которые никуда не сохраняются.
 *
 * КРИТЕРИЙ ОТБОРА. Контрол попадает в MUTATING тогда и только тогда, когда его
 * обработчик меняет ДОМЕННЫЕ поля `store.st`. Выбор конгресса (`activeId`) и
 * выбор задания (`store.sel`) — состояние ВИДА: они меняют то, что показано, а
 * не то, что хранится. В деградации навигация обязана работать, иначе человек
 * не сможет даже посмотреть свои данные.
 *
 * ЧТО НЕ БЛОКИРУЕТСЯ: навигация, печать, экспорт, просмотр писем, просмотр
 * архива документов, список копий, смена языка и темы, установка PWA,
 * сворачивание панели. Ни одно из этого не пишет в `store.st`.
 */
import { $, $$ } from './dom.js';

/* Доменные контролы. Идентификаторы, а не классы: класс легко случайно
   унаследовать read-only кнопке и запереть её вместе с остальными. */
const MUTATING_IDS = [
  // Создание и удаление конгрессов и серий
  'newCongressBtn', 'createCongressBtn', 'deleteCongressBtn', 'newSeriesBtn', 'createSeriesBtn',
  // Программа и задания
  'addTaskBtn', 'mAddTaskBtn', 'addSectionBtn', 'duplicateTaskBtn', 'duplicateTaskEmptyBtn',
  'duplicateMenuBtn', 'saveEditBtn',
  // Справочники и профили
  'directoryBtn', 'matchDirectoryBtn', 'speakersBtn', 'typesBtn',
  'saveListBtn', 'clearListBtn', 'sortListBtn', 'collectListBtn',
  'collectProfilesBtn', 'saveProfilesBtn', 'lsApplyBtn',
  // Настройки конгресса и писем (пишут в store.st.settings)
  'saveCongressSettingsBtn', 'congressSettingsBtn', 'letterSettingsBtn',
  'resetLetterBtn', 'composerSaveBtn', 'composerEditBtn',
  // Отметки об отправке писем — доменное поле letterSent
  'lettersMarkAllBtn',
  // Крупные необратимые операции
  'resetAppBtn', 'backupBtn',
];

/* Контролы, которые ЯВНО остаются рабочими. Список нужен не механизму, а
   человеку: он фиксирует намерение и ловит случайное расширение блокировки.
   'exportBtn', 'downloadBackupBtn', 'printPlanBtn', 'printLetterBtn',
   'orientationPrintBtn', 'allLettersBtn', 'lettersPrintAllBtn', 'lettersModeBtn',
   'printMenuBtn', 'toolsMenuBtn', 'congressMoreBtn', 'mCongressBtn', 'mMoreBtn',
   'docsArchiveBtn', 'openDocumentsBtn', 'previewTemplateBtn', 'composerCopyBtn',
   'checkProgramBtn', 'programHintBtn', 'sidebarToggleBtn', 'installBtn',
   'planFit*Btn', 'matchCloseBtn' */

/* Поля ввода доменных данных. Кнопки сохранения заблокировать мало: человек
   набьёт текст в форме и потеряет его вместе с вкладкой. */
/* ДИНАМИЧЕСКИЕ контролы: создаются через innerHTML при каждой перерисовке,
   поэтому статической сверки с index.html недостаточно — их там просто нет.
   Проверено по обработчикам в render.js/tasks.js:
     .status-sel        — селект статуса задания (ss.onchange → доменное поле)
     .rm                — удаление задания в меню строки
     .ed                — правка задания
     .le                — отметка «письмо отправлено» (le.onclick)
     [data-addc]        — добавить конгресс в серию
     [data-delseries]   — удалить серию
     [data-linkseries]  — связать серию
   НЕ входят: `#congressList .congress` (выбор конгресса — навигация),
   `.row-more` и `.row-menu` (раскрытие меню — вид), `.link-badge` (индикатор). */
const MUTATING_DYNAMIC_SELECTORS = [
  '#tasksBody .status-sel',
  '#tasksBody .rm',
  '#tasksBody .ed',
  '#tasksBody .le',
  '#congressList [data-addc]',
  '#congressList [data-delseries]',
  '#congressList [data-linkseries]',
];

const MUTATING_FIELD_SELECTORS = [
  '#congressMeta input', '#congressMeta select', '#congressMeta textarea',
  '#tasksBody input', '#tasksBody select', '#tasksBody textarea',
  '#editDialog input', '#editDialog select', '#editDialog textarea',
  '#congressSettingsDialog input', '#congressSettingsDialog select', '#congressSettingsDialog textarea',
  '#letterSettingsDialog input', '#letterSettingsDialog select', '#letterSettingsDialog textarea',
  '#newCongressDialog input', '#newCongressDialog select',
  '#newSeriesDialog input', '#newSeriesDialog select',
  '#listDialog input', '#listDialog textarea',
  '#speakerProfilesDialog input', '#speakerProfilesDialog select', '#speakerProfilesDialog textarea',
  '#linkSeriesDialog input', '#linkSeriesDialog select',
];

let active = false;

/** Идёт ли сейчас блокировка. */
export function isDegradedUI() { return active; }

/**
 * Проставить блокировку. Вызывается ПОСЛЕ каждой перерисовки: `render()`
 * пересоздаёт строки заданий через innerHTML, и без повторного вызова
 * блокировка слетала бы с новых элементов, оставляя UI выглядящим рабочим.
 */
export function applyDegradedUI(on) {
  if (typeof on === 'boolean') active = on;
  if (!active) return;

  MUTATING_IDS.forEach((id) => {
    const el = $('#' + id);
    if (!el) return;                    // контрол может отсутствовать в этой раскладке
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
  });

  MUTATING_DYNAMIC_SELECTORS.forEach((sel) => {
    $$(sel).forEach((el) => {
      el.disabled = true;
      el.setAttribute('aria-disabled', 'true');
    });
  });

  MUTATING_FIELD_SELECTORS.forEach((sel) => {
    $$(sel).forEach((el) => {
      /* readOnly вместо disabled там, где это поле: значение остаётся
         выделяемым и копируемым — данные человек всё ещё может забрать. */
      if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') {
        el.disabled = true;
      } else {
        el.readOnly = true;
      }
      el.setAttribute('aria-disabled', 'true');
    });
  });
}
