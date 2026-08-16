// Auto-generated module: render.js
import { openLinkSeries, openNew } from "./congress.js";
import { $, $$ } from "./dom.js";
import { icon } from "./icons.js";
import { openLetter } from "./letters.js";
import { A, S, docLang, linkCount, propagateStatus, sender, STATUSES, row, save, store } from "./state.js";
import { openEdit, removeTask } from "./tasks.js";
import { clean, dt, esc, id, isSection, noAssignmentNeeded, tableHeading } from "./utils.js";
import { t, tStatus } from "./i18n.js";
// Внутри renderTasks переменная задачи называется t и перекрывает импорт —
// поэтому там используется псевдоним tr_.
const tr_ = t;

/**
 * Названия собраний из общего справочника (фаза 5, шаг 5).
 *
 * ⚠️ Только ДЛЯ ВЫВОДА. `settings.congregations` не трогается ни здесь, ни
 * где-либо ещё: это история автодополнения самого модуля, и подмешивать в неё
 * чужие записи значило бы завести обратную запись, которая по умолчанию
 * выключена (аудит §3) — опечатки из свободного поля потекли бы в общий слой.
 *
 * **Номер приклеивается к названию в скобках** — «Название (19588)». В
 * Конгрессах он вшит в строку именно так, и без склейки одно и то же собрание
 * висело бы в списке дважды: своей строкой с номером и справочной без. Это
 * ОБРАТНАЯ операция к `CWDirectory.parseName()` и, в отличие от него, не
 * догадка: номер лежит отдельным полем, мы его не угадываем, а форматируем.
 *
 * Справочник не приехал или ещё не прочитан — список ровно прежний.
 */
