const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function setup(failure,confirmValue=true){
 const item={id:'f',concept:'Internet'};
 const state={fixedExpenses:[item],expenses:[{id:'a',parentId:'p',fixedExpenseId:'f',fixedExpenseMonth:'2026-10',amount:50,extra:'keep'},{id:'b',parentId:'p',fixedExpenseId:'f',fixedExpenseMonth:'2026-10',amount:50},{id:'past',fixedExpenseId:'f',fixedExpenseMonth:'2026-09',amount:20},{id:'other',amount:30}],trash:[],resale:{keep:true}};
 const records=new Map();let notified=0,rendered=0;
 const ctx=vm.createContext({state,Set,Date,JSON,structuredClone,STORAGE_KEY:'test',uid:()=> 'id',cloneState:()=>structuredClone(state),restoreState:s=>Object.assign(state,s),confirm:()=>confirmValue,localStorage:{setItem:(k,v)=>{if(failure==='backup')throw Error('full');records.set(k,v);},getItem:k=>failure==='backup-read'?'bad':records.get(k)},save:()=>{if(failure==='save')return false;records.set('test',JSON.stringify(state));notified++;return true;},persistIndexedSnapshot:async()=>{},expenseTrashPositions:(all,items)=>items.map(e=>({id:e.id,index:all.indexOf(e)})),settingsSnapshot:null,mirrorResetIntoSnapshot(){},render(){rendered++;},refreshExpenseDetailViews(){},showToast(){}});
 for(const name of ['fixedExpensePayments','cancelFixedExpensePayment']){const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+1);vm.runInContext(source.slice(a,b),ctx);}
 ctx.isFixedExpenseMasterCategory=()=>false;
 return {state,item,ctx,records,notified:()=>notified,rendered:()=>rendered};
}
test('cancel removes linked installments together, keeps other months and business, backs up and notifies once',()=>{
 const s=setup(),before=JSON.stringify(s.state);s.ctx.cancelFixedExpensePayment(s.item,'2026-10');
 assert.deepEqual(s.state.expenses.map(e=>e.id),['past','other']);assert.equal(s.ctx.fixedExpensePayments(s.item,'2026-10').length,0);
 assert.equal(s.state.trash[0].items.length,2);assert.equal(s.state.trash[0].items[0].extra,'keep');assert.equal(s.state.resale.keep,true);
 assert.equal(s.records.get('test-before-cancel-payment-id'),before);assert.equal(s.notified(),1);assert.equal(s.rendered(),1);
 s.ctx.cancelFixedExpensePayment(s.item,'2026-10');assert.equal(s.state.trash.length,1);assert.equal(s.notified(),1);
 s.state.expenses.push(...s.state.trash[0].items);assert.equal(s.ctx.fixedExpensePayments(s.item,'2026-10').length,2);
});
for(const failure of ['backup','backup-read','save'])test('failed '+failure+' preserves entire original state',()=>{const s=setup(failure),before=JSON.stringify(s.state);s.ctx.cancelFixedExpensePayment(s.item,'2026-10');assert.equal(JSON.stringify(s.state),before);assert.equal(s.notified(),0);});
test('declining confirmation leaves everything untouched',()=>{const s=setup(null,false),before=JSON.stringify(s.state);s.ctx.cancelFixedExpensePayment(s.item,'2026-10');assert.equal(JSON.stringify(s.state),before);assert.equal(s.records.size,0);});
