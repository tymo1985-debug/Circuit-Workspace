// Auto-generated module: plan.js
import { $, $$ } from "./dom.js";
import { printFilename } from "./letters.js";
import { printWithOrientation } from "./printing.js";
import { A } from "./state.js";
import { dt, esc, isSection, tableHeading } from "./utils.js";

export const COLS=[["time","Час"],["number","№"],["title","Тема"],["speaker","Ведучий / Промовець"],["kind","Інтерв’ю/Показ"],["duration","Хв."],["confirmed","Підтв."],["rehearsal","Реп."]];
export function htmlCell(t,k){if(k==="speaker")return(t.participants||[]).filter(p=>p.name||p.congregation).map(p=>esc(p.name)+(p.congregation?` (${esc(p.congregation)})`:"")).join("<br>");if(k==="confirmed")return t.confirmed?"так":"";if(k==="rehearsal")return t.rehearsal?"✓":"";if(k==="time")return esc(dt(t.time));return esc(t[k]||"")}
export function openPrintColumns(){let box=$("#printColumnsBox");box.innerHTML=COLS.map(c=>`<label><input type="checkbox" value="${c[0]}" checked> ${c[1]}</label>`).join("");$("#printColumnsDialog").showModal()}
export function planHTML(cols){let c=A(),hs=COLS.filter(x=>cols.includes(x[0])),rows=c.tasks.map(t=>`<tr${isSection(t)?" class='psection'":""}>${hs.map(h=>`<td>${htmlCell(t,h[0])}</td>`).join("")}</tr>`).join("");return`<section class="planPrint"><div class="planHead"><h1>${esc(tableHeading(c))}</h1></div><table class="planTable"><thead><tr>${hs.map(h=>`<th>${h[1]}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></section>`}
export function printSelectedPlan(){let cols=$$("#printColumnsBox input:checked").map(x=>x.value);if(!cols.length)return alert("Выберите колонку");$("#printColumnsDialog").close();printWithOrientation(planHTML(cols),$("#planOrientation").value,printFilename("План"))}
