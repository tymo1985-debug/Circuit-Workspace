// Auto-generated module: directories.js
import { $ } from "./dom.js";
import { renderLists } from "./render.js";
import { S, addList, save, store } from "./state.js";
import { clean, esc } from "./utils.js";

export function openList(mode){store.listMode=mode;let s=S(),map={groups:["congregations","Собрания / группы","group"],speakers:["speakers","Докладчики","speaker"],types:["assignmentTypes","Типы заданий","type"],kinds:["assignmentKinds","Виды задания","kind"]}[mode];$("#listTitle").textContent=map[1];$("#listHint").textContent="Одна строка — одно значение. Значения используются как подсказки.";$("#listEditor").value=clean(s[map[0]]).join("\n");renderListPreview();$("#listDialog").showModal()}
export function renderListPreview(){let a=clean($("#listEditor").value.split(/\n/));$("#listPreview").innerHTML=a.slice(0,60).map(x=>`<span class="chip">${esc(x)}</span>`).join("")}
export function saveList(){let key={groups:"congregations",speakers:"speakers",types:"assignmentTypes",kinds:"assignmentKinds"}[store.listMode];S()[key]=clean($("#listEditor").value.split(/\n/));save();renderLists();$("#listDialog").close()}
export function collectList(){let fld={groups:"group",speakers:"speaker",types:"type",kinds:"kind"}[store.listMode];let vals=[];store.st.congresses.forEach(c=>(c.tasks||[]).forEach(t=>{if(fld==="type"&&t.type)vals.push(t.type);if(fld==="kind"&&t.kind)vals.push(t.kind);(t.participants||[]).forEach(p=>{if(fld==="group"&&p.congregation)vals.push(p.congregation);if(fld==="speaker"&&p.name)vals.push(p.name)})}));$("#listEditor").value=clean($("#listEditor").value.split(/\n/).concat(vals)).join("\n");renderListPreview()}
export function profileLine(p){return[p.name,p.congregation,p.email,p.phone,p.whatsapp,p.notes].map(x=>x||"").join(" | ")}
export function parseProfiles(text){return text.split(/\n/).map(l=>l.trim()).filter(Boolean).map(l=>{let p=l.split("|").map(x=>x.trim());return{name:p[0]||"",congregation:p[1]||"",email:p[2]||"",phone:p[3]||"",whatsapp:p[4]||"",notes:p[5]||""}}).filter(p=>p.name)}
export function openProfiles(){let s=S();$("#speakerProfilesEditor").value=(s.speakerProfiles||[]).map(profileLine).join("\n");$("#speakerProfilesDialog").showModal()}
export function saveProfiles(){S().speakerProfiles=parseProfiles($("#speakerProfilesEditor").value);addList("speakers",S().speakerProfiles.map(p=>p.name));renderLists();save();$("#speakerProfilesDialog").close()}
export function collectProfiles(){let lines=(S().speakerProfiles||[]).map(profileLine);store.st.congresses.forEach(c=>(c.tasks||[]).forEach(t=>(t.participants||[]).forEach(p=>{if(p.name)lines.push([p.name,p.congregation||"","","","",""] .join(" | "))})));$("#speakerProfilesEditor").value=clean(lines).join("\n")}
