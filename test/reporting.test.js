import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseArsEquivalent, boundsForRange, previousBounds, groupExpenses } from '../reporting.js';

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
