// Auto-generated module: state.js
import { $ } from "./dom.js";
import { CONGRESS_CONTEXT, CONGRESS_TEMPLATE_ID, builtinTemplate } from "./letters.js";
import { render } from "./render.js";
import { clean, clone, id, isSection, noAssignmentNeeded } from "./utils.js";
import { t } from "./i18n.js";

export const KEY="congress-pwa-v34-speakers",BACKUP_KEY=KEY+"-backups";
export const STATUSES=["Не назначено","Назначено","Ожидает ответа","Подтверждено","Нужно письмо","Письмо отправлено","Запись получена","Готово"];
export const BASE_TYPES=["Пункт програми","Промова","Інтерв’ю","Показ","Демонстрація","Музика","Пісня і молитва","Оголошення","Серія промов","Раздел"],BASE_KINDS=["інтерв’ю","показ","демонстрація"];
export let store={st:{congresses:[],activeId:null,settings:null,series:[]},sel:null,editId:null,previewId:null,listMode:"groups",templateMode:"default",deferredPrompt:null,pendingPrintHTML:"",pendingPrintFilename:"",lastSavedAt:null};
export function baseSettings(){return{font:"Arial, Helvetica, sans-serif",fontSize:"17",stageRehearsalDate:"",stageRehearsalTime:"",recordingDeadline:"",responseDeadline:"2025-08-18",congregations:["EU-K-01","SZ Warszawa","Warszawa-Ukraiński-Południe (19588)","Warszawa-Ukraiński-Północ (9610)"],speakers:["Олексій Тимощук","Якуб Ульфік","Филип Казіродек"],speakerProfiles:[],assignmentTypes:BASE_TYPES.slice(),assignmentKinds:BASE_KINDS.slice()}}
// Данные отправителя и язык письма больше не хранятся в настройках модуля:
// они общие для всей экосистемы (shared/sender.js и shared/doclang.js).
// Здесь остались только тонкие обёртки, чтобы остальной код модуля не знал,
// откуда именно берётся значение.
export function sender(){return self.CWSender?self.CWSender.get():{name:"",code:"",address:"",phone1:"",phone2:"",email:""}}
export function docLang(){return self.CWDocLang?self.CWDocLang.get():"uk"}

// Одноразовый перенос: у существующих установок данные лежат внутри settings.
// Забираем их в общий слой и вычищаем из своего хранилища, чтобы копия не
// осталась жить второй жизнью и не разошлась с общей.
/**
 * Однократный перенос шаблонов писем из настроек модуля в общее хранилище.
 *
 * ⚠️ САМАЯ ОПАСНАЯ ОПЕРАЦИЯ ФАЗЫ 2 — она необратима: после неё ключи
 * `templates` и `templatesByType` из настроек удаляются. Поэтому:
 *   • перед переносом снимается автоматическая копия состояния (makeBackup);
 *   • переносится ТОЛЬКО то, что пользователь правил сам — нетронутый
 *     системный текст не копируется, иначе он «замёрзнет» и перестанет
 *     обновляться вместе с приложением;
 *   • adopt() в общем слое не перезаписывает уже существующую запись, поэтому
 *     повторный вызов безвреден;
 *   • ключи удаляются и state сохраняется ТОЛЬКО после успешной записи в базу.
 *     Иначе сбой на середине оставил бы пользователя без текста вообще.
 *
 * Как отличается правленое от нетронутого: сравниваем с системным текстом.
 * Совпало — не правил.
 */
