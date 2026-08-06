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
  HUB_VALUE: '__hub',

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

  applyTitle() {
    const version = (self.CW_MODULES && self.CW_MODULES[this.MODULE] && self.CW_MODULES[this.MODULE].version) || '';
    document.title = this.t('module.pioneer-school.title') + (version ? ' v' + version : '');
  },

  fillSelect() {
    const select = document.getElementById('ui-language');
    if (!select || !this.ready()) return;
    const options = [{ code: this.HUB_VALUE, label: this.t('common.language_inherit') }]
      .concat(CWI18n.LANGS.map((l) => ({ code: l.code, label: l.label })));
    select.innerHTML = options.map((o) => `<option value="${o.code}">${o.label}</option>`).join('');
    select.value = this.currentValue();
  },

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
    CWI18n.init({ module: this.MODULE });
    this.applyTitle();
    this.fillSelect();

    const apply = () => {
      this.applyTitle();
      this.fillSelect();
      if (typeof rerender === 'function') rerender();
    };

    CWI18n.onChange(apply);

    const select = document.getElementById('ui-language');
    if (select) select.addEventListener('change', (e) => { this.choose(e.target.value); apply(); });
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
