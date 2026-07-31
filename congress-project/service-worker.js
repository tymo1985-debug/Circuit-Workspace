const CACHE='congress-pwa-v43-stable-deploy-cache';
const ASSETS=['./','./index.html','./styles.css','./manifest.json','./icon-192.png','./icon-512.png',
'./js/main.js','./js/state.js','./js/render.js','./js/tasks.js','./js/congress.js','./js/directories.js',
'./js/letters.js','./js/plan.js','./js/printing.js','./js/template-editor.js','./js/backup.js',
'./js/utils.js','./js/dom.js','./js/icons.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('./index.html')))));
