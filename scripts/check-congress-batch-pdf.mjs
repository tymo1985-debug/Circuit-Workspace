#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>fs.readFileSync(path.join(ROOT,p),"utf8");
let failures=0;
function ok(condition,label){console.log((condition?"✓":"✗")+" "+label);if(!condition)failures++}

globalThis.self=globalThis;
globalThis.localStorage={getItem(){return null},setItem(){},removeItem(){}};
const batch=await import("../congress-project/js/batch-pdf.js");
const source=read("congress-project/js/batch-pdf.js");
const letters=read("congress-project/js/letters.js");
const main=read("congress-project/js/main.js");
const html=read("congress-project/index.html");
const sw=read("congress-project/service-worker.js");

const names=batch.batchPdfNames([
  {number:"12",title:"Речь / вступление",participants:[{name:"Иван:* Петров"}]},
  {number:"12",title:"Речь / вступление",participants:[{name:"Иван:* Петров"}]},
  {number:"",title:"",participants:[]},
]);
ok(names[0]==="№12 — Иван-- Петров — Речь - вступление.pdf","имя PDF читаемо и безопасно");
ok(names[1]==="№12 — Иван-- Петров — Речь - вступление (2).pdf","коллизия разрешается детерминированно");
ok(names[2]==="Письмо 3.pdf","пустые поля получают стабильный fallback");
ok(/export function allLetters\(\)/.test(letters)&&/askOrientation\("Печать всех писем"/.test(letters),"исходный allLetters не заменён");
ok(/installBatchPdfActions\(\)/.test(main)&&/separatePdfsBtn/.test(source),"новое действие устанавливается рядом с печатью");
ok(/showDirectoryPicker/.test(source)&&/getFileHandle/.test(source)&&/createWritable/.test(source),"ветка directory picker записывает отдельные файлы");
ok(/typeof self\.showDirectoryPicker/.test(source)&&/zipBlob\(files\)/.test(source)&&/\.zip/.test(source),"при отсутствии picker используется один ZIP");
ok(/filter\(isLetterable\)/.test(source),"экспорт использует тот же критерий letterable");
ok(/renderLetterPdf\(letterHTML\(tasks\[i\],A\(\)\)\)/.test(source),"PDF строится из канонического letterHTML активного конгресса");
ok(/await writable\.close\(\)[\s\S]{0,120}snapshotLetter/.test(source),"snapshot папки вызывается только после успешной записи");
ok(/download\(zipBlob\(files\)[\s\S]{0,180}snapshotLetter/.test(source),"snapshot ZIP вызывается только после успешной сборки");
ok(/for\(let i=0;i<tasks\.length;i\+\+\)files\.push/.test(source)&&/return files\.length/.test(source),"число PDF равно числу экспортируемых писем");
ok(/letterTemplateId/.test(letters)&&/pickTemplateInfo\(task\)/.test(letters),"explicit letterTemplateId проходит через текущую template-selection logic");
ok(html.includes("../shared/pdfstack.js")&&sw.includes("./js/batch-pdf.js")&&sw.includes("../shared/vendor/jspdf.umd.min.js")&&sw.includes("../shared/vendor/html2canvas.min.js"),"PDF stack и новый модуль доступны offline");

if(failures){console.error("\nCongress batch PDF gate: FAIL ("+failures+")");process.exit(1)}
console.log("\nCongress batch PDF gate: OK");
