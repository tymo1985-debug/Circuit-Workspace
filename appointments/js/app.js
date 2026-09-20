/**
 * Назначения — логика модуля.
 *
 * Исходный автономный бланк (Formuliar v5) не сохранял ничего: перезагрузка
 * страницы стирала все введённые фамилии. Здесь состояние живёт в localStorage
 * под собственным ключом модуля и пишется с задержкой после каждого ввода.
 *
 * ЯЗЫК. Интерфейс переводится общим слоем (data-i18n + CWI18n). Текст самого
 * письма НЕ переводится и остаётся украинским: это готовый документ, который
 * уходит в собрание, его язык — свойство документа, а не оболочки. То же
 * правило действует для печатного плана Конгрессов и формуляров Школы.
 */
(function () {
  'use strict';

  var MODULE_ID = 'appointments';
  var STORE_KEY = 'cw-appointments-v1';   /* Прежний ключ — ТОЛЬКО чтение (см. ниже). */

  /* ─── Фаза D: канон переехал в CWState('appointments') ──────────────────
     Прежний ключ localStorage писала любая вкладка независимо — та же
     причина, по которой фаза C2 увела отправителя в общий слой. Внутренняя
     модель данных (включая PNG-подпись внутри state.signature) не менялась
     ни на бит: меняется только то, КУДА уходит тот же самый JSON-блоб.

     `remote`/`source`/`domainBaselinePayload`/degraded/conflict — тот же
     набор понятий и тот же смысл, что в congress-project/js/state.js (первый
     модуль, прошедший этот путь): `remote.get()` внутри CWState хранит
     НЕПОДТВЕРЖДЁННОЕ (кэш пишется до resolve put()), поэтому «есть ли
     несохранённая правка» считается ОТДЕЛЬНО, от подтверждённого рубежа, а
     не от remote.get() и не от факта «таймер ещё не сработал». */
  var remote = null;
  var source = 'legacy';               // 'db' | 'legacy'
  var domainBaselinePayload = null;
  var degraded = false;
  var conflict = false;

  function domainDirty() {
    if (domainBaselinePayload === null) return false;
    return JSON.stringify(state) !== domainBaselinePayload;
  }
  function markConfirmed(payload) { domainBaselinePayload = payload; }

  function initState() {
    if (!self.CWState || !self.CWDB) return Promise.resolve(false);
    remote = self.CWState.create(MODULE_ID);
    return remote.init().then(function () { return remote.available(); })
      .catch(function (e) {
        console.error('Назначения: общая база недоступна, работаем на прежнем ключе', e);
        return false;
      });
  }

  /** Липкая деградация: канон недоступен — read-only на всю сессию, без
   *  отката в прежний ключ как в записываемый запасной путь. Блокируется
   *  весь редактируемый борт (`<aside class="editor">`) — предпросмотр
   *  письма остаётся читаемым и печатаемым. */
  function enterDegraded() {
    if (degraded) return;
    degraded = true;
    var el = $('#saveStatus');
    if (el) { el.textContent = t('ap.storage_readonly'); el.dataset.state = 'error'; }
    lockEditor(true);
  }
  function lockEditor(locked) {
    document.querySelectorAll('.editor input, .editor button, .editor textarea, .editor select')
      .forEach(function (el) { el.disabled = locked; });
  }
  function enterConflict() {
    conflict = true;
    var el = $('#saveStatus');
    if (el) { el.textContent = t('ap.tab_conflict'); el.dataset.state = 'dirty'; }
  }
  function clearConflict() { conflict = false; }

  /** Чужое каноническое состояние из соседней вкладки. `false` = не приняли
   *  (своя неподтверждённая правка) — CWState вернёт baseRev назад, и канон
   *  на диске останется чужим до следующей успешной записи. */
  function applyForeign(payload) {
    if (domainDirty()) { enterConflict(); return false; }
    var parsed;
    try { parsed = JSON.parse(payload); } catch (e) { return false; }
    if (!parsed || typeof parsed !== 'object') return false;
    applyLoadedState(parsed);
    markConfirmed(payload);
    clearConflict();
    syncBasicFields();
    fillCongregations();
    LISTS.forEach(renderList);
    renderSignaturePanel();
    renderLetter();
    return true;
  }
  function subscribeForeign() {
    if (source !== 'db' || !remote) return;
    remote.onForeign(applyForeign);
  }

  /* Языки документа. Язык интерфейса сюда не заглядывает вообще — это две
     независимые настройки (см. shared/doclang.js). Добавление языка = код
     в этот список + строки doc.* в i18n/dict.js. */
  var DOC_LANGS = ['uk', 'ru', 'de'];

  /* Локаль форматирования даты для каждого языка документа. */
  var DOC_LOCALE = { uk: 'uk-UA', ru: 'ru-RU', de: 'de-DE' };

  /* Поля формы отправителя → поля общего слоя. Имена элементов разметки не
     менялись, чтобы правка не разошлась по всему модулю. */
  var SENDER_MAP = {
    senderName: 'name',
    senderCode: 'code',
    senderAddress: 'address',
    senderPhone1: 'phone1',
    senderPhone2: 'phone2',
    senderEmail: 'email',
  };

  var LISTS = ['elders', 'servants', 'removed'];

  /* --- Подпись: параметры обработки -----------------------------------
     Скан подписи хранится как PNG data URL прямо в состоянии модуля, а не
     в общем слое: это данные Назначений, другие модули к ним не обращаются.
     Плюс к тому, ключ `cw-appointments-v1` уже перечислен в shared/backup.js,
     поэтому подпись едет в резервную копию без правок общего слоя.

     SIGN_MAX_PX ограничивает сторону обработанного изображения: 28 мм (потолок
     регулятора) при 300 dpi — это ~330 px по высоте, тысячи пикселей по стороне
     ничего не добавляют, кроме веса в localStorage.

     SIGN_WHITE / SIGN_INK — пороги яркости. Всё светлее SIGN_WHITE считается
     бумагой и становится полностью прозрачным, всё темнее SIGN_INK — чернилами.
     Промежуток даёт плавную альфу, иначе края букв получают «лесенку». */
  var SIGN_MAX_PX = 1000;
  var SIGN_MAX_BYTES = 120 * 1024;
  var SIGN_H_MIN = 12;
  var SIGN_H_MAX = 28;
  var SIGN_H_DEFAULT = 18;
  var SIGN_WHITE = 235;
  var SIGN_INK = 140;

  var $ = function (sel) { return document.querySelector(sel); };
  var t = function (key, vars) { return self.CWI18n ? self.CWI18n.t(key, vars) : key; };

  /* --- Хранилище ---------------------------------------------------- */
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function defaults() {
    return {
      date: new Date().toISOString().slice(0, 10),
      congregation: '',
      coordinator: '',
      coordinatorAddress: '',
      /* Названия собраний, которые уже вводили — подсказки в поле ввода.
         Собственные данные модуля: раньше список тянулся из справочника
         Конгрессов, то есть модуль читал чужое хранилище. */
      knownCongregations: [],
      lists: { elders: [''], servants: [''], removed: [''] },
      /* image — PNG data URL с прозрачным фоном, heightMm — высота подписи
         на бумаге (регулятор в панели). */
      signature: { image: '', heightMm: SIGN_H_DEFAULT },
    };
  }

  var state = defaults();

  /** Общая нормализация формы — используется и при обычной загрузке, и при
   *  приёме чужого канонического состояния (см. applyForeign выше): подпись
   *  валидируется отдельно (в <img src> нельзя пускать что попало), высота
   *  зажимается в диапазон регулятора, иначе значение из будущей версии
   *  сломает вёрстку письма. */
  function applyLoadedState(saved) {
    state = Object.assign(defaults(), saved);
    state.lists = Object.assign(defaults().lists, saved.lists || {});
    if (!Array.isArray(state.knownCongregations)) state.knownCongregations = [];
    var sig = Object.assign(defaults().signature, saved.signature || {});
    sig.image = (typeof sig.image === 'string' && /^data:image\//.test(sig.image)) ? sig.image : '';
    sig.heightMm = clampHeight(sig.heightMm);
    state.signature = sig;
  }

  /**
   * Читает канон. Промис не отклоняется: недоступная база означает работу
   * на прежнем ключе (read-only), а не отказ запуска — тот же контракт, что
   * у congress-project/js/state.js:initState()/load().
   *
   * СЛУЧАЙ A (канон есть) — он и побеждает, прежний ключ не читается вовсе.
   * СЛУЧАЙ B (канона нет, прежний ключ есть) — разовый перенос, успешным
   *   считается ТОЛЬКО после подтверждённой записи; до неё рубеж не двигается,
   *   и следующий запуск повторит перенос.
   * СЛУЧАЙ C (нет ни того, ни другого) — рубеж не заводится, ни одной
   *   записи из ничего.
   * СЛУЧАЙ D (база недоступна) — read-only, прежний ключ только для показа.
   */
  function load() {
    return initState().then(function (usable) {
      source = usable ? 'db' : 'legacy';
      if (usable) subscribeForeign();
      var raw = usable ? remote.get() : null;
      var fromLegacy = false;
      if (raw === null || raw === undefined) {
        raw = read(STORE_KEY);
        fromLegacy = !!raw;
      }
      if (raw) {
        try {
          var saved = JSON.parse(raw);
          if (saved && typeof saved === 'object') applyLoadedState(saved);
        } catch (e) {
          console.warn('Назначения: сохранённые данные повреждены, начинаем с чистого листа', e);
        }
      }
      if (fromLegacy && usable) {
        var payload = JSON.stringify(state);
        return remote.writeOutcome(payload).then(function (outcome) {
          if (outcome === 'written') { markConfirmed(payload); return; }
          if (outcome === 'refused') { enterConflict(); return; }
          enterDegraded();
        }).catch(function () { enterDegraded(); });
      }
      /* СЛУЧАЙ C нуждается в рубеже ТОЧНО так же, как случай A: без него
         `domainBaselinePayload` остаётся null, а domainDirty() трактует
         null как «правки нет» БЕЗУСЛОВНО — значит первая же чужая запись
         в это самое окно (до первого собственного сохранения) молча
         перезапишет ещё не подтверждённый ввод пользователя. Рубежом
         пустого старта служит сама пустая state — это и есть то, что уже
         «подтверждено» (ничего). */
      if (usable && !fromLegacy) markConfirmed(raw !== null && raw !== undefined ? raw : JSON.stringify(state));
    });
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = null; writeNow(); }, 400);
  }

  /** Статус «сохранено» — ТОЛЬКО после подтверждённой записи, не раньше. */
  function markSaved() {
    var el = $('#saveStatus');
    if (!el || degraded || conflict) return;   // деградация/конфликт устойчивы
    var time = new Date().toLocaleTimeString(self.CWI18n ? self.CWI18n.getLang() : 'ru',
      { hour: '2-digit', minute: '2-digit' });
    el.textContent = t('ap.saved_at', { time: time }); el.dataset.state = 'saved';
  }

  function writeNow() {
    var payload = JSON.stringify(state);
    if (source === 'db') {
      if (payload === remote.get()) { markSaved(); return; }
      remote.writeOutcome(payload).then(function (outcome) {
        if (outcome === 'written') { markConfirmed(payload); clearConflict(); markSaved(); return; }
        if (outcome === 'refused') { enterConflict(); return; }   // REFUSED — не сохранением
        enterDegraded();                                          // FAILED — не сохранением
      }).catch(function () { enterDegraded(); });
      return;
    }
    /* Канон недостижим — прежний ключ БОЛЬШЕ НЕ записывается: это read-only,
       а не запасная запись (фаза D). */
    enterDegraded();
  }

  /* Синхронный флеш на закрытие/скрытие вкладки — иначе последняя правка в
     400-мс окне дебаунса пропадала бы бесшумно (issue уже существовал в C1
     до этой фазы; синхронное зеркало CWState его закрывает). */
  if (self.addEventListener) {
    var onHide = function () {
      if (saveTimer === null) return;
      clearTimeout(saveTimer); saveTimer = null;
      if (source !== 'db') return;              // читать нечем — иначе это была бы запись в легаси
      var payload = JSON.stringify(state);
      if (payload === remote.get()) return;
      var outcome = remote.writeSyncOutcome(payload);
      if (outcome === 'written') { markConfirmed(payload); return; }
      if (outcome === 'refused') { enterConflict(); return; }
      enterDegraded();
    };
    self.addEventListener('pagehide', onHide);
    self.addEventListener('beforeunload', onHide);
    if (self.document && self.document.addEventListener) {
      self.document.addEventListener('visibilitychange', function () {
        if (self.document.visibilityState === 'hidden') onHide();
      });
    }
  }

  /* --- Данные отправителя ---------------------------------------------
     Единственный источник — общий слой shared/sender.js. Модуль не знает и не
     должен знать, какие ещё модули пишут туда же. */
  var EMPTY_SENDER = { name: '', code: '', address: '', phone1: '', phone2: '', email: '' };

  function sender() {
    return self.CWSender ? self.CWSender.get() : Object.assign({}, EMPTY_SENDER);
  }

  /* --- Отрисовка списков в панели ----------------------------------- */
  function listBox(name) { return document.querySelector('[data-list="' + name + '"]'); }

  function renderList(name) {
    var box = listBox(name);
    if (!box) return;
    box.innerHTML = '';
    var values = state.lists[name];
    if (!values.length) values.push('');

    values.forEach(function (value, index) {
      var row = document.createElement('div');
      row.className = 'list-row';

      var input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.placeholder = t('ap.placeholder.name');
      input.addEventListener('input', function () {
        state.lists[name][index] = input.value;
        renderLetter();
        save();
      });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'md-icon-btn';
      remove.textContent = '−';
      remove.title = t('ap.btn.remove_row');
      remove.setAttribute('aria-label', t('ap.btn.remove_row'));
      remove.addEventListener('click', function () {
        state.lists[name].splice(index, 1);
        renderList(name);
        renderLetter();
        save();
      });

      row.appendChild(input);
      row.appendChild(remove);
      box.appendChild(row);
    });
  }

  function names(name) {
    return state.lists[name].map(function (v) { return String(v || '').trim(); }).filter(Boolean);
  }

  /* --- Подпись: обработка изображения ---------------------------------
     Всё считается в браузере, файл никуда не отправляется. */

  function clampHeight(value) {
    var mm = parseInt(value, 10);
    if (isNaN(mm)) return SIGN_H_DEFAULT;
    return Math.min(SIGN_H_MAX, Math.max(SIGN_H_MIN, mm));
  }

  /** Размер data URL в байтах — по длине base64, без выделения буфера. */
  function dataUrlBytes(url) {
    var comma = url.indexOf(',');
    if (comma < 0) return url.length;
    return Math.round((url.length - comma - 1) * 0.75);
  }

  function decodeImage(file, done) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () { done(null, img); };
      img.onerror = function () { done(new Error('decode')); };
      img.src = reader.result;
    };
    reader.onerror = function () { done(new Error('read')); };
    reader.readAsDataURL(file);
  }

  /**
   * Убирает бумагу и обрезает поля.
   * Возвращает canvas с прозрачным фоном или null, если тёмных пикселей нет
   * (пустой лист, засвеченный снимок).
   */
  function keyOutPaper(img, maxSide) {
    var source = Math.max(img.naturalWidth, img.naturalHeight);
    if (!source) return null;
    var scale = Math.min(1, maxSide / source);
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));

    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    var frame;
    try { frame = ctx.getImageData(0, 0, w, h); }
    catch (e) { return null; }

    var px = frame.data;
    var minX = w, minY = h, maxX = -1, maxY = -1;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        var alpha;
        if (lum >= SIGN_WHITE) alpha = 0;
        else if (lum <= SIGN_INK) alpha = 255;
        else alpha = Math.round(255 * (SIGN_WHITE - lum) / (SIGN_WHITE - SIGN_INK));
        /* Уже прозрачные пиксели (PNG с альфой) не должны проявиться. */
        if (alpha > px[i + 3]) alpha = px[i + 3];
        px[i + 3] = alpha;
        if (alpha > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;

    ctx.putImageData(frame, 0, 0);

    /* Обрезка полей: иначе высота подписи в письме считается от размеров
       листа, а не от самой подписи, и регулятор врёт. */
    var pad = 2;
    var cx = Math.max(0, minX - pad);
    var cy = Math.max(0, minY - pad);
    var cw = Math.min(w, maxX + pad + 1) - cx;
    var ch = Math.min(h, maxY + pad + 1) - cy;

    var out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    out.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    return out;
  }

  /** Подгоняет результат под лимит localStorage последовательным уменьшением. */
  function buildSignature(img) {
    var side = SIGN_MAX_PX;
    for (var attempt = 0; attempt < 4; attempt++) {
      var canvas = keyOutPaper(img, side);
      if (!canvas) return { error: 'blank' };
      var url = canvas.toDataURL('image/png');
      if (dataUrlBytes(url) <= SIGN_MAX_BYTES) return { image: url };
      side = Math.round(side * 0.75);
    }
    return { error: 'too_big' };
  }

  function signStatus(text, state_) {
    var el = $('#signStatus');
    if (!el) return;
    el.textContent = text || '';
    if (state_) el.dataset.state = state_;
    else delete el.dataset.state;
  }

  function applySignature(file) {
    if (!file) return;
    signStatus(t('ap.sign.processing'), '');
    decodeImage(file, function (err, img) {
      if (err) { signStatus(t('ap.sign.err_read'), 'error'); return; }
      var result = buildSignature(img);
      if (result.error === 'blank') { signStatus(t('ap.sign.err_blank'), 'error'); return; }
      if (result.error) { signStatus(t('ap.sign.err_big'), 'error'); return; }
      state.signature.image = result.image;
      signStatus('', '');
      renderSignaturePanel();
      renderLetter();
      save();
    });
  }

  function renderSignaturePanel() {
    var has = !!state.signature.image;

    var preview = $('#signPreview');
    var previewImg = $('#signPreviewImg');
    if (previewImg) {
      if (has) previewImg.src = state.signature.image;
      else previewImg.removeAttribute('src');
      previewImg.alt = t('ap.sign.heading');
    }
    if (preview) preview.hidden = !has;

    var sizeRow = $('#signSizeRow');
    if (sizeRow) sizeRow.hidden = !has;

    var range = $('#signSize');
    if (range) range.value = state.signature.heightMm;

    var out = $('#signSizeOut');
    if (out) out.textContent = state.signature.heightMm + ' ' + t('ap.sign.mm');

    var clear = $('#signClearBtn');
    if (clear) clear.disabled = !has;

    /* Подпись кнопки зависит от состояния, поэтому data-i18n на ней нет —
       текст ставится здесь, а перерисовку при смене языка обеспечивает
       подписка в initLanguage(). */
    var pick = $('#signPickBtn');
    if (pick) pick.textContent = has ? t('ap.sign.replace') : t('ap.sign.upload');
  }

  /* --- Отрисовка письма --------------------------------------------- */
  function docLang() { return self.CWDocLang ? self.CWDocLang.get() : DOC_LANGS[0]; }

  /** Строка документа: тот же словарь CWI18n, но на языке документа. */
  function d(key, vars) {
    return self.CWI18n ? self.CWI18n.t(key, vars, docLang()) : key;
  }

  function docDate(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date)) return '';
    /* Локаль берётся от языка документа: дата — часть бумаги, а не оболочки. */
    try {
      return new Intl.DateTimeFormat(DOC_LOCALE[docLang()] || 'uk-UA',
        { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    } catch (e) { return iso; }
  }

  function fillNames(nodeId, list) {
    var ul = document.getElementById(nodeId);
    if (!ul) return;
    ul.innerHTML = '';
    if (!list.length) {
      /* Раздел остаётся в письме даже без данных — печатается короткая
         линия-плейсхолдер (см. .names-empty в css/styles.css). */
      var placeholder = document.createElement('li');
      placeholder.className = 'names-empty';
      placeholder.setAttribute('aria-hidden', 'true');
      ul.appendChild(placeholder);
      return;
    }
    list.forEach(function (value) {
      var li = document.createElement('li');
      li.textContent = value;
      ul.appendChild(li);
    });
  }

  function renderLetter() {
    var sd = sender();

    var senderLines = [sd.name, sd.code, sd.address, sd.phone1, sd.phone2, sd.email]
      .filter(function (line) { return String(line || '').trim(); });
    $('#outSender').textContent = senderLines.join('\n');

    /* Постоянные строки документа переводит CWDocLang.apply() по разметке;
       здесь — только те, в которые подставляются данные. */
    if (self.CWDocLang) self.CWDocLang.apply($('#letter'));
    document.getElementById('letter').setAttribute('lang', docLang());

    $('#outDate').textContent = docDate(state.date);
    $('#outCong').textContent = d('doc.ap.congregation', { name: state.congregation.trim() || '—' });
    $('#outCoordinator').textContent = state.coordinator.trim()
      ? d('doc.ap.via', { name: state.coordinator.trim() })
      : '';
    $('#outCoordinatorAddress').textContent = state.coordinatorAddress.trim();

    fillNames('outElders', names('elders'));
    fillNames('outServants', names('servants'));
    fillNames('outRemoved', names('removed'));

    $('#outSignName').textContent = sd.name || '';
    $('#outSignCode').textContent = sd.code || '';

    /* Картинка подписи — под кодом района. Размер задаётся переменной на
       самом письме, чтобы правило высоты жило в CSS, а не в стилях узла. */
    var signImage = $('#outSignImage');
    if (signImage) {
      if (state.signature.image) {
        signImage.src = state.signature.image;
        signImage.hidden = false;
      } else {
        signImage.removeAttribute('src');
        signImage.hidden = true;
      }
    }
    $('#letter').style.setProperty('--ap-sign-h', state.signature.heightMm + 'mm');
  }

  /* --- Панель отправителя -------------------------------------------- */
  function renderSenderPanel() {
    var sd = sender();
    var locked = !!(self.CWSender && typeof self.CWSender.status === 'function' && self.CWSender.status() === 'degraded');
    Object.keys(SENDER_MAP).forEach(function (id) {
      var el = document.getElementById(id);
      /* Не перетираем поле, в котором сейчас печатают: обновление может
         прийти из другой вкладки или другого модуля. */
      if (el && document.activeElement !== el) el.value = sd[SENDER_MAP[id]] || '';
      if (el) el.disabled = locked;
    });
  }

  /* --- Имя файла при печати ------------------------------------------
     Сохранено из исходного бланка: браузер подставляет document.title в
     имя PDF, поэтому на время печати заголовок подменяется на состав
     письма и возвращается обратно после. */
  function sanitize(value) {
    return String(value).replace(/[\\/:*?"<>|]/g, '').trim();
  }

  function printTitle() {
    var appointed = names('elders').concat(names('servants')).map(sanitize).filter(Boolean);
    var removed = names('removed').map(sanitize).filter(Boolean);
    var parts = [];
    if (appointed.length) parts.push(d('doc.ap.print.appointed') + ' – ' + appointed.join('; '));
    if (removed.length) parts.push(d('doc.ap.print.removed') + ' – ' + removed.join('; '));
    return parts.length ? parts.join('; ') : null;
  }

  /* Подмена заголовка вкладки (браузер берёт из неё имя PDF) уехала в
     shared/print.js: тот же приём с той же защитой от двойного beforeprint
     нужен и Конгрессам, где его не было. Имя передаётся ФУНКЦИЕЙ, а не
     строкой: состав письма меняется, пока пользователь правит форму, и
     собирать имя надо в момент печати. Пустой ответ = заголовок не трогаем. */

  /* --- Переключатель языка -------------------------------------------- */
  /* Мост целиком в общем слое (29.08.2026): CWI18n.bindModule(). Заполнение
     селектора, значение «как в хабе», обработчик change и подписка на
     onChange были построчной копией того же кода в трёх других модулях.

     Одна мелочь заодно перестала полагаться на умолчание: здесь `setLang()`
     звался без `{ scope: 'module' }`. Дефекта в этом НЕ БЫЛО — проверено на
     релизной сборке: `setLang` сам выбирает `module`, когда id модуля задан,
     и общий ключ `cw-lang` оставался нетронутым. Но читалось это как запись в
     язык всей экосистемы, а держаться на умолчании там, где остальные три
     модуля пишут область явно, — лишний повод для сомнений при чтении. */
  function initLanguage() {
    if (!self.CWI18n) return;
    self.CWI18n.bindModule({
      module: MODULE_ID,
      select: 'uiLanguage',
      onChange: function () {
        /* Панель и списки строятся скриптом, а не разметкой, поэтому общий
           apply() их не достаёт — перерисовываем сами. */
        LISTS.forEach(renderList);
        renderSenderPanel();
        renderSignaturePanel();
      },
    });
  }

  /* --- Связывание полей ----------------------------------------------- */
  /* id → ключ state. Общий список: bind() ставит слушатели и начальные
     значения, syncBasicFields() — переставляет значения без слушателей
     (после приёма чужого канонического состояния — см. applyForeign выше). */
  var BASIC_FIELDS = { letterDate: 'date', congName: 'congregation', coordinator: 'coordinator', coordinatorAddress: 'coordinatorAddress' };

  function syncBasicFields() {
    Object.keys(BASIC_FIELDS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && document.activeElement !== el) el.value = state[BASIC_FIELDS[id]];
    });
  }

  function bindField(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = state[key];
    el.addEventListener('input', function () {
      state[key] = el.value;
      renderLetter();
      save();
    });
  }

  function bind() {
    Object.keys(BASIC_FIELDS).forEach(function (id) { bindField(id, BASIC_FIELDS[id]); });

    var newLetterBtn = $('#newLetterBtn');
    if (newLetterBtn) {
      newLetterBtn.addEventListener('click', function () {
        if (!window.confirm(t('ap.confirm.new_letter'))) return;
        state.date = new Date().toISOString().slice(0, 10);
        state.congregation = '';
        state.coordinator = '';
        state.coordinatorAddress = '';
        state.lists.elders = [''];
        state.lists.servants = [''];
        state.lists.removed = [''];
        $('#letterDate').value = state.date;
        $('#congName').value = '';
        $('#coordinator').value = '';
        $('#coordinatorAddress').value = '';
        renderList('elders');
        renderList('servants');
        renderList('removed');
        renderLetter();
        save();
      });
    }

    document.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-add');
        state.lists[name].push('');
        renderList(name);
        var rows = listBox(name).querySelectorAll('input');
        if (rows.length) rows[rows.length - 1].focus();
        save();
      });
    });

    document.querySelectorAll('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-clear');
        state.lists[name] = [''];
        renderList(name);
        renderLetter();
        save();
      });
    });

    /* Отправитель живёт в общем слое: пишем сразу туда, в состоянии модуля
       его копии нет. Своё хранилище save() при этом не трогаем. */
    Object.keys(SENDER_MAP).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || !self.CWSender) return;
      el.addEventListener('input', function () {
        var patch = {};
        patch[SENDER_MAP[id]] = el.value;
        self.CWSender.set(patch);
      });
    });

    /* Данные могли поменять в другом модуле или в соседней вкладке. */
    if (self.CWSender) {
      self.CWSender.onChange(function () { renderSenderPanel(); renderLetter(); });
      if (typeof self.CWSender.onStatusChange === 'function') self.CWSender.onStatusChange(renderSenderPanel);
    }

    /* Собрание запоминается в подсказки — но только когда его дописали до
       конца, а не после каждой нажатой буквы. */
    $('#congName').addEventListener('change', function () {
      var name = $('#congName').value.trim();
      if (!name || state.knownCongregations.indexOf(name) >= 0) return;
      state.knownCongregations.push(name);
      state.knownCongregations = state.knownCongregations.slice(-20);
      fillCongregations();
      save();
    });

    bindSignature();

    $('#printBtn').addEventListener('click', function () { window.print(); });
    CWPrint.filename(printTitle);
  }

  /* --- Подпись: события панели ----------------------------------------- */
  function bindSignature() {
    var file = $('#signFile');
    var pick = $('#signPickBtn');

    if (pick && file) {
      pick.addEventListener('click', function () { file.click(); });
    }
    if (file) {
      file.addEventListener('change', function () {
        applySignature(file.files && file.files[0]);
        /* Сброс значения: иначе повторный выбор того же файла (например,
           после «Удалить») не вызывает change. */
        file.value = '';
      });
    }

    var clear = $('#signClearBtn');
    if (clear) {
      clear.addEventListener('click', function () {
        state.signature.image = '';
        signStatus('', '');
        renderSignaturePanel();
        renderLetter();
        save();
      });
    }

    var range = $('#signSize');
    if (range) {
      range.min = SIGN_H_MIN;
      range.max = SIGN_H_MAX;
      range.addEventListener('input', function () {
        state.signature.heightMm = clampHeight(range.value);
        var out = $('#signSizeOut');
        if (out) out.textContent = state.signature.heightMm + ' ' + t('ap.sign.mm');
        renderLetter();
        save();
      });
    }
  }

  /* --- Подсказки собраний ---------------------------------------------
     Собственная история ввода. Раньше список приходил из справочника
     Конгрессов — удобно, но это было чтение чужого хранилища. */
  function fillCongregations() {
    var datalist = $('#congList');
    if (!datalist) return;
    datalist.innerHTML = '';
    state.knownCongregations.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      datalist.appendChild(option);
    });
  }

  /* --- Переключатель языка документа ------------------------------------
     Отдельный от языка интерфейса контрол: смена одного не трогает другое. */
  function initDocLanguage() {
    var select = $('#docLanguage');
    if (!select || !self.CWDocLang) return;

    self.CWDocLang.init({ module: MODULE_ID, langs: DOC_LANGS, apply: false });

    /* Подписи языков — эндонимы из общего реестра, они не переводятся. */
    var labels = {};
    if (self.CWI18n) self.CWI18n.LANGS.forEach(function (l) { labels[l.code] = l.label; });

    DOC_LANGS.forEach(function (code) {
      var option = document.createElement('option');
      option.value = code;
      option.textContent = labels[code] || code;
      select.appendChild(option);
    });
    select.value = self.CWDocLang.get();

    select.addEventListener('change', function (e) {
      self.CWDocLang.set(e.target.value);
      renderLetter();
    });

    self.CWDocLang.onChange(function (lang) { select.value = lang; renderLetter(); });
  }

  /* --- Старт ----------------------------------------------------------- */
  function start() {
    initLanguage();

    /* Фаза C1: sender остаётся синхронным (backend не менялся), реального
       ожидания здесь нет — точка нужна заранее для фазы C2, когда ниже
       renderSenderPanel()/renderLetter() начнут зависеть от общей базы. */
    /* ЗАЩИТА ОБНОВЛЕНИЯ: старый sender без ready() считается готовым. */
    if (self.CWSender && typeof self.CWSender.ready === 'function') self.CWSender.ready();

    var version = (self.CW_MODULES && self.CW_MODULES[MODULE_ID] || {}).version;
    if (version) $('#moduleVersion').textContent = 'v' + version;

    initDocLanguage();

    /* Фаза D: load() теперь асинхронный (CWState.init() — промис). bind()
       читает state[key] СРАЗУ, чтобы проставить значения в поля (см.
       bindField()), поэтому он обязан ждать вместе с рендером — иначе поля
       заполнились бы значениями по умолчанию и остались бы такими: rebind
       после load() задвоил бы обработчики ввода. */
    load().then(function () {
      bind();
      fillCongregations();
      LISTS.forEach(renderList);
      renderSenderPanel();
      renderSignaturePanel();
      renderLetter();
    });

    // Регистрация SW и отслеживание обновлений — общий слой (shared/update.js).
    if (typeof CWUpdate !== 'undefined') CWUpdate.init({ swUrl: 'sw.js', ui: 'silent', hubHref: '../index.html' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
