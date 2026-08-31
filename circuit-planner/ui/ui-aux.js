// circuit-planner/ui/ui-aux.js
//
// Четвёртый срез Phase 3 (аудит контекста, 31.08.2026). Извлечён из
// circuit-planner/app.js без изменения поведения — было
// App.ui.{shareWeekText,findScrollContainer,scrollToDetailPanel,
// measureTopbarHeight,renderNextVisitCard} внутри монолитного IIFE (строки
// 2429-2542, 114 строк). Логика не менялась ни на символ; правки — только
// отступы и разрешение внутреннего this.findScrollContainer() в прямой вызов.
//
// Единственный клеточно-безопасный срез из плотного кластера
// PIN/визит/документы/композер (строки ~2554-4000): пять чистых DOM/UI
// утилит без записи в App.store, CWDocs, CWTemplates или localStorage и без
// касания PIN. Остаток кластера классифицирован по риску и оставлен без
// изменений до решения Алекса — см. отчёт по этому срезу.

(window.CPParts = window.CPParts || []).push(function (App) {

  function shareWeekText(itemData, event) {
    const text = `${itemData.title}\n${App.utils.prettyDateLong(itemData.start)} — ${App.utils.prettyDateLong(itemData.end)}${event?.address ? `\n${App.utils.t('address')}: ${event.address}` : ''}${event?.schedule ? `\n${App.utils.t('schedule')}: ${event.schedule}` : ''}`;
    if (navigator.share) { navigator.share({ text }).catch(() => {}); }
    else if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(() => App.utils.toast(App.utils.t('copied'))).catch(() => {}); }
  }
  // Finds the element that actually scrolls for a given node. This app's <body> has a fixed
  // 100% height with display:flex, which means the WINDOW itself is not scrollable at all —
  // body (or an inner panel) is the real scroll container. Scrolling `window` therefore does
  // nothing, silently. Rather than hardcoding assumptions about which element scrolls (they
  // differ between the wide layout, the narrow layout, and modals), find it at runtime.
  function findScrollContainer(el) {
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
  }
  function scrollToDetailPanel() {
    const target = App.els.calendarSideTitle;
    if (!target) return;
    const apply = () => {
      const container = findScrollContainer(target);
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
  }
  function measureTopbarHeight() {
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
  }
  function renderNextVisitCard() {
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
  }

  // «Кому следующим нужно отправить письмо?» — компактная карточка рядом с
  // «Следующим посещением» (31.08.2026, уточнено 31.08.2026). Никакого нового
  // хранимого состояния: статус письма читается из того же entry.flags.letter,
  // что и в renderNextVisitCard. Если ближайшее письмо-должник — это тот же
  // визит, что уже показан в основной карточке (и там его статус виден), не
  // дублируем — ищем следующий по дате визит с неотправленным письмом.
  //
  // Три разных исхода, которые нельзя схлопывать в один "всё сделано":
  //   1) есть другой (не main-card) визит без письма         -> показать его;
  //   2) неотправленных писем среди будущих визитов вообще НЕТ
  //      -> "Все ближайшие письма отправлены";
  //   3) неотправленное письмо есть, но оно ровно у main-card визита
  //      (и другого кандидата нет) — статус там уже виден, дублировать
  //      нечего, но письмо ФАКТИЧЕСКИ не отправлено, поэтому нельзя
  //      сказать "всё отправлено" — говорим "остальные" вместо "все".
  //
  // Внутри исхода 1) — правило 60 дней (уточнено 31.08.2026): статус "Ещё
  // рано" (success, зелёная точка) при daysUntil > 60, "Пора отправить
  // письмо" (danger, красная точка) при daysUntil <= 60. daysUntil считается
  // от ДАТЫ НАЧАЛА посещения (entry.start), той же формулой, что и в
  // App.data.getUpcomingReminders() (App.utils.parseLocalDate(entry.start) -
  // today, в целых днях) — сознательно не по entry.end. Никакого нового
  // persisted-флага: чисто вычисляемое UI-правило поверх entry.flags.letter.
  function renderLetterDuePill() {
    const pill = App.els.letterDuePill || document.getElementById('letterDuePill');
    if (!pill) return;
    const finish = () => window.requestAnimationFrame(() => window.requestAnimationFrame(() => App.ui.measureTopbarHeight()));
    if (!pill.dataset.clickBound) {
      pill.dataset.clickBound = '1';
      pill.addEventListener('click', () => {
        const targetId = pill.dataset.entryId;
        if (!targetId) return; // both "all sent" states have no target entry
        App.state.calendarDetailId = `entry:${targetId}`;
        App.ui.renderCalendarDetails({ id: `entry:${targetId}` });
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          App.ui.scrollToDetailPanel();
        }));
      });
    }
    if (App.state.selectedScreen !== 'calendar') { pill.style.display = 'none'; finish(); return; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Те же будущие визиты, что и в «Следующем посещении» (визит ещё не
    // завершился), отсортированные по дате начала — это единый источник
    // истины для понятия «будущий визит» в этом блоке топбара.
    const upcoming = (App.state.app.entries || [])
      .map((entry) => ({ entry, event: App.data.getEventById(entry.eventId), start: App.utils.parseLocalDate(entry.start) }))
      .filter(({ event, start, entry }) => event?.visitType && start && App.utils.parseLocalDate(entry.end) >= today)
      .sort((a, b) => a.start - b.start);
    const shownInMainCard = upcoming[0]?.entry?.id || null;
    const withoutLetter = upcoming.filter(({ entry }) => !entry?.flags?.letter);
    // Кандидат помимо того, что уже виден в главной карточке (если он там
    // тоже без письма) — именно ЭТО отличает "нечего дублировать, но письмо
    // всё ещё не отправлено" (partial) от "писем без статуса нет вовсе" (full).
    const otherCandidate = withoutLetter.find(({ entry }) => entry.id !== shownInMainCard) || null;
    const mainCardHasUnsentLetter = withoutLetter.some(({ entry }) => entry.id === shownInMainCard);
    pill.classList.remove('is-allsent');
    pill.classList.remove('is-status-danger', 'is-status-success');
    if (!otherCandidate) {
      pill.style.display = 'flex';
      pill.dataset.entryId = '';
      pill.classList.add('is-allsent', 'is-status-success');
      const setText = (el, text) => { if (el) el.textContent = text; };
      // Различаем "все письма отправлены" (нет вообще неотправленных среди
      // будущих визитов) от "остальные отправлены" (main card сам ещё без
      // письма, но дублировать его в этой карточке нечего) — говорить "все",
      // когда письмо main card фактически не отправлено, было бы неверно.
      // Оба исхода — спокойные success-состояния, без порога 60 дней:
      // они не про срочность конкретного письма, а про то, что в этой
      // карточке сейчас нечего показать.
      const key = mainCardHasUnsentLetter ? 'other_letters_sent' : 'all_letters_sent';
      setText(App.els.letterDuePillName, App.utils.t(key));
      setText(App.els.letterDuePillMeta, '');
      if (App.els.letterDuePillStatus) { App.els.letterDuePillStatus.textContent = ''; App.els.letterDuePillStatus.removeAttribute('data-meta'); }
      pill.title = App.utils.t(key);
      finish();
      return;
    }
    const { entry, event } = otherCandidate;
    pill.style.display = 'flex';
    pill.dataset.entryId = entry.id;
    const setText = (el, text) => { if (el) el.textContent = text; };
    // Порог 60 дней (правило от 31.08.2026, уточнено): считается по дате
    // НАЧАЛА посещения, той же формулой, что и getUpcomingReminders() —
    // единая точка истины для "сколько дней до визита", не отдельная копия.
    const daysUntil = Math.round((otherCandidate.start - today) / 86400000);
    const isUrgent = daysUntil <= 60;
    pill.classList.add(isUrgent ? 'is-status-danger' : 'is-status-success');
    const statusText = isUrgent
      ? App.utils.t('needs_sending_now')
      : `${App.utils.t('letter_soon')} · ${App.utils.t('days_until_send', { value: daysUntil - 60, label: App.utils.pluralUnit(daysUntil - 60, 'day') })}`;
    setText(App.els.letterDuePillName, entry.title || event?.name || '');
    setText(App.els.letterDuePillMeta, `${App.utils.prettyDate(entry.start)} — ${App.utils.prettyDateYear(entry.end)} · ${App.utils.countdownText(entry.start, 'days')}`);
    setText(App.els.letterDuePillStatus, statusText);
    // На mobile .ld-meta скрыт (нет места для полного диапазона дат на
    // компактной строке), но короткий countdown всё же нужен рядом со
    // статусом — как в примере Алекса ("· через 64 дня"). CSS дописывает
    // это через ::after{content:attr(data-meta)}, без лишнего DOM-узла.
    if (App.els.letterDuePillStatus) App.els.letterDuePillStatus.setAttribute('data-meta', App.utils.countdownText(entry.start, 'days'));
    pill.title = `${entry.title || event?.name || ''}: ${isUrgent ? App.utils.t('needs_sending_now') : App.utils.t('letter_soon')}`;
    finish();
  }

  Object.assign(App.ui, {
    shareWeekText, findScrollContainer, scrollToDetailPanel,
    measureTopbarHeight, renderNextVisitCard, renderLetterDuePill,
  });
});
