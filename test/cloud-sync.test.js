import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSyncSnapshots,syncSnapshot,sameSyncValue} from '../sync-merge.js';
import {createSyncEngine} from '../sync-engine.js';

const expense=(id,amount=100)=>({id,amount,concept:'Compra',currency:'ARS'});
const snapshot=(expenses=[])=>({expenses,categories:['KIOSCO'],resale:{parties:[]},settings:{},custom:{unknown:'conservar'}});
test('first link unions both devices; empty remote does not delete local data',()=>{
  const local=snapshot([expense('phone')]),remote=snapshot([expense('pc')]);
  const result=mergeSyncSnapshots(null,local,remote);
  assert.equal(result.conflicts.length,0);
  assert.deepEqual(new Set(result.state.expenses.map(e=>e.id)),new Set(['phone','pc']));
  assert.equal(mergeSyncSnapshots(null,local,snapshot()).state.expenses.length,1);
  assert.equal(result.state.custom.unknown,'conservar');
});
test('independent simultaneous edits combine without duplication on retry',()=>{
  const base=snapshot([expense('a'),expense('b')]);
  const local=structuredClone(base),remote=structuredClone(base);
  local.expenses[0].amount=200;remote.expenses[1].amount=300;
  const m=mergeSyncSnapshots(base,local,remote);
  assert.equal(m.conflicts.length,0);assert.deepEqual(m.state.expenses.map(e=>e.amount),[200,300]);
  assert.equal(mergeSyncSnapshots(base,m.state,remote).state.expenses.length,2);
});
test('concurrent edits to the same field preserve both values and require a decision',()=>{
  const base=snapshot([expense('a')]),local=snapshot([expense('a',200)]),remote=snapshot([expense('a',300)]);
  const m=mergeSyncSnapshots(base,local,remote);assert.equal(m.conflicts.length,1);
  assert.equal(m.conflicts[0].local,200);assert.equal(m.conflicts[0].remote,300);
  assert.equal(mergeSyncSnapshots(base,local,remote,{[m.conflicts[0].id]:'remote'}).state.expenses[0].amount,300);
});
test('authorized deletion propagates; deletion versus new edit requires review',()=>{
  const base=snapshot([expense('a')]);
  assert.equal(mergeSyncSnapshots(base,snapshot(),base).state.expenses.length,0);
  const m=mergeSyncSnapshots(base,snapshot(),snapshot([expense('a',200)]));
  assert.equal(m.conflicts.length,1);assert.equal(m.conflicts[0].localDeleted,true);
});
test('nested tickets sync independently of personal expenses and retain unknown metadata',()=>{
  const base=snapshot([expense('a')]);base.resale.parties=[{id:'party',name:'Fiesta',tickets:[{id:'t',cost:10,status:'Disponible',customNote:'keep'}]}];
  const local=structuredClone(base),remote=structuredClone(base);local.expenses[0].amount=400;remote.resale.parties[0].tickets[0].status='Vendida';
  const m=mergeSyncSnapshots(base,local,remote);assert.equal(m.conflicts.length,0);assert.equal(m.state.expenses[0].amount,400);assert.equal(m.state.resale.parties[0].tickets[0].customNote,'keep');assert.equal(m.state.resale.parties[0].tickets[0].status,'Vendida');
});
test('device security never leaves the device; unknown business settings do',()=>{
  const s=snapshot();s.security={pinHash:'private',credentialId:'device'};s.settings={lastSafeSaveAt:'date',lastSafeExpenseCount:1,newSetting:'keep'};
  const out=syncSnapshot(s);assert.equal(out.security,undefined);assert.equal(out.settings.lastSafeSaveAt,undefined);assert.equal(out.settings.newSetting,'keep');
  assert.ok(sameSyncValue({b:2,a:1},{a:1,b:2}));
});
function fixture({local=snapshot([expense('local')]),remote=null,base=null,archiveFail=false,verifyFail=false,race=false}={}) {
  let checkpoint=base?{state:base,revision:1}:null,status='',commits=0,applies=0,archives=0;
  const versions=new Map();let reads=0;
  const engine=createSyncEngine({getLocal:()=>structuredClone(local),getCheckpoint:()=>checkpoint,
    readRemote:async(revision)=>{reads++;if(race&&reads===1)local.expenses.push(expense('during-fetch'));return revision?(verifyFail?null:versions.get(revision)):structuredClone(remote);},
    archiveLocal:async()=>{archives++;if(archiveFail)throw Error('quota');},
    commitRemote:async(expected,state)=>{commits++;if((remote?.revision||0)!==expected)return {conflict:true};remote={revision:expected+1,state:structuredClone(state)};versions.set(remote.revision,remote);return {conflict:false,revision:remote.revision};},
    applyLocal:async state=>{applies++;local=structuredClone(state);},saveCheckpoint:async value=>{checkpoint=value;},status:value=>{status=value;},onConflicts:()=>{}});
  return {engine,result:()=>({local,remote,checkpoint,status,commits,applies,archives})};
}
test('engine reads back remote write before marking synced; repeat causes no extra commit',async()=>{
  const f=fixture();await f.engine.run();assert.equal(f.result().status,'synced');assert.ok(f.result().archives);await f.engine.run();assert.equal(f.result().commits,1);
});
test('backup failure blocks remote write and local replacement',async()=>{
  const f=fixture({archiveFail:true});await f.engine.run();assert.equal(f.result().commits,0);assert.equal(f.result().applies,0);assert.equal(f.result().status,'error');
});
test('failed readback never reports success or advances checkpoint',async()=>{
  const f=fixture({verifyFail:true});await f.engine.run();assert.equal(f.result().status,'error');assert.equal(f.result().checkpoint,null);
});
test('expense added while reading remote is retained',async()=>{
  const f=fixture({race:true,remote:{revision:1,state:snapshot([expense('remote')])}});await f.engine.run();
  assert.equal(f.result().status,'synced');assert.deepEqual(new Set(f.result().local.expenses.map(e=>e.id)),new Set(['local','remote','during-fetch']));
});
test('conflicts cannot commit until user decisions match current snapshots',async()=>{
  const base=snapshot([expense('a')]),f=fixture({base,local:snapshot([expense('a',200)]),remote:{revision:2,state:snapshot([expense('a',300)])}});
  await f.engine.run();assert.equal(f.result().status,'conflict');assert.equal(f.result().commits,0);assert.equal(f.result().applies,0);assert.equal(f.result().archives,1);
});

