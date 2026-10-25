const CACHE = 'mis-gastos-v160';
const FILES = ['./fixed-dedup.js', './vendor/xlsx-0.20.3.js', './account-access.js', './account-access.js?v=160', './password-recovery.js', './password-recovery.js?v=160', './access-lock.js', './access-lock.js?v=160', './cloud-sync.js', './cloud-sync.js?v=160', './sync-merge.js', './sync-engine.js', './sync-engine.js?v=160', './sync-config.js', './vendor/supabase-2.57.4.js', './', './index.html', './styles.css', './app.js', './parser.js', './reporting.js', './finance.js', './card-summary.js', './data-safety.js', './expense-edit.js', './display-controls.js', './display-controls.js?v=160', './category-display.js', './category-learning.js', './numeric-format.js', './expense-reset.js', './pending-validation.js', './feature-visibility.js', './feature-visibility.js?v=160', './resale-excel-oct11.js', './resale-excel-oct11.js?v=160', './resale-import.js', './resale-import.js?v=160', './resale.js', './resale.js?v=160', './resale-import.js?v=131', './app.js?v=160', './styles.css?v=160', './manifest.webmanifest', './icons/icon.svg', './icons/apple-touch-icon.png'];
const BASE = new URL('./',self.location.href);
const STATIC_PATHS = new Set(FILES.map(path=>new URL(path,BASE).pathname));
const INDEX = new URL('./index.html',BASE).href;
self.addEventListener('install',event=>{
  self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));
});
self.addEventListener('activate',event=>{
  // These caches contain app assets, never financial storage or IndexedDB backups.
  event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>/^mis-gastos-v\d+$/.test(key)&&key!==CACHE).map(key=>caches.delete(key))))]));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  // Auth/API responses and resources outside this app never enter Cache Storage.
  if(request.method!=='GET'||url.origin!==BASE.origin||!STATIC_PATHS.has(url.pathname))return;
  const navigation=request.mode==='navigate';
  const cacheKey=navigation?INDEX:request;
  event.respondWith((async()=>{
    try{
      const response=await fetch(request,{cache:'no-cache'});
      if(response.ok&&response.type==='basic'){
        const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(cacheKey,copy)).catch(()=>{}));
      }
      return response;
    }catch{
      const cache=await caches.open(CACHE),cached=await cache.match(cacheKey);
      return cached||Response.error();
    }
  })());
});
