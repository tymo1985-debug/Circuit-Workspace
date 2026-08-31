// circuit-planner/ui/modals.js
//
// Третий срез Phase 3 (аудит контекста, 31.08.2026). Извлечён из
// circuit-planner/app.js без изменения поведения — было
// App.ui.{closeCalendarEditor..checkSixtyDayNotifications} внутри монолитного
// IIFE (строки 3909-4086, 178 строк). Логика не менялась ни на символ; правки
// только отступы (методы объекта -> функции) и разрешение внутренних
// this.xxx() в прямые вызовы. Два внешних вызова (this.openModal/closeModal —
// общие хелперы модалок) переведены на App.ui.openModal/closeModal, методы
// остаются в app.js, как letterTypeSuffix в срезе 2.
//
// Кластер объединяет напоминания, историю изменений, счётчик «60 дней» и
// диалог удаления события — контигентный (непрерывный) участок файла, но не
// единый тематический модуль; резался по месту в файле, а не по смыслу, ровно
// потому что реальная граница вокруг «писем» оказалась не такой чистой, как
// предполагал план Phase 3 §8 (см. комментарий в doc-templates.js о срезе 2).
//
// checkSixtyDayNotifications и confirmEventDelete пишут в App.store (отметка
// «уведомлено», удаление события) — тем же способом, что и раньше: чистая
// релокация, без изменения того, что и когда сохраняется.

