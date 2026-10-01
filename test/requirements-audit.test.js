import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const parser=readFileSync(new URL('../parser.js',import.meta.url),'utf8');
const finance=readFileSync(new URL('../finance.js',import.meta.url),'utf8');
const resaleImport=readFileSync(new URL('../resale-import.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('auditoría funcional: carga manual completa',()=>{
  for(const id of ['amount','concept','category','subcategory','method','expenseCard','installments','saveExpense','currencyArs','currencyUsd']){
    assert.ok(html.includes(`id="${id}"`),`falta ${id}`);
  }
  for(const method of ['Efectivo','Débito','Crédito']) assert.ok(html.includes(`<option>${method}</option>`));
});

test('auditoría funcional: voz argentina, múltiples gastos y anulación arrastrando al tacho',()=>{
  assert.match(app,/recognition\.lang='es-AR'/);
  assert.match(app,/voiceTrash/);
  assert.match(app,/updateVoiceCancelGesture/);
  assert.match(app,/touchmove/);
  assert.match(app,/cancelExpenseVoice/);
  assert.match(parser,/parseExpenses/);
});

test('auditoría funcional: categorías exactas aportadas por Mauro',()=>{
  for(const category of ['GASTOS FIJOS','VIANDAS','SUPERMERCADO','KIOSCO','CARAMELOS / CHOCOLATES','VINOS','HOGAR','FARMACIA','SALUD','ENTRADAS PERSONALES']){
    assert.ok(app.includes(`'${category}'`),`falta categoría ${category}`);
  }
  for(const sub of ['LUZ','GAS','EXPENSAS','SEGURO AUTO','SEGURO MOTO','SEGURO BICI','SEGURO HOGAR','IMPUESTOS VARIOS','COMIDA FRODO','LIMPIEZA','COMIDA','GASEOSAS','ELECTRODOMESTICOS','MUEBLES','REPARACIONES','ADORNOS','MEDICAMENTOS','PERFUMES','CREMAS','PSICOLOGO','PSIQUIATRA','OBRA SOCIAL','TRATAMIENTO PELO']){
    assert.ok(app.includes(`'${sub}'`),`falta subcategoría ${sub}`);
  }
});

test('auditoría funcional: lista maestra de categorías se propaga y Vinos es acumulador transversal',()=>{
  for(const marker of ['syncCategoryConsumers','renameCategoryEverywhere','renameSubcategoryEverywhere','state.fixedExpenses','state.stock','state.recurring','state.categoryRules','state.trash']){
    assert.ok(app.includes(marker),`falta sincronización ${marker}`);
  }
  assert.match(app,/categoryHasCrossSubcategories/);
  assert.match(app,/categoryRollupItems/);
});

test('auditoría funcional: lupa, consultas globales y búsquedas por movimiento',()=>{
  assert.ok(html.includes('id="globalSearchBtn"'));
  for(const marker of ['globalSearchRows','consultationRows','Gasto / pago','Compra','Recupero de gasto']){
    assert.ok(app.includes(marker),`falta ${marker}`);
  }
});

test('auditoría funcional: gastos fijos variables y consulta de pendientes',()=>{
  assert.ok(html.includes('id="fixedExpenses"'));
  assert.ok(html.includes('id="fixedExpensePaymentAmount"'));
  assert.match(app,/fixedExpensePreviousAmount/);
  assert.match(app,/renderFixedPendingConsultation/);
  assert.match(app,/source:'fixed'/);
});

test('auditoría funcional: informes con barras y torta',()=>{
  assert.ok(html.includes('id="reportChart"'));
  assert.ok(html.includes('id="reportPie"'));
  assert.match(app,/renderReportChart/);
  assert.match(app,/renderReportPie/);
});

test('auditoría funcional: dólares conservan cotización histórica y fuente',()=>{
  for(const marker of ['fxRate','fxRateName','fxRateSource','fxRateUpdatedAt','DolarApi']){
    assert.ok(app.includes(marker),`falta ${marker}`);
  }
  assert.ok(html.includes('id="usdRateType"'));
});

test('auditoría funcional: recuperos, presupuesto, ahorro, stock, papelera y exportación',()=>{
  assert.match(finance,/recoveryAppliedMonthTotal/);
  for(const id of ['recoveries','budget','savings','stock']) assert.ok(html.includes(`id="${id}"`));
  assert.match(app,/renderTrash/);
  assert.match(app,/exportConsultExcel/);
  assert.match(app,/function exportConsultPdf/);
  assert.match(app,/window\.print/);
});

test('auditoría funcional: Reventa es independiente e importa Excel con revisión manual',()=>{
  assert.ok(html.includes('id="resale"'));
  assert.ok(html.includes('id="importResaleExcel"'));
  for(const marker of ['parseResaleTable','compareResaleImport','applyResaleImport']) assert.ok(resaleImport.includes(marker));
  assert.match(app,/resale-import-decision/);
  assert.match(app,/value="manual"/);
  assert.match(app,/const resaleApi = sharedMode \? null : await import/);
  assert.match(app,/document\.querySelectorAll\('\.owner-only'\)\.forEach/);
});

test('auditoría funcional: seguridad opcional Face ID + PIN de 6 dígitos',()=>{
  assert.match(app,/biometricAvailable/);
  assert.match(app,/registerBiometric/);
  assert.match(app,/authenticateBiometric/);
  assert.match(html,/PIN de 6 dígitos/);
  assert.match(app,/enabled: false/);
});

test('auditoría funcional: versión PWA coherente y cacheada',()=>{
  const jsV=html.match(/app\.js\?v=(\d+)/)?.[1];
  const cssV=html.match(/styles\.css\?v=(\d+)/)?.[1];
  const swV=sw.match(/mis-gastos-v(\d+)/)?.[1];
  assert.equal(jsV,'81');
  assert.equal(cssV,'81');
  assert.equal(swV,'81');
  assert.match(sw,/resale-import\.js/);
});
