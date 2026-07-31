// Auto-generated module: template-editor.js
import { $, $$ } from "./dom.js";
import { DEFAULT_TEMPLATES, PH } from "./letters.js";
import { S, save, store } from "./state.js";

export function openTemplate(typeMode){let s=S();store.templateMode=typeMode||"default";let type=$("#templateTypeName").value.trim();$("#templateDialogTitle").textContent=store.templateMode==="type"?`Шаблон для типа: ${type||"(без названия)"}`:"Редактор основного текста письма";$("#templateEditor").value=store.templateMode==="type"?(s.templatesByType[type]||s.templates[s.language]||DEFAULT_TEMPLATES[s.language]):(s.templates[s.language]||DEFAULT_TEMPLATES[s.language]);$("#placeholderList").innerHTML=PH.map(p=>`<button type="button" class="placeholder" data-p="${p}">${p}</button>`).join("");$$("#placeholderList button").forEach(b=>b.onclick=()=>insertAtCursor($("#templateEditor"),b.dataset.p));$("#templateDialog").showModal()}
export function insertAtCursor(el,text){let a=el.selectionStart||0,b=el.selectionEnd||0;el.value=el.value.slice(0,a)+text+el.value.slice(b);el.focus();el.selectionStart=el.selectionEnd=a+text.length}
export function wrap(a,b){let el=$("#templateEditor"),s=el.selectionStart||0,e=el.selectionEnd||0,t=el.value,m=t.slice(s,e)||"текст";el.value=t.slice(0,s)+a+m+b+t.slice(e);el.focus()}
export function saveTemplate(){let s=S();if(store.templateMode==="type"){let type=$("#templateTypeName").value.trim();if(!type)return alert("Укажи тип задания");s.templatesByType[type]=$("#templateEditor").value}else{s.templates[s.language]=$("#templateEditor").value}save();alert("Шаблон сохранён")}
export function resetTemplate(){if(!confirm("Сбросить шаблон?"))return;let s=S();if(store.templateMode==="type"){delete s.templatesByType[$("#templateTypeName").value.trim()];$("#templateEditor").value=s.templates[s.language]||DEFAULT_TEMPLATES[s.language]}else{s.templates[s.language]=DEFAULT_TEMPLATES[s.language];$("#templateEditor").value=s.templates[s.language]}save()}
