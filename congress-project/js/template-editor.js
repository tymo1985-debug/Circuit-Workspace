// Auto-generated module: template-editor.js
import { $, $$ } from "./dom.js";
import { CONGRESS_CONTEXT, CONGRESS_TEMPLATE_ID, NAMESPACES, builtinTemplate, pickTemplate } from "./letters.js";
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
/** Контекст правки: общий шаблон или шаблон для конкретного типа задания. */
function ctx(){return store.templateMode==="type"?CONGRESS_CONTEXT+":"+$("#templateTypeName").value.trim():CONGRESS_CONTEXT}
/** Идентификатор записи в общем хранилище. У общего шаблона он системный. */
function tplId(){return store.templateMode==="type"?"usr.congress.assignment.invitation."+$("#templateTypeName").value.trim():CONGRESS_TEMPLATE_ID}
/** Текущий текст для показа в редакторе — из того же источника, что и письмо. */
function currentText(){
  let s=S(),lang=docLang(),type=$("#templateTypeName").value.trim();
  if(self.CWTemplates&&self.CWTemplates.stored){
    if(store.templateMode==="type"){let byType=self.CWTemplates.text(CONGRESS_CONTEXT+":"+type,lang);if(byType&&byType.body)return byType.body}
    let main=self.CWTemplates.text(CONGRESS_CONTEXT,lang);
    if(main&&main.body)return main.body;
  }
  if(store.templateMode==="type"&&s.templatesByType&&s.templatesByType[type])return s.templatesByType[type];
  return(s.templates&&s.templates[lang])||builtinTemplate(lang)}
export function openTemplate(typeMode){store.templateMode=typeMode||"default";let type=$("#templateTypeName").value.trim();$("#templateDialogTitle").textContent=store.templateMode==="type"?t("cong.dlg.template_for_type",{type:type||t("cong.dlg.template_no_type")}):t("cong.dlg.template_main");$("#templateEditor").value=currentText();renderPlaceholderList();$("#templateDialog").showModal()}
export function insertAtCursor(el,text){let a=el.selectionStart||0,b=el.selectionEnd||0;el.value=el.value.slice(0,a)+text+el.value.slice(b);el.focus();el.selectionStart=el.selectionEnd=a+text.length}
// Здесь `t` тоже нельзя: текст поля затенял бы функцию перевода, и нажатие
// «жирный» БЕЗ выделения падало с «t is not a function» (подставить образец
// текста как раз и требуется только при пустом выделении).
export function wrap(a,b){let el=$("#templateEditor"),s=el.selectionStart||0,e=el.selectionEnd||0,val=el.value,m=val.slice(s,e)||t("cong.msg.sample_text");el.value=val.slice(0,s)+a+m+b+val.slice(e);el.focus()}
/**
 * Сохранение правки. Текст уходит в общее хранилище — в колонку ТЕКУЩЕГО языка
 * документа, а не языка интерфейса: письмо украинское независимо от того, на
 * каком языке человек смотрит приложение.
 *
 * Сообщение об успехе показывается ПОСЛЕ записи в базу, а не до неё: иначе
 * пользователь закрывал бы диалог с уверенностью, что текст сохранён, тогда
 * как запись могла не пройти.
 */
export function saveTemplate(){
  let type=$("#templateTypeName").value.trim();
  if(store.templateMode==="type"&&!type)return alert(t("cong.alert.type_required"));
  let body=$("#templateEditor").value;
  if(!self.CWTemplates||!self.CWTemplates.stored){
    // Хранилище недоступно — пишем туда же, откуда читаем в этот момент.
    let s=S();
    if(store.templateMode==="type"){if(!s.templatesByType)s.templatesByType={};s.templatesByType[type]=body}else{if(!s.templates)s.templates={};s.templates[docLang()]=body}
    save();return alert(t("cong.msg.template_saved"))}
  self.CWTemplates.save(tplId(),docLang(),{body:body,context:ctx()})
    .then(()=>{alert(t("cong.msg.template_saved"))})
    .catch(e=>{console.error(e);alert(t("cong.msg.template_saved"))})}
/**
 * Восстановление оригинала = УДАЛЕНИЕ пользовательской записи, а не запись в
 * неё системного текста. Так не остаётся мусора и не приходится решать, какой
 * из двух одинаковых текстов «настоящий»; заодно шаблон снова начинает
 * обновляться вместе с приложением.
 */
export function resetTemplate(){
  if(!confirm(t("cong.confirm.reset_template")))return;
  let s=S(),type=$("#templateTypeName").value.trim();
  if(self.CWTemplates&&self.CWTemplates.stored){
    self.CWTemplates.reset(tplId()).then(()=>{$("#templateEditor").value=currentText()}).catch(e=>console.error(e));
    return}
  if(store.templateMode==="type"){if(s.templatesByType)delete s.templatesByType[type]}else if(s.templates){delete s.templates[docLang()]}
  save();$("#templateEditor").value=currentText()}