export function adoptTemplates(){
  if(!self.CWTemplates||!self.CWTemplates.stored||!self.CWDB)return Promise.resolve(false);
  let s=S(),jobs=[],touched=false;
  let byLang=s.templates&&typeof s.templates==="object"?s.templates:null;
  if(byLang){
    let translations={};
    Object.keys(byLang).forEach(k=>{
      let text=byLang[k];
      if(typeof text!=="string"||!text)return;
      if(text===builtinTemplate(k))return;      // системный текст, не правил
      translations[k]={subject:null,body:text}});
    if(Object.keys(translations).length){
      touched=true;
      jobs.push(self.CWTemplates.adopt(CONGRESS_TEMPLATE_ID,{
        context:CONGRESS_CONTEXT,module:"congress-project",format:"text",
        title:"Приглашение к участию в задании на конгрессе",translations:translations}))}}
  let byType=s.templatesByType&&typeof s.templatesByType==="object"?s.templatesByType:null;
  if(byType){
    Object.keys(byType).forEach(type=>{
      let text=byType[type];
      if(typeof text!=="string"||!text)return;
      touched=true;
      // Шаблон типа задания в старой модели был один на все языки. Кладём его
      // в украинскую колонку: fallback отдаёт её для любого языка, поведение
      // остаётся прежним, и нового понятия «шаблон вне языка» не появляется.
      jobs.push(self.CWTemplates.adopt("usr.congress.assignment.invitation."+type,{
        context:CONGRESS_CONTEXT+":"+type,module:"congress-project",format:"text",
        title:"Письмо для типа задания: "+type,
        translations:{uk:{subject:null,body:text}}}))})}
  if(!jobs.length){
    // Правок не было — просто убираем пустые ключи, копия не нужна.
    if(byLang||byType){delete s.templates;delete s.templatesByType;save()}
    return Promise.resolve(false)}
  makeBackup("перед переносом шаблонов в общее хранилище");
  return Promise.all(jobs).then(()=>{
    delete s.templates;delete s.templatesByType;save();
    return touched}).catch(e=>{
    // Ключи НЕ трогаем: пользователь остаётся на прежнем источнике, письма
    // продолжают печататься его текстом, перенос повторится при следующем
    // запуске.
    console.error("Конгрессы: перенос шаблонов не выполнен, данные не тронуты",e);
    return false})}

export function adoptShared(){let s=S();if(self.CWSender){self.CWSender.adopt({name:s.senderName,code:s.senderCode,address:s.senderAddress,phone1:s.senderPhone1,phone2:s.senderPhone2,email:s.senderEmail});["senderName","senderCode","senderAddress","senderPhone1","senderPhone2","senderEmail"].forEach(k=>delete s[k])}if(self.CWDocLang){if(s.language)self.CWDocLang.adopt(s.language);delete s.language}save()}

