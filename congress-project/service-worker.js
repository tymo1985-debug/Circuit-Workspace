// Congress Project — service worker модуля.
// Имя кэша привязано к версии модуля: при выпуске новой версии достаточно
// поднять APP_VERSION, и вернувшийся пользователь получит свежую оболочку,
// а не бесконечно закэшированную старую.
const APP_VERSION='4.24.0';
const CACHE='congress-pwa-v'+APP_VERSION;
// Cache Storage общий на origin: удаляем только СВОИ кэши по префиксу, иначе
// активация этого SW стирала офлайн-кэши хаба и остальных модулей.
const CACHE_PREFIX='congress-pwa-';
const ASSETS=['./','./index.html','./styles.css','./manifest.json','./favicon-32.png','./icon-192.png','./icon-512.png','./icon-maskable-512.png',
// Общий слой (стили + шрифты) — index.html ссылается на ../shared/style.css.
'../shared/style.css','../shared/nav.js',
'../shared/theme.js','../shared/backup.js',
'../shared/fonts/roboto-latin-400-normal.woff2','../shared/fonts/roboto-latin-500-normal.woff2',
'../shared/fonts/roboto-cyrillic-400-normal.woff2','../shared/fonts/roboto-cyrillic-500-normal.woff2',
'./js/main.js',
'./js/topbar-menu.js','./js/state.js','./js/render.js','./js/tasks.js','./js/congress.js','./js/directories.js',
'./js/letters.js','./js/plan.js','./js/plan-fit.js','./js/printing.js','./js/template-editor.js','./js/backup.js',
'./js/utils.js','./js/dom.js','./js/icons.js','./js/i18n.js',
// Локализация: словарь модуля и общий слой хаба. Без них офлайн-запуск
// остался бы без переводов, а js/i18n.js — без CWI18n.
'./i18n/dict.js','../shared/i18n.js',
  '../shared/sender.js',
  '../shared/doclang.js','../shared/i18n/common.js','../shared/version.js'];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',e=>{
  const request=e.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  e.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    try{
      return await fetch(request);
    }catch(err){
      // Офлайн-фолбэк только для переходов по страницам. Раньше index.html
      // отдавался в ответ на ЛЮБОЙ неудавшийся запрос — включая .js и .css,
      // из-за чего браузер получал HTML вместо скрипта и приложение падало
      // с невнятной ошибкой парсинга вместо честной сетевой ошибки.
      if(request.mode==='navigate'){
        const shell=await caches.match('./index.html');
        if(shell)return shell;
      }
      return Response.error();
    }
  })());
});
