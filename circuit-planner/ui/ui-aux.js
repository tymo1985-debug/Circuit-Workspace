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

  Object.assign(App.ui, {
    shareWeekText, findScrollContainer, scrollToDetailPanel,
    measureTopbarHeight, renderNextVisitCard,
  });
});
