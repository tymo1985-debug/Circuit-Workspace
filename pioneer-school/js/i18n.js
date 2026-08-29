// i18n.js — мост Школы пионеров к общей локализации хаба (shared/i18n.js).
//
// Модуль написан на обычных глобальных скриптах (не ES-модулях), поэтому
// перевод доступен как глобальная функция T(key, vars). Имя короткое
// намеренно: в app.js оно встречается в шаблонных строках сотни раз.
//
// Разрешение языка целиком на общем слое:
//   localStorage['cw-lang:pioneer-school'] → свой выбор, если пользователь его сделал;
//   иначе localStorage['cw-lang'] → язык, заданный в Circuit Workspace.
// В IndexedDB модуля язык интерфейса не хранится намеренно: он не часть
// данных школы и не должен попадать в резервные копии.
//
// ЧТО ЭТОТ СЛОЙ НЕ ПЕРЕВОДИТ (осознанно, см. шапку i18n/dict.js):
// генераторы документов (pdfExport, pdfFormExport, excelExport), схему
// анкеты registrationSchema.js и страницу register.html. Это готовые бумаги,
// их язык — свойство документа, а не оболочки.

const PSI18n = {
  MODULE: 'pioneer-school',
  /* Константа общего слоя, а не своя копия — см. shared/i18n.js. */
  HUB_VALUE: (typeof CWI18n !== 'undefined' && CWI18n.HUB_VALUE) || '\u005f\u005fhub',

  ready() { return typeof CWI18n !== 'undefined'; },

  t(key, vars) { return this.ready() ? CWI18n.t(key, vars) : key; },

  isInherited() { return this.ready() ? CWI18n.isInherited() : true; },

  currentValue() {
    if (!this.ready()) return this.HUB_VALUE;
    return CWI18n.isInherited() ? this.HUB_VALUE : CWI18n.getLang();
  },

  choose(value) {
    if (!this.ready()) return;
    if (value === this.HUB_VALUE) CWI18n.resetToHub();
    else CWI18n.setLang(value, { scope: 'module' });
  },

  // Подписи столбцов учащихся живут в Students.label() (students.js): там
  // правильный приоритет — labelKey, если столбец не переименовывали, и
  // собственное название пользователя, если переименовывали. Дубля здесь
  // намеренно нет: у него приоритет был обратный (label раньше labelKey),
  // то есть перевод никогда бы не применился.

  /* Мост целиком в общем слое (29.08.2026): CWI18n.bindModule().
     applyTitle() и fillSelect() удалены — они были построчной копией того,
     что теперь делает общий слой. */
  _bridge: null,

  /**
   * @param {Function} rerender — перерисовка текущего экрана. Статическую
   *   разметку переводит CWI18n.apply() по атрибутам data-i18n; всё, что
   *   собирается в JS, нужно построить заново.
   */
  init(rerender) {
    if (!this.ready()) {
      console.error('pioneer-school: shared/i18n.js не подключён — интерфейс останется русским');
      return;
    }
    this._bridge = CWI18n.bindModule({
      module: this.MODULE,
      /* id селектора у Школы через дефис — это исторически её разметка, и
         переименование ради единообразия сломало бы вёрстку без выигрыша. */
      select: 'ui-language',
      titleKey: 'module.pioneer-school.title',
      onChange: rerender,
    });
  },
};

// Короткий псевдоним для шаблонных строк.
function T(key, vars) { return PSI18n.t(key, vars); }

// Модуль везде придерживается правила «const X + window.X = X» (см. db.js,
// students.js): между обычными <script> глобальный const виден и так, но без
// явного экспорта объект пропадает, как только файл выполняется в другом
// контексте — например, в тестовой песочнице или под бандлером.
window.PSI18n = PSI18n;
window.T = T;
