import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('ningún elemento HTML tiene ID duplicado (incluida la moneda USD)',()=>{
  const all=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(all.filter((id,index)=>all.indexOf(id)!==index),[]);
});

test('carga manual muestra todos los campos sin asistente oculto de tres pasos',()=>{
  const form=html.match(/<dialog id="expenseDialog">([\s\S]*?)<\/dialog>/)?.[1];
  assert.ok(form,'Debe existir el formulario de carga manual');
  for(const field of ['amount','concept','category','subcategory','method','expenseCard','installments','saveExpense','currencyArs','currencyUsd']){
    assert.ok(form.includes(`id="${field}"`),`Falta ${field}`);
  }
  assert.equal(form.includes('data-step='),false);
  assert.match(form,/<select id="method">/);
  assert.match(form,/<select id="category">/);
});

test('las categorías propias se inicializan una sola vez sin volver a agregar categorías de ejemplo',()=>{
  assert.match(app,/USER_CATEGORY_BASE_VERSION\s*=\s*1/);
  assert.match(app,/seedUserCategoryBaseOnce\(\)/);
  assert.doesNotMatch(app,/seedDemoCategoriesOnce\(\)/);
});

test('los recursos de la página coinciden con la versión del caché PWA',()=>{
  const page=html.match(/app\.js\?v=(\d+)/)?.[1];
  const css=html.match(/styles\.css\?v=(\d+)/)?.[1];
  const cache=sw.match(/mis-gastos-v(\d+)/)?.[1];
  assert.ok(page && css && cache);
  assert.equal(page,cache);
  assert.equal(css,cache);
});

test('Inicio tiene acceso directo a Categorías además de Carga manual y lupa',()=>{
  assert.match(html,/id="manualBtn"/);
  assert.match(html,/id="homeCategoriesBtn"/);
  assert.match(html,/id="globalSearchBtn"/);
  assert.match(app,/\$\('#homeCategoriesBtn'\)\.onclick=\(\)=>openCategoryManager\(\)/);
});

test('el respaldo de seguridad usa PIN de 6 dígitos y permanece opcional',()=>{
  assert.match(html,/PIN de 6 dígitos/);
  assert.match(html,/id="securityPin"[^>]*pattern="\[0-9\]\{6\}"[^>]*maxlength="6"/);
  assert.match(html,/id="unlockPin"[^>]*maxlength="6"/);
  assert.match(app,/\^\\d\{6\}\$/);
});
