const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function setup(){
 const item={id:'fixed',category:'GASTOS FIJOS',subcategory:'Cable e internet',currency:'ARS'};
 const expense={id:'manual',category:'GASTOS FIJOS',subcategory:'Cable e internet',amount:87603,currency:'ARS',date:'2026-10-19T12:00:00'};
 const state={fixedExpenses:[item],expenses:[expense]};
 const ctx=vm.createContext({state});
 for(const name of ['normalizedCategoryName','isFixedExpenseMasterCategory','purchaseAmount','fixedExpensePayments','fixedExpenseAmountForMonth','fixedExpenseIsPaid']){
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
