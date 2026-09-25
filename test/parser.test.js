import test from 'node:test'; import assert from 'node:assert/strict'; import { parseAmount, parseExpense, parseExpenses } from '../parser.js';
if (!globalThis.crypto) globalThis.crypto = { randomUUID: () => String(Math.random()) };
test('interpreta moneda, medio, tarjeta y cuotas sin inventar bancos', () => { const e = parseExpense('pagué 120 dólares con crédito Mi Visa en 12 cuotas', [{ name: 'Mi Visa' }]); assert.equal(e.amount, 120); assert.equal(e.currency, 'USD'); assert.equal(e.method, 'Crédito'); assert.equal(e.card, 'Mi Visa'); assert.equal(e.installments, 12); });
test('separa gastos aun cuando el segundo no repite el verbo', () => { const items = parseExpenses('Gasté 10 mil en kiosco y 20 mil en supermercado'); assert.equal(items.length, 2); assert.deepEqual(items.map((x) => x.amount), [10000, 20000]); });
test('entiende millones y categorías configuradas', () => { assert.equal(parseAmount('un millón de pesos'), 1000000); const e = parseExpense('gasté 50 dólares en comida', [], ['Comida']); assert.equal(e.category, 'Comida'); assert.equal(e.currency, 'USD'); });
test('no asigna una tarjeta desconocida', () => assert.equal(parseExpense('pagué 200 con débito del Francés', []).card, ''));

test('entiende cuotas dichas con palabras', () => { const e = parseExpense('gasté un millón en una heladera con crédito Mi Visa en doce cuotas', [{ name: 'Mi Visa', type: 'Crédito' }]); assert.equal(e.amount, 1000000); assert.equal(e.installments, 12); assert.equal(e.card, 'Mi Visa'); });
test('no mezcla una tarjeta de débito con un gasto de crédito', () => { const e = parseExpense('gasté 50 mil con crédito Mi Tarjeta', [{ name: 'Mi Tarjeta', type: 'Débito' }]); assert.equal(e.card, ''); });
