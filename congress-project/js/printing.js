// Auto-generated module: printing.js
import { $ } from "./dom.js";
import { store } from "./state.js";

// margin и extraCSS необязательны — письма печатаются как раньше (10мм, без доп. CSS),
// план передаёт значения, подобранные автоподгонкой.
export function setPrintStyle(o, margin, extraCSS) {
  let stl = $("#printOrientationStyle") || document.createElement("style");
  stl.id = "printOrientationStyle";
  stl.textContent = `@media print{@page{size:A4 ${o};margin:${margin == null ? 10 : margin}mm}${extraCSS || ""}}`;
  document.head.appendChild(stl);
}
export function printWithOrientation(h, o, filename, margin, extraCSS) {
  setPrintStyle(o || "portrait", margin, extraCSS);
  $("#printArea").innerHTML = h;
  /* Имя файла — через общий слой (shared/print.js). Прежняя реализация меняла
     document.title прямо здесь и восстанавливала его на afterprint в main.js,
     БЕЗ защиты от двойного beforeprint: событие приходит и от своего
     window.print(), и от системного диалога, поэтому имя вкладки могло
     остаться названием документа навсегда. В Назначениях этот баг уже чинили
     отдельно — теперь защита одна на оба модуля. */
  if (filename) CWPrint.filename(filename);
  setTimeout(() => window.print(), 80);
}
export function askOrientation(title, def, html, filename) {
  $("#orientationTitle").textContent = title;
  $("#printOrientation").value = def || "portrait";
  store.pendingPrintHTML = html;
  store.pendingPrintFilename = filename || "";
  $("#orientationDialog").showModal();
}
