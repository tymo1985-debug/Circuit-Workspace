// doclang.js — язык ДОКУМЕНТОВ Школы пионеров (мост к shared/doclang.js).
//
// ГЛАВНОЕ РАЗЛИЧЕНИЕ. Язык интерфейса (js/i18n.js, функция T) и язык документа
// (этот файл, функция D) — две независимые настройки. Районный старейшина
// может работать в русском интерфейсе и рассылать польские анкеты: это
// нормальный рабочий случай, а не ошибка. Поэтому переключатель в шапке
// приложения не трогает язык бумаг, и наоборот.
//
// ЧТО СЧИТАЕТСЯ ДОКУМЕНТОМ: онлайн-анкета (register.html), интерактивный
// PDF-формуляр, печатный бланк, формуляры и списки учащихся, заказ учебников,
// S-253, выгрузки CSV/XLSX и текст письма, который уходит старейшине.
// Строки — в i18n/doc.js под префиксом doc.ps.*.
//
// ПОЧЕМУ НЕ CWDocLang.apply(), А СВОЙ ОБХОД DOM. У Школы есть публичная
// страница register.html, которую пионер открывает по ссылке на СВОЁМ
// устройстве. Язык такой ссылки задаёт отправитель — параметром ?lang=pl.
// Этот выбор не должен записываться в localStorage пионера (и тем более
// перетирать выбор старейшины, если он откроет ту же ссылку у себя), поэтому
// язык здесь может быть «переопределён на один показ». CWDocLang.apply()
// работает от своего сохранённого состояния и такого режима не знает — а
// расширять shared/* ради одного модуля значит поднимать версии всех четырёх.
// Поэтому init() зовётся с apply: false, а разметку переводит applyDoc().
// (Тот же приём, что мост Клиндария: от общего слоя нужно только разрешение
// языка и хранилище.)

const PSDocLang = {
  MODULE: 'pioneer-school',

  /** Порядок = порядок в переключателе. Первый — запасной вариант. */
  LANGS: ['ru', 'uk', 'en', 'pl', 'de'],

  /** Язык «на один показ» из ?lang=; в localStorage не попадает. */
  _override: null,

  /** Локали для дат. Дата в документе должна выглядеть по-местному. */
  LOCALES: { ru: 'ru-RU', uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL', de: 'de-DE' },

  ready() { return typeof CWDocLang !== 'undefined' && typeof CWI18n !== 'undefined'; },

  _fromUrl() {
    try {
      const value = new URLSearchParams(global_location().search).get('lang');
      if (!value) return null;
      const code = String(value).toLowerCase().slice(0, 2);
      return this.LANGS.indexOf(code) >= 0 ? code : null;
    } catch (e) { return null; }
  },

  get() {
    if (this._override) return this._override;
    return this.ready() ? CWDocLang.get() : this.LANGS[0];
  },

  locale() { return this.LOCALES[this.get()] || this.LOCALES.ru; },

  /** true — для этого языка документные строки реально переведены. */
  isTranslated(code) {
    const ready = (typeof window !== 'undefined' && window.PS_DOC_LANGS_READY) || ['ru'];
    return ready.indexOf(code) >= 0;
  },

  t(key, vars) {
    if (typeof CWI18n === 'undefined') return key;
    return CWI18n.t(key, vars, this.get());
  },

  /** Дата в языке документа. Пустое значение — пустая строка, а не «Invalid Date». */
  date(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(this.locale(), { year: 'numeric', month: 'long', day: 'numeric' });
  },

  /**
   * Переводит размеченный документ. Атрибуты намеренно свои (data-doc-i18n*),
   * отдельно от data-i18n интерфейса: общий CWI18n.apply() не должен перевести
   * анкету заодно с оболочкой.
   */
  applyDoc(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    const lang = this.get();
    scope.querySelectorAll('[data-doc-i18n]').forEach((el) => {
      el.textContent = this.t(el.getAttribute('data-doc-i18n'));
    });
    [['data-doc-i18n-title', 'title'], ['data-doc-i18n-placeholder', 'placeholder']].forEach(([attr, prop]) => {
      scope.querySelectorAll(`[${attr}]`).forEach((el) => {
        el.setAttribute(prop, this.t(el.getAttribute(attr)));
      });
    });
    if (typeof document !== 'undefined' && document.documentElement && root === undefined) {
      // На публичной странице язык документа И ЕСТЬ язык страницы — это важно
      // для экранных читалок и переносов. В приложении атрибут ставит CWI18n.
      if (this._override) document.documentElement.lang = lang;
    }
  },

  set(code, options) {
    if (!this.ready()) return this.get();
    return CWDocLang.set(code, options || { scope: 'module' });
  },

  onChange(fn) {
    if (!this.ready()) return () => {};
    return CWDocLang.onChange(fn);
  },

  /**
   * @param {Object} [options]
   * @param {boolean} [options.allowUrlOverride=false] — учитывать ?lang=.
   *   Включается только на register.html: в самом приложении параметр в адресе
   *   не должен незаметно менять язык рассылаемых бумаг.
   */
  init(options) {
    const opts = options || {};
    if (!this.ready()) {
      console.error('pioneer-school: shared/doclang.js не подключён — документы останутся русскими');
      return this.LANGS[0];
    }
    // apply: false — разметку переводим сами, см. шапку файла.
    CWDocLang.init({ module: this.MODULE, langs: this.LANGS, apply: false });
    if (opts.allowUrlOverride) this._override = this._fromUrl();
    return this.get();
  },

  /**
   * Заполняет <select> языками документа. Языки без перевода помечаются
   * явно: молчаливая подстановка русского текста под подписью «Polski»
   * выглядит как баг, а не как «перевод пока не готов».
   */
  fillSelect(select) {
    if (!select || typeof CWI18n === 'undefined') return;
    const pending = typeof T === 'function' ? T('ps.ui.doc_lang_pending') : '(пока по-русски)';
    select.innerHTML = CWI18n.LANGS
      .filter((l) => this.LANGS.indexOf(l.code) >= 0)
      .map((l) => {
        const mark = this.isTranslated(l.code) ? '' : ' ' + pending;
        return `<option value="${l.code}">${l.label}${mark}</option>`;
      })
      .join('');
    select.value = this.get();
  },
};

// window.location через функцию, чтобы файл не падал в jsdom-тестах без адреса.
function global_location() {
  return (typeof window !== 'undefined' && window.location) ? window.location : { search: '' };
}

// Короткий псевдоним под стать T(): в генераторах документов он встречается
// десятки раз, и `D('doc.ps.field.phone')` читается лучше, чем полная форма.
function D(key, vars) { return PSDocLang.t(key, vars); }

if (typeof window !== 'undefined') {
  window.PSDocLang = PSDocLang;
  window.D = D;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { PSDocLang, D };
