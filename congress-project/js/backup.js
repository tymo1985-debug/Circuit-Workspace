// Auto-generated module: backup.js
import { $, $$ } from "./dom.js";
import { icon } from "./icons.js";
import { render } from "./render.js";
import { getBackup, listBackups, makeBackup, row, save, store } from "./state.js";
import { esc, today } from "./utils.js";
import { t } from "./i18n.js";

/* Список автокопий с фазы 4 приходит из общей базы шапками — без самих
   состояний. Поэтому «Восстановить» и «Скачать» читают копию по требованию,
   и оба обработчика асинхронные. Порядок восстановления прежний: сначала
   копия ТЕКУЩЕГО состояния (makeBackup снимает нагрузку синхронно), потом
   замена. */
export function openBackup(){let a=listBackups(),by={};a.forEach(x=>{by[x.id]=x});
$("#backupList").innerHTML=a.length?a.map(x=>`<div class="backup-row"><div><b>${esc(x.label)}</b><br><span class="muted">${esc(new Date(x.at).toLocaleString())}</span></div><button type="button" data-restore="${esc(x.id)}" class="light icon-text-btn" title="${esc(t("cong.title.restore_backup"))}">${icon("restore")}<span>${esc(t("cong.btn.restore"))}</span></button><button type="button" data-download="${esc(x.id)}" class="icon-text-btn" title="${esc(t("cong.title.download_json"))}">${icon("download")}<span>${esc(t("cong.btn.download"))}</span></button></div>`).join(""):`<p class="hint">${esc(t("cong.hint.no_backups"))}</p>`;
$$("[data-restore]").forEach(b=>b.onclick=()=>{if(!confirm(t("cong.confirm.restore_backup")))return;
// Кнопку гасим на время чтения: второй клик запустил бы второе
// восстановление поверх первого.
b.disabled=true;getBackup(b.dataset.restore).then(data=>{
if(!data){b.disabled=false;alert(t("cong.alert.backup_unreadable"));return}
makeBackup(t("cong.msg.before_restore"));store.st=data;save();render();$("#backupDialog").close()})});
$$("[data-download]").forEach(b=>b.onclick=()=>{let x=by[b.dataset.download];b.disabled=true;
getBackup(b.dataset.download).then(data=>{b.disabled=false;
if(!data){alert(t("cong.alert.backup_unreadable"));return}
downloadJSON(data,"congress-backup-"+new Date(x?x.at:Date.now()).toISOString().slice(0,10)+".json")})});
$("#backupDialog").showModal()}
export function downloadJSON(data,name){let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
export function exportAllData(){downloadJSON(store.st,"congress-data-"+today()+".json")}
