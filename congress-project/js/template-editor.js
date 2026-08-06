// Auto-generated module: template-editor.js
import { $, $$ } from "./dom.js";
import { DEFAULT_TEMPLATES, PH } from "./letters.js";
import { S, docLang, save, store } from "./state.js";
import { t } from "./i18n.js";

export function openTemplate(typeMode){let s=S();store.templateMode=typeMode||"default";let type=$("#templateTypeName").value.trim();$("#templateDialogTitle").textContent=store.templateMode==="type"?t("cong.dlg.template_for_type",{type:type||t("cong.dlg.template_no_type")}):t("cong.dlg.template_main");$("#templateEditor").value=store.templateMode==="type"?(s.templatesByType[type]||s.templates[docLang()]||DEFAULT_TEMPLATES[docLang()]):(s.templates[docLang()]||DEFAULT_TEMPLATES[docLang()]);$("#placeholderList").innerHTML=PH.map(p=>`<button type="button" class="placeholder" data-p="${p}">${p}</button>`).join("");$$("#placeholderList button").forEach(b=>b.onclick=()=>insertAtCursor($("#templateEditor"),b.dataset.p));$("#templateDialog").showModal()}
export function insertAtCursor(el,text){let a=el.selectionStart||0,b=el.selectionEnd||0;el.value=el.value.slice(0,a)+text+el.value.slice(b);el.focus();el.selectionStart=el.selectionEnd=a+text.length}
export function wrap(a,b){let el=$("#templateEditor"),s=el.selectionStart||0,e=el.selectionEnd||0,t=el.value,m=t.slice(s,e)||t("cong.msg.sample_text");el.value=t.slice(0,s)+a+m+b+t.slice(e);el.focus()}
export function saveTemplate(){let s=S();if(store.templateMode==="type"){let type=$("#templateTypeName").value.trim();if(!type)return alert(t("cong.alert.type_required"));s.templatesByType[type]=$("#templateEditor").value}else{s.templates[docLang()]=$("#templateEditor").value}save();alert(t("cong.msg.template_saved"))}
export function resetTemplate(){if(!confirm(t("cong.confirm.reset_template")))return;let s=S();if(store.templateMode==="type"){delete s.templatesByType[$("#templateTypeName").value.trim()];$("#templateEditor").value=s.templates[docLang()]||DEFAULT_TEMPLATES[docLang()]}else{s.templates[docLang()]=DEFAULT_TEMPLATES[docLang()];$("#templateEditor").value=s.templates[docLang()]}save()}
