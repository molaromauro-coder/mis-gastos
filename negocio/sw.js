const CACHE='entradas-static-v1';
const FILES=['./','./index.html','./app.js','./session.js','./metrics.js','./workbook.js','./template-export.js','./template-layout.js','./excel-rates.js','./sellers.js','./sellers-ui.js','./simulator.js','./simulator-ui.js','./business.css','./manifest.webmanifest','./icon.svg','../styles.css?v=156','../numeric-format.js','../resale-import.js','../negocio-model.js','../sync-config.js','../sync-engine.js?v=156','../sync-merge.js','../data-safety.js','../vendor/supabase-2.57.4.js','../vendor/xlsx-0.20.3.js'];
const allowed=new Set(FILES.map(p=>new URL(p,self.location).href));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!allowed.has(e.request.url))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&r.type==='basic'){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(()=>caches.match(e.request).then(r=>r||Response.error())));});
