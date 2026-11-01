const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
async function submit(day){
 const fields={'#expenseDate':{value:day},'#method':{value:'Efectivo'},'#expenseCard':{value:''},'#concept':{value:'Fardo'},'#category':{value:'COMPRAS'},'#subcategory':{value:''},'#expenseForm':{},'#expenseDialog':{close(){}}};
 const state={expenses:[]};let error;
 const ctx=vm.createContext({$:s=>fields[s],Date,Number,crypto:{randomUUID:()=> 'test'},document:{querySelector:()=>({value:'ARS'})},clearExpenseValidation(){},showExpenseValidation:m=>error=m,localizedInputNumber:()=>1000,stampUsdExpense:async e=>e,installmentExpenses:e=>[e],state,save(){},feedback(){},showToast(){},render(){},pending:[]});
 vm.runInContext(source.match(/function dateInputValue\(value\)\{[^\n]+/)[0],ctx);
 vm.runInContext(source.slice(source.indexOf("$('#expenseForm').onsubmit = async"),source.indexOf("$('#addCard').onclick")),ctx);
 await fields['#expenseForm'].onsubmit({preventDefault(){}});
 return {state,error};
}
test('manual past expense stays in October and not November',async()=>{
 const {state}=await submit('2026-10-31');const e=state.expenses[0];
 assert.equal(new Date(e.date).getMonth(),9);assert.equal(new Date(e.date).getDate(),31);assert.equal(e.purchaseDate,e.date);assert.equal(e.amount,1000);
});
test('invalid or missing manual date does not save',async()=>{
 for(const day of ['', '2026-02-30']){const {state,error}=await submit(day);assert.equal(state.expenses.length,0);assert.ok(error);}
});
test('opening manual form defaults to local today each time',()=>{
 assert.match(source,/expenseForm'\)\.reset\(\);\s*\$\('#expenseDate'\)\.value = dateInputValue\(data.purchaseDate \|\| data.date \|\| new Date\(\)\)/);
});
