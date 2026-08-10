// Auto-generated module: congress.js
import { $ } from "./dom.js";
import { render, renderCongresses } from "./render.js";
import { A, canLink, cloneTask, demo, newC, save, store } from "./state.js";
import { esc, id } from "./utils.js";
import { t } from "./i18n.js";
// В createNew переменная списка заданий называется t и перекрывает импорт —
// там перевод зовётся через псевдоним tr_.
const tr_ = t;

export function populateSeriesSelect(selectEl,current){selectEl.innerHTML='<option value="">${t("cong.opt.no_series")}</option>'+(store.st.series||[]).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");selectEl.value=current||""}
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
