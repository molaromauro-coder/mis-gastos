const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('cancel delete asks with name and never reads or changes state',()=>{
 const source=fs.readFileSync(__dirname+'/../app.js','utf8');let question='';const ctx=vm.createContext({confirm:text=>{question=text;return false;},cloneState:()=>{throw Error('Must not modify state');}});vm.runInContext(source.slice(source.indexOf('function deleteFixedExpenseCards('),source.indexOf('function renderFixedExpenses(')),ctx);ctx.deleteFixedExpenseCards(['a'],'LUZ');assert.match(question,/LUZ/);assert.match(question,/Movimientos se conservan/);
});
