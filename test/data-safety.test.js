import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {isValidSnapshot,chooseSnapshot,protectExpenseRecords,createSafetyEnvelope,readSafetyEnvelope,snapshotInventory} from '../data-safety.js';
const full={expenses:[{id:'expense',amount:30000,currency:'ARS',date:'2026-10-09',dueDate:'2026-11-10'}],cards:[{id:'card',name:'Francés',type:'Crédito',closingDate:'2026-10-20',dueDate:'2026-11-10'}],cardPayments:[{id:'payment',cardId:'card',date:'2026-10-09',amount:1000,currency:'ARS'}],categories:['HOGAR 🏠'],subcategories:{'HOGAR 🏠':['Luz💡']},stock:[{id:'stock',amount:10}],recoveries:[{id:'recovery',amount:500}],budgets:{'2026-10':50000},recurring:[{id:'recurring'}],fixedExpenses:[{id:'fixed'}],trash:[{id:'trash',items:[{id:'deleted',amount:10}]}],settings:{lastSafeSaveAt:'2026-10-09T10:00:00Z',userCategoryBaseVersion:1},security:{enabled:false},resale:{parties:[{id:'party',tickets:[{id:'ticket',salePrice:65000,status:'Vendida'}]}]}};
test('complete backup roundtrip preserves every field, all card dates and ticket sale values',async()=>{
 const before=structuredClone(full);const file=await createSafetyEnvelope(full);assert.deepEqual(await readSafetyEnvelope(JSON.stringify(file)),full);assert.deepEqual(full,before);
 assert.equal(file.inventory.pagosTarjeta,1);assert.equal(file.inventory.entradas,1);assert.match(file.integrity.digest,/^[a-f0-9]{64}$/);
});
test('tampered or incomplete files are rejected before restoration',async()=>{
 const file=await createSafetyEnvelope(full);file.state.expenses[0].amount=1;
 await assert.rejects(readSafetyEnvelope(JSON.stringify(file)),/alterado o incompleto/);
 const missing=await createSafetyEnvelope(full);delete missing.state.cards;
 await assert.rejects(readSafetyEnvelope(JSON.stringify(missing)),/alterado o incompleto/);
 await assert.rejects(readSafetyEnvelope('{broken'));
});
test('legacy complete backups remain importable without changing their records',async()=>{
 assert.deepEqual(await readSafetyEnvelope(JSON.stringify({format:'mis-gastos-backup-v2',state:full})),full);
 assert.deepEqual(await readSafetyEnvelope(JSON.stringify(full)),full);
 await assert.rejects(readSafetyEnvelope(JSON.stringify({state:{expenses:[],cards:'invalid'}})));
});
test('a backup containing only cards, stock or resale is valid and recoverable',()=>{
 const only={...full,expenses:[],settings:{lastSafeSaveAt:'2026-10-10T10:00:00Z'}};
 assert.ok(isValidSnapshot(only));assert.equal(chooseSnapshot([full,only]),only);assert.equal(snapshotInventory(only).tarjetas,1);
});
test('recovery prefers the latest complete state over older states with more expenses',()=>{
 const older={...full,expenses:[...full.expenses,{id:'extra'}],settings:{lastSafeSaveAt:'2026-10-08T10:00:00Z'}};
 assert.equal(chooseSnapshot([older,full]),full);
 assert.equal(chooseSnapshot([{expenses:[],cards:null},full]),full);
});
test('partial accidental expense loss is prevented while current edits and card dates remain unchanged',()=>{
 const previous=structuredClone(full);previous.expenses.push({id:'second',amount:500});
 const current=structuredClone(full);current.expenses[0].concept='edited';const cards=structuredClone(current.cards);
 const result=protectExpenseRecords(previous,current);assert.equal(result.missing.length,1);assert.equal(current.expenses.length,2);assert.equal(current.expenses[0].concept,'edited');assert.deepEqual(current.cards,cards);
});
test('moving expenses to trash or intentionally deleting them keeps the requested behavior',()=>{
 const next=structuredClone(full);next.expenses=[];next.trash.push({id:'newtrash',items:full.expenses});
 assert.equal(protectExpenseRecords(full,next).missing.length,0);
 const deleted=structuredClone(full);deleted.expenses=[];assert.equal(protectExpenseRecords(full,deleted,true).missing.length,0);assert.equal(deleted.expenses.length,0);
});
test('restoring a missing primary reads IndexedDB before seeds and first startup save',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.ok(source.indexOf('chooseSnapshot(await allIndexedSnapshots())')<source.indexOf('const state = loadState()'));
 assert.ok(source.indexOf('const state = loadState()')<source.indexOf('seedDemoCardsOnce();'));
 const start=source.indexOf('function bestLocalSnapshot()'),end=source.indexOf('function permitDestructiveWriteOnce',start);
 const context={safeStoredValue:(key)=>key==='main'?JSON.stringify(full):null,STORAGE_KEY:'main',BACKUP_KEY:'backup',parseStoredState:(raw)=>JSON.parse(raw),isValidSnapshot,chooseSnapshot,localHistorySnapshots:()=>[],startupSafetySnapshot:null};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);assert.deepEqual(context.bestLocalSnapshot(),full);
 context.safeStoredValue=()=>null;context.startupSafetySnapshot=full;assert.equal(context.bestLocalSnapshot(),full);
});
test('sequential IndexedDB writes await transaction completion and preserve each rapid save',async()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=source.indexOf('function persistIndexedSnapshot'),end=source.indexOf('async function latestIndexedSnapshot',start);
 const written=[];let active=0,maxActive=0;
 const context={structuredClone,Date,window:{},openSafetyDb:async()=>({close(){},transaction(){active++;maxActive=Math.max(maxActive,active);let req;const tx={objectStore:()=>({put:(record)=>written.push(record),getAllKeys:()=>{req={};return req;},delete(){}})};setTimeout(()=>{req.result=[];req.onsuccess();active--;tx.oncomplete();},5);return tx;}})};
 vm.createContext(context);vm.runInContext('let indexedWriteTail=Promise.resolve(true),lastIndexedTimestamp=0;'+source.slice(start,end),context);
 const first=context.persistIndexedSnapshot(full), second=context.persistIndexedSnapshot({...full,expenses:[{id:'different',amount:2}]});
 assert.equal(await first,true);assert.equal(await second,true);assert.equal(maxActive,1);assert.equal(written.length,2);assert.ok(written[1].ts>written[0].ts);assert.equal(written[0].snapshot.expenses[0].amount,30000);
});
test('updating uses the current access, blocks unverifiable saves, and never creates another icon',async()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=source.indexOf('async function updateWithoutDeleting'),end=source.indexOf('function restoreSnapshot',start);
 let reloaded=0,updated=0;const button={disabled:false};let messages=[];
 const context={$:()=>button,save:()=>true,indexedWriteTail:Promise.resolve(true),navigator:{serviceWorker:{getRegistration:async()=>({update:async()=>updated++})}},location:{reload:()=>reloaded++},showToast:(message)=>messages.push(message)};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);await context.updateWithoutDeleting();assert.equal(reloaded,1);assert.equal(updated,1);
 context.save=()=>false;await context.updateWithoutDeleting();assert.equal(reloaded,1);assert.equal(updated,1);assert.equal(button.disabled,false);assert.match(messages[0],/verificar/);
});
test('full restoration copies the provided snapshot before clearing state and preserves state identity',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=source.indexOf('function cloneState('),end=source.indexOf('function settingsHasChanges',start);
 const state={expenses:[{id:'old'}],cards:[{id:'oldcard'}],settings:{}};const identity=state;const backup=structuredClone(full);const context={state,structuredClone};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 context.restoreState(backup);assert.equal(context.state,identity);assert.deepEqual(state,full);assert.deepEqual(backup,full);
 context.restoreState(state);assert.deepEqual(state,full);
 context.structuredClone=undefined;context.restoreState(full);assert.deepEqual(JSON.parse(JSON.stringify(state)),full);
});
test('quota failure in backup history does not block saving or verifying the primary record',async()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=source.indexOf('const save = () =>'),end=source.indexOf('function normalizedRecoveryText',start);
 const stored=new Map([['main',JSON.stringify(full)]]);const state=structuredClone(full);state.expenses.push({id:'new',amount:9});
 const captures=[];const context={state,structuredClone,Date,STORAGE_KEY:'main',BACKUP_KEY:'backup',HISTORY_KEY:'history',safeStoredValue:(key)=>stored.get(key)||null,localStorage:{setItem(key,value){if(key!=='main')throw Error('QuotaExceededError');stored.set(key,value);}},parseStoredState:JSON.parse,localHistorySnapshots:()=>[],retainedExpenseCount:(s)=>s.expenses.length+(s.trash||[]).flatMap((r)=>r.items||[]).length,window:{},isValidSnapshot,protectExpenseRecords,destructiveWriteAllowed:false,renderDataSafetyStatus(){},persistIndexedSnapshot:async(snapshot)=>{captures.push(snapshot);return true;}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'globalThis.commit=save;',context);assert.equal(context.commit(),true);
 assert.equal(JSON.parse(stored.get('main')).expenses.length,2);assert.deepEqual(JSON.parse(stored.get('main')).cards,full.cards);assert.equal(captures.length,1);assert.equal(context.window.__misGastosLocalBackupError,true);
 context.localStorage.setItem=()=>{throw Error('QuotaExceededError');};state.expenses.push({id:'not-yet-local',amount:3});assert.equal(context.commit(),false);assert.equal(context.window.__misGastosPrimaryWriteError,true);assert.equal(JSON.parse(stored.get('main')).expenses.length,2);assert.equal(captures.at(-1).expenses.length,3);
});
test('cold startup recovers the entire IndexedDB snapshot before normal initialization',async()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=source.indexOf('function bestLocalSnapshot()'),end=source.indexOf('function demoCardId',start);
 let recovered=false;const context={STORAGE_KEY:'main',BACKUP_KEY:'backup',safeStoredValue:()=>null,parseStoredState:(s)=>s?JSON.parse(s):null,localHistorySnapshots:()=>[],isValidSnapshot,chooseSnapshot,structuredClone,allIndexedSnapshots:async()=>{await Promise.resolve();recovered=true;return [structuredClone(full)];}};
 vm.createContext(context);const state=await vm.runInContext('(async()=>{'+source.slice(start,end)+'return state;})()',context);
 assert.ok(recovered);assert.deepEqual(state.expenses,full.expenses);assert.deepEqual(state.cards,full.cards);assert.deepEqual(state.resale.parties,full.resale.parties);assert.deepEqual(state.cardPayments,full.cardPayments);
});
