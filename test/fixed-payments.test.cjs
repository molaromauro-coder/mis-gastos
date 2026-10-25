const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function setup(){
 const item={id:'fixed',category:'GASTOS FIJOS',subcategory:'Cable e internet',currency:'ARS'};
 const expense={id:'manual',category:'GASTOS FIJOS',subcategory:'Cable e internet',amount:87603,currency:'ARS',date:'2026-10-19T12:00:00'};
 const state={fixedExpenses:[item],expenses:[expense]};
 const ctx=vm.createContext({state,uid:()=> 'new-fixed'});
 const display=fs.readFileSync(__dirname+'/../category-display.js','utf8');
 vm.runInContext(display.slice(display.indexOf('export function categoryBaseName'),display.indexOf('const emojis')).replace('export ',''),ctx);
 for(const name of ['normalizedCategoryName','isFixedExpenseMasterCategory','purchaseAmount','fixedExpensePayments','fixedExpenseAmountForMonth','fixedExpenseIsPaid','ensureFixedExpenseForSubcategory','syncFixedExpenseDefinitionsFromCategories']){
 const start=source.indexOf('function '+name+'('); const next=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,next),ctx);
 }
 return {ctx,state,item,expense};
}
test('manual payment shown once, repeated reads preserve complete state',()=>{
 const {ctx,state,item}=setup();const before=JSON.stringify(state);
 for(let i=0;i<3;i++){assert.equal(ctx.fixedExpensePayments(item,'2026-10').length,1);assert.equal(ctx.fixedExpenseAmountForMonth(item,'2026-10'),87603);assert.equal(ctx.fixedExpenseIsPaid(item,'2026-10'),true);}
 assert.equal(JSON.stringify(state),before);
});
test('editing, trash and restoration reflect the original record',()=>{
 const {ctx,state,item,expense}=setup();expense.amount=90000;assert.equal(ctx.fixedExpenseAmountForMonth(item,'2026-10'),90000);
 state.expenses=[];assert.equal(ctx.fixedExpenseIsPaid(item,'2026-10'),false);state.expenses=[expense];assert.equal(ctx.fixedExpenseAmountForMonth(item,'2026-10'),90000);
 expense.subcategory='Otro';assert.equal(ctx.fixedExpenseIsPaid(item,'2026-10'),false);
});
test('month, currency, category and ambiguous definitions do not cross-match',()=>{
 const {ctx,state,item,expense}=setup();assert.equal(ctx.fixedExpenseIsPaid(item,'2026-09'),false);
 expense.currency='USD';assert.equal(ctx.fixedExpenseIsPaid(item,'2026-10'),false);expense.currency='ARS';
 expense.category='OTROS';assert.equal(ctx.fixedExpenseIsPaid(item,'2026-10'),false);expense.category=item.category;
 state.fixedExpenses.push({...item,id:'duplicate'});assert.equal(ctx.fixedExpenseIsPaid(item,'2026-10'),false);
});
test('explicit link preserves assigned month and does not match another item',()=>{
 const {ctx,item,expense}=setup();expense.fixedExpenseId=item.id;expense.fixedExpenseMonth='2026-09';
 assert.equal(ctx.fixedExpenseIsPaid(item,'2026-09'),true);assert.equal(ctx.fixedExpenseIsPaid(item,'2026-10'),false);
 expense.fixedExpenseId='other';assert.equal(ctx.fixedExpenseIsPaid(item,'2026-09'),false);
});
test('installments count the original purchase only once',()=>{
 const {ctx,state,item,expense}=setup();state.expenses=[1,2,3].map(i=>({...expense,id:String(i),parentId:'purchase',amount:29201,installments:3,installment:i}));
 assert.equal(ctx.fixedExpensePayments(item,'2026-10').length,1);assert.equal(ctx.fixedExpenseAmountForMonth(item,'2026-10'),87603);
});

test('emoji category and subcategory match without a second expense',()=>{
 const {ctx,state,item,expense}=setup();
 item.category='GASTOS FIJOS 😩';item.subcategory='CABLE e INTERNET 📶';
 expense.category='GASTOS FIJOS';expense.subcategory='Cable e internet';
 assert.equal(ctx.fixedExpenseAmountForMonth(item,'2026-10'),87603);assert.equal(state.expenses.length,1);
});
test('missing card repaired from stored subcategories, repeated sync preserves all other data',()=>{
 const {ctx,state}=setup();state.fixedExpenses=[];state.subcategories={'GASTOS FIJOS 😩':['CABLE e INTERNET 📶']};state.resale={parties:[{id:'unchanged'}]};
 const before=JSON.stringify({expenses:state.expenses,resale:state.resale});
 assert.equal(ctx.syncFixedExpenseDefinitionsFromCategories(),true);
 assert.equal(state.fixedExpenses.length,1);assert.equal(ctx.fixedExpenseAmountForMonth(state.fixedExpenses[0],'2026-10'),87603);
 assert.equal(ctx.syncFixedExpenseDefinitionsFromCategories(),false);
 assert.equal(JSON.stringify({expenses:state.expenses,resale:state.resale}),before);
});
test('existing decorated or inactive card is preserved instead of duplicated',()=>{
 const {ctx,state,item}=setup();item.active=false;item.extra='preserved';state.subcategories={'GASTOS FIJOS 😩':['CABLE e INTERNET 📶']};
 assert.equal(ctx.syncFixedExpenseDefinitionsFromCategories(),false);assert.equal(state.fixedExpenses.length,1);assert.equal(item.extra,'preserved');assert.equal(item.active,false);
});
function repairSetup(failure){
 const s=setup(),{ctx,state}=s;state.fixedExpenses=[];state.subcategories={'GASTOS FIJOS 😩':['Cable e internet']};
 vm.runInContext(fs.readFileSync(__dirname+'/../fixed-dedup.js','utf8').replace(/^import .*;$/m,'').replace('export function','function'),ctx);ctx.structuredClone=structuredClone;ctx.restoreState=previous=>{Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,previous);};
 const records=new Map();ctx.sharedMode=false;ctx.STORAGE_KEY='test';ctx.cloneState=()=>JSON.parse(JSON.stringify(state));ctx.showToast=()=>{};
 ctx.localStorage={setItem:(k,v)=>{if(failure==='backup-write')throw Error('full');records.set(k,v);},getItem:k=>failure==='backup-read'?'bad':records.get(k)};
 ctx.save=()=>{if(failure==='save')return false;records.set('test',JSON.stringify(state));return true;};
 const start=source.indexOf('function repairMissingFixedExpenseDefinitions('),end=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,end),ctx);
 return {...s,records};
}
test('repair preserves a full recoverable backup and is idempotent',()=>{
 const {ctx,state,records}=repairSetup();const before=JSON.stringify(state);ctx.repairMissingFixedExpenseDefinitions();
 const backup=records.get('test-before-fixed-definitions-new-fixed');assert.equal(backup,before);
 assert.equal(JSON.stringify(JSON.parse(backup)),before);assert.equal(state.fixedExpenses.length,1);
 const count=records.size;ctx.repairMissingFixedExpenseDefinitions();assert.equal(records.size,count);assert.equal(state.expenses.length,1);
});
for(const failure of ['backup-write','backup-read','save'])test('repair preserves original state when '+failure+' fails',()=>{
 const {ctx,state}=repairSetup(failure);const before=JSON.stringify(state);ctx.repairMissingFixedExpenseDefinitions();assert.equal(JSON.stringify(state),before);
});
