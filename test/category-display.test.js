import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import { categoryDisplayLabel, categoryBaseName } from '../category-display.js';
test('user emoji labels are preserved exactly including skin tone and distinct insurance types',()=>{
 for(const label of ['GASTOS FIJOS😩','VIANDAS🧆','JUNTADAS🙌🏽','SEGURO 🚙','SEGURO 🏠','COMIDA FRODO 🐶']) assert.equal(categoryDisplayLabel(label),label);
});
test('plain labels reuse a unique user preference rather than another default emoji',()=>{
 assert.equal(categoryDisplayLabel('EXPENSAS',['EXPENSAS 🏠']),'EXPENSAS 🏠');
 assert.equal(categoryDisplayLabel('luz',['LUZ💡']),'LUZ💡');
 assert.equal(categoryDisplayLabel('SEGURO',['SEGURO 🚙','SEGURO 🏠']),'SEGURO');
});
test('new recognized categories and subcategories gain suitable emoji without duplicates',()=>{
 for(const label of ['SUPERMERCADO','GAS','SEGURO MOTO','SALUD','FARMACIA','IMPUESTOS VARIOS']) {
  const decorated=categoryDisplayLabel(label);assert.notEqual(decorated,label);assert.equal(categoryDisplayLabel(decorated),decorated);
 }
 assert.equal(categoryDisplayLabel('Mi categoría personalizada'),'Mi categoría personalizada');
 assert.equal(categoryBaseName(' GASTOS FIJOS😩 '),'GASTOS FIJOS');
});
test('labels and configured records remain untouched in storage',()=>{
 const configured=['LUZ 💡','SEGURO 🚙','SEGURO 🏠'];const before=structuredClone(configured);
 categoryDisplayLabel('LUZ',configured);assert.deepEqual(configured,before);
});
test('report labels decorate visible categories while preserving the raw drilldown key',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=source.indexOf('function renderReportRows('),end=source.indexOf('function renderReportChart',start);
 const context={displayCategory:categoryDisplayLabel,escape:(s)=>s,integerText:String,money:String};vm.createContext(context);
 vm.runInContext(source.slice(start,end),context);
 const target={};context.renderReportRows(target,[{key:'SUPERMERCADO',count:1,arsEquivalent:100}],'category');
 assert.match(target.innerHTML,/data-report-key="SUPERMERCADO"/);assert.match(target.innerHTML,/<strong>SUPERMERCADO 🛒<\/strong>/);
 context.renderReportRows(target,[{key:'Banco',count:1,arsEquivalent:100}],'method');assert.match(target.innerHTML,/<strong>Banco<\/strong>/);
});
