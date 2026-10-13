import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyResalePreservation,saveVerifiedResaleBackup,compareResaleImport,applyResaleImport,parseResaleWorkbook} from '../resale-import.js';
const original=[{id:'p',name:'FIESTA',tickets:[{id:'t',type:'VIP',number:1,cost:100,salePrice:200,status:'Vendida'}]}];
test('existing sales and tickets cannot disappear or change without an individual decision',()=>{
 assert.throws(()=>verifyResalePreservation(original,[],[],{}));
 const changed=structuredClone(original);changed[0].tickets[0].salePrice=0;
 assert.throws(()=>verifyResalePreservation(original,changed,[],{}));
 assert.equal(verifyResalePreservation(original,original,[],{}),true);
 assert.equal(verifyResalePreservation(original,changed,[{id:'a',ticketId:'t'}],{a:'excel'}),true);
});
test('backup must be saved and read back before importing',()=>{
 const values=new Map(),storage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)};
 saveVerifiedResaleBackup(storage,'backup',{parties:original});
 assert.deepEqual(JSON.parse(storage.getItem('backup')).resale.parties,original);
 assert.throws(()=>saveVerifiedResaleBackup({setItem(){},getItem(){return null;}},'backup',{}));
 assert.throws(()=>saveVerifiedResaleBackup({setItem(){throw Error('quota');}},'backup',{}));
});
test('an incomplete or repeated file preserves existing sales and unrelated tickets',()=>{
 const row={partyName:'FIESTA',type:'EARLY',number:1,cost:80,salePrice:0,status:'Disponible'};
 let n=0;const comparison=compareResaleImport([row],original),decisions=Object.fromEntries(comparison.issues.map(i=>[i.id,i.kind==='new'?'excel':'app']));
 const added=applyResaleImport(original,comparison.issues,decisions,()=>`new-${++n}`);
 verifyResalePreservation(original,added,comparison.issues,decisions);
 const again=compareResaleImport([row],added);
 assert.deepEqual(applyResaleImport(added,again.issues,{},()=>`new-${++n}`),added);
 assert.equal(added[0].tickets.length,2);assert.deepEqual(added[0].tickets[0],original[0].tickets[0]);
 assert.throws(()=>compareResaleImport([row,row],original),/duplicada/);
});
test('purchase quantities absent from Sales block the workbook',()=>{
 const result=parseResaleWorkbook({Compras:[['Fecha compra','Fiesta','Cantidad','Precio compra'],['','','VIP','VIP'],['2026-10-01','FIESTA',2,100]],Ventas:[]});
 assert.ok(result.blockers.some(s=>s.includes('faltan 2')));
});
