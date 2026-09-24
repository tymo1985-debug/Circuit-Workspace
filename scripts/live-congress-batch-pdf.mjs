#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const OUT=path.join(ROOT,"tmp","congress-batch-live");
const chrome=process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".woff2":"font/woff2"};
await fs.rm(OUT,{recursive:true,force:true});await fs.mkdir(OUT,{recursive:true});
const server=http.createServer(async(req,res)=>{
  try{let pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname),file=path.join(ROOT,pathname==="/"?"index.html":pathname);if(pathname.endsWith("/"))file=path.join(ROOT,pathname,"index.html");let data=await fs.readFile(file);res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream"});res.end(data)}
  catch{res.writeHead(404);res.end("not found")}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port,browser=await chromium.launch({executablePath:chrome,headless:true,args:["--proxy-bypass-list=<-loopback>"]});
const context=await browser.newContext({acceptDownloads:true});
const page=await context.newPage(),errors=[];
page.on("console",m=>{if(m.type()==="error")errors.push("console: "+m.text())});
page.on("pageerror",e=>errors.push("pageerror: "+e.message));
page.on("requestfailed",r=>errors.push("request: "+r.url()+" "+r.failure()?.errorText));
page.on("dialog",d=>d.accept());
await page.exposeFunction("__liveWritePdf",async(name,data)=>fs.writeFile(path.join(OUT,name),Buffer.from(data)));
await page.goto(`http://127.0.0.1:${port}/congress-project/`,{waitUntil:"networkidle",timeout:30000});
await page.waitForSelector("#separatePdfsBtn",{state:"attached"});
await page.evaluate(async()=>{
  const state=await import("./js/state.js");
  await self.CWTemplates.ready();
  await self.CWTemplates.save("usr.live.explicit","uk",{context:"live.explicit",module:"congress-project",format:"text",title:"Live explicit",body:"{{sender.name}}\n\n**EXPLICIT** №{{assignment.number}} — {{assignment.participant}}\n\n{{assignment.title}}"});
  await self.CWTemplates.save("usr.live.type","uk",{context:"congress.assignment.invitation:Промова",module:"congress-project",format:"text",title:"Live type",body:"{{sender.name}}\n\n*TYPE* №{{assignment.number}} — {{assignment.participant}}\n\n{{assignment.title}}"});
  self.CWDocLang.set("uk");self.CWSender.set({name:"Live Sender"});
  const tasks=[
    state.row({number:"12",title:"Речь / вступление",type:"Промова",participants:[{name:"Иван Иванов",congregation:"A"}],letterTemplateId:"usr.live.explicit"}),
    state.row({number:"18",title:"Интервью",type:"Промова",participants:[{name:"Сергей Петров",congregation:"B"}]}),
    state.row({number:"23",title:"Показ",type:"Показ",participants:[{name:"Андрей Коваль",congregation:"C"}]}),
  ];
  state.store.st.congresses=[];state.store.st.activeId=null;
  state.newC("Live Congress","Prague","2026-10-10",tasks);
  state.store.st.settings.font="Georgia, serif";state.store.st.settings.fontSize="18";
  state.flushNow("live-batch-test");
});

await page.evaluate(()=>{self.showDirectoryPicker=async()=>({getFileHandle:async name=>({createWritable:async()=>{let bytes=[];return{write(data){bytes=Array.from(data)},close(){return self.__liveWritePdf(name,bytes)},abort(){bytes=[]}}}})})});
await page.click("#printMenuBtn");await page.click("#separatePdfsBtn");
await page.waitForFunction(()=>document.querySelector("#printMenu").hidden,{timeout:10000}).catch(()=>{});
for(let i=0;i<50;i++){if((await fs.readdir(OUT)).filter(x=>x.endsWith(".pdf")).length===3)break;await new Promise(r=>setTimeout(r,100))}
const pdfs=(await fs.readdir(OUT)).filter(x=>x.endsWith(".pdf")).sort();
if(pdfs.length!==3)throw new Error("directory branch: expected 3 PDFs, got "+pdfs.length+"\n"+errors.join("\n"));
for(const file of pdfs){let data=await fs.readFile(path.join(OUT,file));if(data.subarray(0,5).toString()!=="%PDF-")throw new Error(file+" is not a PDF")}

await page.evaluate(()=>{delete self.showDirectoryPicker});
await page.click("#printMenuBtn");
const downloadPromise=page.waitForEvent("download");
await page.click("#separatePdfsBtn");
const download=await downloadPromise,zipPath=path.join(OUT,"fallback.zip");
await download.saveAs(zipPath);
const archiveCount=await page.evaluate(async()=>{let rows=await self.CWDocs.listAll({module:"congress-project"});return rows.filter(x=>(x.reasons||[x.reason]).includes("batch-pdf")).length});
if(archiveCount!==3)throw new Error("archive: expected 3 snapshots, got "+archiveCount);
if(errors.length)throw new Error(errors.join("\n"));
await page.screenshot({path:path.join(OUT,"congress.png"),fullPage:true});
console.log(JSON.stringify({pdfs,zip:path.basename(zipPath),archiveCount,output:OUT},null,2));
await browser.close();await new Promise(resolve=>server.close(resolve));
