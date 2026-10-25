import {test} from 'node:test';import assert from 'node:assert/strict';import {deduplicateFixedExpenses} from '../fixed-dedup.js';
test('repeated list becomes unique, preserves original definitions, payments and other data',()=>{
 const s={fixedExpenses:[{id:'a',concept:'LUZ',category:'GASTOS FIJOS',plannedAmounts:{'2026-10':100}},{id:'b',concept:'GAS',category:'GASTOS FIJOS'},{id:'c',concept:'Luz 💡',category:'Gastos fijos 😩',unknown:123,plannedAmounts:{'2026-09':200}}],expenses:[{id:'p',fixedExpenseId:'c',amount:300}],trash:[],resale:{unchanged:true}};
 assert.equal(deduplicateFixedExpenses(s),true);assert.equal(s.fixedExpenses.length,2);assert.equal(s.expenses[0].fixedExpenseId,'a');assert.equal(s.expenses[0].amount,300);assert.equal(s.fixedExpenses[0].duplicateDefinitions[0].unknown,123);assert.deepEqual(s.fixedExpenses[0].plannedAmounts,{'2026-09':200,'2026-10':100});assert.equal(s.resale.unchanged,true);
 const once=JSON.stringify(s);assert.equal(deduplicateFixedExpenses(s),false);assert.equal(JSON.stringify(s),once);
});
test('different currencies and concepts remain separate',()=>{const s={fixedExpenses:[{id:'a',concept:'Luz',currency:'ARS'},{id:'b',concept:'Luz',currency:'USD'},{id:'c',concept:'Gas',currency:'ARS'}]};assert.equal(deduplicateFixedExpenses(s),false);assert.equal(s.fixedExpenses.length,3);});