test('reviewed decisions survive unrelated changes without dropping any expense or ticket sale',async()=>{
 const local=snapshot([expense('phone')]),remote=snapshot([expense('pc')]);local.settings.reminderDays=[3,2,1];remote.settings.reminderDays=[5,3,2,1,0];
 local.resale.parties=[{id:'camel',tickets:[{id:'t1',status:'Vendida',salePrice:65000}]}];remote.resale.parties=[{id:'camel',tickets:[{id:'t1',status:'Disponible',salePrice:0}]}];
 const conflicts=mergeSyncSnapshots(null,local,remote).conflicts,choices=Object.fromEntries(conflicts.map(c=>[c.id,'local']));
 const resolution={conflicts,choices,local:structuredClone(local),remote:structuredClone(remote)};
 remote.settings.usdRateCache={fetchedAt:'newer'};remote.expenses.push(expense('new-pc'));
 const f=fixture({local,remote:{revision:1,state:remote}});await f.engine.run(resolution);
 const result=f.result();assert.equal(result.status,'synced');assert.deepEqual(new Set(result.local.expenses.map(e=>e.id)),new Set(['phone','pc','new-pc']));
 assert.deepEqual(result.local.resale.parties[0].tickets[0],{id:'t1',status:'Vendida',salePrice:65000});assert.equal(result.local.custom.unknown,'conservar');
});
test('changed conflicting values invalidate just that decision and prevent all financial writes',async()=>{
 const local=snapshot([expense('a',200)]),remote=snapshot([expense('a',300)]);local.settings.reminderDays=[3];remote.settings.reminderDays=[5];
 const conflicts=mergeSyncSnapshots(null,local,remote).conflicts,resolution={conflicts,choices:Object.fromEntries(conflicts.map(c=>[c.id,'local']))};
 remote.expenses[0].amount=400;
 const f=fixture({local,remote:{revision:1,state:remote}});await f.engine.run(resolution);
 assert.equal(f.result().status,'conflict');assert.equal(f.result().commits,0);assert.equal(f.result().applies,0);assert.equal(f.result().local.expenses[0].amount,200);
});
test('decisions cannot silently authorize deletion or a new conflict after review',async()=>{
 const local=snapshot([expense('a',200)]),remote=snapshot([expense('a',300)]),conflicts=mergeSyncSnapshots(null,local,remote).conflicts;
 const f=fixture({base:snapshot([expense('a')]),local:snapshot(),remote:{revision:2,state:remote}});
 await f.engine.run({conflicts,choices:{[conflicts[0].id]:'remote'}});
 assert.equal(f.result().status,'conflict');assert.equal(f.result().commits,0);assert.equal(f.result().applies,0);
});
