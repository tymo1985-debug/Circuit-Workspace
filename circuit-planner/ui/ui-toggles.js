// circuit-planner/ui/ui-toggles.js
//
// Пятый срез Phase 3 (аудит контекста, 31.08.2026). Извлечён из
// circuit-planner/app.js без изменения поведения — было
// App.ui.{openModal,closeModal} (строки 2283-2291) и
// App.ui.{closeMobileMenu,toggleMobileMenu} (строки 3871-3888) внутри
// монолитного IIFE. Логика не менялась ни на символ; правки — только отступы.
//
// Оба блока не смежные в исходном файле, но объединены здесь по смыслу и по
// уровню риска: четыре тривиальных DOM-тумблера (открыть/закрыть модалку,
// открыть/закрыть мобильное меню), ни один не читает и не пишет данные
// какого-либо рода — только classList/hidden/aria-атрибуты.
//
// НЕ включены в этот срез (за пределами Phase 3 сейчас — PIN out of scope,
// личные данные требуют решения Алекса): openStatsModal/openPlannerModal
// (показывают event.contactName), applyAutoPlan (пишет новые записи в
// App.state.app.entries), renderEvents/renderSettings (личные контактные
// поля события/отправителя), весь PIN-блок, весь кластер
// формуляр-визита/письма/документы/композер.

(window.CPParts = window.CPParts || []).push(function (App) {

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.hidden = false;
    const card = modalEl.querySelector('.modal-card');
    if (card) card.scrollTop = 0;
  }
  function closeModal(modalEl) {
    if (modalEl) modalEl.hidden = true;
  }

  function closeMobileMenu() {
    if (App.els.appRoot) App.els.appRoot.classList.remove('menu-open');
    if (App.els.mobileOverlay) {
      App.els.mobileOverlay.hidden = true;
      App.els.mobileOverlay.classList.remove('show');
    }
    App.els.mobileMenuToggleBtn?.setAttribute('aria-expanded', 'false');
  }
  function toggleMobileMenu() {
    if (!App.els.appRoot) return;
    const open = !App.els.appRoot.classList.contains('menu-open');
    App.els.appRoot.classList.toggle('menu-open', open);
    if (App.els.mobileOverlay) {
      App.els.mobileOverlay.hidden = !open;
      App.els.mobileOverlay.classList.toggle('show', open);
    }
    App.els.mobileMenuToggleBtn?.setAttribute('aria-expanded', String(open));
  }

  Object.assign(App.ui, {
    openModal, closeModal, closeMobileMenu, toggleMobileMenu,
  });
});