export function row(o={}){return{id:id(),time:"",number:"",title:"",type:"Пункт програми",kind:"",duration:"",participants:[],confirmed:false,rehearsal:false,notes:"",section:false,recordingMedia:"аудіо",recordingKind:"інтерв’ю",status:"Не назначено",letterSent:false,letterSentDate:"",linkId:null,...o}}
export function demo(){return[row({time:"9:30",title:"РАНКОВА ПРОГРАМА",type:"Раздел",section:true,recordingMedia:"",recordingKind:""}),row({time:"9:40",title:"Музика",type:"Музика",recordingMedia:"аудіо",recordingKind:"інтерв’ю",status:"Назначено"}),row({time:"9:50",title:"Пісня — і молитва",type:"Пісня і молитва",participants:[{name:"",congregation:""}],recordingMedia:"аудіо",recordingKind:"інтерв’ю"}),row({time:"10:00",number:"1",title:"Why “Trust In Jehovah With All Your Heart”?",type:"Промова",duration:"15",participants:[{name:"",congregation:""}],recordingMedia:"аудіо",recordingKind:"промову"}),row({time:"13:20",title:"ПОПОЛУДНЕВА ПРОГРАМА",type:"Раздел",section:true,recordingMedia:"",recordingKind:""})]}
export function A(){return store.st.congresses.find(c=>c.id===store.st.activeId)}
export function S(){if(!store.st.settings)store.st.settings=baseSettings();return store.st.settings}
export function save(){localStorage.setItem(KEY,JSON.stringify(store.st));store.lastSavedAt=new Date();updateSaveStatus()}
export function updateSaveStatus(){let el=$("#saveStatus");if(!el||!store.lastSavedAt)return;el.classList.remove("stale");el.textContent=t("cong.msg.saved_at",{time:store.lastSavedAt.toLocaleTimeString(self.CWI18n?.getLang?.()||"ru",{hour:"2-digit",minute:"2-digit",second:"2-digit"})})}
export function makeBackup(label){try{let a=JSON.parse(localStorage.getItem(BACKUP_KEY)||"[]");a.unshift({id:id(),date:new Date().toISOString(),label:label||t("cong.msg.autobackup"),data:clone(store.st)});localStorage.setItem(BACKUP_KEY,JSON.stringify(a.slice(0,10)))}catch(e){}}
export function migrate(){let s=S(),b=baseSettings();if(!Array.isArray(store.st.series))store.st.series=[];if(!s.font)s.font=b.font;if(!s.fontSize)s.fontSize=b.fontSize;if(!Array.isArray(s.congregations))s.congregations=b.congregations;if(!Array.isArray(s.speakers))s.speakers=b.speakers;if(!Array.isArray(s.speakerProfiles))s.speakerProfiles=[];if(!Array.isArray(s.assignmentTypes))s.assignmentTypes=b.assignmentTypes;if(!Array.isArray(s.assignmentKinds))s.assignmentKinds=b.assignmentKinds;(store.st.congresses||[]).forEach(c=>{if(c.theme==null)c.theme="";if(c.language==null)c.language="";if(c.notes==null)c.notes="";if(c.seriesId===undefined)c.seriesId=null;if(c.rehearsalDate===undefined)c.rehearsalDate=s.stageRehearsalDate||"";if(c.rehearsalTime===undefined)c.rehearsalTime=s.stageRehearsalTime||"";if(c.recordingDeadline===undefined)c.recordingDeadline=s.recordingDeadline||"";if(c.responseDeadline===undefined)c.responseDeadline=s.responseDeadline||"";(c.tasks||[]).forEach(t=>{if(t.linkId===undefined)t.linkId=null;if(t.recordingMedia==null)t.recordingMedia=s.recordingMedia||"аудіо";if(t.recordingKind==null)t.recordingKind=s.recordingKind||t.kind||"інтерв’ю";if(noAssignmentNeeded(t)){t.letterSent=false;t.letterSentDate="";t.status=""}else{if(!t.status)t.status=t.confirmed?"Подтверждено":"Не назначено";if(t.letterSent==null)t.letterSent=false;if(t.letterSentDate==null)t.letterSentDate=""}if(isSection(t))t.section=true})});cleanupLinks()}
// Проверка формы объекта состояния ПЕРЕД тем, как заменить им рабочие данные.
// Без неё импорт произвольного JSON заменял store.st мусором ещё до migrate();
// migrate() падал, alert показывался, но автосохранение (раз в 5 минут) уже
// записывало мусор в localStorage поверх реальных конгрессов.
export function isValidState(x){return !!x&&typeof x==="object"&&!Array.isArray(x)&&Array.isArray(x.congresses)}
export function addList(k,vals){let s=S();s[k]=clean((s[k]||[]).concat(vals||[]))}
export function load(){try{let x=JSON.parse(localStorage.getItem(KEY));if(isValidState(x))store.st=x}catch{}migrate();adoptShared();if(!store.st.congresses.length)newC(t("cong.msg.first_congress"),"SZ Warszawa","2026-11-07",demo());render();store.lastSavedAt=new Date();updateSaveStatus()}
export function newC(n,p,d,t,seriesId,letterFields){let lf=letterFields||{};let c={id:id(),name:n,place:p||"",date:d||"",theme:"",language:"",notes:"",tasks:t||[],seriesId:seriesId||null,rehearsalDate:lf.rehearsalDate||"",rehearsalTime:lf.rehearsalTime||"",recordingDeadline:lf.recordingDeadline||"",responseDeadline:lf.responseDeadline||""};store.st.congresses.unshift(c);store.st.activeId=c.id;store.sel=c.tasks[0]?.id||null;save();return c}
export function cloneTask(t,m){let n=clone(t);n.id=id();n.linkId=null;if(m==="emptyPeople"){n.participants=(n.participants||[]).map(()=>({name:"",congregation:""}));n.confirmed=false;n.rehearsal=false;n.notes="";n.letterSent=false;n.letterSentDate="";n.status="Не назначено"}return n}

