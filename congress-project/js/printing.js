// Auto-generated module: printing.js
import { $ } from "./dom.js";
import { store } from "./state.js";

export function setPrintStyle(o){let stl=$("#printOrientationStyle")||document.createElement("style");stl.id="printOrientationStyle";stl.textContent=`@media print{@page{size:A4 ${o};margin:10mm}}`;document.head.appendChild(stl)}
export function printWithOrientation(h,o,filename){setPrintStyle(o||"portrait");$("#printArea").innerHTML=h;if(filename){store.printTitleBackup=document.title;document.title=filename}setTimeout(()=>window.print(),80)}
export function askOrientation(title,def,html,filename){$("#orientationTitle").textContent=title;$("#printOrientation").value=def||"portrait";store.pendingPrintHTML=html;store.pendingPrintFilename=filename||"";$("#orientationDialog").showModal()}
