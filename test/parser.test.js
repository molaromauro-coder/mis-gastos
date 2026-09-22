import test from 'node:test';import assert from 'node:assert/strict';import {parseExpense,parseExpenses} from '../parser.js';
if(!globalThis.crypto)globalThis.crypto={randomUUID:()=>String(Math.random())};
test('interpreta moneda, medio, tarjeta y cuotas sin inventar bancos',()=>{const e=parseExpense('pagué 120 dólares con crédito Mi Visa en 12 cuotas',[{name:'Mi Visa'}]);assert.equal(e.amount,120);assert.equal(e.currency,'USD');assert.equal(e.method,'Crédito');assert.equal(e.card,'Mi Visa');assert.equal(e.installments,12)});
test('separa varios gastos',()=>{const items=parseExpenses('pagué 2500 en efectivo supermercado y compré 10 dólares con débito');assert.equal(items.length,2);assert.deepEqual(items.map(x=>x.currency),['ARS','USD'])});
test('no asigna una tarjeta desconocida',()=>{assert.equal(parseExpense('pagué 200 con débito del Francés',[]).card,'')});
