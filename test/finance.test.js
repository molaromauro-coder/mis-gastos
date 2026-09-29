import test from 'node:test';
import assert from 'node:assert/strict';
import { monthKey, budgetOutcome, stockMetrics, recoveryMonthMetrics, firstDueDateForCard } from '../finance.js';

test('presupuesto mensual usa cuotas por vencimiento',()=>{
  const expenses=[{currency:'ARS',amount:100,dueDate:'2026-10-10T12:00:00'}];
  assert.equal(budgetOutcome(1000,expenses,[],'2026-10').spent,100);
  assert.equal(budgetOutcome(1000,expenses,[],'2026-09').spent,0);
});
test('stock pagado impacta presupuesto del mes de pago',()=>{
  const stock=[{currency:'ARS',totalAmount:500,paidDate:'2026-09-20T12:00:00'}];
  const r=budgetOutcome(1000,[],stock,'2026-09');
  assert.equal(r.spent,500); assert.equal(r.saving,500); assert.equal(r.excess,0);
});
test('stock sigue consumo real',()=>{
  const m=stockMetrics({quantity:10,totalAmount:1000,consumptions:[{quantity:2},{quantity:3}]});
  assert.equal(m.consumed,5); assert.equal(m.remaining,5); assert.equal(m.consumedValue,500);
});
test('recupero queda en el mes cobrado y no borra gasto',()=>{
  const expenses=[{currency:'ARS',amount:1000,date:'2026-08-01T12:00:00'},{currency:'ARS',amount:500,date:'2026-09-01T12:00:00'}];
  const rec=[{currency:'ARS',amount:300,date:'2026-09-15T12:00:00'}];
  const r=recoveryMonthMetrics(rec,expenses,'2026-09');
  assert.equal(r.gross,500); assert.equal(r.recovered,300); assert.equal(r.net,200);
});

test('vencimiento se calcula desde el cierre del resumen',()=>{
  const card={closingDay:25,dueDay:10};
  assert.equal(firstDueDateForCard(card,new Date('2026-09-05T12:00:00')).toISOString().slice(0,10),'2026-10-10');
  assert.equal(firstDueDateForCard(card,new Date('2026-09-25T12:00:00')).toISOString().slice(0,10),'2026-10-10');
  assert.equal(firstDueDateForCard(card,new Date('2026-09-26T12:00:00')).toISOString().slice(0,10),'2026-11-10');
});
test('vencimiento soporta tarjetas cuyo vencimiento cae después del cierre en el mismo mes',()=>{
  const card={closingDay:5,dueDay:20};
  assert.equal(firstDueDateForCard(card,new Date('2026-09-01T12:00:00')).toISOString().slice(0,10),'2026-09-20');
  assert.equal(firstDueDateForCard(card,new Date('2026-09-06T12:00:00')).toISOString().slice(0,10),'2026-10-20');
});
