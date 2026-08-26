// Auto-generated module: main.js
import { exportAllData, openBackup } from "./backup.js";
import { applyLinkSeries, createNew, createSeries, openCongressSettings, openNew, openNewSeries, saveCongressSettings } from "./congress.js";
import { collectList, collectProfiles, openList, openProfiles, renderListPreview, saveList, saveProfiles } from "./directories.js";
import { $, $$ } from "./dom.js";
import { init as initI18n, t } from "./i18n.js";
import { allLetters, copyComposerText, openLetter, openLettersMode, printLetter, saveComposerToArchive, toggleComposerEdit, openDocsArchive } from "./letters.js";
import { openPrintColumns, planFitReduce, planFitRotate, planFitTwoPages, planFitZoom, printSelectedPlan } from "./plan.js";
import { printWithOrientation } from "./printing.js";
import { render, renderLists, renderSettings, renderTasks } from "./render.js";
import { A, KEY, S, adoptTemplates, baseSettings, demo, flushNow, initState, isValidState, load, makeBackup, migrate, newC, save, store } from "./state.js";
import { addTask, checkProgram, drawParts, duplicateCurrent, getParts, saveEdit } from "./tasks.js";
import { openMatchReport } from "./matching.js";
import { initMobile } from "./mobile.js";
import { initTopbarMenu } from "./topbar-menu.js";
import { addMin, clean, clone, id, isLetterable, isSection, today, tv } from "./utils.js";

/* Заметное, но НЕ блокирующее сообщение. Место то же, что у ошибки запуска:
   заводить второй компонент ради одного случая незачем, а alert посреди
   загрузки пришлось бы закрывать до того, как человек поймёт, о чём речь.
   Заведено под перенос шаблонов: до 26.08.2026 его отказ уходил только в
   консоль, то есть не существовал для пользователя вовсе. */
