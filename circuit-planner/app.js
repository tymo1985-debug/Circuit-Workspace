
// Service Year Planner v9.6.0 color names for meetings
(function () {
  'use strict';

  // Inline favicon fallback: prevents /favicon.ico 404 when index.html has no icon.
  if (!document.querySelector('link[rel~="icon"]')) {
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%231f7a45%22/%3E%3Ctext x=%2232%22 y=%2242%22 text-anchor=%22middle%22 font-size=%2234%22%3E%F0%9F%93%86%3C/text%3E%3C/svg%3E';
    document.head.appendChild(favicon);
  }

  // Словарь модуля вынесен в i18n/dict.js и живёт в общем слое (префикс `cp.`).
  // Здесь он больше не хранится: раньше это были ~39 КБ внутри app.js, недоступные
  // ни хабу, ни другим модулям, и правились они вручную по индексам.

  // --- Merged from the standalone "Visit Planner / Формуляр посещения" project ---
  // Minimal i18n shim satisfying visit-pdf.js's contract: t(key), lang, WEEKDAYS, MEETING_TYPES, MEAL_DAY_KEYS.
  // Strings copied verbatim from that project's own ru dictionary so the generated PDF matches exactly.
  const VP_I18N_DICTS = {
    ru: {
      visitTypeMeeting: 'Собрание', visitTypeGroup: 'Группа', visitTypePregroup: 'Предгруппа',
      meetingTypeMidweek: 'Встреча середины недели', meetingTypeWeekend: 'Встреча выходного дня', meetingTypeElders: 'Встреча старейшин', meetingTypeWithElders: 'Встреча со старейшинами', meetingTypePioneers: 'Встреча с пионерами', meetingTypeOther: 'Другое',
      meetingTypeLabel: 'Тип встречи', dayLabel: 'День недели', timeLabel: 'Время', placeLabel: 'Место проведения',
      weekdayMon: 'Понедельник', weekdayTue: 'Вторник', weekdayWed: 'Среда', weekdayThu: 'Четверг', weekdayFri: 'Пятница', weekdaySat: 'Суббота', weekdaySun: 'Воскресенье',
      serviceTableTime: 'Время', serviceTablePlace: 'Место проведения встречи', serviceTablePartner: 'С кем (имя/тел.)', serviceTableKind: 'Вид служения',
      pastoralName: 'Имя', pastoralDay: 'День', pastoralTime: 'Время', pastoralReason: 'Причина пастырского посещения',
      mealDay: 'День', mealTime: 'Время', mealPlace: 'Место', mealHost: 'Кто принимает', mealPhone: 'Телефон', mealNote: 'Примечание',
      pdfPageForAlex: 'Формуляр для Алексея', pdfPageForLydia: 'Формуляр для Лидии', partnerNameAlex: 'Алексей', partnerNameLydia: 'Лидия', pdfVisitTypeLabel: 'Тип посещения:',
      pdfMeetingsSchedule: 'Расписание встреч', pdfServicePlan: 'План служения', pdfPastoralVisits: 'Пастырские посещения', pdfMeals: 'Обеды', pdfNotes: 'Дополнительные заметки',
      pdfManualLinesTitle: 'Для заметок вручную', pdfGeneratedOn: 'Документ сформирован',
    },
    uk: {
      visitTypeMeeting: 'Збори', visitTypeGroup: 'Група', visitTypePregroup: 'Передгрупа',
      meetingTypeMidweek: 'Зустріч серед тижня', meetingTypeWeekend: 'Зустріч на вихідних', meetingTypeElders: 'Зустріч старійшин', meetingTypeWithElders: 'Зустріч зі старійшинами', meetingTypePioneers: 'Зустріч з піонерами', meetingTypeOther: 'Інше',
      meetingTypeLabel: 'Тип зустрічі', dayLabel: 'День тижня', timeLabel: 'Час', placeLabel: 'Місце проведення',
      weekdayMon: 'Понеділок', weekdayTue: 'Вівторок', weekdayWed: 'Середа', weekdayThu: 'Четвер', weekdayFri: "П'ятниця", weekdaySat: 'Субота', weekdaySun: 'Неділя',
      serviceTableTime: 'Час', serviceTablePlace: 'Місце проведення зустрічі', serviceTablePartner: 'З ким (ім\u2019я/тел.)', serviceTableKind: 'Вид служіння',
      pastoralName: "Ім'я", pastoralDay: 'День', pastoralTime: 'Час', pastoralReason: 'Причина пастирського відвідування',
      mealDay: 'День', mealTime: 'Час', mealPlace: 'Місце', mealHost: 'Хто приймає', mealPhone: 'Телефон', mealNote: 'Примітка',
      pdfPageForAlex: 'Формуляр для Олексія', pdfPageForLydia: 'Формуляр для Лідії', partnerNameAlex: 'Олексій', partnerNameLydia: 'Лідія', pdfVisitTypeLabel: 'Тип відвідування:',
      pdfMeetingsSchedule: 'Розклад зустрічей', pdfServicePlan: 'План служіння', pdfPastoralVisits: 'Пастирські відвідування', pdfMeals: 'Обіди', pdfNotes: 'Додаткові нотатки',
      pdfManualLinesTitle: 'Для нотаток вручну', pdfGeneratedOn: 'Документ сформовано',
    },
    en: {
      visitTypeMeeting: 'Congregation', visitTypeGroup: 'Group', visitTypePregroup: 'Pregroup',
      meetingTypeMidweek: 'Midweek meeting', meetingTypeWeekend: 'Weekend meeting', meetingTypeElders: "Elders' meeting", meetingTypeWithElders: 'Meeting with elders', meetingTypePioneers: 'Meeting with pioneers', meetingTypeOther: 'Other',
      meetingTypeLabel: 'Meeting type', dayLabel: 'Day of week', timeLabel: 'Time', placeLabel: 'Place',
      weekdayMon: 'Monday', weekdayTue: 'Tuesday', weekdayWed: 'Wednesday', weekdayThu: 'Thursday', weekdayFri: 'Friday', weekdaySat: 'Saturday', weekdaySun: 'Sunday',
      serviceTableTime: 'Time', serviceTablePlace: 'Meeting place', serviceTablePartner: 'With whom (name/phone)', serviceTableKind: 'Type of ministry',
      pastoralName: 'Name', pastoralDay: 'Day', pastoralTime: 'Time', pastoralReason: 'Reason for shepherding call',
      mealDay: 'Day', mealTime: 'Time', mealPlace: 'Place', mealHost: 'Host', mealPhone: 'Phone', mealNote: 'Note',
      pdfPageForAlex: "Alexei's form", pdfPageForLydia: "Lydia's form", partnerNameAlex: 'Alexei', partnerNameLydia: 'Lydia', pdfVisitTypeLabel: 'Visit type:',
      pdfMeetingsSchedule: 'Meeting schedule', pdfServicePlan: 'Field service plan', pdfPastoralVisits: 'Shepherding calls', pdfMeals: 'Meals', pdfNotes: 'Additional notes',
      pdfManualLinesTitle: 'For handwritten notes', pdfGeneratedOn: 'Document generated on',
    },
    pl: {
      visitTypeMeeting: 'Zbór', visitTypeGroup: 'Grupa', visitTypePregroup: 'Pregrupa',
      meetingTypeMidweek: 'Zebranie w tygodniu', meetingTypeWeekend: 'Zebranie weekendowe', meetingTypeElders: 'Zebranie starszych', meetingTypeWithElders: 'Spotkanie ze starszymi', meetingTypePioneers: 'Spotkanie z pionierami', meetingTypeOther: 'Inne',
      meetingTypeLabel: 'Rodzaj spotkania', dayLabel: 'Dzień tygodnia', timeLabel: 'Godzina', placeLabel: 'Miejsce',
      weekdayMon: 'Poniedziałek', weekdayTue: 'Wtorek', weekdayWed: 'Środa', weekdayThu: 'Czwartek', weekdayFri: 'Piątek', weekdaySat: 'Sobota', weekdaySun: 'Niedziela',
      serviceTableTime: 'Godzina', serviceTablePlace: 'Miejsce spotkania', serviceTablePartner: 'Z kim (imi\u0119/tel.)', serviceTableKind: 'Rodzaj słu\u017cby',
      pastoralName: 'Imię', pastoralDay: 'Dzień', pastoralTime: 'Godzina', pastoralReason: 'Powód odwiedzin pasterskich',
      mealDay: 'Dzień', mealTime: 'Godzina', mealPlace: 'Miejsce', mealHost: 'Kto przyjmuje', mealPhone: 'Telefon', mealNote: 'Uwaga',
      pdfPageForAlex: 'Formularz dla Aleksieja', pdfPageForLydia: 'Formularz dla Lidii', partnerNameAlex: 'Aleksiej', partnerNameLydia: 'Lidia', pdfVisitTypeLabel: 'Rodzaj odwiedzin:',
      pdfMeetingsSchedule: 'Harmonogram spotkań', pdfServicePlan: 'Plan służby', pdfPastoralVisits: 'Odwiedziny pasterskie', pdfMeals: 'Posiłki', pdfNotes: 'Dodatkowe uwagi',
      pdfManualLinesTitle: 'Na notatki odręczne', pdfGeneratedOn: 'Dokument utworzono',
    },
    de: {
      visitTypeMeeting: 'Versammlung', visitTypeGroup: 'Gruppe', visitTypePregroup: 'Vorgruppe',
      meetingTypeMidweek: 'Zusammenkunft unter der Woche', meetingTypeWeekend: 'Zusammenkunft am Wochenende', meetingTypeElders: 'Ältestensitzung', meetingTypeWithElders: 'Zusammenkunft mit den Ältesten', meetingTypePioneers: 'Zusammenkunft mit den Pionieren', meetingTypeOther: 'Sonstiges',
      meetingTypeLabel: 'Art der Zusammenkunft', dayLabel: 'Wochentag', timeLabel: 'Uhrzeit', placeLabel: 'Ort',
      weekdayMon: 'Montag', weekdayTue: 'Dienstag', weekdayWed: 'Mittwoch', weekdayThu: 'Donnerstag', weekdayFri: 'Freitag', weekdaySat: 'Samstag', weekdaySun: 'Sonntag',
      serviceTableTime: 'Uhrzeit', serviceTablePlace: 'Treffpunkt', serviceTablePartner: 'Mit wem (Name/Telefon)', serviceTableKind: 'Art des Dienstes',
      pastoralName: 'Name', pastoralDay: 'Tag', pastoralTime: 'Uhrzeit', pastoralReason: 'Grund für den Hirtenbesuch',
      mealDay: 'Tag', mealTime: 'Uhrzeit', mealPlace: 'Ort', mealHost: 'Gastgeber', mealPhone: 'Telefon', mealNote: 'Anmerkung',
      pdfPageForAlex: 'Formular für Alexej', pdfPageForLydia: 'Formular für Lydia', partnerNameAlex: 'Alexej', partnerNameLydia: 'Lydia', pdfVisitTypeLabel: 'Art des Besuchs:',
      pdfMeetingsSchedule: 'Plan der Zusammenkünfte', pdfServicePlan: 'Predigtdienstplan', pdfPastoralVisits: 'Hirtenbesuche', pdfMeals: 'Mahlzeiten', pdfNotes: 'Zusätzliche Notizen',
      pdfManualLinesTitle: 'Für handschriftliche Notizen', pdfGeneratedOn: 'Dokument erstellt am',
    },
  };
  function buildVpI18n(lang) {
    const safeLang = VP_I18N_DICTS[lang] ? lang : 'ru';
    return {
      lang: safeLang,
      WEEKDAYS: ['weekdayMon','weekdayTue','weekdayWed','weekdayThu','weekdayFri','weekdaySat','weekdaySun'],
      MEETING_TYPES: ['meetingTypeMidweek','meetingTypeWeekend','meetingTypeElders','meetingTypeWithElders','meetingTypePioneers','meetingTypeOther'],
      MEAL_DAY_KEYS: ['weekdayWed','weekdayThu','weekdayFri','weekdaySat','weekdaySun'],
      dict: VP_I18N_DICTS[safeLang],
      t(key) { return this.dict[key] || key; },
    };
  }
  const VP_LANG_NAMES = { ru: 'Русский', uk: 'Українська', en: 'English', pl: 'Polski', de: 'Deutsch' };

  /* Системные тексты писем живут в общем слое — shared/templates/builtin.js.
     Здесь остались только чтения: второго экземпляра текста в модуле нет, и
     правка формулировки делается в одном месте, а не в двух.

     `vpEscapeForHtml` оставлен: им пользуется не только шаблон. */
  function vpEscapeForHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function builtinDoc(kind, suffix) {
    const type = { Congregation: 'congregation', Group: 'group', Pregroup: 'pregroup' }[suffix] || 'congregation';
    const list = self.CW_BUILTIN_TEMPLATES || [];
    return list.find((t) => t.id === 'sys.visit.' + type + '.' + kind) || null;
  }
  function builtinBody(kind, suffix) {
    const tpl = builtinDoc(kind, suffix);
    if (!tpl) return '';
    const tr = tpl.translations || {};
    const first = Object.keys(tr).map((k) => tr[k]).find((x) => x && x.body);
    return first ? first.body : '';
  }
  const DEFAULT_LETTER_TEMPLATE_HTML = builtinBody('letter', 'Congregation');
  const DEFAULT_EMAIL_BODY_TEMPLATES = {
    Congregation: builtinBody('email', 'Congregation'),
    Group: builtinBody('email', 'Group'),
    Pregroup: builtinBody('email', 'Pregroup'),
  };
  const DEFAULT_LETTER_SALUTATIONS = {
    Congregation: builtinBody('salutation', 'Congregation'),
    Group: builtinBody('salutation', 'Group'),
    Pregroup: builtinBody('salutation', 'Pregroup'),
  };
  /** Страницы письма по умолчанию (памятка координатору). */
  function builtinPages(suffix) {
    const tpl = builtinDoc('letter', suffix);
    return tpl && Array.isArray(tpl.pages) ? JSON.parse(JSON.stringify(tpl.pages)) : [];
  }

  const LETTER_SUBJECT_PARTS = {
    ru: { prefix: 'Посещение районного надзирателя', type: { Congregation: 'собрания', Group: 'группы', Pregroup: 'предгруппы' }, from: 'с', to: 'по' },
    uk: { prefix: 'Візит районного наглядача', type: { Congregation: 'збору', Group: 'групи', Pregroup: 'передгрупи' }, from: 'з', to: 'по' },
    en: { prefix: 'Circuit overseer visit to', type: { Congregation: 'congregation', Group: 'group', Pregroup: 'pregroup' }, from: 'from', to: 'to' },
    pl: { prefix: 'Wizyta nadzorcy obwodu w', type: { Congregation: 'zborze', Group: 'grupie', Pregroup: 'przedgrupie' }, from: 'od', to: 'do' },
    de: { prefix: 'Besuch des Kreisaufsehers in', type: { Congregation: 'der Versammlung', Group: 'der Gruppe', Pregroup: 'der Vorgruppe' }, from: 'vom', to: 'bis' },
  };

  const App = {
    config: {
      // Single source of truth for the displayed/stored app version — bump this on
      // every meaningful update so the version badge always reflects what's actually live.
      version: '9.85.0',
      // NOTE: do NOT change this to match the app version — it is the localStorage key.
      // Changing it will make existing users lose all their saved data on next load.
      storageKey: 'service-year-planner-v9-4-2',
      historyKey: 'service-year-planner-v9-4-2-history',
      snapshotIntervalMs: 5 * 60 * 1000, // at most one checkpoint every 5 minutes
      maxSnapshots: 15,
      twoMonthBreakpoint: 1700, // viewport width at which month view shows two months side by side
      /* Начало служебного года. Источник истины — `shared/serviceyear.js`;
         число 8 здесь только запасное значение на случай, когда общий слой
         не подключён. Читается один раз при построении App.config, поэтому
         serviceyear.js обязан грузиться раньше app.js (см. index.html).
         Само поле оставлено под прежним именем: семь мест внутри модуля
         считают месяцы напрямую от него, и трогать их не потребовалось. */
      serviceYearStartMonth: (typeof self !== 'undefined' && self.CWServiceYear) ? self.CWServiceYear.START_MONTH : 8,
      navItems: [
        { id: 'calendar', icon: '📆', tKey: 'nav_calendar' },
        { id: 'events', icon: '🎯', tKey: 'nav_events' },
        { id: 'settings', icon: '⚙️', tKey: 'nav_settings' }
      ],
      layoutPresets: [
        { value: 'classic', labelKey: 'layout_classic' }, { value: 'compact', labelKey: 'layout_compact' }, { value: 'spacious', labelKey: 'layout_spacious' }
      ],
      monthNames: {
        ru: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
        en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
        uk: ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],
        pl: ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
      },
      dayNames: {
        ru: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'], en: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], uk: ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'], pl: ['Pn','Wt','Śr','Cz','Pt','Sb','Nd']
      },
      priorities: { normal: 'priority_normal', important: 'priority_important', critical: 'priority_critical' }
    },

    els: {},
    state: {
      app: null,
      selectedScreen: 'calendar',
      selectedYear: new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1,
      selectedWeekId: null,
      editingEventId: null,
      calendarMonth: new Date().getMonth(),
      calendarYear: new Date().getFullYear(),
      calendarDetailId: null,
      calendarEventFilter: 'all',
      calendarEditingTarget: null,
      weekSearch: '',
      noteSearch: '',
      exportType: 'json',
      pdfExportType: 'month-grid',
      teamPanelHidden: false,
      calendarView: 'month',
      calendarSelectedDateIso: null,
      eventSearch: '',
      eventColorFilter: 'all'
    },

    utils: {
      uid(prefix = 'id') { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; },
      lang() {
        // Язык модуля по-прежнему живёт в его собственных настройках (мост
        // App.i18nBridge держит их в согласии с языком хаба). Здесь только
        // страховка от значения, которого нет в словаре модуля.
        const lang = App.state.app?.settings?.language || 'ru';
        return App.i18nBridge.SUPPORTED.includes(lang) ? lang : 'ru';
      },
      t(key, vars = {}) {
        // Ключи вызовов не менялись — префикс `cp.` подставляется здесь, чтобы
        // перенос словаря не потребовал править сотни мест вызова.
        if (typeof CWI18n === 'undefined') return key;
        const full = `cp.${key}`;
        // Третий аргумент — явный язык: у модуля пока нет немецкого, и при
        // `cw-lang=de` показать нужно ближайший доступный, а не русский.
        let value = CWI18n.t(full, null, this.lang());
        if (value === full) value = key;
        Object.keys(vars).forEach((k) => { value = value.replace(`{${k}}`, String(vars[k])); });
        return value;
      },
      /* Названия месяцев и сокращения дней недели.

         Своя таблица (App.config.monthNames/dayNames) имеет приоритет —
         ru/uk/en/pl остаются ровно такими, какими были, и ни один
         существующий экран не меняется. Нет таблицы для языка — берём
         данные локали у браузера через Intl, а не падаем в русский.

         ЗАЧЕМ ТАК, а не пятым блоком в таблице. Календарные названия —
         не перевод в смысле «формулировка, которую пишет носитель», а
         справочные данные локали, и они у браузера уже есть. Немецкий
         запуск 18.08.2026 упирался в заголовок «Август 2026»; вместо
         дописывания 19 строк вручную закрыт весь класс — следующий язык
         получит календарь сразу и без правки кода.

         Первое января взято опорной датой для месяцев, а 5 января 2026 —
         это понедельник, отсюда порядок дней Пн→Вс, как в остальных
         таблицах. Результат кэшируется: Intl.DateTimeFormat создаётся
         недёшево, а сетка календаря зовёт dayNames() на каждую отрисовку. */
      _intlNamesCache: {},
      _intlNames(lang, kind) {
        const cacheKey = lang + ':' + kind;
        if (this._intlNamesCache[cacheKey]) return this._intlNamesCache[cacheKey];
        let out;
        try {
          if (kind === 'month') {
            const fmt = new Intl.DateTimeFormat(lang, { month: 'long' });
            out = Array.from({ length: 12 }, (_, m) => {
              const name = fmt.format(new Date(2026, m, 1));
              return name.charAt(0).toUpperCase() + name.slice(1);
            });
          } else {
            const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
            out = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, 5 + i)));
          }
        } catch (e) {
          // Неизвестный языковой тег — Intl бросает RangeError. Тогда уж русский.
          out = kind === 'month' ? App.config.monthNames.ru : App.config.dayNames.ru;
        }
        this._intlNamesCache[cacheKey] = out;
        return out;
      },
      monthName(index) {
        const lang = this.lang();
        return (App.config.monthNames[lang] || this._intlNames(lang, 'month'))[index];
      },
      dayNames() {
        const lang = this.lang();
        return App.config.dayNames[lang] || this._intlNames(lang, 'day');
      },
      iso(date) {
        // Plain 'YYYY-MM-DD' strings must be parsed as LOCAL dates: `new Date(str)` treats
        // them as UTC midnight, which shifts the day backwards in negative-UTC timezones.
        const d = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? this.parseLocalDate(date) : new Date(date);
        if (!d || Number.isNaN(d.getTime())) return ''; const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`;
      },
      parseLocalDate(value) {
        if (!value) return null; const parts = String(value).split('-').map(Number); if (parts.length !== 3 || parts.some(Number.isNaN)) return null; return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
      },
      addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; },
      startOfWeek(date) { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d; },
      endOfWeek(date) { return this.addDays(this.startOfWeek(date), 6); },
      weekIdForDate(date) { return this.iso(this.startOfWeek(date)); },
      weekNumber(date) { const d = this.startOfWeek(date); d.setHours(0,0,0,0); d.setDate(d.getDate() + 3); const firstThursday = new Date(d.getFullYear(),0,4); return 1 + Math.round(((d - this.startOfWeek(firstThursday)) / 86400000 - 3) / 7); },
      daysDiff(a, b) { const da = this.parseLocalDate(this.iso(a)); const db = this.parseLocalDate(this.iso(b)); if (!da || !db) return 0; return Math.round((da - db) / 86400000); },
      overlaps(startA, endA, startB, endB) { return startA <= endB && endA >= startB; },
      /* Служебный год: три функции ниже (`getServiceYearForDate`,
         `serviceYearLabel`, `serviceYearBounds`) и константа
         `App.config.serviceYearStartMonth` переехали в `shared/serviceyear.js`
         24.08.2026. Имена и сигнатуры сохранены НАМЕРЕННО: так все 34 места
         вызова внутри модуля не потребовалось трогать — тот же приём и по той
         же причине, что у `CWSender` и `CWTheme`.
         Запасной путь на случай, если общий слой не подключён: прежняя
         реализация здесь же. Она обязана оставаться зеркалом общего слоя —
         правите там, поправьте и тут, иначе расхождение будет видно только
         без общего файла, то есть практически никогда. */
      getServiceYearForDate(date) {
        if (window.CWServiceYear) return window.CWServiceYear.forDate(date);
        const d = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? this.parseLocalDate(date) : new Date(date);
        return d.getMonth() >= App.config.serviceYearStartMonth ? d.getFullYear() : d.getFullYear() - 1;
      },
      haversineKm(lat1, lng1, lat2, lng2) {
        if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== 'number' || Number.isNaN(v))) return null;
        const R = 6371;
        const toRad = (v) => (v * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      },
      async geocodeAddress(address) {
        if (!address || !address.trim()) return null;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
          if (!res.ok) return null;
          const data = await res.json();
          if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
        } catch (err) { console.error('Geocoding failed', err); }
        return null;
      },
      easterDate(year) {
        // Anonymous Gregorian computus
        const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31) - 1, day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month, day);
      },
      holidaysForYear(year) {
        const iso = (d) => this.iso(d);
        const easter = this.easterDate(year);
        const off = (days) => { const d = new Date(easter); d.setDate(d.getDate() + days); return d; };
        const map = {};
        const add = (dateIso, name) => { (map[dateIso] = map[dateIso] || []).push(name); };
        add(`${year}-01-01`, 'Новый год (CZ/AT/DE)');
        add(`${year}-05-01`, 'День труда (CZ/AT/DE)');
        add(`${year}-12-24`, 'Сочельник (CZ/DE частично)');
        add(`${year}-12-25`, 'Рождество (CZ/AT/DE)');
        add(`${year}-12-26`, '2-й день Рождества (CZ/AT/DE)');
        add(`${year}-05-08`, 'День победы (CZ)'); add(`${year}-07-05`, 'Кирилл и Мефодий (CZ)'); add(`${year}-07-06`, 'Ян Гус (CZ)'); add(`${year}-09-28`, 'День государственности (CZ)'); add(`${year}-10-28`, 'День независимости (CZ)'); add(`${year}-11-17`, 'День свободы (CZ)');
        add(`${year}-01-06`, 'Богоявление (AT)'); add(`${year}-08-15`, 'Успение (AT)'); add(`${year}-10-26`, 'Нацпраздник (AT)'); add(`${year}-11-01`, 'Все святые (AT)'); add(`${year}-12-08`, 'Непорочное зачатие (AT)');
        add(`${year}-10-03`, 'День единства (DE)');
        add(iso(off(-2)), 'Страстная пятница (CZ/DE)');
        add(iso(off(1)), 'Пасхальный понедельник (CZ/AT/DE)');
        add(iso(off(39)), 'Вознесение (AT/DE)');
        add(iso(off(50)), 'Духов понедельник (AT/DE)');
        add(iso(off(60)), 'Тело Христово (AT/DE частично)');
        return map;
      },
      holidaysCache: {},
      getHolidayNames(dateIso) {
        if (!App.state.app?.settings?.showHolidays) return null;
        const year = Number(String(dateIso).slice(0, 4));
        if (!this.holidaysCache[year]) this.holidaysCache[year] = this.holidaysForYear(year);
        return this.holidaysCache[year][dateIso] || null;
      },
      serviceYearLabel(year) { return window.CWServiceYear ? window.CWServiceYear.label(year) : `${year}/${year + 1}`; },
      pdfFilenameSuffix(entry, event) {
        if (event?.visitType === 'congregation') {
          const start = this.parseLocalDate(entry?.start);
          const end = this.parseLocalDate(entry?.end);
          if (!start || !end) return '';
          const dm = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
          return `${dm(start)}.-${dm(end)}.${end.getFullYear()}`;
        }
        const sy = this.getServiceYearForDate(entry?.start || new Date());
        return this.serviceYearLabel(sy).replace('/', '-');
      },
      serviceYearBounds(year) { return window.CWServiceYear ? window.CWServiceYear.bounds(year) : { start: new Date(year, App.config.serviceYearStartMonth, 1), end: new Date(year + 1, App.config.serviceYearStartMonth, 0) }; },
      clampColor(color, fallback = '#1f7a45') { return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : fallback; },

      colorName(color) {
        const names = {
          '#1f7a45': { ru:'Зелёный', en:'Green', uk:'Зелений', pl:'Zielony', de:'Grün' },
          '#2563eb': { ru:'Синий', en:'Blue', uk:'Синій', pl:'Niebieski', de:'Blau' },
          '#1976d2': { ru:'Голубой', en:'Sky blue', uk:'Блакитний', pl:'Błękitny', de:'Hellblau' },
          '#d32f2f': { ru:'Красный', en:'Red', uk:'Червоний', pl:'Czerwony', de:'Rot' },
          '#e53935': { ru:'Алый', en:'Scarlet', uk:'Яскраво-червоний', pl:'Szkarłatny', de:'Scharlachrot' },
          '#0097a7': { ru:'Бирюзовый', en:'Turquoise', uk:'Бірюзовий', pl:'Turkusowy', de:'Türkis' },
          '#ef6c00': { ru:'Оранжевый', en:'Orange', uk:'Помаранчевий', pl:'Pomarańczowy', de:'Orange' },
          '#7b1fa2': { ru:'Фиолетовый', en:'Purple', uk:'Фіолетовий', pl:'Fioletowy', de:'Lila' },
          '#5d4037': { ru:'Коричневый', en:'Brown', uk:'Коричневий', pl:'Brązowy', de:'Braun' },
          '#00897b': { ru:'Тёмно-бирюзовый', en:'Teal', uk:'Темно-бірюзовий', pl:'Morski', de:'Dunkeltürkis' },
          '#6d4c41': { ru:'Кофейный', en:'Coffee', uk:'Кавовий', pl:'Kawowy', de:'Kaffeebraun' },
          '#546e7a': { ru:'Серо-синий', en:'Blue gray', uk:'Сіро-синій', pl:'Niebieskoszary', de:'Blaugrau' },
          '#3949ab': { ru:'Индиго', en:'Indigo', uk:'Індиго', pl:'Indygo', de:'Indigo' },
          '#8e24aa': { ru:'Пурпурный', en:'Violet', uk:'Пурпуровий', pl:'Purpurowy', de:'Purpur' },
          '#f4511e': { ru:'Рыжий', en:'Deep orange', uk:'Рудий', pl:'Rudy', de:'Dunkelorange' },
          '#43a047': { ru:'Светло-зелёный', en:'Light green', uk:'Світло-зелений', pl:'Jasnozielony', de:'Hellgrün' }
        };
        const key = String(color || '').toLowerCase();
        const lang = this.lang();
        return names[key]?.[lang] || names[key]?.ru || this.t('color');
      },
      colorOptionsHtml(selectedColor = '') {
        const colors = ['#1f7a45','#2563eb','#1976d2','#d32f2f','#e53935','#0097a7','#ef6c00','#7b1fa2','#5d4037','#00897b','#6d4c41','#546e7a','#3949ab','#8e24aa','#f4511e','#43a047'];
        const icons = { '#1f7a45':'🟢', '#2563eb':'🔵', '#1976d2':'🔷', '#d32f2f':'🔴', '#e53935':'🔴', '#0097a7':'🔹', '#ef6c00':'🟠', '#7b1fa2':'🟣', '#5d4037':'🟤', '#00897b':'🟦', '#6d4c41':'🟫', '#546e7a':'⚫', '#3949ab':'🔵', '#8e24aa':'🟣', '#f4511e':'🟠', '#43a047':'🟢' };
        const selected = String(selectedColor || '').toLowerCase();
        return colors.map((color) => `<option value="${color}" ${selected === color ? 'selected' : ''}>${icons[color]} ${this.escapeHtml(this.colorName(color))}</option>`).join('');
      },
      slug(value) { return String(value || '').toLowerCase().trim().replace(/\s+/g,'-').replace(/[^a-z0-9\-а-яёіїєґ]/gi,''); },
      escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, (s) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); },
      escapeAttr(str) { return App.utils.escapeHtml(str); },
      prettyDate(date) { const d = new Date(date); if (Number.isNaN(d.getTime())) return '—'; return d.toLocaleDateString(this.lang(), { day:'2-digit', month:'short' }); },
      prettyDateLong(date) { const d = new Date(date); if (Number.isNaN(d.getTime())) return '—'; return d.toLocaleDateString(this.lang(), { day:'2-digit', month:'long', year:'numeric' }); },
      // Короткая дата с годом: нужна как правая граница диапазона («29 сент. — 4 окт. 2026»),
      // где год указывается один раз, в конце.
      prettyDateYear(date) { const d = new Date(date); if (Number.isNaN(d.getTime())) return '—'; return d.toLocaleDateString(this.lang(), { day:'2-digit', month:'short', year:'numeric' }); },
      // Подпись типа посещения для интерфейса — с прописной буквы: используется
      // как самостоятельное значение в ячейке таблицы, в боковой панели и в
      // «пилюле» карточки. Три локальные копии этой логики слиты сюда 10.08.2026.
      //
      // НЕ путать с подписью в подзаголовке модалки письма (см. showLetterModal):
      // там берётся отдельный набор ключей `visit_congregation`/`visit_group`/
      // `visit_pregroup` — те же слова со СТРОЧНОЙ буквы, потому что стоят внутри
      // предложения в скобках, и вход там другой (суффикс шаблона письма, а не
      // event.visitType). Это не дубль, сливать сюда нельзя.
      visitTypeLabel(visitType) {
        if (visitType === 'congregation') return this.t('visit_type_congregation');
        if (visitType === 'group') return this.t('visit_type_group');
        if (visitType === 'pregroup') return this.t('visit_type_pregroup');
        return '';
      },
      countdownText(dateIso, unit = 'days') {
        const target = this.parseLocalDate(dateIso); if (!target) return '—';
        const now = new Date();
        const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffDays = Math.round((targetStart - todayStart) / 86400000);
        const diffMs = target.getTime() - now.getTime();
        if (diffDays === 0) return App.utils.t('countdown_today');
        const past = diffDays < 0;
        const absDays = Math.abs(diffDays);
        let value; let label;
        if (unit === 'hours') { value = Math.round(Math.abs(diffMs) / 3600000); label = App.utils.pluralUnit(value, 'hour'); }
        else if (unit === 'weeks') { value = Math.round(absDays / 7); label = App.utils.pluralUnit(value, 'week'); }
        else if (unit === 'months') { value = Math.round(absDays / 30.44); label = App.utils.pluralUnit(value, 'month'); }
        else { value = absDays; label = App.utils.pluralUnit(value, 'day'); }
        return past ? App.utils.t('countdown_past', { value, label }) : App.utils.t('countdown_future', { value, label });
      },
      pluralUnit(value, kind) {
        const lang = this.lang();
        if (lang === 'ru' || lang === 'uk') {
          const n = Math.abs(value) % 100; const n1 = n % 10;
          const forms = { day: ['день','дня','дней'], week: ['неделя','недели','недель'], month: ['месяц','месяца','месяцев'], hour: ['час','часа','часов'] }[kind] || ['','',''];
          if (n > 10 && n < 20) return forms[2];
          if (n1 === 1) return forms[0];
          if (n1 >= 2 && n1 <= 4) return forms[1];
          return forms[2];
        }
        const forms = { day: ['day','days'], week: ['week','weeks'], month: ['month','months'], hour: ['hour','hours'] }[kind] || ['',''];
        return value === 1 ? forms[0] : forms[1];
      },
      uniqueBy(items, makeKey) { const seen = new Set(); const out = []; items.forEach((item) => { const key = makeKey(item); if (seen.has(key)) return; seen.add(key); out.push(item); }); return out; },
      downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
        const blob = new Blob([text], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      toast(message) {
        if (!App.els.toastWrap) return; const el = document.createElement('div'); el.className = 'md-snackbar'; el.textContent = message; App.els.toastWrap.appendChild(el); setTimeout(() => el.remove(), 3500);
      },
      mapUrl(address) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;
      },
      googleCalendarUrl(item, event) {
        const format = (value) => String(value || '').replace(/-/g,'');
        const endPlus = this.iso(this.addDays(this.parseLocalDate(item.end), 1));
        const title = item.title || event?.name || this.t('event');
        const details = item.note || '';
        const location = event?.address || '';
        return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${format(item.start)}/${format(endPlus)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
      },
      makeSingleIcs(item, event) {
        const escape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
        const endPlus = this.iso(this.addDays(this.parseLocalDate(item.end), 1));
        const lines = [
          'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Service Year Planner//RU//','BEGIN:VEVENT',
          `UID:${this.uid('ics')}`,
          `DTSTAMP:${this.iso(new Date()).replace(/-/g,'')}T000000Z`,
          `DTSTART;VALUE=DATE:${String(item.start).replace(/-/g,'')}`,
          `DTEND;VALUE=DATE:${String(endPlus).replace(/-/g,'')}`,
          `SUMMARY:${escape(item.title || event?.name || this.t('event'))}`,
          `DESCRIPTION:${escape(item.note || '')}`,
          `LOCATION:${escape(event?.address || '')}`,
          'END:VEVENT','END:VCALENDAR'
        ];
        return `${lines.join('\r\n')}\r\n`;
      }
    },

    store: {
      ensureSettingsDefaults(settings = {}) {
        const out = { ...settings }; if (typeof out.showTeamPanel !== 'boolean') out.showTeamPanel = true; if (typeof out.showHolidays !== 'boolean') out.showHolidays = true; if (!out.language) out.language = 'ru'; if (!out.theme) out.theme = 'light'; if (!out.layoutPreset || !['classic','compact','spacious'].includes(out.layoutPreset)) out.layoutPreset = 'classic'; if (!out.calendarView) out.calendarView = 'month'; if (!out.accentColor) out.accentColor = 'purple'; if (!out.fontSize) out.fontSize = '100';
        /* Системные тексты в настройки больше НЕ вписываются — они живут в общем
           слое, и материализовать их здесь значило бы заморозить: обновление
           приложения перестало бы менять текст у тех, кто его не правил.
           Осталось единственное: очень старые данные, где правленый текст лежал
           в одном ключе без суффикса, разложить по трём типам визита — иначе
           перенос его не увидит и правка пропадёт. */
        ['Congregation','Group','Pregroup'].forEach((suffix) => {
          const key = 'letterTemplate' + suffix;
          if ((typeof out[key] !== 'string' || !out[key]) && out.letterTemplate) out[key] = out.letterTemplate;
        });
        if (!out.letterPages || typeof out.letterPages !== 'object') out.letterPages = {};

        if (typeof out.senderName !== 'string') out.senderName = ''; if (typeof out.senderAddress !== 'string') out.senderAddress = ''; if (typeof out.senderPhone !== 'string') out.senderPhone = ''; if (typeof out.senderEmail !== 'string') out.senderEmail = ''; if (!out.emailMethod || !['mailto','owa'].includes(out.emailMethod)) out.emailMethod = 'mailto'; if (typeof out.owaUrl !== 'string' || !out.owaUrl) out.owaUrl = 'https://outlook.office.com/mail/deeplink/compose'; if (typeof out.homeAddress !== 'string') out.homeAddress = 'Praha, Česká republika'; if (typeof out.homeLat !== 'number') out.homeLat = null; if (typeof out.homeLng !== 'number') out.homeLng = null; if (typeof out.autoShowReminders !== 'boolean') out.autoShowReminders = true;
        return out;
      },
      createDefaultData() {
        return { settings: this.ensureSettingsDefaults({}), serviceYears: {}, events: [{ id:'evt_midweek', name:'Серединное собрание', color:'#1f7a45', address:'', schedule:'Ср 19:00' }, { id:'evt_weekend', name:'Выходное служение', color:'#2563eb', address:'', schedule:'Сб 10:00' }], entries: [], meta: { version: App.config.version } };
      },
      convertLegacyBackup(legacy) {
        const app = this.createDefaultData(); app.events = []; app.meta = { version: App.config.version, importedFrom: legacy.schema || 'legacy' }; app.settings = this.ensureSettingsDefaults({});
        const eventMap = new Map(); const legacyMeetings = Array.isArray(legacy.meetings) ? legacy.meetings : [];
        const ensureEvent = (name, source = {}) => { const cleanName = String(name || '').trim(); if (!cleanName) return ''; if (eventMap.has(cleanName)) return eventMap.get(cleanName); const id = `evt_${App.utils.slug(cleanName) || App.utils.uid('evt')}`; const scheduleParts = []; if (source.wd && source.tWD) scheduleParts.push(`${source.wd} ${source.tWD}`); if (source.we && source.tWE) scheduleParts.push(`${source.we} ${source.tWE}`); app.events.push({ id, name: cleanName, color: App.utils.clampColor(source.color, '#1f7a45'), address: source.addr || source.address || '', schedule: scheduleParts.join(', ') }); eventMap.set(cleanName, id); return id; };
        legacyMeetings.forEach((meeting) => ensureEvent(meeting?.name, meeting || {}));
        const data = legacy.data && typeof legacy.data === 'object' ? legacy.data : {};
        Object.keys(data).forEach((bucket) => {
          const rows = Array.isArray(data[bucket]) ? data[bucket] : [];
          rows.forEach((row) => {
            if (!row) return;
            const hasContent = !!(row.s || row.e || row.m || row.nt || row.f302 || row.letter);
            if (!hasContent) return;
            const start = App.utils.iso(row.s || ''); const end = App.utils.iso(row.e || row.s || ''); if (!start || !end) return;
            const eventId = ensureEvent(row.m, legacyMeetings.find((item) => item?.name === row.m) || {});
            const startDate = App.utils.parseLocalDate(start); const serviceYear = startDate ? App.utils.getServiceYearForDate(startDate) : Number(bucket);
            if (!app.serviceYears[serviceYear]) app.serviceYears[serviceYear] = { weeks: {} };
            const weekId = App.utils.weekIdForDate(startDate || start);
            app.entries.push({ id: App.utils.uid('entry'), eventId, start, end, title: row.m || 'Собрание', note: row.nt || '', flags: { f302: !!row.f302, letter: !!row.letter }, source: 'legacy' });
            if (!app.serviceYears[serviceYear].weeks[weekId]) app.serviceYears[serviceYear].weeks[weekId] = { id: weekId, weekId, start, end, eventId, priority: row.f302 || row.letter ? 'important' : 'normal', flagLetter: !!row.letter, flagS302: !!row.f302, note: row.nt || '' };
          });
        });
        if (!app.events.length) app.events.push({ id:'evt_generic', name:'Импортированное собрание', color:'#1f7a45', address:'', schedule:'' });
        return app;
      },
      normalizeApp(appData) {
        const app = appData && typeof appData === 'object' ? appData : this.createDefaultData();
        app.settings = this.ensureSettingsDefaults(app.settings || {}); if (!Array.isArray(app.events)) app.events = []; if (!Array.isArray(app.entries)) app.entries = []; if (!app.serviceYears || typeof app.serviceYears !== 'object') app.serviceYears = {}; if (!app.meta || typeof app.meta !== 'object') app.meta = { version: App.config.version };
        app.events = App.utils.uniqueBy(app.events.filter((item) => item && typeof item === 'object').map((item) => ({ id: item.id || App.utils.uid('evt'), name: item.name || 'Без названия', color: App.utils.clampColor(item.color), address: item.address || '', schedule: item.schedule || '', visitType: item.visitType || '', contactName: item.contactName || '', contactPhone: item.contactPhone || '', contactEmail: item.contactEmail || '', contactNote: item.contactNote || '', congNumber: item.congNumber || '', lat: typeof item.lat === 'number' ? item.lat : null, lng: typeof item.lng === 'number' ? item.lng : null, formLanguage: item.formLanguage || '' })), (item) => item.id);
        const eventNameById = {}; app.events.forEach((ev) => { eventNameById[ev.id] = ev.name; });
        app.entries = App.utils.uniqueBy(app.entries.filter((item) => item && item.start && item.end && App.utils.iso(item.start) && App.utils.iso(item.end)).map((item) => ({ id: item.id || App.utils.uid('entry'), eventId: item.eventId || '', start: App.utils.iso(item.start), end: App.utils.iso(item.end), title: eventNameById[item.eventId] || item.title || '', note: item.note || '', resultNote: item.resultNote || '', emailBody: item.emailBody || '', subject: item.subject || '', visitForm: item.visitForm || null, notified60: !!item.notified60, flags: { f302: !!item?.flags?.f302, letter: !!item?.flags?.letter }, source: item.source || 'entry' })), (item) => item.id);
        Object.keys(app.serviceYears).forEach((year) => {
          const sy = app.serviceYears[year] || {}; if (!sy.weeks || typeof sy.weeks !== 'object') sy.weeks = {};
          Object.keys(sy.weeks).forEach((weekId) => { const w = sy.weeks[weekId]; if (!w) return; const start = App.utils.iso(w.start || weekId); const end = App.utils.iso(w.end || App.utils.addDays(App.utils.parseLocalDate(start), 6)); sy.weeks[weekId] = { id: w.id || weekId, weekId, start, end, eventId: w.eventId || '', priority: w.priority || 'normal', flagLetter: !!w.flagLetter, flagS302: !!w.flagS302, note: w.note || '' }; });
          app.serviceYears[year] = sy;
        });
        app.meta.version = App.config.version;
        return app;
      },
      migrate(appData) { return this.normalizeApp(appData && appData.schema === 'sp-backup-v2' ? this.convertLegacyBackup(appData) : appData); },
      /* ── Где лежат данные (фаза 2 миграции на shared/db.js) ──────────────
         Источник истины — хранилище `state` общей базы через `CWState`.
         Прежний ключ localStorage остаётся: пока в базе записи нет, он и есть
         данные, а после переезда — снимок «как было до», то есть обратимость
         этой фазы. Переписывать и удалять его здесь нельзя категорически.

         `CWState.get()` синхронен: базу прочитал загрузчик ДО `App.init()`
         (см. низ файла). Тот же приём и по той же причине, что у `CWSender` и
         `CWTemplates` — модуль не умеет ждать, отрисовка идёт сразу. */
      /** Экземпляр CWState для этого модуля; ставится загрузчиком внизу файла.
       *  `null` = общий слой недоступен, работаем на прежнем ключе. */
      remote: null,
      /** Экземпляр CWSnapshots для истории контрольных точек (фаза 4);
       *  ставится загрузчиком внизу файла. `null` или недоступный слой =
       *  работаем на прежнем ключе `historyKey`, как до переезда. */
      history: null,
      source: 'legacy',
      load() {
        const usable = !!(this.remote && this.remote.available());
        let saved = usable ? this.remote.get() : null;
        let fromLegacy = false;
        if (saved === null || saved === undefined) {
          try { saved = localStorage.getItem(App.config.storageKey); } catch (e) { saved = null; }
          fromLegacy = !!saved;
        }
        this.source = usable ? 'db' : 'legacy';
        try {
          this.lastWrittenPayload = saved || null;
          App.state.app = saved ? this.migrate(JSON.parse(saved)) : this.createDefaultData();
        } catch (error) {
          console.error('Storage load failed', error);
          App.state.app = this.createDefaultData();
          App.utils.toast('Storage reset.');
          return;
        }
        /* Переезд: данные нашлись только в старом ключе. Копируем их в базу
           как есть — без разбора и без нормализации, чтобы перенос нельзя было
           спутать со сменой модели. Старый ключ остаётся на месте. */
        if (fromLegacy && this.source === 'db') {
          /* Снимок перед необратимым переносом. Ждать его нельзя: `load()`
             синхронна, а после неё сразу идёт отрисовка. Промис снимка не
             отклоняется, отказ уходит в консоль — потерять из-за него сам
             перенос было бы хуже: старый ключ при этом остаётся на месте и
             остаётся полноценным путём отката. */
          this.snapshotForMigration();
          this.remote.write(saved);
        }
      },
      /* ── Отложенная запись (shared/persist.js, фаза 1 миграции на CWDB) ──
         `save()` больше не пишет сама: она помечает состояние изменённым и
         ставит запись в очередь. Для всех 52 вызовов в этом файле ничего не
         меняется — функция по-прежнему синхронна и по-прежнему зовётся после
         каждой правки. Меняется только момент попадания на диск, и это ровно
         то свойство, ради которого фаза 1 существует: когда в фазе 2 писать
         начнёт `CWDB` (асинхронно), код вокруг переписывать не придётся.

         Полезная нагрузка собирается ЗДЕСЬ, в момент записи, а не в момент
         вызова `save()` — поэтому отложенная запись физически не может
         записать устаревшее состояние. */
      scheduler: null,
      persist() {
        if (this.scheduler) return this.scheduler;
        if (!self.CWPersist) return null;
        this.scheduler = self.CWPersist.create({
          name: 'circuit-planner',
          /* На закрытии вкладки пишем ЧЕРЕЗ ЗАЩИЩЁННЫЙ путь: если за время
             ожидания соседняя вкладка записала более свежие данные, наше
             устаревшее состояние их затрёт. Такое уже приводило к реальной
             потере данных при работе в двух вкладках. */
          write: (reason) => { if (reason === 'unload') this.saveIfOwnStateIsCurrent(); else this.writeNow(); },
        });
        return this.scheduler;
      },
      save() {
        const p = this.persist();
        /* Общий слой не приехал (офлайн-кэш старой версии) — пишем как раньше,
           немедленно. Молча терять данные из-за отсутствующего файла нельзя. */
        if (!p) { this.writeNow(); return; }
        p.schedule();
      },
      /** Записать немедленно, минуя очередь. Нужно там, где сразу после этого
       *  читается СОХРАНЁННОЕ значение, а не состояние в памяти. */
      flushNow(reason) {
        const p = this.persist();
        if (p) p.flush(reason || 'flush'); else this.writeNow();
      },
      writeNow() {
        try {
          this.snapshotIfDue();
          const payload = JSON.stringify(App.state.app);
          if (this.source === 'db') this.remote.write(payload);
          else localStorage.setItem(App.config.storageKey, payload);
          // Remember exactly what this tab wrote, so the unload-time safety net can tell
          // "storage still holds my data" apart from "another tab has since written newer data".
          this.lastWrittenPayload = payload;
        } catch (error) {
          console.error('Storage save failed', error);
          App.utils.toast(App.utils.t('msg_storage_full'));
        }
      },
      // Used by the unload/hide safety net only. A plain save() there is dangerous: if another tab
      // saved newer data in the meantime, this tab's stale in-memory state would silently destroy
      // it. So only write if storage still matches what this tab itself last wrote (or if this tab
      // has genuinely newer unsaved changes relative to its own last write).
      saveIfOwnStateIsCurrent() {
        try {
          if (this.source === 'db') {
            /* Соседняя вкладка писала после нас — её данные новее, наше
               состояние устарело, и записывать его нельзя. Признак приезжает
               маячком в localStorage: запись в IndexedDB события `storage` не
               порождает, и без маячка соседства просто не видно. */
            if (this.remote.foreignWrote()) return;
            this.snapshotIfDue();
            const payload = JSON.stringify(App.state.app);
            /* Синхронное зеркало: `pagehide` не умеет ждать промис, поэтому
               блоб ложится в localStorage сразу, а запись в базу идёт следом.
               Не успеет — зеркало прочитается при следующей загрузке. */
            this.remote.writeSync(payload);
            this.lastWrittenPayload = payload;
            return;
          }
          const current = localStorage.getItem(App.config.storageKey);
          if (current && this.lastWrittenPayload && current !== this.lastWrittenPayload) {
            // Storage changed underneath us — another tab owns the newer data. Don't clobber it.
            return;
          }
          // Именно writeNow(): этот путь и есть запись, ставить её обратно в
          // очередь на закрытии вкладки значило бы не записать вовсе.
          this.writeNow();
        } catch (error) {
          console.error('Guarded save failed', error);
        }
      },
      /**
       * Последнее ЗАПИСАННОЕ состояние — то, что снимок истории должен
       * сохранить перед очередной правкой.
       *
       * Раньше это читалось из localStorage напрямую. После переезда так
       * делать нельзя: под старым ключом лежит дореформенный снимок, и
       * история наполнялась бы одним и тем же днём переезда — бесшумно, ведь
       * записи в ней появляются исправно. Читаем то, что сами записали
       * последним; на первой загрузке это состояние из базы.
       */
      currentStored() {
        if (this.source === 'db') return this.lastWrittenPayload || null;
        try { return localStorage.getItem(App.config.storageKey); } catch (e) { return null; }
      },
      // Rolling checkpoint history so mistakes can be undone. Deliberately NOT a snapshot-per-edit
      // system (typing in any field would create dozens of snapshots per minute) — instead, at most
      // one checkpoint every few minutes, capturing the state as it was just BEFORE the next change,
      // capped to a small number of recent checkpoints to keep localStorage usage bounded.
      /**
       * Снимок состояния перед необратимой миграцией — в обход интервала.
       * `snapshotIfDue()` здесь не годится: он молча ничего не сделает, если
       * последний снимок свежий, а именно в этот момент копия нужна больше
       * всего.
       */
      /* ── Где лежит история (фаза 4 миграции на shared/db.js) ─────────────
         Пятнадцать контрольных точек — это пятнадцать ПОЛНЫХ блобов состояния
         рядом с самим состоянием; именно они и упирались в квоту localStorage.
         С фазы 4 они лежат в хранилище `snapshots` общей базы через
         `CWSnapshots`. Прежний ключ `historyKey` остаётся рабочим запасным
         путём: пока общий слой недоступен, всё идёт по-старому, поэтому обе
         ветки ниже живые, а не «одна на удаление». */

      /** Короткая шапка снимка для списка: считается ОДИН раз, при записи.
       *  Раньше окно истории разбирало каждый блоб заново на каждой отрисовке. */
      snapshotMeta(payload) {
        try {
          const data = JSON.parse(payload);
          return { events: (data.events || []).length, entries: (data.entries || []).length };
        } catch (error) { return null; }
      },
      /** Снимок текущего СОХРАНЁННОГО состояния, безусловно, без интервала. */
      checkpointNow(label) {
        const current = this.currentStored();
        if (!current) return Promise.resolve(null);   // нечего снимать: первая загрузка чистой установки
        const h = this.history;
        if (h && h.available()) {
          return h.add({ at: Date.now(), label: label || '', meta: this.snapshotMeta(current), payload: current });
        }
        try {
          const raw = localStorage.getItem(App.config.historyKey);
          const history = raw ? JSON.parse(raw) : [];
          history.push({ at: Date.now(), data: current });
          while (history.length > App.config.maxSnapshots) history.shift();
          localStorage.setItem(App.config.historyKey, JSON.stringify(history));
        } catch (error) {
          // History is a convenience safety net, not core data — never let it block a real save.
          console.error('Snapshot failed (non-fatal)', error);
        }
        return Promise.resolve(null);
      },
      /**
       * Снимок состояния перед необратимой миграцией — в обход интервала.
       * `snapshotIfDue()` здесь не годится: он молча ничего не сделает, если
       * последний снимок свежий, а именно в этот момент копия нужна больше
       * всего.
       */
      snapshotForMigration() {
        /* Снимок берётся ИЗ ХРАНИЛИЩА, а с фазы 1 в очереди может лежать
           незаписанная правка — тогда в историю попало бы состояние старее
           того, что человек видит на экране. Догоняем очередь до снимка. */
        this.flushNow('snapshot');
        return this.checkpointNow('migration');
      },
      snapshotIfDue() {
        const now = Date.now();
        const h = this.history;
        if (h && h.available()) {
          /* `lastAt()` синхронен намеренно: этот метод вызывается ВНУТРИ
             записи состояния и ждать базу не может. Шапки снимков читаются
             один раз при запуске и живут в памяти. */
          if (now - h.lastAt() < App.config.snapshotIntervalMs) return;
          this.checkpointNow();
          return;
        }
        try {
          const raw = localStorage.getItem(App.config.historyKey);
          const history = raw ? JSON.parse(raw) : [];
          const last = history[history.length - 1];
          if (last && now - last.at < App.config.snapshotIntervalMs) return;
          const current = this.currentStored();
          if (!current) return; // nothing to checkpoint yet (very first save of a fresh install)
          history.push({ at: now, data: current });
          while (history.length > App.config.maxSnapshots) history.shift();
          localStorage.setItem(App.config.historyKey, JSON.stringify(history));
        } catch (error) {
          console.error('Snapshot failed (non-fatal)', error);
        }
      },
      /** Шапки снимков, НОВЫЕ → СТАРЫЕ: `{ id, at, meta }`. Блобы не поднимаются
       *  в память — окну истории нужны только дата и сводка. */
      getHistory() {
        const h = this.history;
        if (h && h.available()) return h.list();
        try {
          const raw = localStorage.getItem(App.config.historyKey);
          const history = raw ? JSON.parse(raw) : [];
          return history.map((snap, i) => ({
            id: 'legacy:' + i, at: snap.at, label: '', meta: this.snapshotMeta(snap.data),
          })).reverse();
        } catch (error) {
          console.error('Reading history failed', error);
          return [];
        }
      },
      /** Применить снимок к рабочему состоянию. Возвращает успех. */
      applySnapshot(payload) {
        try {
          App.state.app = this.migrate(JSON.parse(payload));
        } catch (error) {
          console.error('Restore failed', error);
          return false;
        }
        /* Восстановление — не рядовая правка: результат должен лежать на диске
           до того, как пользователь закроет вкладку или обновит страницу. */
        this.flushNow('restore');
        return true;
      },
      /**
       * Восстановление по идентификатору снимка (раньше был индекс в массиве).
       * Асинхронно: блоб лежит в базе и читается по требованию.
       */
      restoreSnapshot(id) {
        const h = this.history;
        if (h && h.available()) {
          return h.get(id).then((snap) => {
            if (!snap || typeof snap.payload !== 'string') return false;
            /* Само восстановление тоже должно быть отменяемым — снимаем
               контрольную точку с ТЕКУЩЕГО состояния, безусловно, в обход
               интервала. Ждём её: иначе состояние, которое вот-вот будет
               заменено, могло бы не успеть попасть в историю. */
            return this.checkpointNow('pre-restore').then(() => this.applySnapshot(snap.payload));
          });
        }
        let history;
        try {
          const raw = localStorage.getItem(App.config.historyKey);
          history = raw ? JSON.parse(raw) : [];
        } catch (error) { console.error('Reading history failed', error); return Promise.resolve(false); }
        const snap = history[Number(String(id).replace('legacy:', ''))];
        if (!snap) return Promise.resolve(false);
        try {
          const current = this.currentStored();
          if (current) { history.push({ at: Date.now(), data: current }); while (history.length > App.config.maxSnapshots) history.shift(); localStorage.setItem(App.config.historyKey, JSON.stringify(history)); }
        } catch (error) { console.error('Pre-restore checkpoint failed', error); }
        return Promise.resolve(this.applySnapshot(snap.data));
      },
    },

    data: {
      ensureServiceYear(year) { if (!App.state.app.serviceYears[year]) App.state.app.serviceYears[year] = { weeks: {} }; return App.state.app.serviceYears[year]; },
      /**
       * Чтение события идёт через общий справочник (фаза 5, шаг 4а).
       *
       * Возвращается ОБЪЕДИНЁННОЕ представление: поля модуля (цвет,
       * расписание, тип визита, язык формуляра) плюс идентификация из
       * `CWDirectory`, если он прочитан. Сорок с лишним мест читают
       * `event.name` / `event.address` через эту точку — их правка не
       * потребовалась, и это была единственная причина сохранить воронку.
       *
       * ⚠️ Результат — КОПИЯ. Писать в него бесполезно и БЕСШУМНО: правка
       * никуда не доедет. Для изменения есть `getRawEventById()`.
       */
      getEventById(id) {
        const own = this.getRawEventById(id);
        return own ? App.shared.directory.merge(own) : null;
      },

      /** Сырая запись модуля. Только для тех, кто её МЕНЯЕТ. */
      getRawEventById(id) { return App.state.app.events.find((item) => item.id === id) || null; },

      /** Все события в объединённом виде — для списков, фильтров и выпадающих. */
      allEvents() { return (App.state.app.events || []).map((item) => App.shared.directory.merge(item)); },

      /**
       * `entry.title` — СНИМОК названия на момент создания записи, а не
       * ссылка. Поэтому переименование обязано пройтись по записям, иначе
       * письма, формуляры и сам календарь навсегда остались бы со старым
       * именем. Трогаются только записи, чей заголовок ещё СОВПАДАЕТ со
       * старым названием: правленное вручную остаётся как есть.
       *
       * Раньше это жило внутри `saveEventTemplate()`. Вынесено потому, что
       * переименование теперь может прийти и ИЗВНЕ — из справочника
       * (соседняя вкладка, в будущем соседний модуль). Логика починки
       * обязана ехать за названием: это прямое условие шага 4 из аудита.
       *
       * @returns {boolean} чинили ли хоть что-нибудь
       */
      /**
       * Собрания, у которых номер стоит в названии, а поле «Номер собрания»
       * пустое.
       *
       * ⚠️ Название НЕ трогается и трогаться не будет. По решению Алекса
       * «Warszawa-Ukraiński-Południe (19588)» — это ОФИЦИАЛЬНОЕ название
       * собрания целиком, в таком виде он его и пересылает собраниям.
       * Расщепление, которое аудит §3 держал как догадку, отменено не потому,
       * что оказалось ненадёжным, а потому что оно не нужно: разделять нечего.
       *
       * Заполняется только пустое поле. Расхождение (в названии один номер, в
       * поле другой) выносится отдельно и НЕ правится: это ошибка в данных, и
       * выбирать за человека, какой номер верный, здесь нельзя.
       *
       * @returns {{fill: Array, conflicts: Array}}
       */
      congNumberSuggestions() {
        const fill = [];
        const conflicts = [];
        if (typeof CWDirectory === 'undefined') return { fill, conflicts };
        (App.state.app.events || []).forEach((event) => {
          const parsed = CWDirectory.parseName(event.name);
          if (!parsed.congNumber) return;
          const own = String(event.congNumber || '').trim();
          if (!own) fill.push({ id: event.id, name: event.name, congNumber: parsed.congNumber });
          else if (own !== parsed.congNumber) {
            conflicts.push({ id: event.id, name: event.name, inName: parsed.congNumber, inField: own });
          }
        });
        return { fill, conflicts };
      },

      renameEntryTitles(eventId, oldName, newName) {
        const from = String(oldName == null ? '' : oldName);
        const to = String(newName == null ? '' : newName);
        if (!eventId || !from || !to || from === to) return false;
        let touched = false;
        (App.state.app.entries || []).forEach((entry) => {
          if (entry.eventId === eventId && entry.title === from) { entry.title = to; touched = true; }
        });
        return touched;
      },
      getServiceYearStats(sy) {
        const syStart = new Date(sy, App.config.serviceYearStartMonth, 1);
        const syEnd = new Date(sy + 1, App.config.serviceYearStartMonth, 0);
        const today = new Date(); today.setHours(0,0,0,0);
        const visitEvents = this.allEvents().filter((e) => e.visitType);
        const entriesInYear = (App.state.app.entries || []).filter((entry) => {
          const es = App.utils.parseLocalDate(entry.start), ee = App.utils.parseLocalDate(entry.end);
          return es && ee && App.utils.overlaps(es, ee, syStart, syEnd);
        });
        const visitEntries = entriesInYear.filter((entry) => { const ev = this.getEventById(entry.eventId); return ev?.visitType; });
        const done = visitEntries.filter((entry) => App.utils.parseLocalDate(entry.end) < today);
        const s302Sent = visitEntries.filter((e) => e.flags?.f302).length;
        const letterSent = visitEntries.filter((e) => e.flags?.letter).length;
        const visitedEventIds = new Set(visitEntries.map((e) => e.eventId));
        const unvisited = visitEvents.filter((ev) => !visitedEventIds.has(ev.id));
        return { syStart, syEnd, visitEvents, visitEntries, planned: visitEntries.length, done: done.length, s302Sent, letterSent, unvisited };
      },
      getUpcomingReminders() {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const items = [];
        (App.state.app.entries || []).forEach((entry) => {
          const event = this.getEventById(entry.eventId);
          const visitType = event?.visitType || '';
          if (!visitType) return; // reminders only apply to congregation/group/pregroup visits
          const start = App.utils.parseLocalDate(entry.start);
          if (!start) return;
          const daysUntil = Math.round((start - today) / 86400000);
          if (daysUntil < -3) return; // visit already passed a few days ago — stop nagging
          const needsS302 = !entry?.flags?.f302;
          const needsLetter = !entry?.flags?.letter && daysUntil <= 60;
          if (!needsS302 && !needsLetter) return;
          items.push({ id: entry.id, title: entry.title || event?.name || App.utils.t('event'), start: entry.start, end: entry.end, daysUntil, needsS302, needsLetter, visitType });
        });
        return items.sort((a, b) => a.daysUntil - b.daysUntil);
      },
      getWeek(year, weekId) {
        const sy = this.ensureServiceYear(year); if (!sy.weeks[weekId]) { const start = App.utils.parseLocalDate(weekId); sy.weeks[weekId] = { id: weekId, weekId, start: App.utils.iso(start), end: App.utils.iso(App.utils.addDays(start, 6)), eventId: '', priority: 'normal', flagLetter: false, flagS302: false, note: '' }; }
        return sy.weeks[weekId];
      },
      getWeeksForYear(year) {
        const bounds = App.utils.serviceYearBounds(year); const weeks = []; let cursor = App.utils.startOfWeek(bounds.start); const end = App.utils.endOfWeek(bounds.end); while (cursor <= end) { weeks.push(this.getWeek(year, App.utils.weekIdForDate(cursor))); cursor = App.utils.addDays(cursor, 7); } return weeks;
      },
      addServiceYear(year) {
        const n = Number(year); if (!Number.isInteger(n) || n < 2000 || n > 2100) { App.utils.toast(App.utils.t('invalid_year')); return false; } this.ensureServiceYear(n); this.getWeeksForYear(n); App.store.save(); App.state.selectedYear = n; App.utils.toast(App.utils.t('added_year', { year: App.utils.serviceYearLabel(n) })); return true;
      },
      buildCalendarItemsForMonth(month, year) {
        const viewStart = new Date(year, month, 1); const viewEnd = new Date(year, month + 1, 0); const items = [];
        Object.values(App.state.app.serviceYears).forEach((serviceYear) => {
          Object.values(serviceYear.weeks || {}).forEach((week) => {
            if (!week.eventId) return; const start = App.utils.parseLocalDate(week.start); const end = App.utils.parseLocalDate(week.end); if (!start || !end) return; if (!App.utils.overlaps(start, end, viewStart, viewEnd)) return; const event = this.getEventById(week.eventId); items.push({ id:`week:${week.weekId}`, source:'week', start, end, eventId: week.eventId, title: event?.name || App.utils.t('event'), color: event?.color || '#1f7a45', note: week.note || '', flags: { f302: !!week.flagS302, letter: !!week.flagLetter }, refId: week.weekId });
          });
        });
        App.state.app.entries.forEach((entry) => {
          const start = App.utils.parseLocalDate(entry.start); const end = App.utils.parseLocalDate(entry.end); if (!start || !end) return; if (!App.utils.overlaps(start, end, viewStart, viewEnd)) return; const event = this.getEventById(entry.eventId); items.push({ id:`entry:${entry.id}`, source:'entry', start, end, eventId: entry.eventId, title: entry.title || event?.name || App.utils.t('event'), color: event?.color || '#1f7a45', note: entry.note || '', flags: { f302: !!entry?.flags?.f302, letter: !!entry?.flags?.letter }, refId: entry.id });
        });
        const filtered = App.state.calendarEventFilter === 'all' ? items : items.filter((item) => item.eventId === App.state.calendarEventFilter);
        return App.utils.uniqueBy(filtered, (item) => [item.eventId,item.title,item.note,item.start.toISOString().slice(0,10),item.end.toISOString().slice(0,10)].join('|')).sort((a,b) => a.start - b.start || a.end - b.end);
      },
      collectIcsItems(startDate, endDate) {
        const start = App.utils.parseLocalDate(startDate);
        const end = App.utils.parseLocalDate(endDate);
        if (!start || !end) return [];

        const entryItems = App.state.app.entries
          .filter((entry) => {
            const es = App.utils.parseLocalDate(entry.start);
            const ee = App.utils.parseLocalDate(entry.end);
            return es && ee && App.utils.overlaps(es, ee, start, end);
          })
          .map((entry) => {
            const event = this.getEventById(entry.eventId);
            return {
              title: entry.title || event?.name || App.utils.t('event'),
              description: entry.note || '',
              location: event?.address || '',
              start: entry.start,
              end: App.utils.iso(App.utils.addDays(App.utils.parseLocalDate(entry.end), 1))
            };
          });

        const weekItems = [];
        Object.values(App.state.app.serviceYears || {}).forEach((serviceYear) => {
          Object.values(serviceYear?.weeks || {}).forEach((week) => {
            if (!week?.eventId) return;
            const ws = App.utils.parseLocalDate(week.start);
            const we = App.utils.parseLocalDate(week.end);
            if (!ws || !we || !App.utils.overlaps(ws, we, start, end)) return;
            const event = this.getEventById(week.eventId);
            weekItems.push({
              title: event?.name || App.utils.t('event'),
              description: week.note || '',
              location: event?.address || '',
              start: week.start,
              end: App.utils.iso(App.utils.addDays(App.utils.parseLocalDate(week.end), 1))
            });
          });
        });

        return App.utils.uniqueBy([...entryItems, ...weekItems], (item) => [item.title,item.description,item.location,item.start,item.end].join('|'));
      },
      getCalendarItemById(itemId) {
        if (!itemId) return null; const [source, refId] = String(itemId).split(':');
        if (source === 'entry') {
          const entry = App.state.app.entries.find((item) => item.id === refId); if (!entry) return null; const event = this.getEventById(entry.eventId); return { id: itemId, source: 'entry', refId, eventId: entry.eventId, title: entry.title || event?.name || App.utils.t('event'), note: entry.note || '', resultNote: entry.resultNote || '', flags: { f302: !!entry?.flags?.f302, letter: !!entry?.flags?.letter }, start: entry.start, end: entry.end };
        }
        if (source === 'week') {
          let found = null;
          Object.values(App.state.app.serviceYears).forEach((sy) => { if (sy.weeks && sy.weeks[refId]) found = sy.weeks[refId]; });
          if (!found) return null; const event = this.getEventById(found.eventId); return { id: itemId, source: 'week', refId, eventId: found.eventId, title: event?.name || App.utils.t('event'), note: found.note || '', flags: { f302: !!found.flagS302, letter: !!found.flagLetter }, start: found.start, end: found.end };
        }
        return null;
      }
    },

    actions: {
      resetEventForm() {
        App.state.editingEventId = null;
        if (App.els.eventNameInput) App.els.eventNameInput.value = '';
        if (App.els.eventColorInput) {
          App.els.eventColorInput.innerHTML = App.utils.colorOptionsHtml('#1f7a45');
          App.els.eventColorInput.value = '#1f7a45';
          if (!App.els.eventColorInput.value) App.els.eventColorInput.selectedIndex = 0;
        }
        if (App.els.eventAddressInput) App.els.eventAddressInput.value = '';
        if (App.els.eventScheduleInput) App.els.eventScheduleInput.value = '';
        if (App.els.eventVisitTypeInput) App.els.eventVisitTypeInput.value = '';
        App.ui.syncEventVisitFieldsVisibility();
        if (App.els.eventContactNameInput) App.els.eventContactNameInput.value = '';
        if (App.els.eventContactPhoneInput) App.els.eventContactPhoneInput.value = '';
        if (App.els.eventContactEmailInput) App.els.eventContactEmailInput.value = '';
        if (App.els.eventContactNoteInput) App.els.eventContactNoteInput.value = '';
        if (App.els.eventCongNumberInput) App.els.eventCongNumberInput.value = '';
        App.state.editingEventCoords = null;
        if (App.els.eventDistanceStatus) App.els.eventDistanceStatus.textContent = '';
        if (App.els.eventFormLanguageSelect) App.els.eventFormLanguageSelect.value = '';
        if (App.els.deleteEventBtn) App.els.deleteEventBtn.hidden = true;
      },
      saveEventTemplate() {
        try {
          const name = App.els.eventNameInput?.value.trim(); if (!name) return App.utils.toast(App.utils.t('enter_event_name'));
          const payload = { id: App.state.editingEventId || App.utils.uid('evt'), name, color: App.utils.clampColor(App.els.eventColorInput?.value), address: App.els.eventAddressInput?.value.trim() || '', schedule: App.els.eventScheduleInput?.value.trim() || '', visitType: App.els.eventVisitTypeInput?.value || '', contactName: App.els.eventContactNameInput?.value.trim() || '', contactPhone: App.els.eventContactPhoneInput?.value.trim() || '', contactEmail: App.els.eventContactEmailInput?.value.trim() || '', contactNote: App.els.eventContactNoteInput?.value.trim() || '', congNumber: App.els.eventCongNumberInput?.value.trim() || '', lat: App.state.editingEventCoords?.lat ?? null, lng: App.state.editingEventCoords?.lng ?? null, formLanguage: App.els.eventFormLanguageSelect?.value || '' };
          const index = App.state.app.events.findIndex((event) => event.id === payload.id);
          const oldName = index >= 0 ? App.state.app.events[index].name : null;
          if (index >= 0) App.state.app.events[index] = payload; else App.state.app.events.push(payload);
          // Dedup by id only — a content-based key here previously risked collapsing two
          // distinct events that happened to share name/color/address/schedule.
          App.state.app.events = App.utils.uniqueBy(App.state.app.events, (item) => item.id);
          // Renaming an event otherwise left every already-created visit entry showing the OLD name
          // forever (entry.title is only ever snapshotted from the event at save time, never
          // re-synced) — letters, S-302 forms, and the calendar itself would all keep showing it.
          // Only touch entries whose title still matches the old name, to avoid clobbering anything
          // that was somehow customized separately.
          if (oldName !== null) App.data.renameEntryTitles(payload.id, oldName, name);
          App.store.save();
          App.shared.directory.mirror(payload);
          this.resetEventForm(); App.ui.renderAll(); App.utils.toast(App.utils.t('event_template_saved'));
          App.ui.closeModal(App.els.eventEditorModal);
        } catch (err) {
          console.error('saveEventTemplate failed:', err);
          App.utils.toast(App.utils.t('msg_save_error', { error: err?.message || err }));
        }
      },
      /**
       * Удаление всех собраний. Тот же вопрос, что и у одиночного удаления, и
       * задаётся он ОДИН раз на всю пачку: пятнадцать окон подряд человек
       * закликает не глядя, и выбор перестанет быть выбором. Обойти развилку
       * здесь было бы легко и незаметно — «удалить все» унесло бы карточки
       * соседей молча, мимо только что принятого решения.
       */
      deleteAllEventTemplates() {
        const total = App.state.app.events.length;
        if (!total) return;
        const shared = [];
        App.state.app.events.forEach((item) => {
          App.shared.directory.otherSources(item.id).forEach((moduleId) => {
            if (shared.indexOf(moduleId) < 0) shared.push(moduleId);
          });
        });
        if (shared.length) { App.ui.openEventDeleteModal({ eventId: null, name: '', modules: shared }); return; }
        if (!window.confirm(App.utils.t('delete_all_events_confirm'))) return;
        this.performDeleteAllEvents('detach');
      },

      /** @param {'detach'|'purge'} scope */
      performDeleteAllEvents(scope) {
        // Идентификаторы снимаются ДО очистки: после неё отвязывать нечего.
        App.state.app.events.forEach((item) => {
          if (scope === 'purge') App.shared.directory.purge(item.id);
          else App.shared.directory.forget(item.id);
        });
        App.state.app.events = [];
        App.state.app.entries = [];
        Object.values(App.state.app.serviceYears || {}).forEach((sy) => {
          Object.values(sy.weeks || {}).forEach((week) => { week.eventId = ''; });
        });
        App.state.editingEventId = null;
        App.state.calendarEventFilter = 'all';
        App.state.eventSearch = '';
        App.state.eventColorFilter = 'all';
        App.actions.resetEventForm();
        App.store.save();
        App.ui.renderAll();
        App.utils.toast(App.utils.t('delete_all_events_done'));
      },
      /**
       * Удаление собрания. Если карточку знает ещё какой-то модуль, область
       * удаления выбирает ЧЕЛОВЕК (решение Алекса от 16.08.2026, вариант Б):
       * зашитая политика здесь угадывала бы намерение. «Собрание
       * расформировано» и «чищу свой календарь» выглядят одинаково, а значат
       * противоположное.
       *
       * Никто больше карточку не знает — прежний одиночный `confirm()`,
       * лишнего экрана не появляется.
       */
      deleteEventTemplate(eventId) {
        const event = App.data.getEventById(eventId);
        if (!event) return;
        const others = App.shared.directory.otherSources(eventId);
        if (others.length) { App.ui.openEventDeleteModal({ eventId, name: event.name, modules: others }); return; }
        if (!window.confirm(`${App.utils.t('delete_template_confirm')}: ${event.name}?`)) return;
        this.performEventDelete(eventId, 'detach');
      },

      /**
       * Собственно удаление. Отделено от вопроса намеренно: спрашивать и
       * удалять — разные обязанности, и после появления окна выбора у
       * удаления стало ДВА входа (кнопка и окно). Один общий путь означает,
       * что забыть, например, очистку недель служебного года можно только в
       * одном месте, а не в двух.
       *
       * @param {'detach'|'purge'} scope — убрать только отсюда или везде
       */
      /**
       * Заполнить пустые поля номера. Название не меняется, поэтому починка
       * заголовков записей здесь не нужна — снимок названия остаётся верным.
       *
       * Контрольная точка снимается ДО правки и в обход интервала: правка
       * затрагивает разом десяток собраний, и откатить её иначе было бы
       * нечем.
       */
      applyCongNumbers() {
        const { fill } = App.data.congNumberSuggestions();
        if (!fill.length) return Promise.resolve(0);
        return App.store.checkpointNow('congnumbers').then(() => {
          fill.forEach((item) => {
            const event = App.data.getRawEventById(item.id);
            if (!event) return;
            event.congNumber = item.congNumber;
            App.shared.directory.mirror(event);
          });
          App.store.save();
          App.ui.renderAll();
          return fill.length;
        });
      },

      performEventDelete(eventId, scope) {
        if (!App.data.getRawEventById(eventId)) return;
        App.state.app.events = App.state.app.events.filter((item) => item.id !== eventId);
        if (scope === 'purge') App.shared.directory.purge(eventId);
        else App.shared.directory.forget(eventId);
        App.state.app.entries = App.state.app.entries.filter((item) => item.eventId !== eventId);
        Object.values(App.state.app.serviceYears).forEach((sy) => {
          Object.values(sy.weeks || {}).forEach((week) => { if (week.eventId === eventId) week.eventId = ''; });
        });
        if (App.state.editingEventId === eventId) App.actions.resetEventForm();
        App.store.save();
        App.ui.renderAll();
        App.ui.closeModal(App.els.eventEditorModal);
        App.utils.toast(App.utils.t('delete_template'));
      },
      openCalendarEditorForCreate(dateIso) {
        App.state.calendarEditingTarget = { mode: 'create', source: 'entry', refId: null };
        App.ui.openCalendarEditor({ eventId: '', start: dateIso, end: dateIso, note: '' }, false);
      },
      openCalendarEditorForItem(itemId) {
        const item = App.data.getCalendarItemById(itemId); if (!item) return;
        App.state.calendarEditingTarget = { mode: 'edit', source: item.source, refId: item.refId };
        App.ui.openCalendarEditor(item, true);
      },
      saveCalendarEditor() {
        const eventId = App.els.editorEventSelect?.value || ''; const start = App.els.editorStart?.value || ''; const end = App.els.editorEnd?.value || ''; const note = App.els.editorNoteInput?.value.trim() || '';
        const resultNote = App.els.editorResultInput?.value.trim() || '';
        const flagsInput = { f302: !!App.els.editorFlagS302?.checked, letter: !!App.els.editorFlagLetter?.checked };
        if (!eventId || !start || !end) return App.utils.toast(App.utils.t('choose_template_dates')); if (start > end) return App.utils.toast(App.utils.t('wrong_end_date'));
        const event = App.data.getEventById(eventId);
        const target = App.state.calendarEditingTarget || { mode: 'create', source: 'entry', refId: null };
        // Conflict detector: warn when another visit-type entry overlaps these dates.
        if (event?.visitType) {
          const ns = App.utils.parseLocalDate(start), ne = App.utils.parseLocalDate(end);
          const conflict = (App.state.app.entries || []).find((other) => {
            if (target.mode === 'edit' && target.source === 'entry' && other.id === target.refId) return false;
            const oe = App.data.getEventById(other.eventId); if (!oe?.visitType) return false;
            const os = App.utils.parseLocalDate(other.start), oed = App.utils.parseLocalDate(other.end);
            return os && oed && App.utils.overlaps(ns, ne, os, oed);
          });
          if (conflict) {
            const cTitle = conflict.title || App.data.getEventById(conflict.eventId)?.name || '';
            if (!window.confirm(`${App.utils.t('conflict_warning')}\n\n${cTitle}: ${App.utils.prettyDate(conflict.start)} — ${App.utils.prettyDate(conflict.end)}\n\n${App.utils.t('conflict_proceed')}`)) return;
          }
        }
        if (target.mode === 'edit' && target.source === 'entry') {
          const entry = App.state.app.entries.find((item) => item.id === target.refId); if (entry) { const dateChanged = entry.start !== start; entry.eventId = eventId; entry.start = start; entry.end = end; entry.title = event?.name || App.utils.t('event'); entry.note = note; entry.flags = flagsInput; entry.resultNote = resultNote; if (dateChanged) entry.notified60 = false; }
        } else if (target.mode === 'edit' && target.source === 'week') {
          let week = null; Object.values(App.state.app.serviceYears).forEach((sy) => { if (sy.weeks && sy.weeks[target.refId]) week = sy.weeks[target.refId]; }); if (week) { week.eventId = eventId; week.start = start; week.end = end; week.note = note; }
        } else {
          App.state.app.entries.push({ id: App.utils.uid('entry'), eventId, start, end, title: event?.name || App.utils.t('event'), note, flags: flagsInput, resultNote, source: 'entry' });
        }
        App.state.app.entries = App.utils.uniqueBy(App.state.app.entries, (item) => item.id);
        App.store.save(); App.ui.closeCalendarEditor(); App.ui.renderAll(); App.utils.toast(App.utils.t('calendar_event_saved'));
      },
      deleteCalendarEditorItem() {
        const target = App.state.calendarEditingTarget; if (!target || target.mode !== 'edit') return;
        if (target.source === 'entry') {
          App.state.app.entries = App.state.app.entries.filter((item) => item.id !== target.refId);
        } else if (target.source === 'week') {
          Object.values(App.state.app.serviceYears).forEach((sy) => { if (sy.weeks && sy.weeks[target.refId]) { sy.weeks[target.refId].eventId = ''; sy.weeks[target.refId].note = ''; sy.weeks[target.refId].priority = 'normal'; sy.weeks[target.refId].flagLetter = false; sy.weeks[target.refId].flagS302 = false; } });
        }
        App.store.save(); App.ui.closeCalendarEditor(); App.ui.renderAll(); App.utils.toast(App.utils.t('calendar_event_deleted'));
      },
      toggleWeekSentFlag(year, weekId, flagName, checked) {
        const week = App.state.app.serviceYears?.[year]?.weeks?.[weekId];
        if (!week) return;
        if (flagName === 's302') week.flagS302 = !!checked;
        if (flagName === 'letter') week.flagLetter = !!checked;
        App.store.save();
        App.ui.renderCalendar();
      },
      toggleEntrySentFlag(entryId, flagName, checked) {
        const entry = App.state.app.entries.find((item) => item.id === entryId);
        if (!entry) return;
        if (!entry.flags) entry.flags = { f302: false, letter: false };
        if (flagName === 's302') entry.flags.f302 = !!checked;
        if (flagName === 'letter') entry.flags.letter = !!checked;
        App.store.save();
        App.ui.renderCalendar();
      },
      exportSyncFile() {
        const now = new Date().toISOString();
        App.state.app.meta = App.state.app.meta || {};
        App.state.app.meta.lastSyncExportAt = now;
        App.state.app.meta.version = App.config.version;
        App.store.save();
        const payload = {
          schema: 'service-year-planner-sync-v1',
          exportedAt: now,
          appVersion: `v${App.config.version}`,
          source: 'manual-file-sync',
          payload: App.state.app
        };
        App.utils.downloadText(`service-year-planner-sync-${App.utils.iso(new Date())}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
        App.ui.renderSettings();
        App.utils.toast(App.utils.t('sync_export_done'));
      },
      importSyncFile(file) {
        if (!file) return App.utils.toast(App.utils.t('sync_no_file'));
        if (!window.confirm(App.utils.t('sync_import_confirm'))) { if (App.els.syncImportInput) App.els.syncImportInput.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result || '{}'));
            const rawPayload = parsed?.payload || parsed?.app || parsed;
            App.state.app = App.store.migrate(rawPayload);
            App.state.app.meta = App.state.app.meta || {};
            App.state.app.meta.lastSyncImportAt = new Date().toISOString();
            App.state.app.meta.lastSyncSourceExportedAt = parsed?.exportedAt || '';
            App.state.app.meta.version = App.config.version;
            App.store.save();
            const years = Object.keys(App.state.app.serviceYears || {}).map(Number).sort((a,b) => a - b);
            const currentSY = App.utils.getServiceYearForDate(new Date());
            const preferredSY = years.includes(currentSY) ? currentSY : (years.length ? years[years.length - 1] : currentSY);
            App.state.selectedYear = preferredSY;
            App.data.ensureServiceYear(preferredSY);
            App.data.getWeeksForYear(preferredSY);
            const bounds = App.utils.serviceYearBounds(preferredSY);
            const now = new Date();
            const showDate = (now >= bounds.start && now <= bounds.end) ? now : bounds.start;
            App.state.calendarYear = showDate.getFullYear();
            App.state.calendarMonth = showDate.getMonth();
            App.ui.renderAll();
            App.utils.toast(App.utils.t('sync_import_done'));
          } catch (error) {
            console.error(error);
            App.utils.toast(App.utils.t('sync_import_failed'));
          }
          if (App.els.syncImportInput) App.els.syncImportInput.value = '';
        };
        reader.onerror = () => { App.utils.toast(App.utils.t('sync_import_failed')); if (App.els.syncImportInput) App.els.syncImportInput.value = ''; };
        reader.readAsText(file, 'utf-8');
      },
      exportJson() {
        App.state.app.meta = App.state.app.meta || {};
        App.state.app.meta.lastBackupAt = new Date().toISOString();
        App.store.save();
        App.utils.downloadText(`circuit-planner-backup-${App.utils.iso(new Date())}.json`, JSON.stringify(App.state.app, null, 2), 'application/json;charset=utf-8');
      },
      downloadBackup() { this.exportJson(); },
      moveEntryToDate(entryId, targetIso) {
        const entry = App.state.app.entries.find((it) => it.id === entryId);
        const target = App.utils.parseLocalDate(targetIso);
        if (!entry || !target) return;
        const oldStart = App.utils.parseLocalDate(entry.start), oldEnd = App.utils.parseLocalDate(entry.end);
        if (!oldStart || !oldEnd) return;
        const span = App.utils.daysDiff(oldEnd, oldStart);
        entry.start = App.utils.iso(target);
        entry.end = App.utils.iso(App.utils.addDays(target, span));
        entry.notified60 = false;
        App.store.save();
        App.ui.renderAll();
        App.utils.toast(`${entry.title || App.utils.t('event')}: ${App.utils.prettyDate(entry.start)} — ${App.utils.prettyDate(entry.end)}`);
      },
      exportIcs() {
        let start = App.els.exportRangeStartInput?.value || App.utils.iso(new Date(App.state.calendarYear, App.state.calendarMonth, 1)); let end = App.els.exportRangeEndInput?.value || App.utils.iso(new Date(App.state.calendarYear, App.state.calendarMonth + 1, 0)); if (start > end) return App.utils.toast(App.utils.t('wrong_end_date')); const items = App.data.collectIcsItems(start, end); const escape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Service Year Planner//RU//']; items.forEach((item) => lines.push('BEGIN:VEVENT',`UID:${App.utils.uid('ics')}`,`DTSTAMP:${App.utils.iso(new Date()).replace(/-/g,'')}T000000Z`,`DTSTART;VALUE=DATE:${item.start.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${item.end.replace(/-/g,'')}`,`SUMMARY:${escape(item.title)}`,`DESCRIPTION:${escape(item.description)}`,`LOCATION:${escape(item.location)}`,'END:VEVENT')); lines.push('END:VCALENDAR'); App.utils.downloadText(`service-year-planner-${start}-${end}.ics`, `${lines.join('\r\n')}\r\n`, 'text/calendar;charset=utf-8');
      },
      exportSingleEventIcs(itemId) {
        const item = App.data.getCalendarItemById(itemId); if (!item) return; const event = App.data.getEventById(item.eventId); App.utils.downloadText(`${App.utils.slug(item.title || event?.name || 'event') || 'event'}.ics`, App.utils.makeSingleIcs(item, event), 'text/calendar;charset=utf-8');
      },
      importJson(file) {
        if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result || '{}')); App.state.app = App.store.migrate(parsed); App.store.save(); const years = Object.keys(App.state.app.serviceYears).map(Number).sort((a,b) => a - b);
            const currentSY = App.utils.getServiceYearForDate(new Date());
            const preferredSY = years.includes(currentSY) ? currentSY : (years.length ? years[years.length - 1] : currentSY);
            App.state.selectedYear = preferredSY;
            // Make calendar show something from imported range
            const bounds = App.utils.serviceYearBounds(preferredSY);
            const now = new Date();
            const inRange = now >= bounds.start && now <= bounds.end;
            const showDate = inRange ? now : bounds.start;
            App.state.calendarYear = showDate.getFullYear();
            App.state.calendarMonth = showDate.getMonth();
            if (!inRange) { App.state.calendarView = 'year'; App.state.app.settings.calendarView = 'year'; }
            App.ui.renderAll(); App.utils.toast(parsed?.schema === 'sp-backup-v2' ? App.utils.t('imported_backup') : App.utils.t('imported_json')); } catch (error) { console.error(error); App.utils.toast(App.utils.t('import_failed')); } if (App.els.importInput) App.els.importInput.value = ''; }; reader.readAsText(file, 'utf-8');
      },
      resetApp() { App.state.app = App.store.createDefaultData(); const sy = App.utils.getServiceYearForDate(new Date()); App.data.addServiceYear(sy); App.store.save(); App.ui.renderAll(); App.utils.toast(App.utils.t('app_reset')); },
      openPdf() { if (App.els.pdfModal) App.els.pdfModal.hidden = false; },
      closePdf() { if (App.els.pdfModal) App.els.pdfModal.hidden = true; },
      getPdfRange(type) {
        const monthStart = new Date(App.state.calendarYear, App.state.calendarMonth, 1);
        const monthEnd = new Date(App.state.calendarYear, App.state.calendarMonth + 1, 0);
        const sy = App.utils.getServiceYearForDate(monthStart);
        const bounds = App.utils.serviceYearBounds(sy);
        let start = App.utils.iso(monthStart), end = App.utils.iso(monthEnd);
        if (['custom-range','custom-range-calendar'].includes(type)) { start = App.els.pdfRangeStartInput?.value || start; end = App.els.pdfRangeEndInput?.value || end; }
        if (type === 'half-year-agenda') end = App.utils.iso(new Date(App.state.calendarYear, App.state.calendarMonth + 6, 0));
        if (['year-agenda','year-overview','visits-schedule'].includes(type)) { start = App.utils.iso(bounds.start); end = App.utils.iso(bounds.end); }
        return { start, end, sy };
      },
      collectPrintItems(startIso, endIso) {
        const start = App.utils.parseLocalDate(startIso), end = App.utils.parseLocalDate(endIso), items = [];
        if (!start || !end) return items;
        Object.values(App.state.app.serviceYears || {}).forEach((serviceYear) => Object.values(serviceYear?.weeks || {}).forEach((week) => {
          if (!week?.eventId) return;
          const ws = App.utils.parseLocalDate(week.start), we = App.utils.parseLocalDate(week.end);
          if (!ws || !we || !App.utils.overlaps(ws, we, start, end)) return;
          const event = App.data.getEventById(week.eventId);
          items.push({ source:'week', id:`week:${week.weekId}`, title:event?.name || App.utils.t('event'), start:week.start, end:week.end, startDate:ws, endDate:we, note:week.note || '', color:event?.color || '#1f7a45', address:event?.address || '', schedule:event?.schedule || '', flags:{ f302:!!week.flagS302, letter:!!week.flagLetter } });
        }));
        (App.state.app.entries || []).forEach((entry) => {
          const es = App.utils.parseLocalDate(entry.start), ee = App.utils.parseLocalDate(entry.end);
          if (!es || !ee || !App.utils.overlaps(es, ee, start, end)) return;
          const event = App.data.getEventById(entry.eventId);
          items.push({ source:'entry', id:`entry:${entry.id}`, title:entry.title || event?.name || App.utils.t('event'), start:entry.start, end:entry.end, startDate:es, endDate:ee, note:entry.note || '', color:event?.color || '#1f7a45', address:event?.address || '', schedule:event?.schedule || '', flags:{ f302:!!entry?.flags?.f302, letter:!!entry?.flags?.letter } });
        });
        return App.utils.uniqueBy(items, (item) => [item.source,item.title,item.start,item.end,item.note,item.address].join('|')).sort((a,b) => a.startDate - b.startDate || a.endDate - b.endDate || String(a.title).localeCompare(String(b.title)));
      },
      buildPrintHtml(type) {
        const range = this.getPdfRange(type);
        if (range.start > range.end) { App.utils.toast(App.utils.t('wrong_end_date')); return ''; }
        const items = this.collectPrintItems(range.start, range.end);
        const esc = (v) => App.utils.escapeHtml(v);
        const titles = { 'month-grid':App.utils.t('month_grid'), 'custom-range-calendar':App.utils.t('period_calendar'), 'month-agenda':App.utils.t('month_list'), 'half-year-agenda':App.utils.t('half_year'), 'year-agenda':App.utils.t('year_events'), 'custom-range':App.utils.t('list_period'), 'year-overview':App.utils.t('year_overview'), 'visits-schedule':App.utils.t('visits_schedule') };
        const title = titles[type] || App.utils.t('pdf_print');
        const flags = (f={}) => [f.letter ? App.utils.t('letter_short') : '', f.f302 ? App.utils.t('s302_short') : ''].filter(Boolean).map((x)=>`<span class="flag">${esc(x)}</span>`).join(' ');
        const agenda = () => items.length ? `<table><thead><tr><th>${esc(App.utils.t('start'))}</th><th>${esc(App.utils.t('end'))}</th><th>${esc(App.utils.t('event'))}</th><th>${esc(App.utils.t('schedule'))}</th><th>${esc(App.utils.t('address'))}</th><th>${esc(App.utils.t('note'))}</th></tr></thead><tbody>${items.map((it)=>`<tr><td>${esc(App.utils.prettyDateLong(it.startDate))}</td><td>${esc(App.utils.prettyDateLong(it.endDate))}</td><td><span class="dot" style="background:${App.utils.clampColor(it.color)}"></span>${esc(it.title)} ${flags(it.flags)}</td><td>${esc(it.schedule || App.utils.t('no_schedule'))}</td><td>${esc(it.address || App.utils.t('no_address'))}</td><td>${esc(it.note || App.utils.t('no_note'))}</td></tr>`).join('')}</tbody></table>` : `<div class="md-empty">${esc(App.utils.t('no_events_month'))}</div>`;
        const calendar = () => {
          const start = App.utils.parseLocalDate(range.start), end = App.utils.parseLocalDate(range.end), months = [];
          let cur = new Date(start.getFullYear(), start.getMonth(), 1), last = new Date(end.getFullYear(), end.getMonth(), 1);
          while (cur <= last) { months.push({ month:cur.getMonth(), year:cur.getFullYear() }); cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1); }
          return `<div class="print-months">${months.map(({month,year})=>{
            const mStart = new Date(year, month, 1), mEnd = new Date(year, month+1, 0), days=[];
            for (let i=0; i<((mStart.getDay()+6)%7); i++) days.push('<div class="cal-empty"></div>');
            for (let d=1; d<=mEnd.getDate(); d++) { const date = new Date(year,month,d); const dayItems = items.filter((it)=>App.utils.overlaps(it.startDate,it.endDate,date,date)); days.push(`<div class="cal-day"><strong>${d}</strong>${dayItems.map((it)=>`<div class="cal-event"><span class="dot" style="background:${App.utils.clampColor(it.color)}"></span>${esc(it.title)}</div>`).join('')}</div>`); }
            return `<section class="print-month"><h2>${esc(App.utils.monthName(month))} ${year}</h2><div class="cal-dow">${App.utils.dayNames().map((d)=>`<span>${esc(d)}</span>`).join('')}</div><div class="cal-grid">${days.join('')}</div></section>`;
          }).join('')}</div>`;
        };
        const overview = () => { const byMonth = new Map(); items.forEach((it)=>{ const k=`${it.startDate.getFullYear()}-${String(it.startDate.getMonth()+1).padStart(2,'0')}`; if(!byMonth.has(k)) byMonth.set(k,[]); byMonth.get(k).push(it); }); return `<table><thead><tr><th>${esc(App.utils.t('service_year'))}</th><th>${esc(App.utils.t('event'))}</th><th>${esc(App.utils.t('notes_count'))}</th></tr></thead><tbody>${Array.from(byMonth.entries()).map(([k,list])=>{ const [y,m]=k.split('-').map(Number); return `<tr><td>${esc(App.utils.monthName(m-1))} ${y}</td><td>${list.length}</td><td>${list.filter((x)=>x.note).length}</td></tr>`; }).join('')}</tbody></table>${agenda()}`; };
        const visitsSchedule = () => {
          const rows = (App.state.app.entries || []).map((entry) => ({ entry, event: App.data.getEventById(entry.eventId) }))
            .filter(({ entry, event }) => {
              if (!event?.visitType) return false;
              const es = App.utils.parseLocalDate(entry.start), ee = App.utils.parseLocalDate(entry.end);
              return es && ee && App.utils.overlaps(es, ee, App.utils.parseLocalDate(range.start), App.utils.parseLocalDate(range.end));
            })
            .sort((a, b) => String(a.entry.start).localeCompare(String(b.entry.start)));
          return rows.length ? `<table><thead><tr><th>№</th><th>${esc(App.utils.t('range_start'))}</th><th>${esc(App.utils.t('range_end'))}</th><th>${esc(App.utils.t('event'))}</th><th>${esc(App.utils.t('visit_type'))}</th><th>S-302</th><th>${esc(App.utils.t('letter_short'))}</th><th>${esc(App.utils.t('note'))}</th></tr></thead><tbody>${rows.map(({ entry, event }, i) => `<tr><td>${i + 1}</td><td>${esc(App.utils.prettyDateLong(entry.start))}</td><td>${esc(App.utils.prettyDateLong(entry.end))}</td><td><span class="dot" style="background:${App.utils.clampColor(event.color)}"></span>${esc(entry.title || event.name)}</td><td>${esc(App.utils.visitTypeLabel(event.visitType))}</td><td>${entry.flags?.f302 ? '✓' : '—'}</td><td>${entry.flags?.letter ? '✓' : '—'}</td><td>${esc(entry.note || '')}</td></tr>`).join('')}</tbody></table>` : `<div class="md-empty">${esc(App.utils.t('no_events_month'))}</div>`;
        };
        const body = (type === 'month-grid' || type === 'custom-range-calendar') ? calendar() : type === 'year-overview' ? overview() : type === 'visits-schedule' ? visitsSchedule() : agenda();
        const label = `${App.utils.prettyDateLong(App.utils.parseLocalDate(range.start))} — ${App.utils.prettyDateLong(App.utils.parseLocalDate(range.end))}`;
        /* Возвращается НЕ готовый документ, а его части: окно, <head> и
           отправку на печать собирает CWPrint.document(). Раньше здесь
           склеивался весь HTML целиком, вместе с копией того же каркаса,
           что и в композере.

           Календарь — не письмо, поэтому почти вся типографика общего слоя
           здесь переопределяется: своя гарнитура, свой кегль, свои поля.
           Правила модуля идут ПОСЛЕ общих, поэтому переопределение работает
           без !important. `@page` уехал в параметр `page`. */
        return {
          title,
          css: /* line-height и font-weight ОБЯЗАТЕЛЬНЫ, хотя в прежнем документе их не
               было: общий слой задаёт типографику сокращённым `font:`, а оно
               сбрасывает оба свойства заодно. Без явного сброса в календарь
               протекала письмовая интерлиньяж 1.62 — поймано сравнением бумаги. */
            'body{font-family:Segoe UI,Arial,sans-serif;color:#16251d;margin:0;padding:22px;background:#fff;font-size:12px;font-weight:400;line-height:normal}'
            + 'h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:0 0 10px}'
            + '.meta{color:#566;margin-bottom:18px}'
            + '.print-months{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}'
            + '.print-month{break-inside:avoid;border:1px solid #ccd8d0;border-radius:12px;padding:12px}'
            + '.cal-dow,.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}'
            + '.cal-dow span{text-align:center;color:#667;font-weight:600}'
            + '.cal-day,.cal-empty{min-height:78px;border:1px solid #dde6e0;border-radius:8px;padding:5px}'
            + '.cal-day strong{display:block;margin-bottom:3px}'
            + '.cal-event{font-size:10px;margin:2px 0;padding:2px 4px;border-radius:6px;background:#f1f5f2;overflow:hidden;text-overflow:ellipsis}'
            + '.dot{display:inline-block;width:8px;height:8px;border-radius:999px;margin-right:5px}'
            + '.flag{display:inline-block;border:1px solid #ccd8d0;border-radius:999px;padding:1px 5px;margin-left:3px;font-size:10px}'
            + 'table{width:100%;border-collapse:collapse}'
            + 'th,td{border:1px solid #ccd8d0;padding:7px;text-align:left;vertical-align:top}'
            + 'th{background:#eef5f0}'
            + '.empty{border:1px dashed #ccd8d0;border-radius:10px;padding:20px;text-align:center;color:#667}'
            + '@media print{body{padding:0}.print-month{page-break-inside:avoid}}',
          body: `<h1>${esc(title)}</h1><div class="meta">${esc(label)} · Service Year Planner</div>${body}`,
        };
      },
      doPrint() {
        const doc = this.buildPrintHtml(App.state.pdfExportType || 'month-grid');
        /* Пустая строка — сигнал «диапазон задан неверно», тост уже показан
           внутри buildPrintHtml. Проверять надо ДО closePdf(), иначе диалог
           закроется, а печатать нечего. */
        if (!doc) return;
        this.closePdf();
        /* Заблокированное окно — это отказ, а не повод напечатать что-нибудь
           ещё. Раньше здесь стоял откат на window.print(): на бумагу уходил
           ЭКРАН приложения вместо календаря, то есть лист выглядел как успех,
           но содержал не то. См. docs/print/01-audit.md, §2.2. */
        CWPrint.document({
          title: doc.title,
          lang: App.utils.lang(),
          css: doc.css,
          /* Альбомная ориентация и узкие поля — свойство именно календаря:
             сетка на 7 колонок в книжной не читается. Общий слой по умолчанию
             даёт письмовые 28/20 мм. */
          page: { size: 'A4 landscape', margin: '10mm' },
          html: doc.body,
          onBlocked: () => App.utils.toast(App.utils.t('docs_print_blocked')),
        });
      }
    },

    ui: {
      cacheElements() {
        [
          'appRoot','desktopNav','toastWrap','offlineBanner','sideStatus','screenTitle','screenSubtitle','nextVisitPill','nextVisitPillName','nextVisitPillDate','nextVisitPillType','nextVisitPillRange','nextVisitPillLetter','nextVisitPillS302',
          'eventEditorModal','eventEditorCloseBtn',
          'monthLabel','calendarRangeLabel','calendarGrid','prevMonthBtn','todayMonthBtn','nextMonthBtn',
          'calendarYearSelect','calendarLayoutPresetSelect','layoutPresetSelect','calendarEditor','editorTitle',
          'editorMeta','editorEventSelect','editorStart','editorEnd','editorReadonly','editorCloseBtn',
          'editorCancelBtn','editorDeleteBtn','editorSaveBtn','calendarServiceYearLabel',
          'calendarSideTitle','calendarSideMeta','calendarSideDetails','calendarSideCountdownRow','calendarSideCountdown','countdownUnitSelect',
          'toggleTeamPanelBtn','calendarLayout','eventsList','eventSearchInput','eventColorFilter','eventVisitFilter','deleteAllEventsBtn','eventsListCount','eventNameInput','eventColorInput','eventAddressInput',
          'eventScheduleInput','resetEventBtn','saveEventBtn','deleteEventBtn','newEventBtn','eventVisitTypeInput','eventContactNameInput','eventContactPhoneInput','eventContactEmailInput','eventContactNoteInput','editorFlagsRow','editorFlagS302','editorFlagLetter',
          'fillCongNumbersBtn','fillNumbersModal','fillNumbersSub','fillNumbersBody','fillNumbersApplyBtn','fillNumbersCancelBtn','fillNumbersCloseBtn',
          'eventDeleteModal','eventDeleteSub','eventDeleteHereBtn','eventDeleteEverywhereBtn','eventDeleteCancelBtn','eventDeleteCloseBtn',
          'remindersModal','remindersModalList','remindersModalCloseBtn','remindersModalOkBtn','remindersModalTitle','remindersModalSub','checkRemindersBtnMain',
          'historyModal','historyList','historyModalCloseBtn','historyModalCloseBtn2','openHistoryBtn',
          'statsModal','statsModalTitle','statsModalSub','statsModalBody','statsModalCloseBtn','statsModalOkBtn','statsBtn','plannerBtn',
          'plannerModal','plannerModalCloseBtn','plannerStartInput','plannerEndInput','plannerEventsList','plannerPreview','plannerCancelBtn','plannerApplyBtn',
          'pinOverlay','pinInput','pinError','pinSubmitBtn','pinSetupBtn','holidaysToggle','autoShowRemindersToggle','editorResultInput','editorResultLabel',
          'eventCongNumberInput','eventFormLanguageSelect','eventVisitOnlyFields','geocodeEventBtn','eventDistanceStatus','homeAddressInput','geocodeHomeBtn','homeGeocodeStatus','letterTemplateEditor','letterTemplateResetBtn','letterPagesList','addLetterPageBtn','previewLetterPdfBtn','senderNameInput','senderAddressInput','senderPhoneInput','senderEmailInput','emailMethodSelect','owaUrlInput','owaUrlRow','emailBodyDefaultInput','emailBodyDefaultResetBtn','placeholderRefBody','letterSalutationInput','letterSalutationResetBtn',
          'vfLanguageSelect','vfLanguageReminder',
          'visitFormModal','visitFormSub','visitFormCloseBtn','vfVisitType','vfMeetingsList','vfAddMeetingBtn','vfServiceDaysList','vfAddDayBtn','vfPastoralHeading','vfPastoralList','vfAddPastoralBtn','vfMealsList','vfAddMealBtn','vfNotesInput','vfCloseBtn2','vfGeneratePdfBtn',
          'letterModal','letterModalSub','letterModalCloseBtn','letterEmailBodyInput','letterAttachStatus','letterPreviewPdfBtn','letterAttachPdfBtn','letterSendBtn','letterEmailBodyResetToDefaultBtn','letterSubjectInput','letterSnapshotBtn',
          'visitDocsModal','visitDocsSub','visitDocsList','visitDocsCloseBtn','visitDocsCloseBtn2',
          'composerModal','composerTitle','composerSub','composerSubject','composerPaper','composerCloseBtn',
          'composerEditBtn','composerCopySubjectBtn','composerCopyTextBtn','composerPrintBtn','composerPdfBtn','composerSaveBtn','composerPaperHead',
          'languageSelect','themeSelect','accentSelect','fontSizeSelect',
          'settingsPdfBtn','backupBtn','resetAppBtn','themeBtn','exportBtn','importInput','pdfModal','pdfModalCloseBtn',
          'pdfCancelBtn','pdfExportConfirmBtn','pdfRangeCard','pdfRangeStartInput','pdfRangeEndInput','pdfRangeHelp','pdfHint',
          'bottomNav','bottomNavRow','mobileOverlay','mobileMenuToggleBtn','exportModal','exportModalCloseBtn','exportCancelBtn',
          'exportConfirmBtn','exportRangeCard','exportRangeStartInput','exportRangeEndInput','exportRangeHelp','syncTitle','syncHint','syncExportBtn','syncImportInput','syncImportLabel','syncStatus','addYearInput','addNextYearBtn','addYearBtn'
        ].forEach((id) => { App.els[id] = document.getElementById(id); });
      },
      cleanupCalendarChrome() {
        document.querySelectorAll('#calendar .legend, .sy-legend, .sy-compact-hint').forEach((node) => node.remove());
      },
      ensureFontSizeControl() {
        if (document.getElementById('fontSizeSelect')) {
          App.els.fontSizeSelect = document.getElementById('fontSizeSelect');
          return;
        }
        const layoutSelect = document.getElementById('layoutPresetSelect');
        const host = layoutSelect?.closest('div');
        if (!host?.parentNode) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = `<label class="small" data-i18n="cp.font_size_label">Размер шрифта интерфейса</label><select id="fontSizeSelect"><option data-i18n="cp.fs_80" value="80">80% — Очень мелкий</option><option data-i18n="cp.fs_85" value="85">85% — Мелкий</option><option data-i18n="cp.fs_90" value="90">90% — Компактный</option><option data-i18n="cp.fs_95" value="95">95% — Чуть меньше</option><option data-i18n="cp.fs_100" value="100">100% — Обычный</option><option data-i18n="cp.fs_105" value="105">105% — Чуть больше</option><option data-i18n="cp.fs_110" value="110">110% — Крупный</option><option data-i18n="cp.fs_115" value="115">115% — Очень крупный</option><option data-i18n="cp.fs_120" value="120">120% — Максимальный</option><option data-i18n="cp.fs_125" value="125">125% — Огромный</option></select><div class="layout-help" data-i18n="cp.font_size_hint">Меняет размер текста, кнопок и календаря.</div>`;
        host.parentNode.insertBefore(wrap, host);
        App.els.fontSizeSelect = document.getElementById('fontSizeSelect');
      },
      ensureEditorNoteField() {
        if (!App.els.calendarEditor) return;
        if (!App.els.editorNoteInput) {
          const meta = App.els.editorReadonly;
          const wrap = document.createElement('label');
          wrap.style.display = 'grid'; wrap.style.gap = '6px'; wrap.style.marginTop = '12px';
          wrap.innerHTML = `<span class="small" id="editorNoteLabel"></span><textarea id="editorNoteInput"></textarea>`;
          meta.parentNode.insertBefore(wrap, meta.nextSibling);
          App.els.editorNoteInput = document.getElementById('editorNoteInput');
          App.els.editorNoteLabel = document.getElementById('editorNoteLabel');
        }
      },

      localizeColorOptions() {
        if (!App.els.eventColorInput) return;
        const current = App.els.eventColorInput.value || '#1f7a45';
        App.els.eventColorInput.innerHTML = App.utils.colorOptionsHtml(current);
        App.els.eventColorInput.value = current;
        if (!App.els.eventColorInput.value) App.els.eventColorInput.value = '#1f7a45';
      },
      localizeStaticTexts() {
        document.documentElement.lang = App.utils.lang();
        // Статическая разметка переводится по атрибутам data-i18n общим
        // механизмом хаба. Язык передаём явно: у модуля свой (мост держит его
        // в согласии с хабом), и для `de` он отображается на ближайший
        // доступный — CWI18n.getLang() здесь дал бы не то.
        if (typeof CWI18n !== 'undefined') CWI18n.apply(document, App.utils.lang());
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => Array.from(document.querySelectorAll(sel));
        this.localizeColorOptions();
        const brandH1 = q('.brand h1'); if (brandH1) brandH1.textContent = App.utils.t('appTitle');
        const brandP = q('.brand p'); if (brandP) brandP.textContent = `v${App.config.version} • Circuit Workspace`;
        // Бейдж версии из шапки экрана убран: та же версия уже показана в общей
        // шапке модуля (#cwModuleVersion) строкой выше — дублировалась дважды.
        // Версия в общей шапке модуля — короткая, как в остальных модулях
        // Circuit Workspace. Это теперь единственное место, где она показана.
        const cwVersion = q('#cwModuleVersion'); if (cwVersion) cwVersion.textContent = `v${App.config.version}`;
        // Keep the tab title in sync with the single source of truth instead of hardcoding it in index.html.
        document.title = `${App.utils.t('appTitle')} v${App.config.version}`;
        if (App.els.themeBtn) App.els.themeBtn.textContent = App.utils.t('theme');
        if (App.els.exportBtn) App.els.exportBtn.textContent = App.utils.t('export');
        if (App.els.syncTitle) App.els.syncTitle.textContent = App.utils.t('sync_title');
        if (App.els.syncHint) App.els.syncHint.textContent = App.utils.t('sync_hint');
        if (App.els.syncExportBtn) App.els.syncExportBtn.textContent = App.utils.t('sync_export');
        if (App.els.syncImportLabel) App.els.syncImportLabel.textContent = App.utils.t('sync_import');
        const importLabel = q('label[for="importInput"]'); if (importLabel) importLabel.textContent = App.utils.t('import_json');
        if (App.els.offlineBanner) App.els.offlineBanner.textContent = App.utils.t('offline');
        if (App.els.toggleTeamPanelBtn) App.els.toggleTeamPanelBtn.textContent = App.state.calendarView === 'year' ? App.utils.t('calendar_view_month') : App.utils.t('calendar_view_year');
        if (App.els.todayMonthBtn) App.els.todayMonthBtn.textContent = App.utils.t('today');
        if (App.els.eventScheduleInput) App.els.eventScheduleInput.placeholder = App.utils.t('placeholder_schedule');
        const headings = qa('#events h3, #settings h3');
        if (headings[0]) { headings[0].textContent = ''; headings[0].hidden = true; headings[0].style.display = 'none'; }
        if (headings[1]) headings[1].textContent = App.utils.t('event_editor');
        if (headings[2]) headings[2].textContent = App.utils.t('look_and_feel');
        if (headings[3]) headings[3].textContent = App.utils.t('data_management');
        if (App.els.resetEventBtn) App.els.resetEventBtn.textContent = App.utils.t('clear');
        if (App.els.saveEventBtn) App.els.saveEventBtn.textContent = App.utils.t('save_event');
        if (App.els.settingsPdfBtn) App.els.settingsPdfBtn.textContent = App.utils.t('pdf_print');
        if (App.els.addNextYearBtn) App.els.addNextYearBtn.textContent = App.utils.t('add_next_year');
        if (App.els.addYearBtn) App.els.addYearBtn.textContent = App.utils.t('add');
        if (App.els.backupBtn) App.els.backupBtn.textContent = App.utils.t('create_backup');
        if (App.els.resetAppBtn) App.els.resetAppBtn.textContent = App.utils.t('reset_app');
        const settingsSmall = qa('#settings .small');
        settingsSmall.forEach((el) => {
          const text = el.textContent.trim();
          if (text.includes('Добавить служебный год') || text.includes('Add service year') || text.includes('Додати службовий рік') || text.includes('Dodaj rok służbowy')) el.textContent = App.utils.t('add_service_year');
          if (text.includes('Язык') || text.includes('Language') || text.includes('Мова') || text.includes('Język')) el.textContent = App.utils.t('language');
          if (text.includes('Тема') || text.includes('Theme') || text.includes('Motyw')) el.textContent = App.utils.t('theme');
          if (text.includes('Макет календаря') || text.includes('Calendar layout') || text.includes('Макет календаря') || text.includes('Układ kalendarza')) el.textContent = App.utils.t('layout');
          if (text.includes('Название') || text.includes('Name') || text.includes('Назва') || text.includes('Nazwa')) el.textContent = App.utils.t('name');
          if (text.includes('Цвет') || text.includes('Color') || text.includes('Колір') || text.includes('Kolor')) el.textContent = App.utils.t('color');
          if (text.includes('Адрес') || text.includes('Address') || text.includes('Адреса')) el.textContent = App.utils.t('address');
          if (text.includes('Расписание') || text.includes('Schedule') || text.includes('Розклад') || text.includes('Harmonogram')) el.textContent = App.utils.t('schedule');
          if (text.includes('Назначенное событие') || text.includes('Assigned event') || text.includes('Призначена подія') || text.includes('Przypisane wydarzenie')) el.textContent = App.utils.t('assigned_event');
          if (text.includes('Приоритет') || text.includes('Priority') || text.includes('Пріоритет')) el.textContent = App.utils.t('priority');
          if (text.includes('Заметка недели') || text.includes('Week note') || text.includes('Нотатка тижня') || text.includes('Notatka tygodnia')) el.textContent = App.utils.t('week_note');
          if (text.includes('Фильтр события') || text.includes('Event filter') || text.includes('Фільтр події') || text.includes('Filtr wydarzeń')) el.textContent = App.utils.t('filter_event');
        });
        const formLabels = qa('#calendarEditor span, #pdfModal h3, #exportModal h3');
        qa('#calendar .legend-chip').forEach((chip, index) => {
          chip.childNodes[1].textContent = index === 0 ? App.utils.t('event') : index === 1 ? App.utils.t('weekend') : App.utils.t('today_label');
        });
        if (App.els.editorCloseBtn) App.els.editorCloseBtn.title = App.utils.t('close');
        if (App.els.editorCancelBtn) App.els.editorCancelBtn.textContent = App.utils.t('close');
        if (App.els.editorSaveBtn) App.els.editorSaveBtn.textContent = App.utils.t('save');
        if (App.els.editorDeleteBtn) App.els.editorDeleteBtn.textContent = App.utils.t('delete_event');
        if (App.els.editorTitle) App.els.editorTitle.textContent = App.utils.t('new_event');
        if (App.els.editorNoteLabel) App.els.editorNoteLabel.textContent = App.utils.t('note');
        if (App.els.pdfModal) {
          const h3 = App.els.pdfModal.querySelector('h3'); if (h3) h3.textContent = App.utils.t('export_pdf_title');
          const sub = App.els.pdfModal.querySelector('.modal-sub'); if (sub) sub.textContent = App.utils.t('export_pdf_sub');
          const h4 = App.els.pdfModal.querySelectorAll('.pdf-section h4'); if (h4[0]) h4[0].textContent = App.utils.t('month_grid'); if (h4[1]) h4[1].textContent = App.utils.t('reports');
          const opts = App.els.pdfModal.querySelectorAll('[data-pdf-type] strong');
          const desc = App.els.pdfModal.querySelectorAll('[data-pdf-type] span');
          const pdfMap = [['month_grid','month_grid_desc'],['period_calendar','period_calendar_desc'],['month_list',''],['half_year',''],['year_events',''],['list_period',''],['visits_schedule',''],['year_overview','']];
          opts.forEach((el, i) => { if (pdfMap[i]) el.textContent = App.utils.t(pdfMap[i][0]); });
          desc.forEach((el, i) => { if (pdfMap[i] && pdfMap[i][1]) el.textContent = App.utils.t(pdfMap[i][1]); });
          if (App.els.pdfRangeHelp) App.els.pdfRangeHelp.textContent = App.utils.t('choose_range');
          if (App.els.pdfCancelBtn) App.els.pdfCancelBtn.textContent = App.utils.t('close');
          if (App.els.pdfExportConfirmBtn) App.els.pdfExportConfirmBtn.textContent = App.utils.t('print');
        }
        if (App.els.exportModal) {
          const h3 = App.els.exportModal.querySelector('h3'); if (h3) h3.textContent = App.utils.t('export_title');
          const sub = App.els.exportModal.querySelector('.modal-sub'); if (sub) sub.textContent = App.utils.t('export_sub');
          const h4 = App.els.exportModal.querySelector('.pdf-section h4'); if (h4) h4.textContent = App.utils.t('export');
          if (App.els.exportRangeHelp) App.els.exportRangeHelp.textContent = App.utils.t('choose_range');
          const hint = App.els.exportModal.querySelector('.small[style*="margin-top:8px"]'); if (hint) hint.textContent = App.utils.t('google_hint');
          if (App.els.exportCancelBtn) App.els.exportCancelBtn.textContent = App.utils.t('close');
          if (App.els.exportConfirmBtn) App.els.exportConfirmBtn.textContent = App.utils.t('download');
        }
        if (App.els.languageSelect) {
          // Раньше подписи ставились по индексу (opts[0..3]) — добавление
          // опции «Как в Circuit Workspace» сдвинуло бы их все. Теперь
          // сопоставление идёт по value и от порядка не зависит.
          const NATIVE = { ru: 'Русский', en: 'English', uk: 'Українська', pl: 'Polski', de: 'Deutsch' };
          Array.from(App.els.languageSelect.options).forEach((opt) => {
            if (opt.value === App.i18nBridge.HUB_VALUE) {
              opt.textContent = App.i18nBridge.ready() ? CWI18n.t('common.language_inherit') : 'Как в Circuit Workspace';
            } else if (NATIVE[opt.value]) {
              opt.textContent = NATIVE[opt.value];
            }
          });
        }
      },
      renderAll() {
        this.ensureCalendarViewStyles();
        this.ensureEditorNoteField();
        this.ensureFontSizeControl();
        this.localizeStaticTexts();
        this.applyTheme();
        this.applyFontSize();
        this.applyAccent();
        this.applyLayout();
        // Удалён вызов removeTeamPanel(): панель команды давно вырезана из разметки,
        // функция искала #calendarQuickList / #calendarEventQuickFilter, которых в
        // index.html нет, а снятие класса team-hidden уже делает applyLayout().
        if (App.els.calendarLayout) App.els.calendarLayout.classList.remove('team-hidden');
        this.renderNav();
        this.renderScreenHeader();
        this.renderCalendar();
        this.cleanupCalendarChrome();
        this.renderEvents();
        this.renderSettings();
        this.renderStatus();
        this.updateReminderButtonBadge();
        this.renderNextVisitCard();
        if (App.els.holidaysToggle) App.els.holidaysToggle.checked = !!App.state.app.settings.showHolidays;
        if (App.els.autoShowRemindersToggle) App.els.autoShowRemindersToggle.checked = !!App.state.app.settings.autoShowReminders;
        this.updatePinButton();
      },
      updateReminderButtonBadge() {
        const count = App.data.getUpcomingReminders().length;
        if (App.els.checkRemindersBtnMain) App.els.checkRemindersBtnMain.textContent = count ? App.utils.t('reminders_btn_count', { count }) : App.utils.t('reminders_btn');
      },
      renderNav() {
        const buildButton = (item, mobile = false) => `<button class="${mobile ? 'bottom-nav-btn' : 'nav-btn'} ${App.state.selectedScreen === item.id ? 'active' : ''}" data-screen="${item.id}" type="button"><span class="icon">${item.icon}</span><span class="label">${App.utils.t(item.tKey)}</span></button>`;
        if (App.els.desktopNav) App.els.desktopNav.innerHTML = App.config.navItems.map((item) => buildButton(item, false)).join('');
        if (App.els.bottomNavRow) App.els.bottomNavRow.innerHTML = App.config.navItems.map((item) => buildButton(item, true)).join('');
        document.querySelectorAll('[data-screen]').forEach((btn) => btn.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); App.state.selectedScreen = btn.dataset.screen; App.ui.closeMobileMenu(); App.ui.renderAll(); window.scrollTo(0, 0); }));
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === App.state.selectedScreen));
        this.fixBottomNavViewport();
      },
      // Positions the fixed bottom nav using the visualViewport API instead of trusting
      // plain `position:fixed; bottom:0`. Android Chrome's dynamic address bar can leave
      // the browser's own idea of "viewport bottom" stale right after a JS-driven screen
      // switch (especially when the new screen's content height differs a lot from the
      // previous one) — visualViewport always reports the true, current visible area.
      fixBottomNavViewport() {
        const nav = App.els.bottomNav;
        if (!nav) return;
        const apply = () => {
          if (window.visualViewport) {
            const vv = window.visualViewport;
            const bottomOffset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
            nav.style.bottom = `${bottomOffset}px`;
          } else {
            nav.style.bottom = '0px';
          }
        };
        apply();
        requestAnimationFrame(apply);
        setTimeout(apply, 150);
      },
      renderScreenHeader() {
        // Подзаголовок экрана здесь больше не вычисляется. Элемент #screenSubtitle
        // (<p> внутри .topbar) скрыт правилом `.topbar p{display:none !important}`
        // из инжектируемого блока calendarViewStyles — текст считался, переводился
        // и записывался, но пользователь не видел его ни разу.
        // Разметка и ключи subtitle_* оставлены намеренно: если подзаголовок решат
        // показывать, вернуть строку и снять правило. Учесть, что высота шапки
        // меряется из живого DOM (measureTopbarHeight) и лишняя строка сдвинет
        // раскладку календаря — такую правку нужно проверять в браузере.
        const map = { calendar:'screen_calendar', weeks:'screen_weeks', events:'screen_events', notes:'screen_notes', settings:'screen_settings' };
        const titleKey = map[App.state.selectedScreen] || 'appTitle'; if (App.els.screenTitle) App.els.screenTitle.textContent = App.utils.t(titleKey);
      },
      renderStatus() {
        const years = Object.keys(App.state.app.serviceYears).length; const notes = Object.values(App.state.app.serviceYears).reduce((sum, sy) => sum + Object.values(sy.weeks || {}).filter((w) => w.note).length, 0);
        if (App.els.sideStatus) App.els.sideStatus.innerHTML = `<div>${App.utils.t('years_count')}: <strong>${years}</strong></div><div>${App.utils.t('templates_count')}: <strong>${App.state.app.events.length}</strong></div><div>${App.utils.t('entries_count')}: <strong>${App.state.app.entries.length}</strong></div><div>${App.utils.t('notes_count')}: <strong>${notes}</strong></div>`;
      },
      renderYearOptions() {
        const currentSY = App.utils.getServiceYearForDate(new Date()); App.data.ensureServiceYear(currentSY); App.data.getWeeksForYear(currentSY); const keys = Object.keys(App.state.app.serviceYears).map(Number).sort((a,b) => a - b); if (!keys.length) keys.push(currentSY); if (!keys.includes(App.state.selectedYear)) App.state.selectedYear = keys[keys.length - 1]; const options = keys.map((year) => `<option value="${year}">${App.utils.serviceYearLabel(year)}</option>`).join(''); if (App.els.yearSelect) { App.els.yearSelect.innerHTML = options; App.els.yearSelect.value = String(App.state.selectedYear); }
      },
      renderLayoutOptions() { const options = App.config.layoutPresets.map((item) => `<option value="${item.value}">${App.utils.escapeHtml(App.utils.t(item.labelKey))}</option>`).join(''); ['layoutPresetSelect','calendarLayoutPresetSelect'].forEach((id) => { const el = App.els[id]; if (!el) return; el.innerHTML = options; el.value = App.state.app.settings.layoutPreset; }); },
      applyAccent() {
        const palettes = {
          green:{accent:'#14532d',accent2:'#0d3d22',rgb:'20,83,45'},
          blue:{accent:'#1d4ed8',accent2:'#1e3a8a',rgb:'29,78,216'},
          purple:{accent:'#6a45c9',accent2:'#3d2470',rgb:'106,69,201'},
          teal:{accent:'#0f766e',accent2:'#115e59',rgb:'15,118,110'},
          amber:{accent:'#b45309',accent2:'#78350f',rgb:'180,83,9'},
          red:{accent:'#b91c1c',accent2:'#7f1d1d',rgb:'185,28,28'},
          slate:{accent:'#334155',accent2:'#0f172a',rgb:'51,65,85'}
        };
        const key = App.state.app?.settings?.accentColor || 'purple';
        const p = palettes[key] || palettes.green;
        document.documentElement.style.setProperty('--accent', p.accent);
        document.documentElement.style.setProperty('--accent2', p.accent2);
        document.documentElement.style.setProperty('--accent-rgb', p.rgb);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', p.accent);
        if (App.els.accentSelect) App.els.accentSelect.value = palettes[key] ? key : 'purple';
        try { localStorage.setItem('service-year-planner-accent', palettes[key] ? key : 'purple'); } catch (_) {}
      },
      applyFontSize() {
        const legacyMap = { small: '90', normal: '100', large: '110', xlarge: '120' };
        const allowed = ['80','85','90','95','100','105','110','115','120','125'];
        const raw = String(App.state.app?.settings?.fontSize || '100');
        const value = legacyMap[raw] || (allowed.includes(raw) ? raw : '100');
        if (App.state.app.settings.fontSize !== value) { App.state.app.settings.fontSize = value; App.store.save(); }
        document.documentElement.setAttribute('data-font-size', value);
        document.documentElement.style.setProperty('--ui-font-scale', String(Number(value) / 100));
        if (App.els.fontSizeSelect) App.els.fontSizeSelect.value = value;
      },
      applyTheme() {
        // Тема — общая настройка приложения (shared/theme.js), а не модуля.
        // Прежний выбор пользователя переносится один раз через adopt():
        // он пишет только если общего ключа ещё нет, поэтому не затирает
        // тему, выбранную в хабе или другом модуле.
        if (window.CWTheme) {
          const legacy = App.state.app.settings.theme;
          if (legacy === 'light' || legacy === 'dark') window.CWTheme.adopt(legacy);
          App.state.app.settings.theme = window.CWTheme.get();
          if (App.els.themeSelect && !App.els.themeSelect.dataset.cwThemeBound) {
            window.CWTheme.mountSelect(App.els.themeSelect);
            App.els.themeSelect.dataset.cwThemeBound = '1';
          }
          return;
        }
        document.documentElement.setAttribute('data-theme', App.state.app.settings.theme || 'light');
        if (App.els.themeSelect) App.els.themeSelect.value = App.state.app.settings.theme || 'light';
      },
      applyLayout() { document.documentElement.setAttribute('data-layout', App.state.app.settings.layoutPreset || 'classic'); if (App.els.calendarLayout) App.els.calendarLayout.classList.remove('team-hidden'); },
      buildMonthGrid(month, year) {
        const monthStart = new Date(year, month, 1); const monthEnd = new Date(year, month + 1, 0); const gridStart = App.utils.startOfWeek(monthStart); const gridEnd = App.utils.addDays(App.utils.startOfWeek(monthEnd), 41 - App.utils.daysDiff(App.utils.startOfWeek(monthEnd), gridStart)); const weeks = []; let cursor = new Date(gridStart); while (cursor <= gridEnd) { const days = []; for (let i = 0; i < 7; i += 1) { const date = App.utils.addDays(cursor, i); days.push({ date, iso: App.utils.iso(date), day: date.getDate(), month: date.getMonth(), inMonth: date.getMonth() === month, isWeekend: date.getDay() === 0 || date.getDay() === 6, isToday: App.utils.iso(date) === App.utils.iso(new Date()) }); } weeks.push({ id: App.utils.weekIdForDate(cursor), start: new Date(cursor), number: App.utils.weekNumber(cursor), days }); cursor = App.utils.addDays(cursor, 7); }
        // Only keep weeks that actually contain at least one day of the current month —
        // the fixed 6-week grid otherwise appends a fully empty next-month week.
        return weeks.filter((week) => week.days.some((day) => day.inMonth));
      },
      ensureCalendarViewStyles() {
        if (document.getElementById('calendarViewStyles')) return;
        const style = document.createElement('style');
        style.id = 'calendarViewStyles';
        style.textContent = `
          .service-year-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:18px;background:var(--surface2)}
          .sy-month-card{background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:12px;min-width:0}
          .sy-month-title{font-weight:700;margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:center}
          .sy-month-title small{color:var(--muted);font-weight:500}
          .sy-dow,.sy-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
          .sy-dow span{font-size:10px;color:var(--muted);text-align:center;padding:2px 0}
          .sy-day{appearance:none;border:1px solid transparent;background:transparent;color:var(--text);border-radius:9px;min-height:30px;padding:2px;display:grid;place-items:center;gap:1px;cursor:pointer;font:inherit;font-size:11px;position:relative}
          .sy-day:hover{background:var(--surface2);border-color:var(--line)}
          .sy-day.today{background:var(--accent);color:#fff}
          .sy-day.weekend:not(.today){background:var(--cal-weekend-bg)}
          .sy-day.has-events:not(.today){border-color:rgba(var(--accent-rgb,20,83,45),.25)}
          .sy-event-dots{display:flex;gap:2px;justify-content:center;min-height:4px}
          .sy-event-dot{width:4px;height:4px;border-radius:999px;display:block}
          .sy-empty{min-height:30px}
          .sy-day.sy-outside{color:var(--muted);opacity:.55}
          .sy-day.sy-outside:hover{opacity:.85;background:var(--surface2)}
          .sy-day.selected{outline:2px solid var(--accent);outline-offset:1px;background:rgba(var(--accent-rgb,20,83,45),.10)}
          .sy-day .sy-count{position:absolute;right:3px;top:2px;font-size:9px;color:var(--muted)}
          .sy-month-summary{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;min-height:16px}
          .sy-month-summary .dot{width:7px;height:7px}
          .sy-legend{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 18px 0;background:var(--surface2)}
          .sy-legend-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:6px 10px;font-size:12px;color:var(--text)}
          .sy-legend-sample{width:12px;height:12px;border-radius:999px;display:inline-block;background:var(--accent)}
          .sy-legend-sample.outline{background:transparent;border:2px solid rgba(var(--accent-rgb,20,83,45),.35)}
          .sy-legend-sample.today{background:var(--accent)}
          .sy-compact-hint{display:none;padding:8px 18px 0;background:var(--surface2)}
          @media (max-width:1100px){.service-year-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
          @media (max-width:680px){.service-year-grid{grid-template-columns:1fr;padding:10px;gap:10px}.sy-month-card{padding:10px;border-radius:16px}.sy-day{min-height:30px;font-size:10px}.sy-dow span{font-size:9px}.sy-legend{padding:10px 10px 0;gap:6px}.sy-legend-chip{font-size:11px;padding:5px 8px}.sy-compact-hint{display:block;padding:8px 10px 0}.calendar-side{gap:10px}.side-card{padding:14px}}
          @media (max-width:420px){.sy-days,.sy-dow{gap:2px}.sy-day{min-height:26px;border-radius:7px}.sy-month-title{font-size:13px;margin-bottom:6px}.sy-event-dot{width:3px;height:3px}.sy-day .sy-count{display:none}.service-year-grid{padding:8px}.sy-month-card{padding:8px}}
        
          /* Mobile modal scrolling fix */
          .modal{overflow:auto;-webkit-overflow-scrolling:touch;align-items:flex-start}
          .modal-card{max-height:calc(100dvh - 36px);overflow:auto}
          /* Mobile menu click-through reliability */
          .app.menu-open .sidebar{z-index:2000 !important}
          .app.menu-open .sidebar{left:0 !important;z-index:2500 !important;pointer-events:auto !important}
          .calendar-layout{grid-template-columns:minmax(0,1fr) minmax(320px,380px) !important;align-items:start}
          .calendar-side{display:block !important;position:sticky;top:var(--calendar-side-top, calc(var(--topbar-h, 88px) + 10px));align-self:start;max-height:calc(100dvh - var(--topbar-h, 88px) - 24px);overflow:auto;-webkit-overflow-scrolling:touch}
          .calendar-side .team-panel-card{display:none !important}
          .calendar-layout.team-hidden{grid-template-columns:minmax(0,1fr) minmax(320px,380px) !important}
          .calendar-layout.team-hidden .calendar-side{display:block !important}
          .day-cell{cursor:pointer}
          .day-cell.selected-day{outline:2px solid var(--accent);outline-offset:-2px;background:rgba(var(--accent-rgb,20,83,45),.10)}
          .day-cell.selected-day.weekend{background:rgba(var(--accent-rgb,20,83,45),.14)}
          @media (max-width:820px){.calendar-layout{grid-template-columns:1fr !important}.calendar-side{position:static;max-height:none;overflow:visible}.calendar-side .side-card:not(:first-child){margin-top:12px}}

          /* v9.5.2 layout cleanup */
          .legend,.sy-legend,.sy-compact-hint{display:none !important}
          .app{grid-template-columns:1fr !important}
          body::before{display:none !important}
          .main{padding:18px 22px 30px !important}
          .mobile-menu-btn{display:inline-flex !important}
          .sidebar{position:fixed !important;left:-300px !important;top:0 !important;bottom:0 !important;width:280px !important;z-index:2500 !important;transition:left .22s ease !important;box-shadow:0 20px 60px rgba(0,0,0,.24)}
          .app.menu-open .sidebar{left:0 !important}
          .calendar-layout{grid-template-columns:minmax(0,1fr) minmax(320px,360px) !important;gap:22px !important}
          .service-year-grid{grid-template-columns:repeat(3,minmax(190px,1fr)) !important;gap:18px !important}
 [data-font-size="80"]{--ui-font-scale:.80}
 [data-font-size="85"]{--ui-font-scale:.85}
 [data-font-size="90"]{--ui-font-scale:.90}
 [data-font-size="95"]{--ui-font-scale:.95}
 [data-font-size="100"]{--ui-font-scale:1}
 [data-font-size="105"]{--ui-font-scale:1.05}
 [data-font-size="110"]{--ui-font-scale:1.10}
 [data-font-size="115"]{--ui-font-scale:1.15}
 [data-font-size="120"]{--ui-font-scale:1.20}
 [data-font-size="125"]{--ui-font-scale:1.25}

          html{font-size:calc(16px * var(--ui-font-scale,1))}

          /* v9.5.2 responsive polish: fixes screenshot overlap and cleans calendar header */
          :root{--ui-font-scale:1;--sidebar-width:280px;--calendar-side-width:360px}
          html{font-size:calc(16px * var(--ui-font-scale,1))}
          body::before{display:none !important}
          .app{grid-template-columns:1fr !important}
          .main{padding:18px 22px 30px !important;width:100%;max-width:none !important}
          .topbar{display:grid !important;grid-template-columns:minmax(160px,1fr) auto !important;align-items:start !important;gap:12px !important;margin-bottom:10px !important;padding:8px 0 8px !important;position:sticky;top:0;z-index:1200;background:var(--bg)}
          .topbar h2{font-size:1.55rem !important;line-height:1.12 !important;margin-top:4px !important}
          .topbar p{display:none !important}
          .mobile-menu-btn{display:inline-flex !important;padding:10px 14px !important;border-radius:18px !important;white-space:nowrap !important}
          .sidebar{position:fixed !important;left:calc(-1 * var(--sidebar-width) - 20px) !important;top:0 !important;bottom:0 !important;width:var(--sidebar-width) !important;z-index:2500 !important;transition:left .22s ease !important;box-shadow:0 20px 60px rgba(0,0,0,.24);display:flex !important;pointer-events:auto !important}
          .app.menu-open .sidebar{left:0 !important}
          .calendar-toolbar{display:grid !important;grid-template-columns:minmax(220px,1fr) auto !important;align-items:center !important;gap:12px !important;padding:16px 18px 12px !important}
          .calendar-controls{justify-content:flex-end !important;gap:8px !important}
          .calendar-controls .chip,.calendar-controls select{min-height:42px}
          .calendar-title{font-size:1.35rem !important;line-height:1.15 !important}
          .calendar-sub{font-size:.82rem !important;margin-top:4px !important}
          .calendar-layout{grid-template-columns:minmax(0,1fr) minmax(310px,360px) !important;gap:18px !important;align-items:start}
          .calendar-side{min-width:0 !important;position:sticky !important;top:var(--calendar-side-top, calc(var(--topbar-h, 88px) + 10px)) !important;max-height:calc(100dvh - var(--topbar-h, 88px) - 20px) !important;overflow:auto !important;-webkit-overflow-scrolling:touch !important;display:block !important}
          .calendar-details-card{max-width:100% !important;display:block !important}
          .legend,.sy-legend,.sy-compact-hint{display:none !important}
          .calendar-side .team-panel-card{display:none !important}
          .service-year-grid{padding:18px !important;gap:18px !important;grid-template-columns:repeat(3,minmax(190px,1fr)) !important}
          .sy-month-card{padding:14px !important;border-radius:22px !important}
          .sy-day{min-height:34px !important;font-size:.78rem !important}
          .sy-dow span{font-size:.72rem !important}
          .sy-month-title{font-size:1.02rem !important}
          .day-cell{min-height:108px}
          /* Compact empty weeks: a week with no visit only needs to show day numbers, not a
             full-height empty row — this was the main source of wasted whitespace on wide screens. */
          .week-row.week-empty,.week-row.week-empty .week-days,.week-row.week-empty .week-num{min-height:34px !important}
          .week-row.week-empty .day-cell{min-height:34px !important;padding:4px 6px 4px 8px !important}
          .week-row.week-empty .day-month{display:none}
          :root[data-layout="compact"] .week-row.week-empty,:root[data-layout="compact"] .week-row.week-empty .week-days,:root[data-layout="compact"] .week-row.week-empty .week-num,:root[data-layout="compact"] .week-row.week-empty .day-cell{min-height:26px !important}
          :root[data-layout="spacious"] .week-row.week-empty,:root[data-layout="spacious"] .week-row.week-empty .week-days,:root[data-layout="spacious"] .week-row.week-empty .week-num,:root[data-layout="spacious"] .week-row.week-empty .day-cell{min-height:40px !important}
          /* Layout presets — placed here (not in the main stylesheet) because this whole block
             is injected after it and uses !important, so a preset rule here is the only way to
             reliably win. Higher specificity (the [data-layout] attribute selector) lets these
             override the unconditional !important rules above them for the same properties. */
          :root[data-layout="compact"] .sy-month-card{padding:8px !important}
          :root[data-layout="compact"] .sy-day{min-height:24px !important;font-size:.68rem !important}
          :root[data-layout="compact"] .sy-period-bar{font-size:8px !important;height:13px !important;line-height:13px !important;top:calc(16px + (var(--bar-lane) * 14px)) !important}
          :root[data-layout="compact"] .day-cell{min-height:72px !important;padding:6px 6px 6px 8px !important}
          :root[data-layout="compact"] .week-row,:root[data-layout="compact"] .week-days,:root[data-layout="compact"] .week-num{min-height:72px !important}
          :root[data-layout="compact"] .event-bar{font-size:11px !important;padding:2px 8px !important}
          :root[data-layout="spacious"] .sy-month-card{padding:20px !important}
          :root[data-layout="spacious"] .sy-day{min-height:44px !important;font-size:.88rem !important}
          :root[data-layout="spacious"] .sy-period-bar{height:19px !important;line-height:19px !important;font-size:10px !important;top:calc(28px + (var(--bar-lane) * 21px)) !important}
          :root[data-layout="spacious"] .day-cell{min-height:140px !important;padding:14px !important}
          :root[data-layout="spacious"] .week-row,:root[data-layout="spacious"] .week-days,:root[data-layout="spacious"] .week-num{min-height:140px !important}
          :root[data-layout="spacious"] .event-bar{font-size:14px !important;padding:5px 14px !important}
          @media (min-width:1600px){:root{--calendar-side-width:390px}.service-year-grid{grid-template-columns:repeat(4,minmax(190px,1fr)) !important}}
          @media (max-width:1180px){.calendar-layout{grid-template-columns:1fr !important;gap:14px !important}.calendar-side{position:static !important;top:auto !important;max-height:none !important;overflow:visible !important;width:100% !important;display:block !important}.calendar-details-card{width:100% !important;max-width:none !important;margin-top:0 !important}.calendar-toolbar{grid-template-columns:1fr !important;align-items:start !important}.calendar-controls{justify-content:flex-start !important}}
          @media (max-width:900px){.main{padding:14px 12px 86px !important}.calendar-shell{border-radius:22px !important}.calendar-toolbar{padding:14px !important}.calendar-controls{display:grid !important;grid-template-columns:1fr 1fr !important;width:100% !important;gap:8px !important}.calendar-nav{width:100%;justify-content:space-between}.calendar-controls select,.calendar-controls .chip{width:100% !important}#calendarServiceYearLabel{display:none !important}.calendar-sub{font-size:.8rem !important}.service-year-grid{grid-template-columns:repeat(2,minmax(150px,1fr)) !important;padding:12px !important;gap:12px !important}.sy-month-card{padding:10px !important}.sy-day{min-height:30px !important}.calendar-side{margin-top:12px !important}}
          @media (max-width:560px){.service-year-grid{grid-template-columns:1fr !important}.topbar{grid-template-columns:1fr !important}.actions{justify-content:flex-start}.bottom-nav-btn .label{font-size:.68rem}}
 [data-font-size="80"]{--ui-font-scale:.80}
 [data-font-size="85"]{--ui-font-scale:.85}
 [data-font-size="90"]{--ui-font-scale:.90}
 [data-font-size="95"]{--ui-font-scale:.95}
 [data-font-size="100"]{--ui-font-scale:1}
 [data-font-size="105"]{--ui-font-scale:1.05}
 [data-font-size="110"]{--ui-font-scale:1.10}
 [data-font-size="115"]{--ui-font-scale:1.15}
 [data-font-size="120"]{--ui-font-scale:1.20}
 [data-font-size="125"]{--ui-font-scale:1.25}



 #events .event-templates-title{display:none !important}
 /* v9.5.2 sent flags and calendar actions */
 .sent-flags{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
 .flag-toggle{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--surface2);border-radius:999px;padding:7px 10px;font-size:12px;color:var(--text);cursor:pointer;user-select:none}
 .flag-toggle input{width:auto;margin:0;accent-color:var(--accent)}
 .flag-badges{display:inline-flex;gap:5px;flex-wrap:wrap;margin-left:6px;vertical-align:middle}
 .flag-badge{display:inline-flex;align-items:center;border:1px solid var(--line);background:var(--surface2);border-radius:999px;padding:2px 6px;font-size:10px;font-weight:700;color:var(--text)}
 .calendar-action-grid{display:grid;gap:8px;margin-top:12px}.entry-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.entry-actions .btn{padding:8px 10px;border-radius:12px;font-size:12px;box-shadow:none}.side-item-card{padding:10px 12px;border-radius:14px;background:var(--surface2);border:1px solid var(--line)}
 
 /* v9.5.9-year-week-bars: day popover for service-year mini calendar */
 .day-popover{position:fixed;z-index:3200;min-width:260px;max-width:min(340px,calc(100vw - 24px));background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:18px;box-shadow:0 22px 55px rgba(0,0,0,.22);padding:14px;font-size:13px;line-height:1.35}
 .day-popover[hidden]{display:none !important}
 .day-popover-title{font-weight:800;font-size:14px;margin-bottom:3px}
 .day-popover-meta{color:var(--muted);font-size:12px;margin-bottom:10px}
 .day-popover-list{display:grid;gap:8px;margin-top:8px}
 .day-popover-event{display:grid;grid-template-columns:10px 1fr;gap:8px;align-items:start;padding:8px;border:1px solid var(--line);background:var(--surface2);border-radius:13px}
 .day-popover-dot{width:10px;height:10px;border-radius:999px;margin-top:4px;display:block}
 .day-popover-event strong{display:block;font-size:13px}
 .day-popover-event span{display:block;color:var(--muted);font-size:12px;margin-top:2px}
 .day-popover-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
 .day-popover-actions .btn{padding:8px 10px;border-radius:12px;font-size:12px;box-shadow:none}
 .sy-day.has-events:hover{outline:2px solid var(--accent);outline-offset:1px}
 
 /* v9.5.9-year-week-bars: stable popover + sending workflow */
 .calendar-details-card #calendarSideDetails .side-item-card:has(.entry-actions){display:none !important}

 .day-popover{pointer-events:auto !important}
 .day-popover.is-hovered{box-shadow:0 24px 60px rgba(0,0,0,.26) !important}
 .send-control{margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:16px;background:var(--surface2)}
 .send-control-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
 .send-control-title{font-weight:800;font-size:13px}
 .send-control-hint{color:var(--muted);font-size:11px;margin-top:2px}
 .send-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
 .send-card{display:grid;gap:6px;padding:10px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
 .send-card.is-pending{border-color:rgba(185,28,28,.45);background:rgba(185,28,28,.07)}
 .send-card.is-done{border-color:rgba(var(--accent-rgb),.35);background:rgba(var(--accent-rgb),.08)}
 .send-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700;font-size:12px}
 .send-status{font-size:11px;color:var(--muted)}
 .send-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;user-select:none}
 .send-toggle input{width:auto;margin:0;accent-color:var(--accent)}
 @media (max-width:680px){.send-control-grid{grid-template-columns:1fr}}
 
 @media (max-width:680px){.day-popover{left:12px !important;right:12px !important;top:auto !important;bottom:86px !important;max-width:none;width:auto}.day-popover-actions .btn{flex:1 1 auto}}
 

`;
        document.head.appendChild(style);
      },
      buildServiceYearMonths(serviceYear) {
        return Array.from({ length: 12 }, (_, index) => {
          const month = (App.config.serviceYearStartMonth + index) % 12;
          const year = serviceYear + Math.floor((App.config.serviceYearStartMonth + index) / 12);
          return { month, year };
        });
      },
     
getServiceYearDayInfo(dateIso) {
 const date = App.utils.parseLocalDate(dateIso);
 if (!date) return null;
 const sy = App.utils.getServiceYearForDate(date);
 const weekId = App.utils.weekIdForDate(date);
 const week = App.data.getWeek(sy, weekId);
 const weekEvent = App.data.getEventById(week.eventId);
 const weekStart = App.utils.parseLocalDate(week.start);
 const weekEnd = App.utils.parseLocalDate(week.end);
 const weekItem = week.eventId ? { id: `week:${weekId}`, source: 'week', refId: weekId, eventId: week.eventId, title: weekEvent?.name || App.utils.t('event'), color: weekEvent?.color || '#1f7a45', note: week.note || '', start: week.start, end: week.end, flags: { f302: !!week.flagS302, letter: !!week.flagLetter } } : null;
 const dayEntries = App.state.app.entries.filter((entry) => {
 const es = App.utils.parseLocalDate(entry.start); const ee = App.utils.parseLocalDate(entry.end);
 return es && ee && App.utils.overlaps(es, ee, date, date);
 }).map((entry) => {
 const event = App.data.getEventById(entry.eventId);
 return { id: `entry:${entry.id}`, entryId: entry.id, eventId: entry.eventId, event, title: entry.title || event?.name || App.utils.t('event'), color: event?.color || '#1f7a45', start: entry.start, end: entry.end, note: entry.note || '', schedule: event?.schedule || '', address: event?.address || '', flags: { f302: !!entry?.flags?.f302, letter: !!entry?.flags?.letter } };
 }).sort((a,b) => (a.start || '').localeCompare(b.start || ''));
 return { date, sy, weekId, week, weekEvent, weekItem, weekStart, weekEnd, dayEntries };
},
ensureDayPopover() {
 let popover = document.getElementById('dayPopover');
 if (!popover) { popover = document.createElement('div'); popover.id = 'dayPopover'; popover.className = 'day-popover'; popover.hidden = true; document.body.appendChild(popover); }
 return popover;
},
hideDayPopover(force = false) {
 const popover = document.getElementById('dayPopover'); if (!popover) return;
 if (!force && (App.state.dayPopoverPinned || popover.matches(':hover') || popover.dataset.keepOpen === '1')) return;
 popover.hidden = true; App.state.dayPopoverPinned = false;
},
showServiceYearDayPopover(anchor, dateIso, pinned = false) {
 const info = this.getServiceYearDayInfo(dateIso); if (!info || !anchor) return;
 App.state.dayPopoverPinned = !!pinned;
 const popover = this.ensureDayPopover();
 if (popover.dataset.fix3Bound !== '1') {
 popover.dataset.fix3Bound = '1';
 popover.addEventListener('mouseenter', () => { popover.dataset.keepOpen = '1'; popover.classList.add('is-hovered'); });
 popover.addEventListener('mouseleave', () => { delete popover.dataset.keepOpen; popover.classList.remove('is-hovered'); if (!App.state.dayPopoverPinned) window.setTimeout(() => App.ui.hideDayPopover(true), 180); });
 popover.addEventListener('click', (e) => e.stopPropagation());
 popover.addEventListener('mousedown', (e) => e.stopPropagation());
 }
 const rows = [];
 if (info.weekItem) rows.push({ kind: App.utils.t('week_planned'), title: info.weekItem.title, color: info.weekItem.color, range: `${App.utils.prettyDate(info.weekStart)} — ${App.utils.prettyDate(info.weekEnd)}`, note: info.week.note || App.utils.t('no_note'), schedule: info.weekEvent?.schedule || App.utils.t('no_schedule') });
 const popoverDayEntries = (info.dayEntries || []).filter((entry) => !(info.weekItem && entry.eventId === info.weekItem.eventId)); 
 popoverDayEntries.forEach((entry) => rows.push({ kind: App.utils.t('type_entry'), title: entry.title, color: entry.color, range: `${App.utils.prettyDate(entry.start)} — ${App.utils.prettyDate(entry.end)}`, note: entry.note || App.utils.t('no_note'), schedule: entry.schedule || App.utils.t('no_schedule') }));
 const listHtml = rows.length ? rows.map((row) => `<div class="day-popover-event"><i class="day-popover-dot" style="background:${App.utils.clampColor(row.color)}"></i><div><strong>${App.utils.escapeHtml(row.title)}</strong><span>${App.utils.escapeHtml(row.kind)} · ${App.utils.escapeHtml(row.range)}</span><span>${App.utils.escapeHtml(row.schedule)}</span>${row.note && row.note !== App.utils.t('no_note') ? `<span>${App.utils.escapeHtml(row.note)}</span>` : ''}</div></div>`).join('') : `<div class="md-empty" style="padding:12px">${App.utils.escapeHtml(App.utils.t('no_entries_day'))}</div>`;
 popover.innerHTML = `<div class="day-popover-title">${App.utils.escapeHtml(App.utils.prettyDateLong(info.date))}</div><div class="day-popover-meta">W${App.utils.weekNumber(info.date)} · ${App.utils.escapeHtml(App.utils.prettyDate(info.weekStart))} — ${App.utils.escapeHtml(App.utils.prettyDate(info.weekEnd))}</div><div class="day-popover-list">${listHtml}</div><div class="day-popover-actions"><button class="md-btn md-btn-filled md-state-layer" type="button" data-popover-details="${App.utils.escapeAttr(dateIso)}">${App.utils.t('open')}</button><button class="md-btn md-btn-outlined md-state-layer" type="button" data-popover-add="${App.utils.escapeAttr(dateIso)}">${App.utils.t('add_entry')}</button>${info.weekItem ? `<button class="md-btn md-btn-outlined md-state-layer" type="button" data-popover-edit-week="${App.utils.escapeAttr(info.weekItem.id)}">${App.utils.t('edit')}</button>` : ''}</div>`;
 const rect = anchor.getBoundingClientRect(); const margin = 12;
 let left = rect.left + rect.width / 2 - 150; let top = rect.bottom + 8;
 popover.hidden = false; const box = popover.getBoundingClientRect();
 left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));
 if (top + box.height + margin > window.innerHeight) top = Math.max(margin, rect.top - box.height - 8);
 popover.style.left = `${left}px`; popover.style.top = `${top}px`;
 popover.querySelector('[data-popover-details]')?.addEventListener('click', (e) => { e.stopPropagation(); App.state.calendarSelectedDateIso = dateIso; App.ui.renderServiceYearDayDetails(dateIso); App.ui.hideDayPopover(true); App.ui.scrollToDetailPanel(); });
 popover.querySelector('[data-popover-add]')?.addEventListener('click', (e) => { e.stopPropagation(); App.ui.hideDayPopover(true); App.actions.openCalendarEditorForCreate(dateIso); });
 popover.querySelector('[data-popover-edit-week]')?.addEventListener('click', (e) => { e.stopPropagation(); App.ui.hideDayPopover(true); App.actions.openCalendarEditorForItem(e.currentTarget.dataset.popoverEditWeek); });
},
  renderCalendarYear(serviceYear) {
        this.ensureCalendarViewStyles();
        this.renderYearOptions();
        this.renderLayoutOptions();
        const bounds = App.utils.serviceYearBounds(serviceYear);
        const yearItems = [];
        this.buildServiceYearMonths(serviceYear).forEach(({ month, year }) => {
          yearItems.push(...App.data.buildCalendarItemsForMonth(month, year));
        });
        const filteredYearItems = App.utils.uniqueBy(yearItems, (item) => [item.id,item.eventId,item.start.toISOString().slice(0,10),item.end.toISOString().slice(0,10)].join('|'));
        if (App.els.monthLabel) App.els.monthLabel.textContent = `${App.utils.t('service_year')} ${App.utils.serviceYearLabel(serviceYear)}`;
        if (App.els.calendarServiceYearLabel) App.els.calendarServiceYearLabel.textContent = `${App.utils.t('service_year')}: ${App.utils.serviceYearLabel(serviceYear)}`;
        if (App.els.calendarRangeLabel) App.els.calendarRangeLabel.textContent = `${App.utils.prettyDateLong(bounds.start)} — ${App.utils.prettyDateLong(bounds.end)}`;
        if (App.els.toggleTeamPanelBtn) App.els.toggleTeamPanelBtn.textContent = App.utils.t('calendar_view_month');
        if (App.els.calendarYearSelect) {
          App.els.calendarYearSelect.innerHTML = Array.from({ length: 9 }, (_, i) => serviceYear - 4 + i).map((y) => `<option value="${y}">${App.utils.serviceYearLabel(y)}</option>`).join('');
          App.els.calendarYearSelect.value = String(serviceYear);
        }
        const dayNames = App.utils.dayNames();
        const todayIso = App.utils.iso(new Date());
        const todayDate = App.utils.parseLocalDate(todayIso);
        const selectedDate = App.utils.parseLocalDate(App.state.calendarSelectedDateIso);
        const selectedInServiceYear = selectedDate && selectedDate >= bounds.start && selectedDate <= bounds.end;
        const fallbackSelectedIso = (todayDate && todayDate >= bounds.start && todayDate <= bounds.end) ? todayIso : App.utils.iso(bounds.start);
        if (!selectedInServiceYear) App.state.calendarSelectedDateIso = fallbackSelectedIso;
        const html = this.buildServiceYearMonths(serviceYear).map(({ month, year }) => {
          const monthStart = new Date(year, month, 1);
          const monthEnd = new Date(year, month + 1, 0);
          const items = App.data.buildCalendarItemsForMonth(month, year);
          const rows = [];
          let weekStart = App.utils.startOfWeek(monthStart);
          const lastWeekStart = App.utils.startOfWeek(monthEnd);
          while (weekStart <= lastWeekStart) {
            const weekEnd = App.utils.addDays(weekStart, 6);
            const dayCells = [];
            for (let i = 0; i < 7; i += 1) {
              const date = App.utils.addDays(weekStart, i);
              const iso = App.utils.iso(date);
              if (date.getMonth() !== month) {
                dayCells.push(`<button class="sy-day sy-outside" type="button" data-add-date="${App.utils.escapeAttr(iso)}" title="${App.utils.escapeAttr(App.utils.t('add_on_date'))}"><span>${date.getDate()}</span></button>`);
              } else {
                const dayItems = items.filter((item) => App.utils.overlaps(item.start, item.end, date, date));
                const hol = App.utils.getHolidayNames(iso);
                const title = [dayItems.length ? dayItems.map((item) => item.title).join(' · ') : '', hol ? hol.join(', ') : ''].filter(Boolean).join(' · ') || App.utils.t('add_on_date');
                dayCells.push(`<button class="sy-day ${iso === todayIso ? 'today' : ''} ${(date.getDay() === 0 || date.getDay() === 6) ? 'weekend' : ''} ${dayItems.length ? 'has-events' : ''} ${hol ? 'holiday' : ''} ${App.state.calendarSelectedDateIso === iso ? 'selected' : ''}" type="button" data-add-date="${App.utils.escapeAttr(iso)}" title="${App.utils.escapeAttr(title)}"><span>${date.getDate()}</span></button>`);
              }
            }
            const overlapping = items.filter((item) => {
              const segmentStart = new Date(Math.max(item.start.getTime(), monthStart.getTime(), weekStart.getTime()));
              const segmentEnd = new Date(Math.min(item.end.getTime(), monthEnd.getTime(), weekEnd.getTime()));
              return segmentStart <= segmentEnd;
            }).map((item) => {
              const segmentStart = new Date(Math.max(item.start.getTime(), monthStart.getTime(), weekStart.getTime()));
              const segmentEnd = new Date(Math.min(item.end.getTime(), monthEnd.getTime(), weekEnd.getTime()));
              const left = Math.max(0, App.utils.daysDiff(segmentStart, weekStart));
              const right = Math.min(6, App.utils.daysDiff(segmentEnd, weekStart));
              return { item, segmentStart, left, right };
            }).sort((a, b) => a.left - b.left || b.right - a.right || String(a.item.title).localeCompare(String(b.item.title)));
            // Assign lanes by day-overlap so same-week, non-overlapping-day items (e.g. Sat + Sun) share a row.
            const lanesInUse = [];
            overlapping.forEach((bar) => {
              let lane = 0;
              while ((lanesInUse[lane] || []).some((other) => bar.left <= other.right && other.left <= bar.right)) lane += 1;
              bar.lane = lane;
              (lanesInUse[lane] = lanesInUse[lane] || []).push(bar);
            });
            const visibleBars = overlapping.filter((bar) => bar.lane < 3);
            const bars = visibleBars.map(({ item, left, right, lane }) => {
              const span = Math.max(1, right - left + 1);
              const color = App.utils.clampColor(item.color);
              const label = App.utils.escapeHtml(item.title || App.utils.t('event'));
              return `<button class="sy-period-bar" type="button" draggable="${item.id.startsWith('entry:') ? 'true' : 'false'}" data-drag-entry="${item.id.startsWith('entry:') ? App.utils.escapeAttr(item.id) : ''}" data-detail-calendar-item="${App.utils.escapeAttr(item.id)}" data-add-date="${App.utils.escapeAttr(App.utils.iso(App.utils.addDays(weekStart, left)))}" style="--bar-left:${left};--bar-span:${span};--bar-lane:${lane};--bar-color:${color};" title="${App.utils.escapeAttr(item.title)}"><span>${label}</span></button>`;
            }).join('');
            const more = overlapping.length > visibleBars.length ? `<button class="sy-bar-more" type="button" data-add-date="${App.utils.escapeAttr(App.utils.iso(weekStart))}">+${overlapping.length - visibleBars.length}</button>` : '';
            rows.push(`<div class="sy-week-row">${dayCells.join('')}${bars}${more}</div>`);
            weekStart = App.utils.addDays(weekStart, 7);
          }
          return `<section class="sy-month-card"><div class="sy-month-title"><span>${App.utils.monthName(month)}</span><small>${year}</small></div><div class="sy-dow">${dayNames.map((name) => `<span>${name}</span>`).join('')}</div><div class="sy-weeks">${rows.join('')}</div></section>`;
        }).join('');
        const legendHtml = '';
        if (App.els.calendarGrid) App.els.calendarGrid.innerHTML = `${legendHtml}<div class="service-year-grid">${html}</div>`;

        const quickItems = filteredYearItems.sort((a,b) => a.start - b.start || a.end - b.end);
        const selectedIso = App.state.calendarSelectedDateIso || fallbackSelectedIso;
        const selectedDateForDetail = App.utils.parseLocalDate(selectedIso);
        const activeItem = selectedDateForDetail ? quickItems.find((item) => App.utils.overlaps(item.start, item.end, selectedDateForDetail, selectedDateForDetail)) : null;
        App.state.calendarDetailId = activeItem?.id || App.state.calendarDetailId || null;
        this.renderServiceYearDayDetails(selectedIso);
document.querySelectorAll('.sy-day[data-add-date]').forEach((btn) => {
 btn.addEventListener('click', (e) => {
 e.stopPropagation();
 const dateIso = btn.dataset.addDate;
 App.state.calendarSelectedDateIso = dateIso;
 App.ui.renderCalendar();
 const fresh = Array.from(document.querySelectorAll('.sy-day[data-add-date]')).find((node) => node.dataset.addDate === dateIso) || btn;
 App.ui.showServiceYearDayPopover(fresh, dateIso, true);
 });
 btn.addEventListener('mouseenter', () => {
 if (!window.matchMedia('(hover:hover)').matches || !btn.classList.contains('has-events')) return;
 App.ui.showServiceYearDayPopover(btn, btn.dataset.addDate, false);
 });
 btn.addEventListener('mouseleave', () => {
 if (!window.matchMedia('(hover:hover)').matches) return;
 window.setTimeout(() => App.ui.hideDayPopover(false), 260);
 });
});
        document.querySelectorAll('.sy-bar-more[data-add-date]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); App.state.calendarSelectedDateIso = btn.dataset.addDate; App.ui.renderServiceYearDayDetails(btn.dataset.addDate); }));
        document.querySelectorAll('[data-detail-calendar-item]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); const item = quickItems.find((entry) => entry.id === btn.dataset.detailCalendarItem); App.state.calendarDetailId = item?.id || null; App.ui.renderCalendarDetails(item || null); App.ui.scrollToDetailPanel(); }));
        // Drag-and-drop: move a visit entry to another day (shifts start+end by the same offset),
        // mirroring the same behaviour already available in month view.
        document.querySelectorAll('.sy-period-bar[data-drag-entry]').forEach((bar) => {
          if (!bar.dataset.dragEntry) return;
          bar.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', bar.dataset.dragEntry); e.dataTransfer.effectAllowed = 'move'; });
        });
        document.querySelectorAll('.sy-day[data-add-date]').forEach((cell) => {
          cell.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; cell.classList.add('drag-over'); });
          cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
          cell.addEventListener('drop', (e) => {
            e.preventDefault(); cell.classList.remove('drag-over');
            const itemId = e.dataTransfer.getData('text/plain');
            if (!itemId || !itemId.startsWith('entry:')) return;
            App.actions.moveEntryToDate(itemId.slice(6), cell.dataset.addDate);
          });
        });
      },
      buildOneMonthGridHtml(month, year, showMonthTitle) {
        const weeks = this.buildMonthGrid(month, year);
        const items = App.data.buildCalendarItemsForMonth(month, year);
        const itemsByWeek = new Map(); weeks.forEach((week) => itemsByWeek.set(week.id, []));
        items.forEach((item) => { weeks.forEach((week) => { const weekStart = week.days[0].date; const weekEnd = week.days[6].date; if (App.utils.overlaps(item.start, item.end, weekStart, weekEnd)) { const leftIndex = Math.max(0, App.utils.daysDiff(item.start, weekStart)); const rightIndex = Math.min(6, App.utils.daysDiff(item.end, weekStart)); itemsByWeek.get(week.id).push({ ...item, leftIndex, rightIndex, span: rightIndex - leftIndex + 1 }); } }); });
        // Assign each bar to the lowest lane free of day-overlap, so events on different
        // days of the same week share one row instead of stacking in a staircase.
        itemsByWeek.forEach((weekItems) => {
          const lanes = [];
          weekItems.sort((a, b) => a.leftIndex - b.leftIndex || b.span - a.span);
          weekItems.forEach((bar) => {
            let lane = 0;
            while ((lanes[lane] || []).some((other) => bar.leftIndex <= other.rightIndex && other.leftIndex <= bar.rightIndex)) lane += 1;
            bar.lane = lane;
            (lanes[lane] = lanes[lane] || []).push(bar);
          });
        });
        const titleHtml = showMonthTitle ? `<div class="month-grid-title">${App.utils.monthName(month)} ${year}</div>` : '';
        const html = `${titleHtml}<div class="grid-cal"><div class="dow-row"><div class="dow-corner"></div><div class="dow-days">${App.utils.dayNames().map((name) => `<div class="dow">${name}</div>`).join('')}</div></div>${weeks.map((week) => { const bars = (itemsByWeek.get(week.id) || []).slice(0, 4); const extraCount = Math.max(0, (itemsByWeek.get(week.id) || []).length - 4); const isEmpty = bars.length === 0; return `<div class="week-row ${isEmpty ? 'week-empty' : ''}"><span class="week-num">W${week.number}</span><div class="week-days">${week.days.map((day) => { const hol = App.utils.getHolidayNames(day.iso); return `<div class="day-cell ${day.inMonth ? '' : 'inactive'} ${day.isWeekend ? 'weekend' : ''} ${day.isToday ? 'today today-col' : ''} ${App.state.calendarSelectedDateIso === day.iso ? 'selected-day' : ''} ${hol ? 'holiday' : ''}" data-day="${App.utils.escapeAttr(day.iso)}" role="button" tabindex="0" ${hol ? `title="${App.utils.escapeAttr(hol.join(', '))}"` : ''}><div><span class="day-num">${day.day}</span>${day.day === 1 ? `<span class="day-month">${App.utils.monthName(day.month).slice(0, 3)}</span>` : ''}${hol ? '<span class="holiday-mark" aria-hidden="true">🎌</span>' : ''}</div><button class="day-add-btn" data-add-date="${App.utils.escapeAttr(day.iso)}" type="button" title="${App.utils.t('add_on_date')}" aria-label="${App.utils.escapeAttr(App.utils.t('add_on_date'))}">+</button></div>`; }).join('')}${bars.map((bar) => `<button class="event-bar" draggable="${bar.id.startsWith('entry:') ? 'true' : 'false'}" data-drag-entry="${bar.id.startsWith('entry:') ? App.utils.escapeAttr(bar.id) : ''}" data-detail-calendar-item="${App.utils.escapeAttr(bar.id)}" type="button" style="left:calc(${(bar.leftIndex / 7) * 100}% + 6px);width:calc(${(bar.span / 7) * 100}% - 12px);top:${34 + (bar.lane || 0) * 20}px;background:${App.utils.clampColor(bar.color)};">${App.utils.escapeHtml(bar.title)}</button>`).join('')}${extraCount ? `<div class="small" style="position:absolute;left:12px;bottom:6px">+ ${extraCount}</div>` : ''}</div></div>`; }).join('')}</div>`;
        return { html, items };
      },
      renderCalendar() {
        const viewMonthStart = new Date(App.state.calendarYear, App.state.calendarMonth, 1);
        const serviceYearForView = App.utils.getServiceYearForDate(viewMonthStart);
        if (App.state.calendarView === 'year') { this.renderCalendarYear(serviceYearForView); return; }
        this.renderYearOptions(); this.renderLayoutOptions(); const year = App.state.calendarYear; const month = App.state.calendarMonth; if (App.els.monthLabel) App.els.monthLabel.textContent = `${App.utils.monthName(month)} ${year}`; const monthStart = new Date(year, month, 1); const monthEnd = new Date(year, month + 1, 0); const serviceYear = App.utils.getServiceYearForDate(monthStart); if (App.els.calendarServiceYearLabel) App.els.calendarServiceYearLabel.textContent = `${App.utils.t('service_year')}: ${App.utils.serviceYearLabel(serviceYear)}`; if (App.els.calendarRangeLabel) App.els.calendarRangeLabel.textContent = `${App.utils.prettyDateLong(monthStart)} — ${App.utils.prettyDateLong(monthEnd)}`; if (App.els.toggleTeamPanelBtn) App.els.toggleTeamPanelBtn.textContent = App.utils.t('calendar_view_year');
        // On very wide screens there's enough spare width to show the next month alongside
        // the current one, instead of just stretching one month's cells wastefully wide.
        const showSecondMonth = window.innerWidth >= (App.config.twoMonthBreakpoint || 1700);
        const monthsToRender = [{ month, year }];
        if (showSecondMonth) { const next = new Date(year, month + 1, 1); monthsToRender.push({ month: next.getMonth(), year: next.getFullYear() }); }
        let items = [];
        const monthHtmls = monthsToRender.map(({ month: m, year: y }) => { const built = this.buildOneMonthGridHtml(m, y, showSecondMonth); items = items.concat(built.items); return built.html; });
        if (App.els.calendarGrid) App.els.calendarGrid.innerHTML = showSecondMonth ? `<div class="month-grid-multi">${monthHtmls.map((h) => `<div class="month-grid-col">${h}</div>`).join('')}</div>` : monthHtmls[0];
        if (App.els.calendarYearSelect) { App.els.calendarYearSelect.innerHTML = Array.from({ length: 9 }, (_, i) => year - 4 + i).map((y) => `<option value="${y}">${y}</option>`).join(''); App.els.calendarYearSelect.value = String(year); }
        const detail = items.find((item) => item.id === App.state.calendarDetailId) || items[0] || null; this.renderCalendarDetails(detail); if (App.state.calendarSelectedDateIso) this.renderServiceYearDayDetails(App.state.calendarSelectedDateIso);
        document.querySelectorAll('[data-detail-calendar-item]').forEach((btn) => btn.addEventListener('click', () => { const item = items.find((entry) => entry.id === btn.dataset.detailCalendarItem); App.state.calendarDetailId = item?.id || null; App.ui.renderCalendarDetails(item || null); App.ui.scrollToDetailPanel(); }));
        document.querySelectorAll('.day-cell[data-day]').forEach((cell) => cell.addEventListener('click', () => { App.state.calendarSelectedDateIso = cell.dataset.day; App.ui.renderCalendar(); App.ui.renderServiceYearDayDetails(cell.dataset.day); }));
        document.querySelectorAll('.day-cell[data-day]').forEach((cell) => cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App.state.calendarSelectedDateIso = cell.dataset.day; App.ui.renderCalendar(); App.ui.renderServiceYearDayDetails(cell.dataset.day); } }));
        document.querySelectorAll('[data-add-date]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); App.actions.openCalendarEditorForCreate(btn.dataset.addDate); }));
        document.querySelectorAll('[data-edit-calendar-item]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); App.actions.openCalendarEditorForItem(btn.dataset.editCalendarItem); }));
        // Drag-and-drop: move a visit entry to another day (shifts start+end by the same offset).
        document.querySelectorAll('[data-drag-entry]').forEach((bar) => {
          if (!bar.dataset.dragEntry) return;
          bar.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', bar.dataset.dragEntry); e.dataTransfer.effectAllowed = 'move'; });
        });
        document.querySelectorAll('.day-cell[data-day]').forEach((cell) => {
          cell.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; cell.classList.add('drag-over'); });
          cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
          cell.addEventListener('drop', (e) => {
            e.preventDefault(); cell.classList.remove('drag-over');
            const itemId = e.dataTransfer.getData('text/plain');
            if (!itemId || !itemId.startsWith('entry:')) return;
            App.actions.moveEntryToDate(itemId.slice(6), cell.dataset.day);
          });
        });
      },
      flagBadgesHtml(flags = {}) {
        const out = [];
        if (flags.f302) out.push(`<span class="flag-badge">S302</span>`);
        if (flags.letter) out.push(`<span class="flag-badge">✉</span>`);
        return out.length ? `<span class="flag-badges">${out.join('')}</span>` : '';
      },
      flagTogglesHtml(scope, id, flags = {}) {
        const s302Done = !!flags.f302;
        const letterDone = !!flags.letter;
        const status = (done) => done ? App.utils.t('sent_done') : App.utils.t('needs_sending');
        const card = (flag, label, done) => `
          <div class="send-card ${done ? 'is-done' : 'is-pending'}">
            <div class="send-card-top"><span>${label}</span><span class="send-status">${status(done)}</span></div>
            <label class="send-toggle"><input type="checkbox" data-${scope}-flag="${flag}" data-${scope}-id="${App.utils.escapeAttr(id)}" ${done ? 'checked' : ''}> ${App.utils.t('sent_done')}</label>
          </div>`;
        return `
          <div class="send-control" aria-label="${App.utils.escapeAttr(App.utils.t('sent_status'))}">
            <div class="send-control-head"><div><div class="send-control-title">${App.utils.t('send_control')}</div><div class="send-control-hint">${App.utils.t('before_visit_hint')}</div></div></div>
            <div class="send-control-grid">${card('letter', App.utils.t('letter_short'), letterDone)}${card('s302', App.utils.t('s302_short'), s302Done)}</div>
          </div>`;
      },
      renderCalendarDetails(item) {
        if (!App.els.calendarSideTitle || !App.els.calendarSideMeta || !App.els.calendarSideDetails) return; if (!item) { App.els.calendarSideTitle.textContent = App.utils.t('event_details'); App.els.calendarSideMeta.textContent = '—'; if (App.els.calendarSideCountdownRow) App.els.calendarSideCountdownRow.hidden = true; App.els.calendarSideDetails.innerHTML = `<div class="md-empty">${App.utils.t('no_events_month')}</div>`; return; }
        const itemData = App.data.getCalendarItemById(item.id) || item; const event = App.data.getEventById(itemData.eventId); App.els.calendarSideTitle.textContent = itemData.title; App.els.calendarSideMeta.textContent = `${App.utils.prettyDateLong(itemData.start)} — ${App.utils.prettyDateLong(itemData.end)}`;
        if (App.els.calendarSideCountdownRow) App.els.calendarSideCountdownRow.hidden = false;
        if (App.els.calendarSideCountdown) App.els.calendarSideCountdown.textContent = App.utils.countdownText(itemData.start, App.state.countdownUnit || 'days');
        if (App.els.countdownUnitSelect) App.els.countdownUnitSelect.value = App.state.countdownUnit || 'days';
        const addressHtml = event?.address ? `<a href="${App.utils.mapUrl(event.address)}" target="_blank" rel="noopener noreferrer">${App.utils.escapeHtml(event.address)}</a>` : App.utils.escapeHtml(App.utils.t('no_address'));
        const visitTypeRow = event?.visitType ? `<div class="side-row"><div class="side-label">${App.utils.t('visit_type')}</div><div class="side-value">${App.utils.escapeHtml(App.utils.visitTypeLabel(event.visitType))} ${this.flagBadgesHtml(itemData.flags)}</div></div>` : '';
        const sendControls = event?.visitType ? this.flagTogglesHtml(itemData.source, itemData.refId, itemData.flags) : '';
        // Last visit's results for this event (from past entries), shown for context.
        const today0 = new Date(); today0.setHours(0,0,0,0);
        const pastResult = event ? (App.state.app.entries || [])
          .filter((en) => en.eventId === event.id && en.resultNote && App.utils.parseLocalDate(en.end) < today0 && `entry:${en.id}` !== itemData.id)
          .sort((a, b) => String(b.end).localeCompare(String(a.end)))[0] : null;
        const resultRow = itemData.resultNote ? `<div class="side-row"><div class="side-label">${App.utils.t('result_note_short')}</div><div class="side-value">${App.utils.escapeHtml(itemData.resultNote)}</div></div>` : '';
        const pastResultRow = pastResult ? `<div class="side-row"><div class="side-label">${App.utils.t('last_visit_result')} (${App.utils.prettyDate(pastResult.end)})</div><div class="side-value">${App.utils.escapeHtml(pastResult.resultNote)}</div></div>` : '';
        const hasContact = event && (event.contactName || event.contactPhone || event.contactEmail || event.contactNote);
        const contactBlock = hasContact ? `<div class="send-control" style="margin-top:10px"><div class="send-control-title" style="margin-bottom:8px">${App.utils.t('contact_info')}</div>${event.contactName ? `<div class="side-row"><div class="side-label">${App.utils.t('contact_name')}</div><div class="side-value">${App.utils.escapeHtml(event.contactName)}</div></div>` : ''}${event.contactPhone ? `<div class="side-row"><div class="side-label">${App.utils.t('contact_phone')}</div><div class="side-value" style="display:flex;align-items:center;gap:6px"><a href="tel:${App.utils.escapeAttr(event.contactPhone.replace(/[^+\d]/g, ''))}">${App.utils.escapeHtml(event.contactPhone)}</a><button class="icon-btn copy-btn" type="button" data-copy-text="${App.utils.escapeAttr(event.contactPhone)}" title="${App.utils.escapeAttr(App.utils.t('copy'))}" aria-label="${App.utils.escapeAttr(App.utils.t('copy'))}">📋</button></div></div>` : ''}${event.contactEmail ? `<div class="side-row"><div class="side-label">${App.utils.t('contact_email')}</div><div class="side-value" style="display:flex;align-items:center;gap:6px"><a href="mailto:${App.utils.escapeAttr(event.contactEmail)}">${App.utils.escapeHtml(event.contactEmail)}</a><button class="icon-btn copy-btn" type="button" data-copy-text="${App.utils.escapeAttr(event.contactEmail)}" title="${App.utils.escapeAttr(App.utils.t('copy'))}" aria-label="${App.utils.escapeAttr(App.utils.t('copy'))}">📋</button></div></div>` : ''}${event.contactNote ? `<div class="side-row"><div class="side-label">${App.utils.t('contact_note')}</div><div class="side-value">${App.utils.escapeHtml(event.contactNote)}</div></div>` : ''}</div>` : '';
        App.els.calendarSideDetails.innerHTML = `<div class="side-row"><div class="side-label">${App.utils.t('type')}</div><div class="side-value">${itemData.source === 'week' ? App.utils.t('type_week') : App.utils.t('type_entry')}</div></div><div class="side-row"><div class="side-label">${App.utils.t('template')}</div><div class="side-value">${App.utils.escapeHtml(event?.name || App.utils.t('no_template'))}</div></div>${visitTypeRow}<div class="side-row"><div class="side-label">${App.utils.t('address')}</div><div class="side-value">${addressHtml}</div></div><div class="side-row"><div class="side-label">${App.utils.t('schedule')}</div><div class="side-value">${App.utils.escapeHtml(event?.schedule || App.utils.t('no_schedule'))}</div></div><div class="side-row"><div class="side-label">${App.utils.t('note')}</div><div class="side-value">${App.utils.escapeHtml(itemData.note || App.utils.t('no_note'))}</div></div>${resultRow}${pastResultRow}${sendControls}${contactBlock}<div style="display:grid;gap:8px;margin-top:12px"><button class="md-btn md-btn-filled md-state-layer" type="button" id="detailEditBtn">${App.utils.t('edit')}</button><details class="more-actions"><summary>⋯ ${App.utils.t('more_actions')}</summary><div class="actions-grid">${itemData.source === 'entry' && event?.visitType ? `<button class="md-btn md-btn-outlined md-state-layer" type="button" id="detailVisitFormBtn">${App.utils.t('visit_form_btn')}</button><button class="md-btn md-btn-outlined md-state-layer" type="button" id="detailLetterBtn">✉ ${App.utils.t('compose_letter')}</button><span class="menu-wrap" style="position:relative;display:block"><button class="md-btn md-btn-tonal md-state-layer" type="button" id="detailCreateDocBtn" aria-haspopup="menu" aria-expanded="false" style="width:100%">🗂 ${App.utils.t('docs_create')}</button><div class="cp-docmenu" id="detailDocMenu" role="menu" hidden></div></span><button class="md-btn md-btn-outlined md-state-layer" type="button" id="detailDocsBtn">🗂 ${App.utils.t('docs_title_short')}</button><button class="md-btn md-btn-outlined md-state-layer" type="button" id="detailS302Btn">${App.utils.t('make_s302')}</button>` : ''}<button class="md-btn md-btn-outlined md-state-layer" type="button" id="detailShareBtn">📤 ${App.utils.t('share')}</button><a class="md-btn md-btn-outlined md-state-layer" href="${App.utils.googleCalendarUrl(itemData, event)}" target="_blank" rel="noopener noreferrer">${App.utils.t('google_calendar')}</a><button class="md-btn md-btn-outlined md-state-layer" type="button" id="detailIcsBtn">${App.utils.t('apple_calendar')}</button>${event?.address ? `<a class="md-btn md-btn-outlined md-state-layer" href="${App.utils.mapUrl(event.address)}" target="_blank" rel="noopener noreferrer">${App.utils.t('google_maps')}</a>` : ''}</div></details></div>`;
        const editBtn = document.getElementById('detailEditBtn'); if (editBtn) editBtn.addEventListener('click', () => App.actions.openCalendarEditorForItem(itemData.id));
        const icsBtn = document.getElementById('detailIcsBtn'); if (icsBtn) icsBtn.addEventListener('click', () => App.actions.exportSingleEventIcs(itemData.id));
        document.getElementById('detailShareBtn')?.addEventListener('click', () => App.ui.shareWeekText(itemData, event));
        document.getElementById('detailVisitFormBtn')?.addEventListener('click', () => App.ui.openVisitForm(itemData.id));
        document.getElementById('detailLetterBtn')?.addEventListener('click', () => App.ui.openLetterModal(itemData.id));
        document.getElementById('detailDocsBtn')?.addEventListener('click', () => App.ui.openVisitDocsModal(itemData.id));
        document.getElementById('detailCreateDocBtn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          App.ui.toggleDocMenu(itemData.id, e.currentTarget);
        });
        document.getElementById('detailS302Btn')?.addEventListener('click', () => App.ui.sendS302(itemData.refId));
        document.querySelectorAll('.copy-btn[data-copy-text]').forEach((btn) => btn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const text = btn.dataset.copyText;
          const done = () => App.utils.toast(App.utils.t('copied'));
          if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => done());
          else done();
        }));
        document.querySelectorAll('[data-entry-flag]').forEach((input) => input.addEventListener('change', (e) => {
          const entry = App.state.app.entries.find((it) => it.id === e.target.dataset.entryId);
          if (entry) { if (!entry.flags) entry.flags = { f302: false, letter: false }; if (e.target.dataset.entryFlag === 's302') entry.flags.f302 = e.target.checked; if (e.target.dataset.entryFlag === 'letter') entry.flags.letter = e.target.checked; App.store.save(); }
          App.ui.renderCalendarDetails(item);
        }));
        document.querySelectorAll('[data-week-flag]').forEach((input) => input.addEventListener('change', (e) => {
          let week = null; Object.values(App.state.app.serviceYears).forEach((sy) => { if (sy.weeks && sy.weeks[e.target.dataset.weekId]) week = sy.weeks[e.target.dataset.weekId]; });
          if (week) { if (e.target.dataset.weekFlag === 's302') week.flagS302 = e.target.checked; if (e.target.dataset.weekFlag === 'letter') week.flagLetter = e.target.checked; App.store.save(); }
          App.ui.renderCalendarDetails(item);
        }));
      },
      renderServiceYearDayDetails(dateIso) {
        if (!App.els.calendarSideTitle || !App.els.calendarSideMeta || !App.els.calendarSideDetails) return;
        const date = App.utils.parseLocalDate(dateIso);
        if (!date) return;
        if (App.els.calendarSideCountdownRow) App.els.calendarSideCountdownRow.hidden = false;
        if (App.els.calendarSideCountdown) App.els.calendarSideCountdown.textContent = App.utils.countdownText(dateIso, App.state.countdownUnit || 'days');
        if (App.els.countdownUnitSelect) App.els.countdownUnitSelect.value = App.state.countdownUnit || 'days';
        const sy = App.utils.getServiceYearForDate(date);
        const weekId = App.utils.weekIdForDate(date);
        const week = App.data.getWeek(sy, weekId);
        const weekStart = App.utils.parseLocalDate(week.start);
        const weekEnd = App.utils.parseLocalDate(week.end);
        const flagBadges = (flags = {}) => this.flagBadgesHtml(flags);
        const flagToggles = (scope, id, flags = {}) => this.flagTogglesHtml(scope, id, flags);
        const dayEntries = App.state.app.entries
          .filter((entry) => {
            const es = App.utils.parseLocalDate(entry.start);
            const ee = App.utils.parseLocalDate(entry.end);
            return es && ee && App.utils.overlaps(es, ee, date, date);
          })
          .map((entry) => {
            const event = App.data.getEventById(entry.eventId);
            return {
              id: `entry:${entry.id}`,
              entryId: entry.id,
              eventId: entry.eventId,
              event,
              title: entry.title || event?.name || App.utils.t('event'),
              color: event?.color || '#1f7a45',
              start: entry.start,
              end: entry.end,
              note: entry.note || '',
              flags: { f302: !!entry?.flags?.f302, letter: !!entry?.flags?.letter }
            };
          })
          .sort((a,b) => (a.start || '').localeCompare(b.start || ''));
        App.els.calendarSideTitle.textContent = App.utils.t('day_details_title');
        App.els.calendarSideMeta.textContent = `${App.utils.prettyDateLong(date)} · W${App.utils.weekNumber(date)} · ${App.utils.prettyDate(weekStart)} — ${App.utils.prettyDate(weekEnd)}`;
        const entriesBlock = `
          <div class="side-row"><div class="side-label">${App.utils.t('entries_on_day')}</div><div class="side-value">${dayEntries.length ? '' : App.utils.escapeHtml(App.utils.t('no_entries_day'))}</div></div>
          ${dayEntries.map((it) => {
            const itemData = { id: it.id, source: 'entry', refId: it.entryId, eventId: it.eventId, title: it.title, note: it.note, start: it.start, end: it.end, flags: it.flags };
            return `<div class="side-item-card">
              <strong>${App.utils.escapeHtml(it.title)} ${flagBadges(it.flags)}</strong>
              <div class="small">${it.start} — ${it.end}</div>
              <div class="small">${App.utils.escapeHtml(it.note || App.utils.t('no_note'))}</div>
              ${it.event?.address ? `<div class="small" style="margin-top:4px"><a href="${App.utils.mapUrl(it.event.address)}" target="_blank" rel="noopener noreferrer">${App.utils.escapeHtml(it.event.address)}</a></div>` : ''}
              ${flagToggles('entry', it.entryId, it.flags)}
              <div class="entry-actions">
                <button class="md-btn md-btn-outlined md-state-layer" type="button" data-edit-calendar-item="${App.utils.escapeAttr(it.id)}">${App.utils.t('edit')}</button>
                <a class="md-btn md-btn-outlined md-state-layer" href="${App.utils.googleCalendarUrl(itemData, it.event)}" target="_blank" rel="noopener noreferrer">${App.utils.t('google_calendar')}</a>
                <button class="md-btn md-btn-outlined md-state-layer" type="button" data-ics-id="${App.utils.escapeAttr(it.id)}">${App.utils.t('apple_calendar')}</button>
                ${it.event?.address ? `<a class="md-btn md-btn-outlined md-state-layer" href="${App.utils.mapUrl(it.event.address)}" target="_blank" rel="noopener noreferrer">${App.utils.t('google_maps')}</a>` : ''}
              </div>
            </div>`;
          }).join('')}
          <div class="calendar-action-grid" style="margin-top:10px"><button class="md-btn md-btn-outlined md-state-layer" type="button" id="syAddEntryBtn">${App.utils.t('add_entry')}</button></div>`;
        App.els.calendarSideDetails.innerHTML = entriesBlock;
        document.getElementById('syAddEntryBtn')?.addEventListener('click', () => App.actions.openCalendarEditorForCreate(dateIso));
        document.querySelectorAll('[data-edit-calendar-item]').forEach((btn) => btn.addEventListener('click', (e) => {
          e.stopPropagation();
          App.actions.openCalendarEditorForItem(btn.dataset.editCalendarItem);
        }));
        document.querySelectorAll('[data-ics-id]').forEach((btn) => btn.addEventListener('click', () => App.actions.exportSingleEventIcs(btn.dataset.icsId)));
        document.querySelectorAll('[data-entry-flag]').forEach((input) => input.addEventListener('change', () => App.actions.toggleEntrySentFlag(input.dataset.entryId, input.dataset.entryFlag, input.checked)));
      },
      openCalendarEditor(data, isEdit) {
        this.ensureEditorNoteField();
        if (!App.els.calendarEditor) return;
        App.els.calendarEditor.hidden = false;
        App.els.editorTitle.textContent = isEdit ? App.utils.t('edit_event') : App.utils.t('new_event');
        App.els.editorMeta.textContent = `${data.start || ''} — ${data.end || data.start || ''}`;
        App.els.editorEventSelect.innerHTML = ['<option value="">' + App.utils.t('choose_template') + '</option>'].concat(App.data.allEvents().map((event) => `<option value="${App.utils.escapeAttr(event.id)}">${App.utils.escapeHtml(event.name)}</option>`)).join('');
        App.els.editorEventSelect.value = data.eventId || '';
        App.els.editorStart.value = data.start || '';
        App.els.editorEnd.value = data.end || data.start || '';
        if (App.els.editorNoteInput) App.els.editorNoteInput.value = data.note || '';
        if (App.els.editorResultInput) App.els.editorResultInput.value = data.resultNote || '';
        if (App.els.editorResultLabel) App.els.editorResultLabel.textContent = App.utils.t('result_note');
        App.els.editorReadonly.textContent = isEdit ? App.utils.t('edit_entry_help') : App.utils.t('create_entry_help');
        App.els.editorDeleteBtn.style.display = isEdit ? '' : 'none';
        const isWeekEdit = isEdit && data.source === 'week';
        if (App.els.editorFlagsRow) App.els.editorFlagsRow.hidden = isWeekEdit;
        if (App.els.editorFlagS302) App.els.editorFlagS302.checked = !!data.flags?.f302;
        if (App.els.editorFlagLetter) App.els.editorFlagLetter.checked = !!data.flags?.letter;
      },
      openModal(modalEl) {
        if (!modalEl) return;
        modalEl.hidden = false;
        const card = modalEl.querySelector('.modal-card');
        if (card) card.scrollTop = 0;
      },
      closeModal(modalEl) {
        if (modalEl) modalEl.hidden = true;
      },
      openStatsModal() {
        const sy = App.state.calendarYear ? App.utils.getServiceYearForDate(new Date(App.state.calendarYear, App.state.calendarMonth || 0, 1)) : App.utils.getServiceYearForDate(new Date());
        const stats = App.data.getServiceYearStats(sy);
        if (App.els.statsModalTitle) App.els.statsModalTitle.textContent = App.utils.t('stats_title');
        if (App.els.statsModalSub) App.els.statsModalSub.textContent = App.utils.serviceYearLabel(sy);
        const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
        const statCard = (label, value, sub) => `<div class="md-card" style="padding:14px;box-shadow:none"><div class="small">${label}</div><div style="font-size:26px;font-weight:800">${value}</div>${sub ? `<div class="small">${sub}</div>` : ''}</div>`;
        const unvisitedHtml = stats.unvisited.length
          ? `<div class="md-card" style="padding:14px;box-shadow:none"><div class="small" style="font-weight:700;margin-bottom:8px">⚠️ ${App.utils.t('unvisited_title')} (${stats.unvisited.length})</div>${stats.unvisited.map((ev) => `<div class="side-row"><div class="side-label"><span class="dot" style="background:${App.utils.clampColor(ev.color)}"></span>${App.utils.escapeHtml(ev.name)}</div><div class="side-value small">${App.utils.escapeHtml(ev.contactName || '')}</div></div>`).join('')}</div>`
          : `<div class="md-empty">${App.utils.t('unvisited_none')}</div>`;
        if (App.els.statsModalBody) App.els.statsModalBody.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
            ${statCard(App.utils.t('stats_planned'), stats.planned)}
            ${statCard(App.utils.t('stats_done'), stats.done)}
            ${statCard('S-302', `${stats.s302Sent}/${stats.planned}`, `${pct(stats.s302Sent, stats.planned)}%`)}
            ${statCard(App.utils.t('letter'), `${stats.letterSent}/${stats.planned}`, `${pct(stats.letterSent, stats.planned)}%`)}
          </div>${unvisitedHtml}`;
        this.openModal(App.els.statsModal);
      },
      openPlannerModal() {
        const sy = App.utils.getServiceYearForDate(new Date());
        const stats = App.data.getServiceYearStats(sy);
        if (App.els.plannerStartInput && !App.els.plannerStartInput.value) App.els.plannerStartInput.value = App.utils.iso(new Date());
        if (App.els.plannerEndInput && !App.els.plannerEndInput.value) App.els.plannerEndInput.value = App.utils.iso(stats.syEnd);
        if (App.els.plannerEventsList) App.els.plannerEventsList.innerHTML = stats.unvisited.length
          ? stats.unvisited.map((ev) => {
              const settings = App.state.app.settings;
              const hasHome = typeof settings.homeLat === 'number' && typeof settings.homeLng === 'number';
              const hasCoords = typeof ev.lat === 'number' && typeof ev.lng === 'number';
              const km = (hasHome && hasCoords) ? App.utils.haversineKm(settings.homeLat, settings.homeLng, ev.lat, ev.lng) : null;
              const distLabel = km !== null ? `<span class="small" style="color:var(--muted)">${App.utils.t('dist_km', { km: Math.round(km) })}</span>` : `<span class="small" style="color:var(--muted)">${App.utils.t('dist_none')}</span>`;
              return `<label style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--line);border-radius:12px"><input type="checkbox" data-planner-event="${App.utils.escapeAttr(ev.id)}" style="width:auto" checked /><span class="dot" style="background:${App.utils.clampColor(ev.color)}"></span><span style="flex:1">${App.utils.escapeHtml(ev.name)}</span>${distLabel}</label>`;
            }).join('')
          : `<div class="md-empty">${App.utils.t('unvisited_none')}</div>`;
        if (App.els.plannerPreview) App.els.plannerPreview.textContent = '';
        this.openModal(App.els.plannerModal);
      },
      applyAutoPlan() {
        const startIso = App.els.plannerStartInput?.value, endIso = App.els.plannerEndInput?.value;
        const rs = App.utils.parseLocalDate(startIso), re = App.utils.parseLocalDate(endIso);
        if (!rs || !re || rs > re) return App.utils.toast(App.utils.t('wrong_end_date'));
        const selectedIds = Array.from(document.querySelectorAll('[data-planner-event]:checked')).map((el) => el.dataset.plannerEvent);
        if (!selectedIds.length) return App.utils.toast(App.utils.t('planner_nothing'));

        const NEAR_KM = 100; // day-trip range from home — can return every week
        const CLUSTER_KM = 150; // congregations within this of each other join the same away-tour
        const MAX_TOUR_WEEKS = 6; // "можем оставаться на посещениях от пяти до максимум шести недель"

        const settings = App.state.app.settings;
        const hasHome = typeof settings.homeLat === 'number' && typeof settings.homeLng === 'number';
        const selectedEvents = selectedIds.map((id) => App.data.getEventById(id)).filter(Boolean);
        const withDistance = selectedEvents.map((ev) => {
          const hasCoords = typeof ev.lat === 'number' && typeof ev.lng === 'number';
          const distance = (hasHome && hasCoords) ? App.utils.haversineKm(settings.homeLat, settings.homeLng, ev.lat, ev.lng) : null;
          return { event: ev, distance };
        });
        // Congregations without coordinates are treated as "near" by default — we simply can't
        // tell how far they are, so they shouldn't be forced into a far-away tour.
        const nearList = withDistance.filter((e) => e.distance === null || e.distance <= NEAR_KM);
        const farPool = withDistance.filter((e) => e.distance !== null && e.distance > NEAR_KM);
        const uncoded = withDistance.filter((e) => e.distance === null).length;

        // Greedy geographic clustering: repeatedly take the farthest remaining congregation as a
        // seed and pull in every other remaining one within CLUSTER_KM of any cluster member.
        const clusters = [];
        const remaining = [...farPool];
        while (remaining.length) {
          remaining.sort((a, b) => b.distance - a.distance);
          const cluster = [remaining.shift()];
          let grew = true;
          while (grew) {
            grew = false;
            for (let i = remaining.length - 1; i >= 0; i -= 1) {
              const candidate = remaining[i];
              const closeToCluster = cluster.some((m) => App.utils.haversineKm(m.event.lat, m.event.lng, candidate.event.lat, candidate.event.lng) <= CLUSTER_KM);
              if (closeToCluster) { cluster.push(candidate); remaining.splice(i, 1); grew = true; }
            }
          }
          // Order the tour starting from the member closest to home (natural way in/out), so
          // consecutive weeks move outward instead of jumping randomly between cities.
          cluster.sort((a, b) => a.distance - b.distance);
          clusters.push(cluster);
        }
        // A cluster with more congregations than fit in one stretch becomes several consecutive tours.
        const tours = [];
        clusters.forEach((cluster) => { for (let i = 0; i < cluster.length; i += MAX_TOUR_WEEKS) tours.push(cluster.slice(i, i + MAX_TOUR_WEEKS)); });

        const isWeekBusy = (weekStart, weekEnd) => (App.state.app.entries || []).some((entry) => {
          const es = App.utils.parseLocalDate(entry.start), ee = App.utils.parseLocalDate(entry.end);
          return es && ee && App.utils.overlaps(es, ee, weekStart, weekEnd);
        });
        const occupied = new Set();
        const weekFree = (weekStart) => !occupied.has(App.utils.iso(weekStart)) && !isWeekBusy(weekStart, App.utils.addDays(weekStart, 6));
        const assignments = [];

        // Place each far-away tour into the first run of fully-free consecutive weeks that fits it.
        tours.forEach((tour) => {
          let cursor = App.utils.startOfWeek(rs); if (cursor < rs) cursor = App.utils.addDays(cursor, 7);
          while (cursor <= re) {
            let fits = true;
            for (let k = 0; k < tour.length; k += 1) { if (!weekFree(App.utils.addDays(cursor, k * 7))) { fits = false; break; } }
            if (fits) {
              tour.forEach((member, k) => {
                const weekStart = App.utils.addDays(cursor, k * 7);
                occupied.add(App.utils.iso(weekStart));
                const vStart = App.utils.addDays(weekStart, 1), vEnd = App.utils.addDays(weekStart, 6);
                assignments.push({ eventId: member.event.id, event: member.event, start: App.utils.iso(vStart), end: App.utils.iso(vEnd) });
              });
              break;
            }
            cursor = App.utils.addDays(cursor, 7);
          }
        });

        // Fill remaining free weeks with the near (day-trip) congregations, in list order.
        let cursor = App.utils.startOfWeek(rs); if (cursor < rs) cursor = App.utils.addDays(cursor, 7);
        for (const { event } of nearList) {
          while (cursor <= re && !weekFree(cursor)) cursor = App.utils.addDays(cursor, 7);
          if (cursor > re) break;
          occupied.add(App.utils.iso(cursor));
          const vStart = App.utils.addDays(cursor, 1), vEnd = App.utils.addDays(cursor, 6);
          assignments.push({ eventId: event.id, event, start: App.utils.iso(vStart), end: App.utils.iso(vEnd) });
          cursor = App.utils.addDays(cursor, 7);
        }

        if (!assignments.length) return App.utils.toast(App.utils.t('planner_no_free_weeks'));
        assignments.sort((a, b) => String(a.start).localeCompare(String(b.start)));
        const summary = assignments.map((a) => `${a.event?.name}: ${App.utils.prettyDate(a.start)} — ${App.utils.prettyDate(a.end)}`).join('\n');
        const clusterNote = tours.length ? '\n\n' + App.utils.t('tours_grouped', { count: tours.length > clusters.length ? tours.length : clusters.length }) : '';
        const uncodedNote = uncoded ? '\n' + App.utils.t('uncoded_note', { count: uncoded }) : '';
        if (!window.confirm(`${App.utils.t('planner_confirm')} (${assignments.length}):${uncodedNote}\n\n${summary}${clusterNote}`)) return;
        assignments.forEach((a) => App.state.app.entries.push({ id: App.utils.uid('entry'), eventId: a.eventId, start: a.start, end: a.end, title: a.event?.name || '', note: '', flags: { f302: false, letter: false }, resultNote: '', source: 'entry' }));
        App.store.save();
        this.closeModal(App.els.plannerModal);
        App.ui.renderAll();
        App.utils.toast(`${App.utils.t('planner_created')}: ${assignments.length}`);
      },
      shareWeekText(itemData, event) {
        const text = `${itemData.title}\n${App.utils.prettyDateLong(itemData.start)} — ${App.utils.prettyDateLong(itemData.end)}${event?.address ? `\n${App.utils.t('address')}: ${event.address}` : ''}${event?.schedule ? `\n${App.utils.t('schedule')}: ${event.schedule}` : ''}`;
        if (navigator.share) { navigator.share({ text }).catch(() => {}); }
        else if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(() => App.utils.toast(App.utils.t('copied'))).catch(() => {}); }
      },
      // Finds the element that actually scrolls for a given node. This app's <body> has a fixed
      // 100% height with display:flex, which means the WINDOW itself is not scrollable at all —
      // body (or an inner panel) is the real scroll container. Scrolling `window` therefore does
      // nothing, silently. Rather than hardcoding assumptions about which element scrolls (they
      // differ between the wide layout, the narrow layout, and modals), find it at runtime.
      findScrollContainer(el) {
        let node = el?.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
          const oy = getComputedStyle(node).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
          node = node.parentElement;
        }
        if (document.body.scrollHeight > document.body.clientHeight + 1) return document.body;
        const root = document.scrollingElement || document.documentElement;
        if (root && root.scrollHeight > root.clientHeight + 1) return root;
        return null;
      },
      scrollToDetailPanel() {
        const target = App.els.calendarSideTitle;
        if (!target) return;
        const apply = () => {
          const container = this.findScrollContainer(target);
          if (!container) { try { target.scrollIntoView({ block: 'start' }); } catch (err) { /* nothing scrollable */ } return; }
          // The sticky header overlays the top of the scroll area, so leave room for it.
          const topbar = document.querySelector('.topbar');
          const overlap = (topbar && getComputedStyle(topbar).position === 'sticky') ? topbar.offsetHeight : 0;
          const clearance = overlap + 16;
          const containerTop = (container === document.body || container === document.documentElement)
            ? 0
            : container.getBoundingClientRect().top;
          const delta = target.getBoundingClientRect().top - containerTop;
          const desired = Math.max(0, container.scrollTop + delta - clearance);
          try { container.scrollTo({ top: desired, behavior: 'smooth' }); }
          catch (err) { container.scrollTop = desired; }
          // If the smooth call was silently ignored (happens on some mobile browsers), force it.
          window.setTimeout(() => {
            if (Math.abs(container.scrollTop - desired) > 4) container.scrollTop = desired;
          }, 450);
        };
        // Run after the browser has settled the layout that this click just changed.
        window.requestAnimationFrame(() => window.requestAnimationFrame(apply));
      },
      measureTopbarHeight() {
        const topbar = document.querySelector('.topbar');
        if (topbar && topbar.offsetHeight) document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
        // Общая шапка модуля: от её реальной высоты зависит, откуда начинается
        // выезжающая шторка меню. Держать здесь 64px из общего слоя нельзя —
        // высота меняется от языка и размера шрифта, и шторка либо залезала бы
        // под шапку, либо оставляла щель.
        const cwBar = document.querySelector('.md-topbar-v2');
        if (cwBar && cwBar.offsetHeight) document.documentElement.style.setProperty('--cw-topbar-h', `${cwBar.offsetHeight}px`);
        // Only trust this at (near) the top of the page — calendar-shell isn't sticky, so its
        // on-screen position only reflects the true natural gap when we haven't scrolled away from it.
        if (window.scrollY <= 4) {
          const shell = document.querySelector('.calendar-shell');
          if (shell) {
            const top = Math.round(shell.getBoundingClientRect().top);
            if (top > 0) document.documentElement.style.setProperty('--calendar-side-top', `${top}px`);
          }
        }
      },
      renderNextVisitCard() {
        const pill = App.els.nextVisitPill || document.getElementById('nextVisitPill');
        if (!pill) return;
        const finish = () => window.requestAnimationFrame(() => window.requestAnimationFrame(() => App.ui.measureTopbarHeight()));
        if (!pill.dataset.clickBound) {
          pill.dataset.clickBound = '1';
          pill.addEventListener('click', () => {
            const targetId = pill.dataset.entryId;
            if (!targetId) return;
            App.state.calendarDetailId = `entry:${targetId}`;
            App.ui.renderCalendarDetails({ id: `entry:${targetId}` });
            // Deferred to the next frame so it doesn't race the browser settling this tap
            // (this button may have only just become visible/tappable this same instant).
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
              App.ui.scrollToDetailPanel();
            }));
          });
        }
        // Only meaningful on the calendar screen — keep other screens' headers clean.
        if (App.state.selectedScreen !== 'calendar') { pill.style.display = 'none'; finish(); return; }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const upcoming = (App.state.app.entries || [])
          .map((entry) => ({ entry, event: App.data.getEventById(entry.eventId), start: App.utils.parseLocalDate(entry.start) }))
          .filter(({ event, start, entry }) => event?.visitType && start && App.utils.parseLocalDate(entry.end) >= today)
          .sort((a, b) => a.start - b.start)[0];
        if (!upcoming) { pill.style.display = 'none'; pill.dataset.entryId = ''; finish(); return; }
        const { entry, event } = upcoming;
        pill.style.display = 'flex';
        pill.dataset.entryId = entry.id;
        const setText = (el, text) => { if (el) el.textContent = text; };
        const flags = entry.flags || {};
        // Статусы только отображаются: переключать их можно в блоке «Контроль
        // отправки» внутри детали визита, дублировать интерактив здесь не нужно.
        const flagText = (labelKey, done) => `${App.utils.t(labelKey)} · ${App.utils.t(done ? 'sent_done' : 'needs_sending')}`;
        const setFlag = (el, labelKey, done) => {
          if (!el) return;
          el.textContent = flagText(labelKey, done);
          el.className = `nv-flag ${done ? 'is-done' : 'is-pending'}`;
        };
        setText(App.els.nextVisitPillDate, `🎯 ${App.utils.countdownText(entry.start, 'days')}`);
        setText(App.els.nextVisitPillType, App.utils.visitTypeLabel(event?.visitType));
        setText(App.els.nextVisitPillName, entry.title || event?.name || '');
        setText(App.els.nextVisitPillRange, `${App.utils.prettyDate(entry.start)} — ${App.utils.prettyDateYear(entry.end)}`);
        setFlag(App.els.nextVisitPillLetter, 'letter_short', !!flags.letter);
        setFlag(App.els.nextVisitPillS302, 's302_short', !!flags.f302);
        pill.title = `${entry.title || event?.name || ''}: ${App.utils.prettyDateLong(entry.start)} — ${App.utils.prettyDateLong(entry.end)}`;
        finish();
      },
      checkAutoBackupReminder() {
        try {
          const last = App.state.app.meta?.lastBackupAt ? new Date(App.state.app.meta.lastBackupAt) : null;
          const days = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : Infinity;
          if (days >= 7) {
            const label = last ? App.utils.t('backup_overdue', { days }) : App.utils.t('backup_never');
            if (window.confirm(`💾 ${label}\n\n${App.utils.t('backup_prompt')}`)) App.actions.downloadBackup();
          }
        } catch (_) {}
      },
      // --- PIN protection (local barrier, not cryptographic security) ---
      pinHash(pin) { let h = 5381; const s = `syp:${pin}`; for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); },
      getStoredPin() { try { return localStorage.getItem('syp-pin-hash') || ''; } catch (_) { return ''; } },
      setupPin() {
        const existing = this.getStoredPin();
        if (existing) {
          const current = window.prompt(App.utils.t('pin_enter_current'));
          if (current === null) return;
          if (this.pinHash(current.trim()) !== existing) return App.utils.toast(App.utils.t('pin_wrong'));
          if (window.confirm(App.utils.t('pin_disable_confirm'))) { try { localStorage.removeItem('syp-pin-hash'); } catch (_) {} App.utils.toast(App.utils.t('pin_disabled')); this.updatePinButton(); return; }
        }
        const pin = window.prompt(App.utils.t('pin_set_prompt'));
        if (!pin) return;
        const clean = pin.trim();
        if (!/^\d{4,8}$/.test(clean)) return App.utils.toast(App.utils.t('pin_format'));
        try { localStorage.setItem('syp-pin-hash', this.pinHash(clean)); } catch (_) {}
        App.utils.toast(App.utils.t('pin_enabled'));
        this.updatePinButton();
      },
      updatePinButton() {
        if (App.els.pinSetupBtn) App.els.pinSetupBtn.textContent = this.getStoredPin() ? `🔒 ${App.utils.t('pin_on')}` : `🔒 ${App.utils.t('pin_off')}`;
      },
      wrapSelection(editor, styleProp, value) {
        const sel = window.getSelection ? window.getSelection() : null;
        if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
        const range = sel.getRangeAt(0);
        if (editor.contains && !editor.contains(range.commonAncestorContainer)) return false;
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;
        if (container && container.dataset && container.dataset.rteStyleProp === styleProp && container.textContent === range.toString() && range.toString().length) {
          // Selection exactly matches an existing styled span — toggle it off (unwrap).
          const parent = container.parentNode;
          while (container.firstChild) parent.insertBefore(container.firstChild, container);
          parent.removeChild(container);
          return true;
        }
        // Simple case: the selection sits inside a single element — wrap it in one go.
        try {
          const span = document.createElement('span');
          span.dataset.rteStyleProp = styleProp;
          span.style[styleProp] = value;
          range.surroundContents(span);
          const newRange = document.createRange();
          newRange.selectNodeContents(span);
          sel.removeAllRanges();
          sel.addRange(newRange);
          return true;
        } catch (_) {
          // surroundContents() throws when the selection crosses element boundaries (the common
          // case: dragging across two or more paragraphs). The previous fallback was
          // extractContents() + wrap-everything-in-one-inline-span, which pulled the block
          // elements themselves inside an inline span and collapsed separate paragraphs into a
          // single run of text — this is what "формат письма ломается" was. Instead, style each
          // selected TEXT NODE individually so the surrounding block structure stays untouched.
        }
        const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          },
        });
        const textNodes = [];
        let current = walker.nextNode();
        while (current) { textNodes.push(current); current = walker.nextNode(); }
        if (!textNodes.length) return false;
        const wrapped = [];
        textNodes.forEach((node) => {
          // Only the selected PART of the first/last node is inside the range.
          const start = node === range.startContainer ? range.startOffset : 0;
          const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
          if (end <= start) return;
          const piece = document.createRange();
          piece.setStart(node, start);
          piece.setEnd(node, end);
          const span = document.createElement('span');
          span.dataset.rteStyleProp = styleProp;
          span.style[styleProp] = value;
          try { piece.surroundContents(span); wrapped.push(span); } catch (_) { /* skip this node */ }
        });
        if (!wrapped.length) return false;
        const newRange = document.createRange();
        newRange.setStartBefore(wrapped[0]);
        newRange.setEndAfter(wrapped[wrapped.length - 1]);
        sel.removeAllRanges();
        sel.addRange(newRange);
        return true;
      },
      parseRichLetterBlocks(html) {
        const container = document.createElement('div');
        container.innerHTML = html;
        const walkRuns = (node, inherited) => {
          const runs = [];
          (node.childNodes || []).forEach((child) => {
            if (child.nodeType === 3) {
              if (child.textContent) runs.push({ text: child.textContent, ...inherited });
            } else if (child.nodeType === 1) {
              const style = child.style || {};
              const tag = (child.tagName || '').toUpperCase();
              const next = {
                bold: inherited.bold || style.fontWeight === 'bold' || tag === 'B' || tag === 'STRONG',
                italic: inherited.italic || style.fontStyle === 'italic' || tag === 'I' || tag === 'EM',
                underline: inherited.underline || style.textDecoration === 'underline' || tag === 'U',
                size: (style.fontSize ? parseInt(style.fontSize, 10) : null) || inherited.size,
              };
              runs.push(...walkRuns(child, next));
            }
          });
          return runs;
        };
        const readBlock = (el) => {
          const style = el.style || {};
          const baseline = { bold: style.fontWeight === 'bold', italic: style.fontStyle === 'italic', underline: style.textDecoration === 'underline', size: style.fontSize ? parseInt(style.fontSize, 10) : null };
          const runs = walkRuns(el, baseline).filter((r) => r.text);
          return runs.length ? runs : ((el.textContent || '').trim() ? [{ text: el.textContent.trim(), ...baseline }] : []);
        };
        const blocks = [];
        if (!container.childNodes.length) return blocks;
        // Iterate childNodes (not children): a contenteditable field typically leaves the FIRST
        // line as a bare text node and only wraps subsequent lines in <div>s. Iterating only
        // element children silently dropped that first paragraph from the PDF, even though it
        // displayed correctly in the settings editor.
        const INLINE_TAGS = ['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'A', 'FONT', 'SUB', 'SUP', 'SMALL', 'MARK'];
        let pending = []; // runs of the current line being assembled from bare text + inline tags
        const flushPending = () => {
          const kept = pending.filter((r) => r.text);
          if (kept.length && kept.some((r) => r.text.trim())) blocks.push({ runs: kept });
          pending = [];
        };
        Array.from(container.childNodes).forEach((node) => {
          if (node.nodeType === 3) {
            if (node.textContent) pending.push({ text: node.textContent, bold: false, italic: false, underline: false, size: null });
            return;
          }
          if (node.nodeType !== 1) return;
          const tag = (node.tagName || '').toUpperCase();
          if (tag === 'BR') { flushPending(); return; }
          if (INLINE_TAGS.includes(tag)) {
            // Same visual line — keep accumulating rather than starting a new paragraph.
            // Wrap it so walkRuns sees the element as a CHILD, otherwise the element's own
            // tag (e.g. a top-level <b>) would be ignored and its formatting lost.
            const holder = document.createElement('div');
            holder.appendChild(node.cloneNode(true));
            pending.push(...walkRuns(holder, { bold: false, italic: false, underline: false, size: null }).filter((r) => r.text));
            return;
          }
          flushPending(); // a block-level element ends whatever line was being assembled
          const runs = readBlock(node);
          if (runs.length) blocks.push({ runs });
        });
        flushPending();
        return blocks;
      },
      letterTypeSuffix(visitType) {
        return visitType === 'group' ? 'Group' : visitType === 'pregroup' ? 'Pregroup' : 'Congregation';
      },
      // Character-based language detection — no dictionaries/libraries needed, just letters that
      // are unique to one language and never appear in the others we support.
      detectTextLanguage(text) {
        if (!text) return null;
        const stripped = String(text).replace(/<[^>]+>/g, ' ').replace(/\{[a-z_]+\}/gi, ' ');
        if (/[іїєґІЇЄҐ]/.test(stripped)) return 'uk'; // letters that exist in Ukrainian but not Russian
        if (/[ąćęłńśźżĄĆĘŁŃŚŹŻ]/.test(stripped)) return 'pl'; // Polish-only diacritics
        if (/[äöüßÄÖÜ]/.test(stripped)) return 'de'; // German-only diacritics/ligature
        // Polish text often has no diacritics at all in short phrases — a secondary check for
        // distinctive Polish function words, checked only after the stronger diacritic signals
        // above (avoids e.g. "nie", which also means something in German, causing a false match).
        if (/\b(się|czy|będzie|przez|który|która)\b/i.test(stripped)) return 'pl';
        if (/[ыэъЫЭЪ]/.test(stripped)) return 'ru'; // letters that exist in Russian but not Ukrainian
        if (/[а-яёА-ЯЁ]/.test(stripped)) return 'ru'; // generic Cyrillic with no distinguishing letter found — ru as the more common default
        if (/[a-zA-Z]/.test(stripped)) return 'en';
        return null;
      },
      // Determines the letter's real language from its actual text — NOT from the app's interface
      // language — checking, in priority order, whatever text this specific letter will actually
      // Determines the letter's real language — NOT from the app's interface language. An
      // explicitly configured formLanguage on the event is a deliberate choice and wins outright.
      // Otherwise, detect from whatever text this specific letter will actually contain, checked
      // in order: the entry's own saved email body, the letter body template (Page 1, the most
      // deliberately-authored text), the type's default email body template, and the salutation
      // line. Only if none of that yields any signal does it fall back to the UI language.
      detectLetterLanguage(entry, event) {
        if (event?.formLanguage) return event.formLanguage;
        const suffix = this.letterTypeSuffix(event?.visitType);
        const settings = App.state.app.settings;
        const candidates = [
          entry?.emailBody,
          this.getLetterTemplateFor(event?.visitType),
          this.getEmailBodyFor(suffix),
          this.getSalutationFor(suffix),
        ];
        for (const candidate of candidates) {
          const detected = this.detectTextLanguage(candidate);
          if (detected) return detected;
        }
        return settings.language || 'ru';
      },
      buildLetterSubject(entry, event) {
        if (!entry) return '';
        const lang = this.detectLetterLanguage(entry, event);
        const parts = LETTER_SUBJECT_PARTS[lang] || LETTER_SUBJECT_PARTS.ru;
        const suffix = this.letterTypeSuffix(event?.visitType);
        const typeLabel = parts.type[suffix];
        const name = entry.title || event?.name || '';
        const fmt = (iso) => { const d = App.utils.parseLocalDate(iso); return d ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : ''; };
        return `${parts.prefix} ${typeLabel} ${name} ${parts.from} ${fmt(entry.start)} ${parts.to} ${fmt(entry.end)}`.replace(/\s+/g, ' ').trim();
      },
      /* ═══════════════════════════════════════════════════════════════════
         ДОСТУП К ДОКУМЕНТАМ (фаза 2б, 12.08.2026)

         Тексты писем переехали из настроек модуля в общее хранилище
         (shared/templates.js). Читать и писать их напрямую через
         `settings['letterTemplate' + suffix]` больше нельзя — только через
         методы ниже.

         ⚠️ КАЖДЫЙ ЧИТАЮЩИЙ МЕТОД ОБЯЗАН УМЕТЬ ОТКАТИТЬСЯ В НАСТРОЙКИ. Чтение
         базы асинхронно, а письмо собирается синхронно. Пока
         `CWTemplates.stored` равен false (доля секунды после загрузки страницы)
         или пока перенос не выполнен, действует прежний источник. Иначе
         пользователь в этот момент получил бы системный текст вместо своего и
         не заметил бы подмены.
         ═══════════════════════════════════════════════════════════════════ */
      docCtx(kind, suffix) {
        const type = { Congregation: 'congregation', Group: 'group', Pregroup: 'pregroup' }[suffix] || 'congregation';
        return 'visit.' + type + '.' + kind;
      },
      docId(kind, suffix) { return 'sys.' + this.docCtx(kind, suffix); },
      /** Готов ли общий слой отдавать документы. */
      docsReady() { return !!(self.CWTemplates && self.CWTemplates.stored); },
      /** Язык документа. Письмо украинское независимо от языка интерфейса. */
      docLang() { return (self.CWDocLang && self.CWDocLang.get()) || 'uk'; },
      /**
       * Текст документа. `settingsKey` — прежнее место хранения, оно же путь
       * отката; `fallback` — системный текст на случай, если нет ни того, ни
       * другого.
       */
      docText(kind, suffix, settingsKey, fallback) {
        if (this.docsReady()) {
          const found = self.CWTemplates.text(this.docCtx(kind, suffix), this.docLang());
          if (found && found.body) return found.body;
        }
        return App.state.app.settings[settingsKey + suffix] || fallback;
      },
      /** Записать текст документа. Возвращает промис — вызывающему ждать не обязательно. */
      docSave(kind, suffix, settingsKey, html) {
        if (!this.docsReady()) {
          App.state.app.settings[settingsKey + suffix] = html;
          App.store.save();
          return Promise.resolve();
        }
        return self.CWTemplates.save(this.docId(kind, suffix), this.docLang(), {
          body: html,
          context: this.docCtx(kind, suffix),
          module: 'circuit-planner',
          format: kind === 'letter' ? 'html' : 'text',
        }).catch((e) => { console.error('Клиндарий: не удалось сохранить документ', e); });
      },
      /**
       * Вернуть системный текст: пользовательская запись УДАЛЯЕТСЯ, а не
       * перезаписывается. Так шаблон снова начинает обновляться вместе с
       * приложением, и не остаётся записи-двойника.
       */
      docReset(kind, suffix, settingsKey, fallback) {
        if (!this.docsReady()) {
          App.state.app.settings[settingsKey + suffix] = fallback;
          App.store.save();
          return Promise.resolve();
        }
        return self.CWTemplates.reset(this.docId(kind, suffix))
          .catch((e) => { console.error('Клиндарий: не удалось восстановить оригинал', e); });
      },
      /** Дополнительные страницы письма (памятка координатору и прочее). */
      docPages(suffix) {
        if (this.docsReady()) {
          const found = self.CWTemplates.text(this.docCtx('letter', suffix), this.docLang());
          if (found && Array.isArray(found.pages)) return found.pages;
        }
        /* Запасной путь: свои страницы, если они есть, иначе системные.
           Пустой массив здесь недопустим — письмо ушло бы БЕЗ памятки
           координатору, и заметить это можно было бы только на бумаге. */
        const own = App.state.app.settings.letterPages && App.state.app.settings.letterPages[suffix];
        return (Array.isArray(own) && own.length) ? own : builtinPages(suffix);
      },
      docSavePages(suffix, pages) {
        if (!this.docsReady()) {
          if (!App.state.app.settings.letterPages) App.state.app.settings.letterPages = {};
          App.state.app.settings.letterPages[suffix] = pages;
          App.store.save();
          return Promise.resolve();
        }
        return self.CWTemplates.save(this.docId('letter', suffix), this.docLang(), {
          pages: pages,
          context: this.docCtx('letter', suffix),
          module: 'circuit-planner',
          format: 'html',
        }).catch((e) => { console.error('Клиндарий: не удалось сохранить страницы письма', e); });
      },

      /**
       * Однократный перенос текстов писем из настроек модуля в общее хранилище.
       *
       * ⚠️ НЕОБРАТИМО: после успешного переноса ключи `letterTemplate*`,
       * `letterPages*`, `emailBody*`, `letterSalutation*` и `memoTemplate`
       * удаляются из настроек. Четыре правила, те же, что в Конгрессах:
       *
       *   1. Снимок состояния в историю модуля ПЕРЕД началом.
       *   2. Переносится только правленое. Модуль всегда материализовал
       *      значения по умолчанию прямо в настройки (ensureSettingsDefaults),
       *      поэтому ключ есть у всех — «правил» определяется сравнением с
       *      системным текстом, а не наличием ключа. Скопировать нетронутый
       *      текст значило бы заморозить его: он перестал бы обновляться
       *      вместе с приложением.
       *   3. adopt() не перезаписывает существующую запись — он зовётся при
       *      каждом запуске модуля, и второй запуск не должен затирать правку,
       *      сделанную уже в новом хранилище.
       *   4. Ключи удаляются и состояние сохраняется ТОЛЬКО после успешной
       *      записи в базу. При сбое настройки остаются нетронутыми, модуль
       *      продолжает работать на прежнем источнике, перенос повторится при
       *      следующем запуске.
       */
      adoptDocuments() {
        if (!self.CWTemplates || !self.CWTemplates.stored || !self.CWDB) return Promise.resolve(false);
        const settings = App.state.app.settings || {};
        const suffixes = ['Congregation', 'Group', 'Pregroup'];
        const jobs = [];
        const KINDS = [
          { kind: 'letter', key: 'letterTemplate', format: 'html', def: (s) => DEFAULT_LETTER_TEMPLATE_HTML },
          { kind: 'email', key: 'emailBody', format: 'text', def: (s) => DEFAULT_EMAIL_BODY_TEMPLATES[s] },
          { kind: 'salutation', key: 'letterSalutation', format: 'text', def: (s) => DEFAULT_LETTER_SALUTATIONS[s] },
        ];
        suffixes.forEach((suffix) => {
          const pages = (settings.letterPages && settings.letterPages[suffix]) || null;
          const defaultPages = builtinPages(suffix);
          const pagesTouched = pages && JSON.stringify(pages) !== JSON.stringify(defaultPages);
          KINDS.forEach((spec) => {
            const value = settings[spec.key + suffix];
            const isText = typeof value === 'string' && value;
            const changed = isText && value !== spec.def(suffix);
            /* Страницы принадлежат записи письма, поэтому правленые страницы
               при нетронутом тексте письма всё равно требуют его переноса. */
            const needed = changed || (spec.kind === 'letter' && pagesTouched);
            if (!needed) return;
            const record = {
              context: App.ui.docCtx(spec.kind, suffix),
              module: 'circuit-planner',
              format: spec.format,
              title: spec.kind + ' ' + suffix,
              translations: { uk: { subject: null, body: changed ? value : spec.def(suffix) } },
            };
            if (spec.kind === 'letter' && pagesTouched) record.pages = pages;
            jobs.push(self.CWTemplates.adopt(App.ui.docId(spec.kind, suffix), record));
          });
        });
        const cleanup = () => {
          suffixes.forEach((suffix) => {
            delete settings['letterTemplate' + suffix];
            delete settings['emailBody' + suffix];
            delete settings['letterSalutation' + suffix];
          });
          delete settings.letterTemplate;
          delete settings.letterPages;
          delete settings.memoTemplate;
          App.store.save();
        };
        if (!jobs.length) { cleanup(); return Promise.resolve(false); }
        // Снимок ДО необратимого переноса, а не параллельно с ним: с фазы 4
        // запись снимка асинхронна, и «позвал и пошёл дальше» означало бы, что
        // копия и перенос идут наперегонки.
        return App.store.snapshotForMigration().then(() => Promise.all(jobs)).then(() => { cleanup(); return true; }).catch((error) => {
          console.error('Клиндарий: перенос документов не выполнен, настройки не тронуты', error);
          return false;
        });
      },
      getLetterTemplateFor(visitType) {
        const suffix = this.letterTypeSuffix(visitType);
        return this.docText('letter', suffix, 'letterTemplate', DEFAULT_LETTER_TEMPLATE_HTML);
      },
      setLetterTemplateFor(suffix, html) {
        this.docSave('letter', suffix, 'letterTemplate', html);
      },
      getEmailBodyFor(suffix) {
        return this.docText('email', suffix, 'emailBody', DEFAULT_EMAIL_BODY_TEMPLATES[suffix]);
      },
      getSalutationFor(suffix) {
        return this.docText('salutation', suffix, 'letterSalutation', DEFAULT_LETTER_SALUTATIONS[suffix]);
      },
      syncEventVisitFieldsVisibility() {
        if (App.els.eventVisitOnlyFields) App.els.eventVisitOnlyFields.style.display = App.els.eventVisitTypeInput?.value ? 'contents' : 'none';
      },
      /**
       * Справочник переменных в настройках писем.
       *
       * Имена берутся из общего реестра (shared/templates.js), собственного
       * списка у модуля больше нет. В первой колонке — каноническое имя, под
       * ним прежнее: свой старый шаблон должен опознаваться с первого взгляда,
       * а старые имена работают всегда.
       *
       * Показаны только те переменные, у которых уже есть описание в словаре
       * (ключи `ph_*`, переведены носителями). Остальные поля реестра —
       * congregation.address, sender.* кроме имени и т.д. — движок подставит,
       * но в таблицу они попадут только вместе с описанием от носителя языка:
       * строка без описания в справочнике бесполезна.
       */
      renderEventDistanceStatus() {
        if (!App.els.eventDistanceStatus) return;
        const coords = App.state.editingEventCoords;
        const settings = App.state.app.settings;
        if (!coords) { App.els.eventDistanceStatus.textContent = ''; return; }
        if (typeof settings.homeLat === 'number' && typeof settings.homeLng === 'number') {
          const km = App.utils.haversineKm(settings.homeLat, settings.homeLng, coords.lat, coords.lng);
          App.els.eventDistanceStatus.textContent = km === null ? App.utils.t('geo_saved') : App.utils.t('geo_distance', { km: Math.round(km) });
        } else {
          App.els.eventDistanceStatus.textContent = App.utils.t('geo_saved_hint');
        }
      },
      async geocodeCurrentEvent() {
        const address = App.els.eventAddressInput?.value.trim();
        if (!address) return App.utils.toast(App.utils.t('geo_need_address'));
        if (App.els.eventDistanceStatus) App.els.eventDistanceStatus.textContent = App.utils.t('geo_locating');
        const result = await App.utils.geocodeAddress(address);
        if (!result) { if (App.els.eventDistanceStatus) App.els.eventDistanceStatus.textContent = App.utils.t('geo_failed'); return; }
        App.state.editingEventCoords = { lat: result.lat, lng: result.lng };
        // If editing an existing (already saved) event, persist immediately so the user doesn't have to remember to hit Save.
        if (App.state.editingEventId) {
          // Писать надо в СЫРУЮ запись: getEventById() с шага 4а отдаёт
          // объединённую копию, и правка в ней исчезла бы молча.
          const existing = App.data.getRawEventById(App.state.editingEventId);
          if (existing) {
            existing.lat = result.lat; existing.lng = result.lng;
            App.store.save();
            // Координаты — машинная форма адреса, то есть часть идентификации.
            App.shared.directory.mirror(existing);
          }
        }
        App.ui.renderEventDistanceStatus();
      },
      async geocodeHome() {
        const address = App.els.homeAddressInput?.value.trim();
        if (!address) return App.utils.toast(App.utils.t('geo_need_city'));
        if (App.els.homeGeocodeStatus) App.els.homeGeocodeStatus.textContent = App.utils.t('geo_locating');
        const result = await App.utils.geocodeAddress(address);
        if (!result) { if (App.els.homeGeocodeStatus) App.els.homeGeocodeStatus.textContent = App.utils.t('geo_failed'); return; }
        App.state.app.settings.homeLat = result.lat;
        App.state.app.settings.homeLng = result.lng;
        App.store.save();
        if (App.els.homeGeocodeStatus) App.els.homeGeocodeStatus.textContent = App.utils.t('geo_found', { place: result.displayName || address });
        App.utils.toast(App.utils.t('geo_home_saved'));
      },
      retranslateVisitFormWeekdays(oldLang, newLang) {
        const state = App.state.visitFormData; if (!state) return;
        const weekdayKeys = ['weekdayMon','weekdayTue','weekdayWed','weekdayThu','weekdayFri','weekdaySat','weekdaySun'];
        const newDict = VP_I18N_DICTS[newLang] || VP_I18N_DICTS.ru;
        // A day label may have been typed in ANY language (including before this feature existed,
        // or after manual edits) — match it against every known language's weekday names, not just
        // the one it was supposedly created in, then rewrite it in the newly selected language.
        const findKeyForLabel = (label) => weekdayKeys.find((key) => Object.values(VP_I18N_DICTS).some((dict) => dict[key] === label));
        (state.servicePlan || []).forEach((day) => {
          const key = findKeyForLabel(day.label);
          if (key) day.label = newDict[key];
        });
        (state.meals || []).forEach((meal) => {
          const key = findKeyForLabel(meal.day);
          if (key) meal.day = newDict[key];
        });
      },
      showPinGateIfNeeded() {
        const stored = this.getStoredPin();
        if (!stored || !App.els.pinOverlay) return;
        App.els.pinOverlay.hidden = false;
        if (App.els.pinInput) App.els.pinInput.value = '';
        if (App.els.pinError) App.els.pinError.textContent = '';
        if (!App.state.pinGateWired) {
          App.state.pinGateWired = true;
          const tryUnlock = () => {
            const currentStored = this.getStoredPin();
            const value = (App.els.pinInput?.value || '').trim();
            if (!currentStored || this.pinHash(value) === currentStored) { App.els.pinOverlay.hidden = true; if (App.els.pinInput) App.els.pinInput.value = ''; if (App.els.pinError) App.els.pinError.textContent = ''; }
            else { if (App.els.pinError) App.els.pinError.textContent = App.utils.t('pin_wrong'); if (App.els.pinInput) { App.els.pinInput.value = ''; App.els.pinInput.focus(); } }
          };
          App.els.pinSubmitBtn?.addEventListener('click', tryUnlock);
          App.els.pinInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
          // Installed PWAs on phones typically suspend/resume the same page instance instead of
          // reloading it when reopened from the home screen — init() only runs once at true cold
          // start, so without this the lock screen would only ever appear the very first time.
          // Re-check whenever the app becomes visible again after being backgrounded.
          const recheck = () => { if (document.visibilityState === 'visible') App.ui.showPinGateIfNeeded(); };
          document.addEventListener('visibilitychange', recheck);
          window.addEventListener('pageshow', recheck);
          window.addEventListener('focus', recheck);
        }
        setTimeout(() => App.els.pinInput?.focus(), 100);
      },
      // ===================== Merged: Visit Form (formerly a separate app) =====================
      vpDefaultsForType(state, type) {
        const dayLabels = {
          pregroup: ['weekdayThu','weekdayFri','weekdaySat','weekdaySun'],
          group: ['weekdayWed','weekdayThu','weekdayFri','weekdaySat','weekdaySun'],
          meeting: ['weekdayWed','weekdayThu','weekdayFri','weekdaySat','weekdaySun'],
        };
        const pastoralCount = { pregroup: 0, group: 2, meeting: 3 };
        if (!state.servicePlan.length && dayLabels[type]) {
          state.servicePlan = dayLabels[type].map((dayKey) => ({ id: App.utils.uid('vd'), label: buildVpI18n(state.language).t(dayKey), rows: [{ id: App.utils.uid('vr'), time: '', place: '', partner: '', kind: '', session: '' }] }));
        }
        if (!state.pastoralVisits.length) {
          const count = pastoralCount[type] || 0;
          state.pastoralVisits = Array.from({ length: count }, () => ({ id: App.utils.uid('vp'), name: '', day: '', time: '', partner: '', reason: '' }));
        }
        if (!state.meals.length) state.meals = [{ id: App.utils.uid('vm'), day: '', time: '', place: '', host: '', phone: '', note: '' }];
      },
      openVisitForm(itemId) {
        const item = App.data.getCalendarItemById(itemId);
        if (!item || item.source !== 'entry') return App.utils.toast(App.utils.t('vf_only_visits'));
        const entry = App.state.app.entries.find((e) => e.id === item.refId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        App.state.visitFormEntryId = entry.id;
        const visitTypeMap = { congregation: 'meeting', group: 'group', pregroup: 'pregroup' };
        const saved = entry.visitForm;
        // Язык документа общего слоя знает все пять языков экосистемы, и
        // формуляр визита теперь тоже: немецкий блок VP_I18N_DICTS залит
        // допником №2 (18.08.2026). Нормализация ОСТАЁТСЯ и снята быть не
        // может — она страхует от языка, которого нет в таблице формуляра
        // (следующий язык экосистемы придёт в общий слой раньше, чем в
        // VP_I18N_DICTS). Без неё селект показал бы «Русский», состояние
        // осталось бы чужим, а PDF вышел бы русским — подпись врала бы
        // о содержимом.
        const wantedLang = event?.formLanguage || App.shared.docLang() || 'ru';
        const defaultLang = VP_I18N_DICTS[wantedLang] ? wantedLang : 'ru';
        const state = saved ? JSON.parse(JSON.stringify(saved)) : { visitType: visitTypeMap[event?.visitType] || 'meeting', language: defaultLang, meetings: [], servicePlan: [], pastoralVisits: [], meals: [], notes: '' };
        // Нужны формуляру: название собрания/группы в шапке PDF и период визита,
        // из которого считаются даты для каждого дня недели (визит стартует во вторник).
        state.congregationName = entry.title || event?.name || '';
        state.visitStart = entry.start || '';
        state.visitEnd = entry.end || '';
        if (!state.language) state.language = defaultLang; // older saved forms predating this field
        this.vpDefaultsForType(state, state.visitType);
        this.retranslateVisitFormWeekdays(null, state.language); // fixes any day names left over in the wrong language from before this feature existed, or from an interface-language fallback used previously
        App.state.visitFormData = state;
        if (App.els.vfVisitType) App.els.vfVisitType.value = state.visitType;
        if (App.els.vfLanguageSelect) App.els.vfLanguageSelect.value = state.language;
        if (App.els.vfNotesInput) App.els.vfNotesInput.value = state.notes || '';
        if (App.els.visitFormSub) App.els.visitFormSub.textContent = `${entry.title || event?.name || ''} · ${App.utils.prettyDateLong(entry.start)} — ${App.utils.prettyDateLong(entry.end)}`;
        this.renderVisitFormLanguageReminder();
        this.renderVisitFormLists();
        this.openModal(App.els.visitFormModal);
      },
      closeLetterModal() {
        this.closeModal(App.els.letterModal);
      },
      renderVisitFormLanguageReminder() {
        if (!App.els.vfLanguageReminder) return;
        const lang = App.state.visitFormData?.language || 'ru';
        const interfaceLang = App.state.app.settings.language || 'ru';
        const langName = VP_LANG_NAMES[lang] || lang;
        if (lang !== interfaceLang) {
          App.els.vfLanguageReminder.innerHTML = App.utils.t('vf_language_mismatch', { doc: App.utils.escapeHtml(langName), ui: App.utils.escapeHtml(VP_LANG_NAMES[interfaceLang] || interfaceLang) });
        } else {
          App.els.vfLanguageReminder.innerHTML = App.utils.t('vf_language_note', { lang: App.utils.escapeHtml(langName) });
        }
      },
      saveVisitFormState() {
        const entry = App.state.app.entries.find((e) => e.id === App.state.visitFormEntryId);
        if (!entry || !App.state.visitFormData) return;
        App.state.visitFormData.notes = App.els.vfNotesInput?.value || '';
        entry.visitForm = JSON.parse(JSON.stringify(App.state.visitFormData));
        App.store.save();
      },
      renderVisitFormLists() {
        const state = App.state.visitFormData; if (!state) return;
        const esc = App.utils.escapeHtml, escA = App.utils.escapeAttr;
        const vpi = buildVpI18n(state.language);
        // Meetings
        if (App.els.vfMeetingsList) App.els.vfMeetingsList.innerHTML = state.meetings.length ? state.meetings.map((m) => `
          <div class="md-card" style="padding:10px;box-shadow:none" data-row-id="${escA(m.id)}" data-row-kind="meeting">
            <div class="form-grid">
              <label><span class="small">${App.utils.t('type')}</span><select data-field="type">${vpi.MEETING_TYPES.map((mt) => `<option value="${mt}" ${m.type === mt ? 'selected' : ''}>${esc(vpi.t(mt))}</option>`).join('')}</select></label>
              <label><span class="small">${App.utils.t('vf_day')}</span><input data-field="day" type="text" value="${escA(m.day)}" /></label>
              <label><span class="small">${App.utils.t('vf_time')}</span><input data-field="time" type="text" value="${escA(m.time)}" /></label>
              <label><span class="small">${App.utils.t('vf_place')}</span><input data-field="place" type="text" value="${escA(m.place)}" /></label>
            </div>
            <button class="md-btn md-btn-danger md-state-layer" type="button" data-remove-row style="margin-top:8px">${App.utils.t('vf_delete_row')}</button>
          </div>`).join('') : `<div class="md-empty">${App.utils.t('vf_no_meetings')}</div>`;
        // Service plan (grouped by day)
        if (App.els.vfServiceDaysList) App.els.vfServiceDaysList.innerHTML = state.servicePlan.map((day) => `
          <div class="md-card" style="padding:10px;box-shadow:none" data-day-id="${escA(day.id)}">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input data-day-field="label" type="text" value="${escA(day.label)}" style="font-weight:700" /><button class="md-btn md-btn-danger md-state-layer" type="button" data-remove-day style="white-space:nowrap">${App.utils.t('vf_delete_day')}</button></div>
            ${day.rows.map((r) => {
              const listId = r.session === 'before' ? 'vfTimeOptionsBefore' : r.session === 'after' ? 'vfTimeOptionsAfter' : 'vfTimeOptionsDefault';
              return `
              <div class="form-grid" data-row-id="${escA(r.id)}" data-row-kind="service" data-day-id="${escA(day.id)}" style="margin-bottom:8px">
                <label><span class="small">${App.utils.t('vf_time')}</span>
                  <div class="session-toggle">
                    <button type="button" class="session-toggle-btn ${r.session === 'before' ? 'active' : ''}" data-set-session="before">${App.utils.t('vf_session_before')}</button>
                    <button type="button" class="session-toggle-btn ${r.session === 'after' ? 'active' : ''}" data-set-session="after">${App.utils.t('vf_session_after')}</button>
                  </div>
                  <input data-field="time" type="text" list="${listId}" value="${escA(r.time)}" placeholder="${escA(App.utils.t('vf_time_ph'))}" />
                </label>
                <label><span class="small">${App.utils.t('vf_place')}</span><input data-field="place" type="text" value="${escA(r.place)}" /></label>
                <label><span class="small">${App.utils.t('vf_partner_label')}</span><input data-field="partner" type="text" placeholder="${escA(App.utils.t('vf_partner_ph'))}" value="${escA(r.partner)}" /></label>
                <label><span class="small">${App.utils.t('vf_kind')}</span><input data-field="kind" type="text" value="${escA(r.kind)}" /></label>
                <button class="md-btn md-btn-danger md-state-layer" type="button" data-remove-row style="grid-column:1 / -1">${App.utils.t('vf_delete_service_row')}</button>
              </div>`;
            }).join('')}
            <button class="md-btn md-btn-outlined md-state-layer" type="button" data-add-service-row="${escA(day.id)}">${App.utils.t('vf_add_service_row')}</button>
          </div>`).join('') || `<div class="md-empty">${App.utils.t('vf_no_days')}</div>`;
        // Pastoral visits — hidden entirely for pregroup, matching the original app's rule
        const showPastoral = state.visitType !== 'pregroup';
        if (App.els.vfPastoralHeading) App.els.vfPastoralHeading.style.display = showPastoral ? '' : 'none';
        if (App.els.vfAddPastoralBtn) App.els.vfAddPastoralBtn.style.display = showPastoral ? '' : 'none';
        if (App.els.vfPastoralList) {
          App.els.vfPastoralList.style.display = showPastoral ? '' : 'none';
          App.els.vfPastoralList.innerHTML = state.pastoralVisits.length ? state.pastoralVisits.map((p) => `
            <div class="md-card" style="padding:10px;box-shadow:none" data-row-id="${escA(p.id)}" data-row-kind="pastoral">
              <div class="form-grid">
                <label><span class="small">${App.utils.t('vf_name')}</span><input data-field="name" type="text" value="${escA(p.name)}" /></label>
                <label><span class="small">${App.utils.t('vf_day')}</span><input data-field="day" type="text" value="${escA(p.day)}" /></label>
                <label><span class="small">${App.utils.t('vf_time')}</span><input data-field="time" type="text" value="${escA(p.time)}" /></label>
                <label><span class="small">${App.utils.t('vf_partner_label')}</span><input data-field="partner" type="text" placeholder="${escA(App.utils.t('vf_partner_ph'))}" value="${escA(p.partner)}" /></label>
                <label style="grid-column:1 / -1"><span class="small">${App.utils.t('vf_reason')}</span><input data-field="reason" type="text" value="${escA(p.reason)}" /></label>
              </div>
              <button class="md-btn md-btn-danger md-state-layer" type="button" data-remove-row style="margin-top:8px">${App.utils.t('vf_delete_row')}</button>
            </div>`).join('') : `<div class="md-empty">${App.utils.t('vf_no_pastoral')}</div>`;
        }
        // Meals
        const MEAL_TIME_OPTIONS = ['12:30', '12:45', '13:00', '13:30'];
        if (App.els.vfMealsList) App.els.vfMealsList.innerHTML = state.meals.length ? state.meals.map((m) => `
          <div class="md-card" style="padding:10px;box-shadow:none" data-row-id="${escA(m.id)}" data-row-kind="meal">
            <div class="form-grid">
              <label><span class="small">${App.utils.t('vf_day')}</span><select data-field="day"><option value=""></option>${vpi.MEAL_DAY_KEYS.map((dk) => { const label = vpi.t(dk); return `<option value="${escA(label)}" ${m.day === label ? 'selected' : ''}>${esc(label)}</option>`; }).join('')}</select></label>
              <label><span class="small">${App.utils.t('vf_time')}</span><select data-field="time"><option value=""></option>${MEAL_TIME_OPTIONS.map((tm) => `<option value="${tm}" ${m.time === tm ? 'selected' : ''}>${tm}</option>`).join('')}</select></label>
              <label><span class="small">${App.utils.t('vf_place')}</span><input data-field="place" type="text" value="${escA(m.place)}" /></label>
              <label><span class="small">${App.utils.t('vf_host')}</span><input data-field="host" type="text" value="${escA(m.host)}" /></label>
              <label><span class="small">${App.utils.t('vf_phone')}</span><input data-field="phone" type="text" value="${escA(m.phone)}" /></label>
              <label><span class="small">${App.utils.t('vf_note')}</span><input data-field="note" type="text" value="${escA(m.note)}" /></label>
            </div>
            <button class="md-btn md-btn-danger md-state-layer" type="button" data-remove-row style="margin-top:8px">${App.utils.t('vf_delete_row')}</button>
          </div>`).join('') : `<div class="md-empty">${App.utils.t('vf_no_meals')}</div>`;
        this.bindVisitFormRowEvents();
      },
      bindVisitFormRowEvents() {
        const state = App.state.visitFormData; if (!state) return;
        const findArray = (kind) => kind === 'meeting' ? state.meetings : kind === 'pastoral' ? state.pastoralVisits : kind === 'meal' ? state.meals : null;
        document.querySelectorAll('#vfMeetingsList [data-row-id], #vfPastoralList [data-row-id], #vfMealsList [data-row-id]').forEach((row) => {
          row.querySelectorAll('[data-field]').forEach((input) => input.addEventListener('input', () => {
            const arr = findArray(row.dataset.rowKind); const obj = arr && arr.find((o) => o.id === row.dataset.rowId);
            if (obj) { obj[input.dataset.field] = input.value; App.ui.saveVisitFormState(); }
          }));
          row.querySelector('[data-remove-row]')?.addEventListener('click', () => {
            const arr = findArray(row.dataset.rowKind);
            if (arr) { const idx = arr.findIndex((o) => o.id === row.dataset.rowId); if (idx >= 0) arr.splice(idx, 1); }
            App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
          });
        });
        document.querySelectorAll('#vfServiceDaysList [data-day-id]').forEach((dayEl) => {
          if (dayEl.hasAttribute('data-row-id')) return; // skip nested row grids matched by the day-id attr too
        });
        document.querySelectorAll('#vfServiceDaysList > div[data-day-id]').forEach((dayCard) => {
          const day = state.servicePlan.find((d) => d.id === dayCard.dataset.dayId); if (!day) return;
          dayCard.querySelector('[data-day-field="label"]')?.addEventListener('input', (e) => { day.label = e.target.value; App.ui.saveVisitFormState(); });
          dayCard.querySelector('[data-remove-day]')?.addEventListener('click', () => {
            const idx = state.servicePlan.findIndex((d) => d.id === day.id); if (idx >= 0) state.servicePlan.splice(idx, 1);
            App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
          });
          dayCard.querySelector('[data-add-service-row]')?.addEventListener('click', () => {
            day.rows.push({ id: App.utils.uid('vr'), time: '', place: '', partner: '', kind: '', session: '' });
            App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
          });
          dayCard.querySelectorAll('[data-row-kind="service"]').forEach((row) => {
            const r = day.rows.find((rr) => rr.id === row.dataset.rowId); if (!r) return;
            row.querySelectorAll('[data-field]').forEach((input) => input.addEventListener('input', () => { r[input.dataset.field] = input.value; App.ui.saveVisitFormState(); }));
            row.querySelectorAll('[data-set-session]').forEach((btn) => btn.addEventListener('click', () => {
              const chosen = btn.dataset.setSession;
              r.session = r.session === chosen ? '' : chosen; // click again to clear
              App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
            }));
            row.querySelector('[data-remove-row]')?.addEventListener('click', () => {
              const idx = day.rows.findIndex((rr) => rr.id === r.id); if (idx >= 0) day.rows.splice(idx, 1);
              App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
            });
          });
        });
      },
      buildVisitPdfDoc() {
        const state = App.state.visitFormData;
        if (!state) return null;
        if (typeof window.PdfGenerator === 'undefined' || !window.jspdf) { App.utils.toast(App.utils.t('pdf_not_loaded')); return null; }
        return window.PdfGenerator.generate(state, buildVpI18n(state.language));
      },
      // ===================== Letter PDF (preserves the original document's layout) =====================
      /**
       * Сборщик PDF.
       *
       * По умолчанию собирает ПИСЬМО: шапка отправителя, обращение, дата,
       * «Дорогі брати!», тело, дополнительные страницы. Ровно так, как было
       * до появления композера, — эта ветка не менялась и меняться не должна.
       *
       * `options.plain` даёт «просто текст на бумаге»: те же шрифты, те же
       * поля, та же нумерация страниц, но без обязательной шапки письма. Нужно
       * для документов, которые письмом не являются — памятки координатору,
       * текста e-mail, а в будущем формуляров Школы пионеров. До этого флага
       * PDF был доступен только письму, потому что памятка выходила письмом.
       *
       * @param {Object} [draftOverride] — { bodyHtml, pages } с УЖЕ выполненной
       *        подстановкой; так композер отдаёт разово правленный текст.
       * @param {Object} [options] — { plain, title }
       */
      buildLetterPdfDoc(entry, event, draftOverride, options) {
        const opts = options || {};
        const plain = !!opts.plain;
        if (!window.jspdf) { App.utils.toast(App.utils.t('pdf_not_loaded')); return null; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const FONT = 'Aptos';
        if (window.APTOS_REGULAR_B64) { doc.addFileToVFS('Aptos.ttf', window.APTOS_REGULAR_B64); doc.addFont('Aptos.ttf', FONT, 'normal'); }
        if (window.APTOS_BOLD_B64) { doc.addFileToVFS('Aptos-Bold.ttf', window.APTOS_BOLD_B64); doc.addFont('Aptos-Bold.ttf', FONT, 'bold'); }
        if (window.APTOS_ITALIC_B64) { doc.addFileToVFS('Aptos-Italic.ttf', window.APTOS_ITALIC_B64); doc.addFont('Aptos-Italic.ttf', FONT, 'italic'); }
        if (window.APTOS_BOLDITALIC_B64) { doc.addFileToVFS('Aptos-BoldItalic.ttf', window.APTOS_BOLDITALIC_B64); doc.addFont('Aptos-BoldItalic.ttf', FONT, 'bolditalic'); }
        const hasRealBold = !!window.APTOS_BOLD_B64;
        const hasRealItalic = !!window.APTOS_ITALIC_B64;
        const hasRealBoldItalic = !!window.APTOS_BOLDITALIC_B64;
        doc.setFont(FONT, 'normal');
        const margin = 54, pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
        const bottomLimit = pageH - margin - 16;
        const settings = App.state.app.settings;
        const ukDate = (d) => { const dt = new Date(d); return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }); };

        const drawHeader = () => {
          doc.setFont(FONT, 'normal'); doc.setFontSize(9.5); doc.setTextColor(60, 64, 74);
          const sndr = App.shared.sender(); const lines = [sndr.name, sndr.address, [sndr.phone1].filter(Boolean).join(' '), sndr.email].filter(Boolean);
          let hy = margin;
          lines.forEach((line) => { doc.text(line, pageW - margin, hy, { align: 'right' }); hy += 13; });
          doc.setTextColor(30, 34, 44);
          return hy + 14;
        };
        const drawFooter = (pageNum, totalPages) => {
          doc.setFont(FONT, 'normal'); doc.setFontSize(8.5); doc.setTextColor(140, 146, 158);
          doc.text(`${pageNum} von ${totalPages}`, margin, pageH - 24);
          doc.setTextColor(30, 34, 44);
        };
        const ensureSpace = (y, needed) => {
          if (y + needed > bottomLimit) { doc.addPage(); return drawHeader(); }
          return y;
        };
        // Renders one paragraph from an array of styled runs ({text,bold,italic,size}), wrapping
        // words onto new lines as needed — each word keeps its own run's formatting, so a
        // single bold or italic word in the middle of a normal sentence renders correctly.
        const resolveStyle = (bold, italic) => {
          if (bold && italic) return hasRealBoldItalic ? 'bolditalic' : (hasRealBold ? 'bold' : 'normal');
          if (bold) return hasRealBold ? 'bold' : 'normal';
          if (italic) return hasRealItalic ? 'italic' : 'normal';
          return 'normal';
        };
        const addRichParagraph = (y, runs, opts = {}) => {
          const defaultSize = opts.size || 11;
          const maxWidth = pageW - margin * 2;
          const words = [];
          (runs || []).forEach((run) => {
            const size = run.size || defaultSize;
            const bold = !!run.bold;
            const italic = !!run.italic;
            const underline = !!run.underline;
            String(run.text || '').split(/(\s+)/).filter((s) => s.length).forEach((part) => words.push({ text: part, bold, italic, underline, size }));
          });
          let line = []; let lineWidth = 0;
          const lineHeight = defaultSize * 1.4;
          const drawWord = (w, x, wordY) => {
            const style = resolveStyle(w.bold, w.italic);
            doc.setFont(FONT, style);
            doc.setFontSize(w.size);
            doc.text(w.text, x, wordY);
            // Synthetic bold fallback: only needed if bold was requested but no real bold face is embedded.
            if (w.bold && style === 'normal' && hasRealBold === false) doc.text(w.text, x + 0.35, wordY);
            if (w.underline && w.text.trim()) {
              const width = doc.getTextWidth(w.text);
              const underlineY = wordY + w.size * 0.09;
              doc.setDrawColor(30, 34, 44); doc.setLineWidth(Math.max(0.5, w.size * 0.045));
              doc.line(x, underlineY, x + width, underlineY);
            }
          };
          const flushLine = () => {
            if (!line.length) return;
            y = ensureSpace(y, lineHeight);
            let x = opts.align === 'center' ? (pageW - lineWidth) / 2 : margin;
            line.forEach((w) => {
              doc.setFont(FONT, resolveStyle(w.bold, w.italic)); doc.setFontSize(w.size);
              drawWord(w, x, y);
              x += doc.getTextWidth(w.text);
            });
            y += lineHeight;
            line = []; lineWidth = 0;
          };
          words.forEach((w) => {
            if (!line.length && /^\s+$/.test(w.text)) return; // no leading space at line start
            doc.setFont(FONT, resolveStyle(w.bold, w.italic));
            doc.setFontSize(w.size);
            const wWidth = doc.getTextWidth(w.text);
            if (lineWidth + wWidth > maxWidth && line.length) flushLine();
            line.push(w); lineWidth += wWidth;
          });
          flushLine();
          return y + (opts.gap ?? 8);
        };
        const singleRun = (text, opts = {}) => [{ text, bold: !!opts.bold, italic: !!opts.italic, size: opts.size }];

        // ---- Page 1 ----
        let y;
        if (plain) {
          /* Плоский документ: ни шапки отправителя, ни обращения, ни даты.
             Только заголовок, если он передан, — иначе лист начинается прямо
             с текста. */
          y = margin;
          if (opts.title && String(opts.title).trim()) {
            y = addRichParagraph(y, singleRun(String(opts.title).trim(), { bold: true, size: 12.5 }), { size: 12.5, align: 'center', gap: 18 });
          }
        } else {
          y = drawHeader();
          const suffixForSalutation = App.ui.letterTypeSuffix(event?.visitType);
          const salutationTemplate = App.ui.getSalutationFor(suffixForSalutation);
          const salutationText = App.ui.substitutePlaceholders(salutationTemplate, entry, event);
          y = addRichParagraph(y, singleRun(salutationText, { bold: true, size: 11.5 }), { size: 11.5, gap: 20 });
          doc.setFont(FONT, 'normal'); doc.setFontSize(11); doc.text(ukDate(new Date()), pageW - margin, y - 8, { align: 'right' });
          y = addRichParagraph(y, singleRun('Дорогі брати!', { bold: true }), { gap: 14 });
        }
        const bodyHtml = draftOverride ? draftOverride.bodyHtml : App.ui.substitutePlaceholders(App.ui.getLetterTemplateFor(event?.visitType), entry, event);
        App.ui.parseRichLetterBlocks(bodyHtml).forEach((block) => { y = addRichParagraph(y, block.runs, { size: 11, gap: 14 }); });
        y += 6;
        y = addRichParagraph(y, singleRun('Я вже з нетерпінням чекаю на цю зустріч і надсилаю вам теплі вітання братньої любові,'), { gap: 22 });
        y = addRichParagraph(y, singleRun(`Ваш ${App.shared.sender().name || ''}`, { bold: true }), {});

        // ---- Additional pages (configurable per visit type: add/remove in settings) ----
        const suffix = App.ui.letterTypeSuffix(event?.visitType);
        const extraPages = draftOverride ? draftOverride.pages : App.ui.docPages(suffix);
        extraPages.forEach((page) => {
          doc.addPage();
          y = plain ? margin : drawHeader();
          if (page.title && page.title.trim()) y = addRichParagraph(y, singleRun(page.title.trim(), { bold: true, size: 12.5 }), { size: 12.5, align: 'center', gap: 18 });
          const pageHtml = draftOverride ? page.html : App.ui.substitutePlaceholders(page.html || '', entry, event);
          App.ui.parseRichLetterBlocks(pageHtml).forEach((block) => { y = addRichParagraph(y, block.runs, { size: 10, gap: 10 }); });
        });

        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p += 1) { doc.setPage(p); drawFooter(p, totalPages); }
        return doc;
      },
      /**
       * Данные визита → имена общего реестра переменных.
       *
       * Модуль обязан привести своё к общим именам сам: движок
       * (shared/templates.js) не знает про `entry` и `event` и знать не должен.
       * Формат даты остаётся здесь — это свойство документа, а не движка:
       * письмо украинское независимо от языка интерфейса.
       */
      letterData(entry, event) {
        const ukDate = (d) => { const dt = new Date(d); return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }); };
        return {
          congregation: {
            name: entry?.title || event?.name || '',
            number: event?.congNumber || '',
            /* Готовая строка, а не форматирование в шаблоне: собрание без
               номера не должно оставлять в письме « ()». */
            numberSuffix: event?.congNumber ? ` (${event.congNumber})` : '',
            address: event?.address || '',
            contactName: event?.contactName || '',
            contactPhone: event?.contactPhone || '',
            contactEmail: event?.contactEmail || '',
          },
          visit: {
            startDate: ukDate(entry?.start),
            endDate: ukDate(entry?.end),
            type: event?.visitType || '',
            typeLabel: '',
          },
          doc: { today: ukDate(new Date()) },
        };
      },
      /**
       * Подстановка переменных. Раньше здесь была собственная цепочка
       * .replace() с восемью именами вида `{congregation}`; теперь это общий
       * движок, а старые имена продолжают работать через алиасы —
       * отредактированные шаблоны пользователей ломать нельзя.
       *
       * Имя и сигнатура функции сохранены: её зовут из четырёх мест модуля.
       *
       * Без движка (устаревший кэш SW) шаблон возвращается как есть —
       * плейсхолдеры останутся видимыми, что заметно сразу, в отличие от
       * письма с пустыми местами вместо дат.
       */
      substitutePlaceholders(tpl, entry, event) {
        if (!self.CWTemplates) return String(tpl || '');
        return self.CWTemplates.render(tpl, this.letterData(entry, event));
      },
      /* ═══════════════════════════════════════════════════════════════════
         АРХИВ ВЫДАННЫХ ДОКУМЕНТОВ (фаза 4 общего слоя документов)

         Снимок пишется ТОЛЬКО когда документ покинул приложение: выгрузка PDF
         письма, отправка e-mail — либо по явной кнопке в модалке письма.
         Предпросмотр, открытие модалки и правка черновика не сохраняются:
         иначе список превращается в шум из почти одинаковых записей.

         Печать календаря (`doPrint`) снимков НЕ делает намеренно: это не
         документ из шаблона, а выгрузка данных, и её место — не в архиве
         писем к собранию.

         Формуляр S-302 и график визита тоже не попадают сюда: их текст
         принадлежит словарю (i18n), а данные лежат в `entry.visitForm` —
         снимок дублировал бы их, не добавляя ничего.

         Отказ архива никогда не мешает выдаче: письмо уже собрано и уходит
         адресату, а ошибка уходит в консоль (см. CWDocs.save).
         ═══════════════════════════════════════════════════════════════════ */
      docsAvailable() { return !!(self.CWDocs && self.CWDocs.available()); },
      docRef(entry) { return { module: 'circuit-planner', entity: 'entry', id: entry?.id || '' }; },
      /** Подпись визита на момент выдачи — чтобы запись читалась и без сущности. */
      docEntityTitle(entry, event) {
        const name = entry?.title || event?.name || '';
        const when = entry?.start ? App.utils.prettyDate(entry.start) : '';
        return [name, when].filter(Boolean).join(' · ');
      },
      /**
       * Язык, на котором документ РЕАЛЬНО собран, а не запрошенный.
       * Если колонка запрошенного языка пуста, `CWTemplates` отдаёт первый
       * непустой и помечает это `pending` — в архив обязан попасть тот язык,
       * который получил адресат, иначе запись врёт (у нас уже так вышло на
       * прогоне: язык документа `en`, текст украинский).
       */
      docActualLang(kind, suffix) {
        if (this.docsReady() && self.CWTemplates) {
          const found = self.CWTemplates.text(this.docCtx(kind, suffix), this.docLang());
          if (found && found.lang) return found.lang;
        }
        return this.docLang();
      },
      /** Когда шаблон правился в последний раз — чтобы отличить версии текста. */
      docTemplateUpdatedAt(kind, suffix) {
        const tpl = this.docsReady() && self.CWTemplates ? self.CWTemplates.get(this.docId(kind, suffix)) : null;
        return (tpl && tpl.updatedAt) || null;
      },
      /** Снимок письма (PDF): основной текст + дополнительные страницы. */
      snapshotLetterDoc(entry, event, reason) {
        if (!this.docsAvailable() || !entry) return Promise.resolve(null);
        const suffix = this.letterTypeSuffix(event?.visitType);
        const pages = this.docPages(suffix).map((page) => ({
          id: page.id,
          title: page.title || '',
          html: this.substitutePlaceholders(page.html || '', entry, event),
        }));
        return self.CWDocs.save({
          templateId: this.docId('letter', suffix),
          context: this.docCtx('letter', suffix),
          title: App.utils.t('docs_kind_letter'),
          lang: this.docActualLang('letter', suffix),
          templateUpdatedAt: this.docTemplateUpdatedAt('letter', suffix),
          format: 'html',
          body: this.substitutePlaceholders(this.getLetterTemplateFor(event?.visitType), entry, event),
          pages: pages,
          ref: this.docRef(entry),
          entityTitle: this.docEntityTitle(entry, event),
          data: this.letterData(entry, event),
          reason: reason,
        });
      },
      /**
       * Снимок текста e-mail. Берётся из поля модалки, а не из шаблона: именно
       * этот текст уходит адресату, включая правки, сделанные прямо перед
       * отправкой.
       */
      snapshotEmailDoc(entry, event, reason) {
        if (!this.docsAvailable() || !entry) return Promise.resolve(null);
        const suffix = this.letterTypeSuffix(event?.visitType);
        const body = App.els.letterEmailBodyInput?.value || entry.emailBody || '';
        if (!body.trim()) return Promise.resolve(null);
        return self.CWDocs.save({
          templateId: this.docId('email', suffix),
          context: this.docCtx('email', suffix),
          title: App.utils.t('docs_kind_email'),
          lang: this.docActualLang('email', suffix),
          templateUpdatedAt: this.docTemplateUpdatedAt('email', suffix),
          format: 'text',
          subject: App.els.letterSubjectInput?.value || entry.subject || '',
          body: body,
          ref: this.docRef(entry),
          entityTitle: this.docEntityTitle(entry, event),
          data: this.letterData(entry, event),
          reason: reason,
        });
      },
      /* ─── Экран «Документы визита» ─── */
      docReasonLabel(doc) {
        const reasons = (doc.reasons && doc.reasons.length ? doc.reasons : [doc.reason]).filter(Boolean);
        const map = { print: 'docs_reason_print', send: 'docs_reason_send', manual: 'docs_reason_manual' };
        return reasons.map((r) => App.utils.t(map[r] || 'docs_reason_manual')).join(' · ');
      },
      /** Вид документа выводится из контекста — своей таблицы модуль не заводит. */
      docKindLabel(doc) {
        const ctx = String(doc.context || doc.templateId || '');
        if (/\.email$/.test(ctx)) return App.utils.t('docs_kind_email');
        if (/\.salutation$/.test(ctx)) return App.utils.t('docs_kind_salutation');
        return App.utils.t('docs_kind_letter');
      },
      docCardHtml(doc) {
        const esc = App.utils.escapeHtml;
        const when = doc.lastAt || doc.createdAt;
        const meta = [
          new Date(when).toLocaleString(App.utils.lang()),
          this.docReasonLabel(doc),
          String(doc.lang || '').toUpperCase(),
          (doc.count || 1) > 1 ? App.utils.t('docs_times', { n: doc.count }) : '',
          doc.edited ? App.utils.t('docs_edited_mark') : '',
        ].filter(Boolean).join(' · ');
        /* Текст показываем в том виде, в каком он ушёл: html — как разметку
           (она пришла из собственного редактора писем), текст — как есть. */
        const bodyHtml = doc.format === 'html'
          ? (doc.body || '')
          : `<div style="white-space:pre-wrap">${esc(doc.body || '')}</div>`;
        const pages = (doc.pages || []).map((page, i) => `<div style="margin-top:10px"><div class="small">${esc(page.title || App.utils.t('page_no', { n: i + 2 }))}</div>${page.html || ''}</div>`).join('');
        /* Тема отдельной строкой, а не `.side-row`: тот кладёт подпись слева, а
           значение прижимает вправо — в узкой модалке тема оказывалась оторвана
           от своей подписи. */
        const subject = doc.subject ? `<div style="margin-top:8px"><div class="small">${App.utils.t('letter_subject')}</div><div>${esc(doc.subject)}</div></div>` : '';
        return `<div class="send-control" style="margin-bottom:10px">
          <div class="send-control-head"><div><div class="send-control-title">${esc(this.docKindLabel(doc))}</div><div class="send-control-hint">${esc(meta)}</div></div></div>
          ${subject}
          <details style="margin-top:8px"><summary>${App.utils.t('docs_show_text')}</summary><div class="doc-snapshot" style="margin-top:8px">${bodyHtml}${pages}</div></details>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="md-btn md-btn-outlined md-state-layer" type="button" data-copy-doc="${App.utils.escapeAttr(doc.id)}">${App.utils.t('copy')}</button>
            <button class="md-btn md-btn-outlined md-state-layer" type="button" data-remove-doc="${App.utils.escapeAttr(doc.id)}">${App.utils.t('docs_delete')}</button>
          </div>
        </div>`;
      },
      /** Текст снимка для копирования: html разворачиваем в обычный текст. */
      docPlainText(doc) {
        if (doc.format !== 'html') return doc.body || '';
        const box = document.createElement('div');
        box.innerHTML = doc.body || '';
        return box.innerText || box.textContent || '';
      },
      openVisitDocsModal(itemId) {
        const item = App.data.getCalendarItemById(itemId);
        if (!item || item.source !== 'entry') return App.utils.toast(App.utils.t('letter_only_visits'));
        const entry = App.state.app.entries.find((e) => e.id === item.refId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        App.state.visitDocsEntryId = entry.id;
        if (App.els.visitDocsSub) App.els.visitDocsSub.textContent = this.docEntityTitle(entry, event) || '—';
        if (App.els.visitDocsModal) App.els.visitDocsModal.hidden = false;
        this.renderVisitDocs();
      },
      closeVisitDocsModal() {
        if (App.els.visitDocsModal) App.els.visitDocsModal.hidden = true;
        App.state.visitDocsEntryId = null;
      },
      renderVisitDocs() {
        const list = App.els.visitDocsList;
        if (!list) return;
        if (!this.docsAvailable()) {
          list.innerHTML = `<div class="md-empty">${App.utils.t('docs_storage_off')}</div>`;
          return;
        }
        const entryId = App.state.visitDocsEntryId;
        list.innerHTML = `<div class="md-empty">${App.utils.t('docs_loading')}</div>`;
        self.CWDocs.list({ module: 'circuit-planner', entity: 'entry', id: entryId }).then((rows) => {
          if (App.state.visitDocsEntryId !== entryId) return; // модалку успели переключить
          App.state.visitDocsRows = rows;
          list.innerHTML = rows.length
            ? rows.map((doc) => this.docCardHtml(doc)).join('')
            : `<div class="md-empty">${App.utils.t('docs_empty')}</div>`;
          /* Текст берём из памяти по id, а не из data-атрибута: письмо целиком
             в атрибуте — это килобайты разметки и потерянные переносы строк
             (парсер HTML нормализует их в атрибутах). */
          list.querySelectorAll('[data-copy-doc]').forEach((btn) => btn.addEventListener('click', () => {
            const doc = (App.state.visitDocsRows || []).find((d) => d.id === btn.dataset.copyDoc);
            if (!doc) return;
            const plain = App.ui.docPlainText(doc);
            const text = doc.subject ? doc.subject + '\n\n' + plain : plain;
            const done = () => App.utils.toast(App.utils.t('copied'));
            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => done());
            else done();
          }));
          list.querySelectorAll('[data-remove-doc]').forEach((btn) => btn.addEventListener('click', () => {
            if (!window.confirm(App.utils.t('docs_delete_confirm'))) return;
            self.CWDocs.remove(btn.dataset.removeDoc).then(() => {
              App.utils.toast(App.utils.t('docs_deleted'));
              App.ui.renderVisitDocs();
            });
          }));
        });
      },
      /* ═══════════════════════════════════════════════════════════════════
         КОМПОЗЕР ДОКУМЕНТОВ (фаза 5 общего слоя документов)

         Проектное требование: от карточки визита до предпросмотра — НЕ БОЛЕЕ
         ДВУХ ДЕЙСТВИЙ. Отсюда три следствия, которые нельзя «улучшать»:
           1. Кнопка «Создать документ» живёт на верхнем уровне карточки, а не
              под «⋯ Ещё» — иначе получится три клика.
           2. Язык не спрашивается: берётся из `CWDocLang`.
           3. Источник данных не выбирается: мы пришли из карточки, визит уже
              известен.

         Композер НЕ заменяет модалку письма (решение Алекса 14.08.2026):
         та про ОТПРАВКУ (почтовый метод, вложенный график, тело, привязанное к
         записи), а композер про ДОКУМЕНТ. Слияние — отдельная задача.

         Страницы письма показываются отдельными пунктами меню: памятку
         координатору иногда нужно распечатать без письма. У каждой свой
         `templateId`, поэтому в архиве они не смешиваются с письмом целиком.
         ═══════════════════════════════════════════════════════════════════ */

      /** Документы, доступные в контексте визита. Порядок = порядок в меню. */
      docMenuItems(entry, event) {
        const suffix = this.letterTypeSuffix(event?.visitType);
        const items = [
          { key: 'letter', kind: 'letter', suffix, format: 'html', name: App.utils.t('docs_kind_letter'), pdf: true },
          { key: 'email', kind: 'email', suffix, format: 'text', name: App.utils.t('docs_kind_email'), pdf: true },
        ];
        this.docPages(suffix).forEach((page, i) => {
          items.push({
            key: 'page:' + i,
            kind: 'page',
            suffix,
            pageIndex: i,
            format: 'html',
            name: page.title || App.utils.t('page_no', { n: i + 2 }),
            /* Плоский режим сборщика (14.08.2026) — страница печатается как
               самостоятельный документ, без шапки письма. */
            pdf: true,
          });
        });
        return items;
      },

      /**
       * Собрать документ: подстановка выполнена, править уже нечего.
       * Возвращает то, что уйдёт и в предпросмотр, и в PDF, и в архив —
       * ОДИН источник, иначе на бумаге окажется не то, что на экране.
       */
      buildComposerDoc(item, entry, event) {
        const suffix = item.suffix;
        if (item.kind === 'email') {
          return {
            templateId: this.docId('email', suffix),
            context: this.docCtx('email', suffix),
            subject: entry.subject || this.buildLetterSubject(entry, event),
            bodyHtml: null,
            bodyText: entry.emailBody || this.substitutePlaceholders(this.getEmailBodyFor(suffix), entry, event),
            pages: [],
          };
        }
        if (item.kind === 'page') {
          const page = this.docPages(suffix)[item.pageIndex] || {};
          return {
            /* Своя ветка id: иначе страница и письмо целиком считались бы одним
               документом и затирали друг друга при дедупликации в архиве. */
            templateId: this.docId('letter', suffix) + '/pages/' + (page.id || item.pageIndex),
            context: this.docCtx('letter', suffix) + '.page',
            subject: null,
            bodyHtml: this.substitutePlaceholders(page.html || '', entry, event),
            bodyText: null,
            pages: [],
          };
        }
        return {
          templateId: this.docId('letter', suffix),
          context: this.docCtx('letter', suffix),
          subject: null,
          bodyHtml: this.substitutePlaceholders(this.getLetterTemplateFor(event?.visitType), entry, event),
          bodyText: null,
          pages: this.docPages(suffix).map((page) => ({
            id: page.id,
            title: page.title || '',
            html: this.substitutePlaceholders(page.html || '', entry, event),
          })),
        };
      },

      /** Меню «Создать документ» под кнопкой в карточке визита. */
      toggleDocMenu(itemId, anchorBtn) {
        const box = document.getElementById('detailDocMenu');
        if (!box) return;
        if (!box.hidden) { box.hidden = true; return; }
        const item = App.data.getCalendarItemById(itemId);
        if (!item || item.source !== 'entry') return App.utils.toast(App.utils.t('letter_only_visits'));
        const entry = App.state.app.entries.find((e) => e.id === item.refId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        const items = this.docMenuItems(entry, event);
        box.innerHTML = items.map((menuItem) => `<button type="button" role="menuitem" data-doc-key="${App.utils.escapeAttr(menuItem.key)}">
            <span class="cp-docmenu-name">${App.utils.escapeHtml(menuItem.name)}</span>
            <span class="cp-docmenu-sub">${App.utils.escapeHtml(App.utils.t('docs_menu_lang', { lang: this.docLang().toUpperCase() }))}</span>
          </button>`).join('');
        box.hidden = false;
        box.querySelectorAll('[data-doc-key]').forEach((btn) => btn.addEventListener('click', (e) => {
          e.stopPropagation();
          box.hidden = true;
          App.ui.openComposer(itemId, btn.dataset.docKey);
        }));
        if (anchorBtn) anchorBtn.setAttribute('aria-expanded', 'true');
      },

      openComposer(itemId, key) {
        const item = App.data.getCalendarItemById(itemId);
        if (!item || item.source !== 'entry') return;
        const entry = App.state.app.entries.find((e) => e.id === item.refId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        const menuItem = this.docMenuItems(entry, event).find((m) => m.key === key);
        if (!menuItem) return;
        const built = this.buildComposerDoc(menuItem, entry, event);

        App.state.composer = {
          entryId: entry.id,
          key,
          item: menuItem,
          doc: built,
          edited: false,
        };

        if (App.els.composerTitle) App.els.composerTitle.textContent = menuItem.name;
        if (App.els.composerSub) {
          App.els.composerSub.textContent = `${this.docEntityTitle(entry, event)} · ${this.docActualLangFor(menuItem).toUpperCase()}`;
        }
        if (App.els.composerSubject) {
          App.els.composerSubject.hidden = !built.subject;
          App.els.composerSubject.textContent = built.subject || '';
        }
        if (App.els.composerPaperHead) {
          const head = this.composerHeadHtml(menuItem, entry, event);
          App.els.composerPaperHead.innerHTML = head;
          App.els.composerPaperHead.hidden = !head;
        }
        if (App.els.composerPaper) {
          App.els.composerPaper.contentEditable = 'false';
          App.els.composerPaper.innerHTML = built.bodyHtml !== null
            ? built.bodyHtml + (built.pages || []).map((page, i) => `<div class="cp-doc-pagebreak">${App.utils.escapeHtml(page.title || App.utils.t('page_no', { n: i + 2 }))}</div>${page.html || ''}`).join('')
            : `<div style="white-space:pre-wrap">${App.utils.escapeHtml(built.bodyText || '')}</div>`;
        }
        if (App.els.composerEditBtn) App.els.composerEditBtn.textContent = App.utils.t('docs_edit_once');
        if (App.els.composerCopySubjectBtn) App.els.composerCopySubjectBtn.hidden = !built.subject;
        if (App.els.composerPdfBtn) App.els.composerPdfBtn.hidden = !menuItem.pdf;
        this.openModal(App.els.composerModal);
      },

      /**
       * Шапка письма для предпросмотра: отправитель, обращение, дата и
       * «Дорогі брати!». Ровно то, что рисует `buildLetterPdfDoc` перед телом.
       * В редактируемое тело не входит — иначе после разовой правки шапка
       * попала бы в PDF дважды. Только письмо: у e-mail своя тема, у отдельной
       * страницы шапки нет.
       */
      composerHeadHtml(menuItem, entry, event) {
        if (menuItem.kind !== 'letter') return '';
        const esc = App.utils.escapeHtml;
        const sender = App.shared.sender();
        const lines = [sender.name, sender.address, sender.phone1, sender.email].filter(Boolean);
        const salutation = this.substitutePlaceholders(this.getSalutationFor(menuItem.suffix), entry, event);
        const today = new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
        return `<div class="cp-doc-sender">${lines.map(esc).join('\n')}</div>`
          + `<div class="cp-doc-salutation">${esc(salutation)}</div>`
          + `<div class="cp-doc-date">${esc(today)}</div>`
          + '<div class="cp-doc-salutation" style="margin-top:12px">Дорогі брати!</div>';
      },
      /** Фактический язык документа для пункта меню (см. docActualLang). */
      docActualLangFor(menuItem) {
        const kind = menuItem.kind === 'page' ? 'letter' : menuItem.kind;
        return this.docActualLang(kind, menuItem.suffix);
      },

      closeComposer() {
        this.closeModal(App.els.composerModal);
        App.state.composer = null;
      },

      /**
       * Текущее содержимое предпросмотра. После разовой правки берём из DOM:
       * именно правленый текст должен уйти и в печать, и в PDF, и в архив.
       */
      composerCurrent() {
        const state = App.state.composer;
        if (!state) return null;
        const paper = App.els.composerPaper;
        if (!state.edited || !paper) return state.doc;
        if (state.doc.bodyHtml === null) {
          return { ...state.doc, bodyText: paper.innerText || paper.textContent || '' };
        }
        /* Разовая правка склеивает письмо и его страницы в один поток — вернуть
           их обратно по страницам нельзя, не изобретая разметку-разделитель.
           Поэтому правленое письмо уходит одним куском: на бумаге разрывы
           страниц расставит сборщик PDF, а в архиве текст и так хранится
           целиком. */
        return { ...state.doc, bodyHtml: paper.innerHTML, pages: [] };
      },

      composerPlainText() {
        const doc = this.composerCurrent();
        if (!doc) return '';
        if (doc.bodyHtml === null) return doc.bodyText || '';
        const box = document.createElement('div');
        box.innerHTML = doc.bodyHtml + (doc.pages || []).map((page) => '<br>' + (page.html || '')).join('');
        return box.innerText || box.textContent || '';
      },

      /** Снимок документа из композера. `edited` отличает правленый текст. */
      snapshotComposerDoc(reason) {
        const state = App.state.composer;
        if (!state || !this.docsAvailable()) return Promise.resolve(null);
        const entry = App.state.app.entries.find((e) => e.id === state.entryId);
        if (!entry) return Promise.resolve(null);
        const event = App.data.getEventById(entry.eventId);
        const doc = this.composerCurrent();
        return self.CWDocs.save({
          templateId: state.doc.templateId,
          context: state.doc.context,
          title: state.item.name,
          lang: this.docActualLangFor(state.item),
          templateUpdatedAt: this.docTemplateUpdatedAt(state.item.kind === 'page' ? 'letter' : state.item.kind, state.item.suffix),
          format: state.doc.bodyHtml === null ? 'text' : 'html',
          subject: doc.subject,
          body: doc.bodyHtml === null ? (doc.bodyText || '') : doc.bodyHtml,
          pages: doc.pages || [],
          edited: state.edited,
          ref: this.docRef(entry),
          entityTitle: this.docEntityTitle(entry, event),
          data: this.letterData(entry, event),
          reason,
        });
      },

      /**
       * Печать одного документа. Календарь печатается через `doPrint()` и
       * стили `@media print` всего приложения — для отдельной бумаги это не
       * годится, поэтому открывается изолированное окно только с её текстом.
       */
      printComposerDoc() {
        const doc = this.composerCurrent();
        if (!doc) return;
        const state = App.state.composer;
        const head = App.els.composerPaperHead && !App.els.composerPaperHead.hidden
          ? App.els.composerPaperHead.innerHTML
          : '';
        const body = doc.bodyHtml === null
          ? `<pre>${App.utils.escapeHtml(doc.bodyText || '')}</pre>`
          : doc.bodyHtml + (doc.pages || []).map((page) => `<div class="pb"></div>${page.html || ''}`).join('');
        /* Окно, стили бумаги и задержка перед печатью — в CWPrint.document().
           Здесь остаются только те стили, которых нет больше нигде: шапка
           письма (отправитель, дата, обращение) рисуется этим модулем. */
        const ok = CWPrint.document({
          title: state.item.name,
          /* Именно ФАКТИЧЕСКИЙ язык, как в архиве: при пустой колонке перевода
             текст приезжает на первом непустом языке, и пометить страницу
             запрошенным значило бы соврать про переносы слов. */
          lang: this.docActualLangFor(state.item),
          html: `${doc.subject ? `<p><b>${App.utils.escapeHtml(doc.subject)}</b></p>` : head}${body}`,
          css: '.cp-doc-sender{text-align:right;font-size:11px;color:#556;white-space:pre-line;margin-bottom:16px}'
             + '.cp-doc-salutation{font-weight:700}'
             + '.cp-doc-date{text-align:right;font-size:11.5px;color:#556;margin-top:-14px}',
          onBlocked: () => App.utils.toast(App.utils.t('docs_print_blocked')),
        });
        if (!ok) return;
        this.snapshotComposerDoc('print');
      },

      /** PDF одного документа. Переиспользует проверенный сборщик письма. */
      pdfComposerDoc() {
        const state = App.state.composer;
        if (!state) return;
        const entry = App.state.app.entries.find((e) => e.id === state.entryId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        const doc = this.composerCurrent();
        const isLetter = state.item.kind === 'letter';
        /* Текст e-mail хранится строкой: сборщик принимает разметку, поэтому
           переносы строк превращаем в абзацы. Пустые строки схлопываем — иначе
           каждая даёт пустой абзац с полным межстрочным интервалом. */
        const bodyHtml = doc.bodyHtml !== null
          ? doc.bodyHtml
          : String(doc.bodyText || '').split(/\n/).filter((line) => line.trim())
              .map((line) => '<div>' + App.utils.escapeHtml(line) + '</div>').join('');
        const pdf = this.buildLetterPdfDoc(
          entry,
          event,
          { bodyHtml, pages: isLetter ? (doc.pages || []) : [] },
          isLetter ? null : { plain: true, title: state.item.name },
        );
        if (!pdf) return;
        const suffix = App.utils.pdfFilenameSuffix(entry, event);
        pdf.save(`${App.utils.slug(entry.title || 'document')}${suffix ? '-' + suffix : ''}-${App.utils.slug(state.item.name) || 'doc'}.pdf`);
        this.snapshotComposerDoc('print');
      },

      openLetterModal(itemId) {
        const item = App.data.getCalendarItemById(itemId);
        if (!item || item.source !== 'entry') return App.utils.toast(App.utils.t('letter_only_visits'));
        const entry = App.state.app.entries.find((e) => e.id === item.refId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        App.state.letterEntryId = entry.id;
        const suffix = this.letterTypeSuffix(event?.visitType);
        const visitLabel = { Congregation: App.utils.t('visit_congregation'), Group: App.utils.t('visit_group'), Pregroup: App.utils.t('visit_pregroup') }[suffix];
        if (App.els.letterModalSub) App.els.letterModalSub.textContent = `${entry.title || event?.name || ''} (${visitLabel}) · ${App.utils.prettyDateLong(entry.start)} — ${App.utils.prettyDateLong(entry.end)}`;
        // The email-body text is saved on the entry itself, so reopening this modal for the same
        // visit later shows what was written before. Only a brand-new (never-edited) visit falls
        // back to the type-specific default template configured in Settings.
        if (App.els.letterEmailBodyInput) {
          const defaultTemplate = App.ui.getEmailBodyFor(suffix);
          App.els.letterEmailBodyInput.value = entry.emailBody || this.substitutePlaceholders(defaultTemplate, entry, event);
        }
        if (App.els.letterSubjectInput) App.els.letterSubjectInput.value = entry.subject || this.buildLetterSubject(entry, event);
        const extraPages = App.ui.docPages(suffix);
        const totalPages = 1 + extraPages.length;
        if (App.els.letterAttachStatus) App.els.letterAttachStatus.textContent = entry.visitForm ? App.utils.t('attach_letter_and_plan', { pages: totalPages }) : App.utils.t('attach_letter_only', { pages: totalPages });
        this.openModal(App.els.letterModal);
      },
      // Fills the ORIGINAL Watchtower S-302-K form (embedded byte-for-byte, never redrawn) using its
      // real AcroForm fields — this guarantees the sent document is visually identical to the source
      // PDF, only the four blanks are filled in. Field names below are the exact (if oddly-encoded)
      // internal names confirmed by inspecting the source PDF's AcroForm — do not "clean them up".
      async buildS302Pdf(entry, event) {
        if (!window.S302_FORM_B64) { App.utils.toast(App.utils.t('s302_form_missing')); return null; }
        if (!window.PDFLib) { App.utils.toast(App.utils.t('s302_lib_missing')); return null; }
        try {
          const bytes = Uint8Array.from(atob(window.S302_FORM_B64), (c) => c.charCodeAt(0));
          const pdfDoc = await window.PDFLib.PDFDocument.load(bytes);
          // The form's own built-in field font has no Cyrillic glyphs — text typed into its fields
          // would render as blank boxes. Embed the same Aptos font used elsewhere in the app so the
          // filled-in text (Ukrainian/Russian names, dates) actually displays correctly.
          let customFont = null;
          if (window.fontkit && window.APTOS_REGULAR_B64) {
            try {
              pdfDoc.registerFontkit(window.fontkit);
              const fontBytes = Uint8Array.from(atob(window.APTOS_REGULAR_B64), (c) => c.charCodeAt(0));
              customFont = await pdfDoc.embedFont(fontBytes, { subset: true });
            } catch (err) { console.warn(App.utils.t('s302_font_failed'), err); }
          }
          const form = pdfDoc.getForm();
          const setIfExists = (fieldName, value) => {
            try {
              const field = form.getTextField(fieldName);
              field.setText(value || '');
              if (customFont) field.updateAppearances(customFont);
            } catch (err) { console.warn(App.utils.t('s302_field_missing'), fieldName, err); }
          };
          const senderName = App.shared.sender().name || '';
          const congregationName = entry.title || event?.name || '';
          const ukDate = (d) => { const dt = new Date(d); return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }); };
          const dateRange = `${ukDate(entry.start)} — ${ukDate(entry.end)}`;
          setIfExists('fill_1', congregationName);
          setIfExists('yZZSy ZWqhB.0', senderName);
          setIfExists('yZZSy ZWqhB.1.0', dateRange);
          setIfExists('yZZSy ZWqhB.1.1', senderName);
          try { form.flatten(); } catch (err) { console.warn(App.utils.t('s302_readonly_failed'), err); }
          return await pdfDoc.save();
        } catch (err) {
          console.error('S-302 fill failed', err);
          App.utils.toast(App.utils.t('s302_fill_failed'));
          return null;
        }
      },
      async sendS302(entryId) {
        const entry = App.state.app.entries.find((e) => e.id === entryId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        App.utils.toast(App.utils.t('s302_generating'));
        const bytes = await this.buildS302Pdf(entry, event);
        if (!bytes) return;
        const file = new File([bytes], `S-302-${App.utils.slug(entry.title || 'congregation')}.pdf`, { type: 'application/pdf' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file] }); } catch (err) { App.utils.downloadBlob(file, file.name); }
        } else {
          App.utils.downloadBlob(file, file.name);
        }
        if (!entry.flags) entry.flags = { f302: false, letter: false };
        entry.flags.f302 = true;
        App.store.save();
        App.ui.renderAll();
        App.ui.renderRemindersModal();
        App.utils.toast(App.utils.t('s302_done'));
      },
      async sendLetterNow() {
        const entry = App.state.app.entries.find((e) => e.id === App.state.letterEntryId);
        // Запись могла исчезнуть, пока модалка была открыта: удалили её в другой
        // вкладке (сработала кросс-вкладочная синхронизация) или сама модалка
        // осталась от предыдущего визита. Дальше по коду `entry` разыменовывался
        // без защиты (`entry.subject`) и обработчик падал с TypeError — кнопка
        // «Отправить» просто переставала отвечать, без единого сообщения.
        // Закрыть устаревшую модалку — и есть правильная обратная связь.
        if (!entry) { App.ui.closeLetterModal(); return; }
        const event = App.data.getEventById(entry.eventId);
        const text = App.els.letterEmailBodyInput?.value || '';
        const to = event?.contactEmail || '';
        const files = [];
        const filenameSuffix = App.utils.pdfFilenameSuffix(entry, event);
        try {
          const letterDoc = this.buildLetterPdfDoc(entry, event);
          if (letterDoc) files.push(new File([letterDoc.output('blob')], `${App.utils.slug(entry.title || 'letter')}${filenameSuffix ? '-' + filenameSuffix : ''}-letter.pdf`, { type: 'application/pdf' }));
        } catch (err) {
          // Раньше отказ уходил только в console.error. Дальше files оставался
          // пустым, тост про скачивание не показывался, а mailto: без
          // назначенного почтового клиента не делает ничего видимого — снаружи
          // это выглядело как «нажал и ничего не произошло».
          console.error('Letter PDF build failed', err);
          App.utils.toast(App.utils.t('letter_pdf_failed'));
        }
        if (entry?.visitForm) {
          try {
            App.state.visitFormData = JSON.parse(JSON.stringify(entry.visitForm));
            const scheduleDoc = this.buildVisitPdfDoc();
            if (scheduleDoc) files.push(new File([scheduleDoc.output('blob')], `${App.utils.slug(entry.title || 'visit')}${filenameSuffix ? '-' + filenameSuffix : ''}-schedule.pdf`, { type: 'application/pdf' }));
          } catch (err) { console.error('Schedule PDF build for sharing failed', err); }
        }
        const mailto = () => {
          const subject = App.els.letterSubjectInput?.value || entry.subject || this.buildLetterSubject(entry, event);
          if (App.state.app.settings.emailMethod === 'owa') {
            const base = App.state.app.settings.owaUrl || 'https://outlook.office.com/mail/deeplink/compose';
            const url = `${base}?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
          } else {
            window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
          }
        };
        if (navigator.share && files.length && navigator.canShare && navigator.canShare({ files })) {
          try {
            await navigator.share({ text, files });
            App.utils.toast(App.utils.t('sent_done'));
            this.snapshotLetterDoc(entry, event, 'send');
            this.snapshotEmailDoc(entry, event, 'send');
            App.ui.closeLetterModal();
            return;
          } catch (err) { /* user cancelled or unsupported — fall through to fallback below */ }
        }
        if (files.length) {
          files.forEach((f) => App.utils.downloadBlob(f, f.name));
          App.utils.toast(files.length > 1 ? App.utils.t('files_downloaded') : App.utils.t('file_downloaded'));
        }
        /* Снимок ДО закрытия модалки: текст e-mail читается из её поля. */
        this.snapshotLetterDoc(entry, event, 'send');
        this.snapshotEmailDoc(entry, event, 'send');
        mailto();
        App.ui.closeLetterModal();
      },
      closeCalendarEditor() {
        if (App.els.calendarEditor) App.els.calendarEditor.hidden = true; App.state.calendarEditingTarget = null;
      },
      renderRemindersModal() {
        const items = App.data.getUpcomingReminders();
        if (App.els.remindersModalTitle) App.els.remindersModalTitle.textContent = App.utils.t('reminders_title');
        if (App.els.remindersModalSub) App.els.remindersModalSub.textContent = App.utils.t('reminders_subtitle');
        if (!App.els.remindersModalList) return;
        if (!items.length) {
          App.els.remindersModalList.innerHTML = `<div class="md-empty">${App.utils.t('reminders_none')}</div>`;
          return;
        }
        App.els.remindersModalList.innerHTML = items.map((item) => {
          const dayLabel = item.daysUntil < 0 ? `<span class="flag-badge" style="background:#b91c1c">${App.utils.t('reminders_overdue')}</span>` : `<span class="small">${App.utils.t('reminders_days_left', { days: item.daysUntil })}</span>`;
          const s302Btn = item.needsS302 ? `<button class="md-btn md-btn-danger md-state-layer" type="button" data-mark-reminder="s302" data-entry-id="${App.utils.escapeAttr(item.id)}">${App.utils.t('reminders_mark_s302')}</button><button class="md-btn md-btn-filled md-state-layer" type="button" data-send-s302="${App.utils.escapeAttr(item.id)}">${App.utils.t('make_s302')}</button>` : '';
          const letterBtn = item.needsLetter ? `<button class="md-btn md-btn-outlined md-state-layer" type="button" data-mark-reminder="letter" data-entry-id="${App.utils.escapeAttr(item.id)}">${App.utils.t('reminders_mark_letter')}</button>` : '';
          return `<div class="md-card" style="padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
              <div><strong>${App.utils.escapeHtml(item.title)}</strong><div class="small">${App.utils.escapeHtml(App.utils.prettyDate(item.start))} — ${App.utils.escapeHtml(App.utils.prettyDate(item.end))}</div></div>
              ${dayLabel}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
              ${item.needsS302 ? `<span class="pill">${App.utils.t('reminders_s302_needed')}</span>` : ''}
              ${item.needsLetter ? `<span class="pill">${App.utils.t('reminders_letter_needed')}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${s302Btn}${letterBtn}<button class="md-btn md-btn-outlined md-state-layer" type="button" data-open-reminder-entry="${App.utils.escapeAttr(item.id)}">${App.utils.t('reminders_open_entry')}</button></div>
          </div>`;
        }).join('');
        document.querySelectorAll('[data-mark-reminder]').forEach((btn) => btn.addEventListener('click', () => {
          const entry = App.state.app.entries.find((item) => item.id === btn.dataset.entryId);
          if (entry) {
            if (!entry.flags) entry.flags = { f302: false, letter: false };
            if (btn.dataset.markReminder === 's302') entry.flags.f302 = true;
            if (btn.dataset.markReminder === 'letter') entry.flags.letter = true;
            App.store.save();
          }
          App.ui.renderRemindersModal();
          App.ui.renderAll();
        }));
        document.querySelectorAll('[data-send-s302]').forEach((btn) => btn.addEventListener('click', () => App.ui.sendS302(btn.dataset.sendS302)));
        document.querySelectorAll('[data-open-reminder-entry]').forEach((btn) => btn.addEventListener('click', () => {
          App.ui.closeRemindersModal();
          App.state.selectedScreen = 'calendar';
          App.ui.renderAll();
          App.ui.openCalendarEditorForItem(`entry:${btn.dataset.openReminderEntry}`);
        }));
      },
      openHistoryModal() {
        this.renderHistoryModal();
        this.openModal(App.els.historyModal);
      },
      renderHistoryModal() {
        if (!App.els.historyList) return;
        const history = App.store.getHistory();
        if (!history.length) {
          App.els.historyList.innerHTML = `<div class="md-empty">${App.utils.t('history_empty')}</div>`;
          return;
        }
        // Список приходит НОВЫМИ вперёд и уже с готовой сводкой: разбирать
        // блоб на каждой отрисовке больше не нужно, да и блоба здесь нет.
        App.els.historyList.innerHTML = history.map((snap) => {
          const date = new Date(snap.at);
          const label = date.toLocaleString(App.utils.lang(), { dateStyle: 'medium', timeStyle: 'short' });
          const summary = snap.meta
            ? App.utils.t('history_summary', { events: snap.meta.events, entries: snap.meta.entries })
            : '';
          return `<div class="md-card" style="padding:12px;box-shadow:none;border:1px solid var(--line)">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <div><strong>${App.utils.escapeHtml(label)}</strong><div class="small" style="color:var(--muted)">${App.utils.escapeHtml(summary)}</div></div>
              <button class="md-btn md-btn-danger md-state-layer" type="button" data-restore-snapshot="${App.utils.escapeHtml(snap.id)}">${App.utils.t('history_restore')}</button>
            </div>
          </div>`;
        }).join('');
        document.querySelectorAll('[data-restore-snapshot]').forEach((btn) => btn.addEventListener('click', () => {
          const id = btn.dataset.restoreSnapshot;
          if (!window.confirm(App.utils.t('history_restore_confirm'))) return;
          // Снимок лежит в базе — чтение асинхронно. Кнопку блокируем, чтобы
          // повторный клик не запустил второе восстановление поверх первого.
          btn.disabled = true;
          App.store.restoreSnapshot(id).then((ok) => {
            if (ok) {
              App.ui.closeModal(App.els.historyModal);
              App.ui.renderAll();
              App.utils.toast(App.utils.t('history_restored'));
            } else {
              btn.disabled = false;
              App.utils.toast(App.utils.t('history_restore_failed'));
            }
          });
        }));
      },
      /**
       * Окно выбора области удаления. `eventId === null` означает «удалить
       * все» — тогда выбор применяется ко всей пачке.
       *
       * Названия модулей берутся из ОБЩЕГО словаря напрямую: `App.utils.t()`
       * подставляет префикс `cp.`, а `module.*.title` живёт в общем слое и
       * существует на всех пяти языках.
       */
      openFillNumbersModal() {
        const { fill, conflicts } = App.data.congNumberSuggestions();
        const esc = App.utils.escapeHtml;
        if (App.els.fillNumbersSub) {
          App.els.fillNumbersSub.textContent = fill.length
            ? App.utils.t('fill_numbers_sub', { count: fill.length })
            : App.utils.t('fill_numbers_none');
        }
        if (App.els.fillNumbersApplyBtn) {
          App.els.fillNumbersApplyBtn.textContent = App.utils.t('fill_numbers_apply', { count: fill.length });
          App.els.fillNumbersApplyBtn.disabled = !fill.length;
          App.els.fillNumbersApplyBtn.style.opacity = fill.length ? '' : '.55';
        }
        if (App.els.fillNumbersBody) {
          App.els.fillNumbersBody.innerHTML = fill.map((item) => `<div class="side-row"><div class="side-label">${esc(item.name)}</div><div class="side-value small">${esc(App.utils.t('fill_numbers_row', { value: item.congNumber }))}</div></div>`)
            .concat(conflicts.map((item) => `<div class="side-row"><div class="side-label">⚠️ ${esc(item.name)}</div><div class="side-value small">${esc(App.utils.t('fill_numbers_conflict', { inName: item.inName, inField: item.inField }))}</div></div>`))
            .join('');
        }
        this.openModal(App.els.fillNumbersModal);
      },

      openEventDeleteModal({ eventId, name, modules }) {
        App.state.pendingEventDelete = { eventId, modules };
        const titles = (modules || []).map((id) => (typeof CWI18n !== 'undefined'
          ? CWI18n.t(`module.${id}.title`, null, App.utils.lang())
          : id)).join(', ');
        if (App.els.eventDeleteSub) {
          App.els.eventDeleteSub.textContent = eventId
            ? App.utils.t('delete_shared_sub', { name, modules: titles })
            : App.utils.t('delete_all_shared_sub', { modules: titles });
        }
        this.openModal(App.els.eventDeleteModal);
      },

      closeEventDeleteModal() {
        App.state.pendingEventDelete = null;
        this.closeModal(App.els.eventDeleteModal);
      },

      /** @param {'detach'|'purge'} scope */
      confirmEventDelete(scope) {
        const pending = App.state.pendingEventDelete;
        this.closeEventDeleteModal();
        if (!pending) return;
        if (pending.eventId) App.actions.performEventDelete(pending.eventId, scope);
        else App.actions.performDeleteAllEvents(scope);
      },

      openRemindersModal() {
        this.renderRemindersModal();
        if (App.els.remindersModal) App.els.remindersModal.hidden = false;
      },
      closeRemindersModal() {
        if (App.els.remindersModal) App.els.remindersModal.hidden = true;
      },
      showRemindersModalIfNeeded() {
        if (App.state.app.settings.autoShowReminders && App.data.getUpcomingReminders().length) this.openRemindersModal();
      },
      checkSixtyDayNotifications() {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const due = (App.state.app.entries || []).filter((entry) => {
          if (entry.notified60 || entry?.flags?.letter) return false;
          const event = App.data.getEventById(entry.eventId);
          if (!event?.visitType) return false;
          const start = App.utils.parseLocalDate(entry.start);
          if (!start) return false;
          const daysUntil = Math.round((start - today) / 86400000);
          return daysUntil >= 0 && daysUntil <= 60;
        });
        if (!due.length) return;
        if (due.length === 1) {
          const entry = due[0]; const event = App.data.getEventById(entry.eventId);
          App.utils.toast(App.utils.t('reminder_60days', { title: entry.title || event?.name || '' }));
        } else {
          App.utils.toast(App.utils.t('reminder_60days_many', { count: due.length }));
        }
        due.forEach((entry) => { entry.notified60 = true; });
        App.store.save();
      },
      renderEvents() {
        const query = (App.state.eventSearch || '').trim().toLowerCase();
        const colorFilter = App.state.eventColorFilter || 'all';
        const visitFilter = App.state.eventVisitFilter || 'all';
        const allEvents = App.data.allEvents();
        const colors = App.utils.uniqueBy(allEvents.map((event) => App.utils.clampColor(event.color)).filter(Boolean), (color) => color.toLowerCase());
        if (App.els.eventSearchInput) {
          App.els.eventSearchInput.placeholder = App.utils.t('events_search');
          App.els.eventSearchInput.value = App.state.eventSearch || '';
        }
        if (App.els.eventColorFilter) {
          const options = ['<option value="all">' + App.utils.t('all_event_groups') + '</option>'].concat(colors.map((color) => `<option value="${App.utils.escapeAttr(color)}">${App.utils.escapeHtml(App.utils.colorName(color))}</option>`));
          App.els.eventColorFilter.innerHTML = options.join('');
          if (colorFilter !== 'all' && !colors.some((color) => color.toLowerCase() === String(colorFilter).toLowerCase())) App.state.eventColorFilter = 'all';
          App.els.eventColorFilter.value = App.state.eventColorFilter || 'all';
          App.els.eventColorFilter.setAttribute('aria-label', App.utils.t('event_group_filter'));
        }
        if (App.els.eventVisitFilter) App.els.eventVisitFilter.value = visitFilter;
        const visibleEvents = allEvents.filter((event) => {
          const haystack = [event.name, event.address, event.schedule, App.utils.colorName(event.color)].join(' ').toLowerCase();
          const queryMatch = !query || haystack.includes(query);
          const colorMatch = App.state.eventColorFilter === 'all' || String(event.color).toLowerCase() === String(App.state.eventColorFilter).toLowerCase();
          const visitMatch = visitFilter === 'all' || (visitFilter === 'unset' ? !event.visitType : event.visitType === visitFilter);
          return queryMatch && colorMatch && visitMatch;
        }).sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), App.utils.lang()));
        if (App.els.eventsListCount) App.els.eventsListCount.textContent = App.utils.t('events_shown_count', { shown: visibleEvents.length, total: allEvents.length });
        /* Кнопка появляется, только когда заполнять действительно есть что,
           и исчезает после того, как всё заполнено: постоянный элемент, ничего
           не делающий в 99% открытий, только мешал бы. */
        if (App.els.fillCongNumbersBtn) {
          const pending = App.data.congNumberSuggestions();
          App.els.fillCongNumbersBtn.textContent = App.utils.t('fill_numbers');
          App.els.fillCongNumbersBtn.hidden = !pending.fill.length && !pending.conflicts.length;
        }
        if (App.els.deleteAllEventsBtn) {
          App.els.deleteAllEventsBtn.textContent = App.utils.t('delete_all_events');
          App.els.deleteAllEventsBtn.disabled = !allEvents.length;
          App.els.deleteAllEventsBtn.style.opacity = allEvents.length ? '' : '.55';
        }
        if (App.els.eventsList) App.els.eventsList.innerHTML = visibleEvents.map((event) => `
          <div class="event-row" data-edit-event="${App.utils.escapeAttr(event.id)}" style="cursor:pointer">
            <div>
              <strong>${App.utils.escapeHtml(event.name)}</strong>
              <div class="small">${App.utils.escapeHtml(event.schedule || App.utils.t('no_schedule'))}</div>
              <div class="small">${event.address ? `<a href="${App.utils.mapUrl(event.address)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${App.utils.escapeHtml(event.address)}</a>` : App.utils.escapeHtml(App.utils.t('no_address'))}</div>
              ${(event.contactName || event.contactPhone) ? `<div class="small">👤 ${App.utils.escapeHtml([event.contactName, event.contactPhone].filter(Boolean).join(' · '))}</div>` : ''}
            </div>
            <div style="display:grid;gap:8px;justify-items:end">
              <span class="pill"><span class="dot" style="background:${App.utils.clampColor(event.color)}"></span>${App.utils.escapeHtml(App.utils.colorName(event.color))}</span>
              ${event.visitType ? `<span class="pill">${App.utils.escapeHtml(App.utils.visitTypeLabel(event.visitType))}</span>` : `<span class="pill" style="background:#fef3c7;color:#92400e;border-color:#fde68a">⚠️ ${App.utils.escapeHtml(App.utils.t('visit_type_none'))}</span>`}
            </div>
          </div>`).join('') || `<div class="md-empty">${query || App.state.eventColorFilter !== 'all' ? App.utils.t('no_events_found') : App.utils.t('no_events_month')}</div>`;
        document.querySelectorAll('[data-edit-event]').forEach((btn) => btn.addEventListener('click', () => {
          const event = App.data.getEventById(btn.dataset.editEvent);
          App.state.editingEventId = event?.id || null;
          if (App.els.eventNameInput) App.els.eventNameInput.value = event?.name || '';
          if (App.els.eventColorInput) { App.els.eventColorInput.innerHTML = App.utils.colorOptionsHtml(event?.color || '#1f7a45'); App.els.eventColorInput.value = event?.color || '#1f7a45'; if (!App.els.eventColorInput.value) App.els.eventColorInput.selectedIndex = 0; }
          if (App.els.eventAddressInput) App.els.eventAddressInput.value = event?.address || '';
          if (App.els.eventScheduleInput) App.els.eventScheduleInput.value = event?.schedule || '';
          if (App.els.eventVisitTypeInput) App.els.eventVisitTypeInput.value = event?.visitType || '';
          App.ui.syncEventVisitFieldsVisibility();
          if (App.els.eventContactNameInput) App.els.eventContactNameInput.value = event?.contactName || '';
          if (App.els.eventContactPhoneInput) App.els.eventContactPhoneInput.value = event?.contactPhone || '';
          if (App.els.eventContactEmailInput) App.els.eventContactEmailInput.value = event?.contactEmail || '';
          if (App.els.eventContactNoteInput) App.els.eventContactNoteInput.value = event?.contactNote || '';
          if (App.els.eventCongNumberInput) App.els.eventCongNumberInput.value = event?.congNumber || '';
          App.state.editingEventCoords = (typeof event?.lat === 'number' && typeof event?.lng === 'number') ? { lat: event.lat, lng: event.lng } : null;
          App.ui.renderEventDistanceStatus();
          if (App.els.eventFormLanguageSelect) App.els.eventFormLanguageSelect.value = event?.formLanguage || '';
          App.ui.openModal(App.els.eventEditorModal);
          if (App.els.deleteEventBtn) App.els.deleteEventBtn.hidden = false;
          App.els.eventNameInput?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }));
      },

      renderSettings() { if (App.els.languageSelect) App.els.languageSelect.value = App.i18nBridge.selectValue(); if (App.els.accentSelect) App.els.accentSelect.value = App.state.app.settings.accentColor || 'purple'; if (App.els.fontSizeSelect) App.els.fontSizeSelect.value = App.state.app.settings.fontSize || '100'; const sndr = App.shared.sender(); if (App.els.senderNameInput && document.activeElement !== App.els.senderNameInput) App.els.senderNameInput.value = sndr.name; if (App.els.senderAddressInput && document.activeElement !== App.els.senderAddressInput) App.els.senderAddressInput.value = sndr.address; if (App.els.senderPhoneInput && document.activeElement !== App.els.senderPhoneInput) App.els.senderPhoneInput.value = sndr.phone1; if (App.els.senderEmailInput && document.activeElement !== App.els.senderEmailInput) App.els.senderEmailInput.value = sndr.email; if (App.els.emailMethodSelect) App.els.emailMethodSelect.value = App.state.app.settings.emailMethod || 'mailto'; if (App.els.owaUrlInput && document.activeElement !== App.els.owaUrlInput) App.els.owaUrlInput.value = App.state.app.settings.owaUrl || 'https://outlook.office.com/mail/deeplink/compose'; if (App.els.owaUrlRow) App.els.owaUrlRow.style.display = (App.state.app.settings.emailMethod === 'owa') ? '' : 'none'; if (App.els.homeAddressInput && document.activeElement !== App.els.homeAddressInput) App.els.homeAddressInput.value = App.state.app.settings.homeAddress || ''; if (App.els.homeGeocodeStatus && typeof App.state.app.settings.homeLat === 'number') App.els.homeGeocodeStatus.textContent = App.utils.t('geo_home_saved_coords', { lat: App.state.app.settings.homeLat.toFixed(3), lng: App.state.app.settings.homeLng.toFixed(3) }); if (App.els.addYearInput && !App.els.addYearInput.value) App.els.addYearInput.value = String(Math.max(...Object.keys(App.state.app.serviceYears).map(Number), App.utils.getServiceYearForDate(new Date())) + 1); if (App.els.syncStatus) { const meta = App.state.app.meta || {}; const fmt = (value) => value ? new Date(value).toLocaleString(App.utils.lang()) : ''; const parts = []; if (meta.lastSyncExportAt) parts.push(`${App.utils.t('sync_last_export')}: ${fmt(meta.lastSyncExportAt)}`); if (meta.lastSyncImportAt) parts.push(`${App.utils.t('sync_last_import')}: ${fmt(meta.lastSyncImportAt)}`); App.els.syncStatus.textContent = parts.join(' · ') || App.utils.t('sync_never'); } },
      closeMobileMenu() {
        if (App.els.appRoot) App.els.appRoot.classList.remove('menu-open');
        if (App.els.mobileOverlay) {
          App.els.mobileOverlay.hidden = true;
          App.els.mobileOverlay.classList.remove('show');
        }
        App.els.mobileMenuToggleBtn?.setAttribute('aria-expanded', 'false');
      },
      toggleMobileMenu() {
        if (!App.els.appRoot) return;
        const open = !App.els.appRoot.classList.contains('menu-open');
        App.els.appRoot.classList.toggle('menu-open', open);
        if (App.els.mobileOverlay) {
          App.els.mobileOverlay.hidden = !open;
          App.els.mobileOverlay.classList.toggle('show', open);
        }
        App.els.mobileMenuToggleBtn?.setAttribute('aria-expanded', String(open));
      }
    },

    bind() {
      App.els.resetEventBtn?.addEventListener('click', () => App.actions.resetEventForm());
      App.els.newEventBtn?.addEventListener('click', () => { App.actions.resetEventForm(); App.ui.openModal(App.els.eventEditorModal); App.els.eventNameInput?.focus(); });
      App.els.deleteEventBtn?.addEventListener('click', () => { if (App.state.editingEventId) App.actions.deleteEventTemplate(App.state.editingEventId); });
      document.querySelectorAll('.copy-btn[data-copy-input]').forEach((btn) => btn.addEventListener('click', (e) => {
        e.preventDefault();
        const input = document.getElementById(btn.dataset.copyInput);
        const text = input?.value || '';
        if (!text) return;
        const done = () => App.utils.toast(App.utils.t('copied'));
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => done());
        else done();
      }));
      App.els.eventEditorCloseBtn?.addEventListener('click', () => App.ui.closeModal(App.els.eventEditorModal));
      App.els.saveEventBtn?.addEventListener('click', () => App.actions.saveEventTemplate());
      App.els.eventSearchInput?.addEventListener('input', (e) => { App.state.eventSearch = e.target.value; App.ui.renderEvents(); });
      App.els.eventColorFilter?.addEventListener('change', (e) => { App.state.eventColorFilter = e.target.value; App.ui.renderEvents(); });
      App.els.eventVisitFilter?.addEventListener('change', (e) => { App.state.eventVisitFilter = e.target.value; App.ui.renderEvents(); });
      App.els.deleteAllEventsBtn?.addEventListener('click', () => App.actions.deleteAllEventTemplates());
      App.els.themeBtn?.addEventListener('click', () => {
        if (window.CWTheme) { App.state.app.settings.theme = window.CWTheme.toggle(); App.store.save(); return; }
        App.state.app.settings.theme = App.state.app.settings.theme === 'dark' ? 'light' : 'dark';
        App.store.save(); App.ui.renderAll();
      });
      App.els.themeSelect?.addEventListener('change', (e) => {
        App.state.app.settings.theme = e.target.value;
        App.store.save();
        if (!window.CWTheme) App.ui.renderAll();
      });
      App.els.accentSelect?.addEventListener('change', (e) => { App.state.app.settings.accentColor = e.target.value; App.store.save(); App.ui.applyAccent(); });
      App.els.fontSizeSelect?.addEventListener('change', (e) => { App.state.app.settings.fontSize = e.target.value; App.store.save(); App.ui.applyFontSize(); });
      App.els.languageSelect?.addEventListener('change', (e) => { App.i18nBridge.choose(e.target.value); });
      App.els.layoutPresetSelect?.addEventListener('change', (e) => { App.state.app.settings.layoutPreset = e.target.value; App.store.save(); App.ui.renderAll(); });
      App.els.calendarLayoutPresetSelect?.addEventListener('change', (e) => { App.state.app.settings.layoutPreset = e.target.value; App.store.save(); App.ui.renderAll(); });
      App.els.prevMonthBtn?.addEventListener('click', () => { if (App.state.calendarView === 'year') { const sy = App.utils.getServiceYearForDate(new Date(App.state.calendarYear, App.state.calendarMonth, 1)) - 1; App.state.calendarYear = sy; App.state.calendarMonth = App.config.serviceYearStartMonth; App.ui.renderCalendar(); return; } const date = new Date(App.state.calendarYear, App.state.calendarMonth - 1, 1); App.state.calendarMonth = date.getMonth(); App.state.calendarYear = date.getFullYear(); App.ui.renderCalendar(); });
      App.els.todayMonthBtn?.addEventListener('click', () => { const now = new Date(); App.state.calendarMonth = now.getMonth(); App.state.calendarYear = now.getFullYear(); App.state.calendarSelectedDateIso = App.utils.iso(now); App.ui.renderCalendar(); });
      App.els.nextMonthBtn?.addEventListener('click', () => { if (App.state.calendarView === 'year') { const sy = App.utils.getServiceYearForDate(new Date(App.state.calendarYear, App.state.calendarMonth, 1)) + 1; App.state.calendarYear = sy; App.state.calendarMonth = App.config.serviceYearStartMonth; App.ui.renderCalendar(); return; } const date = new Date(App.state.calendarYear, App.state.calendarMonth + 1, 1); App.state.calendarMonth = date.getMonth(); App.state.calendarYear = date.getFullYear(); App.ui.renderCalendar(); });
      // Mobile swipe navigation: swipe left/right over the calendar to move a month (or a whole
      // service year, in year view) — reuses the exact same prev/next button logic above.
      if (App.els.calendarGrid) {
        let touchStartX = 0, touchStartY = 0, touchStartTime = 0, touchActive = false;
        App.els.calendarGrid.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) { touchActive = false; return; }
          touchActive = true;
          touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; touchStartTime = Date.now();
        }, { passive: true });
        App.els.calendarGrid.addEventListener('touchend', (e) => {
          if (!touchActive) return;
          touchActive = false;
          const t = e.changedTouches[0];
          const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY, dt = Date.now() - touchStartTime;
          // Require a clearly horizontal, deliberate swipe so vertical scrolling and taps aren't affected.
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
            if (dx < 0) App.els.nextMonthBtn?.click(); else App.els.prevMonthBtn?.click();
          }
        }, { passive: true });
      }
      App.els.calendarYearSelect?.addEventListener('change', (e) => { App.state.calendarYear = Number(e.target.value); if (App.state.calendarView === 'year') App.state.calendarMonth = App.config.serviceYearStartMonth; App.ui.renderCalendar(); });
      App.els.toggleTeamPanelBtn?.addEventListener('click', () => { App.state.calendarView = App.state.calendarView === 'year' ? 'month' : 'year'; if (App.state.calendarView === 'year') { const now = new Date(); App.state.calendarSelectedDateIso = App.utils.iso(now); App.state.calendarYear = now.getFullYear(); App.state.calendarMonth = now.getMonth(); } App.state.app.settings.calendarView = App.state.calendarView; App.store.save(); App.ui.renderCalendar(); });
      App.els.editorCloseBtn?.addEventListener('click', () => App.ui.closeCalendarEditor());
      App.els.editorCancelBtn?.addEventListener('click', () => App.ui.closeCalendarEditor());
      App.els.editorSaveBtn?.addEventListener('click', () => App.actions.saveCalendarEditor());
      App.els.editorDeleteBtn?.addEventListener('click', () => App.actions.deleteCalendarEditorItem());
      App.els.settingsPdfBtn?.addEventListener('click', () => App.actions.openPdf());
      App.els.pdfModalCloseBtn?.addEventListener('click', () => App.actions.closePdf());
      App.els.pdfCancelBtn?.addEventListener('click', () => App.actions.closePdf());
      App.els.pdfExportConfirmBtn?.addEventListener('click', () => App.actions.doPrint());
      App.els.exportBtn?.addEventListener('click', () => { if (App.els.exportModal) App.els.exportModal.hidden = false; });
      App.els.exportModalCloseBtn?.addEventListener('click', () => { if (App.els.exportModal) App.els.exportModal.hidden = true; });
      App.els.fillCongNumbersBtn?.addEventListener('click', () => App.ui.openFillNumbersModal());
      App.els.fillNumbersCancelBtn?.addEventListener('click', () => App.ui.closeModal(App.els.fillNumbersModal));
      App.els.fillNumbersCloseBtn?.addEventListener('click', () => App.ui.closeModal(App.els.fillNumbersModal));
      App.els.fillNumbersApplyBtn?.addEventListener('click', () => {
        App.ui.closeModal(App.els.fillNumbersModal);
        App.actions.applyCongNumbers().then((count) => {
          if (count) App.utils.toast(App.utils.t('fill_numbers_done', { count }));
        });
      });
      App.els.eventDeleteHereBtn?.addEventListener('click', () => App.ui.confirmEventDelete('detach'));
      App.els.eventDeleteEverywhereBtn?.addEventListener('click', () => App.ui.confirmEventDelete('purge'));
      App.els.eventDeleteCancelBtn?.addEventListener('click', () => App.ui.closeEventDeleteModal());
      App.els.eventDeleteCloseBtn?.addEventListener('click', () => App.ui.closeEventDeleteModal());
      App.els.remindersModalCloseBtn?.addEventListener('click', () => App.ui.closeRemindersModal());
      App.els.remindersModalOkBtn?.addEventListener('click', () => App.ui.closeRemindersModal());
      document.querySelectorAll('.settings-tab').forEach((btn) => btn.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach((b) => b.classList.toggle('active', b === btn));
        const panels = { appearance: 'settingsPanelAppearance', letter: 'settingsPanelLetter', data: 'settingsPanelData' };
        Object.entries(panels).forEach(([key, id]) => { const el = document.getElementById(id); if (el) el.hidden = btn.dataset.settingsTab !== key; });
      }));
      App.els.statsBtn?.addEventListener('click', () => App.ui.openStatsModal());
      App.els.statsModalCloseBtn?.addEventListener('click', () => App.ui.closeModal(App.els.statsModal));
      App.els.statsModalOkBtn?.addEventListener('click', () => App.ui.closeModal(App.els.statsModal));
      App.els.plannerBtn?.addEventListener('click', () => App.ui.openPlannerModal());
      App.els.plannerModalCloseBtn?.addEventListener('click', () => App.ui.closeModal(App.els.plannerModal));
      App.els.plannerCancelBtn?.addEventListener('click', () => App.ui.closeModal(App.els.plannerModal));
      App.els.plannerApplyBtn?.addEventListener('click', () => App.ui.applyAutoPlan());
      App.els.pinSetupBtn?.addEventListener('click', () => App.ui.setupPin());
      App.els.holidaysToggle?.addEventListener('change', (e) => { App.state.app.settings.showHolidays = !!e.target.checked; App.store.save(); App.ui.renderAll(); });
      App.els.autoShowRemindersToggle?.addEventListener('change', (e) => { App.state.app.settings.autoShowReminders = !!e.target.checked; App.store.save(); });
      // Visit Form modal
      App.els.visitFormCloseBtn?.addEventListener('click', () => { App.ui.saveVisitFormState(); App.ui.closeModal(App.els.visitFormModal); });
      App.els.vfCloseBtn2?.addEventListener('click', () => { App.ui.saveVisitFormState(); App.ui.closeModal(App.els.visitFormModal); });
      App.els.vfVisitType?.addEventListener('change', (e) => {
        if (!App.state.visitFormData) return;
        App.state.visitFormData.visitType = e.target.value;
        App.ui.vpDefaultsForType(App.state.visitFormData, e.target.value);
        App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
      });
      App.els.vfLanguageSelect?.addEventListener('change', (e) => {
        if (!App.state.visitFormData) return;
        const oldLang = App.state.visitFormData.language;
        App.state.visitFormData.language = e.target.value;
        App.ui.retranslateVisitFormWeekdays(oldLang, e.target.value);
        App.ui.saveVisitFormState();
        App.ui.renderVisitFormLanguageReminder();
        App.ui.renderVisitFormLists();
      });
      App.els.vfNotesInput?.addEventListener('input', () => App.ui.saveVisitFormState());
      App.els.vfAddMeetingBtn?.addEventListener('click', () => {
        if (!App.state.visitFormData) return;
        App.state.visitFormData.meetings.push({ id: App.utils.uid('vm'), type: 'meetingTypeMidweek', day: '', time: '', place: '' });
        App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
      });
      App.els.vfAddDayBtn?.addEventListener('click', () => {
        if (!App.state.visitFormData) return;
        App.state.visitFormData.servicePlan.push({ id: App.utils.uid('vd'), label: App.utils.t('new_day'), rows: [{ id: App.utils.uid('vr'), time: '', place: '', partner: '', kind: '', session: '' }] });
        App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
      });
      App.els.vfAddPastoralBtn?.addEventListener('click', () => {
        if (!App.state.visitFormData) return;
        App.state.visitFormData.pastoralVisits.push({ id: App.utils.uid('vp'), name: '', day: '', time: '', partner: '', reason: '' });
        App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
      });
      App.els.vfAddMealBtn?.addEventListener('click', () => {
        if (!App.state.visitFormData) return;
        App.state.visitFormData.meals.push({ id: App.utils.uid('vm'), day: '', time: '', place: '', host: '', phone: '', note: '' });
        App.ui.saveVisitFormState(); App.ui.renderVisitFormLists();
      });
      App.els.vfGeneratePdfBtn?.addEventListener('click', () => {
        App.ui.saveVisitFormState();
        const doc = App.ui.buildVisitPdfDoc();
        if (!doc) return;
        const entry = App.state.app.entries.find((e) => e.id === App.state.visitFormEntryId);
        const event = entry ? App.data.getEventById(entry.eventId) : null;
        const suffix = App.utils.pdfFilenameSuffix(entry, event);
        doc.save(`${App.utils.slug(entry?.title || 'visit')}${suffix ? '-' + suffix : ''}.pdf`);
        App.utils.toast(App.utils.t('pdf_done'));
      });
      // Letter modal
      App.els.letterModalCloseBtn?.addEventListener('click', () => App.ui.closeLetterModal());
      /* Ручной снимок: единственный способ положить документ в архив, не
         печатая и не отправляя его. Модалка при этом не закрывается —
         человек может продолжить правку и отправить. */
      App.els.letterSnapshotBtn?.addEventListener('click', () => {
        const entry = App.state.app.entries.find((e) => e.id === App.state.letterEntryId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        Promise.all([
          App.ui.snapshotLetterDoc(entry, event, 'manual'),
          App.ui.snapshotEmailDoc(entry, event, 'manual'),
        ]).then((saved) => {
          App.utils.toast(App.utils.t(saved.some(Boolean) ? 'docs_saved' : 'docs_storage_off'));
        });
      });
      /* ─── Композер документов (фаза 5) ─── */
      App.els.composerCloseBtn?.addEventListener('click', () => App.ui.closeComposer());
      App.els.composerEditBtn?.addEventListener('click', () => {
        const state = App.state.composer;
        const paper = App.els.composerPaper;
        if (!state || !paper) return;
        const on = paper.contentEditable !== 'true';
        paper.contentEditable = on ? 'true' : 'false';
        App.els.composerEditBtn.textContent = App.utils.t(on ? 'docs_edit_done' : 'docs_edit_once');
        if (on) {
          /* Пометка ставится в момент включения правки, а не по факту различий:
             человек мог поправить и вернуть как было, но знать, что документ
             трогали руками, всё равно полезно. */
          state.edited = true;
          paper.focus();
          App.utils.toast(App.utils.t('docs_edit_hint'));
        }
      });
      App.els.composerCopySubjectBtn?.addEventListener('click', () => {
        const doc = App.ui.composerCurrent();
        if (!doc || !doc.subject) return;
        const done = () => App.utils.toast(App.utils.t('copied'));
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(doc.subject).then(done).catch(() => done());
        else done();
      });
      App.els.composerCopyTextBtn?.addEventListener('click', () => {
        const text = App.ui.composerPlainText();
        const done = () => App.utils.toast(App.utils.t('copied'));
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => done());
        else done();
      });
      App.els.composerPrintBtn?.addEventListener('click', () => App.ui.printComposerDoc());
      App.els.composerPdfBtn?.addEventListener('click', () => App.ui.pdfComposerDoc());
      App.els.composerSaveBtn?.addEventListener('click', () => {
        App.ui.snapshotComposerDoc('manual').then((saved) => {
          App.utils.toast(App.utils.t(saved ? 'docs_saved' : 'docs_storage_off'));
        });
      });
      /* Клик мимо закрывает меню документов. Слушатель один на документ, а не
         по одному на каждую перерисовку карточки. */
      document.addEventListener('click', () => {
        const menu = document.getElementById('detailDocMenu');
        if (menu && !menu.hidden) {
          menu.hidden = true;
          document.getElementById('detailCreateDocBtn')?.setAttribute('aria-expanded', 'false');
        }
      });
      App.els.visitDocsCloseBtn?.addEventListener('click', () => App.ui.closeVisitDocsModal());
      App.els.visitDocsCloseBtn2?.addEventListener('click', () => App.ui.closeVisitDocsModal());
      App.els.letterEmailBodyInput?.addEventListener('input', (e) => {
        const entry = App.state.app.entries.find((en) => en.id === App.state.letterEntryId);
        if (!entry) return;
        entry.emailBody = e.target.value;
        App.store.save();
      });
      App.els.letterSubjectInput?.addEventListener('input', (e) => {
        const entry = App.state.app.entries.find((en) => en.id === App.state.letterEntryId);
        if (!entry) return;
        entry.subject = e.target.value;
        App.store.save();
      });
      App.els.letterPreviewPdfBtn?.addEventListener('click', () => {
        const entry = App.state.app.entries.find((e) => e.id === App.state.letterEntryId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        const doc = App.ui.buildLetterPdfDoc(entry, event);
        if (!doc) return;
        const suffix = App.utils.pdfFilenameSuffix(entry, event);
        doc.save(`${App.utils.slug(entry.title || 'letter')}${suffix ? '-' + suffix : ''}-letter.pdf`);
        /* Файл сохранён на диск — с этого момента бумага существует вне
           приложения, и её текст обязан остаться неизменным. */
        App.ui.snapshotLetterDoc(entry, event, 'print');
      });
      App.els.letterEmailBodyResetToDefaultBtn?.addEventListener('click', () => {
        const entry = App.state.app.entries.find((e) => e.id === App.state.letterEntryId);
        if (!entry) return;
        const event = App.data.getEventById(entry.eventId);
        const suffix = App.ui.letterTypeSuffix(event?.visitType);
        if (!window.confirm(App.utils.t('letter_reset_confirm'))) return;
        const defaultTemplate = App.ui.getEmailBodyFor(suffix);
        const fresh = App.ui.substitutePlaceholders(defaultTemplate, entry, event);
        if (App.els.letterEmailBodyInput) App.els.letterEmailBodyInput.value = fresh;
        entry.emailBody = fresh;
        App.store.save();
        App.utils.toast(App.utils.t('letter_reset_done'));
      });
      App.els.letterAttachPdfBtn?.addEventListener('click', () => {
        const entry = App.state.app.entries.find((e) => e.id === App.state.letterEntryId);
        if (!entry?.visitForm) return App.utils.toast(App.utils.t('vf_fill_first'));
        App.state.visitFormData = JSON.parse(JSON.stringify(entry.visitForm));
        const doc = App.ui.buildVisitPdfDoc();
        if (!doc) return;
        const event = App.data.getEventById(entry.eventId);
        const suffix = App.utils.pdfFilenameSuffix(entry, event);
        doc.save(`${App.utils.slug(entry.title || 'visit')}${suffix ? '-' + suffix : ''}-schedule.pdf`);
        if (App.els.letterAttachStatus) App.els.letterAttachStatus.textContent = App.utils.t('plan_downloaded');
      });
      App.els.letterSendBtn?.addEventListener('click', () => App.ui.sendLetterNow());
      App.els.senderNameInput?.addEventListener('input', (e) => { if (typeof CWSender !== 'undefined') CWSender.set({ name: e.target.value }); else { App.state.app.settings.senderName = e.target.value; App.store.save(); } });
      App.els.geocodeEventBtn?.addEventListener('click', () => App.ui.geocodeCurrentEvent());
      App.els.eventVisitTypeInput?.addEventListener('change', () => App.ui.syncEventVisitFieldsVisibility());
      App.els.geocodeHomeBtn?.addEventListener('click', () => App.ui.geocodeHome());
      App.els.homeAddressInput?.addEventListener('input', (e) => { App.state.app.settings.homeAddress = e.target.value; App.store.save(); });
      App.els.senderAddressInput?.addEventListener('input', (e) => { if (typeof CWSender !== 'undefined') CWSender.set({ address: e.target.value }); else { App.state.app.settings.senderAddress = e.target.value; App.store.save(); } });
      App.els.senderPhoneInput?.addEventListener('input', (e) => { if (typeof CWSender !== 'undefined') CWSender.set({ phone1: e.target.value }); else { App.state.app.settings.senderPhone = e.target.value; App.store.save(); } });
      App.els.senderEmailInput?.addEventListener('input', (e) => { if (typeof CWSender !== 'undefined') CWSender.set({ email: e.target.value }); else { App.state.app.settings.senderEmail = e.target.value; App.store.save(); } });
      App.els.emailMethodSelect?.addEventListener('change', (e) => { App.state.app.settings.emailMethod = e.target.value; App.store.save(); if (App.els.owaUrlRow) App.els.owaUrlRow.style.display = e.target.value === 'owa' ? '' : 'none'; });
      App.els.owaUrlInput?.addEventListener('input', (e) => { App.state.app.settings.owaUrl = e.target.value; App.store.save(); });
      App.els.previewLetterPdfBtn?.addEventListener('click', () => {
        const type = App.state.letterEditingType || 'Congregation';
        const visitTypeMap = { Congregation: 'congregation', Group: 'group', Pregroup: 'pregroup' };
        const sampleEvent = { id: 'preview', name: 'Приклад — ' + { Congregation: 'Собрание', Group: 'Группа', Pregroup: 'Предгруппа' }[type], visitType: visitTypeMap[type], congNumber: '00000', address: '', schedule: '' };
        const today = new Date();
        const end = new Date(today); end.setDate(end.getDate() + 5);
        const sampleEntry = { id: 'preview', title: sampleEvent.name, start: App.utils.iso(today), end: App.utils.iso(end), note: '' };
        const doc = App.ui.buildLetterPdfDoc(sampleEntry, sampleEvent);
        if (!doc) return;
        try {
          const url = doc.output('bloburl');
          window.open(url, '_blank');
        } catch (err) {
          console.error('Preview failed, falling back to download', err);
          doc.save('preview-letter.pdf');
        }
      });
      App.els.countdownUnitSelect?.addEventListener('change', (e) => { App.state.countdownUnit = e.target.value; App.ui.renderAll(); });
      App.els.checkRemindersBtnMain?.addEventListener('click', () => App.ui.openRemindersModal());
      App.els.openHistoryBtn?.addEventListener('click', () => App.ui.openHistoryModal());
      document.addEventListener('click', (e) => {
        const openDetails = document.querySelector('.toolbar-more[open]');
        if (!openDetails) return;
        if (!openDetails.contains(e.target) || e.target.closest('.toolbar-more-panel')) openDetails.removeAttribute('open');
      });
      App.els.historyModalCloseBtn?.addEventListener('click', () => App.ui.closeModal(App.els.historyModal));
      App.els.historyModalCloseBtn2?.addEventListener('click', () => App.ui.closeModal(App.els.historyModal));
      App.els.exportCancelBtn?.addEventListener('click', () => { if (App.els.exportModal) App.els.exportModal.hidden = true; });
      App.els.exportConfirmBtn?.addEventListener('click', () => { if (App.state.exportType === 'ics') App.actions.exportIcs(); else App.actions.exportJson(); if (App.els.exportModal) App.els.exportModal.hidden = true; });
      App.els.syncExportBtn?.addEventListener('click', () => App.actions.exportSyncFile());
      App.els.syncImportInput?.addEventListener('change', (e) => App.actions.importSyncFile(e.target.files?.[0] || null));
      document.querySelectorAll('[data-export-type]').forEach((btn) => btn.addEventListener('click', () => { App.state.exportType = btn.dataset.exportType; document.querySelectorAll('[data-export-type]').forEach((node) => node.classList.toggle('active', node === btn)); if (App.els.exportRangeCard) App.els.exportRangeCard.style.display = App.state.exportType === 'ics' ? 'block' : 'none'; }));
      document.querySelectorAll('[data-pdf-type]').forEach((btn) => btn.addEventListener('click', () => { App.state.pdfExportType = btn.dataset.pdfType; document.querySelectorAll('[data-pdf-type]').forEach((node) => node.classList.toggle('active', node === btn)); if (App.els.pdfRangeCard) App.els.pdfRangeCard.style.display = ['custom-range-calendar','custom-range'].includes(App.state.pdfExportType) ? 'block' : 'none'; }));
      App.els.backupBtn?.addEventListener('click', () => App.actions.exportJson());
      App.els.importInput?.addEventListener('change', (e) => App.actions.importJson(e.target.files?.[0] || null));
      App.els.resetAppBtn?.addEventListener('click', () => { if (window.confirm(App.utils.t('reset_confirm'))) App.actions.resetApp(); });
      App.els.mobileMenuToggleBtn?.addEventListener('click', () => App.ui.toggleMobileMenu());
      App.els.mobileOverlay?.addEventListener('click', () => App.ui.closeMobileMenu());
      // sidebarClickStopper: prevent overlay/pointer issues on small screens
      document.querySelector('.sidebar')?.addEventListener('click', (e) => { e.stopPropagation(); });
      // Tap-outside-to-close for the mobile drawer menu (the dimmed backdrop element
      // is intentionally kept disabled elsewhere, so this is the actual dismiss mechanism).
      document.addEventListener('click', (e) => {
        if (!App.els.appRoot?.classList.contains('menu-open')) return;
        if (e.target.closest('.sidebar') || e.target.closest('#mobileMenuToggleBtn')) return;
        App.ui.closeMobileMenu();
      });
 document.addEventListener('click', (e) => { const popover = document.getElementById('dayPopover'); if (!popover || popover.hidden) return; if (popover.contains(e.target) || e.target.closest('.sy-day')) return; App.ui.hideDayPopover(true); });
      App.els.addYearBtn?.addEventListener('click', () => { if (App.data.addServiceYear(Number(App.els.addYearInput?.value))) App.ui.renderAll(); });
      App.els.addNextYearBtn?.addEventListener('click', () => { const years = Object.keys(App.state.app.serviceYears).map(Number); const nextYear = (years.length ? Math.max(...years) : App.utils.getServiceYearForDate(new Date())) + 1; if (App.data.addServiceYear(nextYear)) { if (App.els.addYearInput) App.els.addYearInput.value = String(nextYear + 1); App.ui.renderAll(); } });
      window.addEventListener('online', () => App.els.offlineBanner?.classList.remove('show'));
      window.addEventListener('offline', () => App.els.offlineBanner?.classList.add('show'));
      if (!navigator.onLine) App.els.offlineBanner?.classList.add('show');
      window.addEventListener('pageshow', () => { App.ui.closeMobileMenu(); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) App.ui.closeMobileMenu(); });
      window.addEventListener('orientationchange', () => { App.ui.closeMobileMenu(); });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => App.ui.fixBottomNavViewport());
        window.visualViewport.addEventListener('scroll', () => App.ui.fixBottomNavViewport());
      }
      window.addEventListener('resize', () => App.ui.fixBottomNavViewport());
      window.addEventListener('resize', () => App.ui.measureTopbarHeight());
      App.state.wasAboveTwoMonthBreakpoint = window.innerWidth >= (App.config.twoMonthBreakpoint || 1700);
      window.addEventListener('resize', () => {
        const isAbove = window.innerWidth >= (App.config.twoMonthBreakpoint || 1700);
        if (isAbove !== App.state.wasAboveTwoMonthBreakpoint) {
          App.state.wasAboveTwoMonthBreakpoint = isAbove;
          if (App.state.calendarView !== 'year' && App.state.selectedScreen === 'calendar') App.ui.renderCalendar();
        }
      });
      // Universal: clicking the dimmed backdrop (outside .modal-card) closes any modal.
      document.querySelectorAll('.modal').forEach((modal) => modal.addEventListener('click', (e) => {
        if (e.target !== modal) return;
        if (modal === App.els.letterModal) App.ui.closeLetterModal();
        else modal.hidden = true;
      }));
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { App.ui.hideDayPopover(true); App.ui.closeCalendarEditor(); App.ui.closeModal(App.els.eventEditorModal); App.ui.closeModal(App.els.visitFormModal); App.ui.closeLetterModal(); App.ui.closeModal(App.els.historyModal); App.actions.closePdf(); if (App.els.exportModal) App.els.exportModal.hidden = true; App.ui.closeMobileMenu(); } });
    },

    /* --- Мост к общей локализации хаба (shared/i18n.js) --------------------
       Модуль ПРОДОЛЖАЕТ хранить свой язык там же, где хранил всегда —
       в App.state.app.settings.language внутри собственного блоба данных.
       Мост лишь синхронизирует его с общим ключом 'cw-lang:circuit-planner'
       и языком хаба 'cw-lang'.

       Почему так, а не «просто читать язык хаба»: отличить «пользователь
       осознанно выбрал русский» от «русский стоял по умолчанию» в старых
       данных невозможно. Поэтому при первом запуске после обновления
       существующая установка ЗАСЕИВАЕТ свой текущий язык как локальный
       выбор — пользователь не увидит вообще никаких изменений. Наследование
       от хаба включается только для новых установок и для тех, кто сам
       выберет «Как в Circuit Workspace».

       Немецкий включён 18.08.2026 (решение Алекса) и в тот же день закрыт
       полностью допником №2. Словарь i18n/dict.js носитель закрыл сразу, но
       у модуля есть ещё ЧЕТЫРЕ инлайновые языковые таблицы прямо в этом
       файле, и немецкого блока не было ни в одной — живой прогон показал
       «Август 2026» и «Зелёный» посреди немецкого экрана. Две из четырёх
       закрыты без перевода: месяцы и дни недели берутся из Intl, когда своей
       таблицы нет (см. utils.monthName и utils.dayNames). Две оставшиеся
       закрыты текстом носителя (допник №2, 62 строки):
         • utils.colorName — 16 названий цветов (подпись цвета в списке);
         • VP_I18N_DICTS — 46 строк формуляра визита (печатный документ).
       Тем же релизом немецкая опция добавлена в оба селекта ЯЗЫКА ДОКУМЕНТА
       (#eventFormLanguageSelect, #vfLanguageSelect): до допника её там не
       было намеренно — опция врала бы о результате.
       Эти таблицы не попали в таблицу переводов, потому что лежат в app.js,
       а не в i18n/dict.js — сверка полноты шла по словарям. Урок общий: перед
       объявлением языка готовым искать в КОДЕ модуля объекты, у которых
       ключами стоят коды языков, а не сверяться только по i18n/. */
    /* Отправитель и язык документа живут в общем слое хаба, а не в данных
       модуля: те же имя/адрес/телефон печатают Конгрессы и Назначения, и до
       общего слоя их приходилось вводить в каждом модуле заново. */
    shared: {
      sender() {
        if (typeof CWSender !== 'undefined') return CWSender.get();
        const s = App.state.app.settings;   // модуль открыт без общего слоя
        return { name: s.senderName || '', code: '', address: s.senderAddress || '',
                 phone1: s.senderPhone || '', phone2: '', email: s.senderEmail || '' };
      },
      // Язык ДОКУМЕНТА. Раньше формуляр и письмо шли за языком интерфейса —
      // теперь это независимая настройка: можно работать в польском
      // интерфейсе и печатать украинский формуляр.
      docLang() {
        if (typeof CWDocLang !== 'undefined') return CWDocLang.get();
        return App.state.app.settings.language || 'ru';
      },
      /**
       * Общий справочник собраний (фаза 5, шаг 3 — 16.08.2026).
       *
       * Модуль пишет в ДВА места: `app.events[]` остаётся единственным
       * источником ЧТЕНИЯ, а сюда уходит зеркало идентификации. Именно это
       * делает шаг обратимым: перестать зеркалить — и ничего не сломается.
       *
       * ⚠️ ГРАНИЦА: наверх уходят только название, номер, адрес, контакт и
       * координаты. `color`, `schedule`, `visitType`, `formLanguage`
       * остаются здесь — это про календарь, а не про собрание
       * (решение Алекса 16.08.2026, разбор в docs/db-migration/02-*.md).
       * Слой отбрасывает лишние поля и сам, но передавать их незачем.
       *
       * Отказ записи НЕ мешает работе модуля: собрание уже сохранено у себя,
       * ронять правку из-за общего слоя нельзя. То же правило, что у
       * CWDocs.save() и CWSnapshots.add().
       */
      directory: {
        MODULE: 'circuit-planner',

        ready() { return typeof CWDirectory !== 'undefined' && typeof CWDB !== 'undefined'; },

        /** Только поля идентификации — остальное принадлежит модулю. */
        identity(event) {
          if (!event || !event.id) return null;
          return {
            id: event.id,
            name: event.name || '',
            congNumber: event.congNumber || '',
            address: event.address || '',
            contactName: event.contactName || '',
            contactPhone: event.contactPhone || '',
            contactEmail: event.contactEmail || '',
            contactNote: event.contactNote || '',
            lat: typeof event.lat === 'number' ? event.lat : null,
            lng: typeof event.lng === 'number' ? event.lng : null,
          };
        },

        /**
         * Объединённое представление: поля модуля плюс идентификация из
         * справочника. Справочник не прочитан или записи нет — модуль
         * работает ровно как раньше, на собственных полях. Это и есть
         * страховка шага 4а: общий слой не приехал в офлайн-кэше старой
         * версии → ничего не пропало и ничего не сломалось.
         *
         * Пустое название из справочника НЕ принимается: пустая карточка —
         * это сбой, а не переименование, и стирать ею живое имя нельзя.
         *
         * Координаты берутся из справочника БЕЗУСЛОВНО, вместе с адресом:
         * они его машинная форма. Взять адрес наверху, а координаты снизу —
         * ровно тот рассинхрон, ради устранения которого справочник заведён.
         */
        merge(event) {
          const own = Object.assign({}, event);
          if (!this.ready() || !CWDirectory.ready || !own.id) return own;
          const record = CWDirectory.get(own.id);
          if (!record || !String(record.name || '').trim()) return own;
          CWDirectory.FIELDS.forEach((field) => { own[field] = record[field] == null ? '' : record[field]; });
          own.lat = typeof record.lat === 'number' ? record.lat : null;
          own.lng = typeof record.lng === 'number' ? record.lng : null;
          return own;
        },

        /**
         * Принять живое изменение справочника в записи модуля.
         *
         * Почему принимаем, а не читаем на лету: события уходят в экспорт,
         * в снимки истории и в офлайн. Оставить там устаревшее имя значило
         * бы получить его обратно при восстановлении копии — бесшумно.
         * Плюс это и есть путь ОТКАТА шага 4а: пока идентификация лежит и в
         * модуле, зеркало можно снять без потерь.
         *
         * Вместе с названием едет починка заголовков записей — иначе
         * переименование извне оставило бы старое имя в письмах и
         * формулярах. Порядок важен: чиним ДО того, как затрём `event.name`.
         *
         * ⚠️ На СТАРТЕ расхождение по-прежнему решается в пользу модуля
         * (`seed()`, как в шаге 3), и менять это здесь нельзя. Второго
         * пишущего модуля ещё нет, а политика слияния — предмет шага 6;
         * принять её побочным эффектом этого шага значило бы решить молча.
         *
         * @returns {boolean} менялось ли что-нибудь
         */
        absorb() {
          if (!this.ready() || !CWDirectory.ready) return false;
          const events = App.state.app && App.state.app.events ? App.state.app.events : [];
          let changed = false;
          events.forEach((event) => {
            const record = CWDirectory.get(event.id);
            if (!record || !String(record.name || '').trim()) return;
            if (record.name !== event.name) {
              App.data.renameEntryTitles(event.id, event.name, record.name);
              changed = true;
            }
            CWDirectory.FIELDS.forEach((field) => {
              const value = record[field] == null ? '' : record[field];
              if (event[field] !== value) { event[field] = value; changed = true; }
            });
            const lat = typeof record.lat === 'number' ? record.lat : null;
            const lng = typeof record.lng === 'number' ? record.lng : null;
            if (event.lat !== lat) { event.lat = lat; changed = true; }
            if (event.lng !== lng) { event.lng = lng; changed = true; }
          });
          return changed;
        },

        /**
         * Подписка на справочник. Ставится один раз, после досеивания.
         * Собственная запись расхождения не даёт (`events[]` уже обновлён к
         * моменту зеркалирования), поэтому лишней перерисовки не будет.
         */
        watch() {
          if (!this.ready() || this._watching) return;
          this._watching = true;
          CWDirectory.onChange(() => {
            if (!this.absorb()) return;
            App.store.save();
            App.ui.renderAll();
          });
        },

        /** Создать/обновить запись справочника по событию модуля. */
        mirror(event) {
          if (!this.ready()) return;
          const payload = this.identity(event);
          if (!payload) return;
          Promise.resolve(CWDirectory.upsert(payload, this.MODULE))
            .catch((err) => console.error('CWDirectory: зеркало собрания не записалось', err));
        },

        /**
         * Какие ЕЩЁ модули знают эту карточку. Пустой список — удаление
         * никого не задевает и спрашивать не о чем.
         *
         * До появления второго ПИШУЩЕГО модуля список всегда пуст: Конгрессы
         * справочник только читают и в `sources[]` не попадают. Поэтому окно
         * выбора сегодня не показывается ни разу — оно готово к шагу 6, где
         * станет обязательным.
         */
        otherSources(eventId) {
          if (!this.ready() || !CWDirectory.ready || !eventId) return [];
          const record = CWDirectory.get(eventId);
          return ((record && record.sources) || []).filter((item) => item !== this.MODULE);
        },

        /**
         * Стереть карточку целиком, вместе со ссылками соседей.
         *
         * Реализовано через тот же `detach()`, а не в обход слоя: политика
         * «запись исчезает, когда её не знает никто» остаётся ОДНА, а «удалить
         * везде» выражается как «отвязать всех». Обход слоя завёл бы вторую
         * политику удаления, и они разошлись бы при первой же правке.
         *
         * Отвязка идёт последовательно: `detach()` читает состояние из кэша,
         * который обновляется после каждой записи.
         */
        purge(eventId) {
          if (!this.ready() || !eventId) return Promise.resolve(null);
          const record = CWDirectory.ready ? CWDirectory.get(eventId) : null;
          const sources = (record && record.sources) ? record.sources.slice() : [];
          if (sources.indexOf(this.MODULE) < 0) sources.push(this.MODULE);
          return sources.reduce(
            (chain, moduleId) => chain.then(() => CWDirectory.detach(eventId, moduleId)),
            Promise.resolve()
          ).catch((err) => { console.error('CWDirectory: полное удаление не удалось', err); return null; });
        },

        /**
         * Событие удалено в модуле. Запись справочника стирается целиком
         * только если её больше не знает ни один модуль — иначе удаление
         * здесь унесло бы собрание из-под ссылок соседа.
         */
        forget(eventId) {
          if (!this.ready() || !eventId) return;
          Promise.resolve(CWDirectory.detach(eventId, this.MODULE))
            .catch((err) => console.error('CWDirectory: отвязка собрания не удалась', err));
        },

        /**
         * Разовое досеивание при старте: события, которых в справочнике ещё
         * нет или чья идентификация разошлась, уезжают наверх.
         *
         * Идемпотентно и дёшево: сравнение идёт по памяти, запись — только
         * при реальном расхождении. Отдельной «миграции» поэтому не нужно,
         * а повторный запуск во второй вкладке не плодит дублей — ключ
         * записи равен `id` события.
         */
        seed() {
          if (!this.ready() || !CWDirectory.ready) return;
          const events = App.state.app?.events || [];
          events.forEach((event) => {
            const payload = this.identity(event);
            if (!payload) return;
            const existing = CWDirectory.get(event.id);
            if (existing) {
              const same = Object.keys(payload).every((key) => (existing[key] ?? '') === (payload[key] ?? ''));
              const known = (existing.sources || []).indexOf(this.MODULE) >= 0;
              if (same && known) return;
            }
            this.mirror(event);
          });
        },
      },

      // Разовый перенос своих данных в общий слой. CWSender.adopt() запишет
      // их, только если общая запись ещё пуста, поэтому порядок открытия
      // модулей не важен и повторный вызов безвреден.
      adopt() {
        const s = App.state.app.settings;
        if (typeof CWSender !== 'undefined') {
          const taken = CWSender.adopt({ name: s.senderName, address: s.senderAddress,
                                         phone1: s.senderPhone, email: s.senderEmail });
          if (taken) { delete s.senderName; delete s.senderAddress; delete s.senderPhone; delete s.senderEmail; App.store.save(); }
          CWSender.onChange(() => App.ui.renderSettings());
        }
        if (typeof CWDocLang !== 'undefined') {
          // Языки, на которых модуль умеет выпускать документы: тема письма
          // существует на пяти, формуляр визита — на ru/uk (остальные
          // visit-pdf сводит к ru сам).
          CWDocLang.init({ module: 'circuit-planner', langs: ['uk', 'ru', 'en', 'pl', 'de'], apply: false });
          // Прежнее поведение — документ шёл за языком интерфейса. Засеиваем
          // им общий язык документа, чтобы обновление ничего не переключило.
          CWDocLang.adopt(App.state.app.settings.language);
        }
        // Справочник уже прочитан загрузчиком внизу файла, поэтому досеивание
        // может опираться на синхронный CWDirectory.get().
        App.shared.directory.seed();
        // Подписка ставится ПОСЛЕ досеивания: иначе собственные записи seed()
        // немедленно вернулись бы обратно через absorb() лишней перерисовкой.
        App.shared.directory.watch();
      },
    },

    i18nBridge: {
      MODULE: 'circuit-planner',
      HUB_VALUE: '__hub',
      SUPPORTED: ['ru', 'uk', 'en', 'pl', 'de'],
      // Отображение «нет такого языка → ближайший» осталось как механизм:
      // сейчас все пять языков экосистемы поддержаны и карта пуста, но
      // появится шестой — подхватится здесь, не трогая toSupported().
      NEAREST: {},
      _busy: false,

      // shared/i18n.js может быть не подключён (например, модуль открыт
      // отдельно от монорепо) — тогда всё работает ровно как раньше.
      ready() { return typeof CWI18n !== 'undefined'; },

      toSupported(lang) {
        const code = this.NEAREST[lang] || lang;
        return this.SUPPORTED.includes(code) ? code : 'ru';
      },

      adopt() {
        if (!this.ready()) return;
        // apply:false — разметка модуля пока без data-i18n, перевод делает
        // собственный renderAll(); от общего слоя нужно только разрешение языка.
        CWI18n.init({ module: this.MODULE, apply: false });
        const settings = App.state.app.settings;
        const hadSavedData = !!App.store.lastWrittenPayload;

        if (!CWI18n.isInherited()) {
          settings.language = this.toSupported(CWI18n.getLang());
        } else if (hadSavedData) {
          CWI18n.setLang(settings.language || 'ru', { scope: 'module' });
        } else {
          settings.language = this.toSupported(CWI18n.getHubLang());
        }
        document.documentElement.lang = settings.language;

        // Сменили язык в хабе в соседней вкладке — модуль без своего выбора
        // должен перестроиться сам.
        CWI18n.onChange(() => {
          if (this._busy || !CWI18n.isInherited()) return;
          const next = this.toSupported(CWI18n.getLang());
          if (next === App.state.app.settings.language) return;
          App.state.app.settings.language = next;
          document.documentElement.lang = next;
          App.store.save();
          App.ui.renderAll();
        });
      },

      // Выбор в селекте настроек: конкретный язык или «как в хабе».
      choose(value) {
        const settings = App.state.app.settings;
        this._busy = true;
        try {
          if (value === this.HUB_VALUE) {
            if (this.ready()) { CWI18n.resetToHub(); settings.language = this.toSupported(CWI18n.getLang()); }
          } else {
            settings.language = value;
            if (this.ready()) CWI18n.setLang(value, { scope: 'module' });
          }
        } finally { this._busy = false; }
        document.documentElement.lang = settings.language;
        App.store.save();
        App.ui.renderAll();
      },

      selectValue() {
        return (this.ready() && CWI18n.isInherited()) ? this.HUB_VALUE : (App.state.app.settings.language || 'ru');
      },
    },

    init() {
      this.ui.cacheElements();
      this.store.load();
      // Сразу после load(): язык нужен раньше первого renderAll(), а
      // store.lastWrittenPayload здесь ещё показывает, была ли установка новой.
      this.i18nBridge.adopt();
      this.shared.adopt();
      const currentSY = this.utils.getServiceYearForDate(new Date());
      this.data.ensureServiceYear(currentSY);
      this.data.getWeeksForYear(currentSY);
      this.state.selectedYear = currentSY;
      // Support the PWA manifest's "shortcuts" (long-press app icon → jump straight to a screen).
      const validScreens = this.config.navItems.map((n) => n.id);
      const hashScreen = (window.location.hash || '').replace('#', '').split('?')[0];
      if (validScreens.includes(hashScreen)) this.state.selectedScreen = hashScreen;
      this.state.teamPanelHidden = false;
      this.state.calendarView = this.state.app.settings.calendarView || 'month';
      this.state.app.settings.showTeamPanel = true;
      if (!this.state.app.settings.fontSize) this.state.app.settings.fontSize = '100';
      try { if (!this.state.app.settings.accentColor) this.state.app.settings.accentColor = localStorage.getItem('service-year-planner-accent') || 'purple'; } catch (_) { if (!this.state.app.settings.accentColor) this.state.app.settings.accentColor = 'purple'; }
      this.ui.closeMobileMenu();
      this.ui.renderAll();
      this.bind();
      this.ui.closeMobileMenu();
      this.ui.showPinGateIfNeeded();
      this.ui.showRemindersModalIfNeeded();
      this.ui.checkSixtyDayNotifications();
      this.ui.checkAutoBackupReminder();
      // Safety net: persist when the app is about to be hidden/closed/reloaded, in case some
      // future code path ever mutates state without calling store.save() itself. Guarded by
      // saveIfOwnStateIsCurrent() so it can never clobber newer data written by another tab —
      // blindly writing here caused real data loss when the app was open in two tabs.
      //
      // С фазы 1 эти три обработчика вешает общий слой (shared/persist.js) —
      // там же, где живёт отложенная запись, иначе страховка и очередь
      // разъехались бы. Здесь остался только запасной путь на случай, когда
      // общий файл не подключился.
      if (!App.store.persist()) {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') App.store.saveIfOwnStateIsCurrent(); });
        window.addEventListener('pagehide', () => App.store.saveIfOwnStateIsCurrent());
        window.addEventListener('beforeunload', () => App.store.saveIfOwnStateIsCurrent());
      }
      // Keep tabs in sync: if another tab saves, adopt its data instead of holding stale state
      // that a later save from this tab would write back over the top of.
      /* Соседняя вкладка, вариант с общей базой. Запись в IndexedDB события
         `storage` не порождает — приходит только маячок, а состояние
         перечитывается из базы. Без этого синхронизация вкладок пропала бы
         молча: в одной вкладке всё работает, в двух данные расходятся, и
         никакой ошибки нигде. */
      if (App.store.source === 'db') {
        App.store.remote.onForeign((payload) => {
          const p = App.store.persist();
          if (p && p.pending()) { App.store.flushNow('conflict'); return; }
          try {
            App.state.app = App.store.migrate(JSON.parse(payload));
            App.store.lastWrittenPayload = payload;
            App.ui.renderAll();
          } catch (err) { console.error('Cross-tab sync failed', err); }
        });
      }
      window.addEventListener('storage', (e) => {
        if (App.store.source === 'db') return;   // синхронизацию ведёт CWState
        if (e.key !== App.config.storageKey || !e.newValue) return;
        /* Отложенная запись открыла окно, которого раньше не было: в очереди
           может лежать правка, которую человек только что сделал в ЭТОЙ
           вкладке. Принять чужое состояние значило бы стереть её молча, прямо
           под курсором. Поэтому сначала записываем своё, а чужое пропускаем —
           соседняя вкладка получит нашу запись тем же событием и подхватит её.
           Симметрично и без тихой потери на активной вкладке. */
        const p = App.store.persist();
        if (p && p.pending()) { App.store.flushNow('conflict'); return; }
        try {
          App.state.app = App.store.migrate(JSON.parse(e.newValue));
          App.store.lastWrittenPayload = e.newValue;
          App.ui.renderAll();
        } catch (err) { console.error('Cross-tab sync failed', err); }
      });
      // Регистрация SW и обновления — в общем слое (shared/update.js). Здесь
      // раньше жила собственная копия этой логики, и она перезагружала страницу
      // молча и немедленно: обновление могло прилететь посреди заполнения
      // формуляра визита. Теперь решение за пользователем — полоса внизу экрана.
      if (typeof CWUpdate !== 'undefined') CWUpdate.init({ swUrl: './sw.js' });
      /* Тексты писем живут в общем хранилище (фаза 2б). Чтение асинхронное, но
         запуск модуля его НЕ ждёт: пока хранилище не готово, слой доступа
         читает настройки, поэтому письмо в этот момент всё равно собирается
         верным текстом. Перенос идёт сразу после готовности и только один раз;
         после него настройки перерисовываются, если они открыты. */
      if (self.CWTemplates && self.CWTemplates.init) {
        self.CWTemplates.init()
          .then(() => App.ui.adoptDocuments())
          .then((moved) => { if (moved) App.ui.renderSettings(); })
          .catch((error) => console.error('Клиндарий: хранилище шаблонов недоступно', error));
      }
    }
  };

  window.App = App;
  
const hideMonthSummaryDotsStyle = document.createElement('style');
hideMonthSummaryDotsStyle.textContent = '.sy-month-summary{display:none !important}';
document.head.appendChild(hideMonthSummaryDotsStyle);
/* Запуск ждёт общую базу: `store.load()` синхронна и должна получить данные
   сразу, а чтение IndexedDB асинхронно. Ожидание ограничено сроком внутри
   `CWState` — если база недоступна или её обновление заблокировано соседней
   вкладкой со старой версией, модуль стартует на прежнем ключе, а не остаётся
   не открытым вовсе. Промис не отклоняется никогда. */
if (self.CWState && self.CWDB) {
  App.store.remote = self.CWState.create('circuit-planner');
  /* История контрольных точек (фаза 4) поднимается ВМЕСТЕ с состоянием, а не
     после `App.init()`: `store.load()` может тут же снять снимок перед
     переносом, а `writeNow()` — спросить у истории время последней точки.
     Оба слоя не отклоняют промис: недоступная база означает работу на прежних
     ключах, а не отказ запуска. */
  if (self.CWSnapshots) {
    App.store.history = self.CWSnapshots.create({
      module: 'circuit-planner',
      limit: App.config.maxSnapshots,
      legacyKey: App.config.historyKey,
      /* Старый формат: массив `{ at, data }`, СТАРЫЕ → НОВЫЕ. */
      readLegacy: (raw) => {
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return [];
        return list.filter((snap) => snap && typeof snap.data === 'string')
          .map((snap) => ({ at: snap.at, label: '', meta: App.store.snapshotMeta(snap.data), payload: snap.data }));
      },
    });
  }
  /* Справочник собраний поднимается ВМЕСТЕ с состоянием: досеивание в
     App.shared.adopt() опирается на синхронный CWDirectory.get(), а adopt()
     зовётся уже внутри App.init(). Промис не отклоняется — недоступный
     справочник означает работу без зеркала, а не отказ запуска. */
  Promise.all([
    App.store.remote.init(),
    App.store.history ? App.store.history.init() : Promise.resolve(false),
    self.CWDirectory ? self.CWDirectory.init() : Promise.resolve(false),
  ]).then(() => App.init());
} else {
  App.init();
}
})();
