import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseExpense, parseExpenses } from '../parser.js';
if (!globalThis.crypto) globalThis.crypto = { randomUUID: () => String(Math.random()) };

test('interpreta moneda, medio, tarjeta y cuotas numéricas', () => {
  const e = parseExpense('pagué 120 dólares con crédito Mi Visa en 12 cuotas', [{ name: 'Mi Visa' }]);
  assert.equal(e.amount, 120); assert.equal(e.currency, 'USD'); assert.equal(e.method, 'Crédito'); assert.equal(e.card, 'Mi Visa'); assert.equal(e.installments, 12);
});
test('interpreta importes y cuotas escritos con palabras',()=>{
  assert.equal(parseAmount('cincuenta mil pesos'),50000);
  assert.equal(parseAmount('ciento veinte mil pesos'),120000);
  assert.equal(parseAmount('un millón doscientos mil pesos'),1200000);
  assert.equal(parseExpense('gasté un millón en una heladera con crédito Mi Visa en doce cuotas',[{name:'Mi Visa'}]).installments,12);
});
test('separa múltiples gastos aunque el segundo no repita el verbo', () => {
  const items = parseExpenses('Gasté 10 mil en kiosco y 20 mil en supermercado');
  assert.equal(items.length, 2); assert.deepEqual(items.map((x) => x.amount), [10000, 20000]);
});
test('separa múltiples gastos con importes escritos en palabras',()=>{
  const items=parseExpenses('Gasté cincuenta mil en kiosco y treinta mil en supermercado');
  assert.equal(items.length,2); assert.deepEqual(items.map((x)=>x.amount),[50000,30000]);
});
test('entiende millones y categorías configuradas', () => {
  assert.equal(parseAmount('un millón de pesos'), 1000000);
  const e = parseExpense('gasté 50 dólares en comida', [], ['Comida']);
  assert.equal(e.category, 'Comida'); assert.equal(e.currency, 'USD');
});
test('no asigna una tarjeta desconocida', () => assert.equal(parseExpense('pagué 200 con débito del Francés', []).card, ''));