function directoryCongregations(){
  try{
    let D=self.CWDirectory;
    if(!D||!D.ready)return[];
    return D.all().map(r=>{
      let name=String(r.name||"").trim();
      if(!name)return"";
      let num=String(r.congNumber||"").trim();
      if(!num||name.endsWith("("+num+")"))return name;
      return name+" ("+num+")";
    }).filter(Boolean);
  }catch(e){console.warn("Конгрессы: справочник собраний недоступен",e);return[]}
}
export function renderLists(){let s=S();s.congregations=clean(s.congregations);s.speakers=clean(s.speakers.concat((s.speakerProfiles||[]).map(p=>p.name)));s.assignmentTypes=clean(s.assignmentTypes);s.assignmentKinds=clean(s.assignmentKinds);$("#congregationDatalist").innerHTML=clean(s.congregations.concat(directoryCongregations())).map(x=>`<option value="${esc(x)}"></option>`).join("");$("#speakerDatalist").innerHTML=s.speakers.map(x=>`<option value="${esc(x)}"></option>`).join("");$("#typeDatalist").innerHTML=s.assignmentTypes.map(x=>`<option value="${esc(x)}"></option>`).join("");$("#kindDatalist").innerHTML=s.assignmentKinds.map(x=>`<option value="${esc(x)}"></option>`).join("")}
export function render(){renderCongresses();renderLists();renderSettings();let c=A();if(!c){/* Раньше после удаления последнего конгресса на экране оставалась таблица заданий уже несуществующего конгресса. */let b=$("#tasksBody");if(b)b.innerHTML="";let t=$("#tableTitle");if(t)t.textContent="";["congressName","congressPlace","congressDate"].forEach(id=>{let el=$("#"+id);if(el)el.value=""});return}$("#congressName").value=c.name;$("#congressPlace").value=c.place||"";$("#congressDate").value=c.date||"";$("#tableTitle").textContent=tableHeading(c);renderTasks()}
export function renderCongresses(){let b=$("#congressList");let series=store.st.series||[];let bySeries={},none=[];store.st.congresses.forEach(c=>{if(c.seriesId&&series.some(s=>s.id===c.seriesId))(bySeries[c.seriesId]=bySeries[c.seriesId]||[]).push(c);else none.push(c)});let cardHTML=c=>`<div class="congress ${c.id===store.st.activeId?"active":""}" data-c="${c.id}"><b>${esc(c.name)}</b><br><small>${esc(c.date||"")}</small></div>`;let html="";series.forEach(s=>{let items=bySeries[s.id]||[];html+=`<div class="series-header"><span>${esc(s.name)}</span><span class="series-actions"><button type="button" class="tiny light icon-text-btn" data-addc="${s.id}" title="${esc(t("cong.title.add_to_series"))}">${icon("plus")}<span>${esc(t("cong.btn.add_congress"))}</span></button>${items.length>1?`<button type="button" class="tiny light icon-btn" data-linkseries="${s.id}" title="${esc(t("cong.title.link_series"))}" aria-label="${esc(t("cong.title.link_series"))}">${icon("link")}</button>`:""}<button type="button" class="tiny danger icon-btn" data-delseries="${s.id}" title="${esc(t("cong.btn.delete_series"))}" aria-label="${esc(t("cong.btn.delete_series"))}">${icon("trash")}</button></span></div>`;html+=items.length?items.map(cardHTML).join(""):`<p class="hint series-empty">${esc(t("cong.hint.series_empty"))}</p>`});if(none.length){if(series.length)html+=`<div class="series-header"><span>${esc(t("cong.opt.no_series"))}</span></div>`;html+=none.map(cardHTML).join("")}b.innerHTML=html;$$("#congressList .congress").forEach(d=>d.onclick=()=>{store.st.activeId=d.dataset.c;let c=A();store.sel=c?.tasks[0]?.id||null;save();render()});$$("#congressList [data-addc]").forEach(btn=>btn.onclick=()=>openNew(btn.dataset.addc));$$("#congressList [data-linkseries]").forEach(btn=>btn.onclick=()=>openLinkSeries(btn.dataset.linkseries));$$("#congressList [data-delseries]").forEach(btn=>btn.onclick=()=>{if(!confirm(t("cong.confirm.delete_series")))return;let sid=btn.dataset.delseries;store.st.congresses.forEach(c=>{if(c.seriesId===sid)c.seriesId=null});store.st.series=store.st.series.filter(s=>s.id!==sid);save();renderCongresses()})}
export function renderSettings(){let s=S(),sd=sender();$("#letterLanguage").value=docLang();$("#letterFont").value=s.font;$("#letterFontSize").value=s.fontSize;let m={senderName:"name",senderCode:"code",senderEmail:"email",senderPhone1:"phone1",senderPhone2:"phone2",senderAddress:"address"};Object.keys(m).forEach(id=>$("#"+id).value=sd[m[id]]||"")}
export function peopleHTML(t){let a=(t.participants||[]).filter(p=>p.name||p.congregation);return a.length?a.map(p=>`<div class="participant-line">${esc(p.name||"")}${p.congregation?` <span class="muted">(${esc(p.congregation)})</span>`:""}</div>`).join(""):`<span class="no-part"><span class="muted no-part__dash">—</span><span class="no-part__text">${esc(tr_("cong.msg.no_participant"))}</span></span>`}
export function renderTasks(){let c=A(),b=$("#tasksBody");if(!b)return;b.innerHTML="";if(!c)return;(c.tasks||[]).forEach(t=>{let section=isSection(t);let statusSel=noAssignmentNeeded(t)?"":`<select class="status status-sel" title="${esc(tr_("cong.title.task_status"))}" aria-label="${esc(tr_("cong.title.task_status"))}" data-s="${esc(t.status||"")}">${STATUSES.map(s=>`<option value="${esc(s)}"${s===(t.status||"")?" selected":""}>${esc(tStatus(s))}</option>`).join("")}</select>`;let letterBtn=noAssignmentNeeded(t)?"":`<button type="button" class="tiny icon-btn le" title="${esc(tr_("cong.th.letter"))}" aria-label="${esc(tr_("cong.th.letter"))}">${icon("mail")}</button>`;let linkMark=t.linkId?`<span class="link-badge" title="${esc(tr_("cong.link.badge_title"))}">${icon("link")}${linkCount(t.linkId)}</span>`:"";let tr=document.createElement("tr");tr.className=(section?"section-title ":"")+(t.id===store.sel?"selected":"");tr.onclick=e=>{if(e.target.closest("button,select"))return;store.sel=t.id;renderTasks()};tr.innerHTML=`<td class="time" data-label="${esc(tr_("cong.th.time"))}">${esc(dt(t.time))}</td><td class="num" data-label="№">${esc(t.number)}</td><td class="topic" data-label="${esc(tr_("cong.th.topic"))}">${esc(t.title)}${linkMark}</td><td class="speaker" data-label="${esc(tr_("cong.th.speaker"))}">${peopleHTML(t)}</td><td class="kind" data-label="${esc(tr_("cong.th.interview"))}">${t.kind?`<span class="pill">${esc(t.kind)}</span>`:""}</td><td class="dur" data-label="${esc(tr_("cong.th.min"))}">${esc(t.duration)}</td><td class="status-cell" data-label="${esc(tr_("cong.th.status"))}">${statusSel}</td><td class="mail" data-label="${esc(tr_("cong.th.letter"))}">${t.letterSent?"✓":""}</td><td class="reh" data-label="${esc(tr_("cong.th.rehearsal"))}">${t.rehearsal?"✓":""}</td><td class="actions-cell" data-label="${esc(tr_("cong.th.actions"))}"><div class="actgrid"><div class="primary-row"><button type="button" class="tiny icon-btn ed" title="${esc(tr_("cong.btn.edit"))}" aria-label="${esc(tr_("cong.btn.edit"))}">${icon("edit")}</button>${letterBtn}</div><button type="button" class="tiny danger icon-btn rm" title="${esc(tr_("cong.btn.delete"))}" aria-label="${esc(tr_("cong.btn.delete"))}">${icon("trash")}</button></div></td>`;b.appendChild(tr);tr.querySelector('.ed').onclick=e=>{e.stopPropagation();openEdit(t.id)};let le=tr.querySelector('.le');if(le)le.onclick=e=>{e.stopPropagation();openLetter(t.id)};tr.querySelector('.rm').onclick=e=>{e.stopPropagation();removeTask(t.id)};let ss=tr.querySelector('.status-sel');if(ss)ss.onchange=e=>{e.stopPropagation();t.status=ss.value;ss.dataset.s=ss.value;propagateStatus(t);save()}})}
