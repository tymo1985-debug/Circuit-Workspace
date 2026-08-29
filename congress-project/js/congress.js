// Auto-generated module: congress.js
import { $ } from "./dom.js";
import { render, renderCongresses } from "./render.js";
import { A, applySeriesLinks, canLink, cloneTask, demo, matchSeriesTasks, newC, save, store } from "./state.js";
import { esc, fmt, id } from "./utils.js";
import { t } from "./i18n.js";
// В createNew переменная списка заданий называется t и перекрывает импорт —
// там перевод зовётся через псевдоним tr_.
const tr_ = t;

export function populateSeriesSelect(selectEl,current){selectEl.innerHTML=`<option value="">${esc(t("cong.opt.no_series"))}</option>`+(store.st.series||[]).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");selectEl.value=current||""}
export function openNewSeries(){$("#newSeriesName").value="";$("#newSeriesDialog").showModal()}
export function createSeries(){let name=$("#newSeriesName").value.trim();if(!name)return alert(t("cong.alert.series_name_required"));store.st.series=store.st.series||[];let s={id:id(),name};store.st.series.push(s);save();$("#newSeriesDialog").close();renderCongresses();openNew(s.id)}
export function openNew(presetSeriesId){let a=A();$("#newCongressName").value=a?a.name+t("cong.msg.copy_suffix"):"Новый конгресс";$("#newCongressPlace").value=a?.place||"";$("#newCongressDate").value=a?.date||"";$("#newCongressMode").value=a?"copyEmptyPeople":"demo";populateSeriesSelect($("#newCongressSeries"),presetSeriesId!=null?presetSeriesId:(a?.seriesId||""));$("#newCongressDialog").showModal()}
export function createNew(){let a=A(),m=$("#newCongressMode").value,t=[];let seriesId=$("#newCongressSeries").value||null;
// Общие задания живут внутри серии: связывать конгресс, который ни в какой
// серии не состоит, не с чем. Диалог не закрываем — пусть поправят выбор.
if(m==="copyLinked"&&(!a||!seriesId))return alert(tr_("cong.alert.linked_needs_series"));
if(m==="copyLinked"&&a)t=a.tasks.map(x=>{let n=cloneTask(x,"full");if(canLink(x)){if(!x.linkId)x.linkId=id();n.linkId=x.linkId}return n});
else if(m==="copyFull"&&a)t=a.tasks.map(x=>cloneTask(x,"full"));else if(m==="copyEmptyPeople"&&a)t=a.tasks.map(x=>cloneTask(x,"emptyPeople"));else if(m==="demo")t=demo();let letterFields=(m==="copyFull"||m==="copyEmptyPeople"||m==="copyLinked")&&a?{rehearsalDate:a.rehearsalDate,rehearsalTime:a.rehearsalTime,recordingDeadline:a.recordingDeadline,responseDeadline:a.responseDeadline}:null;newC($("#newCongressName").value||"Новый конгресс",$("#newCongressPlace").value,$("#newCongressDate").value,t,seriesId,letterFields);render();$("#newCongressDialog").close()}
export function openCongressSettings(){let c=A();$("#csName").value=c.name;$("#csPlace").value=c.place||"";$("#csDate").value=c.date||"";$("#csTheme").value=c.theme||"";$("#csLanguage").value=c.language||"";$("#csNotes").value=c.notes||"";$("#csRehearsalDate").value=c.rehearsalDate||"";$("#csRehearsalTime").value=c.rehearsalTime||"";$("#csRecordingDeadline").value=c.recordingDeadline||"";$("#csResponseDeadline").value=c.responseDeadline||"";populateSeriesSelect($("#csSeries"),c.seriesId||"");$("#congressSettingsDialog").showModal()}
export function saveCongressSettings(){let c=A();c.name=$("#csName").value;c.place=$("#csPlace").value;c.date=$("#csDate").value;c.theme=$("#csTheme").value;c.language=$("#csLanguage").value;c.notes=$("#csNotes").value;c.seriesId=$("#csSeries").value||null;c.rehearsalDate=$("#csRehearsalDate").value;c.rehearsalTime=$("#csRehearsalTime").value;c.recordingDeadline=$("#csRecordingDeadline").value;c.responseDeadline=$("#csResponseDeadline").value;save();render();$("#congressSettingsDialog").close()}

// ── Связывание заданий в уже существующей серии ──────────────────────────────
// Для конгрессов, скопированных до появления режима «Копия с общими заданиями».
// Молча связывать нельзя: копии за время работы разошлись, и при первой же
// правке одна из версий исчезла бы. Поэтому диалог показывает, что с чем
// совпало, а расхождения по умолчанию не связывает.
let lsRows=[],lsSeriesId=null;

const lsCongressName=c=>String(c.name||"").trim()+(c.date?" · "+fmt(c.date):"");

// Подпись поля для строки о расхождении: имя поля понятнее, чем «данные
// различаются», а по нему сразу видно, стоит ли выравнивать.
const LS_FIELD_KEYS={number:"cong.field.number",title:"cong.th.topic",type:"cong.field.type",kind:"cong.field.interview_show",duration:"cong.field.minutes",participants:"cong.th.speaker",notes:"cong.field.notes",recordingMedia:"cong.field.recording_type",recordingKind:"cong.field.recording_kind",confirmed:"cong.field.confirmed"};
const lsFieldLabel=f=>LS_FIELD_KEYS[f]?tr_(LS_FIELD_KEYS[f]):f;
const lsValue=(task,f)=>f==="participants"?(task.participants||[]).map(p=>p.name).filter(Boolean).join(", "):String(task[f]==null?"":task[f]);

export function openLinkSeries(seriesId,baseId){
  let ser=(store.st.series||[]).find(x=>x.id===seriesId);if(!ser)return;
  let m=matchSeriesTasks(seriesId,baseId);
  if(!m.base||m.congresses.length<2)return alert(tr_("cong.link.need_two"));
  lsRows=m.rows;lsSeriesId=seriesId;
  $("#lsTitle").textContent=tr_("cong.dlg.link_series",{series:ser.name});
  let sel=$("#lsBase");
  sel.innerHTML=m.congresses.map(c=>`<option value="${c.id}"${c.id===m.base.id?" selected":""}>${esc(lsCongressName(c))}</option>`).join("");
  sel.onchange=()=>openLinkSeries(seriesId,sel.value);
  $("#lsRows").innerHTML=lsRows.length?lsRows.map((r,i)=>{
    let tag="",extra="",on=false,dis=true;
    if(r.state==="same"){tag=`<span class="ls-tag ok">${esc(r.found===r.total?tr_("cong.link.match_all",{n:r.total}):tr_("cong.link.match_some",{n:r.found,m:r.total}))}</span>`;on=true;dis=false}
    else if(r.state==="diff"){
      let f=r.diff[0];
      let vals=[lsCongressName(m.base)+": "+lsValue(r.task,f)].concat(r.matches.map(x=>lsCongressName(x.congress)+": "+lsValue(x.task,f))).join(" · ");
      tag=`<span class="ls-tag warn">${esc(tr_("cong.link.diff",{fields:r.diff.map(lsFieldLabel).join(", ")}))}</span>`;
      extra=`<div class="ls-vals">${esc(vals)}</div><label class="ls-align"><input type="checkbox" id="ls-a${i}"><span>${esc(tr_("cong.link.align",{name:lsCongressName(m.base)}))}</span></label>`;
    }
    else if(r.state==="none")tag=`<span class="ls-tag mute">${esc(tr_("cong.link.no_pair",{list:r.missing.map(c=>String(c.name||"").trim()).join(", ")}))}</span>`;
    else if(r.state==="linked")tag=`<span class="ls-tag mute">${esc(tr_("cong.link.already"))}</span>`;
    else tag=`<span class="ls-tag mute">${esc(tr_("cong.link.ambiguous"))}</span>`;
    return `<div class="ls-row${dis&&r.state!=="diff"?" ls-off":""}"><input type="checkbox" id="ls-r${i}"${on?" checked":""}${dis?" disabled":""}><div class="ls-body"><div class="ls-title">${esc(String(r.task.number||""))} · ${esc(r.task.title||"")}</div><div class="ls-meta">${tag}</div>${extra}</div></div>`;
  }).join(""):`<p class="hint">${esc(tr_("cong.link.empty"))}</p>`;
  lsRows.forEach((r,i)=>{
    let c=$("#ls-r"+i),a=$("#ls-a"+i);
    if(c)c.onchange=lsCount;
    // Расхождение связывается только вместе с выравниванием: иначе задание
    // помечено общим, а данные в конгрессах разные — худший из вариантов.
    if(a)a.onchange=()=>{c.checked=a.checked;lsCount()};
  });
  lsCount();
  let d=$("#linkSeriesDialog");if(!d.open)d.showModal();
}

function lsCount(){let n=lsRows.filter((r,i)=>$("#ls-r"+i)?.checked).length;$("#lsCount").textContent=tr_("cong.link.count",{n:n,m:lsRows.length})}

export function applyLinkSeries(){
  let chosen=[];
  lsRows.forEach((r,i)=>{if($("#ls-r"+i)?.checked){r.align=!!$("#ls-a"+i)?.checked;chosen.push(r)}});
  let n=applySeriesLinks(chosen);
  $("#linkSeriesDialog").close();render();
  alert(tr_("cong.link.done",{n:n}));
}
