import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseResaleTable} from '../resale-import.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function worker(){
 const handlers={},puts=[],deleted=[],entries=new Map();let online=true;
 const cache={addAll:async()=>{},put:async(k,v)=>{puts.push(typeof k==='string'?k:k.url);entries.set(typeof k==='string'?k:k.url,v);},match:async k=>entries.get(typeof k==='string'?k:k.url)};
 const ctx={URL,Set,Promise,Response,console,self:{location:{href:'https://example.com/mis-gastos/sw.js'},addEventListener:(k,v)=>handlers[k]=v,skipWaiting(){},clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>['mis-gastos-v154','other-project-cache'],delete:async k=>deleted.push(k)},fetch:async()=>{if(!online)throw Error('offline');return {ok:true,type:'basic',clone(){return 'static-response';}};}};
 vm.runInNewContext(read('sw.js'),ctx);
 async function request(url,{method='GET',mode='cors'}={}){
  let response;const work=[];handlers.fetch({request:{url,method,mode},respondWith:p=>response=p,waitUntil:p=>work.push(p)});
  const value=await response;await Promise.all(work);return {intercepted:!!response,value};
 }
 return {handlers,puts,deleted,entries,request,offline(){online=false;}};
}
test('service worker leaves auth, database, external and nonstatic requests outside its caches',async()=>{
 const w=worker();for(const url of ['https://iksqhsbesqjdtkjjqpvt.supabase.co/auth/v1/user','https://iksqhsbesqjdtkjjqpvt.supabase.co/rest/v1/sync_heads','https://dolarapi.com/v1/dolares/oficial','https://example.com/other-project/app.js','https://example.com/mis-gastos/api/private'])assert.equal((await w.request(url)).intercepted,false);
 assert.equal((await w.request('https://example.com/mis-gastos/app.js',{method:'POST'})).intercepted,false);assert.equal(w.puts.length,0);
});
test('navigation uses canonical HTML cache without tokens or query strings; scripts never receive HTML on failure',async()=>{
 const w=worker();await w.request('https://example.com/mis-gastos/?code=private-code',{mode:'navigate'});
 assert.deepEqual(w.puts,['https://example.com/mis-gastos/index.html']);w.offline();
 assert.equal((await w.request('https://example.com/mis-gastos/',{mode:'navigate'})).value,'static-response');
 const missing=await w.request('https://example.com/mis-gastos/app.js?v=155');assert.equal(missing.value.type,'error');
});
test('cache cleanup retains unrelated apps and never accesses financial localStorage or IndexedDB',async()=>{
 const w=worker();let pending;w.handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(w.deleted,['mis-gastos-v154']);
 assert.doesNotMatch(read('sw.js'),/localStorage|indexedDB/);
});
test('CSP rejects remote scripts, eval, inline scripts, frames and plugins; recovery and Excel remain local',()=>{
 const html=read('index.html');assert.match(html,/script-src 'self';/);assert.match(html,/object-src 'none'/);assert.match(html,/base-uri 'none'/);assert.match(html,/frame-src 'none'/);assert.match(html,/name="referrer" content="no-referrer"/);
 const app=read('app.js');assert.doesNotMatch(app,/https:\/\/(cdn.jsdelivr.net|unpkg.com)/);assert.match(app,/vendor\/xlsx-0.20.3.js/);assert.doesNotMatch(app,/<script>window.onload/);assert.match(app,/\$\{escape\(detailLabel\)\}/);assert.match(app,/<small>\$\{escape\(e.currency\)\}/);
});
test('official pinned Excel reader preserves real workbook amounts, dates, accents and ticket states',()=>{
 const source=read('vendor/xlsx-0.20.3.js');assert.equal(createHash('sha256').update(source).digest('hex'),'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41');
 const ctx={console};vm.runInNewContext(source,ctx);const X=ctx.XLSX;assert.equal(X.version,'0.20.3');
 const rows=[['FIESTA','FECHA FIESTA','TIPO ENTRADA','N° ENTRADA','COSTO COMPRA','PRECIO VENTA','ESTADO'],['PRUEBA Á','26/12/26','VIP',1,12345.67,22000,'VENDIDA'],['PRUEBA Á','26/12/26','EARLY',2,11000,0,'USO PERSONAL']];
 const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),'Ventas');
 const bytes=X.write(wb,{type:'array',bookType:'xlsx'}),roundtrip=X.read(bytes,{type:'array'}),decoded=X.utils.sheet_to_json(roundtrip.Sheets.Ventas,{header:1,defval:'',raw:true});
 assert.equal(JSON.stringify(decoded),JSON.stringify(rows));
 const parsed=parseResaleTable(decoded,[],2026);assert.equal(parsed.warnings.length,0);assert.equal(parsed.rows[0].cost,12345.67);assert.equal(parsed.rows[0].salePrice,22000);assert.equal(parsed.rows[0].date,'2026-12-26');assert.deepEqual(parsed.rows.map(r=>r.status),['Vendida','Uso personal']);
});