// ── Общие задания серии (linkId) ─────────────────────────────────────────────
// В некоторых сериях программа повторяется: одно и то же задание у одного и
// того же брата на нескольких конгрессах. Задания, у которых совпадает linkId,
// считаются ОДНИМ логическим заданием.
//
// Данные при этом НЕ выносятся в отдельное хранилище, а зеркалятся: каждый
// конгресс по-прежнему держит полный tasks[], поэтому render/plan-fit/печать/
// бэкап/импорт остаются нетронутыми, а разрыв связки — это просто linkId=null,
// после которого задание живёт как обычное.
//
// Что общее, а что своё у каждого конгресса, — см. LINK_SHARED_FIELDS ниже.
// Время (time), отметка репетиции (rehearsal) и всё про письмо (letterSent,
// letterSentDate) остаются локальными: репетиция и письмо у каждого конгресса
// свои, время площадки может отличаться.
export const LINK_SHARED_FIELDS=["number","title","type","kind","duration","participants","notes","recordingMedia","recordingKind","confirmed"];

// Статус — один линейный список, в котором смешаны две разные вещи: путь
// договорённости с братом (общий для связки) и путь письма по конкретному
// конгрессу (свой у каждого). Общей считается только первая фаза.
export const ASSIGNMENT_PHASE=["Не назначено","Назначено","Ожидает ответа","Подтверждено"];
export function isAssignmentPhase(st){return ASSIGNMENT_PHASE.indexOf(String(st||"Не назначено"))>=0}

// Все задания связки, кроме самого источника: [{congress, task}].
export function linkedEntries(linkId,exceptTaskId){if(!linkId)return[];let out=[];(store.st.congresses||[]).forEach(c=>(c.tasks||[]).forEach(t=>{if(t.linkId===linkId&&t.id!==exceptTaskId)out.push({congress:c,task:t})}));return out}
// Сколько конгрессов в связке ВСЕГО (linkedEntries без второго аргумента
// возвращает всех участников, включая источник).
export function linkCount(linkId){return linkId?linkedEntries(linkId).length:0}

// Перенос содержательных полей из задания-источника во все связанные копии.
export function propagateTask(src){if(!src||!src.linkId)return 0;let n=0;linkedEntries(src.linkId,src.id).forEach(({task})=>{LINK_SHARED_FIELDS.forEach(f=>{let v=src[f];task[f]=(v&&typeof v==="object")?clone(v):v});n++});return n}

// Перенос статуса. Два ограничения, оба обязательны:
//  1) переносим только значения фазы назначения — «Письмо отправлено» в одном
//     конгрессе не должно молча проставиться там, где письмо ещё не ушло;
//  2) не трогаем копии, которые уже ушли дальше по своему пути, иначе откатим
//     конгресс назад.
export function propagateStatus(src){if(!src||!src.linkId)return 0;if(!isAssignmentPhase(src.status))return 0;let n=0;linkedEntries(src.linkId,src.id).forEach(({task})=>{if(!isAssignmentPhase(task.status))return;task.status=src.status;n++});return n}

// Связывать имеет смысл только настоящие задания: разделы программы и строки
// «Музика» не проходят подтверждение и не получают писем.
export function canLink(t){return !!t&&!isSection(t)&&!noAssignmentNeeded(t)}

