import test from 'node:test';
import assert from 'node:assert/strict';
import {monthExpenseBreakdown,monthExpenseTotal} from '../finance.js';
test('monthly split preserves totals, excludes future dues and separates old card purchases',()=>{
 const rows=[
 {amount:100,currency:'ARS',date:'2026-11-09T12:00:00',method:'Efectivo'},
 {amount:50,currency:'ARS',purchaseDate:'2026-11-01T12:00:00',dueDate:'2026-11-20T12:00:00',method:'Crédito'},
 {amount:200,currency:'ARS',purchaseDate:'2026-10-01T12:00:00',dueDate:'2026-11-20T12:00:00',method:'Crédito'},
 {amount:300,currency:'ARS',carryover:true,dueDate:'2026-11-20T12:00:00',method:'Crédito'},
 {amount:900,currency:'ARS',carryover:true,dueDate:'2026-12-20T12:00:00',method:'Crédito'},
 {amount:2,currency:'USD',fxRate:1000,purchaseDate:'2026-09-01T12:00:00',dueDate:'2026-11-20T12:00:00',method:'Crédito'}];
 const before=JSON.stringify(rows),result=monthExpenseBreakdown(rows,'2026-11');
 assert.deepEqual(result,{current:150,previousCards:2500,gross:2650});
 assert.equal(result.gross,monthExpenseTotal(rows,'2026-11'));
 assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(monthExpenseBreakdown([],'2026-11'),{current:0,previousCards:0,gross:0});
});
