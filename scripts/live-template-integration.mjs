#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PORT = 8141;
const BASE = `http://127.0.0.1:${PORT}`;
/* Первая строка, у которой есть письмо: в демо-программе первой идёт раздел,
   а .ed и .le должны относиться к одному заданию. */
const ROW = '#tasksBody tr:has(.le)';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const server = http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';
  const file=path.join(ROOT,p);if(!file.startsWith(ROOT)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({executablePath:chrome,args:['--no-sandbox']});

async function cleanPage(viewport){
  const ctx=await browser.newContext({viewport});
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  return {ctx,page,errors};
}

try {
  const {ctx,page,errors}=await cleanPage({width:1440,height:1000});
  await page.goto(BASE+'/documents/',{waitUntil:'networkidle'});
  page.once('dialog',d=>d.accept('Live Template Type'));
  await page.click('#newTypeTplBtn');
  await page.waitForSelector('#screenEditor:not([hidden])');
  await page.fill('#edArea','LIVE_BODY {{assignment.title}}');
  await page.locator('#edArea').evaluate(el=>{el.setSelectionRange(0,9);el.focus()});
  await page.locator('#textToolbar [data-mark="**"]').dispatchEvent('mousedown');
  assert.match(await page.inputValue('#edArea'),/^\*\*LIVE_BODY\*\*/);
  await page.click('#saveBtn');
  await page.waitForFunction(()=>document.querySelector('#editorSaveStatus')?.textContent.trim().length>0);
  const templateId=await page.evaluate(()=>CWTemplates.all().find(x=>x.context==='congress.assignment.invitation:Live Template Type')?.id);
  assert.ok(templateId,'custom template was not created');

  await page.goto(BASE+'/congress-project/',{waitUntil:'networkidle'});
  /* Чистый профиль: конгрессов нет (демо больше не создаётся само, 21.10).
     Тест сам создаёт демо-конгресс через пустое состояние — заодно
     проверяет приглашение «Создайте первый конгресс» (аудит 08, п.1, п.6). */
  await page.waitForSelector('#congressEmpty:not([hidden])');
  await page.click('#emptyNewCongressBtn');
  await page.waitForSelector('#newCongressDialog[open]');
  assert.equal(await page.inputValue('#newCongressMode'),'demo');
  await page.click('#createCongressBtn');
  await page.waitForSelector('#tasksBody tr:has(.le) .ed');
  assert.equal(await page.locator('#congressEmpty').isHidden(),true);
  await page.click(ROW+' .ed');
  await page.selectOption('#eLetterTemplate',templateId);
  await page.click('#saveEditBtn');
  await page.click(ROW+' .le');
  await page.waitForSelector('#letterDialog[open]');
  assert.match(await page.locator('#letterPreview').innerText(),/LIVE_BODY/);
  assert.equal(await page.locator('#letterPreview strong').first().innerText(),'LIVE_BODY');

  const before=await page.evaluate(()=>CWDocs.listAll({module:'congress-project'}).then(x=>x.length));
  await page.click('#composerSaveBtn');
  await page.waitForFunction(n=>CWDocs.listAll({module:'congress-project'}).then(x=>x.length>n),before);
  await page.click('#printLetterBtn');
  await page.waitForFunction(n=>CWDocs.listAll({module:'congress-project'}).then(x=>x.length>n),before+1);

  await page.goto(BASE+'/documents/#template/'+encodeURIComponent(templateId),{waitUntil:'networkidle'});
  await page.waitForSelector('#deleteTemplateBtn:not([hidden])');
  page.once('dialog',d=>d.accept());
  await page.click('#deleteTemplateBtn');
  await page.waitForSelector('#screenLibrary:not([hidden])');
  assert.equal(await page.evaluate(id=>CWTemplates.get(id),templateId),null);

  await page.goto(BASE+'/congress-project/',{waitUntil:'networkidle'});
  await page.click(ROW+' .ed');
  assert.equal(await page.inputValue('#eLetterTemplate'),templateId,'deleted selection id must be preserved');
  assert.equal(await page.locator('#eLetterTemplateMissing').isHidden(),false);
  await page.click('#editDialog button[value="cancel"]');
  await page.click(ROW+' .le');
  assert.doesNotMatch(await page.locator('#letterPreview').innerText(),/LIVE_BODY/);
  assert.equal(errors.length,0,'desktop console/page errors: '+errors.join(' | '));
  await ctx.close();

  const mobile=await cleanPage({width:390,height:844});
  await mobile.page.goto(BASE+'/documents/',{waitUntil:'networkidle'});
  await mobile.page.evaluate(async()=>CWTemplates.save('usr.live.mobile','uk',{body:'mobile',context:'congress.assignment.invitation:Mobile',module:'congress-project',format:'text',title:'Mobile'}));
  await mobile.page.reload({waitUntil:'networkidle'});
  /* Библиотека сгруппирована по модулям, раскрыта только первая группа —
     раскрыть ту, где лежит шаблон, как сделал бы пользователь. */
  const head=mobile.page.locator('.doc-group:has([data-open="usr.live.mobile"]) .doc-group__head');
  if(await head.getAttribute('aria-expanded')!=='true')await head.click();
  await mobile.page.click('[data-open="usr.live.mobile"]');
  assert.equal(await mobile.page.locator('#textToolbar').isHidden(),false);
  assert.equal(await mobile.page.locator('#deleteTemplateBtn').isHidden(),false);
  assert.equal(mobile.errors.length,0,'mobile console/page errors: '+mobile.errors.join(' | '));
  await mobile.ctx.close();

  console.log('✓ desktop create → format → select → compose → save/print snapshot → delete → fallback');
  console.log('✓ deleted task reference preserved and reported; mobile text toolbar/delete action visible');
} finally {
  await browser.close();server.close();
}
