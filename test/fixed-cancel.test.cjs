const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function setup(failure){
 const item={id:'f',concept:'Internet'};
 const state={fixedExpenses:[item],expenses:[{id:'a',parentId:'p',fixedExpenseId:'f',fixedExpenseMonth:'2026-10',amount:50,extra:'keep'},{id:'b',parentId:'p',fixedExpenseId:'f',fixedExpenseMonth:'2026-10',amount:50},{id:'past',fixedExpenseId:'f',fixedExpenseMonth:'2026-09',amount:20},{id:'other',amount:30}],trash:[],resale:{keep:true}};
 const records=new Map();let notified=0,rendered=0,feedbackCount=0;
 const els={'#cancelFixedPaymentMessage':{},'#confirmCancelFixedPayment':{disabled:false},'#cancelFixedPaymentDialog':{open:false,showModal(){this.open=true;},close(){this.open=false;}}};
 const ctx=vm.createContext({state,Set,Date,JSON,structuredClone,STORAGE_KEY:'test',uid:()=> 'id',cloneState:()=>structuredClone(state),restoreState:s=>Object.assign(state,s),confirm:()=>{throw Error('Native confirm must not run');},$:key=>els[key],money:n=>'$ '+n,fixedExpenseAmountForMonth:()=>100,feedback:()=>{feedbackCount++;},localStorage:{setItem:(k,v)=>{if(failure==='backup')throw Error('full');records.set(k,v);},getItem:k=>failure==='backup-read'?'bad':records.get(k)},save:()=>{if(failure==='save')return false;records.set('test',JSON.stringify(state));notified++;return true;},persistIndexedSnapshot:async()=>{},expenseTrashPositions:(all,items)=>items.map(e=>({id:e.id,index:all.indexOf(e)})),settingsSnapshot:null,mirrorResetIntoSnapshot(){},render(){rendered++;},refreshExpenseDetailViews(){},showToast(){}});
 vm.runInContext('let fixedPaymentCancellation=null;',ctx);
 for(const name of ['fixedExpensePayments','cancelFixedExpensePayment','commitFixedExpenseCancellation']){const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+1);vm.runInContext(source.slice(a,b),ctx);}
 ctx.isFixedExpenseMasterCategory=()=>false;
 return {state,item,ctx,records,els,feedbackCount:()=>feedbackCount,notified:()=>notified,rendered:()=>rendered};
}
test('cancel removes linked installments together, keeps other months and business, backs up and notifies once',()=>{
 const s=setup(),before=JSON.stringify(s.state);s.ctx.cancelFixedExpensePayment(s.item,'2026-10');s.ctx.commitFixedExpenseCancellation();
 assert.deepEqual(s.state.expenses.map(e=>e.id),['past','other']);assert.equal(s.ctx.fixedExpensePayments(s.item,'2026-10').length,0);
 assert.equal(s.state.trash[0].items.length,2);assert.equal(s.state.trash[0].items[0].extra,'keep');assert.equal(s.state.resale.keep,true);
 assert.equal(s.records.get('test-before-cancel-payment-id'),before);assert.equal(s.notified(),1);assert.equal(s.rendered(),1);
 s.ctx.cancelFixedExpensePayment(s.item,'2026-10');s.ctx.commitFixedExpenseCancellation();assert.equal(s.state.trash.length,1);assert.equal(s.notified(),1);
 s.state.expenses.push(...s.state.trash[0].items);assert.equal(s.ctx.fixedExpensePayments(s.item,'2026-10').length,2);
});
for(const failure of ['backup','backup-read','save'])test('failed '+failure+' preserves entire original state',()=>{const s=setup(failure),before=JSON.stringify(s.state);s.ctx.cancelFixedExpensePayment(s.item,'2026-10');s.ctx.commitFixedExpenseCancellation();assert.equal(JSON.stringify(s.state),before);assert.equal(s.notified(),0);});
test('pressing Cancelar pago opens the app dialog without modifying data or using native confirm',()=>{
 const s=setup(),before=JSON.stringify(s.state);s.ctx.cancelFixedExpensePayment(s.item,'2026-10');
 assert.equal(JSON.stringify(s.state),before);assert.equal(s.records.size,0);assert.equal(s.els['#cancelFixedPaymentDialog'].open,true);
 assert.match(s.els['#cancelFixedPaymentMessage'].textContent,/100.*Internet.*2026-10/);
 assert.equal(s.notified(),0);
});
test('changed payment while confirmation is open cannot cancel unseen edits',()=>{
 const s=setup();s.ctx.cancelFixedExpensePayment(s.item,'2026-10');s.state.expenses[0].amount=150;
 const before=JSON.stringify(s.state);s.ctx.commitFixedExpenseCancellation();
 assert.equal(JSON.stringify(s.state),before);assert.equal(s.notified(),0);assert.equal(s.els['#cancelFixedPaymentDialog'].open,false);
});
test('successful confirmation signals completion once and a repeated tap cannot delete more',()=>{
 const s=setup();s.ctx.cancelFixedExpensePayment(s.item,'2026-10');s.ctx.commitFixedExpenseCancellation();s.ctx.commitFixedExpenseCancellation();
 assert.equal(s.notified(),1);assert.equal(s.feedbackCount(),1);assert.equal(s.els['#cancelFixedPaymentDialog'].open,false);
});
function tapSetup(){
 const handlers={},button={disabled:false,addEventListener:(name,fn)=>{handlers[name]=fn;}};let called=0;
 const ctx=vm.createContext({Date,Math});const a=source.indexOf('function bindFixedPaymentTap('),b=source.indexOf('\nfunction ',a+1);vm.runInContext(source.slice(a,b),ctx);ctx.bindFixedPaymentTap(button,()=>called++);
 const point=(x=10,y=10)=>({clientX:x,clientY:y});
 const event=(x=10,y=10)=>({touches:[],changedTouches:[point(x,y)],preventDefault(){},stopPropagation(){}});
 return {handlers,button,point,event,called:()=>called};
}
test('iPhone touch opens confirmation once even if Safari sends a click afterwards',()=>{
 const s=tapSetup();s.handlers.touchstart({touches:[s.point()]});s.handlers.touchend(s.event());s.button.onclick(s.event());assert.equal(s.called(),1);
});
test('scrolling over the cancel button does not trigger cancellation',()=>{
 const s=tapSetup();s.handlers.touchstart({touches:[s.point()]});s.handlers.touchmove({touches:[s.point(10,60)]});s.handlers.touchend(s.event(10,60));assert.equal(s.called(),0);
});
test('keyboard click works and disabled buttons do nothing',()=>{
 const s=tapSetup();s.button.onclick(s.event());assert.equal(s.called(),1);s.button.disabled=true;s.button.onclick(s.event());assert.equal(s.called(),1);
});
test('real guarded save persists cancellation without resurrecting the payment and queues sync',async()=>{
 const safety=await import('../data-safety.js');const s=setup();s.state.settings={};s.records.set('test',JSON.stringify(s.state));let synced=0;
 Object.assign(s.ctx,{...safety,safeStoredValue:k=>s.records.get(k),parseStoredState:raw=>JSON.parse(raw||'null'),BACKUP_KEY:'backup',HISTORY_KEY:'history',localHistorySnapshots:()=>[],window:{},retainedExpenseCount:snapshot=>snapshot.expenses.length+snapshot.trash.reduce((n,r)=>n+r.items.length,0),renderDataSafetyStatus(){},cloudSyncController:{notify(){synced++;}}});
 vm.runInContext('let destructiveWriteAllowed=false;',s.ctx);
 const a=source.indexOf('const save = () => {'),b=source.indexOf('\nfunction normalizedRecoveryText',a);
 vm.runInContext(source.slice(a,b).replace('const save =','save ='),s.ctx);
 s.ctx.cancelFixedExpensePayment(s.item,'2026-10');s.ctx.commitFixedExpenseCancellation();
 const stored=JSON.parse(s.records.get('test'));assert.deepEqual(stored.expenses.map(e=>e.id),['past','other']);assert.equal(stored.trash[0].items.length,2);assert.equal(synced,1);assert.equal(stored.resale.keep,true);
});