export function showStartupNotice(text){let b=$("#errorBox");if(!b)return;b.textContent=text;b.classList.remove("hidden")}
window.onerror=(m,u,l,c,e)=>{let b=$("#errorBox");if(b){b.textContent="Ошибка JavaScript: "+m+"\nСтрока: "+l+"\n"+(e&&e.stack?e.stack:"");b.classList.remove("hidden")}};
export function clearSelectionIfOutside(e){if(!store.sel)return;if(e.target.closest('dialog,.program-table,.sidebar,button,input,select,textarea,label,.md-topbar-v2,.md-menu'))return;store.sel=null;renderTasks()}
export function bind(){initTopbarMenu();document.addEventListener('click',clearSelectionIfOutside);$("#newSeriesBtn").onclick=openNewSeries;$("#createSeriesBtn").onclick=createSeries;$("#newCongressBtn").onclick=()=>openNew();$("#createCongressBtn").onclick=createNew;$("#lsApplyBtn").onclick=applyLinkSeries;$("#congressSettingsBtn").onclick=openCongressSettings;$("#saveCongressSettingsBtn").onclick=saveCongressSettings;$("#letterSettingsBtn").onclick=()=>{renderSettings();$("#letterSettingsDialog").showModal()};$("#directoryBtn").onclick=()=>openList("groups");$("#speakersBtn").onclick=openProfiles;$("#typesBtn").onclick=()=>openList("types");$("#saveProfilesBtn").onclick=saveProfiles;$("#collectProfilesBtn").onclick=collectProfiles;$("#saveListBtn").onclick=saveList;$("#collectListBtn").onclick=collectList;$("#matchDirectoryBtn").onclick=openMatchReport;$("#sortListBtn").onclick=()=>{$("#listEditor").value=clean($("#listEditor").value.split(/\n/)).join("\n");renderListPreview()};$("#clearListBtn").onclick=()=>{if(confirm(t("cong.confirm.clear_list"))){$("#listEditor").value="";renderListPreview()}};$("#docsArchiveBtn").onclick=openDocsArchive;$("#backupBtn").onclick=openBackup;$("#downloadBackupBtn").onclick=exportAllData;$("#resetAppBtn").onclick=()=>{if(confirm(t("cong.confirm.reset_all"))){
// Единственная копия перед необратимым сбросом — та, что makeBackup() как раз
// пишет. С фазы 4 запись асинхронна, поэтому сброс ЖДЁТ её и не идёт дальше,
// если копия не легла: стереть всё, не сохранив копию, — ровно тот бесшумный
// отказ, ради которого копия и заведена. Это единственное место, где ожидание
// обязательно; остальные вызовы makeBackup() ничего не ждут, потому что после
// них данные остаются на месте.
makeBackup("cong.msg.before_reset").then(ok=>{if(!ok){alert(t("cong.alert.backup_failed"));return}
localStorage.removeItem(KEY);store.st={congresses:[],activeId:null,settings:baseSettings(),series:[]};newC(t("cong.msg.first_congress"),"SZ Warszawa","2026-11-07",demo());
// Сброс обязан дойти до диска сразу: newC() ставит запись в очередь, а
// пользователь после «стереть всё» вполне может тут же закрыть вкладку.
flushNow("reset");render()})}};$("#deleteCongressBtn").onclick=()=>{let c=A();if(c&&confirm(t("cong.confirm.delete_congress",{name:c.name}))){makeBackup("cong.backup.before_delete_congress");store.st.congresses=store.st.congresses.filter(x=>x.id!==c.id);store.st.activeId=store.st.congresses[0]?.id||null;save();render()}};$("#addTaskBtn").onclick=()=>addTask(store.sel,false);$("#addSectionBtn").onclick=()=>addTask(store.sel,true);$("#checkProgramBtn").onclick=checkProgram;$("#lettersModeBtn").onclick=openLettersMode;$("#lettersPrintAllBtn").onclick=allLetters;$("#lettersMarkAllBtn").onclick=()=>{A().tasks.forEach(t=>{if(isLetterable(t)){t.letterSent=true;t.letterSentDate=today();t.status="Письмо отправлено"}});save();renderTasks();openLettersMode()};$("#printPlanBtn").onclick=()=>openPrintColumns();$("#printSelectedPlan").onclick=printSelectedPlan;$("#planFitZoomBtn").onclick=planFitZoom;$("#planFitReduceBtn").onclick=planFitReduce;$("#planFitTwoPagesBtn").onclick=planFitTwoPages;$("#planFitRotateBtn").onclick=planFitRotate;$("#orientationPrintBtn").onclick=()=>{let o=$("#printOrientation").value;$("#orientationDialog").close();printWithOrientation(store.pendingPrintHTML,o,store.pendingPrintFilename)};$("#saveEditBtn").onclick=saveEdit;$("#duplicateTaskBtn").onclick=()=>duplicateCurrent(false);$("#duplicateTaskEmptyBtn").onclick=()=>duplicateCurrent(true);$("#addEditParticipant").onclick=()=>{let p=getParts();p.push({name:"",congregation:""});drawParts(p)};$("#quickTime").onchange=e=>{if(e.target.value)$("#eTime").value=tv(e.target.value)};$("#timeMinus").onclick=()=>$("#eTime").value=addMin($("#eTime").value,-5);$("#timePlus").onclick=()=>$("#eTime").value=addMin($("#eTime").value,5);$("#timeClear").onclick=()=>$("#eTime").value="";$("#printLetterBtn").onclick=printLetter;$("#composerEditBtn").onclick=toggleComposerEdit;$("#composerCopyBtn").onclick=copyComposerText;$("#composerSaveBtn").onclick=saveComposerToArchive;$("#allLettersBtn").onclick=allLetters;$("#previewTemplateBtn").onclick=()=>{let task=A().tasks.find(x=>!isSection(x))||A().tasks[0];if(task)openLetter(task.id)};$("#resetLetterBtn").onclick=()=>{if(confirm(t("cong.confirm.reset_letter"))){store.st.settings=baseSettings();save();renderSettings();renderLists()}};["congressName","congressPlace","congressDate"].forEach(id=>$("#"+id).oninput=e=>{let c=A(),m={congressName:"name",congressPlace:"place",congressDate:"date"};c[m[id]]=e.target.value;save();render()});["letterFont","letterFontSize"].forEach(id=>$("#"+id).oninput=e=>{let m={letterFont:"font",letterFontSize:"fontSize"};S()[m[id]]=e.target.value;save()});$("#letterLanguage").onchange=e=>{self.CWDocLang?.set(e.target.value);renderSettings()};{let m={senderName:"name",senderCode:"code",senderEmail:"email",senderPhone1:"phone1",senderPhone2:"phone2",senderAddress:"address"};Object.keys(m).forEach(id=>$("#"+id).oninput=e=>{self.CWSender?.set({[m[id]]:e.target.value})})}$("#exportBtn").onclick=exportAllData;$("#importInput").onchange=e=>{let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onerror=()=>alert(t("cong.alert.file_unreadable"));r.onload=()=>{let prev=clone(store.st);try{let parsed=JSON.parse(r.result);if(!isValidState(parsed)){alert(t("cong.alert.not_a_backup"));return}makeBackup("cong.msg.before_import");store.st=parsed;migrate();store.st.activeId=store.st.activeId||store.st.congresses[0]?.id;save();render()}catch(err){store.st=prev;alert(t("cong.alert.import_failed",{error:err.message}))}finally{e.target.value=""}};r.readAsText(f)};window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();store.deferredPrompt=e;$("#installBtn").classList.remove("hidden")});$("#installBtn").onclick=()=>{if(store.deferredPrompt){store.deferredPrompt.prompt();store.deferredPrompt=null;$("#installBtn").classList.add("hidden")}};if(typeof CWUpdate!=="undefined")CWUpdate.init({swUrl:"service-worker.js"});setInterval(save,5*60*1000);window.addEventListener("beforeunload",e=>{if($$("dialog[open]").length){e.preventDefault();e.returnValue=""}})}
document.addEventListener("DOMContentLoaded",()=>{try{self.CWDocLang?.init({module:"congress-project",langs:["uk","ru","de"],apply:false});bind();initI18n(render);
// Данные лежат в общей базе (фаза 3), а чтение IndexedDB асинхронно — значит
// load() должен дождаться. У ожидания есть предел внутри CWState: недоступная
// или заблокированная база означает работу на прежнем ключе, а не «модуль не
// открылся». Сбой на этом пути показывается в том же errorBox, что и сбой
// синхронного запуска: молча белого экрана быть не должно.
// Шаблоны писем живут в общем хранилище (фаза 2). Чтение асинхронное, но
// запуск модуля его НЕ ждёт: чтение стартует ЗДЕСЬ, параллельно с состоянием,
// а до готовности pickTemplate() читает прежний источник.
let templatesReady=self.CWTemplates?.init?.()||Promise.resolve();
initState().then(()=>{load();initMobile();
// ⚠️ Перенос идёт ПОСЛЕ load(), а не по готовности хранилища. Раньше это были
// две несвязанные цепочки, и цепочка шаблонов стабильно приходила первой:
// adoptTemplates() читал ещё дефолтное store.st, не находил правленых
// шаблонов, молча возвращал false и больше не повторялся — то есть перенос
// не выполнялся НИКОГДА. Разбор: docs/documents/02-templates-migration-audit.md.
// Своя ветка ошибок обязательна: сбой переноса не должен уходить в errorBox
// запуска, модуль при нём работает на прежнем источнике.
templatesReady.then(()=>adoptTemplates()).then(res=>{if(res==="failed")showStartupNotice(t("cong.alert.templates_move_failed"))}).catch(e=>console.error("Конгрессы: хранилище шаблонов недоступно",e));
}).catch(e=>{let b=$("#errorBox");if(b){b.textContent="Ошибка запуска: "+e.message+"\n"+e.stack;b.classList.remove("hidden")}});
// Общий справочник собраний (фаза 5, шаг 5) подпитывает автодополнение поля
// собрания. Запуск его НЕ ждёт: до готовности datalist ровно прежний, а после
// перерисовывается. Модуль в справочник не пишет — обратная запись выключена
// намеренно, иначе опечатки из свободного поля утекали бы в общий слой.
self.CWDirectory?.init?.().then(ok=>{if(ok)renderLists()}).catch(e=>console.error("Конгрессы: справочник собраний недоступен",e));
// Соседняя вкладка или Клиндарий поправили карточку — список обновляется без
// перезагрузки. Событие приходит через маячок cw-directory-rev.
self.CWDirectory?.onChange?.(()=>renderLists())}catch(e){let b=$("#errorBox");b.textContent="Ошибка запуска: "+e.message+"\n"+e.stack;b.classList.remove("hidden")}})
