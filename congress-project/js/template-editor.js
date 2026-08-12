// Auto-generated module: template-editor.js
import { $, $$ } from "./dom.js";
import { DEFAULT_TEMPLATES, NAMESPACES } from "./letters.js";
import { S, docLang, save, store } from "./state.js";
import { t } from "./i18n.js";

/**
 * Панель переменных. Строится из общего реестра (shared/templates.js), а не из
 * собственного списка — раньше здесь был массив PH, вторая копия перечня.
 * Заголовок группы — техническое имя пространства (`sender.*`): это код, а не
 * подпись интерфейса, поэтому перевода не требует и не ждёт носителя языка.
 * Под новым именем показано старое: человек, открывший свой прежний шаблон,
 * должен узнать в нём переменную. Старые имена продолжают работать всегда.
 */
export function renderPlaceholderList(){let host=$("#placeholderList");if(!host)return;if(!self.CWTemplates){host.innerHTML="";return}let groups={};self.CWTemplates.tokens(NAMESPACES).forEach(v=>{(groups[v.ns]=groups[v.ns]||[]).push(v)});host.innerHTML=Object.keys(groups).map(ns=>`<div class="placeholder-group"><h4>${ns}.*</h4>${groups[ns].map(v=>`<button type="button" class="placeholder" data-p="${v.token}">${v.token}${v.aliases.length?`<small>{{${v.aliases[0]}}}</small>`:""}</button>`).join("")}</div>`).join("");$$("#placeholderList button").forEach(b=>b.onclick=()=>insertAtCursor($("#templateEditor"),b.dataset.p))}
export function openTemplate(typeMode){let s=S();store.templateMode=typeMode||"default";let type=$("#templateTypeName").value.trim();$("#templateDialogTitle").textContent=store.templateMode==="type"?t("cong.dlg.template_for_type",{type:type||t("cong.dlg.template_no_type")}):t("cong.dlg.template_main");$("#templateEditor").value=store.templateMode==="type"?(s.templatesByType[type]||s.templates[docLang()]||DEFAULT_TEMPLATES[docLang()]):(s.templates[docLang()]||DEFAULT_TEMPLATES[docLang()]);renderPlaceholderList();$("#templateDialog").showModal()}
export function insertAtCursor(el,text){let a=el.selectionStart||0,b=el.selectionEnd||0;el.value=el.value.slice(0,a)+text+el.value.slice(b);el.focus();el.selectionStart=el.selectionEnd=a+text.length}
export function wrap(a,b){let el=$("#templateEditor"),s=el.selectionStart||0,e=el.selectionEnd||0,t=el.value,m=t.slice(s,e)||t("cong.msg.sample_text");el.value=t.slice(0,s)+a+m+b+t.slice(e);el.focus()}
export function saveTemplate(){let s=S();if(store.templateMode==="type"){let type=$("#templateTypeName").value.trim();if(!type)return alert(t("cong.alert.type_required"));s.templatesByType[type]=$("#templateEditor").value}else{s.templates[docLang()]=$("#templateEditor").value}save();alert(t("cong.msg.template_saved"))}
export function resetTemplate(){if(!confirm(t("cong.confirm.reset_template")))return;let s=S();if(store.templateMode==="type"){delete s.templatesByType[$("#templateTypeName").value.trim()];$("#templateEditor").value=s.templates[docLang()]||DEFAULT_TEMPLATES[docLang()]}else{s.templates[docLang()]=DEFAULT_TEMPLATES[docLang()];$("#templateEditor").value=s.templates[docLang()]}save()}
