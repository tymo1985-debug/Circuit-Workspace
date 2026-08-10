// Auto-generated module: tasks.js
import { $, $$ } from "./dom.js";
import { icon } from "./icons.js";
import { renderLists, renderTasks } from "./render.js";
import { A, S, STATUSES, addList, cleanupLinks, cloneTask, linkCount, linkedEntries, makeBackup, propagateStatus, propagateTask, row, save, store, unlinkTask } from "./state.js";
import { dt, esc, fmt, id, isSection, noAssignmentNeeded, tv } from "./utils.js";
import { t } from "./i18n.js";
// В checkProgram/openEdit переменная задачи называется t и перекрывает импорт —
// там перевод зовётся через псевдоним tr_.
const tr_ = t;

export function addTask(after,sec){let c=A(),r=row(sec?{section:true,type:"Раздел",title:t("cong.msg.new_section"),recordingMedia:"",recordingKind:""}:{title:t("cong.msg.new_task"),participants:[{name:"",congregation:""}]});let i=c.tasks.findIndex(x=>x.id===after);c.tasks.splice(i>=0?i+1:c.tasks.length,0,r);store.sel=r.id;save();renderTasks();if(!sec)openEdit(r.id)}
export function removeTask(id){if(!confirm(t("cong.confirm.delete_row")))return;makeBackup(t("cong.msg.before_task_delete"));let c=A();c.tasks=c.tasks.filter(x=>x.id!==id);cleanupLinks();store.sel=c.tasks[0]?.id||null;save();renderTasks()}
export function openEdit(id){store.editId=id;let t=A().tasks.find(x=>x.id===id);$("#eStatus").innerHTML=STATUSES.map(s=>`<option>${esc(s)}</option>`).join("");$("#eTime").value=tv(t.time);$("#quickTime").value="";$("#eNumber").value=t.number;$("#eTitle").value=t.title;$("#eType").value=t.type;$("#eKind").value=t.kind;$("#eDuration").value=t.duration;$("#eStatus").value=t.status||"Не назначено";$("#eConfirmed").value=String(!!t.confirmed);$("#eRehearsal").value=String(!!t.rehearsal);$("#eLetterSent").value=String(!!t.letterSent);$("#eLetterSentDate").value=t.letterSentDate||"";$("#eRecordingMedia").value=t.recordingMedia||"";$("#eRecordingKind").value=t.recordingKind||"";$("#eNotes").value=t.notes||"";drawParts(t.participants||[]);renderLinkBanner(t);$("#editDialog").showModal()}
export function drawParts(ps){let b=$("#editParticipants");b.innerHTML="";ps.forEach((p,i)=>{let d=document.createElement("div");d.className="epart";d.innerHTML=`<input list="speakerDatalist" value="${esc(p.name)}" placeholder="${esc(t("cong.ph.participant_name"))}"><input list="congregationDatalist" value="${esc(p.congregation)}" placeholder="Собрание / группа"><button type="button" class="danger icon-btn" title="Удалить участника" aria-label="Удалить участника">${icon("trash")}</button>`;let nameInput=d.children[0],congInput=d.children[1];nameInput.onchange=()=>{let prof=(S().speakerProfiles||[]).find(x=>x.name===nameInput.value);if(prof&&!congInput.value)congInput.value=prof.congregation||""};d.querySelector("button").onclick=()=>{ps.splice(i,1);drawParts(ps)};b.appendChild(d)})}
export function getParts(){return $$("#editParticipants .epart").map(d=>({name:d.children[0].value,congregation:d.children[1].value}))}
export function saveEdit(){let t=A().tasks.find(x=>x.id===store.editId);t.time=dt($("#eTime").value);t.number=$("#eNumber").value;t.title=$("#eTitle").value;t.type=$("#eType").value;t.kind=$("#eKind").value;t.duration=$("#eDuration").value;t.status=$("#eStatus").value;t.confirmed=$("#eConfirmed").value==="true";t.rehearsal=$("#eRehearsal").value==="true";t.letterSent=$("#eLetterSent").value==="true";t.letterSentDate=$("#eLetterSentDate").value;t.recordingMedia=$("#eRecordingMedia").value;t.recordingKind=$("#eRecordingKind").value;t.notes=$("#eNotes").value;t.participants=getParts();t.section=isSection(t);propagateTask(t);propagateStatus(t);addList("assignmentTypes",[t.type]);addList("assignmentKinds",[t.kind]);addList("speakers",t.participants.map(p=>p.name));addList("congregations",t.participants.map(p=>p.congregation));renderLists();save();renderTasks();$("#editDialog").close()}
export function duplicateCurrent(empty){let c=A(),t=c.tasks.find(x=>x.id===store.editId);if(!t)return;let n=cloneTask(t,empty?"emptyPeople":"full"),i=c.tasks.findIndex(x=>x.id===store.editId);c.tasks.splice(i+1,0,n);store.sel=n.id;save();renderTasks();$("#editDialog").close();openEdit(n.id)}
export function checkProgram(){let issues=[],c=A();(c.tasks||[]).forEach((t,i)=>{if(isSection(t))return;if(noAssignmentNeeded(t))return;let label=`${t.number?"№"+t.number:tr_("cong.msg.row_label",{n:i+1})} — ${t.title||tr_("cong.msg.no_topic")}`;let main=(t.participants||[])[0]||{};if(!t.time)issues.push(["warn",label,tr_("cong.check.no_time")]);if(!t.title)issues.push(["err",label,tr_("cong.check.no_topic")]);if(!main.name)issues.push(["warn",label,tr_("cong.check.no_participant")]);if(main.name&&!main.congregation)issues.push(["warn",label,tr_("cong.check.no_congregation")]);if(!t.recordingMedia)issues.push(["warn",label,tr_("cong.check.no_recording_type")]);if(!t.recordingKind)issues.push(["warn",label,tr_("cong.check.no_recording_kind")]);if(main.name&&!t.letterSent)issues.push(["warn",label,tr_("cong.check.letter_not_sent")])});$("#checkResults").innerHTML=issues.length?issues.map(x=>`<div class="issue ${x[0]}"><b>${esc(x[1])}</b><br>${esc(x[2])}</div>`).join(""):`<div class="issue"><b>${esc(t("cong.msg.no_issues"))}</b></div>`;$("#checkDialog").showModal()}

