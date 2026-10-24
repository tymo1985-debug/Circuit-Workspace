import { A } from "./state.js";
import { isLetterable } from "./utils.js";
import { letterHTML, snapshotLetter } from "./letters.js";
import { t } from "./i18n.js";

/* PDF собирается ТЕКСТОМ (решение Алекса 21.10.2026, п.26 аудита): раньше лист
   растрировался через html2canvas — текст не выделялся, файлы были тяжёлыми, а
   граница страницы могла разрезать строку пополам. Шрифт — общий шрифт PDF
   Noto Sans, обычный и настоящий жирный (Ф6 визуального аудита 24.10.2026;
   прежде — DejaVu одним начертанием, жирный рисовался обводкой контура). */
const STACK={tag:"Конгрессы",FONTS:[],SETS: {batch:['../shared/vendor/jspdf.umd.min.js','../shared/fonts/noto-sans-pdf-regular.js','../shared/fonts/noto-sans-pdf-bold.js']},onError(){alert(t("cong.batch.pdf_failed"))}};
/* Геометрия .letter-page (794×1123 px, поля 92/100/70) в пунктах A4: 1 px = 0,75 pt. */
const PT=0.75,PAGE={width:595.28,height:841.89},PAD={top:92*PT,side:100*PT,bottom:70*PT};
/* Тот же набор глифов, что в субсете шрифта: символ вне набора jsPDF молча
   обрезает вместе с остатком строки (см. pioneer-school/js/export/pdfExport.js). */
const FONT_SAFE=/[^\x20-\x7E\u00A0-\u017F\u0400-\u04FF\u2013\u2014\u2018-\u201E\u2026\u2116]/g;
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
    button.setAttribute("data-i18n-title",titleKey);button.title=t(titleKey);
    let label=button.querySelector("span");if(label){label.setAttribute("data-i18n",labelKey);label.textContent=t(labelKey)}
    source.insertAdjacentElement("afterend",button);
  };
  add("allLettersBtn","separatePdfsBtn","cong.btn.separate_pdfs","cong.title.separate_pdfs");
  add("lettersPrintAllBtn","lettersExportSeparateBtn","cong.btn.separate_pdfs","cong.title.separate_pdfs");
}

/** Абзацы письма → строки слов с признаком жирного. <br> — принудительный перенос. */
function letterRuns(article){
  let paras=[];
  article.querySelectorAll("p").forEach(p=>{
    let runs=[];
    let walk=(node,bold)=>{
      node.childNodes.forEach(ch=>{
        if(ch.nodeType===3)runs.push({text:ch.nodeValue,bold});
        else if(ch.nodeType===1){
          let tag=ch.tagName;
          if(tag==="BR")runs.push({br:true});
          else walk(ch,bold||tag==="STRONG"||tag==="B");
        }
      });
    };
    walk(p,false);
    paras.push({runs,header:p.classList.contains("letter-header")});
  });
  return paras;
}

async function renderLetterPdf(html){
  if(!self.CWPdfStack||!await self.CWPdfStack.ensure(STACK,"batch")||!self.jspdf||!self.PDF_FONT_NOTO_SANS||!self.PDF_FONT_NOTO_SANS_BOLD)throw new Error("PDF stack unavailable");
  let host=document.createElement("div");
  host.style.cssText="position:fixed;left:-10000px;top:0;width:794px;pointer-events:none";
  host.innerHTML=html;document.body.appendChild(host);
  try{
    let article=host.querySelector(".letter-page");
    if(!article)throw new Error("Letter HTML unavailable");
    let px=parseFloat(article.style.fontSize)||17,size=px*PT,lineH=size*1.32,paraGap=14*PT,headerGap=8*PT;
    let doc=new self.jspdf.jsPDF({unit:"pt",format:"a4",orientation:"portrait"});
    doc.addFileToVFS("NotoSans.ttf",self.PDF_FONT_NOTO_SANS);
    doc.addFont("NotoSans.ttf","NotoSans","normal");
    doc.addFileToVFS("NotoSans-Bold.ttf",self.PDF_FONT_NOTO_SANS_BOLD);
    doc.addFont("NotoSans-Bold.ttf","NotoSans","bold");
    doc.setFont("NotoSans","normal");doc.setFontSize(size);doc.setTextColor(0);doc.setDrawColor(0);doc.setLineWidth(size*0.035);
    let left=PAD.side,right=PAGE.width-PAD.side,width=right-left,bottom=PAGE.height-PAD.bottom,y=PAD.top;
    /* Ширина — тем начертанием, которым токен будет нарисован. */
    let w=tok=>{doc.setFont("NotoSans",tok.bold?"bold":"normal");return doc.getTextWidth(tok.text)};
    letterRuns(article).forEach(para=>{
      /* Слова с признаком жирного; пробелы остаются отдельными токенами, чтобы
         ширина строки совпадала с тем, что рисуется. */
      let lines=[[]],lineW=0;
      let push=(tok)=>{
        let tw=w(tok);
        if(/^\s+$/.test(tok.text)){if(!lines[lines.length-1].length)return;lines[lines.length-1].push(tok);lineW+=tw;return}
        if(lineW+tw>width&&lines[lines.length-1].length){
          let cur=lines[lines.length-1];while(cur.length&&/^\s+$/.test(cur[cur.length-1].text))cur.pop();
          lines.push([]);lineW=0;
        }
        lines[lines.length-1].push(tok);lineW+=tw;
      };
      para.runs.forEach(run=>{
        if(run.br){lines.push([]);lineW=0;return}
        String(run.text||"").replace(/\s+/g," ").replace(FONT_SAFE,"-").split(/( )/).forEach(part=>{if(part)push({text:part,bold:run.bold})});
      });
      lines.forEach(line=>{
        while(line.length&&/^\s+$/.test(line[line.length-1].text))line.pop();
        if(y+lineH>bottom){doc.addPage("a4","portrait");y=PAD.top}
        let total=line.reduce((n,tok)=>n+w(tok),0),x=para.header?right-total:left;
        line.forEach(tok=>{
          let tw=w(tok);
          if(!/^\s+$/.test(tok.text))doc.text(tok.text,x,y,{baseline:"top"});
          x+=tw;
        });
        y+=lineH;
      });
      y+=para.header?headerGap:paraGap;
    });
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
