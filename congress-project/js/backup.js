// Auto-generated module: backup.js
import { $, $$ } from "./dom.js";
import { icon } from "./icons.js";
import { render } from "./render.js";
import { BACKUP_KEY, makeBackup, row, save, store } from "./state.js";
import { esc, today } from "./utils.js";

export function openBackup(){let a=JSON.parse(localStorage.getItem(BACKUP_KEY)||"[]");$("#backupList").innerHTML=a.length?a.map(x=>`<div class="backup-row"><div><b>${esc(x.label)}</b><br><span class="muted">${esc(new Date(x.date).toLocaleString())}</span></div><button type="button" data-restore="${x.id}" class="light icon-text-btn" title="Восстановить эту резервную копию">${icon("restore")}<span>Восстановить</span></button><button type="button" data-download="${x.id}" class="icon-text-btn" title="Скачать JSON-файл">${icon("download")}<span>Скачать</span></button></div>`).join(""):`<p class="hint">Автокопий пока нет.</p>`;$$("[data-restore]").forEach(b=>b.onclick=()=>{let x=a.find(y=>y.id===b.dataset.restore);if(x&&confirm("Восстановить эту копию?")){makeBackup("Перед восстановлением");store.st=x.data;save();render();$("#backupDialog").close()}});$$("[data-download]").forEach(b=>b.onclick=()=>{let x=a.find(y=>y.id===b.dataset.download);if(x)downloadJSON(x.data,"congress-backup-"+x.date.slice(0,10)+".json")});$("#backupDialog").showModal()}
export function downloadJSON(data,name){let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
export function exportAllData(){downloadJSON(store.st,"congress-data-"+today()+".json")}
