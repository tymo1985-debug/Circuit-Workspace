// circuit-planner/ui/overview.js
//
// «Обзор» Клиндария (вариант B, решение Алекса 02.11.2026). Отвечает на три
// вопроса — Сейчас · Далее · Сделать — плюс короткий список «Дальше».
//
// Где показывается:
//   • правая колонка календаря, пока ничего не выбрано (ни собрание, ни день);
//     выбор открывает там детали, кнопка «← Обзор» возвращает обзор;
//   • отдельный экран #overview на ширине ≤900 px — первый экран на телефоне.
//
// Новых хранимых данных нет: всё вычисляется из App.data.buildCalendarItemsForMonth,
// App.data.getUpcomingReminders (правила напоминаний те же, что в окне
// «S302/письма») и порога App.utils.letterReminderDays().

(window.CPParts = window.CPParts || []).push(function (App) {

  const NARROW_QUERY = '(max-width:900px)';
  const isNarrow = () => !!(window.matchMedia && window.matchMedia(NARROW_QUERY).matches);
  const esc = (s) => App.utils.escapeHtml(String(s == null ? '' : s));
  const t = (key, vars) => App.utils.t(key, vars);
  const DAY = 86400000;
  const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const daysBetween = (a, b) => Math.round((day0(b) - day0(a)) / DAY);
  const range = (start, end) => (App.utils.iso(start) === App.utils.iso(end)
    ? App.utils.prettyDateYear(end)
    : `${App.utils.prettyDate(start)} — ${App.utils.prettyDateYear(end)}`);
  const ICON_CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const ICON_MAIL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
  const ICON_DOC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3v5h5"/><path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z"/></svg>';

  // «Идёт · день 3 из 6», «Через 2 дня», «Завершено · 5 дней назад» —
  // время от правильной точки: идущее посещение не «5 дней назад».
  function visitStatus(start, end) {
    const today = day0(new Date());
    const s = day0(start); const e = day0(end);
    if (today < s) return { kind: 'future', text: App.utils.countdownText(App.utils.iso(s), 'days') };
    if (today > e) return { kind: 'past', text: t('ov_ended', { ago: App.utils.countdownText(App.utils.iso(e), 'days') }) };
    const total = daysBetween(s, e) + 1; const dayNo = daysBetween(s, today) + 1;
    return { kind: 'now', dayNo, total, text: dayNo >= total ? t('ov_running_last') : t('ov_running_day', { day: dayNo, total }) };
  }

  // Ближайшие ~4 месяца календаря одной лентой: и недели, и записи.
  function collectItems() {
    const now = new Date(); const out = new Map();
    for (let i = 0; i < 4; i += 1) {
      const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
      App.data.buildCalendarItemsForMonth(m.getMonth(), m.getFullYear()).forEach((item) => { if (!out.has(item.id)) out.set(item.id, item); });
    }
    return [...out.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function itemMeta(item) {
    const event = App.data.getEventById(item.eventId);
    return { event, visitType: event?.visitType || '', typeLabel: App.utils.visitTypeLabel(event?.visitType) };
  }

  function flagChips(item) {
    const chip = (label, done) => `<span class="ov-chip ${done ? 'is-done' : 'is-pending'}">${done ? ICON_CHECK : ''}${esc(label)} · ${esc(t(done ? 'sent_done' : 'needs_sending'))}</span>`;
    return `<div class="ov-chips">${chip(t('letter_short'), !!item.flags?.letter)}${chip(t('s302_short'), !!item.flags?.f302)}</div>`;
  }

  function visitCard(item, label, opts = {}) {
    const { visitType, typeLabel } = itemMeta(item);
    const st = visitStatus(item.start, item.end);
    const segs = st.kind === 'now' && st.total <= 14
      ? `<div class="ov-progress" aria-hidden="true">${Array.from({ length: st.total }, (_, i) => `<span class="${i < st.dayNo ? 'on' : ''}"></span>`).join('')}</div>`
      : '';
    return `<button type="button" class="ov-card ov-card-btn" data-ov-open="${App.utils.escapeAttr(item.id)}" data-ov-date="${App.utils.escapeAttr(App.utils.iso(item.start))}">
      <span class="ov-card-head"><span class="ov-label">${esc(label)}</span><span class="ov-chip ${st.kind === 'now' ? 'is-now' : ''}">${esc(st.text)}</span></span>
      <span class="ov-title">${esc(item.title)}</span>
      <span class="ov-meta"><span class="ov-dot" style="--ov-c:${App.utils.clampColor(item.color)}" aria-hidden="true"></span>${esc(range(item.start, item.end))}${typeLabel ? ` · ${esc(typeLabel)}` : ''}</span>
      ${segs}
      ${visitType && opts.flags !== false ? flagChips(item) : ''}
    </button>`;
  }

  // «Сделать» (вариант А, 03.11.2026): две закреплённые строки — следующее
  // неотправленное письмо и следующий неотправленный S-302. Письмо имеет
  // окно «пора» (letterReminderDays), S-302 от дней не зависит (решение
  // Алекса). Кандидаты — те же визиты, что в окне «S302/письма»: тип визита
  // задан, начало не раньше чем 3 дня назад.
  function todoBlock() {
    const today = day0(new Date());
    const windowDays = App.utils.letterReminderDays();
    const visits = (App.state.app.entries || [])
      .map((entry) => ({ entry, event: App.data.getEventById(entry.eventId), start: App.utils.parseLocalDate(entry.start) }))
      .filter(({ event, start }) => event?.visitType && start && Math.round((day0(start) - today) / DAY) >= -3)
      .sort((a, b) => a.start - b.start);
    const titleOf = (v) => v.entry.title || v.event?.name || t('event');
    const letter = visits.find((v) => !v.entry?.flags?.letter) || null;
    const s302 = visits.filter((v) => !v.entry?.flags?.f302);
    const row = (kind, v, chipClass, chipText, extra = '') => `<li><button type="button" class="ov-task" data-ov-open="entry:${App.utils.escapeAttr(v.entry.id)}" data-ov-date="${App.utils.escapeAttr(v.entry.start)}">
        <span class="ov-task-icon is-${chipClass}" aria-hidden="true">${kind === 'letter' ? ICON_MAIL : ICON_DOC}</span>
        <span class="ov-task-body"><span class="ov-task-kind">${esc(t(kind === 'letter' ? 'ov_next_letter' : 'ov_next_s302'))}</span>
        <span class="ov-task-title">${esc(titleOf(v))}</span>
        <span class="ov-task-meta">${esc(range(App.utils.parseLocalDate(v.entry.start), App.utils.parseLocalDate(v.entry.end)))}</span>
        <span class="ov-chips"><span class="ov-chip is-${chipClass}">${esc(chipText)}</span>${extra}</span></span>
      </button></li>`;
    const done = (key) => `<li><p class="ov-ok">${ICON_CHECK}${esc(t(key))}</p></li>`;
    let letterRow = done('all_letters_sent');
    if (letter) {
      const days = Math.round((day0(letter.start) - today) / DAY);
      if (days <= 0) letterRow = row('letter', letter, 'overdue', t('ov_overdue'));
      else if (days <= windowDays) letterRow = row('letter', letter, 'due', t('ov_due'));
      else { const from = new Date(letter.start); from.setDate(from.getDate() - windowDays); letterRow = row('letter', letter, 'soon', t('ov_soon_from', { date: App.utils.prettyDate(from) })); }
    }
    let s302Row = done('ov_s302_all_sent');
    if (s302.length) {
      const first = s302[0];
      const overdue = Math.round((day0(first.start) - today) / DAY) <= 0;
      const more = s302.length > 1 ? `<span class="ov-chip">${esc(t('ov_s302_unsent', { n: s302.length }))}</span>` : '';
      s302Row = row('s302', first, overdue ? 'overdue' : 'due', t(overdue ? 'ov_overdue' : 'needs_sending'), more);
    }
    const listBtn = s302.length > 1 || letter ? `<button type="button" class="ov-more" data-ov-reminders>${esc(t('ov_open_list'))}</button>` : '';
    return `<section class="ov-card" aria-label="${App.utils.escapeAttr(t('ov_todo'))}">
      <span class="ov-card-head"><span class="ov-label">${esc(t('ov_todo'))}</span></span>
      <ul class="ov-tasks">${letterRow}${s302Row}</ul>
      ${listBtn}
    </section>`;
  }

  function overviewHtml(opts = {}) {
    const today = day0(new Date());
    const items = collectItems();
    const nowItems = items.filter((it) => day0(it.start) <= today && day0(it.end) >= today)
      .sort((a, b) => (itemMeta(b).visitType ? 1 : 0) - (itemMeta(a).visitType ? 1 : 0));
    const future = items.filter((it) => day0(it.start) > today);
    const next = future[0] || null;
    const later = future.slice(1, 5);
    const parts = [];
    if (opts.header) parts.push(`<div class="ov-head"><h3 class="ov-h">${esc(t('nav_overview'))}</h3><p class="ov-date">${esc(App.utils.prettyDateLong(today))}</p></div>`);
    else parts.push(`<p class="ov-date ov-date-solo">${esc(App.utils.prettyDateLong(today))}</p>`);
    nowItems.slice(0, 2).forEach((it) => parts.push(visitCard(it, t('ov_now'))));
    if (next) parts.push(visitCard(next, t('ov_next')));
    parts.push(todoBlock());
    if (later.length) {
      parts.push(`<section class="ov-card" aria-label="${App.utils.escapeAttr(t('ov_later'))}">
        <span class="ov-card-head"><span class="ov-label">${esc(t('ov_later'))}</span></span>
        <ul class="ov-agenda">${later.map((it) => `<li><button type="button" data-ov-open="${App.utils.escapeAttr(it.id)}" data-ov-date="${App.utils.escapeAttr(App.utils.iso(it.start))}">
          <span class="ov-agenda-date">${esc(App.utils.iso(it.start) === App.utils.iso(it.end) ? App.utils.prettyDate(it.start) : `${App.utils.prettyDate(it.start)} – ${App.utils.prettyDate(it.end)}`)}</span>
          <span class="ov-dot" style="--ov-c:${App.utils.clampColor(it.color)}" aria-hidden="true"></span>
          <span class="ov-agenda-name">${esc(it.title)}${itemMeta(it).typeLabel ? `<span class="ov-agenda-type"> · ${esc(itemMeta(it).typeLabel)}</span>` : ''}</span>
        </button></li>`).join('')}</ul>
      </section>`);
    }
    if (!nowItems.length && !next) parts.splice(1, 0, `<p class="md-empty">${esc(t('ov_nothing'))}</p>`);
    return `<div class="ov-root">${parts.join('')}</div>`;
  }

  // Открыть запись из обзора: месяц записи, детали в правой колонке.
  function openFromOverview(itemId, dateIso) {
    const date = App.utils.parseLocalDate(dateIso) || new Date();
    App.state.calendarView = 'month';
    App.state.calendarMonth = date.getMonth();
    App.state.calendarYear = date.getFullYear();
    App.state.calendarSelectedDateIso = null;
    App.state.calendarDetailId = itemId;
    if (App.state.selectedScreen !== 'calendar') { App.state.selectedScreen = 'calendar'; App.ui.renderAll(); }
    else App.ui.renderCalendar();
    App.ui.scrollToDetailPanel();
  }

  function bindOverview(root) {
    root.querySelectorAll('[data-ov-open]').forEach((btn) => btn.addEventListener('click', () => openFromOverview(btn.dataset.ovOpen, btn.dataset.ovDate)));
    root.querySelector('[data-ov-reminders]')?.addEventListener('click', () => App.ui.openRemindersModal());
  }

  // Правая колонка календаря: обзор вместо пустых «деталей».
  function renderCalendarOverview() {
    const card = document.querySelector('#calendarLayout .calendar-details-card');
    if (!App.els.calendarSideDetails || !card) return;
    setSideMode('overview');
    if (App.els.calendarSideTitle) App.els.calendarSideTitle.textContent = t('nav_overview');
    if (App.els.calendarSideMeta) App.els.calendarSideMeta.textContent = '';
    if (App.els.calendarSideCountdownRow) App.els.calendarSideCountdownRow.hidden = true;
    App.els.calendarSideDetails.innerHTML = overviewHtml({ header: false });
    bindOverview(App.els.calendarSideDetails);
  }

  // Экран «Обзор» (≤900 px).
  function renderOverviewScreen() {
    const root = document.getElementById('overviewRoot');
    if (!root || App.state.selectedScreen !== 'overview') return;
    root.innerHTML = overviewHtml({ header: false });
    bindOverview(root);
  }

  // Режим правой колонки: 'overview' или 'detail' (кнопка «← Обзор»).
  function setSideMode(mode) {
    const card = document.querySelector('#calendarLayout .calendar-details-card');
    const side = document.querySelector('#calendarLayout .calendar-side');
    if (card) card.classList.toggle('is-overview', mode === 'overview');
    if (side) side.classList.toggle('is-overview', mode === 'overview');
    const back = document.getElementById('calendarSideBackBtn');
    if (!back) return;
    back.hidden = mode === 'overview' || App.state.calendarView === 'year';
    if (!back.dataset.bound) {
      back.dataset.bound = '1';
      back.addEventListener('click', () => {
        App.state.calendarDetailId = null;
        App.state.calendarSelectedDateIso = null;
        App.ui.renderCalendar();
      });
    }
  }

  // Узкий/широкий экран: «Обзор» существует как экран только на узком.
  function resolveScreenForViewport() {
    if (App.state.selectedScreen === 'overview' && !isNarrow()) App.state.selectedScreen = 'calendar';
    if (!resolveScreenForViewport.bound && window.matchMedia) {
      resolveScreenForViewport.bound = true;
      const mq = window.matchMedia(NARROW_QUERY);
      const onChange = () => { if (App.state.selectedScreen === 'overview' && !mq.matches) App.ui.renderAll(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
  }

  // Полоса события в календаре: класс выбранной.
  function visitStatusText(start, end) { return visitStatus(start, end).text; }

  Object.assign(App.ui, {
    renderCalendarOverview, renderOverviewScreen, setSideMode, resolveScreenForViewport,
    overviewIsNarrow: isNarrow, visitStatusText,
  });
});
