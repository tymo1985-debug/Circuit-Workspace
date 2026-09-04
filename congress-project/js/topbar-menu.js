// Меню инструментов в шапке + переиспользуемая фабрика .md-menu.
//
// ЗАЧЕМ. В шапке жили восемь кнопок подряд: письмо, три справочника,
// резервная копия, экспорт, импорт, установка. На ноутбуке они не помещались
// в строку и шапка росла в две. Теперь наружу вынесено одно частое действие
// («Письмо»), остальное — под кнопкой переполнения.
//
// Разметка и стили — общий компонент .md-menu (shared/style.css, раздел 5.2a).
// Здесь только поведение: открыть/закрыть, клик мимо, Esc, клавиатура.
//
// ВАЖНО. Идентификаторы кнопок (#directoryBtn, #backupBtn и т.д.) не менялись:
// js/main.js по-прежнему вешает на них обработчики через $("#id").onclick.
// Пункты меню — те же самые элементы, просто в другом месте разметки.
//
// UI-фаза «Конгрессы» (compact header/print menu): initTopbarMenu() был
// жёстко привязан к #toolsMenuBtn/#toolsMenu. Вынесена общая фабрика
// initMenu(triggerSel, panelSel), initTopbarMenu — её частный случай, чтобы
// не трогать существующий вызов в main.js. Новые меню (header overflow,
// print dropdown) используют ту же фабрику, то же поведение, тот же CSS.

import { $ } from "./dom.js";

export function initMenu(triggerSel, panelSel) {
  const trigger = $(triggerSel);
  const panel = $(panelSel);
  if (!trigger || !panel) return;

  const items = () =>
    Array.from(panel.querySelectorAll(".md-menu__item")).filter(
      (el) => !el.hidden && el.offsetParent !== null
    );

  function open() {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const first = items()[0];
    if (first) first.focus();
  }

  function close(returnFocus) {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus();
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden ? open() : close(false);
  });

  // Клик по пункту закрывает меню. Обработчик самого действия висит на
  // элементе отдельно (main.js) и отрабатывает до этого — порядок не важен,
  // потому что закрытие ничего не отменяет.
  panel.addEventListener("click", (e) => {
    const item = e.target.closest(".md-menu__item");
    if (!item) return;
    // Импорт — это <label> с невидимым <input type="file">. Закрывать меню
    // сразу нельзя: скрытие панели с display:none отменило бы клик по label
    // и файловый диалог не открылся бы. Даём браузеру дойти до input.
    if (item.tagName === "LABEL") {
      setTimeout(() => close(false), 0);
      return;
    }
    close(false);
  });

  // Клик мимо. Слушаем на document, но не мешаем clearSelectionIfOutside
  // из main.js: тот отдельно проверяет свои цели и на меню не реагирует.
  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    if (e.target.closest(".md-menu")) return;
    close(false);
  });

  document.addEventListener("keydown", (e) => {
    if (panel.hidden) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const list = items();
    if (!list.length) return;
    e.preventDefault();
    const i = list.indexOf(document.activeElement);
    const next =
      e.key === "ArrowDown"
        ? list[(i + 1) % list.length]
        : list[(i - 1 + list.length) % list.length];
    next.focus();
  });
}

export function initTopbarMenu() {
  initMenu("#toolsMenuBtn", "#toolsMenu");
}