// ── Сопоставление заданий внутри серии ───────────────────────────────────────
// Для конгрессов, скопированных до появления режима «Копия с общими заданиями».
// Сопоставляем по номеру и теме, а не по позиции в списке: порядок мог
// измениться, а номер сам по себе повторяется в разных разделах программы.
function normKey(v){return String(v==null?"":v).toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ").trim()}
function taskKey(t){return normKey(t.number)+"|"+normKey(t.title)}

// Какие поля разошлись между опорным заданием и найденной парой. Возвращаем
// имена полей, а не «данные различаются»: выбирать вслепую нельзя.
// Номер и тему сравниваем по той же нормализации, по какой искали пару: иначе
// разный регистр в теме и находит пару, и тут же объявляет её расхождением.
const LINK_LOOSE_FIELDS=["number","title"];
export function linkDiffFields(a,b){return LINK_SHARED_FIELDS.filter(f=>{let x=a[f]==null?"":a[f],y=b[f]==null?"":b[f];return LINK_LOOSE_FIELDS.indexOf(f)>=0?normKey(x)!==normKey(y):JSON.stringify(x)!==JSON.stringify(y)})}

// Разбор серии: что с чем совпало, что разошлось, чего не хватает.
// Строка = задание опорного конгресса + найденные пары + приговор:
//   linked    — уже в связке, трогать нечего
//   none      — пары нет ни в одном другом конгрессе
//   ambiguous — в каком-то конгрессе таких заданий больше одного
//   same      — пары найдены и данные совпадают
//   diff      — пары найдены, но часть полей разошлась
export function matchSeriesTasks(seriesId,baseId){
  let all=(store.st.congresses||[]).filter(c=>c.seriesId===seriesId);
  let base=all.find(c=>c.id===baseId)||all[0];
  if(!base||all.length<2)return{base:base||null,congresses:all,rows:[]};
  let others=all.filter(c=>c.id!==base.id);
  let baseDup={};base.tasks.forEach(t=>{if(canLink(t))baseDup[taskKey(t)]=(baseDup[taskKey(t)]||0)+1});
  let rows=[];
  base.tasks.forEach(t=>{
    if(!canLink(t))return;
    let key=taskKey(t),matches=[],missing=[],ambiguous=baseDup[key]>1;
    others.forEach(o=>{
      let cand=(o.tasks||[]).filter(x=>canLink(x)&&taskKey(x)===key);
      if(cand.length===1)matches.push({congress:o,task:cand[0]});
      else if(cand.length>1)ambiguous=true;
      else missing.push(o);
    });
    let diff=[];matches.forEach(m=>{linkDiffFields(t,m.task).forEach(f=>{if(diff.indexOf(f)<0)diff.push(f)})});
    let state=t.linkId?"linked":ambiguous?"ambiguous":!matches.length?"none":diff.length?"diff":"same";
    rows.push({task:t,matches:matches,missing:missing,diff:diff,state:state,total:all.length,found:matches.length+1});
  });
  return{base:base,congresses:all,rows:rows};
}

// Применение: связываем выбранные строки. Если у найденной пары уже есть связка
// (конгресс связан с третьим), входим в неё, а не заводим новую.
export function applySeriesLinks(rows){
  let n=0;
  rows.forEach(r=>{
    let existing=r.matches.map(m=>m.task.linkId).find(Boolean)||r.task.linkId||id();
    r.task.linkId=existing;r.matches.forEach(m=>{m.task.linkId=existing});
    if(r.align)propagateTask(r.task);
    n++;
  });
  if(n)save();
  return n;
}

export function unlinkTask(t){if(t)t.linkId=null;cleanupLinks()}

// Связка из одного участника смысла не имеет (второй конгресс удалили, задание
// удалили, импортировали половину). Снимаем такие linkId, чтобы в данных не
// оставалось висящих ссылок.
export function cleanupLinks(){let cnt={};(store.st.congresses||[]).forEach(c=>(c.tasks||[]).forEach(t=>{if(t.linkId)cnt[t.linkId]=(cnt[t.linkId]||0)+1}));(store.st.congresses||[]).forEach(c=>(c.tasks||[]).forEach(t=>{if(t.linkId&&cnt[t.linkId]<2)t.linkId=null}))}
