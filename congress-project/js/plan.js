// Auto-generated module: plan.js
import { $, $$ } from "./dom.js";
import { t } from "./i18n.js";
import { printFilename } from "./letters.js";
import { printWithOrientation } from "./printing.js";
import { A } from "./state.js";
import { dt, esc, isSection, tableHeading } from "./utils.js";
import { fitByZoom, fitPlan, fitPlanPages, planScaleCSS, planZoomCSS } from "./plan-fit.js";

export const COLS=[["time","Час"],["number","№"],["title","Тема"],["speaker","Ведучий / Промовець"],["kind","Інтерв’ю/Показ"],["duration","Хв."],["confirmed","Підтв."],["rehearsal","Реп."],["phone","Мобільний номер"]];
export function htmlCell(t,k){if(k==="speaker")return(t.participants||[]).filter(p=>p.name||p.congregation).map(p=>esc(p.name)+(p.congregation?` (${esc(p.congregation)})`:"")).join("<br>");if(k==="phone")return(t.participants||[]).filter(p=>p.phone).map(p=>(p.name?`${esc(p.name)} — `:"")+esc(p.phone)).join("<br>");if(k==="confirmed")return t.confirmed?"так":"";if(k==="rehearsal")return t.rehearsal?"✓":"";if(k==="time")return esc(dt(t.time));return esc(t[k]||"")}

// keep=true — сохранить текущий выбор колонок (возврат из диалога «не помещается»)
export function openPrintColumns(keep){
  let box=$("#printColumnsBox");
  let prev=keep?$$("#printColumnsBox input").reduce((a,x)=>(a[x.value]=x.checked,a),{}):null;
  box.innerHTML=COLS.map(c=>`<label><input type="checkbox" value="${c[0]}"${(!prev||prev[c[0]])?" checked":""}> ${c[1]}</label>`).join("");
  $("#printColumnsDialog").showModal();
}

export function planHTML(cols){let c=A(),hs=COLS.filter(x=>cols.includes(x[0])),rows=c.tasks.map(t=>`<tr${isSection(t)?" class='psection'":""}>${hs.map(h=>`<td>${htmlCell(t,h[0])}</td>`).join("")}</tr>`).join("");return`<section class="planPrint"><div class="planHead"><h1>${esc(tableHeading(c))}</h1></div><table class="planTable"><thead><tr>${hs.map(h=>`<th>${h[1]}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></section>`}

// состояние последней неудачной попытки уместить план — для кнопок диалога
let pending=null;

function doPrintPlan(html,orientation,lv,extra){
  printWithOrientation(html,orientation,printFilename("План"),lv.pageMargin,planScaleCSS("#printArea",lv)+(extra||""));
}

export function printSelectedPlan(){
  let cols=$$("#printColumnsBox input:checked").map(x=>x.value);
  if(!cols.length)return alert(t("cong.alert.column_required"));
  let orientation=$("#planOrientation").value;
  $("#printColumnsDialog").close();
  let html=planHTML(cols);
  let fit=fitPlan(html,orientation);
  if(fit.fits)return doPrintPlan(html,orientation,fit.level);
  // Даже при минимально допустимых размерах не помещается. Прежде чем предлагать
  // компромиссы (мелкий масштаб / меньше колонок / вторая страница), проверяем
  // другую ориентацию: она сохраняет и полный объём данных, и читаемый шрифт,
  // поэтому это самый безболезненный выход и предлагать его нужно первым.
  let alt=orientation==="portrait"?"landscape":"portrait";
  let altFit=fitPlan(html,alt);
  pending={html,orientation,fit,alt,altFit};
  let pct=Math.round((fit.overflow-1)*100);
  let msg=t("cong.fit.overflow",{font:fit.level.font,margin:fit.level.pageMargin,percent:pct});
  let rotBtn=$("#planFitRotateBtn");
  if(altFit.fits){
    msg+=t("cong.fit.rotate_hint",{orientation:t(alt==="landscape"?"cong.fit.landscape":"cong.fit.portrait"),font:altFit.level.font});
    rotBtn.querySelector("span").textContent=t(alt==="landscape"?"cong.fit.print_landscape":"cong.fit.print_portrait");
    rotBtn.classList.remove("hidden");
  }else rotBtn.classList.add("hidden");
  $("#planFitInfo").textContent=msg;
  $("#planFitDialog").showModal();
}

// Печать в другой ориентации — уровень уже подобран при показе диалога,
// повторно мерить не нужно.
export function planFitRotate(){
  if(!pending||!pending.altFit||!pending.altFit.fits)return;
  let{html,alt,altFit}=pending;
  $("#planFitDialog").close();
  // синхронизируем выбор в диалоге колонок, чтобы следующая печать шла так же
  $("#planOrientation").value=alt;
  doPrintPlan(html,alt,altFit.level);
  pending=null;
}

export function planFitZoom(){
  if(!pending)return;
  let{html,orientation,fit}=pending;
  // точный масштаб, при котором план действительно уместится (0.995 — небольшой запас)
  let k=fitByZoom(html,orientation,fit.level);
  let effFont=fit.level.font*k;
  // честно предупреждаем, если ради одной страницы текст придётся сделать нечитаемым
  if(k<0.7&&!confirm(t("cong.fit.too_small",{percent:Math.round(k*100),font:effFont.toFixed(1)})))return;
  $("#planFitDialog").close();
  doPrintPlan(html,orientation,fit.level,planZoomCSS("#printArea",k));
  pending=null;
}
export function planFitReduce(){
  $("#planFitDialog").close();
  pending=null;
  openPrintColumns(true);
}
export function planFitTwoPages(){
  if(!pending)return;
  let{html,orientation}=pending;
  $("#planFitDialog").close();
  // раз вторая страница разрешена — печатаем максимально читаемым размером,
  // который укладывается в две страницы, а не минимальным
  let f=fitPlanPages(html,orientation,2);
  if(!f.fits&&f.pagesNeeded>2)alert(t("cong.fit.pages_needed",{pages:f.pagesNeeded}));
  doPrintPlan(html,orientation,f.level);
  pending=null;
}
