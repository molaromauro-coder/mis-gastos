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
  assert.ok(app.includes('\\d{6}'));
  assert.ok(app.includes('\\d{4}'));
});

test('v69 mantiene Menú principal completamente visible en iPhone',()=>{
  assert.match(html,/id="homeMenuBtn"[^>]*>[\s\S]*Menú principal/);
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/\.home-menu-btn\{[\s\S]*position:fixed[\s\S]*bottom:calc\(12px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/width:min\(calc\(100% - 40px\),390px\)/);
  assert.match(css,/height:58px/);
});

test('Últimos movimientos es un botón navegable a Historial',()=>{
  assert.match(html,/id="recentOpenHistory"/);
  assert.match(app,/\$\('#recentOpenHistory'\)\.onclick=\(\)=>goView\('history'\)/);
});

test('Papelera ofrece selección múltiple y eliminar todos',()=>{
  for(const id of ['trashBulkActions','trashSelectAll','deleteSelectedTrash','deleteAllTrash']) assert.ok(html.includes(`id="${id}"`),`falta ${id}`);
  assert.match(app,/permanentlyDeleteTrashRecords/);
});

test('Papelera está en Menú principal como anteúltima opción y no dentro de Configuración',()=>{
  const menu=html.match(/<dialog id="menuDialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  const buttons=[...menu.matchAll(/data-menu-view="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(buttons.at(-2),'trash');
  assert.equal(buttons.at(-1),'consultations');
  assert.ok(html.includes('<section id="trash" class="view">'));
  const settings=html.match(/<dialog id="settingsDialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  assert.equal(settings.includes('<h3>Papelera</h3>'),false);
});

test('en escritorio la app conserva ancho móvil centrado',()=>{
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/@media\(min-width:700px\)[\s\S]*?\.app\{[\s\S]*?max-width:430px!important/);
  assert.match(css,/width:min\(430px,calc\(100vw - 40px\)\)!important/);
});

test('Gastos fijos se cargan desde las subcategorías de GASTOS FIJOS una sola vez',()=>{
  assert.match(app,/USER_FIXED_EXPENSES_BASE_VERSION=1/);
  assert.match(app,/seedUserFixedExpensesOnce\(\)/);
  for(const fixed of ['LUZ','GAS','EXPENSAS','SEGURO AUTO','SEGURO MOTO','SEGURO BICI','SEGURO HOGAR','IMPUESTOS VARIOS','COMIDA FRODO']){
    assert.ok(app.includes(`'${fixed}'`) || app.includes('subcategories.forEach'),fixed);
  }
});

test('Gastos fijos permiten seleccionar un elemento y moverlo arriba o abajo',()=>{
  assert.ok(html.includes('id="fixedExpenseOrderTools"'));
  assert.ok(html.includes('id="fixedMoveUp"'));
  assert.ok(html.includes('id="fixedMoveDown"'));
  assert.match(app,/moveFixedExpenseInList/);
  assert.match(app,/fixed-order-picker/);
});

test('el primer acceso del menú principal se llama Gastos fijos',()=>{
  const menu=html.match(/<dialog id="menuDialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  assert.match(menu,/id="functionsMenuBtn"[\s\S]*?<strong>Gastos fijos<\/strong>/);
  assert.equal(menu.includes('<strong>Funciones</strong>'),false);
});

test('confirmar gasto por voz conserva una subcategoría recién elegida y el gesto de descarte no interfiere',()=>{
  assert.match(app,/visibleSubcategory=card\?\.querySelector\('\.pending-subcategory-select'\)/);
  assert.match(app,/item\.learnCategory=!!item\.category/);
  assert.match(app,/ignoreSwipe=!!ev\.target\.closest\?\.\('button,select,input,label'\)/);
});