// Баннер связки в диалоге правки. Показывает, что задание общее, и — главное —
// какие именно конгрессы затронет сохранение: «применится к 2 конгрессам» без
// названий заставляет вспоминать по памяти. Заодно подсвечивает поля, которые
// остаются своими у каждого конгресса (иначе непонятно, почему тема уезжает
// в обе программы, а время нет).
export function renderLinkBanner(task){
  let box=$("#eLinkBanner");if(!box)return;
  let hints=$$("#editDialog .own-hint");
  if(!task||!task.linkId){box.hidden=true;box.innerHTML="";hints.forEach(el=>el.hidden=true);return}
  let names=linkedEntries(task.linkId,task.id).map(e=>e.congress).map(c=>String(c.name||"").trim()+(c.date?" "+fmt(c.date):""));
  let shown=names.slice(0,2).join(", ");
  if(names.length>2)shown+=", "+tr_("cong.link.more",{n:names.length-2});
  let cur=A(),ser=(store.st.series||[]).find(x=>x.id===(cur&&cur.seriesId));
  let head=ser?tr_("cong.link.banner_title",{series:ser.name}):tr_("cong.link.badge_title");
  box.hidden=false;
  box.innerHTML=`<span class="link-banner-icon">${icon("link")}</span><span class="link-banner-text"><b>${esc(head)}</b><span>${esc(tr_("cong.link.banner_text",{n:linkCount(task.linkId),list:shown}))}</span></span><button type="button" class="light tiny" id="eUnlink">${esc(tr_("cong.btn.unlink"))}</button>`;
  hints.forEach(el=>el.hidden=false);
  $("#eUnlink").onclick=()=>{if(!confirm(tr_("cong.confirm.unlink")))return;unlinkTask(task);save();renderTasks();renderLinkBanner(task)};
}
