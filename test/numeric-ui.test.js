import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('campos monetarios visibles usan formato argentino editable',()=>{
  for(const id of ['amount','budgetAmount','consultMin','resaleCost','recurringAmount','stockAmount','recoveryAmount']){
    assert.match(html,new RegExp(`id="${id}"[^>]*data-local-number="2"`));
  }
});

test('cantidad manual de stock también usa agrupación de miles',()=>{
  assert.match(html,/id="stockQtyManual"[^>]*data-local-number="0"/);
});

test('la app parsea los campos formateados antes de calcular',()=>{
  for(const id of ['amount','budgetAmount','consultMin','recurringAmount','stockAmount','recoveryAmount','resaleCost']){
    assert.ok(app.includes(`localizedInputNumber('#${id}')`),`falta parser localizado en ${id}`);
  }
});

test('las cantidades visibles importantes usan el formateador global',()=>{
  assert.ok(app.includes('integerText(totalRemaining)'));
  assert.ok(app.includes('numberText(m.qty)'));
  assert.ok(app.includes('integerText(items.length)'));
});