(window.CPParts = window.CPParts || []).push(function (App) {

  function closeCalendarEditor() {
    if (App.els.calendarEditor) App.els.calendarEditor.hidden = true; App.state.calendarEditingTarget = null;
  }
  function renderRemindersModal() {
    const items = App.data.getUpcomingReminders();
    if (App.els.remindersModalTitle) App.els.remindersModalTitle.textContent = App.utils.t('reminders_title');
    if (App.els.remindersModalSub) App.els.remindersModalSub.textContent = App.utils.t('reminders_subtitle');
    if (!App.els.remindersModalList) return;
    if (!items.length) {
      App.els.remindersModalList.innerHTML = `<div class="md-empty">${App.utils.tEsc('reminders_none')}</div>`;
      return;
    }
    App.els.remindersModalList.innerHTML = items.map((item) => {
      const dayLabel = item.daysUntil < 0 ? `<span class="flag-badge" style="background:#b91c1c">${App.utils.tEsc('reminders_overdue')}</span>` : `<span class="small">${App.utils.tEsc('reminders_days_left', { days: item.daysUntil })}</span>`;
      const s302Btn = item.needsS302 ? `<button class="md-btn md-btn-danger md-state-layer" type="button" data-mark-reminder="s302" data-entry-id="${App.utils.escapeAttr(item.id)}">${App.utils.tEsc('reminders_mark_s302')}</button><button class="md-btn md-btn-filled md-state-layer" type="button" data-send-s302="${App.utils.escapeAttr(item.id)}">${App.utils.tEsc('make_s302')}</button>` : '';
      const letterBtn = item.needsLetter ? `<button class="md-btn md-btn-outlined md-state-layer" type="button" data-mark-reminder="letter" data-entry-id="${App.utils.escapeAttr(item.id)}">${App.utils.tEsc('reminders_mark_letter')}</button>` : '';
      return `<div class="md-card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
          <div><strong>${App.utils.escapeHtml(item.title)}</strong><div class="small">${App.utils.escapeHtml(App.utils.prettyDate(item.start))} — ${App.utils.escapeHtml(App.utils.prettyDate(item.end))}</div></div>
          ${dayLabel}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${item.needsS302 ? `<span class="pill">${App.utils.tEsc('reminders_s302_needed')}</span>` : ''}
          ${item.needsLetter ? `<span class="pill">${App.utils.tEsc('reminders_letter_needed')}</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${s302Btn}${letterBtn}<button class="md-btn md-btn-outlined md-state-layer" type="button" data-open-reminder-entry="${App.utils.escapeAttr(item.id)}">${App.utils.tEsc('reminders_open_entry')}</button></div>
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
  }
  function openHistoryModal() {
    renderHistoryModal();
    App.ui.openModal(App.els.historyModal);
  }
  function renderHistoryModal() {
    if (!App.els.historyList) return;
    const history = App.store.getHistory();
    if (!history.length) {
      App.els.historyList.innerHTML = `<div class="md-empty">${App.utils.tEsc('history_empty')}</div>`;
      return;
    }
    // Список приходит НОВЫМИ вперёд и уже с готовой сводкой: разбирать
    // блоб на каждой отрисовке больше не нужно, да и блоба здесь нет.
    App.els.historyList.innerHTML = history.map((snap) => {
      const date = new Date(snap.at);
      const label = date.toLocaleString(App.utils.lang(), { dateStyle: 'medium', timeStyle: 'short' });
      const summary = snap.meta
        ? App.utils.tEsc('history_summary', { events: snap.meta.events, entries: snap.meta.entries })
        : '';
      return `<div class="md-card" style="padding:12px;box-shadow:none;border:1px solid var(--md-outline-variant)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div><strong>${App.utils.escapeHtml(label)}</strong><div class="small" style="color:var(--md-on-surface-variant)">${App.utils.escapeHtml(summary)}</div></div>
          <button class="md-btn md-btn-danger md-state-layer" type="button" data-restore-snapshot="${App.utils.escapeHtml(snap.id)}">${App.utils.tEsc('history_restore')}</button>
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
  }
  /**
   * Окно выбора области удаления. `eventId === null` означает «удалить
   * все» — тогда выбор применяется ко всей пачке.
   *
   * Названия модулей берутся из ОБЩЕГО словаря напрямую: `App.utils.t()`
   * подставляет префикс `cp.`, а `module.*.title` живёт в общем слое и
   * существует на всех пяти языках.
   */
  function openFillNumbersModal() {
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
    App.ui.openModal(App.els.fillNumbersModal);
  }

  function openEventDeleteModal({ eventId, name, modules }) {
    App.state.pendingEventDelete = { eventId, modules };
    const titles = (modules || []).map((id) => (typeof CWI18n !== 'undefined'
      ? CWI18n.t(`module.${id}.title`, null, App.utils.lang())
      : id)).join(', ');
    if (App.els.eventDeleteSub) {
      App.els.eventDeleteSub.textContent = eventId
        ? App.utils.t('delete_shared_sub', { name, modules: titles })
        : App.utils.t('delete_all_shared_sub', { modules: titles });
    }
    App.ui.openModal(App.els.eventDeleteModal);
  }

  function closeEventDeleteModal() {
    App.state.pendingEventDelete = null;
    App.ui.closeModal(App.els.eventDeleteModal);
  }

  /** @param {'detach'|'purge'} scope */
  function confirmEventDelete(scope) {
    const pending = App.state.pendingEventDelete;
    closeEventDeleteModal();
    if (!pending) return;
    if (pending.eventId) App.actions.performEventDelete(pending.eventId, scope);
    else App.actions.performDeleteAllEvents(scope);
  }

  function openRemindersModal() {
    renderRemindersModal();
    if (App.els.remindersModal) App.els.remindersModal.hidden = false;
  }
  function closeRemindersModal() {
    if (App.els.remindersModal) App.els.remindersModal.hidden = true;
  }
  function showRemindersModalIfNeeded() {
    if (App.state.app.settings.autoShowReminders && App.data.getUpcomingReminders().length) openRemindersModal();
  }
  function checkSixtyDayNotifications() {
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
  }

  Object.assign(App.ui, {
    closeCalendarEditor, renderRemindersModal, openHistoryModal, renderHistoryModal,
    openFillNumbersModal, openEventDeleteModal, closeEventDeleteModal, confirmEventDelete,
    openRemindersModal, closeRemindersModal, showRemindersModalIfNeeded, checkSixtyDayNotifications,
  });
});
