import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCarryover} from '../carryover.js';
import {cardPurchasesInMonth,cardMonthSummary} from '../card-summary.js';
import {recentPurchases} from '../reporting.js';
import {mergeSyncSnapshots} from '../sync-merge.js';
const card={id:'card',name:'Visa',type:'Crédito',dueDay:10};
const input={planId:'plan',concept:'Heladera',amount:50000,currency:'ARS',total:12,first:8,firstDue:'2026-11-10'};
test('only remaining installments: 8 to 12, November through March, total 250000',()=>{
 const rows=buildCarryover(input,card);assert.deepEqual(rows.map(e=>e.installment),[8,9,10,11,12]);
 assert.deepEqual(rows.map(e=>e.dueDate.slice(0,7)),['2026-11','2026-12','2027-01','2027-02','2027-03']);
 assert.equal(rows.reduce((s,e)=>s+e.amount,0),250000);
 assert.equal(cardPurchasesInMonth(rows,card,new Date(2026,10,1)).length,0);
 assert.equal(recentPurchases(rows).length,0);
 assert.equal(cardMonthSummary(rows,[],card,new Date(2026,10,1)).dueItems[0].amount,50000);
});
test('February clamps day without losing March anchor, USD supported',()=>{
 const rows=buildCarryover({...input,currency:'USD',firstDue:'2027-01-31'},card);
 assert.deepEqual(rows.slice(0,3).map(e=>new Date(e.dueDate).getDate()),[31,28,31]);assert.equal(rows[0].currency,'USD');
});
test('invalid values reject before mutation',()=>{
 for(const change of [{amount:0},{amount:-1},{amount:Infinity},{first:0},{first:13},{first:1.5},{total:121},{currency:'EUR'},{firstDue:'2026-02-30'},{firstDue:''},{concept:''}])assert.throws(()=>buildCarryover({...input,...change},card));
});
test('edit keeps identities and unknown fields; repeated construction is idempotent',()=>{
 const original=buildCarryover(input,card);original[0].custom='keep';
 const edited=buildCarryover({...input,amount:60000},card,original);
 assert.equal(edited[0].custom,'keep');assert.equal(edited[0].id,original[0].id);assert.equal(original[0].amount,50000);
 assert.deepEqual(buildCarryover(input,card),buildCarryover(input,card));
});
test('existing synchronization preserves carryover fields and independent expenses',()=>{
 const base={expenses:[{id:'personal',amount:20}],resale:{parties:[]}};
 const local=structuredClone(base);local.expenses.push(...buildCarryover(input,card));
 const result=mergeSyncSnapshots(base,local,base);assert.equal(result.conflicts.length,0);
 assert.ok(JSON.stringify(result).includes('carryoverFirstDue'));
});

test('commit guards backup, persists plans once, preserves other data, rolls back failure and deletes to trash',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('function commitCarryover('),source.indexOf("document.addEventListener('click',event=>{",source.indexOf('function commitCarryover(')));
 for(const mode of ['success','backup-fail','save-fail','delete']){
  const rows=buildCarryover(input,card),original={expenses:[{id:'other',amount:100,custom:'yes'},...(mode==='delete'?rows:[])],resale:{parties:[{id:'party'}]},settings:{},trash:[]};
  const state=structuredClone(original),storage=new Map();let saves=0;
  const context={carryoverContext:{planId:'plan',rows:mode==='delete'?[]:rows,original:JSON.stringify(mode==='delete'?rows:[]),remove:mode==='delete'},state,cloneState:()=>structuredClone(state),STORAGE_KEY:'state',uid:()=> 'backup',localStorage:{setItem(k,v){if(mode==='backup-fail'&&k.includes('before-carryover'))throw Error('full');storage.set(k,v);},getItem:k=>storage.get(k)},save(){saves++;if(mode==='save-fail')return false;storage.set('state',JSON.stringify(state));return true;},restoreState:s=>{Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,structuredClone(s));},persistIndexedSnapshot:async()=>{},structuredClone,$:()=>({close(){},textContent:''}),render(){},feedback(){},showToast(){},expenseTrashPositions:()=>[]};
  vm.createContext(context);vm.runInContext(body,context);context.commitCarryover();
  if(mode.endsWith('fail'))assert.deepEqual(state,original);
  else {assert.deepEqual(state.resale,original.resale);assert.deepEqual(state.expenses[0],original.expenses[0]);assert.equal(state.expenses.length,mode==='delete'?1:6);assert.deepEqual(JSON.parse(storage.get('state-before-carryover-backup')),original);if(mode==='delete')assert.equal(state.trash[0].items.length,5);context.commitCarryover();assert.equal(saves,1);}
 }
});
