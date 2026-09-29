import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseArsEquivalent, boundsForRange, previousBounds, groupExpenses, recentPurchases } from '../reporting.js';

test('USD usa la cotización histórica guardada', () => {
  assert.equal(expenseArsEquivalent({currency:'USD',amount:10,fxRate:1500}),15000);
  assert.equal(expenseArsEquivalent({currency:'USD',amount:10}),0);
  assert.equal(expenseArsEquivalent({currency:'ARS',amount:12500}),12500);
});

test('agrupa por categoría y suma equivalentes', () => {
  const rows=groupExpenses([
    {currency:'ARS',amount:1000,category:'Super'},
    {currency:'USD',amount:2,fxRate:1500,category:'Super'},
    {currency:'ARS',amount:500,category:'Nafta'}
  ],e=>e.category);
  assert.equal(rows[0].key,'Super');
  assert.equal(rows[0].arsEquivalent,4000);
  assert.equal(rows[0].usd,2);
});

test('rango semanal empieza lunes y comparación anterior tiene igual duración', () => {
  const [from,to]=boundsForRange('week',new Date('2026-09-26T12:00:00'));
  assert.equal(from.getDay(),1);
  const [pf,pt]=previousBounds(from,to);
  assert.equal(to.getTime()-from.getTime(),pt.getTime()-pf.getTime());
});

test('recentPurchases muestra los movimientos anteriores y unifica cuotas', () => {
  const rows=recentPurchases([
    {id:'cash',amount:5000,date:'2026-09-27T10:00:00',concept:'Kiosco'},
    {id:'debit',amount:10000,purchaseDate:'2026-09-29T02:51:00',concept:'Vianda'},
    {id:'c1',parentId:'credit-parent',installment:'1',amount:1000,purchaseDate:'2026-09-28T12:00:00',dueDate:'2026-10-10T12:00:00'},
    {id:'c2',parentId:'credit-parent',installment:'2',amount:1000,purchaseDate:'2026-09-28T12:00:00',dueDate:'2026-11-10T12:00:00'}
  ]);
  assert.equal(rows.length,3);
  assert.equal(rows[0].id,'debit');
  assert.equal(rows[1].id,'c1');
  assert.equal(rows[2].id,'cash');
});

test('recentPurchases acepta cuotas antiguas con installment numérico o texto', () => {
  const rows=recentPurchases([
    {id:'a1',parentId:'a',installment:1,date:'2026-09-25T10:00:00'},
    {id:'a2',parentId:'a',installment:2,date:'2026-09-25T10:00:00'},
    {id:'b1',parentId:'b',installment:'1',date:'2026-09-26T10:00:00'},
    {id:'b2',parentId:'b',installment:'2',date:'2026-09-26T10:00:00'}
  ]);
  assert.deepEqual(rows.map(x=>x.id),['b1','a1']);
});
