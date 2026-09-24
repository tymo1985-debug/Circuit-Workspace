import { A } from "./state.js";
import { isLetterable } from "./utils.js";
import { letterHTML, snapshotLetter } from "./letters.js";
import { t } from "./i18n.js";

const STACK={tag:"Конгрессы",FONTS:[],SETS: {batch:['../shared/vendor/jspdf.umd.min.js','../shared/vendor/html2canvas.min.js']},onError(){alert(t("cong.batch.pdf_failed"))}};
const PAGE={width:794,height:1123};
const ILLEGAL=/[\\/:*?"<>|\u0000-\u001f]/g;
const RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizePdfName(value,fallback="Письмо"){
  let name=String(value==null?"":value).replace(ILLEGAL,"-").replace(/\s+/g," ").trim().replace(/[. ]+$/g,"");
  if(!name||RESERVED.test(name))name=fallback;
  if(name.length>140)name=name.slice(0,140).replace(/[. ]+$/g,"");
  return(name||fallback)+".pdf";
}

export function batchPdfNames(tasks){
  let used=new Map();
  return(tasks||[]).map((task,index)=>{
    let participant=((task.participants||[])[0]||{}).name||"";
    let parts=[task.number?"№"+String(task.number).trim():"",participant,task.title||""].map(x=>String(x).trim()).filter(Boolean);
    let stem=sanitizePdfName(parts.join(" — ")||("Письмо "+(index+1))).slice(0,-4);
    let key=stem.toLocaleLowerCase(),count=(used.get(key)||0)+1;used.set(key,count);
    return stem+(count>1?" ("+count+")":"")+".pdf";
  });
}

export function installBatchPdfActions(){
  let add=(sourceId,id,labelKey,titleKey)=>{
    let source=document.getElementById(sourceId);if(!source||document.getElementById(id))return;
    let button=source.cloneNode(true);button.id=id;button.removeAttribute("data-i18n");
    button.setAttribute("data-i18n-title",titleKey);button.title="Все письма — отдельные PDF";
    let label=button.querySelector("span");if(label){label.setAttribute("data-i18n",labelKey);label.textContent="Все письма — отдельные PDF"}
    source.insertAdjacentElement("afterend",button);
  };
  add("allLettersBtn","separatePdfsBtn","cong.btn.separate_pdfs","cong.title.separate_pdfs");
  add("lettersPrintAllBtn","lettersExportSeparateBtn","cong.btn.separate_pdfs","cong.title.separate_pdfs");
}

async function renderLetterPdf(html){
  if(!self.CWPdfStack||!await self.CWPdfStack.ensure(STACK,"batch")||!self.jspdf||!self.html2canvas)throw new Error("PDF stack unavailable");
  let host=document.createElement("div");
  host.style.cssText="position:fixed;left:-10000px;top:0;width:794px;background:#fff;pointer-events:none";
  host.innerHTML=html;document.body.appendChild(host);
  let article=host.querySelector(".letter-page");
  if(!article){host.remove();throw new Error("Letter HTML unavailable")}
  article.style.margin="0";article.style.boxShadow="none";
  if(document.fonts&&document.fonts.ready)await document.fonts.ready;
  let source=await self.html2canvas(article,{scale:2,backgroundColor:"#fff",logging:false,useCORS:false});
  let pages=Math.max(1,Math.ceil(Math.max(PAGE.height,article.scrollHeight)/PAGE.height));
  let doc=new self.jspdf.jsPDF({unit:"px",format:[PAGE.width,PAGE.height],orientation:"portrait",hotfixes:["px_scaling"]});
  try{
    for(let page=0;page<pages;page++){
      if(page)doc.addPage([PAGE.width,PAGE.height],"portrait");
      let canvas=document.createElement("canvas"),scale=2;
      canvas.width=PAGE.width*scale;canvas.height=PAGE.height*scale;
      let ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(source,0,page*PAGE.height*scale,PAGE.width*scale,PAGE.height*scale,0,0,PAGE.width*scale,PAGE.height*scale);
      doc.addImage(canvas.toDataURL("image/jpeg",0.96),"JPEG",0,0,PAGE.width,PAGE.height,undefined,"FAST");
    }
    return new Uint8Array(doc.output("arraybuffer"));
  }finally{host.remove()}
}

function crc32(bytes){let crc=-1;for(let i=0;i<bytes.length;i++){crc^=bytes[i];for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^-1)>>>0}
function u16(n){return[n&255,(n>>>8)&255]}
function u32(n){return[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
function zipBlob(files){
  let encoder=new TextEncoder(),local=[],central=[],offset=0;
  files.forEach(file=>{
    let name=encoder.encode(file.name),data=file.data,crc=crc32(data);
    let head=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);
    local.push(head,data);
    central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]));
    offset+=head.length+data.length;
  });
  let centralSize=central.reduce((sum,x)=>sum+x.length,0);
  return new Blob([...local,...central,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(centralSize),...u32(offset),...u16(0)])],{type:"application/zip"});
}
function download(blob,name){let url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function zipName(){let base=String(A()?.name||"Конгресс").replace(ILLEGAL,"-").replace(/\s+/g," ").trim()||"Конгресс";return sanitizePdfName(base+" — отдельные письма").replace(/\.pdf$/i,".zip")}

async function exportToDirectory(tasks,names,handle){
  let done=0;
  for(let i=0;i<tasks.length;i++){
    let bytes=await renderLetterPdf(letterHTML(tasks[i],A())),writable;
    try{writable=await(await handle.getFileHandle(names[i],{create:true})).createWritable();await writable.write(bytes);await writable.close();writable=null}
    catch(err){if(writable)await writable.abort().catch(()=>{});throw err}
    await snapshotLetter(tasks[i],"batch-pdf",A());done++;
  }
  return done;
}
async function exportToZip(tasks,names){
  let files=[];
  for(let i=0;i<tasks.length;i++)files.push({name:names[i],data:await renderLetterPdf(letterHTML(tasks[i],A()))});
  download(zipBlob(files),zipName());
  for(let i=0;i<tasks.length;i++)await snapshotLetter(tasks[i],"batch-pdf",A());
  return files.length;
}
export async function exportSeparatePdfs(){
  let tasks=(A()?.tasks||[]).filter(isLetterable);
  if(!tasks.length){alert(t("cong.batch.no_letters"));return 0}
  let names=batchPdfNames(tasks),handle=null,picker=typeof self.showDirectoryPicker==="function";
  if(picker){try{handle=await self.showDirectoryPicker({mode:"readwrite",id:"congress-letter-pdfs"})}catch(err){if(err&&err.name==="AbortError")return 0;console.error("Конгрессы: папка для PDF не выбрана",err);alert(t("cong.batch.export_failed"));return 0}}
  try{
    let count=handle?await exportToDirectory(tasks,names,handle):await exportToZip(tasks,names);
    alert(t(handle?"cong.batch.saved_folder":"cong.batch.saved_zip",{n:count}));return count;
  }catch(err){console.error("Конгрессы: пакетный PDF не создан",err);alert(t("cong.batch.export_failed"));return 0}
}
export const _batchPdfTest={zipBlob,renderLetterPdf,exportToDirectory,exportToZip};
